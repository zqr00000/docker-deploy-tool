/**
 * AI 运维终端 - 主页面（优化版）
 * 参考 AionUi、OpenDev、Warp 等开源项目的UI设计
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  Select,
  Button,
  Space,
  Typography,
  message,
  Tag,
  Badge,
  Input,
  Modal,
  Empty,
  Tooltip,
  Divider,
  List,
  Card,
  ConfigProvider,
  theme,
  App,
  Alert,
  Spin,
  Progress,
  Collapse
} from 'antd'
import {
  RobotOutlined,
  PlayCircleOutlined,
  ClearOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
  PlusOutlined,
  CloseOutlined,
  SendOutlined,
  ReloadOutlined,
  ApiOutlined,
  MessageOutlined,
  DeleteOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  LaptopOutlined,
  CloudOutlined,
  LinkOutlined,
  HistoryOutlined,
  ScanOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SafetyOutlined,
  CodeOutlined,
  FileTextOutlined,
  ThunderboltFilled,
  ClockCircleOutlined,
  DashboardOutlined,
  FilterOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  StarOutlined,
  SearchOutlined
} from '@ant-design/icons'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

// 导入会话持久化与类型（会话存储为纯前端 localStorage，非 agent 逻辑）
import { persistenceManager } from '../../agent/persistence-manager'
import type {
  ChatMessage,
  ChatSession,
  ModelConfig,
  ProviderProfile,
  MessageSegment,
  ExecutedCommand,
  CommandHistoryItem,
  DiagnosticResult,
  ContainerOption,
  TerminalTab,
  ToolCallRecord,
  RiskLevel
} from '../../agent/types'
import { DEFAULT_MODEL_CONFIG } from '../../agent/types'
import type { Server } from '../../types/server'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

const { Text, Title } = Typography
const { TextArea } = Input
const { Panel } = Collapse

// Storage keys
const CONFIG_KEY = 'agentOpsModelConfig'

// ==================== 上下文压缩策略常量 ====================
// 与发送逻辑（doSendMessage）共用同一组策略，保证可视化展示与实际压缩行为一致
const HISTORY_KEEP = 8        // 保留最近 N 条消息完整传递
const SUMMARY_PER_MSG_MAX = 300 // 被压缩的早期消息，单条摘要上限（字符）
const SUMMARY_TOTAL_MAX = 4000  // 摘要总长度上限（字符）
const DEFAULT_CONTEXT_WINDOW = 8192 // 未配置 contextWindow 时的兜底估算窗口（tokens）

// 粗略估算 token 数（中英混合约 2 字符 ≈ 1 token，标注"估算"；参数为字符串或字符数）
const estimateTokens = (chars: string | number): number => {
  const len = typeof chars === 'string' ? chars.length : chars
  if (!len) return 0
  return Math.ceil(len / 2)
}

// token 数值可读化：1K / 1M / 1G（二进制 M = 1024*1024）
const fmtTokens = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)}K`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)}M`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}G`
}

// 计算当前会话的上下文压缩状态（与 doSendMessage 的压缩判定保持一致）
const computeContextState = (msgs: ChatMessage[]) => {
  const total = msgs.length
  const keptFull = Math.min(total, HISTORY_KEEP)                    // 完整传递条数
  const compressedCount = Math.max(0, total - HISTORY_KEEP)         // 被压缩条数
  let summaryChars = 0
  if (compressedCount > 0) {
    for (let i = 0; i < compressedCount; i++) summaryChars += Math.min((msgs[i].content || '').length, SUMMARY_PER_MSG_MAX)
    summaryChars = Math.min(summaryChars, SUMMARY_TOTAL_MAX)
  }
  const fullChars = msgs.slice(-keptFull).reduce((sum, m) => sum + (m.content || '').length, 0)
  return {
    total,
    keptFull,
    compressedCount,
    fullTokens: estimateTokens(fullChars),
    summaryTokens: estimateTokens(summaryChars),
    summaryChars
  }
}

// ==================== 工具函数 ====================

// Markdown简单渲染（优化版）
const renderMarkdown = (content: string): string => {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#000000;padding:12px;border-radius:6px;overflow:auto;border:1px solid #48484a;margin:8px 0;"><code style="color:#f5f5f7;font-family:monospace;font-size:12px;">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:#3a3a3c;padding:2px 6px;border-radius:4px;color:#f5f5f7;font-family:monospace;font-size:12px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff;">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em style="color:#aeaeb2;">$1</em>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#fff;margin:12px 0 6px;font-size:14px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#fff;margin:16px 0 8px;font-size:16px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#fff;margin:20px 0 10px;font-size:18px;">$1</h1>')
    .replace(/^\- (.+)$/gm, '<li style="margin:4px 0 4px 16px;color:#f5f5f7;">$1</li>')
    .replace(/\n/g, '<br/>')
}

// 获取风险等级颜色
const getRiskColor = (level: string) => {
  switch (level) {
    case 'high': return '#FF3B30'
    case 'medium': return '#FF9500'
    default: return '#34C759'
  }
}

// 从 AI 回复中提取可执行/可复制的命令（代码块 + 行首 $ 命令 + 工具调用命令）
const buildCommandList = (
  text: string,
  toolCalls?: Array<{ params?: any }>
): Array<{ command: string; riskLevel: RiskLevel }> => {
  const out: Array<{ command: string; riskLevel: RiskLevel }> = []
  const push = (cmd: string) => {
    const c = cmd.trim()
    if (!c) return
    // 诊断并跳过不完整的 find -exec 片段（AI 容易只抽子命令段丢前缀）
    // 常见情况：truncate -s 0 {} \; （缺失 find 前缀）、exec truncate ... （缺失 find 前缀）、... -exec （缺失子命令）
    const lc = c.toLowerCase()
    if (lc.endsWith('-exec') || lc.endsWith(' exec')) {
      // 不完整：只有 exec 前缀，跳过
      return
    }
    if (lc.startsWith('truncate ') || lc.startsWith('rm ') || lc.startsWith('exec ')) {
      // 如果是 "truncate -s 0 {} ..." 开头，且不含 find/路径，很大概率是 AI 拆分错了的 find -exec 片段
      // 只提取了 exec 参数段，漏掉了前面的 find ...，跳过避免误执行
      if (!lc.includes('find')) {
        return
      }
    }
    if (!out.some(o => o.command === c)) out.push({ command: c, riskLevel: 'low' })
  }
  // bash/sh/shell 代码块整体作为一条命令
  const blockRe = /```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(text)) !== null) {
    const block = m[1].replace(/\n\s*$/, '').trim()
    if (block) push(block)
  }
  // 行首 `$ ` 命令
  const lineRe = /^\s*\$ ([^\n]+)/gm
  while ((m = lineRe.exec(text)) !== null) {
    push(m[1])
  }
  // 工具调用的命令
  for (const tc of toolCalls || []) {
    const c = tc.params?.command
    if (typeof c === 'string' && c.trim()) push(c)
  }
  return out
}
// 正文富文本渲染：识别代码块并内联"复制/执行"按钮（命令在正文对应位置直接操作）
const renderRichSegment = (
  text: string,
  onCopy?: (cmd: string) => void,
  onExecute?: (cmd: string) => void,
  canExecute?: boolean
): React.ReactNode[] => {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    const m = part.match(/^```(?:bash|sh|shell)?\s*\n([\s\S]*?)```$/)
    if (m && m[1].trim()) {
      const cmd = m[1].replace(/\n\s*$/, '').trim()
      return (
        <div key={i} className="inline-cmd" style={{ margin: '6px 0' }}>
          <pre style={{ margin: 0, padding: 10, borderRadius: 6, background: '#000000', border: '1px solid #3a3a3c', fontSize: 12, color: '#30D158', overflow: 'auto', fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap' }}>{cmd}</pre>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => onCopy && onCopy(cmd)} style={{ color: '#aeaeb2' }}>{i18n.t('agent.copy')}</Button>
            {onExecute && (
              <Button size="small" type="text" icon={<PlayCircleOutlined />} disabled={!canExecute} onClick={() => onExecute(cmd)} style={{ color: '#0A84FF' }}>{i18n.t('agent.execInTerminal')}</Button>
            )}
          </div>
        </div>
      )
    }
    if (!part.trim()) return null
    return <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
  })
}

const getDiagnosticColor = (status: string) => {
  switch (status) {
    case 'healthy': return '#34C759'
    case 'warning': return '#FF9500'
    case 'critical': return '#FF3B30'
    default: return '#8e8e93'
  }
}

// 工具调用卡片（分段渲染与历史列表复用）
const ToolCallCard: React.FC<{ tc: ToolCallRecord }> = ({ tc }) => {
  const isRunning = tc.status === 'running'
  const icon = isRunning ? <Spin size="small" /> : tc.status === 'success' ? <CheckCircleOutlined style={{ color: '#30D158' }} /> : <CloseCircleOutlined style={{ color: '#FF453A' }} />
  const tagColor = tc.status === 'success' ? 'green' : tc.status === 'error' ? 'red' : 'blue'
  const tagText = isRunning ? i18n.t('agent.tagRunning') : tc.status === 'success' ? i18n.t('agent.tagSuccess') : i18n.t('agent.tagFail')
  // 可收藏的命令（工具参数中含 command 的命令类工具）
  const favCommand = typeof tc.params?.command === 'string' ? tc.params.command : undefined
  const [favorited, setFavorited] = useState(() => favCommand ? isFavoriteCommand(favCommand) : false)
  return (
    <div className="tool-card" style={{ background: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 10, border: '1px solid #3a3a3c' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <CodeOutlined style={{ color: '#0A84FF' }} />
        <Text style={{ color: '#0A84FF', fontSize: 12, flex: 1, fontFamily: 'SF Mono, Consolas, monospace' }}>{tc.name}</Text>
        {tc.duration !== undefined && !isRunning && <Text type="secondary" style={{ fontSize: 11 }}>{tc.duration}ms</Text>}
        {favCommand && (
          <Tooltip title={favorited ? i18n.t('agent.unfavorite') : i18n.t('agent.favoriteCmd')}>
            <Button size="small" type="text" icon={<StarOutlined style={{ color: favorited ? '#FF9500' : '#636366' }} />}
              style={{ padding: 0, width: 20, height: 20 }}
              onClick={() => { const f = toggleFavoriteCommand(favCommand!, tc.name); setFavorited(f) }} />
          </Tooltip>
        )}
        <Tag color={tagColor} style={{ fontSize: 10, margin: 0, borderRadius: 999 }}>{tagText}</Tag>
      </div>
      {!isRunning && tc.result && typeof tc.result === 'string' && (
        <ResourceBars text={tc.result} />
      )}
      {!isRunning && (
        <pre style={{ margin: '8px 0 0 0', maxHeight: 160, overflow: 'auto', fontSize: 11, color: '#aeaeb2', background: 'rgba(28,28,30,0.5)', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', border: '1px solid #3a3a3c' }}>
          {tc.result}
        </pre>
      )}
    </div>
  )
}

// ==================== 命令收藏（localStorage 持久化） ====================

interface FavoriteCommand {
  command: string
  name: string
  createdAt: string
}

const FAVORITES_KEY = 'agentFavoriteCommands'
const FAVORITES_EVENT = 'agent-favorites-changed'

function getFavoriteCommands(): FavoriteCommand[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function isFavoriteCommand(command: string): boolean {
  return getFavoriteCommands().some(f => f.command === command)
}

function toggleFavoriteCommand(command: string, name: string): boolean {
  const list = getFavoriteCommands()
  const exists = list.findIndex(f => f.command === command)
  let next: FavoriteCommand[]
  if (exists >= 0) {
    next = list.filter(f => f.command !== command)
  } else {
    next = [{ command, name, createdAt: new Date().toISOString() }, ...list]
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(FAVORITES_EVENT))
  return exists < 0
}

// ==================== 结果可视化（资源占用进度条） ====================

// 解析文本中的资源占用指标（如 "CPU: 23.5%" / "内存: 12%"/"Disk: 45%"）
const parseResourceMetrics = (text: string): { label: string; value: number }[] => {
  const metrics: { label: string; value: number }[] = []
  const re = /(CPU|内存|磁盘|MEM|DISK|Memory|Disk)\s*[：:]\s*([\d.]+)\s*%/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1]
    const v = parseFloat(m[2])
    if (isNaN(v) || v < 0 || v > 100) continue
    const label = /^mem|^内存$/i.test(raw) ? i18n.t('agent.metricMem') : /^disk|^磁盘$/i.test(raw) ? i18n.t('agent.metricDisk') : i18n.t('agent.metricCpu')
    if (!metrics.some(r => r.label === label)) metrics.push({ label, value: v })
  }
  return metrics.slice(0, 4)
}

const ResourceBars: React.FC<{ text: string }> = ({ text }) => {
  const metrics = parseResourceMetrics(text)
  if (metrics.length === 0) return null
  return (
    <div style={{ margin: '8px 0 0 0', display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 10px', background: 'rgba(28,28,30,0.5)', borderRadius: 6, border: '1px solid #3a3a3c' }}>
      {metrics.map(m => (
        <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: '#aeaeb2', width: 32, flexShrink: 0 }}>{m.label}</Text>
          <div style={{ flex: 1, height: 6, background: '#3a3a3c', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(m.value, 100)}%`, height: '100%', background: m.value > 90 ? '#FF453A' : m.value > 75 ? '#FF9500' : '#30D158', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <Text style={{ fontSize: 11, color: m.value > 90 ? '#FF453A' : m.value > 75 ? '#FF9500' : '#30D158', width: 42, textAlign: 'right', flexShrink: 0 }}>{m.value.toFixed(1)}%</Text>
        </div>
      ))}
    </div>
  )
}

// 路由档位展示文案与颜色（多模型路由）；labelKey/hintKey 为 i18n 键，渲染时经 i18n.t 解析
const ROUTE_META: Record<string, { labelKey: string; label: string; color: string; hintKey: string }> = {
  thinking: { labelKey: 'agent.route.thinking', label: 'thinking', color: 'purple', hintKey: 'agent.route.thinkingHint' },
  critique: { labelKey: 'agent.route.critique', label: 'critique', color: 'geekblue', hintKey: 'agent.route.critiqueHint' },
  vision: { labelKey: 'agent.route.vision', label: 'vision', color: 'cyan', hintKey: 'agent.route.visionHint' },
  execution: { labelKey: 'agent.route.execution', label: 'execution', color: 'default', hintKey: 'agent.route.executionHint' }
}

// 终端配色主题（参考 Netcatty 主题系统：可切换多套终端配色）
const TERMINAL_THEMES: Record<string, { name: string; theme: any }> = {
  'github-dark': {
    name: 'Apple Dark',
    theme: { background: '#000000', foreground: '#f5f5f7', cursor: '#0A84FF', black: '#000000', red: '#FF453A', green: '#30D158', yellow: '#FF9500', blue: '#0A84FF', magenta: '#BF5AF2', cyan: '#64D2FF', white: '#f5f5f7' }
  },
  dracula: {
    name: 'Dracula',
    theme: { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2' }
  },
  'solarized-dark': {
    name: 'Solarized Dark',
    theme: { background: '#002b36', foreground: '#839496', cursor: '#0A84FF', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5' }
  }
}

// 兼容旧配置：无 providerProfiles 时从扁平字段生成默认档案（参考 Netcatty 多提供商管理）
function ensureProfiles(cfg: ModelConfig): ModelConfig {
  if (cfg.providerProfiles && cfg.providerProfiles.length > 0) return cfg
  const base: ProviderProfile = {
    id: 'profile-default',
    name: cfg.provider === 'openai' ? i18n.t('agent.defaultProfile') : cfg.provider,
    provider: cfg.provider,
    apiKey: cfg.apiKey || '',
    model: cfg.model || '',
    baseUrl: cfg.baseUrl || '',
    azureEndpoint: cfg.azureEndpoint,
    azureDeployment: cfg.azureDeployment
  }
  return { ...cfg, activeProfileId: 'profile-default', providerProfiles: [base] }
}

// ==================== 主组件 ====================

const AgentTerminalPage: React.FC = () => {
  const { modal } = App.useApp()
  
  // Server state
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined)
  const [connected, setConnected] = useState(false)
  const [containers, setContainers] = useState<ContainerOption[]>([])
  const [loadingContainers, setLoadingContainers] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)
  // 会话级温度覆盖（undefined = 跟随全局配置，切换/新建会话时重置）
  const [sessionTemp, setSessionTemp] = useState<number | undefined>(undefined)

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionSearch, setSessionSearch] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const { t } = useTranslation()

  // 会话重命名
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null)
  const [renameName, setRenameName] = useState('')

  // 消息持久化标记（onDone/清空时置位，由 effect 统一落盘）
  const [savePending, setSavePending] = useState(false)

  // 工作台左侧边栏（会话 + 服务器）折叠状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 收藏命令（localStorage 持久化，点击工具卡片星标添加）
  const [favorites, setFavorites] = useState<FavoriteCommand[]>(getFavoriteCommands)
  useEffect(() => {
    const handler = () => setFavorites(getFavoriteCommands())
    window.addEventListener(FAVORITES_EVENT, handler)
    return () => window.removeEventListener(FAVORITES_EVENT, handler)
  }, [])

  // 终端主题（参考 Netcatty 设置）
  const [terminalThemeId, setTerminalThemeId] = useState(() => localStorage.getItem('agentTerminalTheme') || 'github-dark')

  // Config state
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => {
    const saved = localStorage.getItem(CONFIG_KEY)
    const parsed = saved ? JSON.parse(saved) : DEFAULT_MODEL_CONFIG
    return ensureProfiles(parsed)
  })

  // Terminal state
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([])
  const [activeTerminalTab, setActiveTerminalTab] = useState<string>('')
  const [openNewModal, setOpenNewModal] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | undefined>()
  const tabsRef = useRef<TerminalTab[]>(terminalTabs)
  const terminalContainersRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalInstancesRef = useRef<Map<string, Terminal>>(new Map())
  const fitAddonsRef = useRef<Map<string, FitAddon>>(new Map())
  const terminalAreaRef = useRef<HTMLDivElement>(null)

  // 拟合 xterm 并微调列数，确保黑色屏幕精确填满容器（消除 xterm-fit 字符宽度量残差导致的右侧留白）
  const fitAndFill = (container: HTMLDivElement | undefined, term: Terminal | undefined, fit: FitAddon | undefined) => {
    if (!container || !term || !fit) return
    try { fit.fit() } catch { /* ignore */ }
    const screen = container.querySelector('.xterm-screen')
    if (!screen) return
    const winW = container.clientWidth
    const sw = (screen as HTMLElement).offsetWidth
    if (sw > 0 && winW > sw) {
      const cellW = sw / Math.max(term.cols, 1)
      const extra = Math.floor((winW - sw) / cellW)
      if (extra > 0 && term.cols + extra <= 1000) term.resize(term.cols + extra, term.rows)
    }
  }

  // Terminal mode
  const [terminalMode, setTerminalMode] = useState<'server' | 'container'>('server')

  // Command history
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Diagnostics
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([])
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [runningDiagnostics, setRunningDiagnostics] = useState(false)

  // Approval handling（队列：多个高危操作并发时逐个审批，避免互相覆盖）
  const [approvalQueue, setApprovalQueue] = useState<any[]>([])
  const [approvalCountdown, setApprovalCountdown] = useState(0)
  const currentApproval = approvalQueue.length > 0 ? approvalQueue[0] : null

  // 当前流式请求 ID（用于取消）
  const currentRequestIdRef = useRef<string | null>(null)

  // 终端就绪标记：收到过 shell 输出即视为就绪（prompt 已渲染），避免命令写入时没有提示符
  const terminalReadyRef = useRef<Map<string, boolean>>(new Map())

  // Stats
  const [stats, setStats] = useState({
    totalMessages: 0,
    totalCommands: 0,
    successRate: 100
  })

  // ==================== 初始化 ====================

  useEffect(() => {
    // 同步模型配置到主进程 Mastra Agent
    window.electronAPI.opsAgent.setConfig(modelConfig)
    loadSessions()
    loadCommandHistory()

    // 审批请求监听（主进程 Mastra 工具触发，支持并发排队；记录到达时间用于真实超时计算）
    const removeApproval = window.electronAPI.opsAgent.onApprovalRequest((payload) => {
      setApprovalQueue(prev => [...prev, { ...payload, receivedAt: Date.now() }])
    })

    return () => {
      removeApproval()
    }
  }, [modelConfig])

  const loadSessions = async () => {
    const allSessions = await persistenceManager.getAllSessions()
    setSessions(allSessions)
    if (allSessions.length > 0 && !activeSessionId) {
      setActiveSessionId(allSessions[0].id)
    }
  }

  const loadCommandHistory = async () => {
    const history = await persistenceManager.getCommandHistory()
    setCommandHistory(history)
    updateStats(history)
  }

  const updateStats = (history: CommandHistoryItem[]) => {
    const total = history.length
    const success = history.filter(h => h.success).length
    setStats({
      totalMessages: messages.length,
      totalCommands: total,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100
    })
  }

  // ==================== 服务器管理 ====================

  const loadServers = useCallback(async () => {
    try {
      const data = await window.electronAPI.server.getAll()
      setServers(data.filter(s => s.status === 'online'))
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }, [])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const loadContainers = useCallback(async (serverId: string) => {
    setLoadingContainers(true)
    try {
      const apps = await window.electronAPI.app.getByServerId(serverId)
      const allContainers: ContainerOption[] = []
      for (const app of apps) {
        if (app.projectPath) {
          const conts = await window.electronAPI.app.getContainers(serverId, app.projectPath)
          allContainers.push(...conts.map(c => ({
            id: c.id, name: c.name, image: c.image, status: c.status
          })))
        }
      }
      setContainers(allContainers)
    } catch {
      message.error(t('agent.loadContainersFailed'))
    } finally {
      setLoadingContainers(false)
    }
  }, [])

  const handleServerChange = async (serverId: string | undefined) => {
    if (!serverId) {
      setSelectedServer(undefined)
      setConnected(false)
      setContainers([])
      return
    }
    setSelectedServer(serverId)
    setConnected(false)
    setContainers([])
    // 实际建立 SSH 连接，避免出现“SSH connection not established”
    const server = servers.find(s => s.id === serverId)
    if (server) {
      try {
        const result = await window.electronAPI.server.connect(server)
        setConnected(result.success)
        if (!result.success) {
          message.warning(t('agent.serverConnectFailed', { msg: result.message }))
        }
      } catch (error) {
        setConnected(false)
        message.warning(t('agent.serverConnectFailed', { msg: (error as Error).message }))
      }
    }
    loadContainers(serverId)
  }

  // ==================== 会话管理 ====================

  const createSession = async () => {
    const session: ChatSession = {
      id: `session-${Date.now()}`,
      name: t('agent.defaultSessionName', { time: new Date().toLocaleString() }),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await persistenceManager.saveSession(session)
    await loadSessions()
    setActiveSessionId(session.id)
    setMessages([])
    setSessionTemp(undefined) // 新会话重置会话级温度覆盖
  }

  const deleteSession = async (sessionId: string) => {
    await persistenceManager.deleteSession(sessionId)
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId)
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : undefined)
    }
    await loadSessions()
  }

  // 跨会话复制：深拷贝会话为新会话
  const duplicateSession = async (sessionId: string) => {
    const src = sessions.find(s => s.id === sessionId)
    if (!src) return
    const copy: ChatSession = {
      id: `session-${Date.now()}`,
      name: t('agent.sessionCopyName', { name: src.name }),
      messages: JSON.parse(JSON.stringify(src.messages)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await persistenceManager.saveSession(copy)
    await loadSessions()
    setActiveSessionId(copy.id)
    message.success(t('agent.sessionCopied'))
  }

  // 会话搜索过滤（按标题或消息内容）
  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.messages.some(m => (m.content || '').toLowerCase().includes(q))
    )
  }, [sessions, sessionSearch])

  const renameSession = async () => {
    if (!renameTarget || !renameName.trim()) return
    await persistenceManager.saveSession({
      ...renameTarget,
      name: renameName.trim(),
      updatedAt: new Date().toISOString()
    })
    await loadSessions()
    setRenameTarget(null)
    message.success(t('agent.sessionRenamed'))
  }

  // 会话切换时加载消息（仅依赖 activeSessionId；sessions 变化如自动标题/持久化不应覆盖当前消息）
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  useEffect(() => {
    const session = sessionsRef.current.find(s => s.id === activeSessionId)
    setMessages(session?.messages || [])
  }, [activeSessionId])

  // 持久化当前会话（统一入口，避免在 setState updater 中做副作用）
  const persistSession = useCallback((msgs: ChatMessage[]) => {
    if (!activeSessionId) return
    persistenceManager.saveSession({
      id: activeSessionId,
      name: sessions.find(s => s.id === activeSessionId)?.name || t('agent.defaultSessionName', { time: new Date().toLocaleString() }),
      messages: msgs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }, [activeSessionId, sessions])

  // savePending 置位后统一落盘（effect 中拿到最新 messages，StrictMode 安全）
  useEffect(() => {
    if (savePending) {
      persistSession(messages)
      setSavePending(false)
    }
  }, [savePending, messages, persistSession])

  // 解密本地加密存储的 API Key（safeStorage 密文以 enc: 前缀标记；扁平 + 所有档案）
  useEffect(() => {
    const decryptAll = async () => {
      let cfg = modelConfig
      if (cfg.apiKey.startsWith('enc:')) {
        const r = await window.electronAPI.secure.decrypt(cfg.apiKey.slice(4))
        if (r.success && r.data) cfg = { ...cfg, apiKey: r.data }
      }
      if ((cfg.providerProfiles || []).some(p => p.apiKey.startsWith('enc:'))) {
        const profiles = await Promise.all((cfg.providerProfiles || []).map(async p => {
          if (!p.apiKey.startsWith('enc:')) return p
          const r = await window.electronAPI.secure.decrypt(p.apiKey.slice(4))
          return { ...p, apiKey: r.success && r.data ? r.data : p.apiKey }
        }))
        cfg = { ...cfg, providerProfiles: profiles }
      }
      setModelConfig(cfg)
    }
    decryptAll().catch(() => { /* 解密失败保持原样 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ==================== 消息处理 ====================

  // 清空当前会话消息并持久化
  const clearMessages = () => {
    setMessages([])
    setSavePending(true)
    message.success(t('agent.chatCleared'))
  }

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning(t('agent.needModelConfig'))
      return
    }
    const userInput = inputText.trim()
    setInputText('')
    await doSendMessage(userInput)
    // 生成结束后自动聚焦输入框
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  // 流式发送消息（走主进程 Mastra Agent，支持工具调用与审批）
  const doSendMessage = async (userInput: string) => {
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning(t('agent.needModelConfig'))
      return
    }

    setLoading(true)

    // 会话标题自动生成：新会话首条消息自动命名（代替默认时间戳）
    if (activeSessionId && messages.length === 0) {
      const session = sessions.find(x => x.id === activeSessionId)
      if (session) {
        const title = userInput.trim().slice(0, 30)
        const updated = { ...session, name: title, updatedAt: new Date().toISOString() }
        persistenceManager.saveSession(updated).catch(() => { /* 标题生成失败不影响对话 */ })
        // 同步更新本地会话列表（persistSession 依赖 sessions 读取标题），不触发消息覆盖
        setSessions(prev => prev.map(s => s.id === session.id ? updated : s))
      }
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    // 流式占位消息
    const assistantId = `msg-${Date.now()}-assistant`
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'running'
    }])

    const requestId = `ops-${Date.now()}`
    currentRequestIdRef.current = requestId
    const threadId = activeSessionId || `thread-${Date.now()}`
    const server = selectedServer ? servers.find(s => s.id === selectedServer) : undefined
    // 工具调用起始时间表（按 toolCallId 记录，用于计算执行时长）
    const toolCallStartTimes = new Map<string, number>()
    // 当前 assistant 消息的分段（按真实执行顺序交错：文本 / 工具调用）
    const segments: MessageSegment[] = []
    // 将分段同步到消息状态
    const syncSegments = () => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, segments: [...segments] } : m))
    }

    // 注册一次性流式事件监听
    // 流式节流：chunk 以高频到达，逐字 setMessages 会导致全列表重渲染（长回复卡顿主因）。
    // 合并增量后每 50ms 批量刷新一次；onDone/清理前强制 flush，保证最终文本完整。
    let pendingDelta = ''
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flushPendingDelta = () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (!pendingDelta) return
      const delta = pendingDelta
      pendingDelta = ''
      // 追加到最后一个文本分段；若最后一段是工具调用则新建文本分段（保持执行顺序）
      const last = segments[segments.length - 1]
      if (last && last.type === 'text') {
        last.text += delta
      } else {
        segments.push({ type: 'text', text: delta })
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: m.content + delta, segments: [...segments] } : m
      ))
    }

    const removeChunk = window.electronAPI.opsAgent.onChunk(({ requestId: rid, delta }) => {
      if (rid !== requestId) return
      pendingDelta += delta
      if (!flushTimer) {
        flushTimer = setTimeout(flushPendingDelta, 50)
      }
    })

    const removeToolCall = window.electronAPI.opsAgent.onToolCall(({ requestId: rid, toolName, args, toolCallId }) => {
      if (rid !== requestId) return
      if (toolCallId) toolCallStartTimes.set(toolCallId, Date.now())
      segments.push({ type: 'tool', toolCall: { toolCallId, name: toolName, params: args, result: t('agent.toolRunning'), status: 'running' } })
      syncSegments()
    })

    const removeToolResult = window.electronAPI.opsAgent.onToolResult(({ requestId: rid, toolName, success, output, toolCallId }) => {
      if (rid !== requestId) return
      // 截断超长结果，避免渲染大段文本
      const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      const summary = raw.length > 2000 ? `${raw.slice(0, 2000)}\n... t('agent.truncatedChars', { count: raw.length - 2000 })` : raw
      const now = Date.now()
      // 按 toolCallId 精确配对（无 id 时回退"同名且执行中"），更新对应分段
      for (const seg of segments) {
        if (seg.type !== 'tool' || seg.toolCall.status !== 'running') continue
        const matched = toolCallId ? seg.toolCall.toolCallId === toolCallId : seg.toolCall.name === toolName
        if (matched) {
          const start = toolCallId ? toolCallStartTimes.get(toolCallId) : undefined
          if (toolCallId) toolCallStartTimes.delete(toolCallId)
          seg.toolCall = { ...seg.toolCall, result: summary, status: success ? 'success' : 'error', duration: start ? now - start : undefined }
          break
        }
      }
      syncSegments()
    })

    // 路由通知：记录本次对话使用的模型档位（多模型路由）
    // 防御性判断：旧版 preload 无 onRoute 时静默跳过，避免中断整个发送流程
    const removeRoute = window.electronAPI.opsAgent.onRoute
      ? window.electronAPI.opsAgent.onRoute(({ requestId: rid, route }) => {
          if (rid !== requestId) return
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, metadata: { ...(m.metadata || {}), route } } : m
          ))
        })
      : () => {}

    // 思维过程（reasoning）流式累积，展示为"思考过程"折叠块
    let reasoningBuf = ''
    const removeReasoning = window.electronAPI.opsAgent.onReasoning
      ? window.electronAPI.opsAgent.onReasoning(({ requestId: rid, delta }) => {
          if (rid !== requestId) return
          reasoningBuf += delta
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, reasoning: reasoningBuf } : m))
        })
      : () => {}

    // token 用量：把 usage_update 写入当前助手消息元数据，用于气泡与会话累计展示
    const removeUsage = window.electronAPI.opsAgent.onUsage
      ? window.electronAPI.opsAgent.onUsage(({ requestId: rid, usage }) => {
          if (rid !== requestId) return
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, metadata: { ...(m.metadata || {}), usage } } : m
          ))
        })
      : () => {}

    const removeError = window.electronAPI.opsAgent.onError(({ requestId: rid, error }) => {
      if (rid !== requestId) return
      const cancelled = error === 'cancelled'
      if (cancelled) {
        const last = segments[segments.length - 1]
        if (last && last.type === 'text') last.text += '\n\n> ⏹ ' + t('agent.genCancelled')
        else segments.push({ type: 'text', text: '> ⏹ ' + t('agent.genCancelled') })
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? cancelled
            ? { ...m, status: 'success' as const, content: m.content ? `${m.content}\n\n> ⏹ ${t('agent.genCancelled')}` : t('agent.genCancelled'), segments: [...segments] }
            : { ...m, status: 'error', content: t('agent.errorWithMsg', { msg: error }), segments: [...segments] }
          : m
      ))
      setSavePending(true)
    })

    const removeDone = window.electronAPI.opsAgent.onDone(({ requestId: rid }) => {
      if (rid !== requestId) return
      // 完成：先 flush 节流缓冲，确保 segments 含全部增量，再提取工具调用记录
      flushPendingDelta()
      const toolCalls = segments.filter(s => s.type === 'tool').map(s => s.toolCall)
      const fullText = segments.filter(s => s.type === 'text').map(s => s.text).join('')
      const commands = buildCommandList(fullText, toolCalls)
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? {
              ...m,
              status: 'success' as const,
              segments: [...segments],
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              commands: commands.length > 0
                ? commands.map(c => ({ ...c, output: '', status: 'success' as const }))
                : undefined
            }
          : m
      ))
      setSavePending(true)
      setLoading(false)
      cleanup()
    })

    const cleanup = () => {
      if (currentRequestIdRef.current === requestId) currentRequestIdRef.current = null
      // 清理前 flush 节流缓冲，避免中断路径丢失末尾增量
      flushPendingDelta()
      toolCallStartTimes.clear()
      removeChunk()
      removeReasoning()
      removeUsage()
      removeToolCall()
      removeToolResult()
      removeRoute()
      removeError()
      removeDone()
    }

    // 上下文自动压缩：较早对话压缩为摘要传给后端，避免上下文超长导致模型遗忘
    // 策略与顶部常量一致（HISTORY_KEEP / SUMMARY_PER_MSG_MAX / SUMMARY_TOTAL_MAX）
    let historySummary: string | undefined
    if (messages.length > HISTORY_KEEP) {
      const older = messages.slice(0, messages.length - HISTORY_KEEP)
      const parts: string[] = []
      for (const m of older) {
        const role = m.role === 'user' ? t('agent.roleUser') : m.role === 'system' ? t('agent.roleSystem') : t('agent.roleAssistant')
        const content = (m.content || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_PER_MSG_MAX)
        if (content) parts.push(`${role}: ${content}`)
      }
      historySummary = parts.join('\n')
      if (historySummary.length > SUMMARY_TOTAL_MAX) {
        historySummary = `${historySummary.slice(0, SUMMARY_TOTAL_MAX)}\n... t('agent.historyOmitted')`
      }
    }

    try {
      const result = await window.electronAPI.opsAgent.chat(requestId, {
        serverId: selectedServer,
        serverName: server?.name,
        userInput,
        threadId,
        historySummary,
        temperature: sessionTemp
      })
      if (!result.success) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, status: 'error', content: t('agent.errorWithMsg', { msg: result.error }) } : m
        ))
        setSavePending(true)
        setLoading(false)
        cleanup()
      }
    } catch (error) {
      const errMsg = (error as Error).message
      const cancelled = errMsg.includes('cancelled')
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? cancelled
            ? { ...m, status: 'success' as const, content: m.content ? `${m.content}\n\n> ⏹ ${t('agent.genCancelled')}` : t('agent.genCancelled') }
            : { ...m, status: 'error', content: t('agent.errorWithMsg', { msg: errMsg }) }
          : m
      ))
      setSavePending(true)
      setLoading(false)
      cleanup()
    }
  }

  // ==================== 命令执行 ====================

  const executeCommand = async (command: string, riskLevel?: 'low' | 'medium' | 'high') => {
    if (!selectedServer) {
      message.warning(t('agent.selectServerFirst'))
      return null
    }
    // AI 建议命令：执行前必须通过风控门禁（黑名单直接拒绝，高危命令走统一审批）
    const gate = await window.electronAPI.opsAgent.approveCommand(command, riskLevel)
    if (!gate.approved) {
      if (gate.blocked) message.error(t('agent.cmdBlocked'))
      else message.warning(t('agent.cmdNotApproved'))
      return null
    }
    const startTime = Date.now()
    const result = await window.electronAPI.server.executeCommand(selectedServer, command)
    const executedCommand: ExecutedCommand = {
      command,
      output: result.success ? result.stdout : result.stderr,
      status: result.success ? 'success' : 'error',
      riskLevel,
      executionTime: Date.now() - startTime,
      serverId: selectedServer,
      timestamp: new Date().toISOString()
    }
    // 保存命令历史
    await persistenceManager.saveCommandHistory({
      id: `cmd-${Date.now()}`,
      command,
      description: '',
      timestamp: executedCommand.timestamp!,
      serverId: selectedServer,
      success: result.success,
      executionTime: executedCommand.executionTime!,
      riskLevel: riskLevel || 'low',
      output: result.stdout
    })
    await loadCommandHistory()
    return executedCommand
  }

  const executeMessageCommands = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg || !msg.commands || !selectedServer) return

    for (const cmd of msg.commands) {
      await executeCommand(cmd.command, cmd.riskLevel)
    }
    await loadSessions()
  }

  // AI 分析终端选中内容（参考 Netcatty showTerminalSelectionAIAction）
  const analyzeTerminalSelection = () => {
    const term = activeTerminalTab ? terminalInstancesRef.current.get(activeTerminalTab) : undefined
    const sel = term?.getSelection?.() || ''
    if (!sel.trim()) {
      message.info(t('agent.selectTextFirst'))
      return
    }
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning(t('agent.needModelConfig'))
      return
    }
    doSendMessage(t('agent.analyzeSelectionPrompt', { output: sel.slice(0, 3000) }))
  }

  // 在终端中执行命令
  const executeCommandInTerminal = async (command: string) => {
    if (!selectedServer) {
      message.warning(t('agent.selectServerFirst'))
      return
    }
    if (!activeTerminalTab) {
      message.warning(t('agent.openTerminalFirst'))
      return
    }
    // AI 建议命令：写入终端前必须通过风控门禁（黑名单直接拒绝，高危命令走统一审批）
    const gate = await window.electronAPI.opsAgent.approveCommand(command)
    if (!gate.approved) {
      if (gate.blocked) message.error(t('agent.cmdBlocked'))
      else message.warning(t('agent.cmdNotApproved'))
      return
    }
    try {
      // 确保终端处于活动状态
      setActiveTerminalTab(activeTerminalTab)
      // 等待终端就绪：shell prompt（如 [root@localhost ~]#）渲染完成后再写入命令，
      // 避免命令挤在没有提示符的位置
      if (!terminalReadyRef.current.get(activeTerminalTab)) {
        const deadline = Date.now() + 3000
        while (!terminalReadyRef.current.get(activeTerminalTab) && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 150))
        }
        if (!terminalReadyRef.current.get(activeTerminalTab)) {
          message.warning(t('agent.terminalNotReady'))
          return
        }
      }
      // 发送命令到终端（添加换行符执行）
      await window.electronAPI.terminal.write(activeTerminalTab, command + '\n')
      message.success(t('agent.cmdSent'))
    } catch (error) {
      message.error(t('agent.sendFailed', { msg: (error as Error).message }))
    }
  }

  // ==================== 系统诊断 ====================

  // 本地诊断：执行固定诊断命令（读取类，无需审批），返回诊断结果
  const collectDiagnostics = async (serverId: string): Promise<DiagnosticResult[]> => {
    const diagnosticCommands: Array<{ type: DiagnosticResult['type']; cmd: string }> = [
      { type: 'cpu', cmd: "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'" },
      { type: 'memory', cmd: "free | grep Mem | awk '{print ($3/$2) * 100}'" },
      { type: 'disk', cmd: "df / | tail -1 | awk '{print $5}' | sed 's/%//'" },
      { type: 'docker', cmd: "docker ps --format '{{.Names}}' | wc -l" }
    ]

    const results: DiagnosticResult[] = await Promise.all(diagnosticCommands.map(async (diag) => {
      try {
        const result = await window.electronAPI.server.executeCommand(serverId, diag.cmd)
        const value = parseFloat(result.stdout) || 0
        let status: 'healthy' | 'warning' | 'critical' = 'healthy'
        let diagMessage = ''
        let suggestion: string | undefined

        switch (diag.type) {
          case 'cpu':
            if (value > 90) { status = 'critical'; diagMessage = t('agent.diag.cpuHigh'); suggestion = t('agent.diag.cpuHighTip') }
            else if (value > 70) { status = 'warning'; diagMessage = t('agent.diag.cpuWarn') }
            else diagMessage = t('agent.diag.cpuOk')
            break
          case 'memory':
            if (value > 90) { status = 'critical'; diagMessage = t('agent.diag.memHigh'); suggestion = t('agent.diag.memHighTip') }
            else if (value > 70) { status = 'warning'; diagMessage = t('agent.diag.memWarn') }
            else diagMessage = t('agent.diag.memOk')
            break
          case 'disk':
            if (value > 90) { status = 'critical'; diagMessage = t('agent.diag.diskHigh'); suggestion = t('agent.diag.diskHighTip') }
            else if (value > 70) { status = 'warning'; diagMessage = t('agent.diag.diskWarn') }
            else diagMessage = t('agent.diag.diskOk')
            break
          case 'docker':
            diagMessage = t('agent.diag.containers', { value })
            break
          default:
            break
        }
        return { type: diag.type, status, value, message: diagMessage, suggestion, timestamp: new Date().toISOString() }
      } catch {
        return { type: diag.type, status: 'critical', value: 0, message: t('agent.diag.failed'), timestamp: new Date().toISOString() }
      }
    }))
    return results
  }

  const runDiagnostics = async () => {
    if (!selectedServer) {
      message.warning(t('agent.selectServerFirst'))
      return
    }

    setRunningDiagnostics(true)
    try {
      const results = await collectDiagnostics(selectedServer)
      setDiagnostics(results)
      setShowDiagnostics(true)
    } catch {
      message.error(t('agent.diagFailed'))
    } finally {
      setRunningDiagnostics(false)
    }
  }

  // 诊断报告中的"AI 深入分析并修复"：基于已采集的检测结果交给 AI 分析
  const runAIAnalysis = async () => {
    if (!selectedServer) {
      message.warning(t('agent.selectServerFirst'))
      return
    }
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning(t('agent.needModelConfig'))
      return
    }
    if (loading) return

    setRunningDiagnostics(true)
    setShowDiagnostics(false)
    try {
      // 复用诊断报告里已有的结果，若无则先采集一次
      const results = diagnostics.length ? diagnostics : await collectDiagnostics(selectedServer)
      if (results.length === 0) {
        message.warning(t('agent.noDiagData'))
        return
      }

      const diagText = results.map(d => {
        const pct = (d.type === 'cpu' || d.type === 'memory' || d.type === 'disk') ? ` (${d.value}%)` : ''
        return `[${d.type}] ${d.status}${pct}: ${d.message}${d.suggestion ? ` (t('agent.suggestion'): ${d.suggestion})` : ''}`
      }).join('\n')

      await doSendMessage(
        t('agent.smartDiagPrompt', { diagText })
      )
    } catch {
      message.error(t('agent.smartDiagFailed'))
    } finally {
      setRunningDiagnostics(false)
    }
  }

  // ==================== 配置管理 ====================

  // 当前激活档案（扁平字段为激活档案的镜像）
  const profiles = modelConfig.providerProfiles || []

  // 上下文压缩策略可视化：估算当前会话的 token 占用与压缩状态
  const ctxState = useMemo(() => computeContextState(messages), [messages])
  const contextWindow = useMemo(() => {
    const active = profiles.find(p => p.id === modelConfig.activeProfileId) || profiles[0]
    return active?.contextWindow || DEFAULT_CONTEXT_WINDOW
  }, [profiles, modelConfig.activeProfileId])
  const ctxUsage = ctxState.fullTokens + ctxState.summaryTokens
  const ctxPct = Math.min(100, Math.round((ctxUsage / contextWindow) * 100))
  const ctxColor = ctxPct >= 80 ? '#FF3B30' : ctxPct >= 60 ? '#FF9500' : '#0A84FF'

  // 本会话累计 token 用量（来自每条助手消息 metadata.usage）
  const sessionTotalUsage = useMemo(() => {
    let input = 0, output = 0
    for (const m of messages) {
      const u = m.metadata?.usage
      if (u) { input += u.input; output += u.output }
    }
    return { input, output }
  }, [messages])

  // 切换激活档案（同步扁平字段，供 chat / setConfig 使用）
  const activateProfile = (id: string) => {
    const p = profiles.find(x => x.id === id)
    if (!p) return
    setModelConfig({
      ...modelConfig,
      activeProfileId: id,
      provider: p.provider, apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl,
      azureEndpoint: p.azureEndpoint, azureDeployment: p.azureDeployment,
      maxTokens: p.maxTokens ?? modelConfig.maxTokens
    })
  }

  // ==================== 审批处理 ====================

  const handleApproval = (approved: boolean) => {
    if (currentApproval?.id) {
      window.electronAPI.opsAgent.approval(currentApproval.id, approved)
    }
    setApprovalQueue(prev => prev.slice(1))
    setApprovalCountdown(0)
  }

  // 审批超时倒计时：基于请求到达时间计算真实剩余（排队等待会计入超时，与主进程超时一致）
  useEffect(() => {
    if (!currentApproval) {
      setApprovalCountdown(0)
      return
    }
    const timeout = modelConfig.approvalTimeout || 60
    const deadline = (currentApproval.receivedAt || Date.now()) + timeout * 1000
    const updateRemain = () => Math.max(0, Math.round((deadline - Date.now()) / 1000))
    setApprovalCountdown(updateRemain())
    const timer = setInterval(() => {
      const remain = updateRemain()
      setApprovalCountdown(remain)
      if (remain <= 0) {
        clearInterval(timer)
        // 超时自动拒绝（与主进程超时保持一致）
        if (currentApproval?.id) {
          window.electronAPI.opsAgent.approval(currentApproval.id, false)
        }
        message.warning(t('agent.approvalTimeout'))
        setApprovalQueue(q => q.slice(1))
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [currentApproval, modelConfig.approvalTimeout])

  // ==================== 终端管理 ====================

  const openNewTerminal = async (targetId: string, targetName: string, type: 'server' | 'container') => {
    if (!selectedServer) return
    try {
      const server = servers.find(s => s.id === selectedServer)
      const containerId = type === 'server' ? '__server__' : targetId
      const result = await window.electronAPI.terminal.open(selectedServer, containerId, 80, 24)

      if (result.success && result.sessionId) {
        const sessionId = result.sessionId
        const newTab: TerminalTab = {
          sessionId,
          containerId: targetId,
          containerName: targetName,
          serverId: selectedServer,
          serverName: server?.name || '',
          type,
          elementId: `terminal-${sessionId}`,
          createdAt: new Date().toISOString()
        }
        setTerminalTabs(prev => [...prev, newTab])
        setActiveTerminalTab(sessionId)
        message.success(t('agent.terminalOpened'))
      } else {
        message.error(result.message || t('agent.terminalOpenFailed'))
      }
    } catch (error) {
      message.error(t('agent.errorWithMsg', { msg: (error as Error).message }))
    }
  }

  const closeTerminalTab = async (sessionId: string) => {
    try { await window.electronAPI.terminal.close(sessionId) } catch { /* ignore */ }
    setTerminalTabs(prev => {
      const newTabs = prev.filter(t => t.sessionId !== sessionId)
      terminalContainersRef.current.delete(sessionId)
      terminalReadyRef.current.delete(sessionId)
      if (activeTerminalTab === sessionId && newTabs.length > 0) {
        setActiveTerminalTab(newTabs[newTabs.length - 1].sessionId)
      }
      return newTabs
    })
  }

  // 初始化 xterm 实例
  useEffect(() => {
    terminalTabs.forEach(tab => {
      const container = terminalContainersRef.current.get(tab.sessionId)
      const existingTerm = terminalInstancesRef.current.get(tab.sessionId)

      if (container && !existingTerm) {
        const term = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: 'Consolas, "Courier New", monospace',
          theme: TERMINAL_THEMES[terminalThemeId]?.theme || TERMINAL_THEMES['github-dark'].theme,
          scrollback: 10000
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(container)
        // 等 DOM 完全布局后再拟合，确保 xterm 填满容器
        const doFit = () => fitAndFill(container, term, fitAddon)
        requestAnimationFrame(doFit)
        setTimeout(doFit, 60)
        setTimeout(doFit, 200)

        terminalInstancesRef.current.set(tab.sessionId, term)
        fitAddonsRef.current.set(tab.sessionId, fitAddon)

        // 处理用户输入
        term.onData(data => {
          window.electronAPI.terminal.write(tab.sessionId, data)
        })
      }
    })

    // 清理已关闭的终端
    terminalInstancesRef.current.forEach((term, sessionId) => {
      if (!terminalTabs.find(t => t.sessionId === sessionId)) {
        term.dispose()
        terminalInstancesRef.current.delete(sessionId)
        fitAddonsRef.current.delete(sessionId)
      }
    })
  }, [terminalTabs])

  // 终端内容区尺寸变化或切换激活终端时，重新 fit 当前激活终端（保证 xterm 填满容器）
  useEffect(() => {
    const area = terminalAreaRef.current
    if (!area) return
    const refit = () => {
      requestAnimationFrame(() => {
        const term = terminalInstancesRef.current.get(activeTerminalTab)
        const fit = fitAddonsRef.current.get(activeTerminalTab)
        const container = terminalContainersRef.current.get(activeTerminalTab)
        fitAndFill(container, term, fit)
      })
    }
    refit()
    const observer = new ResizeObserver(refit)
    observer.observe(area)
    return () => observer.disconnect()
  }, [activeTerminalTab])

  // 终端数据处理器
  useEffect(() => {
    const removeDataListener = window.electronAPI.terminal.onData((sessionId, data) => {
      terminalReadyRef.current.set(sessionId, true)
      const term = terminalInstancesRef.current.get(sessionId)
      if (term) {
        term.write(data)
      }
    })

    const removeCloseListener = window.electronAPI.terminal.onClose((sessionId) => {
      const term = terminalInstancesRef.current.get(sessionId)
      if (term) {
        term.dispose()
        terminalInstancesRef.current.delete(sessionId)
        fitAddonsRef.current.delete(sessionId)
      }
      setTerminalTabs(prev => prev.filter(t => t.sessionId !== sessionId))
    })

    const removeErrorListener = window.electronAPI.terminal.onError((sessionId, error) => {
      const term = terminalInstancesRef.current.get(sessionId)
      if (term) {
        term.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`)
      }
    })

    return () => {
      removeDataListener()
      removeCloseListener()
      removeErrorListener()
    }
  }, [])

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  // ==================== 渲染 ====================

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#0A84FF' } }}>
      <div className="agent-terminal-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000000', overflow: 'hidden' }}>
        
        {/* ========== 顶部状态栏 ========== */}
        <div className="agent-terminal-header" style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: '10px 20px', borderBottom: '1px solid #48484a', flexShrink: 0
        }}>
          <Space size="large">
            <Space>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, rgba(10,132,255,0.18), rgba(10,132,255,0.18))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(10,132,255,0.35)', boxShadow: '0 2px 12px rgba(10,132,255,0.12)' }}>
                <RobotOutlined style={{ fontSize: 18, color: '#0A84FF' }} />
              </div>
              <div>
                <Title level={4} className="agent-terminal-brand" style={{ margin: 0, fontSize: 16, lineHeight: 1.2, fontFamily: 'inherit', fontWeight: 700 }}>
                  AI OPS TERMINAL
                </Title>
                <Text style={{ fontSize: 10, color: '#8e8e93', letterSpacing: 0.6 }}>Mastra Agent Console</Text>
              </div>
            </Space>
            <Divider type="vertical" style={{ background: '#48484a', height: 28 }} />
            <Space size="small">
              <CloudOutlined style={{ color: '#aeaeb2' }} />
              <Select value={selectedServer} onChange={handleServerChange} style={{ minWidth: 180 }} 
                placeholder={t('agent.selectServer')} allowClear size="small"
                options={servers.map(s => ({ 
                  value: s.id, 
                  label: <Space>
                    <Badge status={s.status === 'online' ? 'success' : 'default'} />
                    <span style={{ color: '#f5f5f7' }}>{s.name}</span>
                    <Text type="secondary">({s.host})</Text>
                  </Space> 
                }))} />
              {connected && <Tag color="success" icon={<LinkOutlined />} style={{ border: '1px solid rgba(63,185,80,0.4)', background: 'rgba(63,185,80,0.1)' }}>{t('agent.connected')}</Tag>}
            </Space>
          </Space>
          
          <Space size="middle">
            {/* 统计信息 */}
            <Space size={6} style={{ padding: '4px 12px', background: 'rgba(44,44,46,0.8)', borderRadius: 999, border: '1px solid #3a3a3c' }}>
              <DashboardOutlined style={{ color: '#0A84FF', fontSize: 11 }} />
              <Text style={{ color: '#aeaeb2', fontSize: 11 }}>
                <Text strong style={{ color: '#f5f5f7', fontSize: 11 }}>{stats.totalCommands}</Text> {t('agent.unitCommands')}
                <span style={{ margin: '0 6px', color: '#48484a' }}>|</span>
                <Text strong style={{ color: stats.successRate >= 90 ? '#30D158' : stats.successRate >= 60 ? '#FF9500' : '#FF453A', fontSize: 11 }}>{stats.successRate}%</Text> {t('agent.unitSuccessRate')}
              </Text>
            </Space>
            
            <Tag color={modelConfig.apiKey && modelConfig.model ? 'success' : 'default'} icon={<ApiOutlined />} style={{ border: '1px solid rgba(63,185,80,0.35)', background: 'rgba(63,185,80,0.08)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {modelConfig.model || t('agent.notConfigured')}
            </Tag>
            <Tooltip title={t('agent.modelConfigMoved')}>
              <Button size="small" icon={<SettingOutlined />} disabled />
            </Tooltip>
            <Tooltip title={sidebarCollapsed ? t('agent.expandSidebar') : t('agent.collapseSidebar')}>
              <Button size="small" icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
            </Tooltip>
          </Space>
        </div>

        {/* ========== 主内容区 ========== */}
        <div className="agent-main-content" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

          {/* ========== 左侧：会话 / 服务器 边栏（工作台风格） ========== */}
          {!sidebarCollapsed && (
            <div className="agent-sidebar" style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(72,72,74,0.8)', background: 'rgba(0,0,0,0.55)', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', height: 46, boxSizing: 'border-box', background: 'rgba(28,28,30,0.7)', backdropFilter: 'blur(20px) saturate(180%)', borderBottom: '1px solid #48484a', flexShrink: 0 }}>
                <Space>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(10,132,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(10,132,255,0.25)' }}>
                    <MessageOutlined style={{ color: '#0A84FF', fontSize: 13 }} />
                  </div>
                  <Text strong style={{ color: '#f5f5f7', fontSize: 12 }}>{t('agent.sessionsTitle', { count: sessions.length })}</Text>
                </Space>
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={createSession} title={t('agent.newSession')} style={{ color: '#0A84FF', padding: 0, width: 24, height: 24 }} />
              </div>
              <div style={{ padding: '6px 8px' }}>
                <Input size="small" prefix={<SearchOutlined />} allowClear placeholder={t('agent.searchSessions')} value={sessionSearch} onChange={e => setSessionSearch(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #3a3a3c', color: '#f5f5f7', fontSize: 11 }} />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 8px' }}>
                {filteredSessions.map(s => (
                  <div key={s.id} className={`agent-sidebar-item ${activeSessionId === s.id ? 'active' : ''}`} onClick={() => setActiveSessionId(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer' }}>
                    <MessageOutlined style={{ color: activeSessionId === s.id ? '#0A84FF' : '#8e8e93', fontSize: 12, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: activeSessionId === s.id ? '#f5f5f7' : '#aeaeb2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: '#8e8e93' }}>{s.messages.length} {t('agent.unitMessages')}</div>
                    </div>
                    <Space size={2} className="agent-sidebar-actions">
                      <Button size="small" type="text" icon={<CopyOutlined />} title={t('agent.copySession')} style={{ color: '#aeaeb2', padding: 0, width: 20, height: 20 }}
                        onClick={(e) => { e.stopPropagation(); duplicateSession(s.id) }} />
                      <Button size="small" type="text" icon={<EditOutlined />} title={t('agent.rename')} style={{ color: '#aeaeb2', padding: 0, width: 20, height: 20 }}
                        onClick={(e) => { e.stopPropagation(); setRenameTarget(s); setRenameName(s.name) }} />
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} title={t('agent.delete')} style={{ padding: 0, width: 20, height: 20 }}
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }} />
                    </Space>
                  </div>
                ))}
                {filteredSessions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <Text style={{ fontSize: 11, color: '#8e8e93' }}>{sessionSearch ? t('agent.noMatchedSession') : t('agent.noSessions')}</Text>
                  </div>
                )}
              </div>

              {/* 收藏命令 */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(72,72,74,0.8)' }}>
                <Text style={{ fontSize: 10, color: '#aeaeb2', letterSpacing: 1.2 }}>{t('agent.favoriteCommands')}</Text>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {favorites.map(f => (
                    <div key={f.command} className="agent-sidebar-item" onClick={() => setInputText(f.command)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}>
                      <StarOutlined style={{ color: '#FF9500', fontSize: 11, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#aeaeb2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Consolas, monospace' }}>{f.command}</div>
                      <Button size="small" type="text" icon={<CloseOutlined />} title={i18n.t('agent.unfavorite')} style={{ padding: 0, width: 16, height: 16, color: '#8e8e93' }}
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteCommand(f.command, f.name) }} />
                    </div>
                  ))}
                  {favorites.length === 0 && <Text style={{ fontSize: 11, color: '#8e8e93', padding: '4px 8px' }}>{t('agent.noFavorites')}</Text>}
                </div>
              </div>

              {/* 服务器列表 */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(72,72,74,0.8)' }}>
                <Text style={{ fontSize: 10, color: '#aeaeb2', letterSpacing: 1.2 }}>{t('agent.servers')}</Text>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {servers.map(s => (
                    <div key={s.id} className={`agent-sidebar-item ${selectedServer === s.id ? 'active' : ''}`} onClick={() => handleServerChange(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.status === 'online' ? '#30D158' : '#636366', flexShrink: 0, boxShadow: s.status === 'online' ? '0 0 5px rgba(63,185,80,0.6)' : 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: selectedServer === s.id ? '#f5f5f7' : '#aeaeb2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: '#8e8e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.host}</div>
                      </div>
                      {selectedServer === s.id && <LinkOutlined style={{ color: '#0A84FF', fontSize: 11 }} />}
                    </div>
                  ))}
                  {servers.length === 0 && <Text style={{ fontSize: 11, color: '#8e8e93', padding: '4px 8px' }}>{t('agent.noServers')}</Text>}
                </div>
              </div>
            </div>
          )}

          {/* ========== 左侧：终端面板 ========== */}
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(72,72,74,0.7)', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', height: 46, boxSizing: 'border-box', background: 'rgba(28,28,30,0.7)', backdropFilter: 'blur(20px) saturate(180%)', borderBottom: '1px solid #48484a', flexShrink: 0 }}>
              <Space>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(10,132,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(10,132,255,0.25)' }}>
                  <LaptopOutlined style={{ color: '#0A84FF', fontSize: 13 }} />
                </div>
                <Text strong style={{ color: '#f5f5f7', fontSize: 12 }}>{t('agent.terminal')}</Text>
                <div style={{ display: 'flex', gap: 4, marginLeft: 8, background: '#000000', borderRadius: 6, padding: 2, border: '1px solid #3a3a3c' }}>
                  <Button size="small" type="text" onClick={() => setTerminalMode('server')} style={terminalMode === 'server' ? { background: '#3a3a3c', color: '#0A84FF', borderRadius: 4, fontSize: 11 } : { color: '#aeaeb2', fontSize: 11, borderRadius: 4 }}>{t('agent.serverTab')}</Button>
                  <Button size="small" type="text" onClick={() => setTerminalMode('container')} style={terminalMode === 'container' ? { background: '#3a3a3c', color: '#0A84FF', borderRadius: 4, fontSize: 11 } : { color: '#aeaeb2', fontSize: 11, borderRadius: 4 }}>{t('agent.containerTab')}</Button>
                </div>
              </Space>
              <Space size="small">
                <Tooltip title={t('agent.aiAnalyzeSelection')}>
                  <Button size="small" icon={<RobotOutlined />} onClick={analyzeTerminalSelection}
                    style={{ borderColor: '#48484a', color: '#0A84FF' }} />
                </Tooltip>
                {terminalMode === 'container' && <Button size="small" icon={<ReloadOutlined />} onClick={() => selectedServer && loadContainers(selectedServer)} disabled={!selectedServer}>{t('agent.refresh')}</Button>}
                <Button size="small" type="primary" icon={<PlusOutlined />}
                  onClick={() => {
                    if (!selectedServer) { message.warning(t('agent.selectServerFirst')); return }
                    if (terminalMode === 'container') {
                      if (containers.length === 0) { message.warning(t('agent.noContainers')); return }
                      setSelectedContainerId(undefined); setOpenNewModal(true)
                    } else {
                      openNewTerminal('server', t('agent.serverTerminal'), 'server')
                    }
                  }}
                  disabled={!selectedServer || (terminalMode === 'container' && containers.length === 0)}
                  style={{ background: 'linear-gradient(135deg, #0A84FF 0%, #0051D5 100%)', borderColor: 'transparent', boxShadow: '0 2px 10px rgba(10,132,255,0.3)' }}>{t('agent.newTerminal')}</Button>
              </Space>
            </div>
            
            {terminalTabs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
                <Empty
                  image={<LaptopOutlined style={{ fontSize: 44, color: '#636366' }} />}
                  description={<span style={{ color: '#aeaeb2' }}>{t('agent.selectToOpen', { type: terminalMode === 'server' ? t('agent.server') : t('agent.container') })}</span>} />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', background: 'rgba(28,28,30,0.85)', borderBottom: '1px solid #48484a', overflowX: 'auto' }}>
                  {terminalTabs.map(tab => (
                    <div key={tab.sessionId} onClick={() => setActiveTerminalTab(tab.sessionId)}
                      className={`terminal-tab ${activeTerminalTab === tab.sessionId ? 'active' : ''}`}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', cursor: 'pointer', borderRight: '1px solid #3a3a3c', background: activeTerminalTab === tab.sessionId ? 'rgba(10,132,255,0.06)' : 'transparent', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: activeTerminalTab === tab.sessionId ? '#30D158' : '#48484a', boxShadow: activeTerminalTab === tab.sessionId ? '0 0 6px rgba(63,185,80,0.7)' : 'none' }} />
                      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', color: activeTerminalTab === tab.sessionId ? '#f5f5f7' : '#aeaeb2' }}>{tab.containerName}</span>
                      <CloseOutlined style={{ fontSize: 10, color: '#8e8e93', transition: 'color .15s' }} onClick={(e) => { e.stopPropagation(); closeTerminalTab(tab.sessionId) }} />
                    </div>
                  ))}
                </div>
                <div ref={terminalAreaRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                  {terminalTabs.map(tab => (
                    <div key={tab.sessionId} style={{ display: activeTerminalTab === tab.sessionId ? 'block' : 'none', position: 'absolute', inset: 0, background: '#000000' }}>
                      <div ref={el => { if (el) terminalContainersRef.current.set(tab.sessionId, el) }} style={{ width: '100%', height: '100%' }} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ========== 右侧：AI对话面板 ========== */}
          <div className="agent-chat-panel" style={{ width: 480, minWidth: 420, maxWidth: '35%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000000', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', height: 46, boxSizing: 'border-box', background: 'rgba(28,28,30,0.7)', backdropFilter: 'blur(20px) saturate(180%)', borderBottom: '1px solid #48484a', flexShrink: 0 }}>
              <Space>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, rgba(10,132,255,0.16), rgba(88,166,255,0.16))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(10,132,255,0.3)' }}>
                  <RobotOutlined style={{ color: '#0A84FF', fontSize: 13 }} />
                </div>
                {activeSessionId && (
                  <Tooltip title={sessions.find(s => s.id === activeSessionId)?.name}>
                    <Tag style={{ margin: 0, fontSize: 11, background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.35)', color: '#0A84FF', borderRadius: 999, maxWidth: 220 }}>
                      <span style={{ display: 'inline-block', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', color: '#0A84FF' }}>
                        {sessions.find(s => s.id === activeSessionId)?.name}
                      </span>
                    </Tag>
                  </Tooltip>
                )}
                {/* 模型快速切换（激活提供商档案） */}
                <Select value={modelConfig.activeProfileId} onChange={v => activateProfile(v)} size="small" variant="borderless"
                  style={{ minWidth: 96, fontSize: 11, color: '#aeaeb2' }}
                  suffixIcon={<ThunderboltOutlined style={{ color: '#0A84FF', fontSize: 10 }} />}
                  options={(modelConfig.providerProfiles || []).map(p => ({ value: p.id, label: `${p.name} · ${p.model || i18n.t('agent.noModelSelected')}` }))} />
              </Space>
              <Space size={2}>
                <Tooltip title={t('agent.sysDiagnosis')}><Button size="small" type="text" icon={<ScanOutlined />} onClick={runDiagnostics} loading={runningDiagnostics} style={{ color: '#aeaeb2' }} /></Tooltip>
                <Tooltip title={t('agent.commandHistory')}><Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setShowHistory(true)} style={{ color: '#aeaeb2' }} /></Tooltip>
                <Tooltip title={t('agent.newSession')}><Button size="small" type="text" icon={<PlusOutlined />} onClick={createSession} style={{ color: '#aeaeb2' }} /></Tooltip>
                <Tooltip title={t('agent.clearChat')}><Button size="small" type="text" icon={<ClearOutlined />} onClick={clearMessages} disabled={messages.length === 0} /></Tooltip>
              </Space>
            </div>

            {/* 上下文压缩策略可视化：token 占用进度 + 压缩状态（悬停查看策略说明） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px', background: 'rgba(28,28,30,0.45)', borderBottom: '1px solid #48484a', flexShrink: 0 }}>
              <Tooltip
                title={<div style={{ fontSize: 11, lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('agent.ctxPolicyTitle')}</div>
                  <div>• {t('agent.ctxPolicyKeep', { n: HISTORY_KEEP })}</div>
                  <div>• {t('agent.ctxPolicySummary', { per: SUMMARY_PER_MSG_MAX, total: SUMMARY_TOTAL_MAX })}</div>
                  <div>• {t('agent.ctxPolicyCurrent', { kept: ctxState.keptFull, full: fmtTokens(ctxState.fullTokens), compressed: ctxState.compressedCount, summary: fmtTokens(ctxState.summaryTokens) })}</div>
                  <div style={{ color: '#8e8e93', marginTop: 4 }}>{t('agent.ctxPolicyWindow', { window: fmtTokens(contextWindow) })}</div>
                </div>}
                placement="bottom"
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'help' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, lineHeight: '12px', whiteSpace: 'nowrap', gap: 8 }}>
                    <span style={{ color: '#aeaeb2', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t('agent.context')} <span style={{ color: ctxColor, fontWeight: 600 }}>≈{fmtTokens(ctxUsage)}</span>/{fmtTokens(contextWindow)} · <span style={{ color: ctxColor }}>{ctxPct}%</span>
                    </span>
                    <span style={{ color: ctxState.compressedCount > 0 ? '#FF9500' : '#6e6e73', flexShrink: 0 }}>
                      {ctxState.compressedCount > 0 ? t('agent.ctxCompressed', { n: ctxState.compressedCount }) : t('agent.ctxFull', { n: ctxState.total })}
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: '#3a3a3c', overflow: 'hidden' }}>
                    <div style={{ width: `${ctxPct}%`, height: '100%', background: ctxColor, transition: 'width .3s ease' }} />
                  </div>
                </div>
              </Tooltip>
            </div>

            <div ref={messagesRef} className="agent-messages" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ width: 76, height: 76, margin: '0 auto 20px', borderRadius: 20, background: 'radial-gradient(circle at 30% 30%, rgba(10,132,255,0.25), rgba(88,166,255,0.08) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(10,132,255,0.2)', animation: 'glow-pulse 3.2s ease-in-out infinite' }}>
                    <RobotOutlined style={{ fontSize: 32, color: '#0A84FF' }} />
                  </div>
                  <Text style={{ color: '#f5f5f7', fontSize: 15, fontWeight: 600, display: 'block' }}>{t('agent.emptyTitle')}</Text>
                  <Text type="secondary" style={{ color: '#8e8e93', fontSize: 12, display: 'block', marginTop: 6 }}>{t('agent.emptySubtitle')}</Text>
                  <div style={{ marginTop: 28 }}>
                    <Text style={{ color: '#aeaeb2', fontSize: 11, marginBottom: 12, display: 'block', letterSpacing: 1 }}>{t('agent.quickCommands')}</Text>
                    <Space wrap size={[8, 8]} style={{ width: '100%' }}>
                      {(modelConfig.quickMessages && modelConfig.quickMessages.length > 0 ? modelConfig.quickMessages : [
                        t('agent.quickTip1'),
                        t('agent.quickTip2'),
                        t('agent.quickTip3')
                      ]).map((tip, i) => (
                        <Tag key={i} className="quick-tip" onClick={() => setInputText(tip)} style={{ maxWidth: '100%', whiteSpace: 'normal', height: 'auto', lineHeight: '20px', padding: '4px 12px', textAlign: 'left' }}>{tip.slice(0, 20)}{tip.length > 20 ? '…' : ''}</Tag>
                      ))}
                    </Space>
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} style={{ marginBottom: 16, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {/* 用户消息 */}
                    {msg.role === 'user' && (
                      <div className="user-msg-bubble" style={{ maxWidth: '85%', padding: '10px 14px', background: 'linear-gradient(135deg, #0A84FF 0%, #0051D5 100%)', color: '#fff' }}>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{new Date(msg.timestamp).toLocaleTimeString()}</div>
                      </div>
                    )}
                    
                    {/* AI消息（左侧头像列 + 内容） */}
                    {msg.role === 'assistant' && (
                      <div style={{ maxWidth: '92%', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div className="ai-avatar"><RobotOutlined style={{ color: '#fff', fontSize: 13 }} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ai-msg-bubble" style={{ padding: msg.status === 'running' ? '10px 14px' : '12px 14px' }}>
                          {/* 思维过程（reasoning）折叠展示 */}
                          {!!msg.reasoning && msg.reasoning.trim().length > 0 && (
                            <Collapse
                              size="small"
                              style={{ marginBottom: 8, background: 'rgba(0,0,0,0.45)' }}
                              items={[{
                                key: 'reasoning',
                                label: <span style={{ fontSize: 11, color: '#8e8e93' }}>💭 {t('agent.reasoning')}</span>,
                                children: <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#aeaeb2' }}>{msg.reasoning}</pre>
                              }]}
                            />
                          )}
                          {/* 分段内容：文本 / 工具调用 按真实执行顺序交错 */}
                          {msg.segments && msg.segments.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {msg.segments.map((seg, idx) => (
                                <div key={idx}>
                                  {seg.type === 'text' ? (
                                    <div style={{ fontSize: 13, lineHeight: 1.65, color: '#f5f5f7' }}>
                                        {renderRichSegment(seg.text, (cmd) => { navigator.clipboard.writeText(cmd); message.success(t('agent.copied')) }, executeCommandInTerminal, !!activeTerminalTab)}
                                      </div>
                                  ) : (
                                    <ToolCallCard tc={seg.toolCall} />
                                  )}
                                </div>
                              ))}
                              {msg.status === 'running' && <span className="typing-dots"><i /><i /><i /></span>}
                            </div>
                          ) : (
                            <>
                              {/* 旧消息（无 segments）兼容：纯文本 + 工具调用列表 */}
                              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                  <Text style={{ color: '#f5f5f7', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                    {msg.content || t('agent.thinking')}
                                    {msg.status === 'running' && <span className="typing-dots"><i /><i /><i /></span>}
                                  </Text>
                                </div>
                              </div>
                              {msg.toolCalls && msg.toolCalls.length > 0 && (
                                <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 12 }}>
                                  {msg.toolCalls.map((tc, idx) => <ToolCallCard key={idx} tc={tc} />)}
                                </Space>
                              )}
                            </>
                          )}

                          {/* 时间戳 + 操作 */}
                          <div style={{ fontSize: 10, color: '#8e8e93', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {new Date(msg.timestamp).toLocaleTimeString()}
                            {msg.metadata?.executionTime && <span>⏱ {msg.metadata.executionTime}ms</span>}
                            {msg.metadata?.usage && !!(msg.metadata.usage.input + msg.metadata.usage.output) && (
                              <span style={{ color: '#6e6e73' }} title={t('agent.tokenUsageTip')}>↑{msg.metadata.usage.input} · ↓{msg.metadata.usage.output}</span>
                            )}
                            {msg.metadata?.route && msg.metadata.route !== 'execution' && (
                              <Tag color={ROUTE_META[msg.metadata.route]?.color || 'default'} style={{ fontSize: 10, margin: 0, borderRadius: 999 }}>
                                {ROUTE_META[msg.metadata.route]?.labelKey ? i18n.t(ROUTE_META[msg.metadata.route].labelKey) : msg.metadata.route}
                              </Tag>
                            )}
                            <span style={{ flex: 1 }} />
                            <Tooltip title={t('agent.copyReply')}>
                              <Button size="small" type="text" icon={<CopyOutlined />} style={{ color: '#8e8e93', padding: 0, width: 20, height: 20 }}
                                onClick={() => { navigator.clipboard.writeText(msg.content); message.success(t('agent.copied')) }} />
                            </Tooltip>
                          </div>
                        </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 输入区 */}
            <div className="agent-input" style={{ padding: 14, borderTop: '1px solid rgba(72,72,74,0.8)', background: 'rgba(28,28,30,0.85)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                <TextArea
                  ref={inputRef}
                  autoFocus
                  placeholder={modelConfig.apiKey && modelConfig.model ? t('agent.inputPlaceholder') : t('agent.needConfigPlaceholder')}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  disabled={loading || !modelConfig.apiKey || !modelConfig.model}
                  style={{ flex: 1, background: '#000000', border: '1px solid #48484a', color: '#f5f5f7', borderRadius: '8px 0 0 8px', resize: 'none' }} />
                {loading && (
                  <Tooltip title={t('agent.stopGenerating')}>
                    <Button icon={<CloseOutlined />} onClick={() => {
                      if (currentRequestIdRef.current) {
                        window.electronAPI.opsAgent.cancel(currentRequestIdRef.current)
                      }
                    }}
                      style={{ background: '#3a3a3c', borderColor: '#48484a', color: '#FF453A', borderRadius: 0, flexShrink: 0 }} />
                  </Tooltip>
                )}
                <Button type="primary" icon={loading ? <LoadingOutlined /> : <SendOutlined />} onClick={sendMessage}
                  disabled={loading || !inputText.trim() || !modelConfig.apiKey || !modelConfig.model}
                  style={{ background: 'linear-gradient(135deg, #0A84FF 0%, #0051D5 100%)', borderColor: 'transparent', borderRadius: '0 8px 8px 0', boxShadow: '0 2px 10px rgba(10,132,255,0.2)', flexShrink: 0, display: 'flex', alignItems: 'center' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, padding: '0 2px', gap: 8 }}>
                <Text style={{ fontSize: 10, color: '#8e8e93', flexShrink: 0 }}>{t('agent.enterToSend')}</Text>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                  {/* 会话级温度覆盖：仅影响当前会话，不写回全局配置 */}
                  <Select
                    size="small" variant="borderless"
                    value={sessionTemp === undefined ? 'global' : String(sessionTemp)}
                    onChange={v => setSessionTemp(v === 'global' ? undefined : Number(v))}
                    popupMatchSelectWidth={false}
                    style={{ minWidth: 92, fontSize: 10, color: sessionTemp === undefined ? '#8e8e93' : '#0A84FF', flexShrink: 0 }}
                    options={[
                      { value: 'global', label: t('agent.tempGlobal') },
                      ...[0.1, 0.3, 0.5, 0.7, 1.0, 1.5].map(v => ({ value: String(v), label: t('agent.tempValue', { v: v.toFixed(1) }) }))
                    ]}
                  />
                  {sessionTotalUsage.input + sessionTotalUsage.output > 0 && (
                    <span style={{ fontSize: 10, color: '#6e6e73', whiteSpace: 'nowrap', flexShrink: 0 }} title={t('agent.sessionUsageTip')}>
                      {t('agent.sessionUsage', { input: sessionTotalUsage.input, output: sessionTotalUsage.output })}
                    </span>
                  )}
                  {selectedServer && <Text style={{ fontSize: 10, color: '#30D158', flexShrink: 0 }} ellipsis><LinkOutlined style={{ marginRight: 3 }} />{t('agent.connectedTo', { name: servers.find(s => s.id === selectedServer)?.name })}</Text>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========== 模态框 ========== */}
        
        {/* 容器选择 */}
        <Modal title={<Space><LaptopOutlined style={{ color: '#0A84FF' }} /><span style={{ color: '#f5f5f7' }}>{t('agent.openContainerTerminal')}</span></Space>} open={openNewModal} 
          onOk={() => { if (selectedContainerId) { const c = containers.find(x => x.id === selectedContainerId); if (c) openNewTerminal(c.id, c.name, 'container') } setOpenNewModal(false) }} 
          onCancel={() => setOpenNewModal(false)} okButtonProps={{ disabled: !selectedContainerId }}
          styles={{ body: { background: '#1c1c1e' }, content: { background: '#1c1c1e', border: '1px solid #48484a' }, header: { background: '#1c1c1e', borderBottom: '1px solid #3a3a3c' } }}>
          <Select style={{ width: '100%' }} placeholder={t('agent.selectContainer')} value={selectedContainerId} onChange={setSelectedContainerId}
            options={containers.map(c => ({ value: c.id, label: <Space><span style={{ color: '#f5f5f7' }}>{c.name}</span><Tag color="blue" style={{ borderRadius: 999 }}>{c.image}</Tag><Tag color={c.status.includes('running') ? 'green' : 'default'} style={{ borderRadius: 999 }}>{c.status}</Tag></Space> }))} />
        </Modal>

        {/* 诊断报告 */}
        <Modal title={<Space><ScanOutlined style={{ color: '#0A84FF' }} /><span style={{ color: '#f5f5f7' }}>{t('agent.diagReportTitle')}</span></Space>} open={showDiagnostics} onCancel={() => setShowDiagnostics(false)} width={600}
          footer={<Button type="primary" icon={<ThunderboltFilled />} loading={runningDiagnostics} onClick={runAIAnalysis} style={{ background: 'linear-gradient(135deg, #0A84FF 0%, #0051D5 100%)', borderColor: 'transparent' }}>{t('agent.aiDeepAnalysis')}</Button>}
          styles={{ body: { background: '#1c1c1e' }, content: { background: '#1c1c1e', border: '1px solid #48484a' }, header: { background: '#1c1c1e', borderBottom: '1px solid #3a3a3c' } }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {diagnostics.map((d, i) => (
              <Card key={i} size="small" style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid #3a3a3c', borderRadius: 10 }}>
                <Space>
                  {d.status === 'healthy' && <CheckCircleOutlined style={{ color: '#30D158', fontSize: 16 }} />}
                  {d.status === 'warning' && <ExclamationCircleOutlined style={{ color: '#FF9500', fontSize: 16 }} />}
                  {d.status === 'critical' && <CloseCircleOutlined style={{ color: '#FF453A', fontSize: 16 }} />}
                  <div>
                    <Text strong style={{ color: '#f5f5f7', textTransform: 'capitalize' }}>{d.type}</Text>
                    {(d.type === 'cpu' || d.type === 'memory' || d.type === 'disk') && (
                      <Text style={{ color: '#0A84FF', fontSize: 13, fontWeight: 600 }}> {d.value}%</Text>
                    )}
                    <div><Text style={{ color: '#aeaeb2', fontSize: 12 }}>{d.message}</Text></div>
                    {d.suggestion && <div><Text style={{ color: '#FF9500', fontSize: 11 }}>💡 {d.suggestion}</Text></div>}
                  </div>
                </Space>
              </Card>
            ))}
          </Space>
        </Modal>

        {/* 命令历史 */}
        <Modal title={<Space><HistoryOutlined style={{ color: '#0A84FF' }} /><span style={{ color: '#f5f5f7' }}>{t('agent.commandHistory')}</span></Space>} open={showHistory} onCancel={() => setShowHistory(false)} footer={null} width={700}
          styles={{ body: { background: '#1c1c1e', maxHeight: 500, overflow: 'auto' }, content: { background: '#1c1c1e', border: '1px solid #48484a' }, header: { background: '#1c1c1e', borderBottom: '1px solid #3a3a3c' } }}>
          <List dataSource={commandHistory.slice(0, 50)} renderItem={item => (
            <List.Item style={{ borderBottom: '1px solid #3a3a3c', padding: '8px 0' }}>
              <div style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text code style={{ color: '#30D158', fontSize: 12, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 4, fontFamily: 'Consolas, monospace' }}>{item.command}</Text>
                  <Space size={8}>
                    {item.success ? <CheckCircleOutlined style={{ color: '#30D158' }} /> : <CloseCircleOutlined style={{ color: '#FF453A' }} />}
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.executionTime}ms</Text>
                  </Space>
                </Space>
                <div><Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.timestamp).toLocaleString()}</Text></div>
              </div>
            </List.Item>
          )} />
        </Modal>

        {/* 安全审批 */}
        <Modal title={<Space><SafetyOutlined style={{ color: '#FF9500' }} /><span style={{ color: '#f5f5f7' }}>{t('agent.safetyApproval')}</span>
          {approvalQueue.length > 1 && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>{t('agent.queueCount', { count: approvalQueue.length })}</Tag>}</Space>} 
          open={!!currentApproval} onCancel={() => handleApproval(false)} onOk={() => handleApproval(true)} 
          okText={t('agent.confirmExec')} cancelText={t('agent.cancel')} okButtonProps={{ danger: currentApproval?.riskLevel === 'high' }}
          styles={{ body: { background: '#1c1c1e' }, content: { background: '#1c1c1e', border: '1px solid #48484a' }, header: { background: '#1c1c1e', borderBottom: '1px solid #3a3a3c' } }}>
          {currentApproval && (
            <div>
              <Alert message={t('agent.riskLevel', { level: currentApproval.riskLevel === 'high' ? t('agent.riskHigh') : t('agent.riskMedium') })} 
                type={currentApproval.riskLevel === 'high' ? 'error' : 'warning'} showIcon style={{ marginBottom: 16, borderRadius: 8 }}
                action={<span style={{ color: approvalCountdown <= 10 ? '#FF453A' : '#aeaeb2', fontSize: 12, fontWeight: 600 }}>{approvalCountdown}s</span>} />
              <Text style={{ color: '#aeaeb2', fontSize: 11, display: 'block', marginBottom: 6 }}>{t('agent.execCommand')}</Text>
              <pre style={{ background: 'rgba(0,0,0,0.85)', padding: 12, borderRadius: 8, color: '#FF453A', border: '1px solid rgba(255,123,114,0.3)', fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>{currentApproval.action}</pre>
            </div>
          )}
        </Modal>

        {/* 会话重命名 */}
        <Modal title={<Space><EditOutlined style={{ color: '#0A84FF' }} /><span style={{ color: '#f5f5f7' }}>{t('agent.renameSessionTitle')}</span></Space>}
          open={!!renameTarget} onOk={renameSession} onCancel={() => setRenameTarget(null)}
          okText={t('agent.save')} cancelText={t('agent.cancel')}
          styles={{ body: { background: '#1c1c1e' }, content: { background: '#1c1c1e', border: '1px solid #48484a' }, header: { background: '#1c1c1e', borderBottom: '1px solid #3a3a3c' } }}>
          <Input value={renameName} onChange={e => setRenameName(e.target.value)} placeholder={t('agent.newSessionNamePlaceholder')}
            onPressEnter={renameSession} size="small" style={{ background: '#000000', border: '1px solid #48484a', color: '#f5f5f7' }} />
        </Modal>
      </div>
    </ConfigProvider>
  )
}

export default AgentTerminalPage

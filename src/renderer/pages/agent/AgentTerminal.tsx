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
  Slider,
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
  Collapse,
  Tabs as AntTabs,
  Switch,
  Drawer,
  InputNumber
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
  SaveOutlined,
  MessageOutlined,
  DeleteOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  CheckOutlined,
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
  BulbOutlined,
  FilterOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
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
  AIProvider,
  ProviderProfile,
  MessageSegment,
  ExecutedCommand,
  CommandHistoryItem,
  DiagnosticResult,
  ContainerOption,
  TerminalTab,
  ToolCallRecord
} from '../../agent/types'
import { DEFAULT_MODEL_CONFIG, PROVIDER_PRESETS } from '../../agent/types'
import type { Server } from '../../types/server'

const { Text, Title } = Typography
const { TextArea } = Input
const { Panel } = Collapse

// Storage keys
const CONFIG_KEY = 'agentOpsModelConfig'

// ==================== 工具函数 ====================

// Markdown简单渲染（优化版）
const renderMarkdown = (content: string): string => {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#0d1117;padding:12px;border-radius:6px;overflow:auto;border:1px solid #30363d;margin:8px 0;"><code style="color:#e6edf3;font-family:monospace;font-size:12px;">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:#21262d;padding:2px 6px;border-radius:4px;color:#e6edf3;font-family:monospace;font-size:12px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff;">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em style="color:#8b949e;">$1</em>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#fff;margin:12px 0 6px;font-size:14px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#fff;margin:16px 0 8px;font-size:16px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#fff;margin:20px 0 10px;font-size:18px;">$1</h1>')
    .replace(/^\- (.+)$/gm, '<li style="margin:4px 0 4px 16px;color:#e6edf3;">$1</li>')
    .replace(/\n/g, '<br/>')
}

// 获取风险等级颜色
const getRiskColor = (level: string) => {
  switch (level) {
    case 'high': return '#ff4d4f'
    case 'medium': return '#faad14'
    default: return '#52c41a'
  }
}

// 获取诊断状态颜色
const getDiagnosticColor = (status: string) => {
  switch (status) {
    case 'healthy': return '#52c41a'
    case 'warning': return '#faad14'
    case 'critical': return '#ff4d4f'
    default: return '#8c8c8c'
  }
}

// 提供商元数据（配置面板卡片展示用）
const PROVIDER_OPTIONS: Array<{ provider: AIProvider; name: string; color: string; desc: string }> = [
  { provider: 'openai', name: 'OpenAI', color: '#10a37f', desc: 'GPT 系列' },
  { provider: 'anthropic', name: 'Anthropic', color: '#d97757', desc: 'Claude 系列' },
  { provider: 'azure', name: 'Azure', color: '#0078d4', desc: 'Azure OpenAI' },
  { provider: 'gemini', name: 'Gemini', color: '#4285f4', desc: 'Google AI' },
  { provider: 'ollama', name: 'Ollama', color: '#58a6ff', desc: '本地模型' },
  { provider: 'custom', name: '自定义', color: '#d29922', desc: '兼容 API' }
]

// 工具调用卡片（分段渲染与历史列表复用）
const ToolCallCard: React.FC<{ tc: ToolCallRecord }> = ({ tc }) => {
  const isRunning = tc.status === 'running'
  const icon = isRunning ? <Spin size="small" /> : tc.status === 'success' ? <CheckCircleOutlined style={{ color: '#3fb950' }} /> : <CloseCircleOutlined style={{ color: '#ff7b72' }} />
  const tagColor = tc.status === 'success' ? 'green' : tc.status === 'error' ? 'red' : 'blue'
  const tagText = isRunning ? '执行中' : tc.status === 'success' ? '成功' : '失败'
  return (
    <div className="tool-card" style={{ background: 'rgba(13,17,23,0.8)', padding: 8, borderRadius: 8, border: '1px solid #21262d' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <CodeOutlined style={{ color: '#58a6ff' }} />
        <Text style={{ color: '#58a6ff', fontSize: 12, flex: 1, fontFamily: 'Consolas, monospace' }}>{tc.name}</Text>
        {tc.duration !== undefined && !isRunning && <Text type="secondary" style={{ fontSize: 11 }}>{tc.duration}ms</Text>}
        <Tag color={tagColor} style={{ fontSize: 10, margin: 0, borderRadius: 999 }}>{tagText}</Tag>
      </div>
      {!isRunning && (
        <pre style={{ margin: '8px 0 0 24px', maxHeight: 160, overflow: 'auto', fontSize: 11, color: '#8b949e', background: 'rgba(22,27,34,0.6)', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap', border: '1px solid #21262d' }}>
          {tc.result}
        </pre>
      )}
    </div>
  )
}

// 终端配色主题（参考 Netcatty 主题系统：可切换多套终端配色）
const TERMINAL_THEMES: Record<string, { name: string; theme: any }> = {
  'github-dark': {
    name: 'GitHub 暗色',
    theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#00d4aa', black: '#0d1117', red: '#ff7b72', green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39d2c0', white: '#e6edf3' }
  },
  dracula: {
    name: 'Dracula',
    theme: { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2' }
  },
  'solarized-dark': {
    name: 'Solarized 暗色',
    theme: { background: '#002b36', foreground: '#839496', cursor: '#00d4aa', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5' }
  }
}

// 兼容旧配置：无 providerProfiles 时从扁平字段生成默认档案（参考 Netcatty 多提供商管理）
function ensureProfiles(cfg: ModelConfig): ModelConfig {
  if (cfg.providerProfiles && cfg.providerProfiles.length > 0) return cfg
  const base: ProviderProfile = {
    id: 'profile-default',
    name: cfg.provider === 'openai' ? '默认配置' : cfg.provider,
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
  const [loadingModels, setLoadingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  // 会话重命名
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null)
  const [renameName, setRenameName] = useState('')

  // 消息持久化标记（onDone/清空时置位，由 effect 统一落盘）
  const [savePending, setSavePending] = useState(false)

  // 工作台左侧边栏（会话 + 服务器）折叠状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 配置抽屉分组导航 + 终端主题（参考 Netcatty 设置页分组式导航）
  const [configTab, setConfigTab] = useState<'connection' | 'runtime' | 'agent' | 'appearance'>('connection')
  const [terminalThemeId, setTerminalThemeId] = useState(() => localStorage.getItem('agentTerminalTheme') || 'github-dark')

  // Config state
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => {
    const saved = localStorage.getItem(CONFIG_KEY)
    const parsed = saved ? JSON.parse(saved) : DEFAULT_MODEL_CONFIG
    return ensureProfiles(parsed)
  })
  const [showConfig, setShowConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)

  // Terminal state
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([])
  const [activeTerminalTab, setActiveTerminalTab] = useState<string>('')
  const [openNewModal, setOpenNewModal] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | undefined>()
  const tabsRef = useRef<TerminalTab[]>(terminalTabs)
  const terminalContainersRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalInstancesRef = useRef<Map<string, Terminal>>(new Map())
  const fitAddonsRef = useRef<Map<string, FitAddon>>(new Map())

  // Terminal mode
  const [terminalMode, setTerminalMode] = useState<'server' | 'container'>('server')

  // Command history
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Diagnostics
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([])
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [runningDiagnostics, setRunningDiagnostics] = useState(false)

  // Approval handling
  const [approvalRequest, setApprovalRequest] = useState<any>(null)

  // 当前流式请求 ID（用于取消）
  const currentRequestIdRef = useRef<string | null>(null)

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

    // 审批请求监听（主进程 Mastra 工具触发）
    const removeApproval = window.electronAPI.opsAgent.onApprovalRequest((payload) => {
      setApprovalRequest(payload)
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
      message.error('加载容器失败')
    } finally {
      setLoadingContainers(false)
    }
  }, [])

  const handleServerChange = (serverId: string | undefined) => {
    if (!serverId) {
      setSelectedServer(undefined)
      setConnected(false)
      setContainers([])
      return
    }
    setSelectedServer(serverId)
    setConnected(true)
    setContainers([])
    loadContainers(serverId)
  }

  // ==================== 会话管理 ====================

  const createSession = async () => {
    const session: ChatSession = {
      id: `session-${Date.now()}`,
      name: `对话 ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await persistenceManager.saveSession(session)
    await loadSessions()
    setActiveSessionId(session.id)
    setMessages([])
  }

  const deleteSession = async (sessionId: string) => {
    await persistenceManager.deleteSession(sessionId)
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId)
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : undefined)
    }
    await loadSessions()
  }

  const renameSession = async () => {
    if (!renameTarget || !renameName.trim()) return
    await persistenceManager.saveSession({
      ...renameTarget,
      name: renameName.trim(),
      updatedAt: new Date().toISOString()
    })
    await loadSessions()
    setRenameTarget(null)
    message.success('会话已重命名')
  }

  useEffect(() => {
    if (activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId)
      setMessages(session?.messages || [])
    } else {
      setMessages([])
    }
  }, [activeSessionId, sessions])

  // 持久化当前会话（统一入口，避免在 setState updater 中做副作用）
  const persistSession = useCallback((msgs: ChatMessage[]) => {
    if (!activeSessionId) return
    persistenceManager.saveSession({
      id: activeSessionId,
      name: sessions.find(s => s.id === activeSessionId)?.name || `对话 ${new Date().toLocaleString()}`,
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
    message.success('对话已清空')
  }

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 AI 模型')
      setShowConfig(true)
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
      message.warning('请先配置 AI 模型')
      setShowConfig(true)
      return
    }

    setLoading(true)

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
    const removeChunk = window.electronAPI.opsAgent.onChunk(({ requestId: rid, delta }) => {
      if (rid !== requestId) return
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
    })

    const removeToolCall = window.electronAPI.opsAgent.onToolCall(({ requestId: rid, toolName, args, toolCallId }) => {
      if (rid !== requestId) return
      if (toolCallId) toolCallStartTimes.set(toolCallId, Date.now())
      segments.push({ type: 'tool', toolCall: { toolCallId, name: toolName, params: args, result: '执行中...', status: 'running' } })
      syncSegments()
    })

    const removeToolResult = window.electronAPI.opsAgent.onToolResult(({ requestId: rid, toolName, success, output, toolCallId }) => {
      if (rid !== requestId) return
      // 截断超长结果，避免渲染大段文本
      const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      const summary = raw.length > 2000 ? `${raw.slice(0, 2000)}\n... (已截断 ${raw.length - 2000} 字符)` : raw
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

    const removeError = window.electronAPI.opsAgent.onError(({ requestId: rid, error }) => {
      if (rid !== requestId) return
      const cancelled = error === 'cancelled'
      if (cancelled) {
        const last = segments[segments.length - 1]
        if (last && last.type === 'text') last.text += '\n\n> ⏹ 已取消生成'
        else segments.push({ type: 'text', text: '> ⏹ 已取消生成' })
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? cancelled
            ? { ...m, status: 'success' as const, content: m.content ? `${m.content}\n\n> ⏹ 已取消生成` : '已取消生成', segments: [...segments] }
            : { ...m, status: 'error', content: `错误: ${error}`, segments: [...segments] }
          : m
      ))
      setSavePending(true)
    })

    const removeDone = window.electronAPI.opsAgent.onDone(({ requestId: rid }) => {
      if (rid !== requestId) return
      // 完成：提取工具调用记录（兼容历史字段），持久化交给 savePending effect
      const toolCalls = segments.filter(s => s.type === 'tool').map(s => s.toolCall)
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, status: 'success' as const, segments: [...segments], toolCalls: toolCalls.length > 0 ? toolCalls : undefined }
          : m
      ))
      setSavePending(true)
      setLoading(false)
      cleanup()
    })

    const cleanup = () => {
      if (currentRequestIdRef.current === requestId) currentRequestIdRef.current = null
      toolCallStartTimes.clear()
      removeChunk()
      removeToolCall()
      removeToolResult()
      removeError()
      removeDone()
    }

    try {
      const result = await window.electronAPI.opsAgent.chat(requestId, {
        serverId: selectedServer,
        serverName: server?.name,
        userInput,
        threadId
      })
      if (!result.success) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, status: 'error', content: `错误: ${result.error}` } : m
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
            ? { ...m, status: 'success' as const, content: m.content ? `${m.content}\n\n> ⏹ 已取消生成` : '已取消生成' }
            : { ...m, status: 'error', content: `错误: ${errMsg}` }
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
      message.warning('请先选择服务器')
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
      message.info('请先在终端中选中文本')
      return
    }
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 AI 模型')
      setShowConfig(true)
      return
    }
    doSendMessage(`请分析下面这段终端输出，说明它的含义、关键信息，以及是否需要处理：\n\`\`\`\n${sel.slice(0, 3000)}\n\`\`\``)
  }

  // 在终端中执行命令
  const executeCommandInTerminal = async (command: string) => {
    if (!selectedServer) {
      message.warning('请先选择服务器')
      return
    }
    if (!activeTerminalTab) {
      message.warning('请先打开终端')
      return
    }
    try {
      // 确保终端处于活动状态
      setActiveTerminalTab(activeTerminalTab)
      // 发送命令到终端（添加换行符执行）
      await window.electronAPI.terminal.write(activeTerminalTab, command + '\n')
      message.success('命令已发送到终端')
    } catch (error) {
      message.error(`发送失败: ${(error as Error).message}`)
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
            if (value > 90) { status = 'critical'; diagMessage = 'CPU使用率过高'; suggestion = '建议检查高负载进程' }
            else if (value > 70) { status = 'warning'; diagMessage = 'CPU使用率较高' }
            else diagMessage = 'CPU使用率正常'
            break
          case 'memory':
            if (value > 90) { status = 'critical'; diagMessage = '内存使用率过高'; suggestion = '建议释放内存或增加内存' }
            else if (value > 70) { status = 'warning'; diagMessage = '内存使用率较高' }
            else diagMessage = '内存使用率正常'
            break
          case 'disk':
            if (value > 90) { status = 'critical'; diagMessage = '磁盘空间不足'; suggestion = '建议清理磁盘空间' }
            else if (value > 70) { status = 'warning'; diagMessage = '磁盘空间较少' }
            else diagMessage = '磁盘空间充足'
            break
          case 'docker':
            diagMessage = `运行 ${value} 个容器`
            break
          default:
            break
        }
        return { type: diag.type, status, value, message: diagMessage, suggestion, timestamp: new Date().toISOString() }
      } catch {
        return { type: diag.type, status: 'critical', value: 0, message: '诊断失败', timestamp: new Date().toISOString() }
      }
    }))
    return results
  }

  const runDiagnostics = async () => {
    if (!selectedServer) {
      message.warning('请先选择服务器')
      return
    }

    setRunningDiagnostics(true)
    try {
      const results = await collectDiagnostics(selectedServer)
      setDiagnostics(results)
      setShowDiagnostics(true)
    } catch {
      message.error('诊断失败')
    } finally {
      setRunningDiagnostics(false)
    }
  }

  // 智能诊断闭环：诊断 → AI分析 → 工具修复 → 验证
  const runIntelligentDiagnosis = async () => {
    if (!selectedServer) {
      message.warning('请先选择服务器')
      return
    }
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 AI 模型')
      setShowConfig(true)
      return
    }
    if (loading) return

    setRunningDiagnostics(true)
    try {
      const results = await collectDiagnostics(selectedServer)
      setDiagnostics(results)
      setShowDiagnostics(true)

      const diagText = results.map(d =>
        `[${d.type}] ${d.status}: ${d.message}${d.suggestion ? ` (建议: ${d.suggestion})` : ''}`
      ).join('\n')

      await doSendMessage(
        `请针对当前服务器执行一次智能诊断分析并给出处理方案。\n\n检测结果如下：\n${diagText}\n\n请使用工具进行深入检查（如查看容器状态、日志、资源占用等），定位问题根因并给出可执行的修复步骤。高风险操作需要经过我的确认。`
      )
    } catch {
      message.error('智能诊断失败')
    } finally {
      setRunningDiagnostics(false)
    }
  }

  // ==================== 配置管理 ====================

  // 当前激活档案（扁平字段为激活档案的镜像）
  const profiles = modelConfig.providerProfiles || []
  const activeProfile = profiles.find(p => p.id === modelConfig.activeProfileId) || profiles[0]

  // 切换激活档案（同步扁平字段，供 chat / setConfig 使用）
  const activateProfile = (id: string) => {
    const p = profiles.find(x => x.id === id)
    if (!p) return
    setModelConfig({
      ...modelConfig,
      activeProfileId: id,
      provider: p.provider, apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl,
      azureEndpoint: p.azureEndpoint, azureDeployment: p.azureDeployment
    })
  }

  // 更新激活档案（同时镜像到扁平字段）
  const updateProfile = (patch: Partial<ProviderProfile>) => {
    setModelConfig(prev => {
      const prevProfiles = prev.providerProfiles || []
      const updated = prevProfiles.map(p => p.id === prev.activeProfileId ? { ...p, ...patch } : p)
      const next: ModelConfig = { ...prev, providerProfiles: updated }
      if (patch.provider !== undefined) next.provider = patch.provider
      if (patch.apiKey !== undefined) next.apiKey = patch.apiKey
      if (patch.model !== undefined) next.model = patch.model
      if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl
      if (patch.azureEndpoint !== undefined) next.azureEndpoint = patch.azureEndpoint
      if (patch.azureDeployment !== undefined) next.azureDeployment = patch.azureDeployment
      return next
    })
  }

  // 新增提供商档案（参考 Netcatty 多提供商 addProvider）
  const addProfile = () => {
    const profile: ProviderProfile = {
      id: `profile-${Date.now()}`,
      name: `配置 ${(modelConfig.providerProfiles || []).length + 1}`,
      provider: 'openai',
      apiKey: '',
      model: '',
      baseUrl: 'https://api.openai.com/v1'
    }
    setModelConfig(prev => ({
      ...prev,
      providerProfiles: [...(prev.providerProfiles || []), profile],
      activeProfileId: profile.id,
      provider: 'openai', apiKey: '', model: '', baseUrl: profile.baseUrl
    }))
  }

  // 删除提供商档案（至少保留一个）
  const removeProfile = (id: string) => {
    setModelConfig(prev => {
      const prevProfiles = prev.providerProfiles || []
      if (prevProfiles.length <= 1) {
        message.warning('至少保留一个配置')
        return prev
      }
      const updated = prevProfiles.filter(p => p.id !== id)
      const activeId = prev.activeProfileId === id ? updated[0].id : prev.activeProfileId
      const active = updated.find(p => p.id === activeId) || updated[0]
      return {
        ...prev,
        providerProfiles: updated,
        activeProfileId: active.id,
        provider: active.provider, apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl,
        azureEndpoint: active.azureEndpoint, azureDeployment: active.azureDeployment
      }
    })
  }

  const saveConfig = async () => {
    if (!modelConfig.apiKey) {
      message.warning('请输入 API Key')
      return
    }
    // API Key 用系统安全存储加密后落盘（enc: 前缀标记密文）；所有档案的 Key 一并加密
    const enc = await window.electronAPI.secure.encrypt(modelConfig.apiKey)
    const storedKey = enc.success ? `enc:${enc.data}` : modelConfig.apiKey
    let profiles = modelConfig.providerProfiles || []
    if (enc.success) {
      profiles = await Promise.all((modelConfig.providerProfiles || []).map(async p => {
        const e = await window.electronAPI.secure.encrypt(p.apiKey)
        return { ...p, apiKey: e.success ? `enc:${e.data}` : p.apiKey }
      }))
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...modelConfig, apiKey: storedKey, providerProfiles: profiles }))
    window.electronAPI.opsAgent.setConfig(modelConfig)
    setConfigSaved(true)
    message.success('配置已保存')
    setTimeout(() => setConfigSaved(false), 2000)
  }

  // 设置搜索：根据关键词自动跳转到对应配置分组（参考 Netcatty 设置搜索）
  const handleConfigSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value.trim().toLowerCase()
    if (!q) return
    const map: Array<[RegExp, 'connection' | 'runtime' | 'agent' | 'appearance']> = [
      [/api|key|模型|提供商|url|endpoint|deployment|连接/, 'connection'],
      [/温度|token|运行|参数|迭代/, 'runtime'],
      [/提示词|超时|黑名单|审批|快捷|消息|命令/, 'agent'],
      [/主题|外观|配色|颜色/, 'appearance']
    ]
    for (const [re, tab] of map) {
      if (re.test(q)) { setConfigTab(tab); return }
    }
  }

  // 获取可用模型列表
  const loadModels = async () => {
    if (!modelConfig.apiKey && modelConfig.provider !== 'ollama') {
      message.warning('请先配置 API Key')
      return
    }
    setLoadingModels(true)
    try {
      const result = await window.electronAPI.ai.getModels(
        modelConfig.provider,
        modelConfig.apiKey,
        modelConfig.baseUrl || undefined
      )
      if (result.success && result.data) {
        const models = result.data.map((m: any) => m.id || m.name)
        setAvailableModels(models)
        if (models.length > 0) {
          message.success(`获取到 ${models.length} 个模型`)
        } else {
          message.info('未获取到模型列表，请手动输入')
        }
      } else {
        message.warning(result.error || '获取模型失败')
      }
    } catch (error) {
      message.error(`获取模型失败: ${(error as Error).message}`)
    } finally {
      setLoadingModels(false)
    }
  }

  const testConnection = async () => {
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 API Key 和模型')
      return
    }
    setTestingConnection(true)
    try {
      const requestId = `ops-test-${Date.now()}`
      const result = await window.electronAPI.opsAgent.chat(requestId, {
        serverId: selectedServer,
        userInput: '你好，请确认连接正常。',
        threadId: `thread-test-${Date.now()}`
      })
      if (!result.success) {
        throw new Error(result.error || '连接失败')
      }
      // 等待流结束（带超时保护，避免 loading 卡死）
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          removeDone()
          removeError()
          reject(new Error('连接测试超时'))
        }, 30000)
        const removeError = window.electronAPI.opsAgent.onError(({ requestId: rid, error }) => {
          if (rid !== requestId) return
          clearTimeout(timeout)
          removeDone()
          removeError()
          reject(new Error(error === 'cancelled' ? '已取消' : error))
        })
        const removeDone = window.electronAPI.opsAgent.onDone(({ requestId: rid }) => {
          if (rid !== requestId) return
          clearTimeout(timeout)
          removeDone()
          removeError()
          resolve()
        })
      })
      message.success('连接测试成功！')
    } catch (error) {
      message.error(`连接失败: ${(error as Error).message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  // ==================== 审批处理 ====================

  const handleApproval = (approved: boolean) => {
    if (approvalRequest?.id) {
      window.electronAPI.opsAgent.approval(approvalRequest.id, approved)
    }
    setApprovalRequest(null)
  }

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
        message.success('终端已打开')
      } else {
        message.error(result.message || '打开终端失败')
      }
    } catch (error) {
      message.error(`错误: ${(error as Error).message}`)
    }
  }

  const closeTerminalTab = async (sessionId: string) => {
    try { await window.electronAPI.terminal.close(sessionId) } catch { /* ignore */ }
    setTerminalTabs(prev => {
      const newTabs = prev.filter(t => t.sessionId !== sessionId)
      terminalContainersRef.current.delete(sessionId)
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
        fitAddon.fit()

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

  // 终端数据处理器
  useEffect(() => {
    const removeDataListener = window.electronAPI.terminal.onData((sessionId, data) => {
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
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#00d4aa' } }}>
      <div className="agent-terminal-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', overflow: 'hidden' }}>
        
        {/* ========== 顶部状态栏 ========== */}
        <div className="agent-terminal-header" style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: '10px 20px', borderBottom: '1px solid #30363d' 
        }}>
          <Space size="large">
            <Space>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, rgba(0,212,170,0.18), rgba(88,166,255,0.18))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,212,170,0.35)', boxShadow: '0 0 18px rgba(0,212,170,0.15)' }}>
                <RobotOutlined style={{ fontSize: 18, color: '#00d4aa' }} />
              </div>
              <div>
                <Title level={4} className="agent-terminal-brand" style={{ margin: 0, fontSize: 17, lineHeight: 1.2, fontFamily: 'inherit' }}>
                  AI OPS TERMINAL
                </Title>
                <Text style={{ fontSize: 10, color: '#6e7681', letterSpacing: 0.8 }}>Mastra Agent Console</Text>
              </div>
            </Space>
            <Divider type="vertical" style={{ background: '#30363d', height: 28 }} />
            <Space size="small">
              <CloudOutlined style={{ color: '#8b949e' }} />
              <Select value={selectedServer} onChange={handleServerChange} style={{ minWidth: 180 }} 
                placeholder="选择服务器" allowClear size="small"
                options={servers.map(s => ({ 
                  value: s.id, 
                  label: <Space>
                    <Badge status={s.status === 'online' ? 'success' : 'default'} />
                    <span style={{ color: '#e6edf3' }}>{s.name}</span>
                    <Text type="secondary">({s.host})</Text>
                  </Space> 
                }))} />
              {connected && <Tag color="success" icon={<LinkOutlined />} style={{ border: '1px solid rgba(63,185,80,0.4)', background: 'rgba(63,185,80,0.1)' }}>已连接</Tag>}
            </Space>
          </Space>
          
          <Space size="middle">
            {/* 统计信息 */}
            <Space size={6} style={{ padding: '4px 12px', background: 'rgba(33,38,45,0.8)', borderRadius: 999, border: '1px solid #21262d' }}>
              <DashboardOutlined style={{ color: '#00d4aa', fontSize: 11 }} />
              <Text style={{ color: '#8b949e', fontSize: 11 }}>
                <Text strong style={{ color: '#e6edf3', fontSize: 11 }}>{stats.totalCommands}</Text> 命令
                <span style={{ margin: '0 6px', color: '#30363d' }}>|</span>
                <Text strong style={{ color: stats.successRate >= 90 ? '#3fb950' : stats.successRate >= 60 ? '#d29922' : '#ff7b72', fontSize: 11 }}>{stats.successRate}%</Text> 成功
              </Text>
            </Space>
            
            <Tag color={modelConfig.apiKey && modelConfig.model ? 'success' : 'default'} icon={<ApiOutlined />} style={{ border: '1px solid rgba(63,185,80,0.35)', background: 'rgba(63,185,80,0.08)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {modelConfig.model || '未配置'}
            </Tag>
            <Tooltip title="配置"><Button size="small" icon={<SettingOutlined />} type={showConfig ? 'primary' : 'default'} onClick={() => setShowConfig(!showConfig)} style={showConfig ? { background: '#00d4aa', borderColor: '#00d4aa' } : {}} /></Tooltip>
            <Tooltip title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}>
              <Button size="small" icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
            </Tooltip>
          </Space>
        </div>

        {/* ========== 配置面板（右侧抽屉） ========== */}
        <Drawer
          title={
            <Space>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, rgba(88,166,255,0.16), rgba(0,212,170,0.16))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(88,166,255,0.3)' }}>
                <SettingOutlined style={{ color: '#58a6ff', fontSize: 13 }} />
              </div>
              <Text strong style={{ color: '#e6edf3', fontSize: 13, letterSpacing: 0.5 }}>模型配置</Text>
              <Tag style={{ margin: 0, fontSize: 10, background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', color: '#00d4aa', borderRadius: 999, padding: '0 8px' }}>Mastra Agent</Tag>
              {modelConfig.apiKey && modelConfig.model && (
                <Tag icon={<CheckCircleOutlined />} style={{ border: '1px solid rgba(63,185,80,0.4)', background: 'rgba(63,185,80,0.08)', color: '#3fb950', borderRadius: 999, fontSize: 11 }}>
                  已配置 · {modelConfig.model}
                </Tag>
              )}
            </Space>
          }
          placement="right"
          width={580}
          open={showConfig}
          onClose={() => setShowConfig(false)}
          styles={{
            body: { background: '#0d1117', padding: 16, overflow: 'auto' },
            header: { background: '#161b22', borderBottom: '1px solid #21262d' },
            footer: { background: '#161b22', borderTop: '1px solid #21262d' }
          }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={8}>
                <Button size="small" icon={<ThunderboltOutlined />} loading={testingConnection} onClick={testConnection}
                  style={{ borderColor: '#30363d', color: '#58a6ff', borderRadius: 6 }}>测试连接</Button>
                <Button size="small" type="primary" icon={<SaveOutlined />} onClick={saveConfig}
                  style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00a896 100%)', borderColor: 'transparent', borderRadius: 6, boxShadow: '0 2px 10px rgba(0,212,170,0.3)' }}>保存配置</Button>
              </Space>
              <Text style={{ fontSize: 10, color: '#484f58' }}>
                {modelConfig.provider === 'ollama' ? 'Ollama 本地模型无需 API Key' : '配置将同步至 Mastra Agent'}
              </Text>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
            {/* 设置搜索（参考 Netcatty Ctrl+F 设置搜索） */}
            <Input prefix={<SearchOutlined />} placeholder="搜索设置… 如：API / 超时 / 主题" size="small" allowClear
              onChange={handleConfigSearch} style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }} />
            <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
            {/* 左侧分组导航（参考 Netcatty SettingsPage 垂直 TabsList） */}
            <div style={{ width: 122, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid rgba(33,38,45,0.9)', paddingRight: 8 }}>
              {[
                { key: 'connection', label: '连接', icon: <ApiOutlined /> },
                { key: 'runtime', label: '运行参数', icon: <ThunderboltOutlined /> },
                { key: 'agent', label: 'Agent 行为', icon: <RobotOutlined /> },
                { key: 'appearance', label: '外观', icon: <BulbOutlined /> }
              ].map(item => (
                <div key={item.key} className={`agent-config-nav ${configTab === item.key ? 'active' : ''}`} onClick={() => setConfigTab(item.key as any)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* 右侧分组内容 */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            {configTab === 'connection' && (
            <div style={{ display: 'flex', gap: 12 }}>
              {/* 提供商档案列表（参考 Netcatty 多提供商管理） */}
              <div style={{ width: 128, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(modelConfig.providerProfiles || []).map(p => {
                  const meta = PROVIDER_OPTIONS.find(x => x.provider === p.provider)
                  const isActive = modelConfig.activeProfileId === p.id
                  return (
                    <div key={p.id} className={`provider-chip ${isActive ? 'active' : ''}`} onClick={() => activateProfile(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, cursor: 'pointer' }}>
                      <span className="provider-dot" style={{ background: meta?.color || '#58a6ff', color: meta?.color || '#58a6ff' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: isActive ? '#e6edf3' : '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: '#6e7681', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.model || meta?.name || p.provider}</div>
                      </div>
                      {isActive && <CheckCircleOutlined style={{ color: '#00d4aa', fontSize: 11, flexShrink: 0 }} />}
                      {(modelConfig.providerProfiles || []).length > 1 && (
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除配置"
                          style={{ padding: 0, width: 16, height: 16, fontSize: 10, flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); removeProfile(p.id) }} />
                      )}
                    </div>
                  )
                })}
                <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addProfile}
                  style={{ borderRadius: 8, borderColor: '#21262d', color: '#00d4aa', fontSize: 11 }}>添加配置</Button>
              </div>

              {/* 激活档案表单 */}
              <div className="config-card" style={{ flex: 1, minWidth: 0 }}>
                <div className="config-card-title"><ApiOutlined style={{ color: '#58a6ff' }} />{activeProfile?.name || '模型连接'}</div>

                {/* 档案名称 */}
                <span className="field-label">配置名称</span>
                <Input value={activeProfile?.name || ''} onChange={e => updateProfile({ name: e.target.value })}
                  size="small" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />

                {/* 提供商选择 */}
                <span className="field-label" style={{ marginTop: 10 }}>提供商</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12, marginTop: 6 }}>
                  {PROVIDER_OPTIONS.map(p => (
                    <div key={p.provider} className={`provider-chip ${modelConfig.provider === p.provider ? 'active' : ''}`}
                      onClick={() => {
                        const preset = PROVIDER_PRESETS.find(x => x.provider === p.provider)
                        // 切换提供商时保留已填写的 API Key，仅重置模型与 Base URL
                        updateProfile({ provider: p.provider, model: '', baseUrl: preset?.baseUrl || '' })
                      }}>
                      <span className="provider-dot" style={{ background: p.color, color: p.color }} />
                      <div style={{ lineHeight: 1.25 }}>
                        <div style={{ fontSize: 12, color: modelConfig.provider === p.provider ? '#e6edf3' : '#8b949e', fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: '#6e7681' }}>{p.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* API Key */}
                <span className="field-label">API Key {modelConfig.provider === 'ollama' && <Text style={{ fontSize: 10, color: '#6e7681', textTransform: 'none' }}>(可选)</Text>}</span>
                <Input.Password value={modelConfig.apiKey} onChange={e => updateProfile({ apiKey: e.target.value })}
                  placeholder={modelConfig.provider === 'anthropic' ? 'sk-ant-...' : modelConfig.provider === 'ollama' ? '本地模型不需要' : 'sk-...'}
                  size="small" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />

                {/* Base URL（custom / ollama） */}
                {(modelConfig.provider === 'custom' || modelConfig.provider === 'ollama') && (
                  <>
                    <span className="field-label" style={{ marginTop: 10 }}>Base URL</span>
                    <Input value={modelConfig.baseUrl} onChange={e => updateProfile({ baseUrl: e.target.value })}
                      placeholder={modelConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} size="small"
                      style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />
                  </>
                )}

                {/* Azure 特殊字段 */}
                {modelConfig.provider === 'azure' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div>
                      <span className="field-label">Endpoint</span>
                      <Input value={modelConfig.azureEndpoint || ''} onChange={e => updateProfile({ azureEndpoint: e.target.value })}
                        placeholder="https://xxx.openai.azure.com" size="small" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />
                    </div>
                    <div>
                      <span className="field-label">Deployment</span>
                      <Input value={modelConfig.azureDeployment || ''} onChange={e => updateProfile({ azureDeployment: e.target.value })}
                        placeholder="gpt-4o" size="small" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />
                    </div>
                  </div>
                )}

                {/* 模型选择 */}
                <span className="field-label" style={{ marginTop: 10 }}>模型</span>
                <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                  <Select value={modelConfig.model} onChange={v => updateProfile({ model: v })}
                    style={{ flex: 1 }} size="small" placeholder="选择或输入模型"
                    showSearch
                    options={[
                      ...(PROVIDER_PRESETS.find(p => p.provider === modelConfig.provider)?.models || []).map(m => ({ value: m, label: m })),
                      ...availableModels.filter(m => !(PROVIDER_PRESETS.find(p => p.provider === modelConfig.provider)?.models || []).includes(m)).map(m => ({ value: m, label: `${m} (已获取)` }))
                    ]}
                    dropdownRender={menu => (
                      <>
                        {menu}
                        <Divider style={{ margin: '4px 0' }} />
                        <div style={{ padding: '4px 8px', fontSize: 11, color: '#8b949e' }}>
                          {modelConfig.provider === 'ollama' ? '提示：先安装 Ollama 并运行模型，然后点击刷新按钮获取' : '提示：点击刷新按钮获取模型列表，或手动输入'}
                        </div>
                      </>
                    )}
                  />
                  <Button size="small" icon={<ReloadOutlined />} loading={loadingModels} onClick={loadModels} title="获取模型列表"
                    style={{ background: '#21262d', borderColor: '#30363d', color: '#58a6ff' }} />
                </Space.Compact>
              </div>
            </div>

            )}
            {configTab === 'runtime' && (
            <div className="config-card">
              <div className="config-card-title"><ThunderboltOutlined style={{ color: '#00d4aa' }} />运行参数</div>

              {/* 温度 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span className="field-label" style={{ margin: 0 }}>温度</span>
                <Text strong style={{ color: '#00d4aa', fontSize: 12 }}>{modelConfig.temperature.toFixed(1)}</Text>
              </div>
              <Slider value={modelConfig.temperature} onChange={v => setModelConfig({ ...modelConfig, temperature: v })} min={0} max={1} step={0.1} tooltip={{ open: false }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -8, marginBottom: 14 }}>
                <Text style={{ fontSize: 10, color: '#484f58' }}>保守</Text>
                <Text style={{ fontSize: 10, color: '#484f58' }}>创意</Text>
              </div>

              {/* 最大 Token */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span className="field-label" style={{ margin: 0 }}>最大 Token</span>
                <Text strong style={{ color: '#58a6ff', fontSize: 12 }}>{modelConfig.maxTokens}</Text>
              </div>
              <Slider value={modelConfig.maxTokens} onChange={v => setModelConfig({ ...modelConfig, maxTokens: v })} min={100} max={8000} step={100} tooltip={{ open: false }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -8, marginBottom: 16 }}>
                <Text style={{ fontSize: 10, color: '#484f58' }}>100</Text>
                <Text style={{ fontSize: 10, color: '#484f58' }}>8000</Text>
              </div>
            </div>
            )}
            {configTab === 'agent' && (
            <div className="config-card">
              <div className="config-card-title"><RobotOutlined style={{ color: '#bc8cff' }} />Agent 行为</div>

              {/* 系统提示词 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="field-label" style={{ margin: 0 }}>系统提示词</span>
                <Button size="small" type="text" icon={editingPrompt ? <CheckOutlined /> : <EditOutlined />} onClick={() => setEditingPrompt(!editingPrompt)} style={{ color: '#8b949e', padding: 0, height: 20, fontSize: 11 }}>
                  {editingPrompt ? '完成' : '编辑'}
                </Button>
              </div>
              {editingPrompt ? (
                <TextArea value={modelConfig.systemPrompt} onChange={e => setModelConfig({ ...modelConfig, systemPrompt: e.target.value })} rows={4} size="small"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />
              ) : (
                <div style={{ background: 'rgba(13,17,23,0.6)', border: '1px solid #21262d', borderRadius: 8, padding: 10, fontSize: 11, color: '#8b949e', lineHeight: 1.6, maxHeight: 84, overflow: 'hidden' }}>
                  {modelConfig.systemPrompt || '未设置系统提示词，点击"编辑"进行配置'}
                </div>
              )}

              {/* 命令超时（参考 Netcatty AI 设置的 commandTimeout） */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Text style={{ color: '#e6edf3', fontSize: 12 }}>命令超时</Text>
                  <Text style={{ color: '#6e7681', fontSize: 10, display: 'block' }}>AI 执行远程命令的最长等待时间</Text>
                </div>
                <InputNumber value={modelConfig.commandTimeout} onChange={v => setModelConfig({ ...modelConfig, commandTimeout: (v as number) || 30000 })}
                  min={5000} max={120000} step={5000} size="small" style={{ width: 110, background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }} />
                <Text style={{ fontSize: 10, color: '#484f58', marginLeft: 4, flexShrink: 0 }}>ms</Text>
              </div>

              {/* 最大迭代步骤（参考 Netcatty AI 设置的 maxIterations） */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Text style={{ color: '#e6edf3', fontSize: 12 }}>最大迭代步骤</Text>
                  <Text style={{ color: '#6e7681', fontSize: 10, display: 'block' }}>一次任务中最多连续工具调用步数</Text>
                </div>
                <InputNumber value={modelConfig.maxIterations} onChange={v => setModelConfig({ ...modelConfig, maxIterations: (v as number) || 15 })}
                  min={1} max={50} size="small" style={{ width: 80, background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }} />
                <Text style={{ fontSize: 10, color: '#484f58', marginLeft: 4, flexShrink: 0 }}>步</Text>
              </div>

              {/* 自动批准高危操作（参考 Netcatty globalPermissionMode） */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Text style={{ color: '#e6edf3', fontSize: 12 }}>自动批准高危操作</Text>
                  <Text style={{ color: '#6e7681', fontSize: 10, display: 'block' }}>开启后高危命令无需人工确认（谨慎使用）</Text>
                </div>
                <Switch size="small" checked={modelConfig.approvalMode === 'auto'}
                  onChange={v => setModelConfig({ ...modelConfig, approvalMode: v ? 'auto' : 'manual' })} />
              </div>

              {/* Web 搜索（参考 Netcatty webSearchConfig） */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Text style={{ color: '#e6edf3', fontSize: 12 }}>Web 搜索</Text>
                  <Text style={{ color: '#6e7681', fontSize: 10, display: 'block' }}>AI 可联网查询报错信息与命令用法</Text>
                </div>
                <Switch size="small" checked={modelConfig.enableWebSearch}
                  onChange={v => setModelConfig({ ...modelConfig, enableWebSearch: v })} />
              </div>

              {/* 命令黑名单（参考 Netcatty commandBlocklist） */}
              <div style={{ marginTop: 16 }}>
                <Text style={{ color: '#e6edf3', fontSize: 12 }}>命令黑名单</Text>
                <Text style={{ color: '#6e7681', fontSize: 10, display: 'block', marginBottom: 6 }}>命中子串的命令将被直接拒绝执行，回车添加</Text>
                <Select mode="tags" value={modelConfig.commandBlocklist} onChange={v => setModelConfig({ ...modelConfig, commandBlocklist: v })}
                  placeholder="如：rm -rf /" size="small" tokenSeparators={[',']} style={{ width: '100%' }} />
              </div>

              {/* 快捷消息（参考 Netcatty quickMessages） */}
              <div style={{ marginTop: 16 }}>
                <Text style={{ color: '#e6edf3', fontSize: 12 }}>快捷消息</Text>
                <Text style={{ color: '#6e7681', fontSize: 10, display: 'block', marginBottom: 6 }}>空状态页显示的快捷命令，回车添加</Text>
                <Select mode="tags" value={modelConfig.quickMessages} onChange={v => setModelConfig({ ...modelConfig, quickMessages: v })}
                  placeholder="输入快捷命令文案" size="small" tokenSeparators={[',']} style={{ width: '100%' }} />
              </div>
            </div>
            )}
            {configTab === 'appearance' && (
            <div className="config-card">
              <div className="config-card-title"><BulbOutlined style={{ color: '#d29922' }} />外观</div>

              {/* 终端主题（参考 Netcatty ThemeList） */}
              <span className="field-label">终端主题</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {Object.entries(TERMINAL_THEMES).map(([id, t]) => (
                  <div key={id} className={`provider-chip ${terminalThemeId === id ? 'active' : ''}`}
                    onClick={() => { setTerminalThemeId(id); localStorage.setItem('agentTerminalTheme', id) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}>
                    <span style={{ width: 28, height: 18, borderRadius: 4, background: `linear-gradient(135deg, ${t.theme.background} 0%, ${t.theme.blue} 100%)`, border: '1px solid #30363d', flexShrink: 0 }} />
                    <Text style={{ color: terminalThemeId === id ? '#e6edf3' : '#8b949e', fontSize: 12 }}>{t.name}</Text>
                    {terminalThemeId === id && <CheckCircleOutlined style={{ color: '#00d4aa', marginLeft: 'auto' }} />}
                  </div>
                ))}
              </div>
              <Text style={{ color: '#484f58', fontSize: 10, display: 'block', marginTop: 8 }}>主题对新打开的终端会话生效</Text>
            </div>
            )}
            </div>
            </div>
          </div>
        </Drawer>

        {/* ========== 主内容区 ========== */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

          {/* ========== 左侧：会话 / 服务器 边栏（工作台风格） ========== */}
          {!sidebarCollapsed && (
            <div className="agent-sidebar" style={{ width: 236, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(48,54,61,0.7)', background: 'rgba(13,17,23,0.55)', minHeight: 0 }}>
              {/* 会话列表 */}
              <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1.2 }}>对话 ({sessions.length})</Text>
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={createSession} title="新建对话" style={{ color: '#00d4aa', padding: 0, width: 22, height: 22 }} />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 8px' }}>
                {sessions.map(s => (
                  <div key={s.id} className={`agent-sidebar-item ${activeSessionId === s.id ? 'active' : ''}`} onClick={() => setActiveSessionId(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer' }}>
                    <MessageOutlined style={{ color: activeSessionId === s.id ? '#00d4aa' : '#6e7681', fontSize: 12, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: activeSessionId === s.id ? '#e6edf3' : '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: '#484f58' }}>{s.messages.length} 条消息</div>
                    </div>
                    <Space size={2} className="agent-sidebar-actions">
                      <Button size="small" type="text" icon={<EditOutlined />} title="重命名" style={{ color: '#8b949e', padding: 0, width: 20, height: 20 }}
                        onClick={(e) => { e.stopPropagation(); setRenameTarget(s); setRenameName(s.name) }} />
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除" style={{ padding: 0, width: 20, height: 20 }}
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }} />
                    </Space>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <Text style={{ fontSize: 11, color: '#484f58' }}>暂无会话，点击 + 新建</Text>
                  </div>
                )}
              </div>

              {/* 服务器列表 */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(48,54,61,0.6)' }}>
                <Text style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1.2 }}>服务器</Text>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {servers.map(s => (
                    <div key={s.id} className={`agent-sidebar-item ${selectedServer === s.id ? 'active' : ''}`} onClick={() => handleServerChange(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.status === 'online' ? '#3fb950' : '#484f58', flexShrink: 0, boxShadow: s.status === 'online' ? '0 0 5px rgba(63,185,80,0.6)' : 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: selectedServer === s.id ? '#e6edf3' : '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: '#484f58', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.host}</div>
                      </div>
                      {selectedServer === s.id && <LinkOutlined style={{ color: '#00d4aa', fontSize: 11 }} />}
                    </div>
                  ))}
                  {servers.length === 0 && <Text style={{ fontSize: 11, color: '#484f58', padding: '4px 8px' }}>暂无在线服务器</Text>}
                </div>
              </div>
            </div>
          )}

          {/* ========== 左侧：终端面板 ========== */}
          <div style={{ flex: '1 1 55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(48,54,61,0.7)', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'rgba(22,27,34,0.7)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #30363d' }}>
              <Space>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,212,170,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,212,170,0.25)' }}>
                  <LaptopOutlined style={{ color: '#00d4aa', fontSize: 13 }} />
                </div>
                <Text strong style={{ color: '#e6edf3', fontSize: 12 }}>终端</Text>
                <div style={{ display: 'flex', gap: 4, marginLeft: 8, background: '#0d1117', borderRadius: 6, padding: 2, border: '1px solid #21262d' }}>
                  <Button size="small" type="text" onClick={() => setTerminalMode('server')} style={terminalMode === 'server' ? { background: '#21262d', color: '#00d4aa', borderRadius: 4, fontSize: 11 } : { color: '#8b949e', fontSize: 11, borderRadius: 4 }}>服务器</Button>
                  <Button size="small" type="text" onClick={() => setTerminalMode('container')} style={terminalMode === 'container' ? { background: '#21262d', color: '#00d4aa', borderRadius: 4, fontSize: 11 } : { color: '#8b949e', fontSize: 11, borderRadius: 4 }}>容器</Button>
                </div>
              </Space>
              <Space size="small">
                <Tooltip title="AI 分析终端选中内容">
                  <Button size="small" icon={<RobotOutlined />} onClick={analyzeTerminalSelection}
                    style={{ borderColor: '#30363d', color: '#00d4aa' }} />
                </Tooltip>
                {terminalMode === 'container' && <Button size="small" icon={<ReloadOutlined />} onClick={() => selectedServer && loadContainers(selectedServer)} disabled={!selectedServer}>刷新</Button>}
                <Button size="small" type="primary" icon={<PlusOutlined />}
                  onClick={() => {
                    if (!selectedServer) { message.warning('请先选择服务器'); return }
                    if (terminalMode === 'container') {
                      if (containers.length === 0) { message.warning('没有可用容器'); return }
                      setSelectedContainerId(undefined); setOpenNewModal(true)
                    } else {
                      openNewTerminal('server', '服务器终端', 'server')
                    }
                  }}
                  disabled={!selectedServer || (terminalMode === 'container' && containers.length === 0)}
                  style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00a896 100%)', borderColor: 'transparent', boxShadow: '0 2px 10px rgba(0,212,170,0.3)' }}>新建终端</Button>
              </Space>
            </div>
            
            {terminalTabs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
                <Empty
                  image={<LaptopOutlined style={{ fontSize: 44, color: '#30363d' }} />}
                  description={<span style={{ color: '#8b949e' }}>选择 {terminalMode === 'server' ? '服务器' : '容器'} 打开终端</span>} />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', background: 'rgba(22,27,34,0.85)', borderBottom: '1px solid #30363d', overflowX: 'auto' }}>
                  {terminalTabs.map(tab => (
                    <div key={tab.sessionId} onClick={() => setActiveTerminalTab(tab.sessionId)}
                      className={`terminal-tab ${activeTerminalTab === tab.sessionId ? 'active' : ''}`}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', cursor: 'pointer', borderRight: '1px solid #21262d', background: activeTerminalTab === tab.sessionId ? 'rgba(0,212,170,0.06)' : 'transparent', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: activeTerminalTab === tab.sessionId ? '#3fb950' : '#30363d', boxShadow: activeTerminalTab === tab.sessionId ? '0 0 6px rgba(63,185,80,0.7)' : 'none' }} />
                      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', color: activeTerminalTab === tab.sessionId ? '#e6edf3' : '#8b949e' }}>{tab.containerName}</span>
                      <CloseOutlined style={{ fontSize: 10, color: '#6e7681', transition: 'color .15s' }} onClick={(e) => { e.stopPropagation(); closeTerminalTab(tab.sessionId) }} />
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {terminalTabs.map(tab => (
                    <div key={tab.sessionId} style={{ display: activeTerminalTab === tab.sessionId ? 'block' : 'none', position: 'absolute', inset: 0, background: '#0d1117' }}>
                      <div ref={el => { if (el) terminalContainersRef.current.set(tab.sessionId, el) }} style={{ width: '100%', height: '100%' }} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ========== 右侧：AI对话面板 ========== */}
          <div style={{ flex: '1 1 45%', display: 'flex', flexDirection: 'column', background: '#0d1117', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'rgba(22,27,34,0.7)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(48,54,61,0.8)' }}>
              <Space>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, rgba(0,212,170,0.16), rgba(88,166,255,0.16))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,212,170,0.3)' }}>
                  <RobotOutlined style={{ color: '#00d4aa', fontSize: 13 }} />
                </div>
                <Text strong style={{ color: '#e6edf3', fontSize: 12, letterSpacing: 0.5 }}>AI 对话</Text>
                {activeSessionId && (
                  <Tag style={{ margin: 0, fontSize: 11, background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.35)', color: '#58a6ff', borderRadius: 999 }}>
                    {sessions.find(s => s.id === activeSessionId)?.name}
                  </Tag>
                )}
                {/* 模型快速切换（激活提供商档案） */}
                <Select value={modelConfig.activeProfileId} onChange={v => activateProfile(v)} size="small" variant="borderless"
                  style={{ minWidth: 96, fontSize: 11, color: '#8b949e' }}
                  suffixIcon={<ThunderboltOutlined style={{ color: '#00d4aa', fontSize: 10 }} />}
                  options={(modelConfig.providerProfiles || []).map(p => ({ value: p.id, label: `${p.name} · ${p.model || '未选模型'}` }))} />
              </Space>
              <Space size={2}>
                <Tooltip title="智能诊断修复"><Button size="small" type="text" icon={<ThunderboltFilled />} onClick={runIntelligentDiagnosis} loading={runningDiagnostics} style={{ color: '#00d4aa' }} /></Tooltip>
                <Tooltip title="系统诊断"><Button size="small" type="text" icon={<ScanOutlined />} onClick={runDiagnostics} loading={runningDiagnostics} style={{ color: '#8b949e' }} /></Tooltip>
                <Tooltip title="命令历史"><Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setShowHistory(true)} style={{ color: '#8b949e' }} /></Tooltip>
                <Tooltip title="新建对话"><Button size="small" type="text" icon={<PlusOutlined />} onClick={createSession} style={{ color: '#8b949e' }} /></Tooltip>
                <Tooltip title="清空对话"><Button size="small" type="text" icon={<ClearOutlined />} onClick={clearMessages} disabled={messages.length === 0} /></Tooltip>
              </Space>
            </div>

            <div ref={messagesRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ width: 76, height: 76, margin: '0 auto 20px', borderRadius: 20, background: 'radial-gradient(circle at 30% 30%, rgba(0,212,170,0.25), rgba(88,166,255,0.08) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,212,170,0.2)', animation: 'glow-pulse 3.2s ease-in-out infinite' }}>
                    <RobotOutlined style={{ fontSize: 32, color: '#00d4aa' }} />
                  </div>
                  <Text style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, display: 'block' }}>开始与 AI 对话，管理你的服务器</Text>
                  <Text type="secondary" style={{ color: '#6e7681', fontSize: 12, display: 'block', marginTop: 6 }}>支持工具调用 · 智能诊断 · 风险审批</Text>
                  <div style={{ marginTop: 28 }}>
                    <Text style={{ color: '#8b949e', fontSize: 11, marginBottom: 12, display: 'block', letterSpacing: 1 }}>快捷命令</Text>
                    <Space wrap size={8}>
                      {(modelConfig.quickMessages && modelConfig.quickMessages.length > 0 ? modelConfig.quickMessages : [
                        '请对当前服务器做一次综合健康检查',
                        '列出当前服务器上运行的所有 Docker 容器',
                        '查看服务器 CPU、内存、磁盘使用率'
                      ]).map((tip, i) => (
                        <Tag key={i} className="quick-tip" onClick={() => setInputText(tip)}>{tip.slice(0, 14)}{tip.length > 14 ? '…' : ''}</Tag>
                      ))}
                    </Space>
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} style={{ marginBottom: 16, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {/* 用户消息 */}
                    {msg.role === 'user' && (
                      <div className="user-msg-bubble" style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 12, background: 'linear-gradient(135deg, #00d4aa 0%, #00a896 100%)', color: '#fff', borderTopRightRadius: 4 }}>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{new Date(msg.timestamp).toLocaleTimeString()}</div>
                      </div>
                    )}
                    
                    {/* AI消息（左侧头像列 + 内容） */}
                    {msg.role === 'assistant' && (
                      <div style={{ maxWidth: '92%', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div className="ai-avatar"><RobotOutlined style={{ color: '#fff', fontSize: 13 }} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ai-msg-bubble" style={{ padding: msg.status === 'running' ? '10px 14px' : '12px 14px', borderRadius: 12, borderTopLeftRadius: 4 }}>
                          {/* 分段内容：文本 / 工具调用 按真实执行顺序交错 */}
                          {msg.segments && msg.segments.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {msg.segments.map((seg, idx) => (
                                <div key={idx}>
                                  {seg.type === 'text' ? (
                                    <div style={{ fontSize: 13, lineHeight: 1.65, color: '#e6edf3' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text) }} />
                                  ) : (
                                    <ToolCallCard tc={seg.toolCall} />
                                  )}
                                </div>
                              ))}
                              {msg.status === 'running' && <span className="typing-cursor" />}
                            </div>
                          ) : (
                            <>
                              {/* 旧消息（无 segments）兼容：纯文本 + 工具调用列表 */}
                              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                  <Text style={{ color: '#e6edf3', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                    {msg.content || '思考中'}
                                    {msg.status === 'running' && <span className="typing-cursor" />}
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

                          {/* 命令列表（历史兼容） */}
                          {msg.commands && msg.commands.length > 0 && (
                            <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 12 }}>
                              <Text style={{ fontSize: 11, color: '#8b949e', letterSpacing: 0.5 }}>建议命令</Text>
                              {msg.commands.map((cmd, idx) => (
                                <div key={idx} className="cmd-card" style={{ background: 'rgba(13,17,23,0.8)', padding: 8, borderRadius: 8, border: '1px solid #21262d' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <CodeOutlined style={{ color: '#3fb950' }} />
                                    <Text code style={{ color: '#3fb950', fontSize: 12, flex: 1, background: 'transparent', padding: 0, fontFamily: 'Consolas, monospace' }}>$ {cmd.command}</Text>
                                    {cmd.riskLevel && cmd.riskLevel !== 'low' && (
                                      <Tag color={getRiskColor(cmd.riskLevel)} style={{ fontSize: 10, margin: 0, padding: '0 6px', borderRadius: 999 }}>
                                        {cmd.riskLevel === 'high' ? '高风险' : '中风险'}
                                      </Tag>
                                    )}
                                    <Tooltip title="在终端中运行">
                                      <Button size="small" type="text" icon={<PlayCircleOutlined />} style={{ color: '#00d4aa', padding: 0, width: 20, height: 20 }}
                                        onClick={() => executeCommandInTerminal(cmd.command)} disabled={!activeTerminalTab} />
                                    </Tooltip>
                                    <Tooltip title="复制">
                                      <Button size="small" type="text" icon={<CopyOutlined />} style={{ color: '#8b949e', padding: 0, width: 20, height: 20 }}
                                        onClick={() => { navigator.clipboard.writeText(cmd.command); message.success('已复制') }} />
                                    </Tooltip>
                                  </div>
                                  {cmd.output && (
                                    <pre style={{ marginTop: 8, marginBottom: 0, maxHeight: 120, overflow: 'auto', fontSize: 11, color: '#8b949e', background: 'rgba(22,27,34,0.6)', padding: 8, borderRadius: 4, border: '1px solid #21262d' }}>
                                      {cmd.output}
                                    </pre>
                                  )}
                                </div>
                              ))}
                              {msg.status === 'success' && !msg.commands[0]?.output && (
                                <Space size={8}>
                                  <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => executeMessageCommands(msg.id)} disabled={!connected} style={{ background: '#00d4aa', borderColor: '#00d4aa', borderRadius: 6 }}>
                                    后台执行
                                  </Button>
                                  <Button size="small" icon={<LaptopOutlined />} onClick={() => {
                                    if (!activeTerminalTab) { message.warning('请先打开终端'); return }
                                    msg.commands?.forEach(cmd => executeCommandInTerminal(cmd.command))
                                  }} disabled={!activeTerminalTab} style={{ borderColor: '#30363d', color: '#e6edf3', borderRadius: 6 }}>
                                    在终端中执行
                                  </Button>
                                </Space>
                              )}
                            </Space>
                          )}

                          {/* 时间戳 + 操作 */}
                          <div style={{ fontSize: 10, color: '#484f58', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {new Date(msg.timestamp).toLocaleTimeString()}
                            {msg.metadata?.executionTime && <span>⏱ {msg.metadata.executionTime}ms</span>}
                            <span style={{ flex: 1 }} />
                            <Tooltip title="复制回复">
                              <Button size="small" type="text" icon={<CopyOutlined />} style={{ color: '#6e7681', padding: 0, width: 20, height: 20 }}
                                onClick={() => { navigator.clipboard.writeText(msg.content); message.success('已复制') }} />
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
            <div className="agent-input" style={{ padding: 14, borderTop: '1px solid rgba(48,54,61,0.8)', background: 'rgba(22,27,34,0.85)' }}>
              <Space.Compact style={{ width: '100%' }}>
                <TextArea 
                  ref={inputRef}
                  autoFocus
                  placeholder={modelConfig.apiKey && modelConfig.model ? "输入你的问题，例如：检查服务器状态" : "请先配置 AI 模型"} 
                  value={inputText}
                  onChange={e => setInputText(e.target.value)} 
                  onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  autoSize={{ minRows: 1, maxRows: 4 }} 
                  disabled={loading || !modelConfig.apiKey || !modelConfig.model}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8 }} />
                {loading && (
                  <Tooltip title="停止生成">
                    <Button icon={<CloseOutlined />} onClick={() => {
                      if (currentRequestIdRef.current) {
                        window.electronAPI.opsAgent.cancel(currentRequestIdRef.current)
                      }
                    }}
                      style={{ background: '#21262d', borderColor: '#30363d', color: '#ff7b72', borderRadius: 0 }} />
                  </Tooltip>
                )}
                <Button type="primary" icon={loading ? <LoadingOutlined /> : <SendOutlined />} onClick={sendMessage}
                  disabled={loading || !inputText.trim() || !modelConfig.apiKey || !modelConfig.model} 
                  style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00a896 100%)', borderColor: 'transparent', borderTopRightRadius: 8, borderBottomRightRadius: 8 }} />
              </Space.Compact>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, padding: '0 2px' }}>
                <Text style={{ fontSize: 10, color: '#484f58' }}>Enter 发送 · Shift+Enter 换行</Text>
                {selectedServer && <Text style={{ fontSize: 10, color: '#3fb950' }}><LinkOutlined style={{ marginRight: 3 }} />已连接 {servers.find(s => s.id === selectedServer)?.name}</Text>}
              </div>
            </div>
          </div>
        </div>

        {/* ========== 模态框 ========== */}
        
        {/* 容器选择 */}
        <Modal title={<Space><LaptopOutlined style={{ color: '#00d4aa' }} /><span style={{ color: '#e6edf3' }}>打开容器终端</span></Space>} open={openNewModal} 
          onOk={() => { if (selectedContainerId) { const c = containers.find(x => x.id === selectedContainerId); if (c) openNewTerminal(c.id, c.name, 'container') } setOpenNewModal(false) }} 
          onCancel={() => setOpenNewModal(false)} okButtonProps={{ disabled: !selectedContainerId }}
          styles={{ body: { background: '#161b22' }, content: { background: '#161b22', border: '1px solid #30363d' }, header: { background: '#161b22', borderBottom: '1px solid #21262d' } }}>
          <Select style={{ width: '100%' }} placeholder="请选择容器" value={selectedContainerId} onChange={setSelectedContainerId}
            options={containers.map(c => ({ value: c.id, label: <Space><span style={{ color: '#e6edf3' }}>{c.name}</span><Tag color="blue" style={{ borderRadius: 999 }}>{c.image}</Tag><Tag color={c.status.includes('running') ? 'green' : 'default'} style={{ borderRadius: 999 }}>{c.status}</Tag></Space> }))} />
        </Modal>

        {/* 诊断报告 */}
        <Modal title={<Space><ScanOutlined style={{ color: '#58a6ff' }} /><span style={{ color: '#e6edf3' }}>系统诊断报告</span></Space>} open={showDiagnostics} onCancel={() => setShowDiagnostics(false)} footer={null} width={600}
          styles={{ body: { background: '#161b22' }, content: { background: '#161b22', border: '1px solid #30363d' }, header: { background: '#161b22', borderBottom: '1px solid #21262d' } }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {diagnostics.map((d, i) => (
              <Card key={i} size="small" style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid #21262d', borderRadius: 10 }}>
                <Space>
                  {d.status === 'healthy' && <CheckCircleOutlined style={{ color: '#3fb950', fontSize: 16 }} />}
                  {d.status === 'warning' && <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 16 }} />}
                  {d.status === 'critical' && <CloseCircleOutlined style={{ color: '#ff7b72', fontSize: 16 }} />}
                  <div>
                    <Text strong style={{ color: '#e6edf3', textTransform: 'capitalize' }}>{d.type}</Text>
                    <div><Text style={{ color: '#8b949e', fontSize: 12 }}>{d.message}</Text></div>
                    {d.suggestion && <div><Text style={{ color: '#d29922', fontSize: 11 }}>💡 {d.suggestion}</Text></div>}
                  </div>
                </Space>
              </Card>
            ))}
          </Space>
        </Modal>

        {/* 命令历史 */}
        <Modal title={<Space><HistoryOutlined style={{ color: '#58a6ff' }} /><span style={{ color: '#e6edf3' }}>命令历史</span></Space>} open={showHistory} onCancel={() => setShowHistory(false)} footer={null} width={700}
          styles={{ body: { background: '#161b22', maxHeight: 500, overflow: 'auto' }, content: { background: '#161b22', border: '1px solid #30363d' }, header: { background: '#161b22', borderBottom: '1px solid #21262d' } }}>
          <List dataSource={commandHistory.slice(0, 50)} renderItem={item => (
            <List.Item style={{ borderBottom: '1px solid #21262d', padding: '8px 0' }}>
              <div style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text code style={{ color: '#3fb950', fontSize: 12, background: 'rgba(13,17,23,0.6)', padding: '2px 8px', borderRadius: 4, fontFamily: 'Consolas, monospace' }}>{item.command}</Text>
                  <Space size={8}>
                    {item.success ? <CheckCircleOutlined style={{ color: '#3fb950' }} /> : <CloseCircleOutlined style={{ color: '#ff7b72' }} />}
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.executionTime}ms</Text>
                  </Space>
                </Space>
                <div><Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.timestamp).toLocaleString()}</Text></div>
              </div>
            </List.Item>
          )} />
        </Modal>

        {/* 安全审批 */}
        <Modal title={<Space><SafetyOutlined style={{ color: '#faad14' }} /><span style={{ color: '#e6edf3' }}>安全审批</span></Space>} 
          open={!!approvalRequest} onCancel={() => handleApproval(false)} onOk={() => handleApproval(true)} 
          okText="确认执行" cancelText="取消" okButtonProps={{ danger: approvalRequest?.riskLevel === 'high' }}
          styles={{ body: { background: '#161b22' }, content: { background: '#161b22', border: '1px solid #30363d' }, header: { background: '#161b22', borderBottom: '1px solid #21262d' } }}>
          {approvalRequest && (
            <div>
              <Alert message={`风险等级: ${approvalRequest.riskLevel === 'high' ? '高风险' : '中风险'}`} 
                type={approvalRequest.riskLevel === 'high' ? 'error' : 'warning'} showIcon style={{ marginBottom: 16, borderRadius: 8 }} />
              <Text style={{ color: '#8b949e', fontSize: 11, display: 'block', marginBottom: 6 }}>执行命令</Text>
              <pre style={{ background: 'rgba(13,17,23,0.85)', padding: 12, borderRadius: 8, color: '#ff7b72', border: '1px solid rgba(255,123,114,0.3)', fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>{approvalRequest.action}</pre>
            </div>
          )}
        </Modal>

        {/* 会话重命名 */}
        <Modal title={<Space><EditOutlined style={{ color: '#58a6ff' }} /><span style={{ color: '#e6edf3' }}>重命名会话</span></Space>}
          open={!!renameTarget} onOk={renameSession} onCancel={() => setRenameTarget(null)}
          okText="保存" cancelText="取消"
          styles={{ body: { background: '#161b22' }, content: { background: '#161b22', border: '1px solid #30363d' }, header: { background: '#161b22', borderBottom: '1px solid #21262d' } }}>
          <Input value={renameName} onChange={e => setRenameName(e.target.value)} placeholder="输入新的会话名称"
            onPressEnter={renameSession} size="small" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }} />
        </Modal>
      </div>
    </ConfigProvider>
  )
}

export default AgentTerminalPage

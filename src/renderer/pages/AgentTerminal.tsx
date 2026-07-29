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
  Dropdown,
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
  Switch
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
  SearchOutlined
} from '@ant-design/icons'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

// 导入 Agent 模块
import { aiAgent } from '../agent'
import type { 
  ChatMessage, 
  ChatSession, 
  ModelConfig, 
  ExecutedCommand,
  CommandHistoryItem,
  DiagnosticResult,
  ContainerOption,
  TerminalTab
} from '../agent'
import { DEFAULT_MODEL_CONFIG, assessRiskLevel, PROVIDER_PRESETS } from '../agent'
import type { Server } from '../types/server'

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

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)

  // Config state
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => {
    const saved = localStorage.getItem(CONFIG_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_MODEL_CONFIG
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
  const approvalCallback = useRef<((approved: boolean) => void) | null>(null)

  // Stats
  const [stats, setStats] = useState({
    totalMessages: 0,
    totalCommands: 0,
    successRate: 100
  })

  // ==================== 初始化 ====================

  useEffect(() => {
    aiAgent.updateModelConfig(modelConfig)
    loadSessions()
    loadCommandHistory()

    const handleApproval = (e: CustomEvent) => {
      const { request, callback } = e.detail
      setApprovalRequest(request)
      approvalCallback.current = callback
    }
    window.addEventListener('agent:approval-request', handleApproval as EventListener)

    return () => {
      window.removeEventListener('agent:approval-request', handleApproval as EventListener)
    }
  }, [modelConfig])

  const loadSessions = async () => {
    const allSessions = await aiAgent.getAllSessions()
    setSessions(allSessions)
    if (allSessions.length > 0 && !activeSessionId) {
      setActiveSessionId(allSessions[0].id)
    }
  }

  const loadCommandHistory = async () => {
    const history = await aiAgent.getCommandHistory()
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
    const session = aiAgent.createSession()
    await loadSessions()
    setActiveSessionId(session.id)
    setMessages([])
  }

  const deleteSession = async (sessionId: string) => {
    await aiAgent.deleteSession(sessionId)
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId)
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : undefined)
    }
    await loadSessions()
  }

  useEffect(() => {
    if (activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId)
      setMessages(session?.messages || [])
    } else {
      setMessages([])
    }
  }, [activeSessionId, sessions])

  // ==================== 消息处理 ====================

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return

    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 AI 模型')
      setShowConfig(true)
      return
    }

    const userInput = inputText.trim()
    setInputText('')
    setLoading(true)

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    const loadingMessage: ChatMessage = {
      id: `msg-${Date.now()}-loading`,
      role: 'assistant',
      content: '正在分析...',
      timestamp: new Date().toISOString(),
      status: 'running'
    }
    setMessages(prev => [...prev, loadingMessage])

    try {
      const response = await aiAgent.sendMessage(userInput)
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id)
        return [...filtered, response]
      })
    } catch (error) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id)
        return [...filtered, {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: `错误: ${(error as Error).message}`,
          timestamp: new Date().toISOString(),
          status: 'error'
        }]
      })
    } finally {
      setLoading(false)
      await loadSessions()
    }
  }

  // ==================== 命令执行 ====================

  const executeCommand = async (command: string, riskLevel?: 'low' | 'medium' | 'high') => {
    if (!selectedServer) {
      message.warning('请先选择服务器')
      return null
    }
    const result = await aiAgent.executeCommand(command, selectedServer)
    await loadCommandHistory()
    return result
  }

  const executeMessageCommands = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg || !msg.commands || !selectedServer) return

    for (const cmd of msg.commands) {
      await executeCommand(cmd.command, cmd.riskLevel)
    }
    await loadSessions()
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

  const runDiagnostics = async () => {
    if (!selectedServer) {
      message.warning('请先选择服务器')
      return
    }

    setRunningDiagnostics(true)
    try {
      const results = await aiAgent.runDiagnostics(selectedServer)
      setDiagnostics(results)
      setShowDiagnostics(true)
    } catch {
      message.error('诊断失败')
    } finally {
      setRunningDiagnostics(false)
    }
  }

  // ==================== 配置管理 ====================

  const saveConfig = () => {
    if (!modelConfig.apiKey) {
      message.warning('请输入 API Key')
      return
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(modelConfig))
    aiAgent.updateModelConfig(modelConfig)
    setConfigSaved(true)
    message.success('配置已保存')
    setTimeout(() => setConfigSaved(false), 2000)
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
      await aiAgent.sendMessage('你好，请确认连接正常。')
      message.success('连接测试成功！')
    } catch (error) {
      message.error(`连接失败: ${(error as Error).message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  // ==================== 审批处理 ====================

  const handleApproval = (approved: boolean) => {
    if (approvalCallback.current) {
      approvalCallback.current(approved)
    }
    setApprovalRequest(null)
    approvalCallback.current = null
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
          theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor: '#00d4aa',
            selection: '#264f78',
            black: '#0d1117',
            red: '#ff7b72',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#bc8cff',
            cyan: '#39d2c0',
            white: '#e6edf3'
          },
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

  // Session menu items
  const sessionMenuItems = sessions.map(s => ({
    key: s.id,
    label: (
      <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{s.name}</span>
        <Space size={8}>
          <Text type="secondary">{s.messages.length} 条</Text>
          <Button size="small" type="text" danger icon={<DeleteOutlined />}
            onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }} />
        </Space>
      </Space>
    ),
    icon: <MessageOutlined />,
    onClick: () => setActiveSessionId(s.id)
  }))

  // ==================== 渲染 ====================

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#00d4aa' } }}>
      <div className="agent-terminal-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', overflow: 'hidden' }}>
        
        {/* ========== 顶部状态栏 ========== */}
        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: '10px 20px', background: '#161b22', borderBottom: '1px solid #30363d' 
        }}>
          <Space size="large">
            <Space>
              <RobotOutlined style={{ fontSize: 20, color: '#00d4aa' }} />
              <Title level={4} style={{ margin: 0, color: '#e6edf3', fontFamily: 'inherit' }}>
                AI OPS TERMINAL
              </Title>
            </Space>
            <Divider type="vertical" style={{ background: '#30363d' }} />
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
              {connected && <Tag color="success" icon={<LinkOutlined />}>已连接</Tag>}
            </Space>
          </Space>
          
          <Space size="middle">
            {/* 统计信息 */}
            <Space size={4} style={{ padding: '4px 8px', background: '#21262d', borderRadius: 4 }}>
              <DashboardOutlined style={{ color: '#8b949e', fontSize: 11 }} />
              <Text style={{ color: '#8b949e', fontSize: 11 }}>
                {stats.totalCommands} 命令 | {stats.successRate}% 成功
              </Text>
            </Space>
            
            <Tag color={modelConfig.apiKey && modelConfig.model ? 'success' : 'default'} icon={<ApiOutlined />}>
              {modelConfig.model || '未配置'}
            </Tag>
            <Tooltip title="配置"><Button size="small" icon={<SettingOutlined />} type={showConfig ? 'primary' : 'default'} onClick={() => setShowConfig(!showConfig)} style={showConfig ? { background: '#00d4aa' } : {}} /></Tooltip>
            <Dropdown menu={{ items: sessionMenuItems }}>
              <Button size="small" icon={<MessageOutlined />}>会话 ({sessions.length})</Button>
            </Dropdown>
          </Space>
        </div>

        {/* ========== 配置面板 ========== */}
        {showConfig && (
          <div style={{ padding: 16, background: '#161b22', borderBottom: '1px solid #30363d' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <Space direction="vertical" size="small">
                <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>提供商</Text>
                <Select value={modelConfig.provider} onChange={v => {
                  const preset = PROVIDER_PRESETS.find(p => p.provider === v)
                  setModelConfig({
                    ...modelConfig,
                    provider: v,
                    model: '',
                    baseUrl: preset?.baseUrl || '',
                    apiKey: ''
                  })
                }} style={{ width: '100%' }} size="small"
                  options={[
                    { value: 'openai', label: '🔵 OpenAI (GPT-4o)' },
                    { value: 'anthropic', label: '🟠 Anthropic (Claude)' },
                    { value: 'azure', label: '🔷 Azure OpenAI' },
                    { value: 'gemini', label: '🟢 Google Gemini' },
                    { value: 'ollama', label: '🦙 Ollama (本地)' },
                    { value: 'custom', label: '⚙️ 自定义 API' }
                  ]} />
              </Space>
              <Space direction="vertical" size="small">
                <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>API Key {modelConfig.provider === 'ollama' && '(可选)'}</Text>
                <Input.Password value={modelConfig.apiKey} onChange={e => setModelConfig({ ...modelConfig, apiKey: e.target.value })}
                  placeholder={modelConfig.provider === 'anthropic' ? 'sk-ant-...' : modelConfig.provider === 'ollama' ? '不需要' : 'sk-...'}
                  size="small" />
              </Space>
              {(modelConfig.provider === 'custom' || modelConfig.provider === 'ollama') && (
                <Space direction="vertical" size="small">
                  <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>Base URL</Text>
                  <Input value={modelConfig.baseUrl} onChange={e => setModelConfig({ ...modelConfig, baseUrl: e.target.value })}
                    placeholder={modelConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} size="small" />
                </Space>
              )}
              {modelConfig.provider === 'azure' && (
                <>
                  <Space direction="vertical" size="small">
                    <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>Azure Endpoint</Text>
                    <Input value={modelConfig.azureEndpoint || ''} onChange={e => setModelConfig({ ...modelConfig, azureEndpoint: e.target.value })}
                      placeholder="https://your-resource.openai.azure.com" size="small" />
                  </Space>
                  <Space direction="vertical" size="small">
                    <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>Deployment Name</Text>
                    <Input value={modelConfig.azureDeployment || ''} onChange={e => setModelConfig({ ...modelConfig, azureDeployment: e.target.value })}
                      placeholder="gpt-4o" size="small" />
                  </Space>
                </>
              )}
              <Space direction="vertical" size="small">
                <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>模型</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Select value={modelConfig.model} onChange={v => setModelConfig({ ...modelConfig, model: v })}
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
                  <Button size="small" icon={<ReloadOutlined />} loading={loadingModels} onClick={loadModels} title="获取模型列表" />
                </Space.Compact>
              </Space>
              <Space direction="vertical" size="small">
                <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>温度: {modelConfig.temperature}</Text>
                <Slider value={modelConfig.temperature} onChange={v => setModelConfig({ ...modelConfig, temperature: v })} min={0} max={1} step={0.1} />
              </Space>
              <Space direction="vertical" size="small">
                <Text strong style={{ color: '#e6edf3', fontSize: 11, textTransform: 'uppercase' }}>最大Token: {modelConfig.maxTokens}</Text>
                <Slider value={modelConfig.maxTokens} onChange={v => setModelConfig({ ...modelConfig, maxTokens: v })} min={100} max={8000} step={100} />
              </Space>
            </div>
            <Divider style={{ margin: '12px 0', background: '#30363d' }} />
            <Space>
              <Button size="small" icon={<ThunderboltOutlined />} loading={testingConnection} onClick={testConnection}>测试连接</Button>
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={saveConfig} style={{ background: '#00d4aa', borderColor: '#00d4aa' }}>保存配置</Button>
              <Space size={4}>
                <Text strong style={{ color: '#8b949e', fontSize: 11 }}>系统提示词</Text>
                <Button size="small" type="text" icon={editingPrompt ? <CheckOutlined /> : <EditOutlined />} onClick={() => setEditingPrompt(!editingPrompt)} style={{ color: '#8b949e' }}>
                  {editingPrompt ? '完成' : '编辑'}
                </Button>
              </Space>
            </Space>
            {editingPrompt && (
              <TextArea value={modelConfig.systemPrompt} onChange={e => setModelConfig({ ...modelConfig, systemPrompt: e.target.value })} rows={3} size="small" style={{ marginTop: 8, background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }} />
            )}
          </div>
        )}

        {/* ========== 主内容区 ========== */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          
          {/* ========== 左侧：终端面板 ========== */}
          <div style={{ flex: '1 1 55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #30363d', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
              <Space>
                <LaptopOutlined style={{ color: '#00d4aa' }} />
                <Text strong style={{ color: '#e6edf3', fontSize: 12 }}>终端</Text>
                <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                  <Button size="small" type={terminalMode === 'server' ? 'primary' : 'default'} onClick={() => setTerminalMode('server')} style={terminalMode === 'server' ? { background: '#00d4aa' } : {}}>服务器</Button>
                  <Button size="small" type={terminalMode === 'container' ? 'primary' : 'default'} onClick={() => setTerminalMode('container')} style={terminalMode === 'container' ? { background: '#00d4aa' } : {}}>容器</Button>
                </div>
              </Space>
              <Space size="small">
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
                  style={{ background: '#00d4aa', borderColor: '#00d4aa' }}>新建终端</Button>
              </Space>
            </div>
            
            {terminalTabs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
                <Empty description={<span style={{ color: '#8b949e' }}>选择 {terminalMode === 'server' ? '服务器' : '容器'} 打开终端</span>} />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', background: '#161b22', borderBottom: '1px solid #30363d', overflowX: 'auto' }}>
                  {terminalTabs.map(tab => (
                    <div key={tab.sessionId} onClick={() => setActiveTerminalTab(tab.sessionId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', cursor: 'pointer', borderRight: '1px solid #30363d', background: activeTerminalTab === tab.sessionId ? '#0d1117' : 'transparent', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3fb950' }} />
                      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', color: '#e6edf3' }}>{tab.containerName}</span>
                      <CloseOutlined style={{ fontSize: 10, color: '#8b949e' }} onClick={(e) => { e.stopPropagation(); closeTerminalTab(tab.sessionId) }} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
              <Space>
                <RobotOutlined style={{ color: '#00d4aa' }} />
                <Text strong style={{ color: '#e6edf3', fontSize: 12 }}>AI 对话</Text>
                {activeSessionId && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{sessions.find(s => s.id === activeSessionId)?.name}</Tag>}
              </Space>
              <Space size="small">
                <Tooltip title="系统诊断"><Button size="small" type="text" icon={<ScanOutlined />} onClick={runDiagnostics} loading={runningDiagnostics} /></Tooltip>
                <Tooltip title="命令历史"><Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setShowHistory(true)} /></Tooltip>
                <Tooltip title="新建对话"><Button size="small" type="text" icon={<PlusOutlined />} onClick={createSession} /></Tooltip>
                <Tooltip title="清空对话"><Button size="small" type="text" icon={<ClearOutlined />} onClick={() => setMessages([])} disabled={messages.length === 0} /></Tooltip>
              </Space>
            </div>

            <div ref={messagesRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <RobotOutlined style={{ fontSize: 48, color: '#00d4aa', marginBottom: 16, display: 'block' }} />
                  <Text style={{ color: '#8b949e', fontSize: 14 }}>开始与 AI 对话，管理你的服务器</Text>
                  <div style={{ marginTop: 24 }}>
                    <Text style={{ color: '#8b949e', fontSize: 12, marginBottom: 8, display: 'block' }}>快捷命令</Text>
                    <Space wrap>
                      {['检查系统状态', '查看Docker容器', '查看网络连接', '查看进程'].map(tip => (
                        <Tag key={tip} style={{ cursor: 'pointer', background: '#21262d', border: '1px solid #30363d', color: '#8b949e', padding: '4px 12px', borderRadius: 4 }} onClick={() => setInputText(tip)}>{tip}</Tag>
                      ))}
                    </Space>
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} style={{ marginBottom: 16, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {/* 用户消息 */}
                    {msg.role === 'user' && (
                      <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 8, background: 'linear-gradient(135deg, #00d4aa 0%, #00a896 100%)', color: '#fff' }}>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{new Date(msg.timestamp).toLocaleTimeString()}</div>
                      </div>
                    )}
                    
                    {/* AI消息 */}
                    {msg.role === 'assistant' && (
                      <div style={{ maxWidth: '90%' }}>
                        {msg.status === 'running' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#161b22', borderRadius: 8, border: '1px solid #30363d' }}>
                            <Spin size="small" />
                            <Text style={{ color: '#8b949e' }}>{msg.content}</Text>
                          </div>
                        ) : (
                          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#161b22', border: '1px solid #30363d' }}>
                            {/* 消息内容 */}
                            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#e6edf3' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                            
                            {/* 命令列表 */}
                            {msg.commands && msg.commands.length > 0 && (
                              <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 12 }}>
                                <Text style={{ fontSize: 11, color: '#8b949e' }}>建议命令:</Text>
                                {msg.commands.map((cmd, idx) => (
                                  <div key={idx} style={{ background: '#0d1117', padding: 8, borderRadius: 6, border: '1px solid #21262d' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <CodeOutlined style={{ color: '#3fb950' }} />
                                      <Text code style={{ color: '#3fb950', fontSize: 12, flex: 1, background: 'transparent', padding: 0 }}>$ {cmd.command}</Text>
                                      {cmd.riskLevel && cmd.riskLevel !== 'low' && (
                                        <Tag color={getRiskColor(cmd.riskLevel)} style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
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
                                      <pre style={{ marginTop: 8, marginBottom: 0, maxHeight: 120, overflow: 'auto', fontSize: 11, color: '#8b949e', background: '#161b22', padding: 8, borderRadius: 4 }}>
                                        {cmd.output}
                                      </pre>
                                    )}
                                  </div>
                                ))}
                                {msg.status === 'success' && !msg.commands[0]?.output && (
                                  <Space size={8}>
                                    <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => executeMessageCommands(msg.id)} disabled={!connected} style={{ background: '#00d4aa', borderColor: '#00d4aa' }}>
                                      后台执行
                                    </Button>
                                    <Button size="small" icon={<LaptopOutlined />} onClick={() => {
                                      if (!activeTerminalTab) { message.warning('请先打开终端'); return }
                                      msg.commands?.forEach(cmd => executeCommandInTerminal(cmd.command))
                                    }} disabled={!activeTerminalTab} style={{ borderColor: '#30363d', color: '#e6edf3' }}>
                                      在终端中执行
                                    </Button>
                                  </Space>
                                )}
                              </Space>
                            )}
                            
                            {/* 时间戳 */}
                            <div style={{ fontSize: 10, color: '#484f58', marginTop: 8 }}>
                              {new Date(msg.timestamp).toLocaleTimeString()}
                              {msg.metadata?.executionTime && <span style={{ marginLeft: 8 }}>⏱ {msg.metadata.executionTime}ms</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 输入区 */}
            <div style={{ padding: 16, borderTop: '1px solid #30363d', background: '#161b22' }}>
              <Space.Compact style={{ width: '100%' }}>
                <TextArea 
                  placeholder={modelConfig.apiKey && modelConfig.model ? "输入你的问题，例如：检查服务器状态" : "请先配置 AI 模型"} 
                  value={inputText}
                  onChange={e => setInputText(e.target.value)} 
                  onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  autoSize={{ minRows: 1, maxRows: 4 }} 
                  disabled={loading || !modelConfig.apiKey || !modelConfig.model}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }} />
                <Button type="primary" icon={loading ? <LoadingOutlined /> : <SendOutlined />} onClick={sendMessage}
                  disabled={loading || !inputText.trim() || !modelConfig.apiKey || !modelConfig.model} 
                  style={{ background: '#00d4aa', borderColor: '#00d4aa' }} />
              </Space.Compact>
            </div>
          </div>
        </div>

        {/* ========== 模态框 ========== */}
        
        {/* 容器选择 */}
        <Modal title={<span style={{ color: '#e6edf3' }}>打开容器终端</span>} open={openNewModal} 
          onOk={() => { if (selectedContainerId) { const c = containers.find(x => x.id === selectedContainerId); if (c) openNewTerminal(c.id, c.name, 'container') } setOpenNewModal(false) }} 
          onCancel={() => setOpenNewModal(false)} okButtonProps={{ disabled: !selectedContainerId }}
          bodyStyle={{ background: '#161b22' }}>
          <Select style={{ width: '100%' }} placeholder="请选择容器" value={selectedContainerId} onChange={setSelectedContainerId}
            options={containers.map(c => ({ value: c.id, label: <Space><span style={{ color: '#e6edf3' }}>{c.name}</span><Tag color="blue">{c.image}</Tag><Tag color={c.status.includes('running') ? 'green' : 'default'}>{c.status}</Tag></Space> }))} />
        </Modal>

        {/* 诊断报告 */}
        <Modal title={<span style={{ color: '#e6edf3' }}>🖥️ 系统诊断报告</span>} open={showDiagnostics} onCancel={() => setShowDiagnostics(false)} footer={null} width={600}
          bodyStyle={{ background: '#161b22' }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {diagnostics.map((d, i) => (
              <Card key={i} size="small" style={{ background: '#0d1117', border: '1px solid #21262d' }}>
                <Space>
                  {d.status === 'healthy' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
                  {d.status === 'warning' && <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 16 }} />}
                  {d.status === 'critical' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />}
                  <div>
                    <Text strong style={{ color: '#e6edf3', textTransform: 'capitalize' }}>{d.type}</Text>
                    <div><Text style={{ color: '#8b949e', fontSize: 12 }}>{d.message}</Text></div>
                    {d.suggestion && <div><Text type="warning" style={{ fontSize: 11 }}>💡 {d.suggestion}</Text></div>}
                  </div>
                </Space>
              </Card>
            ))}
          </Space>
        </Modal>

        {/* 命令历史 */}
        <Modal title={<span style={{ color: '#e6edf3' }}>📜 命令历史</span>} open={showHistory} onCancel={() => setShowHistory(false)} footer={null} width={700}
          bodyStyle={{ background: '#161b22', maxHeight: 500, overflow: 'auto' }}>
          <List dataSource={commandHistory.slice(0, 50)} renderItem={item => (
            <List.Item style={{ borderBottom: '1px solid #21262d', padding: '8px 0' }}>
              <div style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text code style={{ color: '#3fb950', fontSize: 12 }}>{item.command}</Text>
                  <Space size={8}>
                    {item.success ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
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
          bodyStyle={{ background: '#161b22' }}>
          {approvalRequest && (
            <div>
              <Alert message={`风险等级: ${approvalRequest.riskLevel === 'high' ? '高风险' : '中风险'}`} 
                type={approvalRequest.riskLevel === 'high' ? 'error' : 'warning'} showIcon style={{ marginBottom: 16 }} />
              <pre style={{ background: '#0d1117', padding: 12, borderRadius: 6, color: '#ff7b72', border: '1px solid #21262d' }}>{approvalRequest.action}</pre>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  )
}

export default AgentTerminalPage

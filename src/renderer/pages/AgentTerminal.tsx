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

// 导入会话持久化与类型（会话存储为纯前端 localStorage，非 agent 逻辑）
import { persistenceManager } from '../agent/persistence-manager'
import type { 
  ChatMessage, 
  ChatSession, 
  ModelConfig, 
  ExecutedCommand,
  CommandHistoryItem,
  DiagnosticResult,
  ContainerOption,
  TerminalTab,
  ToolCallRecord
} from '../agent/types'
import { DEFAULT_MODEL_CONFIG, PROVIDER_PRESETS } from '../agent/types'
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
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallRecord[]>([])
  const streamingToolCallsRef = useRef<ToolCallRecord[]>([])
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
    await doSendMessage(userInput)
  }

  // 流式发送消息（走主进程 Mastra Agent，支持工具调用与审批）
  const doSendMessage = async (userInput: string) => {
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 AI 模型')
      setShowConfig(true)
      return
    }

    setLoading(true)
    setStreamingToolCalls([])
    streamingToolCallsRef.current = []

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

    // 注册一次性流式事件监听
    const removeChunk = window.electronAPI.opsAgent.onChunk(({ requestId: rid, delta }) => {
      if (rid !== requestId) return
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: m.content + delta } : m
      ))
    })

    const removeToolCall = window.electronAPI.opsAgent.onToolCall(({ requestId: rid, toolName, args }) => {
      if (rid !== requestId) return
      streamingToolCallsRef.current = [
        ...streamingToolCallsRef.current,
        { name: toolName, params: args, result: '执行中...', status: 'running' }
      ]
      setStreamingToolCalls([...streamingToolCallsRef.current])
    })

    const removeToolResult = window.electronAPI.opsAgent.onToolResult(({ requestId: rid, toolName, success, output }) => {
      if (rid !== requestId) return
      const summary = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      streamingToolCallsRef.current = streamingToolCallsRef.current.map(t =>
        t.name === toolName && t.status === 'running'
          ? { ...t, result: summary, status: success ? 'success' : 'error' }
          : t
      )
      setStreamingToolCalls([...streamingToolCallsRef.current])
    })

    const removeError = window.electronAPI.opsAgent.onError(({ requestId: rid, error }) => {
      if (rid !== requestId) return
      const cancelled = error === 'cancelled'
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, status: 'error', content: cancelled ? '已取消生成' : `错误: ${error}` }
          : m
      ))
    })

    const removeDone = window.electronAPI.opsAgent.onDone(({ requestId: rid }) => {
      if (rid !== requestId) return
      // 完成：更新消息为最终状态并持久化会话
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId
            ? { ...m, status: 'success' as const, toolCalls: streamingToolCallsRef.current.length > 0 ? streamingToolCallsRef.current : undefined }
            : m
        )
        if (activeSessionId) {
          const session = persistenceManager
          const saved = updated
          session.saveSession({
            id: activeSessionId,
            name: sessions.find(s => s.id === activeSessionId)?.name || `对话 ${new Date().toLocaleString()}`,
            messages: saved,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        }
        return updated
      })
      setLoading(false)
      setStreamingToolCalls([])
      cleanup()
    })

    const cleanup = () => {
      if (currentRequestIdRef.current === requestId) currentRequestIdRef.current = null
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
        setLoading(false)
        cleanup()
      }
    } catch (error) {
      const errMsg = (error as Error).message
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, status: 'error', content: errMsg.includes('cancelled') ? '已取消生成' : `错误: ${errMsg}` }
          : m
      ))
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

    const results: DiagnosticResult[] = []
    for (const diag of diagnosticCommands) {
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
        results.push({ type: diag.type, status, value, message: diagMessage, suggestion, timestamp: new Date().toISOString() })
      } catch {
        results.push({ type: diag.type, status: 'critical', value: 0, message: '诊断失败', timestamp: new Date().toISOString() })
      }
    }
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

  const saveConfig = () => {
    if (!modelConfig.apiKey) {
      message.warning('请输入 API Key')
      return
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(modelConfig))
    window.electronAPI.opsAgent.setConfig(modelConfig)
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
      const requestId = `ops-test-${Date.now()}`
      const result = await window.electronAPI.opsAgent.chat(requestId, {
        serverId: selectedServer,
        userInput: '你好，请确认连接正常。',
        threadId: `thread-test-${Date.now()}`
      })
      if (!result.success) {
        throw new Error(result.error || '连接失败')
      }
      // 等待流结束
      await new Promise<void>((resolve, reject) => {
        const removeError = window.electronAPI.opsAgent.onError(({ requestId: rid, error }) => {
          if (rid !== requestId) return
          removeDone()
          removeError()
          reject(new Error(error === 'cancelled' ? '已取消' : error))
        })
        const removeDone = window.electronAPI.opsAgent.onDone(({ requestId: rid }) => {
          if (rid !== requestId) return
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
          theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor: '#00d4aa',
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
            <Dropdown menu={{ items: sessionMenuItems }}>
              <Button size="small" icon={<MessageOutlined />}>会话 ({sessions.length})</Button>
            </Dropdown>
          </Space>
        </div>

        {/* ========== 配置面板 ========== */}
        {showConfig && (
          <div style={{ padding: 16, background: 'rgba(22,27,34,0.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #30363d', borderTop: '1px solid rgba(0,212,170,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Space>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(88,166,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(88,166,255,0.3)' }}>
                  <SettingOutlined style={{ color: '#58a6ff', fontSize: 12 }} />
                </div>
                <Text strong style={{ color: '#e6edf3', fontSize: 13, letterSpacing: 0.5 }}>模型配置</Text>
                <Text style={{ color: '#6e7681', fontSize: 11 }}>Mastra Agent · AI SDK</Text>
              </Space>
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setShowConfig(false)} style={{ color: '#8b949e' }} />
            </div>
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
              </Space>
              <Space size={2}>
                <Tooltip title="智能诊断修复"><Button size="small" type="text" icon={<ThunderboltFilled />} onClick={runIntelligentDiagnosis} loading={runningDiagnostics} style={{ color: '#00d4aa' }} /></Tooltip>
                <Tooltip title="系统诊断"><Button size="small" type="text" icon={<ScanOutlined />} onClick={runDiagnostics} loading={runningDiagnostics} style={{ color: '#8b949e' }} /></Tooltip>
                <Tooltip title="命令历史"><Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setShowHistory(true)} style={{ color: '#8b949e' }} /></Tooltip>
                <Tooltip title="新建对话"><Button size="small" type="text" icon={<PlusOutlined />} onClick={createSession} style={{ color: '#8b949e' }} /></Tooltip>
                <Tooltip title="清空对话"><Button size="small" type="text" icon={<ClearOutlined />} onClick={() => setMessages([])} disabled={messages.length === 0} /></Tooltip>
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
                      {['检查系统状态', '查看Docker容器', '查看网络连接', '查看进程'].map(tip => (
                        <Tag key={tip} className="quick-tip" onClick={() => setInputText(tip)}>{tip}</Tag>
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
                    
                    {/* AI消息 */}
                    {msg.role === 'assistant' && (
                      <div style={{ maxWidth: '90%' }}>
                        {msg.status === 'running' ? (
                          <div className="ai-msg-bubble" style={{ padding: '10px 14px', borderRadius: 12, borderTopLeftRadius: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(0,212,170,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                <RobotOutlined style={{ color: '#00d4aa', fontSize: 12 }} />
                              </div>
                              <Text style={{ color: '#e6edf3', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {msg.content || '思考中'}
                                <span className="typing-cursor" />
                              </Text>
                            </div>
                            {/* 流式工具调用 */}
                            {streamingToolCalls.length > 0 && (
                              <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 10 }}>
                                {streamingToolCalls.map((tc, idx) => (
                                  <div key={idx} className="tool-card" style={{ background: 'rgba(13,17,23,0.8)', padding: 8, borderRadius: 8, border: '1px solid #21262d' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      {tc.status === 'running' ? <Spin size="small" /> : tc.status === 'success' ? <CheckCircleOutlined style={{ color: '#3fb950' }} /> : <CloseCircleOutlined style={{ color: '#ff7b72' }} />}
                                      <CodeOutlined style={{ color: '#58a6ff' }} />
                                      <Text style={{ color: '#58a6ff', fontSize: 12, flex: 1, fontFamily: 'Consolas, monospace' }}>{tc.name}</Text>
                                      <Tag color={tc.status === 'success' ? 'green' : tc.status === 'error' ? 'red' : 'blue'} style={{ fontSize: 10, margin: 0, borderRadius: 999 }}>
                                        {tc.status === 'running' ? '执行中' : tc.status === 'success' ? '成功' : '失败'}
                                      </Tag>
                                    </div>
                                  </div>
                                ))}
                              </Space>
                            )}
                          </div>
                        ) : (
                          <div className="ai-msg-bubble" style={{ padding: '12px 14px', borderRadius: 12, borderTopLeftRadius: 4 }}>
                            {/* 消息内容 */}
                            <div style={{ fontSize: 13, lineHeight: 1.65, color: '#e6edf3' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />

                            {/* 工具调用记录 */}
                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                              <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 12 }}>
                                <Text style={{ fontSize: 11, color: '#8b949e', letterSpacing: 0.5 }}>工具调用</Text>
                                {msg.toolCalls.map((tc, idx) => (
                                  <div key={idx} className="tool-card" style={{ background: 'rgba(13,17,23,0.8)', padding: 8, borderRadius: 8, border: '1px solid #21262d' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      {tc.status === 'success' ? <CheckCircleOutlined style={{ color: '#3fb950' }} /> : <CloseCircleOutlined style={{ color: '#ff7b72' }} />}
                                      <CodeOutlined style={{ color: '#58a6ff' }} />
                                      <Text style={{ color: '#58a6ff', fontSize: 12, flex: 1, fontFamily: 'Consolas, monospace' }}>{tc.name}</Text>
                                      {tc.duration && <Text type="secondary" style={{ fontSize: 11 }}>{tc.duration}ms</Text>}
                                    </div>
                                    <pre style={{ margin: '8px 0 0 24px', maxHeight: 160, overflow: 'auto', fontSize: 11, color: '#8b949e', background: 'rgba(22,27,34,0.6)', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap', border: '1px solid #21262d' }}>
                                      {tc.result}
                                    </pre>
                                  </div>
                                ))}
                              </Space>
                            )}
                            
                            {/* 命令列表 */}
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
                            
                            {/* 时间戳 */}
                            <div style={{ fontSize: 10, color: '#484f58', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                              {new Date(msg.timestamp).toLocaleTimeString()}
                              {msg.metadata?.executionTime && <span>⏱ {msg.metadata.executionTime}ms</span>}
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
            <div className="agent-input" style={{ padding: 14, borderTop: '1px solid rgba(48,54,61,0.8)', background: 'rgba(22,27,34,0.85)' }}>
              <Space.Compact style={{ width: '100%' }}>
                <TextArea 
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
      </div>
    </ConfigProvider>
  )
}

export default AgentTerminalPage

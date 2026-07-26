/**
 * AI Agent 核心类型定义
 * 参考 OpenDev (https://github.com/opendev-to/opendev) 的架构设计
 */

// ==================== 基础类型 ====================

export type RiskLevel = 'low' | 'medium' | 'high'
export type AgentMode = 'normal' | 'plan'
export type WorkflowType = 'execution' | 'thinking' | 'compaction' | 'critique' | 'vision'
export type DiagnosticType = 'cpu' | 'memory' | 'disk' | 'network' | 'docker'
export type DiagnosticStatus = 'healthy' | 'warning' | 'critical'

// ==================== 模型配置 ====================

export type AIProvider = 'openai' | 'anthropic' | 'azure' | 'gemini' | 'ollama' | 'custom'

export interface ModelConfig {
  provider: AIProvider
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  baseUrl: string
  systemPrompt: string
  enableSandbox: boolean
  enableHistory: boolean
  maxHistoryItems: number
  // Azure OpenAI 特有配置
  azureEndpoint?: string
  azureDeployment?: string
  apiVersion?: string
  // Gemini 特有配置
  geminiBaseUrl?: string
  // Ollama 特有配置
  ollamaBaseUrl?: string
}

// 提供商预设配置
export interface ProviderPreset {
  name: string
  provider: AIProvider
  baseUrl: string
  models: string[]
  requiresApiKey: boolean
  description: string
}

export interface ModelRouting {
  execution: { provider: string; model: string }
  thinking: { provider: string; model: string }
  compaction: { provider: string; model: string }
  critique: { provider: string; model: string }
  vision: { provider: string; model: string }
}

// ==================== 消息类型 ====================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  status?: 'running' | 'success' | 'error'
  commands?: ExecutedCommand[]
  metadata?: MessageMetadata
}

export interface MessageMetadata {
  serverId?: string
  containerId?: string
  executionTime?: number
  riskLevel?: RiskLevel
  modelUsed?: string
  tokensUsed?: number
}

export interface ExecutedCommand {
  command: string
  output: string
  status: 'success' | 'error'
  executionTime?: number
  riskLevel?: RiskLevel
  serverId?: string
  timestamp?: string
}

// ==================== 会话类型 ====================

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  context?: SessionContext
}

export interface SessionContext {
  serverId?: string
  containerId?: string
  workingDirectory?: string
  environmentVariables?: Record<string, string>
}

// ==================== 工具类型 ====================

export interface Tool {
  name: string
  description: string
  parameters: ToolParameterSchema
  execute: (params: any) => Promise<ToolResult>
  validate?: (params: any) => ValidationResult
  riskLevel: RiskLevel
  requiresApproval: boolean
}

export interface ToolParameterSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    default?: any
    enum?: string[]
  }>
  required?: string[]
}

export interface ToolResult {
  success: boolean
  data?: any
  error?: string
  executionTime?: number
}

export interface ValidationResult {
  valid: boolean
  reason?: string
}

// ==================== 代理类型 ====================

export interface Agent {
  id: string
  name: string
  mode: AgentMode
  modelConfig: ModelConfig
  tools: Tool[]
  systemPrompt: string
}

export interface Plan {
  id: string
  goal: string
  steps: PlanStep[]
  riskLevel: RiskLevel
  rollbackPlan?: RollbackStep[]
  estimatedTime?: number
}

export interface PlanStep {
  id: string
  description: string
  command?: string
  tool?: string
  params?: any
  riskLevel: RiskLevel
  dependencies?: string[]
  rollbackCommand?: string
}

export interface RollbackStep {
  stepId: string
  command: string
  description: string
}

// ==================== 上下文类型 ====================

export interface ContextWindow {
  maxTokens: number
  currentTokens: number
  messages: ChatMessage[]
  compressed: boolean
}

export interface SystemReminder {
  id: string
  trigger: string
  frequency: { max: number; per: number }
  content: string
  lastInjected?: number
}

export interface MemoryEntry {
  id: string
  type: 'fact' | 'preference' | 'lesson' | 'context'
  content: string
  importance: number
  timestamp: string
  tags?: string[]
}

// ==================== 诊断类型 ====================

export interface DiagnosticResult {
  type: DiagnosticType
  status: DiagnosticStatus
  value: number
  message: string
  suggestion?: string
  timestamp: string
}

export interface DiagnosticReport {
  serverId: string
  timestamp: string
  results: DiagnosticResult[]
  overallStatus: DiagnosticStatus
  recommendations: string[]
}

// ==================== 命令历史类型 ====================

export interface CommandHistoryItem {
  id: string
  command: string
  description: string
  timestamp: string
  serverId: string
  success: boolean
  executionTime: number
  riskLevel: RiskLevel
  output?: string
  tags?: string[]
}

// ==================== 终端类型 ====================

export interface TerminalTab {
  sessionId: string
  containerId: string
  containerName: string
  serverId: string
  serverName: string
  type: 'server' | 'container'
  elementId: string
  createdAt: string
}

export interface ContainerOption {
  id: string
  name: string
  image: string
  status: string
}

// ==================== 安全类型 ====================

export interface SafetyCheck {
  level: RiskLevel
  passed: boolean
  checks: {
    promptGuard: boolean
    schemaValidation: boolean
    runtimeApproval: boolean
    toolValidation: boolean
    lifecycleHook: boolean
  }
  failures: string[]
}

export interface ApprovalRequest {
  id: string
  action: string
  riskLevel: RiskLevel
  details: string
  timestamp: string
  approved?: boolean
}

// ==================== 持久化类型 ====================

export interface PersistenceConfig {
  autoSave: boolean
  saveInterval: number
  maxSessions: number
  compressOldSessions: boolean
}

export interface SessionSnapshot {
  session: ChatSession
  timestamp: string
  version: number
}

// ==================== MCP 类型 ====================

export interface MCPServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: any
  server: string
}

// ==================== 事件类型 ====================

export type AgentEventType =
  | 'message_received'
  | 'message_sent'
  | 'command_executed'
  | 'command_failed'
  | 'context_compressed'
  | 'safety_check_failed'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'session_saved'
  | 'session_loaded'
  | 'diagnostic_completed'

export interface AgentEvent {
  type: AgentEventType
  timestamp: string
  data?: any
  sessionId?: string
}

// ==================== 配置常量 ====================

// 提供商预设配置
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    description: 'OpenAI GPT 系列模型'
  },
  {
    name: 'Anthropic',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
    requiresApiKey: true,
    description: 'Anthropic Claude 系列模型'
  },
  {
    name: 'Azure OpenAI',
    provider: 'azure',
    baseUrl: '',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    description: 'Azure OpenAI 服务'
  },
  {
    name: 'Google Gemini',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresApiKey: true,
    description: 'Google Gemini 系列模型'
  },
  {
    name: 'Ollama (本地)',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.3', 'qwen2.5', 'codellama', 'mistral'],
    requiresApiKey: false,
    description: '本地 Ollama 模型'
  },
  {
    name: '自定义',
    provider: 'custom',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    description: '自定义 OpenAI 兼容 API'
  }
]

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai',
  apiKey: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2000,
  baseUrl: '',
  systemPrompt: `你是一个专业的服务器运维 AI 助手。你可以帮助用户管理和监控远程服务器。

核心能力：
1. 自然语言理解：理解用户的运维需求
2. 命令生成：生成准确、安全的 Linux 命令
3. 系统诊断：分析系统状态和性能问题
4. 故障排查：帮助定位和解决服务器问题
5. 安全建议：提供安全最佳实践

安全规则：
- 执行危险命令前必须确认
- 避免执行不可逆操作
- 建议使用 --dry-run 或 -i 选项
- 涉及数据删除时必须二次确认

响应格式：
1. 先给出分析和建议
2. 然后提供要执行的命令，使用以下格式：
   CMD: command1
   CMD: command2
3. 说明命令的作用和风险等级

请根据用户需求提供专业的服务器运维建议。`,
  enableSandbox: true,
  enableHistory: true,
  maxHistoryItems: 100
}

export const RISK_PATTERNS = {
  high: [
    /rm\s+-rf/i,
    /mkfs/i,
    /dd\s+if=\/dev\/zero/i,
    /chmod\s+777/i,
    /chown\s+-R\s+root/i,
    /iptables\s+-F/i,
    /systemctl\s+(stop|disable)\s+(ssh|network|firewalld)/i,
    /docker\s+rm\s+-f/i,
    /kubectl\s+delete/i,
    /DROP\s+TABLE/i,
    /TRUNCATE/i,
    /fdisk/i,
    /parted/i,
    /mkfs\./i,
    /:\s*()\s*{\s*:\s*|:()\s*}/i,  // Fork bomb
  ],
  medium: [
    /rm\s+/i,
    /kill\s+-9/i,
    /reboot/i,
    /shutdown/i,
    /systemctl\s+restart/i,
    /docker\s+stop/i,
    /kubectl\s+apply/i,
    /apt\s+(remove|purge)/i,
    /yum\s+remove/i,
    /pip\s+uninstall/i,
    /npm\s+uninstall/i,
    /mv\s+/i,
    /cp\s+-r/i,
    /tar\s+/i,
    /curl\s+/i,
    /wget\s+/i,
  ]
}

export const CONTEXT_THRESHOLDS = {
  warning: 0.6,    // 60% 开始警告
  critical: 0.8,   // 80% 开始压缩
  emergency: 0.9,  // 90% 紧急压缩
  max: 0.95        // 95% 强制压缩
}

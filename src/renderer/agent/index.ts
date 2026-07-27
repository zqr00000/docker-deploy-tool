/**
 * AI Agent 主入口
 * 整合所有模块，提供统一的Agent接口
 */

import type { 
  ChatMessage, 
  ChatSession, 
  ModelConfig, 
  Plan, 
  ExecutedCommand,
  TerminalTab,
  ContainerOption,
  DiagnosticResult,
  CommandHistoryItem
} from './types'
import { DEFAULT_MODEL_CONFIG, PROVIDER_PRESETS } from './types'
import { ToolRegistry, createBuiltInTools, assessRiskLevel } from './tool-registry'
import { SafetySystem } from './safety-system'
import { ContextManager } from './context-manager'
import { PlanningAgent } from './planning-agent'
import { ExecutionAgent } from './execution-agent'
import { PersistenceManager } from './persistence-manager'

// 导出常量
export { DEFAULT_MODEL_CONFIG, PROVIDER_PRESETS }

export class AIAgent {
  private toolRegistry: ToolRegistry
  private safetySystem: SafetySystem
  private contextManager: ContextManager
  private planningAgent: PlanningAgent
  private executionAgent: ExecutionAgent
  private persistenceManager: PersistenceManager
  
  private modelConfig: ModelConfig
  private currentSession: ChatSession | null = null
  private static instance: AIAgent

  static getInstance(): AIAgent {
    if (!AIAgent.instance) {
      AIAgent.instance = new AIAgent()
    }
    return AIAgent.instance
  }

  constructor() {
    this.toolRegistry = ToolRegistry.getInstance()
    this.safetySystem = SafetySystem.getInstance()
    this.contextManager = ContextManager.getInstance()
    this.planningAgent = new PlanningAgent()
    this.executionAgent = new ExecutionAgent()
    this.persistenceManager = PersistenceManager.getInstance()
    
    this.modelConfig = DEFAULT_MODEL_CONFIG
    
    // 注册内置工具
    this.toolRegistry.registerAll(createBuiltInTools())
  }

  // ==================== 配置管理 ====================

  // 更新模型配置
  updateModelConfig(config: Partial<ModelConfig>): void {
    this.modelConfig = { ...this.modelConfig, ...config }
  }

  // 获取模型配置
  getModelConfig(): ModelConfig {
    return { ...this.modelConfig }
  }

  // ==================== 会话管理 ====================

  // 创建新会话
  createSession(name?: string): ChatSession {
    const session: ChatSession = {
      id: `session-${Date.now()}`,
      name: name || `对话 ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    this.currentSession = session
    return session
  }

  // 加载会话
  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const session = await this.persistenceManager.loadSession(sessionId)
    if (session) {
      this.currentSession = session
    }
    return session
  }

  // 保存当前会话
  async saveCurrentSession(): Promise<void> {
    if (this.currentSession) {
      this.currentSession.updatedAt = new Date().toISOString()
      await this.persistenceManager.saveSession(this.currentSession)
    }
  }

  // 获取所有会话
  async getAllSessions(): Promise<ChatSession[]> {
    return await this.persistenceManager.getAllSessions()
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    await this.persistenceManager.deleteSession(sessionId)
    if (this.currentSession?.id === sessionId) {
      this.currentSession = null
    }
  }

  // 获取当前会话
  getCurrentSession(): ChatSession | null {
    return this.currentSession
  }

  // ==================== 消息处理 ====================

  // 发送消息
  async sendMessage(content: string): Promise<ChatMessage> {
    if (!this.currentSession) {
      this.createSession()
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    // 添加到会话
    this.currentSession!.messages.push(userMessage)

    // 生成AI响应
    const assistantMessage = await this.generateResponse(content)
    this.currentSession!.messages.push(assistantMessage)

    // 自动保存
    await this.saveCurrentSession()

    return assistantMessage
  }

  // 生成AI响应
  private async generateResponse(userInput: string): Promise<ChatMessage> {
    const startTime = Date.now()

    try {
      // 1. 获取对话历史
      const history = this.currentSession!.messages.slice(-10)
      
      // 2. 上下文压缩
      const compressedHistory = await this.contextManager.compress(
        history,
        this.modelConfig.maxTokens
      )

      // 3. 注入系统提醒
      const messagesWithReminders = await this.contextManager.injectReminders(
        compressedHistory,
        this.currentSession!.messages.length
      )

      // 4. 调用AI API
      const response = await this.callAI(userInput, messagesWithReminders)

      // 5. 解析命令
      const commands = this.parseCommands(response)

      return {
        id: `msg-${Date.now()}-response`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
        status: 'success',
        commands: commands.length > 0 ? commands : undefined,
        metadata: {
          executionTime: Date.now() - startTime,
          modelUsed: this.modelConfig.model
        }
      }
    } catch (error) {
      return {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `错误: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        status: 'error'
      }
    }
  }

  // 调用AI API（支持多提供商）
  private async callAI(userInput: string, history: ChatMessage[]): Promise<string> {
    const { provider, apiKey, model, temperature, maxTokens, baseUrl, systemPrompt, azureEndpoint, azureDeployment, apiVersion, ollamaBaseUrl } = this.modelConfig

    if (!model) throw new Error('请选择模型')
    // Ollama 不需要 API Key
    if (provider !== 'ollama' && !apiKey) throw new Error('请先配置 API Key')

    const systemContent = (systemPrompt || DEFAULT_MODEL_CONFIG.systemPrompt)

    // 根据不同提供商构建消息格式
    const messages = this.buildMessages(provider, systemContent, history, userInput)

    // 构建请求参数
    const requestParams = this.buildRequestParams(provider, {
      apiKey, model, temperature, maxTokens, baseUrl,
      azureEndpoint, azureDeployment, apiVersion,
      ollamaBaseUrl: ollamaBaseUrl || 'http://localhost:11434'
    })

    const result = await window.electronAPI.ai.chat(
      provider,
      requestParams.apiKey,
      requestParams.model,
      messages,
      temperature,
      maxTokens,
      requestParams.baseUrl,
      requestParams.extraParams
    )

    if (!result.success) {
      throw new Error(result.error || 'API 请求失败')
    }

    // 解析不同提供商的响应
    return this.parseResponse(provider, result.data)
  }

  // 构建消息格式
  private buildMessages(provider: string, systemContent: string, history: ChatMessage[], userInput: string): any[] {
    // Anthropic 需要特殊处理 system 消息
    if (provider === 'anthropic') {
      return [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userInput }
      ]
    }
    // Gemini 使用 contents 格式
    if (provider === 'gemini') {
      return [
        ...history.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        { role: 'user', parts: [{ text: userInput }] }
      ]
    }
    // OpenAI / Azure / Ollama / Custom
    return [
      { role: 'system', content: systemContent },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userInput }
    ]
  }

  // 构建请求参数
  private buildRequestParams(provider: string, config: any): any {
    const { apiKey, model, baseUrl, azureEndpoint, azureDeployment, apiVersion, ollamaBaseUrl } = config

    switch (provider) {
      case 'anthropic':
        return {
          apiKey,
          model,
          baseUrl: baseUrl || 'https://api.anthropic.com/v1',
          extraParams: { systemPrompt: config.systemPrompt }
        }
      case 'azure':
        return {
          apiKey,
          model: azureDeployment || model,
          baseUrl: azureEndpoint || baseUrl,
          extraParams: { apiVersion: apiVersion || '2024-02-01' }
        }
      case 'gemini':
        return {
          apiKey,
          model,
          baseUrl: baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
          extraParams: {}
        }
      case 'ollama':
        return {
          apiKey: 'ollama', // Ollama 不需要 key
          model,
          baseUrl: ollamaBaseUrl || 'http://localhost:11434/v1',
          extraParams: {}
        }
      default:
        return {
          apiKey,
          model,
          baseUrl: baseUrl || 'https://api.openai.com/v1',
          extraParams: {}
        }
    }
  }

  // 解析响应
  private parseResponse(provider: string, data: any): string {
    switch (provider) {
      case 'anthropic':
        return data.content?.[0]?.text || ''
      case 'gemini':
        return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      case 'ollama':
        return data.choices?.[0]?.message?.content || data.response || ''
      default:
        return data.choices?.[0]?.message?.content || ''
    }
  }

  // 解析命令
  parseCommands(content: string): ExecutedCommand[] {
    const commands: ExecutedCommand[] = []
    const cmdRegex = /CMD:\s*(.+)/g
    let match

    while ((match = cmdRegex.exec(content)) !== null) {
      const cmd = match[1].trim()
      const riskLevel = assessRiskLevel(cmd)
      commands.push({
        command: cmd,
        output: '',
        status: 'success',
        riskLevel
      })
    }

    return commands
  }

  // ==================== 命令执行 ====================

  // 执行命令
  async executeCommand(command: string, serverId: string): Promise<ExecutedCommand> {
    const riskLevel = assessRiskLevel(command)

    // 安全检查
    const safetyCheck = await this.safetySystem.validate(command, { serverId })
    if (!safetyCheck.passed) {
      return {
        command,
        output: `安全检查未通过: ${safetyCheck.failures.join(', ')}`,
        status: 'error',
        riskLevel
      }
    }

    const startTime = Date.now()

    try {
      const result = await window.electronAPI.server.executeCommand(serverId, command)
      const executionTime = Date.now() - startTime

      const executedCommand: ExecutedCommand = {
        command,
        output: result.success ? result.stdout : result.stderr,
        status: result.success ? 'success' : 'error',
        riskLevel,
        executionTime,
        serverId,
        timestamp: new Date().toISOString()
      }

      // 保存到历史
      await this.persistenceManager.saveCommandHistory({
        id: `cmd-${Date.now()}`,
        command,
        description: '',
        timestamp: executedCommand.timestamp!,
        serverId,
        success: result.success,
        executionTime,
        riskLevel,
        output: result.stdout
      })

      return executedCommand
    } catch (error) {
      return {
        command,
        output: (error as Error).message,
        status: 'error',
        riskLevel,
        executionTime: Date.now() - startTime,
        serverId
      }
    }
  }

  // 批量执行命令
  async executeBatch(commands: Array<{ command: string; serverId: string }>): Promise<ExecutedCommand[]> {
    return await this.executionAgent.executeBatch(commands)
  }

  // ==================== 计划执行 ====================

  // 创建执行计划
  async createPlan(task: string, context: any): Promise<Plan> {
    return await this.planningAgent.plan(task, context)
  }

  // 执行计划
  async executePlan(plan: Plan, onProgress?: (step: any, result: ExecutedCommand) => void): Promise<ExecutedCommand[]> {
    return await this.executionAgent.execute(plan, onProgress)
  }

  // ==================== 系统诊断 ====================

  // 运行系统诊断
  async runDiagnostics(serverId: string): Promise<DiagnosticResult[]> {
    const diagnosticCommands = [
      { type: 'cpu' as const, cmd: "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'" },
      { type: 'memory' as const, cmd: "free | grep Mem | awk '{print ($3/$2) * 100}'" },
      { type: 'disk' as const, cmd: "df / | tail -1 | awk '{print $5}' | sed 's/%//'" },
      { type: 'docker' as const, cmd: "docker ps --format '{{.Names}}' | wc -l" }
    ]

    const results: DiagnosticResult[] = []

    for (const diag of diagnosticCommands) {
      try {
        const result = await window.electronAPI.server.executeCommand(serverId, diag.cmd)
        const value = parseFloat(result.stdout) || 0

        let status: 'healthy' | 'warning' | 'critical' = 'healthy'
        let message = ''
        let suggestion: string | undefined

        switch (diag.type) {
          case 'cpu':
            if (value > 90) { status = 'critical'; message = 'CPU使用率过高'; suggestion = '建议检查高负载进程' }
            else if (value > 70) { status = 'warning'; message = 'CPU使用率较高' }
            else message = 'CPU使用率正常'
            break
          case 'memory':
            if (value > 90) { status = 'critical'; message = '内存使用率过高'; suggestion = '建议释放内存或增加内存' }
            else if (value > 70) { status = 'warning'; message = '内存使用率较高' }
            else message = '内存使用率正常'
            break
          case 'disk':
            if (value > 90) { status = 'critical'; message = '磁盘空间不足'; suggestion = '建议清理磁盘空间' }
            else if (value > 70) { status = 'warning'; message = '磁盘空间较少' }
            else message = '磁盘空间充足'
            break
          case 'docker':
            message = `运行 ${value} 个容器`
            break
        }

        results.push({ type: diag.type, status, value, message, suggestion, timestamp: new Date().toISOString() })
      } catch (error) {
        results.push({ type: diag.type, status: 'critical', value: 0, message: '诊断失败', timestamp: new Date().toISOString() })
      }
    }

    return results
  }

  // ==================== 命令历史 ====================

  // 获取命令历史
  async getCommandHistory(): Promise<CommandHistoryItem[]> {
    return await this.persistenceManager.getCommandHistory()
  }

  // 清除命令历史
  async clearCommandHistory(): Promise<void> {
    await this.persistenceManager.clearCommandHistory()
  }

  // ==================== 工具管理 ====================

  // 获取可用工具
  getAvailableTools(): Array<{ name: string; description: string }> {
    return this.toolRegistry.getToolList()
  }

  // 执行工具
  async executeTool(name: string, params: any): Promise<any> {
    return await this.toolRegistry.execute(name, params)
  }

  // ==================== 数据导入导出 ====================

  // 导出数据
  async exportData(): Promise<string> {
    return await this.persistenceManager.exportAll()
  }

  // 导入数据
  async importData(jsonData: string): Promise<boolean> {
    return await this.persistenceManager.importAll(jsonData)
  }

  // ==================== 清理 ====================

  // 清理过期数据
  async cleanup(maxAge: number = 30): Promise<void> {
    await this.persistenceManager.cleanup(maxAge)
  }
}

// 导出单例
export const aiAgent = AIAgent.getInstance()

// 导出类型
export * from './types'
export { ToolRegistry, createBuiltInTools, assessRiskLevel } from './tool-registry'
export { SafetySystem } from './safety-system'
export { ContextManager } from './context-manager'
export { PlanningAgent } from './planning-agent'
export { ExecutionAgent } from './execution-agent'
export { PersistenceManager } from './persistence-manager'

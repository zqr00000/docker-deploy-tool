/**
 * 上下文管理器
 * 参考 OpenDev 的自适应上下文压缩和系统提醒机制
 */

import type { ChatMessage, ContextWindow, SystemReminder, MemoryEntry } from './types'
import { CONTEXT_THRESHOLDS } from './types'

export class ContextManager {
  private reminders: SystemReminder[] = []
  private memory: MemoryEntry[] = []
  private static instance: ContextManager

  static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager()
    }
    return ContextManager.instance
  }

  constructor() {
    this.initDefaultReminders()
  }

  // 初始化默认提醒
  private initDefaultReminders(): void {
    this.reminders = [
      {
        id: 'instruction-reminder',
        trigger: 'instruction_fade',
        frequency: { max: 1, per: 10 },
        content: 'Remember: Always confirm before executing destructive operations. Use --dry-run when possible.'
      },
      {
        id: 'context-compressed',
        trigger: 'context_compaction',
        frequency: { max: 1, per: 1 },
        content: 'Context has been compressed. Key information preserved: {summary}'
      },
      {
        id: 'error-recovery',
        trigger: 'error_recovery',
        frequency: { max: 3, per: 5 },
        content: 'Previous error occurred: {error}. Suggested fix: {fix}'
      },
      {
        id: 'long-session',
        trigger: 'long_session',
        frequency: { max: 1, per: 15 },
        content: 'This is a long session. Consider summarizing progress and creating a checkpoint.'
      }
    ]
  }

  // 获取当前上下文窗口
  getContextWindow(messages: ChatMessage[], maxTokens: number): ContextWindow {
    const currentTokens = this.estimateTokens(messages)
    
    return {
      maxTokens,
      currentTokens,
      messages,
      compressed: false
    }
  }

  // 估算token数量（简化版）
  estimateTokens(messages: ChatMessage[]): number {
    let tokens = 0
    for (const msg of messages) {
      // 粗略估算：1个token ≈ 4个字符（英文）或 1-2个字符（中文）
      tokens += Math.ceil(msg.content.length / 3)
    }
    return tokens
  }

  // 自适应上下文压缩（增强版 - 基于重要性评分）
  async compress(messages: ChatMessage[], maxTokens: number): Promise<ChatMessage[]> {
    const currentTokens = this.estimateTokens(messages)
    const ratio = currentTokens / maxTokens

    // 根据压缩比例选择策略
    if (ratio < CONTEXT_THRESHOLDS.warning) {
      return messages // 不需要压缩
    }

    let compressed: ChatMessage[]

    if (ratio >= CONTEXT_THRESHOLDS.max) {
      compressed = await this.emergencyCompact(messages, maxTokens)
    } else if (ratio >= CONTEXT_THRESHOLDS.emergency) {
      compressed = await this.aggressiveCompact(messages, maxTokens)
    } else if (ratio >= CONTEXT_THRESHOLDS.critical) {
      compressed = await this.moderateCompact(messages, maxTokens)
    } else {
      compressed = await this.lightCompact(messages, maxTokens)
    }

    return compressed
  }

  // 计算消息重要性评分（0-100）
  calculateImportance(message: ChatMessage): number {
    let score = 50 // 基础分

    // 系统消息最重要
    if (message.role === 'system') score += 50

    // 用户消息比助手消息重要
    if (message.role === 'user') score += 20

    // 包含命令的消息更重要
    if (message.commands && message.commands.length > 0) {
      score += 15
    }

    // 包含错误的消息重要
    if (message.content.match(/error|错误|failed|失败/i)) {
      score += 20
    }

    // 包含成功执行结果的消息重要
    if (message.content.match(/success|成功|completed|完成/i)) {
      score += 10
    }

    // 包含 CMD: 的消息重要
    if (message.content.includes('CMD:')) {
      score += 15
    }

    // 包含诊断结果的消息重要
    if (message.content.match(/CPU|内存|磁盘|Docker|healthy|warning|critical/i)) {
      score += 10
    }

    // 最近的消息更重要（时间衰减）
    const messageTime = new Date(message.timestamp).getTime()
    const now = Date.now()
    const hoursSince = (now - messageTime) / (1000 * 60 * 60)
    if (hoursSince < 1) score += 10
    else if (hoursSince < 24) score += 5
    else if (hoursSince > 168) score -= 20 // 一周前的消息降低权重

    // 长消息可能包含更多信息
    if (message.content.length > 500) score += 5
    if (message.content.length > 2000) score -= 10 // 但太长可能是冗余输出

    return Math.max(0, Math.min(100, score))
  }

  // 轻度压缩 - 移除重复观察
  private async lightCompact(messages: ChatMessage[], maxTokens: number): Promise<ChatMessage[]> {
    const seen = new Set<string>()
    const result: ChatMessage[] = []

    for (const msg of messages) {
      // 保留系统消息和用户消息
      if (msg.role === 'system' || msg.role === 'user') {
        result.push(msg)
        continue
      }

      // 去重助手消息
      const key = msg.content.substring(0, 100)
      if (!seen.has(key)) {
        seen.add(key)
        result.push(msg)
      }
    }

    return result
  }

  // 中度压缩 - 基于重要性选择性保留
  private async moderateCompact(messages: ChatMessage[], maxTokens: number): Promise<ChatMessage[]> {
    if (messages.length <= 3) return messages

    // 计算每条消息的重要性
    const scoredMessages = messages.map(msg => ({
      message: msg,
      score: this.calculateImportance(msg),
      tokens: Math.ceil(msg.content.length / 3)
    }))

    // 按重要性排序
    scoredMessages.sort((a, b) => b.score - a.score)

    // 保留重要消息，直到达到 token 限制的 70%
    const targetTokens = maxTokens * 0.7
    let usedTokens = 0
    const keptMessages: ChatMessage[] = []

    // 始终保留系统消息
    const systemMessages = messages.filter(m => m.role === 'system')
    for (const msg of systemMessages) {
      keptMessages.push(msg)
      usedTokens += Math.ceil(msg.content.length / 3)
    }

    // 按重要性添加其他消息
    for (const { message, tokens } of scoredMessages) {
      if (message.role === 'system') continue // 已添加
      if (usedTokens + tokens > targetTokens) continue
      keptMessages.push(message)
      usedTokens += tokens
    }

    // 按原始顺序排序
    keptMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // 对丢弃的消息生成摘要
    const discardedMessages = messages.filter(m => !keptMessages.includes(m))
    if (discardedMessages.length > 0) {
      const summary = await this.summarizeMessages(discardedMessages)
      keptMessages.unshift({
        id: `summary-${Date.now()}`,
        role: 'system',
        content: `[对话摘要]: ${summary}`,
        timestamp: new Date().toISOString()
      })
    }

    return keptMessages
  }

  // 激进压缩 - 压缩工具结果
  private async aggressiveCompact(messages: ChatMessage[], maxTokens: number): Promise<ChatMessage[]> {
    const result: ChatMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push(msg)
      } else if (msg.role === 'user') {
        result.push(msg)
      } else {
        // 压缩助手消息中的长输出
        let content = msg.content
        if (content.length > 500) {
          content = content.substring(0, 200) + '\n... [truncated] ...\n' + content.substring(content.length - 200)
        }
        result.push({ ...msg, content })
      }
    }

    return result
  }

  // 紧急压缩 - 只保留核心信息
  private async emergencyCompact(messages: ChatMessage[], maxTokens: number): Promise<ChatMessage[]> {
    const systemMessages = messages.filter(m => m.role === 'system')
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()
    const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop()

    const emergencyMessages: ChatMessage[] = [
      ...systemMessages,
      {
        id: `emergency-summary-${Date.now()}`,
        role: 'system',
        content: '[Emergency compression] Session history compressed due to token limit.',
        timestamp: new Date().toISOString()
      }
    ]

    if (lastUserMsg) emergencyMessages.push(lastUserMsg)
    if (lastAssistantMsg) emergencyMessages.push(lastAssistantMsg)

    return emergencyMessages
  }

  // 摘要消息
  private async summarizeMessages(messages: ChatMessage[]): Promise<string> {
    // 简化版摘要：提取关键信息
    const topics = new Set<string>()
    const commands: string[] = []

    for (const msg of messages) {
      // 提取CMD命令
      const cmdMatches = msg.content.match(/CMD:\s*(.+)/g)
      if (cmdMatches) {
        commands.push(...cmdMatches.map(c => c.replace('CMD:', '').trim()))
      }

      // 提取关键主题
      if (msg.content.includes('error') || msg.content.includes('Error')) {
        topics.add('encountered errors')
      }
      if (msg.content.includes('success') || msg.content.includes('Success')) {
        topics.add('successful operations')
      }
      if (msg.content.includes('docker') || msg.content.includes('Docker')) {
        topics.add('Docker operations')
      }
      if (msg.content.includes('install') || msg.content.includes('Install')) {
        topics.add('software installation')
      }
    }

    const summaryParts: string[] = []
    if (topics.size > 0) {
      summaryParts.push(`Topics: ${Array.from(topics).join(', ')}`)
    }
    if (commands.length > 0) {
      summaryParts.push(`Executed ${commands.length} commands`)
    }

    return summaryParts.join('. ') || 'General troubleshooting session'
  }

  // 注入系统提醒
  async injectReminders(messages: ChatMessage[], turnCount: number): Promise<ChatMessage[]> {
    const remindersToInject: ChatMessage[] = []

    for (const reminder of this.reminders) {
      if (this.shouldInjectReminder(reminder, turnCount)) {
        const content = reminder.content.replace('{summary}', await this.getRecentSummary(messages))
        
        remindersToInject.push({
          id: `reminder-${reminder.id}-${Date.now()}`,
          role: 'user',
          content: `[System Reminder]: ${content}`,
          timestamp: new Date().toISOString()
        })

        reminder.lastInjected = turnCount
      }
    }

    return [...remindersToInject, ...messages]
  }

  // 检查是否应该注入提醒
  private shouldInjectReminder(reminder: SystemReminder, turnCount: number): boolean {
    if (!reminder.lastInjected) return true
    
    const turnsSinceLastInjection = turnCount - reminder.lastInjected
    return turnsSinceLastInjection >= reminder.frequency.per
  }

  // 获取最近摘要
  private async getRecentSummary(messages: ChatMessage[]): Promise<string> {
    const recentMessages = messages.slice(-4)
    return this.summarizeMessages(recentMessages)
  }

  // 添加记忆
  addMemory(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): void {
    this.memory.push({
      ...entry,
      id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    })

    // 限制记忆数量
    if (this.memory.length > 100) {
      this.memory = this.memory.slice(-100)
    }
  }

  // 获取相关记忆
  getRelevantMemory(query: string, limit: number = 5): MemoryEntry[] {
    // 简单的相关性评分
    const scored = this.memory.map(entry => {
      const score = this.calculateRelevance(entry.content, query)
      return { entry, score }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry)
  }

  // 计算相关性
  private calculateRelevance(content: string, query: string): number {
    const contentLower = content.toLowerCase()
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/)

    let score = 0
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        score += 1
      }
    }

    return score / queryWords.length
  }

  // 清除记忆
  clearMemory(): void {
    this.memory = []
  }

  // 获取所有记忆
  getAllMemory(): MemoryEntry[] {
    return [...this.memory]
  }
}

// 导出单例
export const contextManager = ContextManager.getInstance()

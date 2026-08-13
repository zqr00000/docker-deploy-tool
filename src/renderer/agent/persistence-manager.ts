/**
 * 持久化管理器
 * 参考 OpenDev 的4级配置系统和会话持久化
 */

import type { ChatSession, CommandHistoryItem, PersistenceConfig } from './types'

export class PersistenceManager {
  private config: PersistenceConfig
  private static instance: PersistenceManager

  static getInstance(): PersistenceManager {
    if (!PersistenceManager.instance) {
      PersistenceManager.instance = new PersistenceManager()
    }
    return PersistenceManager.instance
  }

  constructor() {
    this.config = {
      autoSave: true,
      saveInterval: 30000,
      maxSessions: 50,
      compressOldSessions: true
    }
  }

  // ==================== 会话持久化 ====================

  // 保存会话
  async saveSession(session: ChatSession): Promise<void> {
    try {
      const key = `session-${session.id}`
      const data = JSON.stringify(session)
      localStorage.setItem(key, data)
      
      // 更新会话索引
      await this.updateSessionIndex(session.id, session.name)
    } catch (error) {
      console.error('[Persistence] Failed to save session:', error)
    }
  }

  // 加载会话
  async loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const key = `session-${sessionId}`
      const data = localStorage.getItem(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('[Persistence] Failed to load session:', error)
      return null
    }
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    try {
      localStorage.removeItem(`session-${sessionId}`)
      await this.removeFromSessionIndex(sessionId)
    } catch (error) {
      console.error('[Persistence] Failed to delete session:', error)
    }
  }

  // 获取所有会话（一次遍历 localStorage，避免索引逐条读取的 N+1）
  async getAllSessions(): Promise<ChatSession[]> {
    try {
      const sessions: ChatSession[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('session-') && key !== 'session-index') {
          const data = localStorage.getItem(key)
          if (data) {
            try {
              const session = JSON.parse(data)
              if (session && session.id) sessions.push(session)
            } catch { /* 忽略损坏的会话数据 */ }
          }
        }
      }
      return sessions.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('[Persistence] Failed to get sessions:', error)
      return []
    }
  }

  // 更新会话索引
  private async updateSessionIndex(sessionId: string, name: string): Promise<void> {
    const key = 'session-index'
    const index = this.getSessionIndex()
    
    const existingIndex = index.findIndex(item => item.id === sessionId)
    if (existingIndex >= 0) {
      index[existingIndex] = { id: sessionId, name, updatedAt: new Date().toISOString() }
    } else {
      index.unshift({ id: sessionId, name, updatedAt: new Date().toISOString() })
    }

    // 限制会话数量
    if (index.length > this.config.maxSessions) {
      const removed = index.splice(this.config.maxSessions)
      for (const item of removed) {
        localStorage.removeItem(`session-${item.id}`)
      }
    }

    localStorage.setItem(key, JSON.stringify(index))
  }

  // 从索引中移除
  private async removeFromSessionIndex(sessionId: string): Promise<void> {
    const key = 'session-index'
    const index = this.getSessionIndex()
    const filtered = index.filter(item => item.id !== sessionId)
    localStorage.setItem(key, JSON.stringify(filtered))
  }

  // 获取会话索引
  private getSessionIndex(): Array<{ id: string; name: string; updatedAt: string }> {
    try {
      const data = localStorage.getItem('session-index')
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  // ==================== 命令历史持久化 ====================

  // 保存命令历史
  async saveCommandHistory(item: CommandHistoryItem): Promise<void> {
    try {
      const history = await this.getCommandHistory()
      history.unshift(item)

      // 限制历史数量
      const maxItems = 100
      if (history.length > maxItems) {
        history.splice(maxItems)
      }

      localStorage.setItem('command-history', JSON.stringify(history))
    } catch (error) {
      console.error('[Persistence] Failed to save command history:', error)
    }
  }

  // 获取命令历史
  async getCommandHistory(): Promise<CommandHistoryItem[]> {
    try {
      const data = localStorage.getItem('command-history')
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  // 清除命令历史
  async clearCommandHistory(): Promise<void> {
    localStorage.removeItem('command-history')
  }

  // ==================== 配置持久化 ====================

  // 保存配置
  async saveConfig(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(`config-${key}`, JSON.stringify(value))
    } catch (error) {
      console.error('[Persistence] Failed to save config:', error)
    }
  }

  // 加载配置
  async loadConfig<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const data = localStorage.getItem(`config-${key}`)
      return data ? JSON.parse(data) : defaultValue
    } catch {
      return defaultValue
    }
  }

  // ==================== 导入导出 ====================

  // 导出所有数据
  async exportAll(): Promise<string> {
    const data = {
      sessions: await this.getAllSessions(),
      commandHistory: await this.getCommandHistory(),
      config: this.getAllConfigs(),
      exportedAt: new Date().toISOString()
    }
    return JSON.stringify(data, null, 2)
  }

  // 导入数据
  async importAll(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData)
      
      if (data.sessions) {
        for (const session of data.sessions) {
          await this.saveSession(session)
        }
      }

      if (data.commandHistory) {
        localStorage.setItem('command-history', JSON.stringify(data.commandHistory))
      }

      if (data.config) {
        for (const [key, value] of Object.entries(data.config)) {
          await this.saveConfig(key, value)
        }
      }

      return true
    } catch (error) {
      console.error('[Persistence] Failed to import data:', error)
      return false
    }
  }

  // 获取所有配置
  private getAllConfigs(): Record<string, any> {
    const configs: Record<string, any> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('config-')) {
        const configKey = key.replace('config-', '')
        try {
          configs[configKey] = JSON.parse(localStorage.getItem(key) || '{}')
        } catch {
          // ignore
        }
      }
    }
    return configs
  }

  // ==================== 清理 ====================

  // 清理过期数据
  async cleanup(maxAge: number = 30): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - maxAge)

    // 清理旧会话
    const sessions = await this.getAllSessions()
    for (const session of sessions) {
      const updatedAt = new Date(session.updatedAt)
      if (updatedAt < cutoffDate) {
        await this.deleteSession(session.id)
      }
    }

    // 清理旧命令历史
    const history = await this.getCommandHistory()
    const filteredHistory = history.filter(item => 
      new Date(item.timestamp) >= cutoffDate
    )
    localStorage.setItem('command-history', JSON.stringify(filteredHistory))
  }
}

// 导出单例
export const persistenceManager = PersistenceManager.getInstance()

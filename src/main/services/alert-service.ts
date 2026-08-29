import log from 'electron-log'
import { Notification } from 'electron'
import { generateId } from '../ssh'
import { alertRuleQueries, alertHistoryQueries, serverQueries, appQueries, AlertRuleRow, AlertHistoryRow } from '../database'

export type AlertRuleType = 'container_exit' | 'container_restart_loop' | 'high_cpu' | 'high_memory' | 'high_disk'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'active' | 'resolved'
export type NotifyChannel = 'system' | 'webhook'

export interface AlertRule {
  id: string
  name: string
  ruleType: AlertRuleType
  serverId?: string
  appId?: string
  threshold?: number
  enabled: boolean
  notifyChannels: NotifyChannel[]
  /** 规则级静默窗口（分钟）：同一目标在窗口内不重复触发 */
  silenceMinutes?: number
  createdAt: string
  updatedAt: string
}

export interface AlertHistoryEntry {
  id: string
  ruleId: string
  ruleName: string
  alertType: AlertRuleType
  message: string
  severity: AlertSeverity
  status: AlertStatus
  triggeredAt: string
  resolvedAt?: string
}

export interface AlertRuleFormData {
  name: string
  ruleType: AlertRuleType
  serverId?: string
  appId?: string
  threshold?: number
  enabled?: boolean
  notifyChannels?: NotifyChannel[]
}

export interface ContainerCheckData {
  serverId: string
  appId?: string
  containerId: string
  containerName: string
  status: string
  restartCount: number
  cpuPercent?: number
  memoryPercent?: number
}

export interface ResourceCheckData {
  serverId: string
  appId?: string
  containerId: string
  containerName: string
  cpuPercent: number
  memoryPercent: number
  diskPercent?: number
}

class AlertService {
  private checkIntervalMs = 60000 // 默认60秒检查一次
  private timer: NodeJS.Timeout | null = null
  private restartCountThreshold = 5
  private restartCountMap: Map<string, { count: number; lastRestart: number }> = new Map()
  // 告警去重：同一目标在冷却窗口内不重复触发（避免每轮轮询产生告警风暴）
  private alertDedupMap: Map<string, number> = new Map()
  private alertDedupCooldownMs = 5 * 60 * 1000

  // 转换数据库行到前端接口
  private rowToRule(row: AlertRuleRow): AlertRule {
    return {
      id: row.id,
      name: row.name,
      ruleType: row.ruleType as AlertRuleType,
      serverId: row.serverId || undefined,
      appId: row.appId || undefined,
      threshold: row.threshold ?? undefined,
      enabled: row.enabled === 1,
      notifyChannels: JSON.parse(row.notifyChannels) as NotifyChannel[],
      // 规则级静默窗口（分钟），未配置时回退到默认 5 分钟
      silenceMinutes: row.silenceMinutes ?? 5,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  private rowToHistory(row: AlertHistoryRow): AlertHistoryEntry {
    return {
      id: row.id,
      ruleId: row.ruleId,
      ruleName: row.ruleName,
      alertType: row.alertType as AlertRuleType,
      message: row.message,
      severity: row.severity as AlertSeverity,
      status: row.status as AlertStatus,
      triggeredAt: row.triggeredAt,
      resolvedAt: row.resolvedAt || undefined
    }
  }

  // 获取所有告警规则
  getAllRules(): AlertRule[] {
    try {
      const rows = alertRuleQueries.getAll()
      return rows.map(row => this.rowToRule(row))
    } catch (error) {
      log.error('Failed to get alert rules:', error)
      return []
    }
  }

  // 根据ID获取告警规则
  getRuleById(id: string): AlertRule | undefined {
    try {
      const row = alertRuleQueries.getById(id)
      return row ? this.rowToRule(row) : undefined
    } catch (error) {
      log.error('Failed to get alert rule by id:', error)
      return undefined
    }
  }

  // 创建告警规则
  createRule(data: AlertRuleFormData): AlertRule {
    const id = generateId()
    alertRuleQueries.insert({
      id,
      name: data.name,
      ruleType: data.ruleType,
      serverId: data.serverId || null,
      appId: data.appId || null,
      threshold: data.threshold ?? null,
      enabled: data.enabled !== false ? 1 : 0,
      notifyChannels: JSON.stringify(data.notifyChannels || ['system'])
    })
    return this.getRuleById(id)!
  }

  // 更新告警规则
  updateRule(id: string, updates: Partial<AlertRuleFormData>): AlertRule | undefined {
    try {
      const processedUpdates: Record<string, unknown> = { ...updates }
      if (updates.enabled !== undefined) {
        processedUpdates.enabled = updates.enabled ? 1 : 0
      }
      if (updates.notifyChannels !== undefined) {
        processedUpdates.notifyChannels = JSON.stringify(updates.notifyChannels)
      }
      alertRuleQueries.update(id, processedUpdates as Partial<AlertRuleRow>)
      return this.getRuleById(id)
    } catch (error) {
      log.error('Failed to update alert rule:', error)
      return undefined
    }
  }

  // 删除告警规则
  deleteRule(id: string): void {
    try {
      alertRuleQueries.delete(id)
    } catch (error) {
      log.error('Failed to delete alert rule:', error)
    }
  }

  // 获取告警历史
  getHistory(limit?: number): AlertHistoryEntry[] {
    try {
      const rows = alertHistoryQueries.getAll(limit)
      return rows.map(row => this.rowToHistory(row))
    } catch (error) {
      log.error('Failed to get alert history:', error)
      return []
    }
  }

  // 获取活动告警
  getActiveAlerts(): AlertHistoryEntry[] {
    try {
      const rows = alertHistoryQueries.getActive()
      return rows.map(row => this.rowToHistory(row))
    } catch (error) {
      log.error('Failed to get active alerts:', error)
      return []
    }
  }

  // 解决告警
  resolveAlert(id: string): void {
    try {
      alertHistoryQueries.resolve(id)
    } catch (error) {
      log.error('Failed to resolve alert:', error)
    }
  }

  // 解决所有告警
  resolveAllAlerts(): void {
    try {
      alertHistoryQueries.resolveAll()
    } catch (error) {
      log.error('Failed to resolve all alerts:', error)
    }
  }

  // 删除告警记录
  deleteAlert(id: string): void {
    try {
      alertHistoryQueries.delete(id)
    } catch (error) {
      log.error('Failed to delete alert:', error)
    }
  }

  // 清空告警历史
  clearHistory(): void {
    try {
      alertHistoryQueries.clear()
    } catch (error) {
      log.error('Failed to clear alert history:', error)
    }
  }

  // 清理过期告警
  cleanup(days?: number): number {
    const retentionDays = days || 30
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffISO = cutoffDate.toISOString()

    const deleted = alertHistoryQueries.deleteBefore(cutoffISO)
    log.info(`Alert history cleanup: removed ${deleted} entries older than ${retentionDays} days`)
    return deleted
  }

  private cleanupTimer: NodeJS.Timeout | null = null

  /**
   * 定时自动清理告警历史（此前仅能手动触发，轮询写入会无限膨胀）。
   * 启动时立即执行一次。
   */
  startAutoCleanup(retentionDays = 30, intervalHours = 24): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    const run = () => {
      try {
        this.cleanup(retentionDays)
      } catch (error) {
        log.error('Alert history auto cleanup failed:', error)
      }
    }

    run()
    this.cleanupTimer = setInterval(run, intervalHours * 60 * 60 * 1000)
    log.info(`Alert history auto cleanup started: retention ${retentionDays} days`)
  }

  // 触发告警（dedupKey：同一目标在冷却窗口内去重，避免轮询导致的告警风暴）
  private triggerAlert(
    rule: AlertRule,
    alertType: AlertRuleType,
    message: string,
    severity: AlertSeverity,
    dedupKey?: string
  ): void {
    try {
      const now = Date.now()
      // 静默窗口优先使用规则配置（silenceMinutes，分钟），未配置回退默认 5 分钟；0 表示每轮都触发
      const cooldownMs = (rule.silenceMinutes ?? 5) * 60 * 1000
      if (dedupKey && cooldownMs > 0) {
        const lastTriggered = this.alertDedupMap.get(dedupKey)
        if (lastTriggered && now - lastTriggered < cooldownMs) {
          log.debug(`Alert suppressed (cooldown): ${dedupKey}`)
          return
        }
        this.alertDedupMap.set(dedupKey, now)
      }

      alertHistoryQueries.insert({
        ruleId: rule.id,
        ruleName: rule.name,
        alertType,
        message,
        severity,
        status: 'active',
        triggeredAt: new Date(now).toISOString(),
        resolvedAt: null
      })

      // 发送通知
      this.sendNotification(rule, message, severity)

      log.warn(`Alert triggered: [${severity}] ${rule.name} - ${message}`)
    } catch (error) {
      log.error('Failed to trigger alert:', error)
    }
  }

  // 发送通知
  private sendNotification(rule: AlertRule, message: string, severity: AlertSeverity): void {
    const channels = rule.notifyChannels || ['system']

    for (const channel of channels) {
      switch (channel) {
        case 'system':
          this.sendSystemNotification(rule.name, message, severity)
          break
        case 'webhook':
          this.sendWebhookNotification(rule, message, severity)
          break
      }
    }
  }

  // 发送系统通知
  private sendSystemNotification(title: string, body: string, severity: AlertSeverity): void {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: `🐳 ${title}`,
          body,
          icon: undefined,
          urgency: severity === 'critical' ? 'critical' : 'normal'
        })
        notification.show()
        log.info(`System notification sent: ${title}`)
      }
    } catch (error) {
      log.error('Failed to send system notification:', error)
    }
  }

  // 发送 Webhook 通知
  private sendWebhookNotification(rule: AlertRule, message: string, severity: AlertSeverity): void {
    try {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL
      if (!webhookUrl) {
        log.debug('Webhook URL not configured, skipping webhook notification')
        return
      }

      const payload = {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        message,
        severity,
        timestamp: new Date().toISOString()
      }

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(response => {
        if (!response.ok) {
          log.warn(`Webhook notification failed with status: ${response.status}`)
        }
      }).catch(error => {
        log.error('Failed to send webhook notification:', error)
      })
    } catch (error) {
      log.error('Failed to send webhook notification:', error)
    }
  }

  // 检查容器状态
  checkContainer(data: ContainerCheckData): void {
    const rules = alertRuleQueries.getEnabled()
    
    for (const ruleRow of rules) {
      const rule = this.rowToRule(ruleRow)
      
      // 检查规则是否适用于此服务器/应用
      if (rule.serverId && rule.serverId !== data.serverId) continue
      if (rule.appId && rule.appId !== data.appId) continue

      switch (rule.ruleType) {
        case 'container_exit':
          this.checkContainerExit(rule, data)
          break
        case 'container_restart_loop':
          this.checkRestartLoop(rule, data)
          break
      }
    }
  }

  // 检查容器退出
  private checkContainerExit(rule: AlertRule, data: ContainerCheckData): void {
    if (data.status === 'exited' || data.status === 'dead') {
      this.triggerAlert(
        rule,
        'container_exit',
        `容器 ${data.containerName} 已退出 (状态: ${data.status})`,
        'critical',
        `${rule.id}:exit:${data.containerId}`
      )
    }
  }

  // 检查重启循环
  private checkRestartLoop(rule: AlertRule, data: ContainerCheckData): void {
    const key = `${data.serverId}:${data.containerId}`
    const now = Date.now()
    const record = this.restartCountMap.get(key)

    // 仅统计真正处于 restarting 状态的容器（running 是正常状态，计入会造成误报）
    if (data.status === 'restarting') {
      if (record) {
        // 如果在60秒内重启次数超过阈值
        if (now - record.lastRestart < 60000) {
          record.count++
          record.lastRestart = now
          if (record.count >= this.restartCountThreshold) {
            this.triggerAlert(
              rule,
              'container_restart_loop',
              `容器 ${data.containerName} 检测到重启循环 (${record.count} 次/分钟)`,
              'critical',
              `${rule.id}:restart_loop:${data.containerId}`
            )
            record.count = 0 // 重置以避免重复告警
          }
        } else {
          // 超过60秒窗口，重置计数
          record.count = 1
          record.lastRestart = now
        }
      } else {
        this.restartCountMap.set(key, { count: 1, lastRestart: now })
      }
    }
  }

  // 检查资源使用
  checkResource(data: ResourceCheckData): void {
    const rules = alertRuleQueries.getEnabled()
    
    for (const ruleRow of rules) {
      const rule = this.rowToRule(ruleRow)
      
      // 检查规则是否适用于此服务器/应用
      if (rule.serverId && rule.serverId !== data.serverId) continue
      if (rule.appId && rule.appId !== data.appId) continue

      const threshold = rule.threshold || this.getDefaultThreshold(rule.ruleType)

      switch (rule.ruleType) {
        case 'high_cpu':
          if (data.cpuPercent >= threshold) {
            this.triggerAlert(
              rule,
              'high_cpu',
              `容器 ${data.containerName} CPU 使用率过高: ${data.cpuPercent.toFixed(1)}% (阈值: ${threshold}%)`,
              data.cpuPercent >= 95 ? 'critical' : 'warning',
              `${rule.id}:cpu:${data.containerId}`
            )
          }
          break
        case 'high_memory':
          if (data.memoryPercent >= threshold) {
            this.triggerAlert(
              rule,
              'high_memory',
              `容器 ${data.containerName} 内存使用率过高: ${data.memoryPercent.toFixed(1)}% (阈值: ${threshold}%)`,
              data.memoryPercent >= 95 ? 'critical' : 'warning',
              `${rule.id}:mem:${data.containerId}`
            )
          }
          break
        case 'high_disk':
          if (data.diskPercent !== undefined && data.diskPercent >= threshold) {
            this.triggerAlert(
              rule,
              'high_disk',
              `容器 ${data.containerName} 磁盘使用率过高: ${data.diskPercent.toFixed(1)}% (阈值: ${threshold}%)`,
              data.diskPercent >= 95 ? 'critical' : 'warning',
              `${rule.id}:disk:${data.containerId}`
            )
          }
          break
      }
    }
  }

  // 获取默认阈值
  private getDefaultThreshold(ruleType: AlertRuleType): number {
    switch (ruleType) {
      case 'high_cpu':
        return 80
      case 'high_memory':
        return 80
      case 'high_disk':
        return 85
      default:
        return 80
    }
  }

  // 启动定期检查
  startMonitoring(intervalMs?: number): void {
    if (this.timer) {
      clearInterval(this.timer)
    }

    this.checkIntervalMs = intervalMs || this.checkIntervalMs
    
    this.timer = setInterval(() => {
      this.performScheduledChecks().catch(error => {
        log.error('Scheduled check failed:', error)
      })
    }, this.checkIntervalMs)

    log.info(`Alert monitoring started: interval ${this.checkIntervalMs}ms`)
  }

  // 停止定期检查
  stopMonitoring(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      log.info('Alert monitoring stopped')
    }
  }

  // 执行定期检查（可由外部调用触发）
  private async performScheduledChecks(): Promise<void> {
    try {
      // 清理过期的重启计数记录
      const now = Date.now()
      for (const [key, record] of this.restartCountMap.entries()) {
        if (now - record.lastRestart > 120000) { // 2分钟无活动则清除
          this.restartCountMap.delete(key)
        }
      }

      // 获取所有启用的告警规则
      const rules = alertRuleQueries.getEnabled()
      if (rules.length === 0) return

      // 仅存在资源类规则时才额外采集容器 stats（省一次 SSH 往返）
      const needStats = rules.some(r => r.ruleType === 'high_cpu' || r.ruleType === 'high_memory' || r.ruleType === 'high_disk')

      // 清理过期的告警去重记录
      const nowMs = Date.now()
      for (const [key, ts] of this.alertDedupMap.entries()) {
        if (nowMs - ts > this.alertDedupCooldownMs * 2) {
          this.alertDedupMap.delete(key)
        }
      }

      // 获取所有服务器
      const servers = serverQueries.getAll()

      for (const server of servers) {
        // 只检查在线服务器
        if (server.status !== 'online') continue

        try {
          // 获取服务器上的容器
          const apps = appQueries.getByServerId(server.id)

          for (const app of apps) {
            if (!app.projectPath) continue

            // 获取容器列表
            const containers = await this.getContainersForServer(server.id, app.projectPath, needStats)

            for (const container of containers) {
              // 检查容器状态
              this.checkContainer({
                serverId: server.id,
                appId: app.id,
                containerId: container.id,
                containerName: container.name,
                status: container.status,
                restartCount: container.restartCount || 0
              })

              // 检查资源使用
              if (container.cpuPercent !== undefined || container.memoryPercent !== undefined) {
                this.checkResource({
                  serverId: server.id,
                  appId: app.id,
                  containerId: container.id,
                  containerName: container.name,
                  cpuPercent: container.cpuPercent || 0,
                  memoryPercent: container.memoryPercent || 0,
                  diskPercent: container.diskPercent
                })
              }
            }
          }
        } catch (error) {
          log.error(`Failed to check server ${server.id}:`, error)
        }
      }
    } catch (error) {
      log.error('Failed to perform scheduled checks:', error)
    }
  }

  // 获取服务器上的容器（includeStats：是否同时采集 CPU/内存使用率，供资源类告警使用）
  private async getContainersForServer(serverId: string, projectPath: string, includeStats = false): Promise<Array<{
    id: string
    name: string
    status: string
    restartCount: number
    cpuPercent?: number
    memoryPercent?: number
    diskPercent?: number
  }>> {
    try {
      const { sshService } = require('./ssh')
      if (!sshService.isConnected(serverId)) {
        return []
      }

      // 使用 .State（短状态：running/exited/restarting...）而非 .Status（人类可读长文本如 "Up 2 hours"），
      // 否则与 exited/restarting 的比较永远不匹配，容器退出与重启循环告警失效
      const result = await sshService.executeCommand(
        serverId,
        `docker ps -a --filter "label=com.docker.compose.project=${projectPath}" --format "{{.ID}}|{{.Names}}|{{.State}}"`
      )

      if (!result.success || !result.stdout) {
        return []
      }

      const containers: Array<{
        id: string
        name: string
        status: string
        restartCount: number
        cpuPercent?: number
        memoryPercent?: number
      }> = []

      const lines = result.stdout.trim().split('\n').filter((line: string) => line.trim())
      for (const line of lines) {
        const [id, name, status] = line.split('|')
        if (id && name) {
          containers.push({
            id: id.trim(),
            name: name.trim(),
            status: status?.trim() || 'unknown',
            restartCount: 0
          })
        }
      }

      // 批量采集资源指标：单条 docker stats 命令覆盖全部容器，避免逐容器 SSH 往返
      if (includeStats && containers.length > 0) {
        try {
          const ids = containers.map(c => c.id).join(' ')
          const statsResult = await sshService.executeCommand(
            serverId,
            `docker stats --no-stream --format "{{.ID}}|{{.CPUPerc}}|{{.MemPerc}}" ${ids}`
          )
          if (statsResult.success && statsResult.stdout) {
            const statsMap = new Map<string, { cpu?: number; mem?: number }>()
            for (const line of statsResult.stdout.trim().split('\n').filter((l: string) => l.trim())) {
              const [cid, cpu, mem] = line.split('|')
              if (!cid) continue
              const parsePercent = (v?: string): number | undefined => {
                if (!v) return undefined
                const n = parseFloat(v.trim().replace('%', ''))
                return Number.isFinite(n) ? n : undefined
              }
              statsMap.set(cid.trim(), { cpu: parsePercent(cpu), mem: parsePercent(mem) })
            }
            for (const container of containers) {
              const stats = statsMap.get(container.id)
              if (stats) {
                container.cpuPercent = stats.cpu
                container.memoryPercent = stats.mem
              }
            }
          }
        } catch (statsError) {
          log.warn(`Failed to collect container stats for server ${serverId}:`, statsError)
        }
      }

      return containers
    } catch (error) {
      log.error(`Failed to get containers for server ${serverId}:`, error)
      return []
    }
  }

  // 获取统计信息
  getStats(): { totalRules: number; activeRules: number; activeAlerts: number; totalAlerts: number } {
    try {
      const allRules = alertRuleQueries.getAll()
      const enabledRules = allRules.filter(r => r.enabled === 1)
      const activeAlerts = alertHistoryQueries.getActive()
      const allAlerts = alertHistoryQueries.getAll()

      return {
        totalRules: allRules.length,
        activeRules: enabledRules.length,
        activeAlerts: activeAlerts.length,
        totalAlerts: allAlerts.length
      }
    } catch (error) {
      log.error('Failed to get alert stats:', error)
      return { totalRules: 0, activeRules: 0, activeAlerts: 0, totalAlerts: 0 }
    }
  }
}

export const alertService = new AlertService()

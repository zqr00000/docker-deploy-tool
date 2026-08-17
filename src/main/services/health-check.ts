import log from 'electron-log'
import { randomUUID } from 'crypto'
import { sshService } from '../ssh'
import { appQueries, healthCheckConfigQueries, healthCheckHistoryQueries } from '../database'
import { appDeployService } from './app-deploy'

export interface ContainerHealthStatus {
  containerId: string
  containerName: string
  status: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown'
  healthStatus: string
  uptime: string
  restartCount: number
  exitCode: number
  errorMessage?: string
  responseTime?: number
}

export interface AppHealthStatus {
  appId: string
  appName: string
  serverId: string
  projectPath: string
  overallStatus: 'healthy' | 'unhealthy' | 'partial' | 'unknown'
  containers: ContainerHealthStatus[]
  lastCheckTime: string
  autoRestartEnabled: boolean
  restartCount: number
}

export interface HealthCheckConfig {
  id: string
  appId: string
  autoRestart: boolean
  maxRestarts: number
  restartWindow: number
  notifyOnRestart: boolean
  createdAt: string
  updatedAt: string
}

export interface HealthCheckReport {
  appId: string
  appName: string
  serverId: string
  totalChecks: number
  healthyCount: number
  unhealthyCount: number
  autoRestarts: number
  uptime: number
  lastCheckTime: string
  containers: {
    name: string
    status: string
    healthStatus: string
    restartCount: number
  }[]
}

class HealthCheckService {
  private checkInterval: NodeJS.Timeout | null = null
  private checkIntervalMs = 60000 // 默认60秒检查一次
  private isRunning = false

  /**
   * 获取单个容器的健康状态
   */
  async getContainerHealth(serverId: string, containerId: string): Promise<ContainerHealthStatus> {
    const startTime = Date.now()
    try {
      // 获取容器状态
      const stateResult = await sshService.executeCommand(
        serverId,
        `docker inspect --format '{{json .State}}' ${containerId} 2>/dev/null`
      )

      const responseTime = Date.now() - startTime

      if (!stateResult.success || !stateResult.stdout) {
        return {
          containerId,
          containerName: containerId.substring(0, 12),
          status: 'unknown',
          healthStatus: 'unknown',
          uptime: '-',
          restartCount: 0,
          exitCode: -1,
          errorMessage: stateResult.stderr || '无法获取容器状态',
          responseTime
        }
      }

      // 解析容器状态
      let state: any = {}
      try {
        state = JSON.parse(stateResult.stdout.trim())
      } catch {
        // 如果 JSON 解析失败，使用简单格式
        const simpleResult = await sshService.executeCommand(
          serverId,
          `docker inspect --format '{{.State.Status}}|{{.State.Running}}|{{.State.StartedAt}}|{{.RestartCount}}|{{.State.ExitCode}}' ${containerId} 2>/dev/null`
        )
        if (simpleResult.success && simpleResult.stdout) {
          const parts = simpleResult.stdout.trim().split('|')
          state = {
            Status: parts[0] || 'unknown',
            Running: parts[1] === 'true',
            StartedAt: parts[2] || '',
            RestartCount: parseInt(parts[3] || '0', 10),
            ExitCode: parseInt(parts[4] || '0', 10)
          }
        }
      }

      const stateStatus = state.Status || 'unknown'
      const isRunning = state.Running === true
      const startedAt = state.StartedAt || ''
      const restartCount = state.RestartCount || 0
      const exitCode = state.ExitCode || 0

      // 获取健康检查状态
      let healthStatus = 'none'
      if (state.Health && state.Health.Status) {
        healthStatus = state.Health.Status
      }

      // 计算运行时间
      let uptime = '-'
      if (startedAt && isRunning) {
        try {
          const startDate = new Date(startedAt)
          const diff = Date.now() - startDate.getTime()
          uptime = this.formatUptime(diff)
        } catch {
          uptime = '-'
        }
      }

      // 获取容器名称
      const nameResult = await sshService.executeCommand(
        serverId,
        `docker inspect --format '{{.Name}}' ${containerId} 2>/dev/null | sed 's/^\\///'`
      )
      const containerName = nameResult.success && nameResult.stdout ? nameResult.stdout.trim() : containerId.substring(0, 12)

      // 确定健康状态
      let status: ContainerHealthStatus['status'] = 'unknown'
      if (isRunning || stateStatus === 'running') {
        if (healthStatus === 'healthy' || healthStatus === 'none' || healthStatus === '') {
          status = 'healthy'
        } else if (healthStatus === 'starting') {
          status = 'starting'
        } else if (healthStatus === 'unhealthy') {
          status = 'unhealthy'
        } else {
          status = 'healthy'
        }
      } else if (stateStatus === 'exited' || stateStatus === 'dead') {
        status = 'unhealthy'
      }

      return {
        containerId,
        containerName,
        status,
        healthStatus: healthStatus || 'none',
        uptime,
        restartCount,
        exitCode,
        responseTime
      }
    } catch (error) {
      log.error(`Failed to get container health status [${containerId}]:`, error)
      return {
        containerId,
        containerName: containerId.substring(0, 12),
        status: 'unknown',
        healthStatus: 'error',
        uptime: '-',
        restartCount: 0,
        exitCode: -1,
        errorMessage: (error as Error).message,
        responseTime: Date.now() - startTime
      }
    }
  }

  /**
   * 获取应用所有容器的健康状态
   */
  async getAppHealth(serverId: string, projectPath: string): Promise<AppHealthStatus> {
    try {
      // 获取应用信息
      const apps = appQueries.getAll()
      const app = apps.find(a => a.serverId === serverId && a.projectPath === projectPath)
      
      if (!app) {
        throw new Error('应用未找到')
      }

      // 获取容器列表
      const containers = await appDeployService.getContainerInfo(serverId, projectPath)
      
      if (containers.length === 0) {
        return {
          appId: app.id,
          appName: app.name,
          serverId,
          projectPath,
          overallStatus: 'unknown',
          containers: [],
          lastCheckTime: new Date().toISOString(),
          autoRestartEnabled: false,
          restartCount: 0
        }
      }

      // 获取每个容器的健康状态
      const containerHealths: ContainerHealthStatus[] = []
      for (const container of containers) {
        const health = await this.getContainerHealth(serverId, container.id)
        containerHealths.push(health)
      }

      // 确定总体状态
      const unhealthyCount = containerHealths.filter(c => c.status === 'unhealthy').length
      const healthyCount = containerHealths.filter(c => c.status === 'healthy').length
      const startingCount = containerHealths.filter(c => c.status === 'starting').length

      let overallStatus: AppHealthStatus['overallStatus'] = 'healthy'
      if (unhealthyCount > 0) {
        overallStatus = healthyCount > 0 ? 'partial' : 'unhealthy'
      } else if (startingCount > 0) {
        overallStatus = 'partial'
      }

      // 获取健康检查配置
      const config = healthCheckConfigQueries.getByAppId(app.id)
      const totalRestarts = containerHealths.reduce((sum, c) => sum + c.restartCount, 0)

      return {
        appId: app.id,
        appName: app.name,
        serverId,
        projectPath,
        overallStatus,
        containers: containerHealths,
        lastCheckTime: new Date().toISOString(),
        autoRestartEnabled: config?.autoRestart === 1,
        restartCount: totalRestarts
      }
    } catch (error) {
      log.error(`Failed to get app health status [${serverId}/${projectPath}]:`, error)
      throw error
    }
  }

  /**
   * 更新健康检查配置
   */
  updateHealthCheckConfig(appId: string, config: {
    autoRestart?: boolean
    maxRestarts?: number
    restartWindow?: number
    notifyOnRestart?: boolean
  }): HealthCheckConfig {
    const existing = healthCheckConfigQueries.getByAppId(appId)
    const now = new Date().toISOString()

    if (existing) {
      healthCheckConfigQueries.update(appId, {
        autoRestart: config.autoRestart !== undefined ? (config.autoRestart ? 1 : 0) : undefined,
        maxRestarts: config.maxRestarts,
        restartWindow: config.restartWindow,
        notifyOnRestart: config.notifyOnRestart !== undefined ? (config.notifyOnRestart ? 1 : 0) : undefined
      })
    } else {
      healthCheckConfigQueries.insert({
        id: randomUUID(),
        appId,
        autoRestart: config.autoRestart ? 1 : 0,
        maxRestarts: config.maxRestarts ?? 3,
        restartWindow: config.restartWindow ?? 3600,
        notifyOnRestart: config.notifyOnRestart !== false ? 1 : 0
      })
    }

    const updated = healthCheckConfigQueries.getByAppId(appId)!
    return {
      id: updated.id,
      appId: updated.appId,
      autoRestart: updated.autoRestart === 1,
      maxRestarts: updated.maxRestarts,
      restartWindow: updated.restartWindow,
      notifyOnRestart: updated.notifyOnRestart === 1,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    }
  }

  /**
   * 获取健康检查配置
   */
  getHealthCheckConfig(appId: string): HealthCheckConfig | null {
    const config = healthCheckConfigQueries.getByAppId(appId)
    if (!config) return null
    return {
      id: config.id,
      appId: config.appId,
      autoRestart: config.autoRestart === 1,
      maxRestarts: config.maxRestarts,
      restartWindow: config.restartWindow,
      notifyOnRestart: config.notifyOnRestart === 1,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    }
  }

  /**
   * 执行健康检查并自动修复
   */
  async performHealthCheck(appId?: string): Promise<AppHealthStatus[]> {
    const results: AppHealthStatus[] = []
    
    try {
      const apps = appId 
        ? appQueries.getAll().filter(a => a.id === appId)
        : appQueries.getAll()

      for (const app of apps) {
        try {
          const health = await this.getAppHealth(app.serverId, app.projectPath)
          
          // 记录健康检查历史
          for (const container of health.containers) {
            healthCheckHistoryQueries.insert({
              appId: app.id,
              containerId: container.containerId,
              containerName: container.containerName,
              checkTime: new Date().toISOString(),
              status: container.status,
              healthStatus: container.healthStatus,
              restartCount: container.restartCount,
              autoRestarted: 0,
              errorMessage: container.errorMessage || null,
              responseTime: container.responseTime || null
            })
          }

          // 自动重启异常容器
          if (health.overallStatus === 'unhealthy' || health.overallStatus === 'partial') {
            const config = healthCheckConfigQueries.getByAppId(app.id)
            if (config && config.autoRestart === 1) {
              await this.autoRestartContainers(app.id, app.serverId, health, config)
            }
          }

          results.push(health)
        } catch (error) {
          log.error(`Health check failed [${app.id}]:`, error)
        }
      }
    } catch (error) {
      log.error('Failed to perform health check:', error)
    }

    return results
  }

  /**
   * 自动重启异常容器
   */
  private async autoRestartContainers(
    appId: string,
    serverId: string,
    health: AppHealthStatus,
    config: { maxRestarts: number; restartWindow: number; notifyOnRestart: number }
  ): Promise<void> {
    // 检查重启次数是否超过限制
    const recentRestarts = healthCheckHistoryQueries.getRecentRestarts(appId, config.restartWindow)
    if (recentRestarts >= config.maxRestarts) {
      log.warn(`App ${appId} restarted ${recentRestarts} times in ${config.restartWindow}s, exceeding max limit ${config.maxRestarts}`)
      return
    }

    // 重启不健康的容器
    for (const container of health.containers) {
      if (container.status === 'unhealthy') {
        try {
          log.info(`Auto-restarting container: ${container.containerName} (${container.containerId})`)
          const result = await appDeployService.restartContainer(serverId, container.containerId)
          
          if (result.success) {
            // 记录自动重启
            healthCheckHistoryQueries.insert({
              appId,
              containerId: container.containerId,
              containerName: container.containerName,
              checkTime: new Date().toISOString(),
              status: 'healthy',
              healthStatus: 'restarting',
              restartCount: container.restartCount + 1,
              autoRestarted: 1,
              errorMessage: null,
              responseTime: null
            })
            log.info(`Container ${container.containerName} auto-restart successful`)
          } else {
            log.error(`Container ${container.containerName} auto-restart failed: ${result.message}`)
          }
        } catch (error) {
          log.error(`Failed to auto-restart container [${container.containerId}]:`, error)
        }
      }
    }
  }

  /**
   * 获取健康检查历史
   */
  getHealthCheckHistory(appId: string, limit?: number) {
    return healthCheckHistoryQueries.getByAppId(appId, limit)
  }

  /**
   * 获取健康检查报告
   */
  getHealthCheckReport(appId: string): HealthCheckReport | null {
    const app = appQueries.getById(appId)
    if (!app) return null

    const stats = healthCheckHistoryQueries.getStats(appId)
    const history = healthCheckHistoryQueries.getByAppId(appId, 100)
    const config = healthCheckConfigQueries.getByAppId(appId)

    // 获取最新的容器状态
    const latestChecks = new Map<string, { status: string; healthStatus: string; restartCount: number }>()
    for (const record of history) {
      if (record.containerId && !latestChecks.has(record.containerId)) {
        latestChecks.set(record.containerId, {
          status: record.status,
          healthStatus: record.healthStatus || 'none',
          restartCount: record.restartCount
        })
      }
    }

    // 计算可用率
    const uptime = stats.total > 0 ? (stats.healthy / stats.total) * 100 : 100

    return {
      appId,
      appName: app.name,
      serverId: app.serverId,
      totalChecks: stats.total,
      healthyCount: stats.healthy,
      unhealthyCount: stats.unhealthy,
      autoRestarts: stats.restarted,
      uptime: Math.round(uptime * 100) / 100,
      lastCheckTime: history.length > 0 ? history[0].checkTime : '-',
      containers: Array.from(latestChecks.entries()).map(([name, data]) => ({
        name,
        status: data.status,
        healthStatus: data.healthStatus,
        restartCount: data.restartCount
      }))
    }
  }

  /**
   * 获取所有应用的健康检查报告
   */
  getAllHealthCheckReports(): HealthCheckReport[] {
    const apps = appQueries.getAll()
    return apps
      .map(app => this.getHealthCheckReport(app.id))
      .filter((r): r is HealthCheckReport => r !== null)
  }

  /**
   * 清理历史记录
   */
  cleanupHistory(days: number = 30): number {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    return healthCheckHistoryQueries.deleteBefore(cutoffDate)
  }

  /**
   * 启动定期健康检查
   */
  startPeriodicCheck(intervalMs?: number): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    
    if (intervalMs) {
      this.checkIntervalMs = intervalMs
    }

    this.isRunning = true
    this.checkInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.performHealthCheck()
      }
    }, this.checkIntervalMs)

    log.info(`Periodic health check started, interval: ${this.checkIntervalMs}ms`)
  }

  /**
   * 停止定期健康检查
   */
  stopPeriodicCheck(): void {
    this.isRunning = false
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    log.info('Periodic health check stopped')
  }

  /**
   * 格式化运行时间
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}天 ${hours % 24}小时`
    } else if (hours > 0) {
      return `${hours}小时 ${minutes % 60}分钟`
    } else if (minutes > 0) {
      return `${minutes}分钟 ${seconds % 60}秒`
    } else {
      return `${seconds}秒`
    }
  }
}

export const healthCheckService = new HealthCheckService()

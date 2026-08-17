import log from 'electron-log'
import { sshService } from '../ssh'
import { resourceMetricQueries, ResourceMetricRow, MetricsSummary } from '../database'
import { randomUUID } from 'crypto'

export interface ContainerStats {
  containerId: string
  containerName: string
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  networkRx: number
  networkTx: number
  blockRead: number
  blockWrite: number
}

export interface CollectOptions {
  serverId: string
  appId?: string
  containerId?: string
}

export interface MetricsQueryParams {
  serverId?: string
  appId?: string
  containerId?: string
  startTime?: string
  endTime?: string
  limit?: number
  offset?: number
}

class ResourceReportsService {
  private collectionIntervals: Map<string, NodeJS.Timeout> = new Map()
  private readonly DEFAULT_INTERVAL = 60000 // 60 seconds
  private readonly DEFAULT_RETENTION_DAYS = 30

  /**
   * Parse human-readable size string to bytes (numeric value)
   * e.g., "1.5GiB" -> 1610612736, "500MB" -> 500000000
   */
  private parseSizeToBytes(sizeStr: string): number {
    if (!sizeStr || sizeStr === 'N/A' || sizeStr === '0B') return 0

    const match = sizeStr.match(/^([\d.]+)\s*([KMGTPE]?i?[B])?$/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    if (isNaN(value)) return 0

    const unit = (match[2] || 'B').toUpperCase()
    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1000,
      'KIB': 1024,
      'MB': 1000 * 1000,
      'MIB': 1024 * 1024,
      'GB': 1000 * 1000 * 1000,
      'GIB': 1024 * 1024 * 1024,
      'TB': 1000 * 1000 * 1000 * 1000,
      'TIB': 1024 * 1024 * 1024 * 1024,
      'PB': 1000 * 1000 * 1000 * 1000 * 1000,
      'PIB': 1024 * 1024 * 1024 * 1024 * 1024,
      'EB': 1000 * 1000 * 1000 * 1000 * 1000 * 1000,
      'EIB': 1024 * 1024 * 1024 * 1024 * 1024 * 1024
    }

    return value * (multipliers[unit] || 1)
  }

  /**
   * Parse network I/O string like "1.5MB / 2.3MB" into rx/tx bytes
   */
  private parseNetworkIO(netStr: string): { rx: number; tx: number } {
    if (!netStr || netStr === 'N/A') return { rx: 0, tx: 0 }

    const parts = netStr.split('/').map(s => s.trim())
    const rx = this.parseSizeToBytes(parts[0] || '0B')
    const tx = this.parseSizeToBytes(parts[1] || '0B')

    return { rx, tx }
  }

  /**
   * Parse block I/O string like "10MB / 20MB" into read/write bytes
   */
  private parseBlockIO(blockStr: string): { read: number; write: number } {
    if (!blockStr || blockStr === 'N/A') return { read: 0, write: 0 }

    const parts = blockStr.split('/').map(s => s.trim())
    const read = this.parseSizeToBytes(parts[0] || '0B')
    const write = this.parseSizeToBytes(parts[1] || '0B')

    return { read, write }
  }

  /**
   * Collect resource metrics from a specific container
   */
  async collectMetrics(options: CollectOptions): Promise<ContainerStats | null> {
    const { serverId, containerId } = options

    if (!sshService.isConnected(serverId)) {
      log.warn(`Cannot collect metrics: server ${serverId} not connected`)
      return null
    }

    if (!containerId) {
      log.warn('Cannot collect metrics: no containerId specified')
      return null
    }

    try {
      const result = await sshService.executeCommand(
        serverId,
        `docker stats --no-stream --format "{{.ID}},{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}" ${containerId}`
      )

      if (!result.success || !result.stdout.trim()) {
        log.warn(`Failed to collect stats for container ${containerId}: ${result.stderr}`)
        return null
      }

      const parts = result.stdout.trim().split(',')
      if (parts.length < 8) {
        log.warn(`Invalid stats output for container ${containerId}`)
        return null
      }

      const cpuPercent = parseFloat(parts[2].replace('%', '')) || 0
      const memUsageParts = parts[3].split('/')
      const memoryUsage = this.parseSizeToBytes(memUsageParts[0]?.trim() || '0B')
      const memoryLimit = this.parseSizeToBytes(memUsageParts[1]?.trim() || '0B')
      const { rx, tx } = this.parseNetworkIO(parts[5])
      const { read, write } = this.parseBlockIO(parts[6])

      return {
        containerId: parts[0],
        containerName: parts[1],
        cpuPercent,
        memoryUsage,
        memoryLimit,
        networkRx: rx,
        networkTx: tx,
        blockRead: read,
        blockWrite: write
      }
    } catch (error) {
      log.error(`Error collecting metrics for container ${containerId}:`, error)
      return null
    }
  }

  /**
   * Save collected metrics to database
   */
  saveMetrics(serverId: string, stats: ContainerStats, appId?: string): void {
    const now = new Date().toISOString()
    resourceMetricQueries.insert({
      serverId,
      appId: appId || null,
      containerId: stats.containerId,
      cpuPercent: stats.cpuPercent,
      memoryUsage: stats.memoryUsage,
      memoryLimit: stats.memoryLimit,
      networkRx: stats.networkRx,
      networkTx: stats.networkTx,
      blockRead: stats.blockRead,
      blockWrite: stats.blockWrite,
      timestamp: now
    })
  }

  /**
   * Collect and save metrics for a container
   */
  async collectAndSaveMetrics(options: CollectOptions): Promise<ContainerStats | null> {
    const stats = await this.collectMetrics(options)
    if (stats) {
      this.saveMetrics(options.serverId, stats, options.appId)
    }
    return stats
  }

  /**
   * Get historical metrics from database
   */
  getMetrics(params: MetricsQueryParams): { metrics: ResourceMetricRow[]; total: number } {
    return resourceMetricQueries.query(params)
  }

  /**
   * Get metrics summary for a period
   */
  getMetricsSummary(serverId?: string, appId?: string, period: string = '24h'): MetricsSummary {
    return resourceMetricQueries.getSummary(serverId, appId, period)
  }

  /**
   * Export metrics to CSV format
   */
  exportMetricsToCSV(metrics: ResourceMetricRow[]): string {
    const headers = [
      'ID',
      'Server ID',
      'App ID',
      'Container ID',
      'CPU (%)',
      'Memory Usage (bytes)',
      'Memory Limit (bytes)',
      'Network Rx (bytes)',
      'Network Tx (bytes)',
      'Block Read (bytes)',
      'Block Write (bytes)',
      'Timestamp'
    ]

    const rows = metrics.map(m => [
      m.id,
      m.serverId,
      m.appId || '',
      m.containerId || '',
      m.cpuPercent?.toString() || '',
      m.memoryUsage?.toString() || '',
      m.memoryLimit?.toString() || '',
      m.networkRx?.toString() || '',
      m.networkTx?.toString() || '',
      m.blockRead?.toString() || '',
      m.blockWrite?.toString() || '',
      m.timestamp
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return csvContent
  }

  /**
   * Clean up old data beyond retention period
   */
  cleanupOldData(days?: number): number {
    const retentionDays = days || this.DEFAULT_RETENTION_DAYS
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    const deleted = resourceMetricQueries.deleteBefore(cutoffDate)
    log.info(`Cleaned up ${deleted} old resource metrics (older than ${retentionDays} days)`)
    return deleted
  }

  /**
   * Start periodic metrics collection for a server
   */
  startPeriodicCollection(serverId: string, containerIds: string[], interval?: number): void {
    const key = `${serverId}:${containerIds.join(',')}`

    if (this.collectionIntervals.has(key)) {
      log.warn(`Periodic collection already running for ${key}`)
      return
    }

    const intervalMs = interval || this.DEFAULT_INTERVAL

    const collectAll = async () => {
      for (const containerId of containerIds) {
        try {
          await this.collectAndSaveMetrics({ serverId, containerId })
        } catch (error) {
          log.error(`Error in periodic collection for container ${containerId}:`, error)
        }
      }
    }

    // Collect immediately
    collectAll()

    // Set up interval
    const timer = setInterval(collectAll, intervalMs)
    this.collectionIntervals.set(key, timer)

    log.info(`Started periodic metrics collection for server ${serverId}, containers: ${containerIds.length}`)
  }

  /**
   * Stop periodic metrics collection
   */
  stopPeriodicCollection(serverId: string, containerIds?: string[]): void {
    if (containerIds) {
      const key = `${serverId}:${containerIds.join(',')}`
      const timer = this.collectionIntervals.get(key)
      if (timer) {
        clearInterval(timer)
        this.collectionIntervals.delete(key)
        log.info(`Stopped periodic metrics collection for ${key}`)
      }
    } else {
      // Stop all collections for this server
      for (const [key, timer] of this.collectionIntervals.entries()) {
        if (key.startsWith(`${serverId}:`)) {
          clearInterval(timer)
          this.collectionIntervals.delete(key)
        }
      }
      log.info(`Stopped all periodic metrics collection for server ${serverId}`)
    }
  }

  /**
   * Stop all periodic collections
   */
  stopAllPeriodicCollections(): void {
    for (const [key, timer] of this.collectionIntervals.entries()) {
      clearInterval(timer)
      this.collectionIntervals.delete(key)
    }
    log.info('Stopped all periodic metrics collections')
  }

  /**
   * Get active collection count
   */
  getActiveCollectionCount(): number {
    return this.collectionIntervals.size
  }

  /**
   * Get latest metrics for a server
   */
  getLatestMetrics(serverId: string): ResourceMetricRow | undefined {
    return resourceMetricQueries.getLatestByServer(serverId)
  }

  /**
   * Get latest metrics for a container
   */
  getLatestMetricsByContainer(containerId: string): ResourceMetricRow | undefined {
    return resourceMetricQueries.getLatestByContainer(containerId)
  }
}

export const resourceReportsService = new ResourceReportsService()

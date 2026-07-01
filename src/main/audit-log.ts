import log from 'electron-log'
import { generateId } from './ssh'
import { auditLogQueries, AuditLogQuery } from './database'

export type AuditAction =
  | 'server_connect'
  | 'server_disconnect'
  | 'server_create'
  | 'server_update'
  | 'server_delete'
  | 'app_deploy'
  | 'app_start'
  | 'app_stop'
  | 'app_restart'
  | 'app_delete'
  | 'app_update'
  | 'app_rollback'
  | 'template_create'
  | 'template_update'
  | 'template_delete'
  | 'settings_change'
  | 'scheduled_task_create'
  | 'scheduled_task_update'
  | 'scheduled_task_delete'
  | 'scheduled_task_toggle'

export type AuditTargetType =
  | 'server'
  | 'app'
  | 'template'
  | 'settings'
  | 'system'
  | 'scheduled_task'

export type AuditStatus = 'success' | 'failure' | 'pending'

export interface AuditLogEntry {
  action: AuditAction
  targetType: AuditTargetType
  targetId?: string
  targetName?: string
  status: AuditStatus
  details?: string
  serverId?: string
}

export interface AuditLogFilter {
  action?: string
  targetType?: string
  status?: string
  serverId?: string
  startDate?: string
  endDate?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface AuditLogResult {
  logs: AuditLogRow[]
  total: number
  page: number
  pageSize: number
}

export interface AuditLogRow {
  id: string
  timestamp: string
  action: string
  targetType: string
  targetId: string | null
  targetName: string | null
  status: string
  details: string | null
  serverId: string | null
  createdAt: string
}

class AuditLogService {
  private cleanupIntervalDays = 90
  private timer: NodeJS.Timeout | null = null

  log(entry: AuditLogEntry): void {
    try {
      const id = generateId()
      const now = new Date().toISOString()
      auditLogQueries.insert({
        id,
        timestamp: now,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId || null,
        targetName: entry.targetName || null,
        status: entry.status,
        details: entry.details || null,
        serverId: entry.serverId || null
      })
      log.debug(`Audit log recorded: ${entry.action} [${entry.status}] ${entry.targetType}:${entry.targetName || entry.targetId}`)
    } catch (error) {
      log.error('Failed to write audit log:', error)
    }
  }

  query(filter: AuditLogFilter): AuditLogResult {
    const page = filter.page || 1
    const pageSize = filter.pageSize || 50
    const offset = (page - 1) * pageSize

    const query: AuditLogQuery = {
      action: filter.action,
      targetType: filter.targetType,
      status: filter.status,
      serverId: filter.serverId,
      startDate: filter.startDate,
      endDate: filter.endDate,
      search: filter.search,
      limit: pageSize,
      offset
    }

    const { logs, total } = auditLogQueries.query(query)
    return { logs, total, page, pageSize }
  }

  getById(id: string): AuditLogRow | undefined {
    return auditLogQueries.getById(id)
  }

  getActions(): string[] {
    return auditLogQueries.getActions()
  }

  getTargetTypes(): string[] {
    return auditLogQueries.getTargetTypes()
  }

  exportToCSV(filter: AuditLogFilter): string {
    const { logs } = this.query({ ...filter, page: 1, pageSize: 10000 })
    
    const headers = ['ID', 'Timestamp', 'Action', 'Target Type', 'Target ID', 'Target Name', 'Status', 'Details', 'Server ID']
    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.action,
      log.targetType,
      log.targetId || '',
      log.targetName || '',
      log.status,
      (log.details || '').replace(/[\r\n]+/g, ' '),
      log.serverId || ''
    ])

    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCSV(cell)).join(','))
    ]

    return csvLines.join('\n')
  }

  cleanup(days?: number): number {
    const retentionDays = days || this.cleanupIntervalDays
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffISO = cutoffDate.toISOString()
    
    const deleted = auditLogQueries.deleteBefore(cutoffISO)
    log.info(`Audit log cleanup: removed ${deleted} entries older than ${retentionDays} days`)
    return deleted
  }

  clear(): void {
    auditLogQueries.clear()
    log.info('All audit logs cleared')
  }

  startAutoCleanup(intervalHours = 24): void {
    if (this.timer) {
      clearInterval(this.timer)
    }
    
    this.timer = setInterval(() => {
      this.cleanup()
    }, intervalHours * 60 * 60 * 1000)
    
    log.info(`Auto-cleanup started: every ${intervalHours} hours, retention: ${this.cleanupIntervalDays} days`)
  }

  stopAutoCleanup(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      log.info('Auto-cleanup stopped')
    }
  }
}

export const auditLogService = new AuditLogService()

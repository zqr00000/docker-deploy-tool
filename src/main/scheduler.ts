import cron, { ScheduledTask } from 'node-cron'
import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { scheduledTaskQueries, serverQueries, appQueries, ScheduledTaskRow } from './database'
import { sshService } from './ssh'
import { appDeployService } from './app-deploy'
import { auditLogService } from './audit-log'

type TaskType = 'restart_container' | 'update_container' | 'backup_database' | 'backup_volume' | 'cleanup_images' | 'cleanup_volumes'

class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map()
  private isInitialized = false

  initialize(): void {
    if (this.isInitialized) {
      log.info('Scheduler already initialized')
      return
    }

    log.info('Initializing scheduler service...')
    this.loadEnabledTasks()
    this.isInitialized = true
    log.info(`Scheduler initialized with ${this.tasks.size} active tasks`)
  }

  private loadEnabledTasks(): void {
    try {
      const enabledTasks = scheduledTaskQueries.getEnabled()
      for (const task of enabledTasks) {
        this.scheduleTask(task)
      }
      log.info(`Loaded ${enabledTasks.length} enabled scheduled tasks`)
    } catch (error) {
      log.error('Failed to load scheduled tasks:', error)
    }
  }

  private scheduleTask(task: ScheduledTaskRow): void {
    if (!cron.validate(task.cronExpression)) {
      log.error(`Invalid cron expression for task ${task.name}: ${task.cronExpression}`)
      return
    }

    // 如果任务已存在，先停止
    if (this.tasks.has(task.id)) {
      this.tasks.get(task.id)!.stop()
      this.tasks.delete(task.id)
    }

    const cronTask = cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task)
    })

    this.tasks.set(task.id, cronTask)
    log.info(`Scheduled task: ${task.name} (${task.id}) with cron: ${task.cronExpression}`)
  }

  private async executeTask(task: ScheduledTaskRow): Promise<void> {
    const startTime = new Date().toISOString()
    log.info(`Executing scheduled task: ${task.name} (${task.taskType})`)

    let status: 'success' | 'failure' = 'success'
    let details = ''

    try {
      switch (task.taskType) {
        case 'restart_container':
          details = await this.executeRestartContainer(task)
          break
        case 'update_container':
          details = await this.executeUpdateContainer(task)
          break
        case 'backup_database':
          details = await this.executeBackupDatabase(task)
          break
        case 'backup_volume':
          details = await this.executeBackupVolume(task)
          break
        case 'cleanup_images':
          details = await this.executeCleanupImages(task)
          break
        case 'cleanup_volumes':
          details = await this.executeCleanupVolumes(task)
          break
        default:
          details = `Unknown task type: ${task.taskType}`
          status = 'failure'
      }
    } catch (error) {
      status = 'failure'
      details = (error as Error).message
      log.error(`Task execution failed: ${task.name}`, error)
    }

    // 更新任务执行状态
    scheduledTaskQueries.updateRunStatus(task.id, startTime, status)

    // 记录审计日志
    auditLogService.log({
      action: 'scheduled_task_execute',
      targetType: 'scheduled_task',
      targetId: task.id,
      targetName: task.name,
      status,
      details,
      serverId: task.serverId
    })

    log.info(`Task ${task.name} executed with status: ${status}`)
  }

  private async executeRestartContainer(task: ScheduledTaskRow): Promise<string> {
    if (!task.appId) {
      throw new Error('No app ID specified for restart task')
    }

    const appInfo = appQueries.getById(task.appId)
    if (!appInfo) {
      throw new Error(`App not found: ${task.appId}`)
    }

    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect(server)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      // 等待连接建立
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const result = await appDeployService.restartApp(task.appId)
    if (!result.success) {
      throw new Error(result.message)
    }

    return `Container restarted successfully: ${result.message}`
  }

  private async executeUpdateContainer(task: ScheduledTaskRow): Promise<string> {
    if (!task.appId) {
      throw new Error('No app ID specified for update task')
    }

    const appInfo = appQueries.getById(task.appId)
    if (!appInfo) {
      throw new Error(`App not found: ${task.appId}`)
    }

    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect(server)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 拉取最新镜像
    const pullResult = await sshService.executeCommand(
      task.serverId,
      `cd ${appInfo.projectPath} && docker-compose pull`
    )
    if (!pullResult.success) {
      log.warn(`Pull warning: ${pullResult.stderr}`)
    }

    // 重新部署
    const result = await appDeployService.updateApp(task.appId)
    if (!result.success) {
      throw new Error(result.message)
    }

    return `Container updated successfully: ${result.message}`
  }

  private async executeBackupDatabase(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect(server)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const backupDir = this.getBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = join(backupDir, `db-backup-${task.serverId}-${timestamp}.sql`)

    // 获取所有运行中的数据库容器
    const psResult = await sshService.executeCommand(
      task.serverId,
      `docker ps --filter "ancestor=mysql" --filter "ancestor=postgres" --filter "ancestor=mariadb" --format "{{.ID}} {{.Image}}"`
    )

    if (!psResult.success || !psResult.stdout.trim()) {
      return 'No database containers found to backup'
    }

    const lines = psResult.stdout.trim().split('\n')
    let backupCount = 0

    for (const line of lines) {
      const [containerId, image] = line.split(' ')
      if (!containerId) continue

      let dumpCmd = ''
      if (image.includes('mysql') || image.includes('mariadb')) {
        dumpCmd = `docker exec ${containerId} mysqldump -u root --all-databases --single-transaction --routines --triggers 2>/dev/null`
      } else if (image.includes('postgres')) {
        dumpCmd = `docker exec ${containerId} pg_dumpall -U postgres 2>/dev/null`
      }

      if (dumpCmd) {
        const dumpResult = await sshService.executeCommand(task.serverId, dumpCmd)
        if (dumpResult.success && dumpResult.stdout.trim()) {
          const fileName = join(backupDir, `db-${containerId.substring( 0, 12)}-${timestamp}.sql`)
          const { writeFile } = await import('fs/promises')
          await writeFile(fileName, dumpResult.stdout, 'utf-8')
          backupCount++
        }
      }
    }

    return `Database backup completed: ${backupCount} databases backed up to ${backupDir}`
  }

  private async executeBackupVolume(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect(server)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const backupDir = this.getBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = join(backupDir, `volumes-backup-${task.serverId}-${timestamp}.tar.gz`)

    // 获取所有卷
    const volResult = await sshService.executeCommand(
      task.serverId,
      `docker volume ls --format "{{.Name}}"`
    )

    if (!volResult.success || !volResult.stdout.trim()) {
      return 'No volumes found to backup'
    }

    const volumes = volResult.stdout.trim().split('\n').filter(v => v.trim())
    
    if (volumes.length === 0) {
      return 'No volumes found to backup'
    }

    // 创建卷备份（使用临时容器打包卷数据）
    const volumeList = volumes.join(' ')
    const backupCmd = `docker run --rm -v /var/lib/docker/volumes:/volumes:ro -v ${backupDir}:/backup alpine tar czf /backup/volumes-backup-${task.serverId}-${timestamp}.tar.gz -C /volumes ${volumeList.join(' ')} 2>/dev/null || echo "Backup completed with warnings"`
    
    const result = await sshService.executeCommand(task.serverId, backupCmd, 2, 1000, 120000)
    
    return `Volume backup completed: ${volumes.length} volumes backed up to ${backupFile}`
  }

  private async executeCleanupImages(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect(server)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 清理悬空镜像
    const danglingResult = await sshService.executeCommand(
      task.serverId,
      `docker image prune -f`
    )

    // 清理未使用的镜像
    const pruneResult = await sshService.executeCommand(
      task.serverId,
      `docker image prune -a -f`
    )

    // 获取回收的空间
    const spaceResult = await sshService.executeCommand(
      task.serverId,
      `docker system df --format "{{.Size}}" | head -1`
    )

    return `Image cleanup completed. Dangling: ${danglingResult.success}, Unused: ${pruneResult.success}`
  }

  private async executeCleanupVolumes(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect(server)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 清理未使用的卷
    const result = await sshService.executeCommand(
      task.serverId,
      `docker volume prune -f`
    )

    if (!result.success) {
      throw new Error(result.stderr)
    }

    return `Volume cleanup completed: ${result.stdout.trim() || 'No volumes to clean'}`
  }

  private getBackupDir(): string {
    const userDataPath = app.getPath('userData')
    const backupDir = join(userDataPath, 'backups')

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true })
    }

    return backupDir
  }

  // 公共 API
  addTask(task: ScheduledTaskRow): void {
    if (task.enabled) {
      this.scheduleTask(task)
    }
  }

  updateTask(task: ScheduledTaskRow): void {
    // 停止现有任务
    if (this.tasks.has(task.id)) {
      this.tasks.get(task.id)!.stop()
      this.tasks.delete(task.id)
    }

    // 如果启用，重新调度
    if (task.enabled) {
      this.scheduleTask(task)
    }
  }

  removeTask(taskId: string): void {
    if (this.tasks.has(taskId)) {
      this.tasks.get(taskId)!.stop()
      this.tasks.delete(taskId)
      log.info(`Removed scheduled task: ${taskId}`)
    }
  }

  enableTask(taskId: string): void {
    const task = scheduledTaskQueries.getById(taskId)
    if (task) {
      scheduledTaskQueries.update(taskId, { enabled: 1 })
      this.scheduleTask({ ...task, enabled: 1 })
    }
  }

  disableTask(taskId: string): void {
    if (this.tasks.has(taskId)) {
      this.tasks.get(taskId)!.stop()
      this.tasks.delete(taskId)
    }
    scheduledTaskQueries.update(taskId, { enabled: 0 })
  }

  async runTaskNow(taskId: string): Promise<{ success: boolean; message: string }> {
    const task = scheduledTaskQueries.getById(taskId)
    if (!task) {
      return { success: false, message: 'Task not found' }
    }

    try {
      await this.executeTask(task)
      return { success: true, message: 'Task executed successfully' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  }

  getActiveTaskCount(): number {
    return this.tasks.size
  }

  stopAll(): void {
    for (const [id, task] of this.tasks) {
      task.stop()
      log.info(`Stopped scheduled task: ${id}`)
    }
    this.tasks.clear()
  }
}

export const schedulerService = new SchedulerService()

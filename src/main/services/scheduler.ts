import cron, { ScheduledTask } from 'node-cron'
import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { scheduledTaskQueries, serverQueries, appQueries, ScheduledTaskRow } from '../database'
import { sshService } from '../ssh'
import { appDeployService } from './app-deploy'
import { auditLogService } from './audit-log'

type TaskType = 'restart_container' | 'update_container' | 'backup_database' | 'backup_volume' | 'cleanup_images' | 'cleanup_volumes' | 'ai_inspection'

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
        case 'ai_inspection':
          details = await this.executeInspection(task)
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
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
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
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 拉取最新镜像（自动检测 Compose 版本）
    const composeCmd = (await appDeployService.detectComposeEnvironment(task.serverId)).command
    const pullResult = await sshService.executeCommand(
      task.serverId,
      `cd ${appInfo.projectPath} && ${composeCmd} pull`
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
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const backupDir = this.getBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    // 列出所有运行中容器的镜像名（ancestor 过滤匹配不到带 tag 的镜像，如 mysql:8.0，改为按镜像名过滤）
    const psResult = await sshService.executeCommand(
      task.serverId,
      `docker ps --format "{{.ID}} {{.Image}}"`
    )

    if (!psResult.success || !psResult.stdout.trim()) {
      return 'No running containers found to backup'
    }

    const dbImageRe = /mysql|mariadb|postgres/i
    const lines = psResult.stdout.trim().split('\n')
      .map(l => l.trim())
      .filter(l => {
        const image = l.split(' ')[1] || ''
        return dbImageRe.test(image)
      })

    if (lines.length === 0) {
      return 'No database containers found to backup'
    }

    let backupCount = 0
    const failures: string[] = []

    for (const line of lines) {
      const [containerId, image] = line.split(' ')
      if (!containerId) continue

      // 优先使用容器环境变量中的凭据（官方 mysql/mariadb/postgres 镜像内置）
      let dumpCmd = ''
      if (/mysql|mariadb/i.test(image)) {
        dumpCmd = `docker exec ${containerId} sh -c 'mysqldump -u root -p"\$MYSQL_ROOT_PASSWORD" --all-databases --single-transaction --routines --triggers'`
      } else if (/postgres/i.test(image)) {
        dumpCmd = `docker exec ${containerId} sh -c 'PGPASSWORD="\$POSTGRES_PASSWORD" pg_dumpall -U "\${POSTGRES_USER:-postgres}"'`
      }

      if (dumpCmd) {
        const dumpResult = await sshService.executeCommand(task.serverId, dumpCmd, 2, 1000, 300000)
        if (dumpResult.success && dumpResult.stdout.trim()) {
          const fileName = join(backupDir, `db-${containerId.substring(0, 12)}-${timestamp}.sql`)
          const { writeFile } = await import('fs/promises')
          await writeFile(fileName, dumpResult.stdout, 'utf-8')
          backupCount++
        } else {
          // 不再静默跳过：dump 失败必须暴露出来，否则任务假成功
          failures.push(`${image || 'db'}(${containerId.substring(0, 12)}): ${dumpResult.stderr?.trim().slice(0, 200) || 'empty dump output'}`)
        }
      }
    }

    if (backupCount === 0) {
      throw new Error(`Database backup failed for all containers: ${failures.join('; ')}`)
    }

    const msg = `Database backup completed: ${backupCount} databases backed up to ${backupDir}`
    return failures.length > 0 ? `${msg}（部分失败: ${failures.join('; ')}）` : msg
  }

  private async executeBackupVolume(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const backupDir = this.getBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

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

    // 在远端打包到 /tmp（挂载本机 backupDir 到远端容器是无效的——远端不存在该 Windows 路径），
    // 打包完成后经 SFTP 拉回本地备份目录，最后清理远端临时文件
    const remoteTmp = `/tmp/volumes-backup-${task.serverId}-${timestamp}.tar.gz`
    const tarCmd = `docker run --rm -v /var/lib/docker/volumes:/volumes:ro -v /tmp:/backup alpine tar czf /backup/${remoteTmp.split('/').pop()} -C /volumes ${volumes.join(' ')}`

    const result = await sshService.executeCommand(task.serverId, tarCmd, 2, 1000, 600000)
    if (!result.success) {
      throw new Error(`Volume backup tar failed: ${result.stderr?.trim().slice(0, 300) || 'command failed'}`)
    }

    const localFile = join(backupDir, `volumes-backup-${task.serverId}-${timestamp}.tar.gz`)
    const download = await sshService.downloadFile(task.serverId, remoteTmp, localFile)
    // 无论下载成败都清理远端临时文件
    await sshService.executeCommand(task.serverId, `rm -f ${remoteTmp}`)

    if (!download.success) {
      throw new Error(`Volume backup download failed: ${download.message}`)
    }

    return `Volume backup completed: ${volumes.length} volumes backed up to ${localFile}`
  }

  private async executeCleanupImages(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
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
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
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

  /**
   * AI 智能巡检：定时执行综合健康检查，采集 CPU/内存/磁盘/负载/Docker 异常/错误日志，
   * 按阈值评估并生成巡检报告（不依赖外部 AI 模型，纯命令采集 + 规则判断）
   */
  private async executeInspection(task: ScheduledTaskRow): Promise<string> {
    const server = serverQueries.getById(task.serverId)
    if (!server) {
      throw new Error(`Server not found: ${task.serverId}`)
    }

    // 确保服务器已连接
    if (!sshService.isConnected(task.serverId)) {
      const connectResult = await sshService.connect({
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined
      })
      if (!connectResult.success) {
        throw new Error(`Failed to connect to server: ${connectResult.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 采集脚本（标记化输出便于解析）
    const script = [
      'echo "[CPU]"',
      // 取 "Cpu(s): ... 83.9 id, ..." 中的 idle 值，CPU 使用率 = 100 - idle
      "top -bn1 | grep 'Cpu(s)' | awk -F'id,' '{split($1,a,\",\"); print 100-(a[length(a)]+0)}' | tr -d ' \n' || echo 0",
      'echo "[MEM]"',
      "free | grep Mem | awk '{printf \"%.1f\", $3/$2*100}' || echo 0",
      'echo "[DISK]"',
      "df / | tail -1 | awk '{print $5}' | sed 's/%//' || echo 0",
      'echo "[LOAD]"',
      "uptime | awk -F'load average:' '{print $2}' || echo unknown",
      'echo "[DOCKER_ABNORMAL]"',
      "docker ps -a --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -iE 'exited|unhealthy|restarting' | head -10 || echo none",
      'echo "[ERR_LOG_COUNT]"',
      "journalctl -p err --since '24 hours ago' --no-pager 2>/dev/null | wc -l || echo 0",
      'echo "[DONE]"'
    ].join('; ')

    const result = await sshService.executeCommand(task.serverId, script, 2, 1000, 60000)
    if (!result.success) {
      throw new Error(`Inspection command failed: ${result.stderr}`)
    }

    const out = result.stdout
    const lines = out.split('\n')
    const values: Record<string, string> = {}
    let key = ''
    for (const line of lines) {
      const m = line.match(/^\[(\w+)\]\s*(.*)$/)
      if (m) {
        key = m[1]
        values[key] = m[2].trim()
        continue
      }
      if (key && values[key] !== undefined) {
        // 续行（如 DOCKER_ABNORMAL 多行）
        values[key] += (values[key] ? '\n' : '') + line.trim()
      }
    }

    // 采集值兜底：命令失败/无输出时按 0 处理，避免出现 NaN%
    const safe = (v: number): number => (isNaN(v) || !isFinite(v) ? 0 : v)
    const cpu = safe(parseFloat(values.CPU || '0'))
    const mem = safe(parseFloat(values.MEM || '0'))
    const disk = safe(parseFloat(values.DISK || '0'))
    const load = values.LOAD || 'unknown'
    const abnormalContainers = values.DOCKER_ABNORMAL && values.DOCKER_ABNORMAL !== 'none'
      ? values.DOCKER_ABNORMAL.split('\n').slice(0, 10)
      : []
    const errCount = parseInt(values.ERR_LOG_COUNT || '0', 10)

    // 阈值评估
    const issues: string[] = []
    const check = (name: string, v: number, warn: number, crit: number) => {
      if (v > crit) issues.push(`[critical] ${name} 使用率 ${v.toFixed(1)}% (阈值 ${crit}%)`)
      else if (v > warn) issues.push(`[warning] ${name} 使用率 ${v.toFixed(1)}% (阈值 ${warn}%)`)
    }
    check('CPU', cpu, 80, 90)
    check('内存', mem, 80, 90)
    check('磁盘', disk, 85, 90)
    if (abnormalContainers.length > 0) issues.push(`[warning] ${abnormalContainers.length} 个容器状态异常: ${abnormalContainers.join(' | ')}`)
    if (errCount > 0) issues.push(`[info] 最近 24 小时错误日志 ${errCount} 条`)

    const summary = [
      `智能巡检完成 (${new Date().toLocaleString()})`,
      `CPU: ${cpu.toFixed(1)}% | 内存: ${mem.toFixed(1)}% | 磁盘: ${disk.toFixed(1)}% | 负载: ${load}`
    ]
    if (issues.length > 0) {
      summary.push('发现异常:')
      summary.push(...issues.map(i => `- ${i}`))
    } else {
      summary.push('各项指标正常，无异常')
    }
    return summary.join('\n')
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

import log from 'electron-log'
import { sshService } from '../ssh'
import { appQueries, serverQueries } from '../database'
import { randomUUID } from 'crypto'
import { shQuote, validatePath, validateEnvName, assertSafe } from '../utils/shell'

export interface EnvVariable {
  name: string
  value: string
}

export interface DeployOptions {
  serverId: string
  appName: string
  dockerCompose: string
  projectPath: string
  templateId?: string
  envVariables?: EnvVariable[]
}

export interface DeployResult {
  success: boolean
  appId?: string
  message: string
  containerIds?: string[]
}

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  ports: string[]
  created: string
}

export interface ContainerStats {
  containerId: string
  containerName: string
  cpuPercent: number
  memoryUsage: string
  memoryLimit: string
  memoryPercent: number
  networkIO: string
  blockIO: string
  pids: number
}

export interface ComposeEnvInfo {
  /** v2 = docker compose 插件；v1 = docker-compose 独立版；unknown = 未检测到 */
  type: 'v1' | 'v2' | 'unknown'
  /** 实际使用的 compose 命令前缀 */
  command: string
  dockerVersion: string
  composeVersion: string
}

/**
 * 根据 Compose 版本规范化 compose 内容：
 * - Compose V1：需要 version 键（无则补上）
 * - Compose V2：version 键已废弃且部分版本直接报错，必须移除
 * - unknown：保持原样，不做任何修改
 */
export function normalizeComposeContent(content: string, type: ComposeEnvInfo['type']): string {
  if (!content) return content
  const versionLineRegex = /^version:\s*["']?\d+(?:\.\d+)*["']?\s*$/m
  const hasVersion = versionLineRegex.test(content)

  if (type === 'v2' && hasVersion) {
    return content.replace(versionLineRegex, '').replace(/^\n/, '')
  }
  if (type === 'v1' && !hasVersion) {
    return `version: "3.8"\n${content}`
  }
  return content
}

class AppDeployService {
  // Compose 环境检测缓存（每台服务器 10 分钟），避免每次操作重复探测
  private composeEnvCache = new Map<string, { info: ComposeEnvInfo; expiresAt: number }>()
  private readonly composeEnvCacheTtl = 10 * 60 * 1000

  /**
   * 自动检测服务器上的 Docker 与 Compose 版本，决定使用 docker compose（V2）还是 docker-compose（V1）
   */
  async detectComposeEnvironment(serverId: string): Promise<ComposeEnvInfo> {
    const cached = this.composeEnvCache.get(serverId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.info
    }

    // Docker 版本
    const dockerRes = await sshService.executeCommand(serverId, 'docker --version 2>/dev/null', 0, 500, 10000)
    const dockerVersion = dockerRes.success ? dockerRes.stdout.trim() : ''

    // 优先检测 Compose V2 插件
    const v2Res = await sshService.executeCommand(
      serverId,
      'docker compose version 2>/dev/null || docker compose --version 2>/dev/null',
      0,
      500,
      10000
    )
    if (v2Res.success && v2Res.stdout.trim()) {
      const info: ComposeEnvInfo = {
        type: 'v2',
        command: 'docker compose',
        dockerVersion,
        composeVersion: this.parseComposeVersion(v2Res.stdout)
      }
      this.composeEnvCache.set(serverId, { info, expiresAt: Date.now() + this.composeEnvCacheTtl })
      log.info(`Server ${serverId}: Docker Compose V2 detected (${info.composeVersion || 'unknown version'})`)
      return info
    }

    // 再检测 Compose V1 独立版
    const v1Res = await sshService.executeCommand(
      serverId,
      'docker-compose version 2>/dev/null || docker-compose --version 2>/dev/null',
      0,
      500,
      10000
    )
    if (v1Res.success && v1Res.stdout.trim()) {
      const info: ComposeEnvInfo = {
        type: 'v1',
        command: 'docker-compose',
        dockerVersion,
        composeVersion: this.parseComposeVersion(v1Res.stdout)
      }
      this.composeEnvCache.set(serverId, { info, expiresAt: Date.now() + this.composeEnvCacheTtl })
      log.info(`Server ${serverId}: Docker Compose V1 detected (${info.composeVersion || 'unknown version'})`)
      return info
    }

    // 都未检测到：保守回退到 docker-compose，内容不做修改
    const fallback: ComposeEnvInfo = {
      type: 'unknown',
      command: 'docker-compose',
      dockerVersion,
      composeVersion: ''
    }
    this.composeEnvCache.set(serverId, { info: fallback, expiresAt: Date.now() + this.composeEnvCacheTtl })
    log.warn(`Server ${serverId}: compose command not detected, falling back to docker-compose`)
    return fallback
  }

  private parseComposeVersion(output: string): string {
    const match = output.trim().match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : output.trim()
  }

  private async getComposeCommand(serverId: string): Promise<string> {
    const env = await this.detectComposeEnvironment(serverId)
    return env.command
  }

  /** 校验项目路径（防命令注入/路径穿越），不合法直接抛错 */
  private assertProjectPath(path: string): void {
    assertSafe(validatePath(path, '项目路径'))
  }

  async deployApp(
    options: DeployOptions,
    onProgress?: (info: { percent: number; stage: string; message: string }) => void
  ): Promise<DeployResult> {
    const { serverId, appName, dockerCompose, projectPath, templateId, envVariables } = options
    // 进度上报：异常不影响部署流程本身
    const report = (percent: number, stage: string, message: string) => {
      try {
        onProgress?.({ percent, stage, message })
      } catch { /* ignore */ }
    }

    log.info(`Starting deployment of app ${appName} to server ${serverId}`)

    if (!sshService.isConnected(serverId)) {
      return { success: false, message: 'Server not connected. Please connect to the server first.' }
    }

    // projectPath 来自渲染层输入，拼入 shell 前必须校验（防命令注入/路径穿越）
    try {
      assertSafe(validatePath(projectPath, '项目路径'))
    } catch (pathError) {
      return { success: false, message: (pathError as Error).message }
    }
    const invalidEnv = (envVariables || []).find(v => v.name && v.name.trim() && !validateEnvName(v.name.trim()))
    if (invalidEnv) {
      return { success: false, message: `非法的环境变量名: ${invalidEnv.name}（仅允许字母、数字、下划线，且不能以数字开头）` }
    }

    const server = serverQueries.getById(serverId)
    if (!server) {
      return { success: false, message: 'Server not found' }
    }

    const appId = randomUUID()

    try {
      appQueries.insert({
        id: appId,
        name: appName,
        serverId,
        templateId: templateId || 'custom',
        projectPath,
        status: 'deploying',
        containerIds: '[]'
      })
    } catch (insertError) {
      log.error('Failed to insert app record:', insertError)
      return { success: false, message: `Failed to create app record: ${(insertError as Error).message}` }
    }

    try {
      report(10, 'prepare', '创建远程目录')
      const dirsResult = await this.ensureDirectory(serverId, projectPath)
      if (!dirsResult.success) {
        this.updateAppStatus(appId, 'error', '[]')
        return { success: false, appId, message: `Failed to create directory: ${dirsResult.message}` }
      }

      report(25, 'upload', '上传 docker-compose.yml')
      log.info(`Uploading docker-compose.yml to ${projectPath}`)
      // 自动检测 Compose 版本并按版本规范化内容（V1 保留/补充 version 键，V2 移除）
      const composeEnv = await this.detectComposeEnvironment(serverId)
      const normalizedCompose = normalizeComposeContent(dockerCompose, composeEnv.type)
      const uploadResult = await sshService.uploadContent(serverId, normalizedCompose, `${projectPath}/docker-compose.yml`)
      if (!uploadResult.success) {
        this.updateAppStatus(appId, 'error', '[]')
        return { success: false, appId, message: `Failed to upload docker-compose.yml: ${uploadResult.message}` }
      }

      if (envVariables && envVariables.length > 0) {
        report(40, 'upload', '上传 .env 环境变量')
        log.info(`Generating .env file for ${appName}`)
        const envContent = envVariables
          .filter(v => v.name.trim())
          .map(v => `${v.name}=${v.value || ''}`)
          .join('\n')

        const envUploadResult = await sshService.uploadContent(serverId, envContent, `${projectPath}/.env`)
        if (!envUploadResult.success) {
          this.updateAppStatus(appId, 'error', '[]')
          return { success: false, appId, message: `Failed to upload .env file: ${envUploadResult.message}` }
        }
      }

      report(55, 'pull', '拉取 Docker 镜像（可能需要较长时间）')
      log.info(`Pulling Docker images for ${appName}`)
      const pullResult = await sshService.executeCommand(serverId, `cd ${shQuote(projectPath)} && ${composeEnv.command} --env-file .env pull 2>/dev/null || ${composeEnv.command} pull`)
      if (!pullResult.success) {
        log.warn(`Docker pull warning: ${pullResult.stderr}`)
      }

      report(75, 'up', '启动容器')
      log.info(`Starting containers for ${appName}`)
      const deployResult = await sshService.executeCommand(serverId, `cd ${shQuote(projectPath)} && ${composeEnv.command} --env-file .env up -d 2>/dev/null || ${composeEnv.command} up -d`)
      if (!deployResult.success) {
        this.updateAppStatus(appId, 'error', '[]')
        return { success: false, appId, message: `Failed to start containers: ${deployResult.stderr}` }
      }

      await new Promise(resolve => setTimeout(resolve, 3000))

      report(90, 'inspect', '获取容器列表')
      const containerIds = await this.getContainerIds(serverId, projectPath, appName)
      this.updateAppStatus(appId, 'running', JSON.stringify(containerIds))

      log.info(`App ${appName} deployed successfully with containers: ${containerIds.join(', ')}`)
      return {
        success: true,
        appId,
        message: 'Application deployed successfully',
        containerIds
      }
    } catch (error) {
      const err = error as Error
      log.error(`Deployment error for ${appName}:`, err)
      this.updateAppStatus(appId, 'error', '[]')
      return { success: false, appId, message: `Deployment failed: ${err.message}` }
    }
  }

  private async ensureDirectory(serverId: string, path: string): Promise<{ success: boolean; message: string }> {
    this.assertProjectPath(path)
    const quoted = shQuote(path)
    const checkCmd = `if [ -d ${quoted} ]; then echo "exists"; else mkdir -p ${quoted}; fi`
    const result = await sshService.executeCommand(serverId, checkCmd)

    if (result.success) {
      return { success: true, message: 'Directory ready' }
    }

    const createResult = await sshService.executeCommand(serverId, `mkdir -p ${quoted}`)

    if (createResult.success) {
      return { success: true, message: 'Directory created' }
    }

    return { success: false, message: createResult.stderr || 'Failed to create directory' }
  }

  private async getContainerIds(serverId: string, projectPath: string, appName: string): Promise<string[]> {
    const composeCmd = await this.getComposeCommand(serverId)
    const psResult = await sshService.executeCommand(
      serverId,
      `cd ${shQuote(projectPath)} && ${composeCmd} ps -aq`
    )

    if (!psResult.success || !psResult.stdout.trim()) {
      return []
    }

    const containerIds = psResult.stdout.trim().split('\n').filter(id => id.trim())
    return containerIds
  }

  private updateAppStatus(appId: string, status: string, containerIds: string): void {
    try {
      appQueries.update(appId, {
        status: status as 'running' | 'stopped' | 'deploying' | 'error',
        containerIds
      })
    } catch (error) {
      log.error('Failed to update app status:', error)
    }
  }

  async startApp(appId: string): Promise<{ success: boolean; message: string }> {
    const app = appQueries.getById(appId)
    if (!app) {
      return { success: false, message: 'Application not found' }
    }

    if (!sshService.isConnected(app.serverId)) {
      return { success: false, message: 'Server not connected' }
    }

    this.assertProjectPath(app.projectPath)

    try {
      appQueries.update(appId, { status: 'deploying' })

      const composeCmd = await this.getComposeCommand(app.serverId)
      const result = await sshService.executeCommand(app.serverId, `cd ${shQuote(app.projectPath)} && ${composeCmd} start`)
      if (!result.success) {
        appQueries.update(appId, { status: 'error' })
        return { success: false, message: `Failed to start: ${result.stderr}` }
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
      const containerIds = await this.getContainerIds(app.serverId, app.projectPath, app.name)
      appQueries.update(appId, { status: 'running', containerIds: JSON.stringify(containerIds) })

      return { success: true, message: 'Application started successfully' }
    } catch (error) {
      const err = error as Error
      log.error(`Start app error:`, err)
      appQueries.update(appId, { status: 'error' })
      return { success: false, message: err.message }
    }
  }

  async stopApp(appId: string): Promise<{ success: boolean; message: string }> {
    const app = appQueries.getById(appId)
    if (!app) {
      return { success: false, message: 'Application not found' }
    }

    if (!sshService.isConnected(app.serverId)) {
      return { success: false, message: 'Server not connected' }
    }

    this.assertProjectPath(app.projectPath)

    try {
      appQueries.update(appId, { status: 'deploying' })

      const composeCmd = await this.getComposeCommand(app.serverId)
      const result = await sshService.executeCommand(app.serverId, `cd ${shQuote(app.projectPath)} && ${composeCmd} stop`)
      if (!result.success) {
        appQueries.update(appId, { status: 'error' })
        return { success: false, message: `Failed to stop: ${result.stderr}` }
      }

      appQueries.update(appId, { status: 'stopped' })
      return { success: true, message: 'Application stopped successfully' }
    } catch (error) {
      const err = error as Error
      log.error(`Stop app error:`, err)
      appQueries.update(appId, { status: 'error' })
      return { success: false, message: err.message }
    }
  }

  async restartApp(appId: string): Promise<{ success: boolean; message: string }> {
    const stopResult = await this.stopApp(appId)
    if (!stopResult.success) {
      return stopResult
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
    return await this.startApp(appId)
  }

  async deleteApp(appId: string): Promise<{ success: boolean; message: string }> {
    const app = appQueries.getById(appId)
    if (!app) {
      return { success: false, message: 'Application not found' }
    }

    if (!sshService.isConnected(app.serverId)) {
      appQueries.delete(appId)
      return { success: true, message: 'Application deleted (server not connected)' }
    }

    // 高危操作：rm -rf 前强制校验路径，杜绝注入与误删
    this.assertProjectPath(app.projectPath)
    const quotedPath = shQuote(app.projectPath)

    try {
      const composeCmd = await this.getComposeCommand(app.serverId)
      const downResult = await sshService.executeCommand(app.serverId, `cd ${quotedPath} && ${composeCmd} down -v --remove-orphans`)
      if (!downResult.success) {
        log.warn(`docker-compose down warning: ${downResult.stderr}`)
      }

      const rmResult = await sshService.executeCommand(app.serverId, `rm -rf ${quotedPath}`)
      if (!rmResult.success) {
        log.warn(`Failed to remove project directory: ${rmResult.stderr}`)
      }

      appQueries.delete(appId)
      return { success: true, message: 'Application deleted successfully' }
    } catch (error) {
      const err = error as Error
      log.error(`Delete app error:`, err)
      appQueries.delete(appId)
      return { success: true, message: 'Application deleted (with errors)' }
    }
  }

  async updateApp(appId: string, dockerCompose?: string): Promise<{ success: boolean; message: string }> {
    const app = appQueries.getById(appId)
    if (!app) {
      return { success: false, message: 'Application not found' }
    }

    if (!sshService.isConnected(app.serverId)) {
      return { success: false, message: 'Server not connected' }
    }

    this.assertProjectPath(app.projectPath)

    try {
      appQueries.update(appId, { status: 'deploying' })

      const composeEnv = await this.detectComposeEnvironment(app.serverId)
      if (dockerCompose) {
        // 按 Compose 版本规范化内容后上传
        const normalizedCompose = normalizeComposeContent(dockerCompose, composeEnv.type)
        const uploadResult = await sshService.uploadContent(app.serverId, normalizedCompose, `${app.projectPath}/docker-compose.yml`)
        if (!uploadResult.success) {
          appQueries.update(appId, { status: 'error' })
          return { success: false, message: `Failed to update config: ${uploadResult.message}` }
        }
      }

      const pullResult = await sshService.executeCommand(app.serverId, `cd ${shQuote(app.projectPath)} && ${composeEnv.command} pull`)
      if (!pullResult.success) {
        log.warn(`Pull warning: ${pullResult.stderr}`)
      }

      const upResult = await sshService.executeCommand(app.serverId, `cd ${shQuote(app.projectPath)} && ${composeEnv.command} up -d`)
      if (!upResult.success) {
        appQueries.update(appId, { status: 'error' })
        return { success: false, message: `Failed to update: ${upResult.stderr}` }
      }

      await new Promise(resolve => setTimeout(resolve, 3000))
      const containerIds = await this.getContainerIds(app.serverId, app.projectPath, app.name)
      appQueries.update(appId, { status: 'running', containerIds: JSON.stringify(containerIds) })

      return { success: true, message: 'Application updated successfully' }
    } catch (error) {
      const err = error as Error
      log.error(`Update app error:`, err)
      appQueries.update(appId, { status: 'error' })
      return { success: false, message: err.message }
    }
  }

  async getContainerInfo(serverId: string, projectPath: string): Promise<ContainerInfo[]> {
    if (!sshService.isConnected(serverId)) {
      return []
    }

    this.assertProjectPath(projectPath)

    const composeCmd = await this.getComposeCommand(serverId)
    const psResult = await sshService.executeCommand(
      serverId,
      `cd ${shQuote(projectPath)} && ${composeCmd} ps -a --format json 2>/dev/null || ${composeCmd} ps -a`
    )

    if (!psResult.success || !psResult.stdout.trim()) {
      return []
    }

    try {
      const lines = psResult.stdout.trim().split('\n')
      const containers: ContainerInfo[] = []

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          containers.push({
            id: parsed.ID || parsed.Id || '',
            name: parsed.Name || parsed.Name || '',
            image: parsed.Image || '',
            status: parsed.Status || '',
            ports: parsed.Ports ? parsed.Ports.split(',') : [],
            created: parsed.CreatedAt || ''
          })
        } catch {
          const parts = line.split(/\s+/)
          if (parts.length >= 4) {
            containers.push({
              id: parts[0] || '',
              name: parts[1] || '',
              image: parts[2] || '',
              status: parts[3] || '',
              ports: [],
              created: ''
            })
          }
        }
      }

      return containers
    } catch {
      return []
    }
  }

  async getAppLogs(serverId: string, projectPath: string, lines: number = 100): Promise<string> {
    if (!sshService.isConnected(serverId)) {
      return 'Server not connected'
    }

    this.assertProjectPath(projectPath)

    const composeCmd = await this.getComposeCommand(serverId)
    const result = await sshService.executeCommand(
      serverId,
      `cd ${shQuote(projectPath)} && ${composeCmd} logs --tail=${lines}`
    )

    if (result.success) {
      return result.stdout
    }

    return `Failed to get logs: ${result.stderr}`
  }

  async getContainerStats(serverId: string, containerId: string): Promise<ContainerStats | null> {
    if (!sshService.isConnected(serverId)) {
      return null
    }

    const result = await sshService.executeCommand(
      serverId,
      `docker stats --no-stream --format "{{.ID}},{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}" ${containerId}`
    )

    if (!result.success || !result.stdout.trim()) {
      return null
    }

    try {
      const parts = result.stdout.trim().split(',')
      if (parts.length < 8) {
        return null
      }

      const [memUsage, memLimit] = parts[3].split('/').map(s => s.trim())
      const cpuPercent = parseFloat(parts[2].replace('%', '')) || 0
      const memoryPercent = parseFloat(parts[4].replace('%', '')) || 0

      return {
        containerId: parts[0],
        containerName: parts[1],
        cpuPercent,
        memoryUsage: memUsage || 'N/A',
        memoryLimit: memLimit || 'N/A',
        memoryPercent,
        networkIO: parts[5] || 'N/A',
        blockIO: parts[6] || 'N/A',
        pids: parseInt(parts[7]) || 0
      }
    } catch {
      return null
    }
  }

  async getContainerStatsByProject(serverId: string, projectPath: string): Promise<ContainerStats[]> {
    if (!sshService.isConnected(serverId)) {
      return []
    }

    const containers = await this.getContainerInfo(serverId, projectPath)
    if (containers.length === 0) {
      return []
    }

    // 单条 docker stats 批量采集全部容器（此前逐容器串行，N 容器 = N 次 SSH 往返）
    const ids = containers.map(c => c.id).join(' ')
    const result = await sshService.executeCommand(
      serverId,
      `docker stats --no-stream --format "{{.ID}},{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}" ${ids}`
    )

    const stats: ContainerStats[] = []
    if (!result.success || !result.stdout.trim()) {
      return stats
    }

    for (const line of result.stdout.trim().split('\n').filter(l => l.trim())) {
      const parts = line.split(',')
      if (parts.length < 8) continue

      const [memUsage, memLimit] = parts[3].split('/').map(s => s.trim())
      stats.push({
        containerId: parts[0],
        containerName: parts[1],
        cpuPercent: parseFloat(parts[2].replace('%', '')) || 0,
        memoryUsage: memUsage || 'N/A',
        memoryLimit: memLimit || 'N/A',
        memoryPercent: parseFloat(parts[4].replace('%', '')) || 0,
        networkIO: parts[5] || 'N/A',
        blockIO: parts[6] || 'N/A',
        pids: parseInt(parts[7], 10) || 0
      })
    }

    return stats
  }

  async startContainer(serverId: string, containerId: string): Promise<{ success: boolean; message: string }> {
    if (!sshService.isConnected(serverId)) {
      return { success: false, message: 'Server not connected' }
    }

    const result = await sshService.executeCommand(serverId, `docker start ${containerId}`)
    if (!result.success) {
      return { success: false, message: `Failed to start container: ${result.stderr}` }
    }
    return { success: true, message: 'Container started' }
  }

  async stopContainer(serverId: string, containerId: string): Promise<{ success: boolean; message: string }> {
    if (!sshService.isConnected(serverId)) {
      return { success: false, message: 'Server not connected' }
    }

    const result = await sshService.executeCommand(serverId, `docker stop ${containerId}`)
    if (!result.success) {
      return { success: false, message: `Failed to stop container: ${result.stderr}` }
    }
    return { success: true, message: 'Container stopped' }
  }

  async restartContainer(serverId: string, containerId: string): Promise<{ success: boolean; message: string }> {
    if (!sshService.isConnected(serverId)) {
      return { success: false, message: 'Server not connected' }
    }

    const result = await sshService.executeCommand(serverId, `docker restart ${containerId}`)
    if (!result.success) {
      return { success: false, message: `Failed to restart container: ${result.stderr}` }
    }
    return { success: true, message: 'Container restarted' }
  }

  async getContainerLogs(serverId: string, containerId: string, lines: number = 100): Promise<string> {
    if (!sshService.isConnected(serverId)) {
      return 'Server not connected'
    }

    const result = await sshService.executeCommand(
      serverId,
      `docker logs --tail=${lines} ${containerId}`
    )

    if (result.success) {
      return result.stdout
    }
    return `Failed to get logs: ${result.stderr}`
  }
}

export const appDeployService = new AppDeployService()

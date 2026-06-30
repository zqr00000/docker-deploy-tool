import log from 'electron-log'
import { sshService } from './ssh'
import { appQueries, serverQueries } from './database'
import { randomUUID } from 'crypto'

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

class AppDeployService {
  async deployApp(options: DeployOptions): Promise<DeployResult> {
    const { serverId, appName, dockerCompose, projectPath, templateId } = options

    log.info(`Starting deployment of app ${appName} to server ${serverId}`)

    if (!sshService.isConnected(serverId)) {
      return { success: false, message: 'Server not connected. Please connect to the server first.' }
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
      const dirsResult = await this.ensureDirectory(serverId, projectPath)
      if (!dirsResult.success) {
        this.updateAppStatus(appId, 'error', '[]')
        return { success: false, appId, message: `Failed to create directory: ${dirsResult.message}` }
      }

      log.info(`Uploading docker-compose.yml to ${projectPath}`)
      const uploadResult = await sshService.uploadContent(serverId, dockerCompose, `${projectPath}/docker-compose.yml`)
      if (!uploadResult.success) {
        this.updateAppStatus(appId, 'error', '[]')
        return { success: false, appId, message: `Failed to upload docker-compose.yml: ${uploadResult.message}` }
      }

      if (envVariables && envVariables.length > 0) {
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

      log.info(`Pulling Docker images for ${appName}`)
      const pullResult = await sshService.executeCommand(serverId, `cd ${projectPath} && docker-compose --env-file .env pull 2>/dev/null || docker-compose pull`)
      if (!pullResult.success) {
        log.warn(`Docker pull warning: ${pullResult.stderr}`)
      }

      log.info(`Starting containers for ${appName}`)
      const deployResult = await sshService.executeCommand(serverId, `cd ${projectPath} && docker-compose --env-file .env up -d 2>/dev/null || docker-compose up -d`)
      if (!deployResult.success) {
        this.updateAppStatus(appId, 'error', '[]')
        return { success: false, appId, message: `Failed to start containers: ${deployResult.stderr}` }
      }

      await new Promise(resolve => setTimeout(resolve, 3000))

      const containerIds = await this.getContainerIds(serverId, projectPath, appName)
      this.updateAppStatus(appId, 'running', JSON.stringify(containerIds))

      appQueries.update(appId, {
        status: 'running',
        containerIds: JSON.stringify(containerIds)
      })

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
    const checkCmd = `if [ -d "${path}" ]; then echo "exists"; else mkdir -p "${path}"; fi`
    const result = await sshService.executeCommand(serverId, checkCmd)

    if (result.success) {
      return { success: true, message: 'Directory ready' }
    }

    const createCmd = `mkdir -p "${path}"`
    const createResult = await sshService.executeCommand(serverId, createCmd)

    if (createResult.success) {
      return { success: true, message: 'Directory created' }
    }

    return { success: false, message: createResult.stderr || 'Failed to create directory' }
  }

  private async getContainerIds(serverId: string, projectPath: string, appName: string): Promise<string[]> {
    const psResult = await sshService.executeCommand(
      serverId,
      `cd ${projectPath} && docker-compose ps -aq`
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

    try {
      appQueries.update(appId, { status: 'deploying' })

      const result = await sshService.executeCommand(app.serverId, `cd ${app.projectPath} && docker-compose start`)
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

    try {
      appQueries.update(appId, { status: 'deploying' })

      const result = await sshService.executeCommand(app.serverId, `cd ${app.projectPath} && docker-compose stop`)
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

    try {
      const downResult = await sshService.executeCommand(app.serverId, `cd ${app.projectPath} && docker-compose down -v --remove-orphans`)
      if (!downResult.success) {
        log.warn(`docker-compose down warning: ${downResult.stderr}`)
      }

      const rmResult = await sshService.executeCommand(app.serverId, `rm -rf ${app.projectPath}`)
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

    try {
      appQueries.update(appId, { status: 'deploying' })

      if (dockerCompose) {
        const uploadResult = await sshService.uploadContent(app.serverId, dockerCompose, `${app.projectPath}/docker-compose.yml`)
        if (!uploadResult.success) {
          appQueries.update(appId, { status: 'error' })
          return { success: false, message: `Failed to update config: ${uploadResult.message}` }
        }
      }

      const pullResult = await sshService.executeCommand(app.serverId, `cd ${app.projectPath} && docker-compose pull`)
      if (!pullResult.success) {
        log.warn(`Pull warning: ${pullResult.stderr}`)
      }

      const upResult = await sshService.executeCommand(app.serverId, `cd ${app.projectPath} && docker-compose up -d`)
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

    const psResult = await sshService.executeCommand(
      serverId,
      `cd ${projectPath} && docker-compose ps -a --format json 2>/dev/null || docker-compose ps -a`
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

    const result = await sshService.executeCommand(
      serverId,
      `cd ${projectPath} && docker-compose logs --tail=${lines}`
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
    const stats: ContainerStats[] = []

    for (const container of containers) {
      const stat = await this.getContainerStats(serverId, container.id)
      if (stat) {
        stats.push(stat)
      }
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

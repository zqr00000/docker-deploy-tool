import log from 'electron-log'
import { sshService } from './ssh'
import type { DockerCheckResult } from '../renderer/types/docker-check'

class DockerCheckService {
  private parseVersion(output: string): string {
    const match = output.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : output.trim()
  }

  async checkDockerInstalled(serverId: string): Promise<{ installed: boolean; version: string }> {
    try {
      const result = await sshService.executeCommand(serverId, 'docker --version')
      if (result.success && result.stdout) {
        return {
          installed: true,
          version: this.parseVersion(result.stdout)
        }
      }
      return { installed: false, version: '' }
    } catch (error) {
      log.error('checkDockerInstalled error:', error)
      return { installed: false, version: '' }
    }
  }

  async checkDockerRunning(serverId: string): Promise<boolean> {
    try {
      const result = await sshService.executeCommand(serverId, 'docker info')
      return result.success
    } catch (error) {
      log.error('checkDockerRunning error:', error)
      return false
    }
  }

  async checkDockerComposeInstalled(serverId: string): Promise<{ installed: boolean; version: string }> {
    try {
      const result = await sshService.executeCommand(serverId, 'docker-compose --version')
      if (result.success && result.stdout) {
        return {
          installed: true,
          version: this.parseVersion(result.stdout)
        }
      }
      return { installed: false, version: '' }
    } catch (error) {
      log.error('checkDockerComposeInstalled error:', error)
      return { installed: false, version: '' }
    }
  }

  async checkEnvironment(serverId: string): Promise<DockerCheckResult> {
    log.info(`Starting Docker environment check for server: ${serverId}`)

    const result: DockerCheckResult = {
      dockerInstalled: false,
      dockerRunning: false,
      dockerVersion: '',
      composeInstalled: false,
      composeVersion: ''
    }

    const connectionStatus = sshService.getConnectionStatus(serverId)
    if (connectionStatus !== 'online') {
      result.error = 'SSH connection is not available'
      log.warn(`Server ${serverId} is not connected`)
      return result
    }

    try {
      const [dockerInfo, composeInfo] = await Promise.all([
        this.checkDockerInstalled(serverId),
        this.checkDockerComposeInstalled(serverId)
      ])

      result.dockerInstalled = dockerInfo.installed
      result.dockerVersion = dockerInfo.version
      result.composeInstalled = composeInfo.installed
      result.composeVersion = composeInfo.version

      if (dockerInfo.installed) {
        result.dockerRunning = await this.checkDockerRunning(serverId)
      }

      log.info(`Docker environment check completed for server ${serverId}:`, result)
      
      return result
    } catch (error) {
      const err = error as Error
      
      log.error(`Docker environment check failed for server ${serverId}:`, err)
      result.error = err.message
      return result
    }
  }
}

export const dockerCheckService = new DockerCheckService()
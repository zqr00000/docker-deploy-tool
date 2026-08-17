import log from 'electron-log'
import { deploymentHistoryQueries, DeploymentHistoryRow, serverQueries, appQueries } from '../database'
import { sshService } from '../ssh'

export interface DeployHistoryRecord {
  id: string
  appId: string
  appName: string
  serverId: string
  version: number
  dockerCompose: string
  envVariables: string | null
  deployedAt: string
  status: string
}

export interface RollbackResult {
  success: boolean
  message: string
  appId?: string
}

class DeployHistoryService {
  /**
   * 记录一次部署历史
   */
  recordDeployment(params: {
    appId: string
    appName: string
    serverId: string
    dockerCompose: string
    envVariables?: string
    status: string
  }): DeployHistoryRecord {
    const { appId, appName, serverId, dockerCompose, envVariables, status } = params

    const latestVersion = deploymentHistoryQueries.getLatestVersion(appId)
    const version = latestVersion + 1

    const record = deploymentHistoryQueries.insert({
      appId,
      appName,
      serverId,
      version,
      dockerCompose,
      envVariables: envVariables || null,
      deployedAt: new Date().toISOString(),
      status
    })

    log.info(`Recorded deployment history: app=${appName}, version=${version}, status=${status}`)
    return record
  }

  /**
   * 获取指定应用的所有部署历史
   */
  getHistoryByAppId(appId: string): DeployHistoryRecord[] {
    return deploymentHistoryQueries.getByAppId(appId)
  }

  /**
   * 获取所有部署历史
   */
  getAllHistory(): DeployHistoryRecord[] {
    return deploymentHistoryQueries.getAll()
  }

  /**
   * 根据ID获取部署历史记录
   */
  getHistoryById(id: string): DeployHistoryRecord | undefined {
    return deploymentHistoryQueries.getById(id)
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(historyId: string): Promise<RollbackResult> {
    const historyRecord = deploymentHistoryQueries.getById(historyId)

    if (!historyRecord) {
      return { success: false, message: '部署历史记录不存在' }
    }

    const { appId, appName, serverId, dockerCompose, envVariables, version } = historyRecord

    log.info(`Starting rollback: app=${appName}, target version=${version}`)

    // 检查服务器连接
    if (!sshService.isConnected(serverId)) {
      return { success: false, message: '服务器未连接，请先连接服务器' }
    }

    // 获取应用信息
    const appInfo = appQueries.getById(appId)
    if (!appInfo) {
      return { success: false, message: '应用不存在' }
    }

    const server = serverQueries.getById(serverId)
    if (!server) {
      return { success: false, message: '服务器不存在' }
    }

    try {
      // 更新应用状态为部署中
      appQueries.update(appId, { status: 'deploying' })

      // 上传历史版本的 docker-compose.yml
      const projectPath = appInfo.projectPath
      const uploadResult = await sshService.uploadContent(
        serverId,
        dockerCompose,
        `${projectPath}/docker-compose.yml`
      )

      if (!uploadResult.success) {
        appQueries.update(appId, { status: 'error' })
        return { success: false, appId, message: `上传 docker-compose.yml 失败: ${uploadResult.message}` }
      }

      // 上传历史版本的 .env 文件（如果有）
      if (envVariables) {
        const envContent = JSON.parse(envVariables as string)
          .map((v: { name: string; value: string }) => `${v.name}=${v.value || ''}`)
          .join('\n')

        if (envContent) {
          await sshService.uploadContent(serverId, envContent, `${projectPath}/.env`)
        }
      }

      // 执行 docker-compose pull
      const pullResult = await sshService.executeCommand(
        serverId,
        `cd ${projectPath} && docker-compose pull 2>/dev/null || docker compose pull`
      )
      if (!pullResult.success) {
        log.warn(`Docker pull warning during rollback: ${pullResult.stderr}`)
      }

      // 执行 docker-compose up -d
      const upResult = await sshService.executeCommand(
        serverId,
        `cd ${projectPath} && docker-compose up -d 2>/dev/null || docker compose up -d`
      )

      if (!upResult.success) {
        appQueries.update(appId, { status: 'error' })
        return { success: false, appId, message: `回滚失败: ${upResult.stderr}` }
      }

      // 等待容器启动
      await new Promise(resolve => setTimeout(resolve, 3000))

      // 获取容器ID列表
      const psResult = await sshService.executeCommand(
        serverId,
        `cd ${projectPath} && docker-compose ps -aq`
      )

      const containerIds = psResult.success && psResult.stdout.trim()
        ? psResult.stdout.trim().split('\n').filter(id => id.trim())
        : []

      // 更新应用状态
      appQueries.update(appId, {
        status: 'running',
        containerIds: JSON.stringify(containerIds)
      })

      // 记录回滚操作作为新的部署历史
      this.recordDeployment({
        appId,
        appName: `${appName} (rollback to v${version})`,
        serverId,
        dockerCompose,
        envVariables: envVariables ?? undefined,
        status: 'success'
      })

      log.info(`Rollback successful: app=${appName}, version=${version}`)
      return {
        success: true,
        appId,
        message: `成功回滚到版本 ${version}`
      }
    } catch (error) {
      const err = error as Error
      log.error(`Rollback error for ${appName}:`, err)
      appQueries.update(appId, { status: 'error' })
      return { success: false, appId, message: `回滚失败: ${err.message}` }
    }
  }

  /**
   * 对比两个版本的 docker-compose.yml
   */
  compareVersions(historyId1: string, historyId2: string): {
    version1: number
    version2: number
    compose1: string
    compose2: string
  } | null {
    const record1 = deploymentHistoryQueries.getById(historyId1)
    const record2 = deploymentHistoryQueries.getById(historyId2)

    if (!record1 || !record2) {
      return null
    }

    return {
      version1: record1.version,
      version2: record2.version,
      compose1: record1.dockerCompose,
      compose2: record2.dockerCompose
    }
  }
}

export const deployHistoryService = new DeployHistoryService()

import log from 'electron-log'
import { randomUUID } from 'crypto'
import { sshService } from '../ssh'
import { appDeployService, DeployOptions, DeployResult } from './app-deploy'
import { appQueries, serverQueries } from '../database'

export interface BatchDeployOptions {
  serverIds: string[]
  appName: string
  dockerCompose: string
  projectPath: string
  templateId?: string
  envVariables?: { name: string; value: string }[]
  parallelLimit?: number
}

export interface BatchDeployResult {
  success: boolean
  totalServers: number
  successCount: number
  failureCount: number
  results: {
    serverId: string
    serverName: string
    success: boolean
    message: string
    appId?: string
    containerIds?: string[]
  }[]
  message: string
}

export interface BatchAppOperation {
  appId: string
  serverId: string
  appName: string
}

export interface BatchOperationResult {
  success: boolean
  total: number
  successCount: number
  failureCount: number
  results: {
    appId: string
    appName: string
    serverId: string
    success: boolean
    message: string
  }[]
  message: string
}

export interface ServerStatusInfo {
  serverId: string
  serverName: string
  serverHost: string
  status: 'online' | 'offline' | 'connecting' | 'error'
  apps: {
    appId: string
    appName: string
    appStatus: 'running' | 'stopped' | 'deploying' | 'error'
    containerCount: number
  }[]
}

class BatchOperationsService {
  async batchDeploy(options: BatchDeployOptions): Promise<BatchDeployResult> {
    const { serverIds, appName, dockerCompose, projectPath, templateId, envVariables, parallelLimit = 3 } = options

    log.info(`Starting batch deployment of ${appName} to ${serverIds.length} servers`)

    const results: BatchDeployResult['results'] = []
    let successCount = 0
    let failureCount = 0

    // Process servers in batches based on parallel limit
    for (let i = 0; i < serverIds.length; i += parallelLimit) {
      const batch = serverIds.slice(i, i + parallelLimit)
      const batchPromises = batch.map(async (serverId) => {
        const server = serverQueries.getById(serverId)
        if (!server) {
          return {
            serverId,
            serverName: 'Unknown',
            success: false,
            message: 'Server not found'
          }
        }

        try {
          if (!sshService.isConnected(serverId)) {
            return {
              serverId,
              serverName: server.name,
              success: false,
              message: 'Server not connected'
            }
          }

          const deployOptions: DeployOptions = {
            serverId,
            appName,
            dockerCompose,
            projectPath,
            templateId,
            envVariables
          }

          const result: DeployResult = await appDeployService.deployApp(deployOptions)
          return {
            serverId,
            serverName: server.name,
            success: result.success,
            message: result.message,
            appId: result.appId,
            containerIds: result.containerIds
          }
        } catch (error) {
          return {
            serverId,
            serverName: server.name,
            success: false,
            message: (error as Error).message
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      for (const result of batchResults) {
        if (result.success) {
          successCount++
        } else {
          failureCount++
        }
        results.push(result)
      }
    }

    const totalServers = serverIds.length
    const overallSuccess = failureCount === 0

    log.info(`Batch deployment completed: ${successCount} succeeded, ${failureCount} failed`)

    return {
      success: overallSuccess,
      totalServers,
      successCount,
      failureCount,
      results,
      message: `Batch deployment completed: ${successCount}/${totalServers} servers succeeded`
    }
  }

  async batchStart(appIds: string[]): Promise<BatchOperationResult> {
    log.info(`Starting batch start for ${appIds.length} apps`)

    const results: BatchOperationResult['results'] = []
    let successCount = 0
    let failureCount = 0

    // Process in batches of 5
    const batchSize = 5
    for (let i = 0; i < appIds.length; i += batchSize) {
      const batch = appIds.slice(i, i + batchSize)
      const batchPromises = batch.map(async (appId) => {
        const app = appQueries.getById(appId)
        if (!app) {
          return {
            appId,
            appName: 'Unknown',
            serverId: '',
            success: false,
            message: 'Application not found'
          }
        }

        try {
          const result = await appDeployService.startApp(appId)
          return {
            appId,
            appName: app.name,
            serverId: app.serverId,
            success: result.success,
            message: result.message
          }
        } catch (error) {
          return {
            appId,
            appName: app.name,
            serverId: app.serverId,
            success: false,
            message: (error as Error).message
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      for (const result of batchResults) {
        if (result.success) {
          successCount++
        } else {
          failureCount++
        }
        results.push(result)
      }
    }

    return {
      success: failureCount === 0,
      total: appIds.length,
      successCount,
      failureCount,
      results,
      message: `Batch start completed: ${successCount}/${appIds.length} apps started`
    }
  }

  async batchStop(appIds: string[]): Promise<BatchOperationResult> {
    log.info(`Starting batch stop for ${appIds.length} apps`)

    const results: BatchOperationResult['results'] = []
    let successCount = 0
    let failureCount = 0

    const batchSize = 5
    for (let i = 0; i < appIds.length; i += batchSize) {
      const batch = appIds.slice(i, i + batchSize)
      const batchPromises = batch.map(async (appId) => {
        const app = appQueries.getById(appId)
        if (!app) {
          return {
            appId,
            appName: 'Unknown',
            serverId: '',
            success: false,
            message: 'Application not found'
          }
        }

        try {
          const result = await appDeployService.stopApp(appId)
          return {
            appId,
            appName: app.name,
            serverId: app.serverId,
            success: result.success,
            message: result.message
          }
        } catch (error) {
          return {
            appId,
            appName: app.name,
            serverId: app.serverId,
            success: false,
            message: (error as Error).message
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      for (const result of batchResults) {
        if (result.success) {
          successCount++
        } else {
          failureCount++
        }
        results.push(result)
      }
    }

    return {
      success: failureCount === 0,
      total: appIds.length,
      successCount,
      failureCount,
      results,
      message: `Batch stop completed: ${successCount}/${appIds.length} apps stopped`
    }
  }

  async batchRestart(appIds: string[]): Promise<BatchOperationResult> {
    log.info(`Starting batch restart for ${appIds.length} apps`)

    const results: BatchOperationResult['results'] = []
    let successCount = 0
    let failureCount = 0

    const batchSize = 3
    for (let i = 0; i < appIds.length; i += batchSize) {
      const batch = appIds.slice(i, i + batchSize)
      const batchPromises = batch.map(async (appId) => {
        const app = appQueries.getById(appId)
        if (!app) {
          return {
            appId,
            appName: 'Unknown',
            serverId: '',
            success: false,
            message: 'Application not found'
          }
        }

        try {
          const result = await appDeployService.restartApp(appId)
          return {
            appId,
            appName: app.name,
            serverId: app.serverId,
            success: result.success,
            message: result.message
          }
        } catch (error) {
          return {
            appId,
            appName: app.name,
            serverId: app.serverId,
            success: false,
            message: (error as Error).message
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      for (const result of batchResults) {
        if (result.success) {
          successCount++
        } else {
          failureCount++
        }
        results.push(result)
      }
    }

    return {
      success: failureCount === 0,
      total: appIds.length,
      successCount,
      failureCount,
      results,
      message: `Batch restart completed: ${successCount}/${appIds.length} apps restarted`
    }
  }

  getBatchServerStatus(serverIds: string[]): ServerStatusInfo[] {
    const statusList: ServerStatusInfo[] = []

    for (const serverId of serverIds) {
      const server = serverQueries.getById(serverId)
      if (!server) continue

      const apps = appQueries.getByServerId(serverId)
      const connectionStatus = sshService.getConnectionStatus(serverId)

      statusList.push({
        serverId: server.id,
        serverName: server.name,
        serverHost: server.host,
        status: connectionStatus,
        apps: apps.map(app => ({
          appId: app.id,
          appName: app.name,
          appStatus: app.status,
          containerCount: JSON.parse(app.containerIds || '[]').length
        }))
      })
    }

    return statusList
  }

  getAllServerStatuses(): ServerStatusInfo[] {
    const servers = serverQueries.getAll()
    return this.getBatchServerStatus(servers.map(s => s.id))
  }
}

export const batchOperationsService = new BatchOperationsService()

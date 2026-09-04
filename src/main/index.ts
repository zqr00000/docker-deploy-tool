import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from 'electron'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import { URL } from 'url'
import log from 'electron-log'
import { initDatabase, closeDatabase, serverQueries, templateQueries, appQueries, initDefaultTemplates, initDefaultShellScripts, configQueries, scheduledTaskQueries, serverGroupQueries } from './database'
import { sshService, generateId } from './ssh'
import { systemCheckService } from './services/system-check'
import { appDeployService } from './services/app-deploy'
import { installService } from './services/install-service'
import { dockerVolumesService } from './services/docker-volumes'
import { dockerImagesService } from './services/docker-images'
import { securityScanService } from './services/security-scan'
import { dockerNetworksService } from './services/docker-networks'
import { auditLogService } from './services/audit-log'
import { fetchPromotions } from './services/promo'
import { deployHistoryService } from './services/deploy-history'
import { batchOperationsService } from './services/batch-operations'
import { containerTerminalService } from './services/container-terminal'
import { alertService } from './services/alert-service'
import { schedulerService } from './services/scheduler'
import { healthCheckService } from './services/health-check'
import { resourceReportsService } from './services/resource-reports'
import { shellScriptService } from './services/shell-scripts'
import { initUpdater } from './services/updater'
import { createAIModel } from './services/ai-model'

log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// 主窗口引用（模块级变量，供 IPC 处理器使用）
let mainWindow: BrowserWindow | null = null

// 全局异常处理
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

log.info('云舵 (YunDuo) starting...')

function createWindow(): void {
  log.info('Creating main window...')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '云舵',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })

  mainWindow!.on('ready-to-show', () => {
    log.info('Window ready, showing window')
    mainWindow!.show()
  })

  // Suppress harmless Autofill DevTools protocol errors
  mainWindow!.webContents.on('devtools-opened', () => {
    try {
      mainWindow!.webContents.debugger.attach('1.3')
      mainWindow!.webContents.debugger.sendCommand('Autofill.disable').catch(() => {})
    } catch {
      // Debugger not available
    }
  })

  if (process.env.NODE_ENV === 'development') {
    const devServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    log.info(`Development mode, loading dev server: ${devServerUrl}`)
    mainWindow!.loadURL(devServerUrl)
    mainWindow!.webContents.openDevTools()
  } else {
    const indexPath = join(__dirname, '../renderer/index.html')
    log.info(`Production mode, loading file: ${indexPath}`)
    mainWindow!.loadFile(indexPath)
  }

  mainWindow!.on('closed', () => {
    log.info('Main window closed')
    mainWindow = null
  })
}

app.whenReady().then(() => {
  log.info('App ready')

  initDatabase()
  initDefaultTemplates()
  initDefaultShellScripts()
  registerIpcHandlers()
  initUpdater()
  schedulerService.initialize()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('quit', () => {
  log.info('App quit')
  containerTerminalService.closeAllSessions()
  schedulerService.stopAll()
  healthCheckService.stopPeriodicCheck()
  sshService.disconnectAll()
  closeDatabase()
})

// ==================== 运维 Agent (Mastra) ====================
import { setAgentModelConfig, setApprovalSender, chatWithAgent, resolveApproval, getAgentConfig, approveCommandExecution } from './services/ops-agent'

// 流式对话请求（用于取消）
const opsAgentStreams = new Map<string, AbortController>()

function registerIpcHandlers(): void {
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:name', () => {
    return app.getName()
  })

  // 在文件资源管理器中定位并高亮文件
  ipcMain.handle('app:showItemInFolder', (_, filePath: string) => {
    try {
      if (!filePath) return { success: false, message: '文件路径为空' }
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      log.error('app:showItemInFolder error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('server:getAll', () => {
    try {
      return serverQueries.getAll()
    } catch (error) {
      log.error('server:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('server:getById', (_, id: string) => {
    try {
      return serverQueries.getById(id)
    } catch (error) {
      log.error('server:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('server:create', (_, serverData) => {
    try {
      const id = generateId()
      const server = {
        id,
        ...serverData,
        status: 'offline' as const
      }
      serverQueries.insert(server)
      auditLogService.log({
        action: 'server_create',
        targetType: 'server',
        targetId: id,
        targetName: serverData.name,
        status: 'success',
        details: `Host: ${serverData.host}:${serverData.port}`
      })
      return server
    } catch (error) {
      log.error('server:create error:', error)
      auditLogService.log({
        action: 'server_create',
        targetType: 'server',
        targetName: serverData.name,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('server:update', (_, id: string, updates) => {
    try {
      const existing = serverQueries.getById(id)
      serverQueries.update(id, updates)
      auditLogService.log({
        action: 'server_update',
        targetType: 'server',
        targetId: id,
        targetName: existing?.name,
        status: 'success',
        details: `Updated fields: ${Object.keys(updates).join(', ')}`
      })
    } catch (error) {
      log.error('server:update error:', error)
      auditLogService.log({
        action: 'server_update',
        targetType: 'server',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('server:delete', (_, id: string) => {
    try {
      const existing = serverQueries.getById(id)
      sshService.disconnect(id)
      serverQueries.delete(id)
      auditLogService.log({
        action: 'server_delete',
        targetType: 'server',
        targetId: id,
        targetName: existing?.name,
        status: 'success',
        details: `Host: ${existing?.host}:${existing?.port}`
      })
    } catch (error) {
      log.error('server:delete error:', error)
      auditLogService.log({
        action: 'server_delete',
        targetType: 'server',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('server:connect', async (_, server) => {
    try {
      const result = await sshService.connect(server)
      if (result.success) {
        serverQueries.updateStatus(server.id, 'online')
        // 复用已有连接（alreadyConnected）或并发合并请求（duplicate）不重复记审计日志
        if (!result.alreadyConnected && !result.duplicate) {
          auditLogService.log({
            action: 'server_connect',
            targetType: 'server',
            targetId: server.id,
            targetName: server.name,
            status: 'success',
            details: `Connected to ${server.host}:${server.port}`,
            serverId: server.id
          })
        }
      } else if (!result.duplicate) {
        serverQueries.updateStatus(server.id, 'error')
        auditLogService.log({
          action: 'server_connect',
          targetType: 'server',
          targetId: server.id,
          targetName: server.name,
          status: 'failure',
          details: result.message,
          serverId: server.id
        })
      }
      return result
    } catch (error) {
      log.error('server:connect error:', error)
      auditLogService.log({
        action: 'server_connect',
        targetType: 'server',
        targetId: server.id,
        targetName: server.name,
        status: 'failure',
        details: (error as Error).message,
        serverId: server.id
      })
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('server:disconnect', (_, serverId: string) => {
    try {
      const existing = serverQueries.getById(serverId)
      sshService.disconnect(serverId)
      serverQueries.updateStatus(serverId, 'offline')
      auditLogService.log({
        action: 'server_disconnect',
        targetType: 'server',
        targetId: serverId,
        targetName: existing?.name,
        status: 'success',
        serverId
      })
    } catch (error) {
      log.error('server:disconnect error:', error)
      auditLogService.log({
        action: 'server_disconnect',
        targetType: 'server',
        targetId: serverId,
        status: 'failure',
        details: (error as Error).message,
        serverId
      })
    }
  })

  ipcMain.handle('server:executeCommand', async (_, serverId: string, command: string) => {
    try {
      return await sshService.executeCommand(serverId, command)
    } catch (error) {
      log.error('server:executeCommand error:', error)
      return {
        success: false,
        stdout: '',
        stderr: (error as Error).message,
        exitCode: -1
      }
    }
  })

  ipcMain.handle('server:getConnectionStatus', (_, serverId: string) => {
    try {
      return sshService.getConnectionStatus(serverId)
    } catch (error) {
      log.error('server:getConnectionStatus error:', error)
      return 'offline'
    }
  })

  ipcMain.handle('server:getAllConnectionStatuses', () => {
    try {
      const statuses = sshService.getAllConnectionStatuses()
      return Object.fromEntries(statuses)
    } catch (error) {
      log.error('server:getAllConnectionStatuses error:', error)
      return {}
    }
  })

  ipcMain.handle('server:checkSystemEnvironment', async (_, serverId: string, requirements?: {
    minMemoryGB?: number
    minDiskGB?: number
    minCpuCores?: number
    requiredPorts?: number[]
  }) => {
    try {
      return await systemCheckService.checkAndFixEnvironment(serverId, requirements)
    } catch (error) {
      log.error('server:checkSystemEnvironment error:', error)
      return {
        systemInfo: null,
        hardwareInfo: null,
        networkInfo: null,
        requiredPorts: [],
        networkOk: false,
        systemOk: false,
        hardwareOk: false,
        dockerOk: false,
        error: (error as Error).message
      }
    }
  })

  ipcMain.handle('server:getSystemInfo', async (_, serverId: string) => {
    try {
      return await systemCheckService.getSystemInfo(serverId)
    } catch (error) {
      log.error('server:getSystemInfo error:', error)
      return null
    }
  })

  ipcMain.handle('server:getHardwareInfo', async (_, serverId: string) => {
    try {
      return await systemCheckService.getHardwareInfo(serverId)
    } catch (error) {
      log.error('server:getHardwareInfo error:', error)
      return null
    }
  })

  ipcMain.handle('server:getNetworkInfo', async (_, serverId: string) => {
    try {
      return await systemCheckService.getNetworkInfo(serverId)
    } catch (error) {
      log.error('server:getNetworkInfo error:', error)
      return null
    }
  })

  ipcMain.handle('server:openPort', async (_, serverId: string, port: number) => {
    try {
      return await systemCheckService.openPort(serverId, port)
    } catch (error) {
      log.error('server:openPort error:', error)
      return false
    }
  })

  ipcMain.handle('server:installDependencies', async (_, serverId: string, options: {
    installDocker?: boolean
    installDockerCompose?: boolean
    installPortainer?: boolean
    offlineMode?: boolean
  }) => {
    try {
      return await installService.installDependencies(serverId, options)
    } catch (error) {
      log.error('server:installDependencies error:', error)
      return {
        success: false,
        message: (error as Error).message,
        steps: []
      }
    }
  })

  ipcMain.handle('server:uploadOfflinePackage', async (_, serverId: string, fileName: string, base64Content: string) => {
    try {
      return await installService.uploadOfflinePackage(serverId, fileName, base64Content)
    } catch (error) {
      log.error('server:uploadOfflinePackage error:', error)
      return {
        success: false,
        message: (error as Error).message
      }
    }
  })

  ipcMain.handle('template:getAll', () => {
    try {
      const rows = templateQueries.getAll()
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        category: row.category,
        dockerCompose: row.dockerCompose,
        isBuiltIn: row.isBuiltIn === 1,
        envSchema: row.envSchema ? JSON.parse(row.envSchema) : [],
        createdAt: row.createdAt
      }))
    } catch (error) {
      log.error('template:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('template:getById', (_, id: string) => {
    try {
      const row = templateQueries.getById(id)
      if (!row) return undefined
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        category: row.category,
        dockerCompose: row.dockerCompose,
        isBuiltIn: row.isBuiltIn === 1,
        envSchema: row.envSchema ? JSON.parse(row.envSchema) : [],
        createdAt: row.createdAt
      }
    } catch (error) {
      log.error('template:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('template:create', (_, templateData) => {
    try {
      const id = generateId()
      templateQueries.insert({
        id,
        name: templateData.name,
        description: templateData.description || null,
        category: templateData.category || 'app',
        dockerCompose: templateData.dockerCompose,
        isBuiltIn: 0,
        envSchema: JSON.stringify(templateData.envSchema || [])
      })
      auditLogService.log({
        action: 'template_create',
        targetType: 'template',
        targetId: id,
        targetName: templateData.name,
        status: 'success',
        details: `Category: ${templateData.category || 'app'}`
      })
      return {
        id,
        ...templateData,
        category: templateData.category || 'app',
        isBuiltIn: false,
        envSchema: templateData.envSchema || [],
        createdAt: new Date().toISOString()
      }
    } catch (error) {
      log.error('template:create error:', error)
      auditLogService.log({
        action: 'template_create',
        targetType: 'template',
        targetName: templateData.name,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('template:update', (_, id: string, updates) => {
    try {
      const existing = templateQueries.getById(id)
      const processedUpdates = { ...updates }
      if (processedUpdates.envSchema !== undefined) {
        processedUpdates.envSchema = JSON.stringify(processedUpdates.envSchema)
      }
      templateQueries.update(id, processedUpdates)
      auditLogService.log({
        action: 'template_update',
        targetType: 'template',
        targetId: id,
        targetName: existing?.name,
        status: 'success',
        details: `Updated fields: ${Object.keys(updates).join(', ')}`
      })
    } catch (error) {
      log.error('template:update error:', error)
      auditLogService.log({
        action: 'template_update',
        targetType: 'template',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('template:delete', (_, id: string) => {
    try {
      const existing = templateQueries.getById(id)
      templateQueries.delete(id)
      auditLogService.log({
        action: 'template_delete',
        targetType: 'template',
        targetId: id,
        targetName: existing?.name,
        status: 'success'
      })
    } catch (error) {
      log.error('template:delete error:', error)
      auditLogService.log({
        action: 'template_delete',
        targetType: 'template',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('app:getAll', () => {
    try {
      return appQueries.getAll()
    } catch (error) {
      log.error('app:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('app:getById', (_, id: string) => {
    try {
      return appQueries.getById(id)
    } catch (error) {
      log.error('app:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('app:getByServerId', (_, serverId: string) => {
    try {
      return appQueries.getByServerId(serverId)
    } catch (error) {
      log.error('app:getByServerId error:', error)
      return []
    }
  })

  ipcMain.handle('app:create', (_, appData) => {
    try {
      const id = generateId()
      appQueries.insert({ id, ...appData })
      return { id, ...appData }
    } catch (error) {
      log.error('app:create error:', error)
      throw error
    }
  })

  ipcMain.handle('app:update', (_, id: string, updates) => {
    try {
      appQueries.update(id, updates)
    } catch (error) {
      log.error('app:update error:', error)
      throw error
    }
  })

  ipcMain.handle('app:delete', (_, id: string) => {
    try {
      const appInfo = appQueries.getById(id)
      appQueries.delete(id)
      auditLogService.log({
        action: 'app_delete',
        targetType: 'app',
        targetId: id,
        targetName: appInfo?.name,
        status: 'success',
        serverId: appInfo?.serverId
      })
    } catch (error) {
      log.error('app:delete error:', error)
      auditLogService.log({
        action: 'app_delete',
        targetType: 'app',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
    }
  })

  ipcMain.handle('app:deploy', async (event, options) => {
    try {
      // 部署进度事件：此前部署全程无反馈，前端只能盲等
      const onProgress = (info: { percent: number; stage: string; message: string }) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('deploy:progress', { appName: options.appName, ...info })
        }
      }
      const result = await appDeployService.deployApp(options, onProgress)
      auditLogService.log({
        action: 'app_deploy',
        targetType: 'app',
        targetId: result.appId,
        targetName: options.appName,
        status: result.success ? 'success' : 'failure',
        details: result.message,
        serverId: options.serverId
      })
      // 记录部署历史
      if (result.success && result.appId) {
        deployHistoryService.recordDeployment({
          appId: result.appId,
          appName: options.appName,
          serverId: options.serverId,
          dockerCompose: options.dockerCompose,
          envVariables: options.envVariables ? JSON.stringify(options.envVariables) : undefined,
          status: result.success ? 'success' : 'failure'
        })
      }
      return result
    } catch (error) {
      log.error('app:deploy error:', error)
      auditLogService.log({
        action: 'app_deploy',
        targetType: 'app',
        targetName: options.appName,
        status: 'failure',
        details: (error as Error).message,
        serverId: options.serverId
      })
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:start', async (_, appId: string) => {
    try {
      const appInfo = appQueries.getById(appId)
      const result = await appDeployService.startApp(appId)
      auditLogService.log({
        action: 'app_start',
        targetType: 'app',
        targetId: appId,
        targetName: appInfo?.name,
        status: result.success ? 'success' : 'failure',
        details: result.message,
        serverId: appInfo?.serverId
      })
      return result
    } catch (error) {
      log.error('app:start error:', error)
      auditLogService.log({
        action: 'app_start',
        targetType: 'app',
        targetId: appId,
        status: 'failure',
        details: (error as Error).message
      })
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:stop', async (_, appId: string) => {
    try {
      const appInfo = appQueries.getById(appId)
      const result = await appDeployService.stopApp(appId)
      auditLogService.log({
        action: 'app_stop',
        targetType: 'app',
        targetId: appId,
        targetName: appInfo?.name,
        status: result.success ? 'success' : 'failure',
        details: result.message,
        serverId: appInfo?.serverId
      })
      return result
    } catch (error) {
      log.error('app:stop error:', error)
      auditLogService.log({
        action: 'app_stop',
        targetType: 'app',
        targetId: appId,
        status: 'failure',
        details: (error as Error).message
      })
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:restart', async (_, appId: string) => {
    try {
      const appInfo = appQueries.getById(appId)
      const result = await appDeployService.restartApp(appId)
      auditLogService.log({
        action: 'app_restart',
        targetType: 'app',
        targetId: appId,
        targetName: appInfo?.name,
        status: result.success ? 'success' : 'failure',
        details: result.message,
        serverId: appInfo?.serverId
      })
      return result
    } catch (error) {
      log.error('app:restart error:', error)
      auditLogService.log({
        action: 'app_restart',
        targetType: 'app',
        targetId: appId,
        status: 'failure',
        details: (error as Error).message
      })
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:updateCompose', async (_, appId: string, dockerCompose?: string) => {
    try {
      const appInfo = appQueries.getById(appId)
      const result = await appDeployService.updateApp(appId, dockerCompose)
      auditLogService.log({
        action: 'app_update',
        targetType: 'app',
        targetId: appId,
        targetName: appInfo?.name,
        status: result.success ? 'success' : 'failure',
        details: result.message,
        serverId: appInfo?.serverId
      })
      // 记录更新历史
      if (result.success && dockerCompose) {
        deployHistoryService.recordDeployment({
          appId,
          appName: appInfo?.name || 'Unknown',
          serverId: appInfo?.serverId || '',
          dockerCompose,
          status: 'success'
        })
      }
      return result
    } catch (error) {
      log.error('app:updateCompose error:', error)
      auditLogService.log({
        action: 'app_update',
        targetType: 'app',
        targetId: appId,
        status: 'failure',
        details: (error as Error).message
      })
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:getContainers', async (_, serverId: string, projectPath: string) => {
    try {
      return await appDeployService.getContainerInfo(serverId, projectPath)
    } catch (error) {
      log.error('app:getContainers error:', error)
      return []
    }
  })

  ipcMain.handle('app:getLogs', async (_, serverId: string, projectPath: string, lines?: number) => {
    try {
      return await appDeployService.getAppLogs(serverId, projectPath, lines)
    } catch (error) {
      log.error('app:getLogs error:', error)
      return ''
    }
  })

  ipcMain.handle('app:getContainerStats', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.getContainerStats(serverId, containerId)
    } catch (error) {
      log.error('app:getContainerStats error:', error)
      return null
    }
  })

  ipcMain.handle('app:getContainerStatsByProject', async (_, serverId: string, projectPath: string) => {
    try {
      return await appDeployService.getContainerStatsByProject(serverId, projectPath)
    } catch (error) {
      log.error('app:getContainerStatsByProject error:', error)
      return []
    }
  })

  ipcMain.handle('app:getContainerLogs', async (_, serverId: string, containerId: string, lines?: number) => {
    try {
      return await appDeployService.getContainerLogs(serverId, containerId, lines)
    } catch (error) {
      log.error('app:getContainerLogs error:', error)
      return ''
    }
  })

  ipcMain.handle('app:startContainer', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.startContainer(serverId, containerId)
    } catch (error) {
      log.error('app:startContainer error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:stopContainer', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.stopContainer(serverId, containerId)
    } catch (error) {
      log.error('app:stopContainer error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:restartContainer', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.restartContainer(serverId, containerId)
    } catch (error) {
      log.error('app:restartContainer error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // ==================== 容器资源管理 ====================
  // 获取服务器全部容器（docker ps -a）
  ipcMain.handle('container:getAll', async (_, serverId: string) => {
    try {
      return await appDeployService.getAllContainers(serverId)
    } catch (error) {
      log.error('container:getAll error:', error)
      return []
    }
  })

  // 删除单个容器（docker rm -f）
  ipcMain.handle('container:remove', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.removeContainer(serverId, containerId)
    } catch (error) {
      log.error('container:remove error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 启动/停止/重启容器（复用 app:startContainer / app:stopContainer / app:restartContainer）
  ipcMain.handle('container:start', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.startContainer(serverId, containerId)
    } catch (error) {
      log.error('container:start error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('container:stop', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.stopContainer(serverId, containerId)
    } catch (error) {
      log.error('container:stop error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('container:restart', async (_, serverId: string, containerId: string) => {
    try {
      return await appDeployService.restartContainer(serverId, containerId)
    } catch (error) {
      log.error('container:restart error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('container:getLogs', async (_, serverId: string, containerId: string, lines?: number) => {
    try {
      return await appDeployService.getContainerLogs(serverId, containerId, lines || 200)
    } catch (error) {
      log.error('container:getLogs error:', error)
      return ''
    }
  })

  ipcMain.handle('config:export', async (_, filePath: string) => {
    try {
      const configData = configQueries.exportConfig()
      const jsonContent = JSON.stringify(configData, null, 2)
      await writeFile(filePath, jsonContent, 'utf-8')
      return { success: true, message: '配置导出成功' }
    } catch (error) {
      log.error('config:export error:', error)
      return { success: false, message: `导出失败: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('config:import', async (_, filePath: string) => {
    try {
      const jsonContent = await readFile(filePath, 'utf-8')
      const data = JSON.parse(jsonContent)
      const result = configQueries.importConfig(data)
      return result
    } catch (error) {
      log.error('config:import error:', error)
      return {
        success: false,
        message: `导入失败: ${(error as Error).message}`,
        serversImported: 0,
        templatesImported: 0,
        appsImported: 0
      }
    }
  })

  ipcMain.handle('config:showSaveDialog', async () => {
    const result = await dialog.showSaveDialog({
      title: '导出配置',
      defaultPath: `docker-deploy-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result
  })

  ipcMain.handle('config:showOpenDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入配置',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    return result
  })

  // Docker 镜像管理 IPC 处理器
  ipcMain.handle('image:getAll', async (_, serverId: string) => {
    try {
      return await dockerImagesService.getImages(serverId)
    } catch (error) {
      log.error('image:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('image:pull', async (_, serverId: string, imageName: string) => {
    try {
      return await dockerImagesService.pullImage(serverId, imageName)
    } catch (error) {
      log.error('image:pull error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('image:remove', async (_, serverId: string, imageId: string) => {
    try {
      return await dockerImagesService.removeImage(serverId, imageId)
    } catch (error) {
      log.error('image:remove error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('image:removeBatch', async (_, serverId: string, imageIds: string[]) => {
    try {
      return await dockerImagesService.removeImages(serverId, imageIds)
    } catch (error) {
      log.error('image:removeBatch error:', error)
      return { success: false, successCount: 0, failCount: imageIds.length, message: (error as Error).message }
    }
  })

  ipcMain.handle('image:prune', async (_, serverId: string) => {
    try {
      return await dockerImagesService.pruneImages(serverId)
    } catch (error) {
      log.error('image:prune error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('image:getInfo', async (_, serverId: string, imageId: string) => {
    try {
      return await dockerImagesService.getImageInfo(serverId, imageId)
    } catch (error) {
      log.error('image:getInfo error:', error)
      return ''
    }
  })

  ipcMain.handle('image:export', async (_, serverId: string, imageName: string, localFilePath: string) => {
    try {
      return await dockerImagesService.exportImage(serverId, imageName, localFilePath)
    } catch (error) {
      log.error('image:export error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('image:import', async (_, serverId: string, localFilePath: string) => {
    try {
      return await dockerImagesService.importImage(serverId, localFilePath)
    } catch (error) {
      log.error('image:import error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('image:getUsedImageNames', async (_, serverId: string) => {
    try {
      const set = await dockerImagesService.getUsedImageNames(serverId)
      return Array.from(set)
    } catch (error) {
      log.error('image:getUsedImageNames error:', error)
      return []
    }
  })

  ipcMain.handle('image:showSaveDialog', async (_, defaultName?: string) => {
    return await dialog.showSaveDialog({
      title: '导出镜像',
      defaultPath: defaultName || `docker-image-${new Date().toISOString().slice(0, 10)}.tar`,
      filters: [
        { name: 'Docker 镜像包', extensions: ['tar'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
  })

  ipcMain.handle('image:showOpenDialog', async () => {
    return await dialog.showOpenDialog({
      title: '导入镜像',
      filters: [
        { name: 'Docker 镜像包', extensions: ['tar', 'tar.gz'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
  })

  // 镜像安全扫描 IPC 处理器
  ipcMain.handle('security:scanImage', async (_, serverId: string, imageName: string, proxy?: string) => {
    try {
      return await securityScanService.scanImage(serverId, imageName, proxy)
    } catch (error) {
      log.error('security:scanImage error:', error)
      return {
        success: false,
        message: (error as Error).message,
        trivyInstalled: false,
        vulnerabilities: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, total: 0 },
        scanTime: new Date().toISOString()
      }
    }
  })

  ipcMain.handle('security:installTrivy', async (_, serverId: string, proxy?: string) => {
    try {
      return await securityScanService.installTrivy(serverId, proxy)
    } catch (error) {
      log.error('security:installTrivy error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // Docker Volumes IPC handlers
  ipcMain.handle('volume:getAll', async (_, serverId: string) => {
    try {
      return await dockerVolumesService.getVolumes(serverId)
    } catch (error) {
      log.error('volume:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('volume:create', async (_, serverId: string, name: string, driver?: string, labels?: Record<string, string>, options?: Record<string, string>) => {
    try {
      return await dockerVolumesService.createVolume(serverId, name, driver, labels, options)
    } catch (error) {
      log.error('volume:create error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('volume:remove', async (_, serverId: string, name: string, force?: boolean) => {
    try {
      return await dockerVolumesService.removeVolume(serverId, name, force)
    } catch (error) {
      log.error('volume:remove error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('volume:prune', async (_, serverId: string, force?: boolean, all?: boolean) => {
    try {
      return await dockerVolumesService.pruneVolumes(serverId, force, all)
    } catch (error) {
      log.error('volume:prune error:', error)
      return { success: false, deletedVolumes: [], spaceReclaimed: '0B', message: (error as Error).message }
    }
  })

  ipcMain.handle('volume:getInfo', async (_, serverId: string, name: string) => {
    try {
      return await dockerVolumesService.getVolumeInfo(serverId, name)
    } catch (error) {
      log.error('volume:getInfo error:', error)
      return null
    }
  })

  ipcMain.handle('volume:getSize', async (_, serverId: string, name: string) => {
    try {
      return await dockerVolumesService.getVolumeSize(serverId, name)
    } catch (error) {
      log.error('volume:getSize error:', error)
      return '-'
    }
  })

  // Docker 网络管理 IPC 处理器
  ipcMain.handle('network:getAll', async (_, serverId: string) => {
    try {
      return await dockerNetworksService.getNetworks(serverId)
    } catch (error) {
      log.error('network:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('network:create', async (_, serverId: string, options: {
    name: string
    driver?: string
    subnet?: string
    gateway?: string
    internal?: boolean
    labels?: Record<string, string>
    options?: Record<string, string>
    ipamOptions?: Record<string, string>
    enableIPv6?: boolean
    ipRange?: string
    auxAddresses?: Record<string, string>
  }) => {
    try {
      return await dockerNetworksService.createNetwork(
        serverId,
        options.name,
        options.driver,
        options.subnet,
        options.gateway,
        options.internal,
        options.labels,
        options.options,
        options.ipamOptions,
        options.enableIPv6,
        options.ipRange,
        options.auxAddresses
      )
    } catch (error) {
      log.error('network:create error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('network:remove', async (_, serverId: string, networkId: string) => {
    try {
      return await dockerNetworksService.removeNetwork(serverId, networkId)
    } catch (error) {
      log.error('network:remove error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('network:getInfo', async (_, serverId: string, networkId: string) => {
    try {
      return await dockerNetworksService.getNetworkInfo(serverId, networkId)
    } catch (error) {
      log.error('network:getInfo error:', error)
      return null
    }
  })

  ipcMain.handle('network:connect', async (_, serverId: string, networkId: string, containerId: string, ip?: string, ipv6?: string, aliases?: string[]) => {
    try {
      return await dockerNetworksService.connectContainer(serverId, networkId, containerId, ip, ipv6, aliases)
    } catch (error) {
      log.error('network:connect error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('network:disconnect', async (_, serverId: string, networkId: string, containerId: string, force?: boolean) => {
    try {
      return await dockerNetworksService.disconnectContainer(serverId, networkId, containerId, force)
    } catch (error) {
      log.error('network:disconnect error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('network:prune', async (_, serverId: string, force?: boolean) => {
    try {
      return await dockerNetworksService.pruneNetworks(serverId, force)
    } catch (error) {
      log.error('network:prune error:', error)
      return { success: false, deletedNetworks: [], message: (error as Error).message }
    }
  })

  ipcMain.handle('network:getContainers', async (_, serverId: string) => {
    try {
      return await dockerNetworksService.getContainersForNetwork(serverId)
    } catch (error) {
      log.error('network:getContainers error:', error)
      return []
    }
  })

  // 服务器分组 IPC 处理器
  ipcMain.handle('serverGroup:getAll', () => {
    try {
      return serverGroupQueries.getAll()
    } catch (error) {
      log.error('serverGroup:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('serverGroup:getById', (_, id: string) => {
    try {
      return serverGroupQueries.getById(id)
    } catch (error) {
      log.error('serverGroup:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('serverGroup:create', (_, groupData) => {
    try {
      const id = generateId()
      serverGroupQueries.insert({ id, ...groupData })
      auditLogService.log({
        action: 'server_create',
        targetType: 'server',
        targetId: id,
        targetName: groupData.name,
        status: 'success',
        details: 'Server group created'
      })
      return { id, ...groupData }
    } catch (error) {
      log.error('serverGroup:create error:', error)
      throw error
    }
  })

  ipcMain.handle('serverGroup:update', (_, id: string, updates) => {
    try {
      serverGroupQueries.update(id, updates)
      auditLogService.log({
        action: 'server_update',
        targetType: 'server',
        targetId: id,
        status: 'success',
        details: `Updated fields: ${Object.keys(updates).join(', ')}`
      })
    } catch (error) {
      log.error('serverGroup:update error:', error)
      throw error
    }
  })

  ipcMain.handle('serverGroup:delete', (_, id: string) => {
    try {
      serverGroupQueries.delete(id)
      auditLogService.log({
        action: 'server_delete',
        targetType: 'server',
        targetId: id,
        status: 'success',
        details: 'Server group deleted'
      })
    } catch (error) {
      log.error('serverGroup:delete error:', error)
      throw error
    }
  })

  ipcMain.handle('serverGroup:getServers', (_, groupId: string) => {
    try {
      return serverGroupQueries.getServersByGroupId(groupId)
    } catch (error) {
      log.error('serverGroup:getServers error:', error)
      return []
    }
  })

  ipcMain.handle('serverGroup:addServer', (_, groupId: string, serverId: string) => {
    try {
      serverGroupQueries.addServerToGroup(groupId, serverId)
      auditLogService.log({
        action: 'server_update',
        targetType: 'server',
        targetId: groupId,
        status: 'success',
        details: `Added server ${serverId} to group ${groupId}`
      })
      return { success: true }
    } catch (error) {
      log.error('serverGroup:addServer error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('serverGroup:removeServer', (_, groupId: string, serverId: string) => {
    try {
      serverGroupQueries.removeServerFromGroup(groupId, serverId)
      auditLogService.log({
        action: 'server_update',
        targetType: 'server',
        targetId: groupId,
        status: 'success',
        details: `Removed server ${serverId} from group ${groupId}`
      })
      return { success: true }
    } catch (error) {
      log.error('serverGroup:removeServer error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('serverGroup:getServerGroups', (_, serverId: string) => {
    try {
      return serverGroupQueries.getServerGroups(serverId)
    } catch (error) {
      log.error('serverGroup:getServerGroups error:', error)
      return []
    }
  })

  // 批量操作 IPC 处理器
  ipcMain.handle('batch:deploy', async (_, options) => {
    try {
      const result = await batchOperationsService.batchDeploy(options)
      auditLogService.log({
        action: 'app_deploy',
        targetType: 'app',
        targetName: options.appName,
        status: result.success ? 'success' : 'failure',
        details: result.message
      })
      return result
    } catch (error) {
      log.error('batch:deploy error:', error)
      return {
        success: false,
        totalServers: options.serverIds?.length || 0,
        successCount: 0,
        failureCount: options.serverIds?.length || 0,
        results: [],
        message: `Batch deployment failed: ${(error as Error).message}`
      }
    }
  })

  ipcMain.handle('batch:start', async (_, appIds: string[]) => {
    try {
      const result = await batchOperationsService.batchStart(appIds)
      auditLogService.log({
        action: 'app_start',
        targetType: 'app',
        status: result.success ? 'success' : 'failure',
        details: result.message
      })
      return result
    } catch (error) {
      log.error('batch:start error:', error)
      return {
        success: false,
        total: appIds.length,
        successCount: 0,
        failureCount: appIds.length,
        results: [],
        message: `Batch start failed: ${(error as Error).message}`
      }
    }
  })

  ipcMain.handle('batch:stop', async (_, appIds: string[]) => {
    try {
      const result = await batchOperationsService.batchStop(appIds)
      auditLogService.log({
        action: 'app_stop',
        targetType: 'app',
        status: result.success ? 'success' : 'failure',
        details: result.message
      })
      return result
    } catch (error) {
      log.error('batch:stop error:', error)
      return {
        success: false,
        total: appIds.length,
        successCount: 0,
        failureCount: appIds.length,
        results: [],
        message: `Batch stop failed: ${(error as Error).message}`
      }
    }
  })

  ipcMain.handle('batch:restart', async (_, appIds: string[]) => {
    try {
      const result = await batchOperationsService.batchRestart(appIds)
      auditLogService.log({
        action: 'app_restart',
        targetType: 'app',
        status: result.success ? 'success' : 'failure',
        details: result.message
      })
      return result
    } catch (error) {
      log.error('batch:restart error:', error)
      return {
        success: false,
        total: appIds.length,
        successCount: 0,
        failureCount: appIds.length,
        results: [],
        message: `Batch restart failed: ${(error as Error).message}`
      }
    }
  })

  ipcMain.handle('batch:getServerStatuses', (_, serverIds: string[]) => {
    try {
      return batchOperationsService.getBatchServerStatus(serverIds)
    } catch (error) {
      log.error('batch:getServerStatuses error:', error)
      return []
    }
  })

  ipcMain.handle('batch:getAllServerStatuses', () => {
    try {
      return batchOperationsService.getAllServerStatuses()
    } catch (error) {
      log.error('batch:getAllServerStatuses error:', error)
      return []
    }
  })

  // 审计日志 IPC 处理器
  ipcMain.handle('auditLog:query', (_, filter) => {
    try {
      return auditLogService.query(filter)
    } catch (error) {
      log.error('auditLog:query error:', error)
      return { logs: [], total: 0, page: 1, pageSize: 50 }
    }
  })

  ipcMain.handle('auditLog:getAll', (_, options?: { limit?: number }) => {
    const limit = options?.limit || 50
    try {
      return auditLogService.query({ page: 1, pageSize: limit })
    } catch (error) {
      log.error('auditLog:getAll error:', error)
      return { logs: [], total: 0, page: 1, pageSize: limit }
    }
  })

  ipcMain.handle('auditLog:getActions', () => {
    try {
      return auditLogService.getActions()
    } catch (error) {
      log.error('auditLog:getActions error:', error)
      return []
    }
  })

  ipcMain.handle('auditLog:getTargetTypes', () => {
    try {
      return auditLogService.getTargetTypes()
    } catch (error) {
      log.error('auditLog:getTargetTypes error:', error)
      return []
    }
  })

  ipcMain.handle('auditLog:exportCSV', async (_, filter) => {
    try {
      const csv = auditLogService.exportToCSV(filter)
      const result = await dialog.showSaveDialog({
        title: '导出审计日志',
        defaultPath: `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [
          { name: 'CSV 文件', extensions: ['csv'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (!result.canceled && result.filePath) {
        await writeFile(result.filePath, csv, 'utf-8')
        return { success: true, message: '导出成功' }
      }
      return { success: false, message: '已取消' }
    } catch (error) {
      log.error('auditLog:exportCSV error:', error)
      return { success: false, message: `导出失败: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('auditLog:cleanup', (_, days?: number) => {
    try {
      const deleted = auditLogService.cleanup(days)
      return { success: true, deleted }
    } catch (error) {
      log.error('auditLog:cleanup error:', error)
      return { success: false, deleted: 0 }
    }
  })

  ipcMain.handle('auditLog:clear', () => {
    try {
      auditLogService.clear()
      return { success: true }
    } catch (error) {
      log.error('auditLog:clear error:', error)
      return { success: false }
    }
  })

  // 容器终端 IPC 处理器
  ipcMain.handle('terminal:open', async (_, serverId: string, containerId: string, cols?: number, rows?: number) => {
    try {
      return await containerTerminalService.openTerminal(serverId, containerId, cols, rows)
    } catch (error) {
      log.error('terminal:open error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('terminal:write', (_, sessionId: string, data: string) => {
    try {
      return containerTerminalService.writeToTerminal(sessionId, data)
    } catch (error) {
      log.error('terminal:write error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('terminal:resize', (_, sessionId: string, cols: number, rows: number) => {
    try {
      return containerTerminalService.resizeTerminal(sessionId, cols, rows)
    } catch (error) {
      log.error('terminal:resize error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('terminal:close', (_, sessionId: string) => {
    try {
      return containerTerminalService.closeTerminal(sessionId)
    } catch (error) {
      log.error('terminal:close error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('terminal:getAllSessions', () => {
    try {
      return containerTerminalService.getAllSessions()
    } catch (error) {
      log.error('terminal:getAllSessions error:', error)
      return []
    }
  })

  // ==================== 文件传输 IPC ====================

  // 选择本地文件（上传用，支持多选）
  ipcMain.handle('fileTrans:selectFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择要上传的文件（可多选）',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    return { success: true, path: result.filePaths[0], paths: result.filePaths }
  })

  // 选择本地保存位置（下载用）
  ipcMain.handle('fileTrans:selectSavePath', async (_, defaultName?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '选择保存位置',
      defaultPath: defaultName
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    return { success: true, path: result.filePath }
  })

  // 上传本地文件到服务器（SFTP 流式，支持进度回调）
  ipcMain.handle('fileTrans:upload', async (event, serverId: string, localPath: string, remotePath: string, taskId?: string) => {
    try {
      const r = await sshService.uploadFileStream(serverId, localPath, remotePath, (transferred, total) => {
        if (!event.sender.isDestroyed() && taskId) {
          event.sender.send('fileTrans:progress', { taskId, transferred, total })
        }
      })
      return { success: r.success, message: r.message || '' }
    } catch (error) {
      log.error('fileTrans:upload error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 从服务器下载文件到本地（SFTP 流式，支持进度回调）
  ipcMain.handle('fileTrans:download', async (event, serverId: string, remotePath: string, localPath: string, taskId?: string) => {
    try {
      const r = await sshService.downloadFile(serverId, remotePath, localPath, (transferred, total) => {
        if (!event.sender.isDestroyed() && taskId) {
          event.sender.send('fileTrans:progress', { taskId, transferred, total })
        }
      })
      return { success: r.success, message: r.message || '' }
    } catch (error) {
      log.error('fileTrans:download error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 递归上传本地文件/文件夹到服务器（SFTP，自动创建远端目录）
  ipcMain.handle('fileTrans:uploadPath', async (event, serverId: string, localPath: string, remotePath: string, taskId?: string) => {
    try {
      const r = await sshService.uploadPathRecursive(serverId, localPath, remotePath, (info) => {
        if (!event.sender.isDestroyed() && taskId) {
          // 按文件进度推送：status 表示当前文件开始/完成/出错
          event.sender.send('fileTrans:fileProgress', { taskId, ...info })
        }
      })
      return { success: r.success, message: r.message || '', fileCount: r.fileCount }
    } catch (error) {
      log.error('fileTrans:uploadPath error:', error)
      return { success: false, message: (error as Error).message, fileCount: 0 }
    }
  })

  // 递归下载远端文件/文件夹到本地（SFTP，自动创建本地目录）
  ipcMain.handle('fileTrans:downloadPath', async (event, serverId: string, remotePath: string, localPath: string, taskId?: string) => {
    try {
      const r = await sshService.downloadPathRecursive(serverId, remotePath, localPath, (info) => {
        if (!event.sender.isDestroyed() && taskId) {
          event.sender.send('fileTrans:fileProgress', { taskId, ...info })
        }
      })
      return { success: r.success, message: r.message || '', fileCount: r.fileCount }
    } catch (error) {
      log.error('fileTrans:downloadPath error:', error)
      return { success: false, message: (error as Error).message, fileCount: 0 }
    }
  })

  // 列举远端目录（XFTP 式浏览）
  ipcMain.handle('fileTrans:listRemote', async (_, serverId: string, remotePath: string) => {
    try {
      return await sshService.listRemoteDir(serverId, remotePath)
    } catch (error) {
      log.error('fileTrans:listRemote error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 列举本地目录（XFTP 式浏览）
  ipcMain.handle('fileTrans:listLocal', async (_, localPath: string) => {
    const target = (localPath || '').trim()
    if (!target) return { success: false, message: '路径不能为空' }
    try {
      const entries = fs.readdirSync(target, { withFileTypes: true })
        .filter(x => x.name !== '.' && x.name !== '..')
        .map(x => {
          const stat = (() => { try { return fs.statSync(path.join(target, x.name)) } catch { return null } })()
          return {
            name: x.name,
            type: x.isDirectory() ? 'dir' as const : 'file' as const,
            size: stat?.size || 0,
            mtime: stat?.mtimeMs || 0
          }
        })
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
      return { success: true, entries }
    } catch (error) {
      log.error('fileTrans:listLocal error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 本地主目录（XFTP 初始路径）
  ipcMain.handle('fileTrans:homeLocal', async () => {
    try {
      return { success: true, path: os.homedir() }
    } catch (error) {
      log.error('fileTrans:homeLocal error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 本地可用盘符（Windows 枚举 A:-Z: 存在的盘；其他平台返回 ['/']）
  ipcMain.handle('fileTrans:listDrives', async () => {
    try {
      if (process.platform === 'win32') {
        const drives: string[] = []
        for (let i = 65; i <= 90; i++) {
          const letter = `${String.fromCharCode(i)}:`
          try {
            const root = `${letter}\\`
            if (fs.existsSync(root)) drives.push(letter)
          } catch { /* ignore */ }
        }
        return { success: true, drives: drives.length > 0 ? drives : ['C:'] }
      }
      return { success: true, drives: ['/'] }
    } catch (error) {
      log.error('fileTrans:listDrives error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 本地文件操作：新建目录 / 新建文件 / 重命名 / 删除（文件或空目录）
  ipcMain.handle('fileTrans:localOp', async (_, op: 'mkdir' | 'touch' | 'rename' | 'delete', target: string, to?: string) => {
    try {
      if (op === 'mkdir') {
        fs.mkdirSync(target, { recursive: false })
        return { success: true, message: '目录已创建' }
      }
      if (op === 'touch') {
        // flag 'wx'：文件已存在时抛错，避免覆盖已有内容
        fs.writeFileSync(target, '', { flag: 'wx' })
        return { success: true, message: '文件已创建' }
      }
      if (op === 'rename') {
        if (!to) return { success: false, message: '目标名不能为空' }
        fs.renameSync(target, to)
        return { success: true, message: '重命名成功' }
      }
      // delete：目录仅允许空目录（rmdir），文件直接删除，避免误删非空目录
      const stat = fs.statSync(target)
      if (stat.isDirectory()) {
        fs.rmdirSync(target)
      } else {
        fs.unlinkSync(target)
      }
      return { success: true, message: '已删除' }
    } catch (error) {
      log.error(`fileTrans:localOp(${op}) error:`, error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 远端文件操作：新建目录 / 重命名 / 删除（文件或空目录）
  ipcMain.handle('fileTrans:remoteOp', async (_, serverId: string, op: 'mkdir' | 'rename' | 'delete', target: string, to?: string) => {
    try {
      return await sshService.remoteFileOp(serverId, op, target, to)
    } catch (error) {
      log.error('fileTrans:remoteOp error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 读取本地文件（文本，超 50MB 拒绝：避免大文件读入内存导致卡顿/崩溃）
  ipcMain.handle('fileTrans:readLocal', async (_, filePath: string) => {
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > 50 * 1024 * 1024) return { success: false, message: '文件超过 50MB，请使用终端处理' }
      return { success: true, content: fs.readFileSync(filePath, 'utf-8') }
    } catch (error) {
      log.error('fileTrans:readLocal error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 写入本地文件（文本）
  ipcMain.handle('fileTrans:writeLocal', async (_, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true, message: '已保存' }
    } catch (error) {
      log.error('fileTrans:writeLocal error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 读取远端文件（文本，超 2MB 拒绝）
  ipcMain.handle('fileTrans:readRemote', async (_, serverId: string, remotePath: string) => {
    try {
      return await sshService.readRemoteFile(serverId, remotePath)
    } catch (error) {
      log.error('fileTrans:readRemote error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 写入远端文件（文本，SFTP）
  ipcMain.handle('fileTrans:writeRemote', async (_, serverId: string, remotePath: string, content: string) => {
    try {
      const r = await sshService.uploadContent(serverId, content, remotePath)
      return { success: r.success, message: r.message || '' }
    } catch (error) {
      log.error('fileTrans:writeRemote error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 日志流 IPC 处理器
  const logStreams = new Map<string, boolean>()

  ipcMain.handle('logs:start', async (_, serverId: string, containerId: string, options: { tail?: number; follow?: boolean } = {}) => {
    try {
      const streamId = `${serverId}:${containerId}`
      
      // 如果已经在流式传输，先停止
      if (logStreams.get(streamId)) {
        logStreams.set(streamId, false)
      }

      logStreams.set(streamId, true)

      const result = await sshService.getContainerLogs(
        serverId,
        containerId,
        options,
        (data) => {
          if (logStreams.get(streamId)) {
            mainWindow?.webContents.send('logs:data', streamId, data)
          }
        },
        (data) => {
          if (logStreams.get(streamId)) {
            mainWindow?.webContents.send('logs:error', streamId, data)
          }
        },
        (code) => {
          logStreams.delete(streamId)
          mainWindow?.webContents.send('logs:close', streamId, code)
        }
      )

      return result
    } catch (error) {
      log.error('logs:start error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('logs:stop', (_, serverId: string, containerId: string) => {
    const streamId = `${serverId}:${containerId}`
    logStreams.set(streamId, false)
    logStreams.delete(streamId)
    return { success: true }
  })

  // 部署历史 IPC 处理器
  ipcMain.handle('deployHistory:getByAppId', (_, appId: string) => {
    try {
      return deployHistoryService.getHistoryByAppId(appId)
    } catch (error) {
      log.error('deployHistory:getByAppId error:', error)
      return []
    }
  })

  ipcMain.handle('deployHistory:getAll', () => {
    try {
      return deployHistoryService.getAllHistory()
    } catch (error) {
      log.error('deployHistory:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('deployHistory:getById', (_, id: string) => {
    try {
      return deployHistoryService.getHistoryById(id)
    } catch (error) {
      log.error('deployHistory:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('deployHistory:rollback', async (_, historyId: string) => {
    try {
      const result = await deployHistoryService.rollbackToVersion(historyId)
      auditLogService.log({
        action: 'app_rollback',
        targetType: 'app',
        targetId: result.appId,
        status: result.success ? 'success' : 'failure',
        details: result.message
      })
      return result
    } catch (error) {
      log.error('deployHistory:rollback error:', error)
      auditLogService.log({
        action: 'app_rollback',
        targetType: 'app',
        status: 'failure',
        details: (error as Error).message
      })
      return { success: false, message: `回滚失败: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('deployHistory:compare', (_, historyId1: string, historyId2: string) => {
    try {
      return deployHistoryService.compareVersions(historyId1, historyId2)
    } catch (error) {
      log.error('deployHistory:compare error:', error)
      return null
    }
  })

  // 告警规则 IPC 处理器
  ipcMain.handle('alertRule:getAll', () => {
    try {
      return alertService.getAllRules()
    } catch (error) {
      log.error('alertRule:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('alertRule:getById', (_, id: string) => {
    try {
      return alertService.getRuleById(id)
    } catch (error) {
      log.error('alertRule:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('alertRule:create', (_, ruleData) => {
    try {
      const rule = alertService.createRule(ruleData)
      auditLogService.log({
        action: 'settings_change',
        targetType: 'settings',
        targetId: rule.id,
        targetName: rule.name,
        status: 'success',
        details: `Created alert rule: ${rule.ruleType}`
      })
      return rule
    } catch (error) {
      log.error('alertRule:create error:', error)
      auditLogService.log({
        action: 'settings_change',
        targetType: 'settings',
        targetName: ruleData.name,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('alertRule:update', (_, id: string, updates) => {
    try {
      const rule = alertService.updateRule(id, updates)
      auditLogService.log({
        action: 'settings_change',
        targetType: 'settings',
        targetId: id,
        targetName: rule?.name,
        status: 'success',
        details: `Updated fields: ${Object.keys(updates).join(', ')}`
      })
      return rule
    } catch (error) {
      log.error('alertRule:update error:', error)
      auditLogService.log({
        action: 'settings_change',
        targetType: 'settings',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('alertRule:delete', (_, id: string) => {
    try {
      const rule = alertService.getRuleById(id)
      alertService.deleteRule(id)
      auditLogService.log({
        action: 'settings_change',
        targetType: 'settings',
        targetId: id,
        targetName: rule?.name,
        status: 'success',
        details: 'Alert rule deleted'
      })
    } catch (error) {
      log.error('alertRule:delete error:', error)
      auditLogService.log({
        action: 'settings_change',
        targetType: 'settings',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
    }
  })

  ipcMain.handle('alertRule:toggle', (_, id: string, enabled: boolean) => {
    try {
      const rule = alertService.updateRule(id, { enabled })
      return rule
    } catch (error) {
      log.error('alertRule:toggle error:', error)
      return undefined
    }
  })

  // 告警历史 IPC 处理器
  ipcMain.handle('alertHistory:getAll', (_, limit?: number) => {
    try {
      return alertService.getHistory(limit)
    } catch (error) {
      log.error('alertHistory:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('alertHistory:getActive', () => {
    try {
      return alertService.getActiveAlerts()
    } catch (error) {
      log.error('alertHistory:getActive error:', error)
      return []
    }
  })

  ipcMain.handle('alertHistory:resolve', (_, id: string) => {
    try {
      alertService.resolveAlert(id)
      return { success: true }
    } catch (error) {
      log.error('alertHistory:resolve error:', error)
      return { success: false }
    }
  })

  ipcMain.handle('alertHistory:resolveAll', () => {
    try {
      alertService.resolveAllAlerts()
      return { success: true }
    } catch (error) {
      log.error('alertHistory:resolveAll error:', error)
      return { success: false }
    }
  })

  ipcMain.handle('alertHistory:delete', (_, id: string) => {
    try {
      alertService.deleteAlert(id)
      return { success: true }
    } catch (error) {
      log.error('alertHistory:delete error:', error)
      return { success: false }
    }
  })

  ipcMain.handle('alertHistory:clear', () => {
    try {
      alertService.clearHistory()
      return { success: true }
    } catch (error) {
      log.error('alertHistory:clear error:', error)
      return { success: false }
    }
  })

  ipcMain.handle('alertHistory:cleanup', (_, days?: number) => {
    try {
      const deleted = alertService.cleanup(days)
      return { success: true, deleted }
    } catch (error) {
      log.error('alertHistory:cleanup error:', error)
      return { success: false, deleted: 0 }
    }
  })

  // 告警统计 IPC 处理器
  ipcMain.handle('alert:getStats', () => {
    try {
      return alertService.getStats()
    } catch (error) {
      log.error('alert:getStats error:', error)
      return { totalRules: 0, activeRules: 0, activeAlerts: 0, totalAlerts: 0 }
    }
  })

  // 定时任务 IPC 处理器
  ipcMain.handle('scheduledTask:getAll', () => {
    try {
      return scheduledTaskQueries.getAll()
    } catch (error) {
      log.error('scheduledTask:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('scheduledTask:getById', (_, id: string) => {
    try {
      return scheduledTaskQueries.getById(id)
    } catch (error) {
      log.error('scheduledTask:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('scheduledTask:create', (_, taskData) => {
    try {
      const id = generateId()
      scheduledTaskQueries.insert({
        id,
        name: taskData.name,
        description: taskData.description || null,
        taskType: taskData.taskType,
        cronExpression: taskData.cronExpression,
        serverId: taskData.serverId,
        appId: taskData.appId || null,
        enabled: taskData.enabled !== undefined ? (taskData.enabled ? 1 : 0) : 1,
        lastRun: null,
        lastStatus: null
      })
      const task = scheduledTaskQueries.getById(id)!
      schedulerService.addTask(task)
      auditLogService.log({
        action: 'scheduled_task_create',
        targetType: 'scheduled_task',
        targetId: id,
        targetName: taskData.name,
        status: 'success',
        details: `Type: ${taskData.taskType}, Cron: ${taskData.cronExpression}`
      })
      return task
    } catch (error) {
      log.error('scheduledTask:create error:', error)
      auditLogService.log({
        action: 'scheduled_task_create',
        targetType: 'scheduled_task',
        targetName: taskData.name,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('scheduledTask:update', (_, id: string, updates) => {
    try {
      scheduledTaskQueries.update(id, updates)
      const task = scheduledTaskQueries.getById(id)
      if (task) {
        schedulerService.updateTask(task)
      }
      auditLogService.log({
        action: 'scheduled_task_update',
        targetType: 'scheduled_task',
        targetId: id,
        targetName: task?.name,
        status: 'success',
        details: `Updated fields: ${Object.keys(updates).join(', ')}`
      })
      return task
    } catch (error) {
      log.error('scheduledTask:update error:', error)
      auditLogService.log({
        action: 'scheduled_task_update',
        targetType: 'scheduled_task',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('scheduledTask:delete', (_, id: string) => {
    try {
      const task = scheduledTaskQueries.getById(id)
      schedulerService.removeTask(id)
      scheduledTaskQueries.delete(id)
      auditLogService.log({
        action: 'scheduled_task_delete',
        targetType: 'scheduled_task',
        targetId: id,
        targetName: task?.name,
        status: 'success'
      })
      return { success: true }
    } catch (error) {
      log.error('scheduledTask:delete error:', error)
      auditLogService.log({
        action: 'scheduled_task_delete',
        targetType: 'scheduled_task',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('scheduledTask:toggle', (_, id: string, enabled: boolean) => {
    try {
      if (enabled) {
        schedulerService.enableTask(id)
      } else {
        schedulerService.disableTask(id)
      }
      auditLogService.log({
        action: 'scheduled_task_toggle',
        targetType: 'scheduled_task',
        targetId: id,
        status: 'success',
        details: `Enabled: ${enabled}`
      })
      return { success: true }
    } catch (error) {
      log.error('scheduledTask:toggle error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('scheduledTask:runNow', async (_, id: string) => {
    try {
      const result = await schedulerService.runTaskNow(id)
      return result
    } catch (error) {
      log.error('scheduledTask:runNow error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('scheduledTask:getActiveCount', () => {
    try {
      return schedulerService.getActiveTaskCount()
    } catch (error) {
      log.error('scheduledTask:getActiveCount error:', error)
      return 0
    }
  })

  // 健康检查 IPC 处理器
  ipcMain.handle('healthCheck:getContainerHealth', async (_, serverId: string, containerId: string) => {
    try {
      return await healthCheckService.getContainerHealth(serverId, containerId)
    } catch (error) {
      log.error('healthCheck:getContainerHealth error:', error)
      return null
    }
  })

  ipcMain.handle('healthCheck:getAppHealth', async (_, serverId: string, projectPath: string) => {
    try {
      return await healthCheckService.getAppHealth(serverId, projectPath)
    } catch (error) {
      log.error('healthCheck:getAppHealth error:', error)
      return null
    }
  })

  ipcMain.handle('healthCheck:updateConfig', (_, appId: string, config: {
    autoRestart?: boolean
    maxRestarts?: number
    restartWindow?: number
    notifyOnRestart?: boolean
  }) => {
    try {
      return healthCheckService.updateHealthCheckConfig(appId, config)
    } catch (error) {
      log.error('healthCheck:updateConfig error:', error)
      throw error
    }
  })

  ipcMain.handle('healthCheck:getConfig', (_, appId: string) => {
    try {
      return healthCheckService.getHealthCheckConfig(appId)
    } catch (error) {
      log.error('healthCheck:getConfig error:', error)
      return null
    }
  })

  ipcMain.handle('healthCheck:performCheck', async (_, appId?: string) => {
    try {
      return await healthCheckService.performHealthCheck(appId)
    } catch (error) {
      log.error('healthCheck:performCheck error:', error)
      return []
    }
  })

  ipcMain.handle('healthCheck:getHistory', (_, appId: string, limit?: number) => {
    try {
      return healthCheckService.getHealthCheckHistory(appId, limit)
    } catch (error) {
      log.error('healthCheck:getHistory error:', error)
      return []
    }
  })

  ipcMain.handle('healthCheck:getReport', (_, appId: string) => {
    try {
      return healthCheckService.getHealthCheckReport(appId)
    } catch (error) {
      log.error('healthCheck:getReport error:', error)
      return null
    }
  })

  ipcMain.handle('healthCheck:getAllReports', () => {
    try {
      return healthCheckService.getAllHealthCheckReports()
    } catch (error) {
      log.error('healthCheck:getAllReports error:', error)
      return []
    }
  })

  ipcMain.handle('healthCheck:cleanupHistory', (_, days?: number) => {
    try {
      const deleted = healthCheckService.cleanupHistory(days)
      return { success: true, deleted }
    } catch (error) {
      log.error('healthCheck:cleanupHistory error:', error)
      return { success: false, deleted: 0 }
    }
  })

  ipcMain.handle('healthCheck:startPeriodic', (_, intervalMs?: number) => {
    try {
      healthCheckService.startPeriodicCheck(intervalMs)
      return { success: true }
    } catch (error) {
      log.error('healthCheck:startPeriodic error:', error)
      return { success: false }
    }
  })

  ipcMain.handle('healthCheck:stopPeriodic', () => {
    try {
      healthCheckService.stopPeriodicCheck()
      return { success: true }
    } catch (error) {
      log.error('healthCheck:stopPeriodic error:', error)
      return { success: false }
    }
  })

  // 资源报表 IPC 处理器
  ipcMain.handle('resourceReport:collectMetrics', async (_, serverId: string, appId: string, containerId: string) => {
    try {
      return await resourceReportsService.collectAndSaveMetrics({ serverId, appId, containerId })
    } catch (error) {
      log.error('resourceReport:collectMetrics error:', error)
      return null
    }
  })

  ipcMain.handle('resourceReport:getMetrics', (_, params: {
    serverId?: string
    appId?: string
    containerId?: string
    startTime?: string
    endTime?: string
    limit?: number
    offset?: number
  }) => {
    try {
      return resourceReportsService.getMetrics(params)
    } catch (error) {
      log.error('resourceReport:getMetrics error:', error)
      return { metrics: [], total: 0 }
    }
  })

  ipcMain.handle('resourceReport:getSummary', (_, serverId?: string, appId?: string, period?: string) => {
    try {
      return resourceReportsService.getMetricsSummary(serverId, appId, period || '24h')
    } catch (error) {
      log.error('resourceReport:getSummary error:', error)
      return {
        avgCpuPercent: 0,
        maxCpuPercent: 0,
        avgMemoryUsage: 0,
        maxMemoryUsage: 0,
        avgNetworkRx: 0,
        avgNetworkTx: 0,
        totalBlockRead: 0,
        totalBlockWrite: 0,
        dataPoints: 0,
        period: period || '24h'
      }
    }
  })

  ipcMain.handle('resourceReport:exportCSV', async (_, metrics: {
    id: string
    serverId: string
    appId: string | null
    containerId: string | null
    cpuPercent: number | null
    memoryUsage: number | null
    memoryLimit: number | null
    networkRx: number | null
    networkTx: number | null
    blockRead: number | null
    blockWrite: number | null
    timestamp: string
  }[]) => {
    try {
      const csv = resourceReportsService.exportMetricsToCSV(metrics)
      const result = await dialog.showSaveDialog({
        title: '导出资源报表',
        defaultPath: `resource-metrics-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [
          { name: 'CSV 文件', extensions: ['csv'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (!result.canceled && result.filePath) {
        await writeFile(result.filePath, csv, 'utf-8')
        return { success: true, message: '导出成功' }
      }
      return { success: false, message: '已取消' }
    } catch (error) {
      log.error('resourceReport:exportCSV error:', error)
      return { success: false, message: `导出失败: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('resourceReport:cleanup', (_, days?: number) => {
    try {
      const deleted = resourceReportsService.cleanupOldData(days)
      return { success: true, deleted }
    } catch (error) {
      log.error('resourceReport:cleanup error:', error)
      return { success: false, deleted: 0 }
    }
  })

  ipcMain.handle('resourceReport:startPeriodicCollection', (_, serverId: string, containerIds: string[], interval?: number, appId?: string | null) => {
    try {
      resourceReportsService.startPeriodicCollection(serverId, containerIds, interval, appId)
      return { success: true }
    } catch (error) {
      log.error('resourceReport:startPeriodicCollection error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('resourceReport:stopPeriodicCollection', (_, serverId: string, containerIds?: string[]) => {
    try {
      resourceReportsService.stopPeriodicCollection(serverId, containerIds)
      return { success: true }
    } catch (error) {
      log.error('resourceReport:stopPeriodicCollection error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('resourceReport:getActiveCollectionCount', () => {
    try {
      return resourceReportsService.getActiveCollectionCount()
    } catch (error) {
      log.error('resourceReport:getActiveCollectionCount error:', error)
      return 0
    }
  })

  ipcMain.handle('resourceReport:getLatestMetrics', (_, serverId: string) => {
    try {
      return resourceReportsService.getLatestMetrics(serverId)
    } catch (error) {
      log.error('resourceReport:getLatestMetrics error:', error)
      return null
    }
  })

  ipcMain.handle('resourceReport:getLatestMetricsByContainer', (_, containerId: string) => {
    try {
      return resourceReportsService.getLatestMetricsByContainer(containerId)
    } catch (error) {
      log.error('resourceReport:getLatestMetricsByContainer error:', error)
      return null
    }
  })

  // AI API 代理 IPC 处理器 - 绕过 CORS 限制
  ipcMain.handle('ai:getModels', async (_, provider: string, apiKey: string, baseUrl?: string) => {
    try {
      let url: string
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      switch (provider) {
        case 'anthropic':
          // Anthropic 不支持 /models 端点，返回空列表
          return { success: true, data: [] }
        case 'gemini': {
          const geminiBase = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
          url = `${geminiBase}/models?key=${apiKey}`
          break
        }
        case 'azure': {
          // Azure 需要特殊处理，返回空列表让用户手动输入
          return { success: true, data: [] }
        }
        case 'ollama': {
          const ollamaBase = (baseUrl || 'http://localhost:11434').replace(/\/$/, '')
          url = `${ollamaBase}/api/tags`
          break
        }
        case 'custom':
          url = `${(baseUrl || '').replace(/\/$/, '')}/models`
          headers['Authorization'] = `Bearer ${apiKey}`
          break
        default:
          url = `${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/models`
          headers['Authorization'] = `Bearer ${apiKey}`
      }

      return new Promise((resolve) => {
        const urlObj = new URL(url)
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers,
          rejectUnauthorized: false // 允许自签名证书
        }

        const req = https.request(options, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                const jsonData = JSON.parse(data)
                // 不同提供商响应格式不同
                if (provider === 'ollama') {
                  // Ollama: { models: [{ name: "..." }] }
                  const models = (jsonData.models || []).map((m: any) => ({
                    id: m.name,
                    name: m.name
                  }))
                  resolve({ success: true, data: models })
                } else if (provider === 'gemini') {
                  // Gemini: { models: [{ name: "models/..." }] }
                  const models = (jsonData.models || []).map((m: any) => ({
                    id: m.name,
                    name: m.name
                  }))
                  resolve({ success: true, data: models })
                } else {
                  // OpenAI: { data: [{ id: "..." }] }
                  resolve({ success: true, data: jsonData.data || [] })
                }
              } else {
                resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` })
              }
            } catch (e) {
              resolve({ success: false, error: `解析响应失败: ${(e as Error).message}` })
            }
          })
        })

        req.on('error', (error) => {
          log.error('ai:getModels request error:', error)
          resolve({ success: false, error: `请求失败: ${error.message}` })
        })

        req.setTimeout(30000, () => {
          req.destroy()
          resolve({ success: false, error: '请求超时' })
        })

        req.end()
      })
    } catch (error) {
      log.error('ai:getModels error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // AI 生成 Shell 脚本文本（供 Shell 脚本库"AI 编写"使用）
  ipcMain.handle('ai:generateScript', async (_event, cfg: any, prompt: string) => {
    try {
      const model = await createAIModel(cfg?.provider, cfg?.apiKey, cfg?.model, cfg?.baseUrl, cfg?.extraParams)
      const { generateText } = await import('ai')
      const system =
        '你是一名熟练的 Linux/Unix Shell 脚本专家。根据用户需求编写完整、健壮、可直接运行的 Shell 脚本，' +
        '包含必要的错误处理和清晰的中文注释。只输出脚本代码本身，不要任何解释文字，也不要 markdown 代码块包裹。'
      const { text } = await generateText({
        model,
        system,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 4000
      })
      return { success: true, text }
    } catch (error) {
      log.error('ai:generateScript error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 运维 Agent (Mastra) IPC ====================

  // API Key 安全存储（Electron safeStorage）
  ipcMain.handle('secure:encrypt', (_e, text: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return { success: false }
      return { success: true, data: safeStorage.encryptString(text).toString('base64') }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('secure:decrypt', (_e, cipher: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return { success: false }
      return { success: true, data: safeStorage.decryptString(Buffer.from(cipher, 'base64')) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // AI 厂商福利活动自动抓取（主进程请求官方页，规避渲染进程 CORS）
  ipcMain.handle('promo:fetch', async (): Promise<{ success: boolean; data?: any[]; error?: string }> => {
    try {
      const data = await fetchPromotions()
      return { success: true, data }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 设置 Agent 模型配置（配置变化时重建 Agent）
  ipcMain.handle('opsAgent:setConfig', (_, config: any) => {
    try {
      setAgentModelConfig(config)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('opsAgent:getConfig', () => {
    return { success: true, data: getAgentConfig() }
  })

  // 审批请求发送器：转发到渲染进程审批 UI
  setApprovalSender((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('opsAgent:approval-request', payload)
    }
  })

  // 审批回传
  ipcMain.handle('opsAgent:approval', (_, id: string, approved: boolean) => {
    resolveApproval(id, approved)
    return { success: true }
  })

  // 渲染层"AI 建议命令一键执行"的风控门禁：黑名单拒绝 + 高危命令统一审批
  ipcMain.handle('opsAgent:approveCommand', async (_, payload: { command: string; riskLevel?: string }) => {
    try {
      return await approveCommandExecution(payload.command, payload.riskLevel)
    } catch (error) {
      log.error('opsAgent:approveCommand error:', error)
      return { approved: false, riskLevel: 'high', blocked: false }
    }
  })

  // 流式对话
  ipcMain.handle('opsAgent:chat', async (event, requestId: string, options: any) => {
    const sendEvent = (type: string, payload: any) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(type, payload)
      }
    }

    try {
      const controller = new AbortController()
      opsAgentStreams.set(requestId, controller)

      await chatWithAgent({
        serverId: options?.serverId,
        serverName: options?.serverName,
        userInput: options?.userInput,
        threadId: options?.threadId || `thread-${Date.now()}`,
        historySummary: options?.historySummary,
        temperature: options?.temperature,
        signal: controller.signal,
        callbacks: {
          onDelta: (delta) => sendEvent('opsAgent:chunk', { requestId, delta }),
          onReasoning: (delta) => sendEvent('opsAgent:reasoning', { requestId, delta }),
          onToolCall: (toolName, args, toolCallId) => sendEvent('opsAgent:toolCall', { requestId, toolName, args, toolCallId }),
          onToolResult: (toolName, success, output, toolCallId) => sendEvent('opsAgent:toolResult', { requestId, toolName, success, output, toolCallId }),
          onError: (error) => sendEvent('opsAgent:error', { requestId, error }),
          onDone: () => sendEvent('opsAgent:done', { requestId }),
          onRoute: (route) => sendEvent('opsAgent:route', { requestId, route }),
          onUsage: (usage) => sendEvent('opsAgent:usage', { requestId, usage })
        }
      })

      opsAgentStreams.delete(requestId)
      return { success: true, requestId }
    } catch (error) {
      log.error('opsAgent:chat error:', error)
      // 异常路径也清理 AbortController，避免 Map 泄漏
      opsAgentStreams.delete(requestId)
      sendEvent('opsAgent:error', { requestId, error: (error as Error).message })
      return { success: false, error: (error as Error).message }
    }
  })

  // 取消对话
  ipcMain.handle('opsAgent:cancel', (_, requestId: string) => {
    const controller = opsAgentStreams.get(requestId)
    if (controller) {
      controller.abort()
      opsAgentStreams.delete(requestId)
      return { success: true }
    }
    return { success: false, error: '未找到对应请求' }
  })

  // ==================== Shell 脚本库 IPC 处理器 ====================

  ipcMain.handle('shellScript:getAll', () => {
    try {
      return shellScriptService.getAll()
    } catch (error) {
      log.error('shellScript:getAll error:', error)
      return []
    }
  })

  ipcMain.handle('shellScript:getById', (_, id: string) => {
    try {
      return shellScriptService.getById(id)
    } catch (error) {
      log.error('shellScript:getById error:', error)
      return undefined
    }
  })

  ipcMain.handle('shellScript:create', (_, input) => {
    try {
      const script = shellScriptService.create(input)
      auditLogService.log({
        action: 'shell_script_create',
        targetType: 'shell_script',
        targetId: script?.id,
        targetName: input.name,
        status: 'success',
        details: `Category: ${input.category || 'common'}`
      })
      return script
    } catch (error) {
      log.error('shellScript:create error:', error)
      auditLogService.log({
        action: 'shell_script_create',
        targetType: 'shell_script',
        targetName: input.name,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('shellScript:update', (_, id: string, input, changeNote?: string) => {
    try {
      const script = shellScriptService.update(id, input, changeNote)
      auditLogService.log({
        action: 'shell_script_update',
        targetType: 'shell_script',
        targetId: id,
        targetName: script?.name,
        status: 'success',
        details: `Updated fields: ${Object.keys(input).join(', ')}, now v${script?.version}`
      })
      return script
    } catch (error) {
      log.error('shellScript:update error:', error)
      auditLogService.log({
        action: 'shell_script_update',
        targetType: 'shell_script',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('shellScript:delete', (_, id: string) => {
    try {
      const existing = shellScriptService.getById(id)
      shellScriptService.delete(id)
      auditLogService.log({
        action: 'shell_script_delete',
        targetType: 'shell_script',
        targetId: id,
        targetName: existing?.name,
        status: 'success'
      })
    } catch (error) {
      log.error('shellScript:delete error:', error)
      auditLogService.log({
        action: 'shell_script_delete',
        targetType: 'shell_script',
        targetId: id,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('shellScript:getVersions', (_, scriptId: string) => {
    try {
      return shellScriptService.getVersions(scriptId)
    } catch (error) {
      log.error('shellScript:getVersions error:', error)
      return []
    }
  })

  ipcMain.handle('shellScript:getVersionById', (_, id: string) => {
    try {
      return shellScriptService.getVersionById(id)
    } catch (error) {
      log.error('shellScript:getVersionById error:', error)
      return undefined
    }
  })

  ipcMain.handle('shellScript:rollback', (_, scriptId: string, versionId: string, changeNote?: string) => {
    try {
      const script = shellScriptService.rollback(scriptId, versionId, changeNote)
      auditLogService.log({
        action: 'shell_script_rollback',
        targetType: 'shell_script',
        targetId: scriptId,
        targetName: script?.name,
        status: 'success',
        details: `Rolled back to v${script?.version}`
      })
      return script
    } catch (error) {
      log.error('shellScript:rollback error:', error)
      auditLogService.log({
        action: 'shell_script_rollback',
        targetType: 'shell_script',
        targetId: scriptId,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('shellScript:run', async (_, scriptId: string, options) => {
    try {
      const script = shellScriptService.getById(scriptId)
      const result = await shellScriptService.run(scriptId, options)
      auditLogService.log({
        action: 'shell_script_run',
        targetType: 'shell_script',
        targetId: scriptId,
        targetName: script?.name,
        status: result.success ? 'success' : 'failure',
        details: `Servers: ${result.successCount}/${result.total} succeeded, v${script?.version}`
      })
      return result
    } catch (error) {
      log.error('shellScript:run error:', error)
      auditLogService.log({
        action: 'shell_script_run',
        targetType: 'shell_script',
        targetId: scriptId,
        status: 'failure',
        details: (error as Error).message
      })
      throw error
    }
  })

  ipcMain.handle('shellScript:getExecutionLogs', (_, scriptId?: string, limit?: number) => {
    try {
      return shellScriptService.getExecutionLogs(scriptId, limit)
    } catch (error) {
      log.error('shellScript:getExecutionLogs error:', error)
      return []
    }
  })

  ipcMain.handle('shellScript:deleteExecutionLog', (_, logId: string) => {
    try {
      shellScriptService.deleteExecutionLog(logId)
      return { success: true }
    } catch (error) {
      log.error('shellScript:deleteExecutionLog error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('shellScript:clearExecutionLogs', (_, scriptId?: string) => {
    try {
      shellScriptService.clearExecutionLogs(scriptId)
      return { success: true }
    } catch (error) {
      log.error('shellScript:clearExecutionLogs error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  // 启动告警监控
  alertService.startMonitoring()

  // 启动自动清理（审计日志 / 告警历史 / 健康检查历史 / 资源指标）
  auditLogService.startAutoCleanup()
  alertService.startAutoCleanup(30)
  healthCheckService.startAutoCleanup(14)
  resourceReportsService.startAutoCleanup(7)

  // 启动定期健康检查（默认60秒间隔）
  healthCheckService.startPeriodicCheck(60000)

  log.info('IPC handlers registered')
}

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection:', reason)
})

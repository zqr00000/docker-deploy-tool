import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import log from 'electron-log'
import { initDatabase, closeDatabase, serverQueries, templateQueries, appQueries, initDefaultTemplates, configQueries, scheduledTaskQueries, serverGroupQueries } from './database'
import { sshService, generateId } from './ssh'
import { systemCheckService } from './system-check'
import { appDeployService } from './app-deploy'
import { installService } from './install-service'
import { dockerVolumesService } from './docker-volumes'
import { dockerImagesService } from './docker-images'
import { dockerNetworksService } from './docker-networks'
import { auditLogService } from './audit-log'
import { deployHistoryService } from './deploy-history'
import { batchOperationsService } from './batch-operations'
import { containerTerminalService } from './container-terminal'
import { alertService } from './alert-service'
import { schedulerService } from './scheduler'
import { healthCheckService } from './health-check'
import { resourceReportsService } from './resource-reports'

log.transports.file.level = 'info'
log.transports.console.level = 'debug'

log.info('Docker Deploy Tool starting...')

function createWindow(): void {
  log.info('Creating main window...')

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Docker Deploy Tool',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    log.info('Window ready, showing window')
    mainWindow.show()
  })

  // Suppress harmless Autofill DevTools protocol errors
  mainWindow.webContents.on('devtools-opened', () => {
    try {
      mainWindow.webContents.debugger.attach('1.3')
      mainWindow.webContents.debugger.sendCommand('Autofill.disable').catch(() => {})
    } catch {
      // Debugger not available
    }
  })

  if (process.env.NODE_ENV === 'development') {
    const devServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    log.info(`Development mode, loading dev server: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = join(__dirname, '../renderer/index.html')
    log.info(`Production mode, loading file: ${indexPath}`)
    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    log.info('Main window closed')
  })
}

app.whenReady().then(() => {
  log.info('App ready')

  initDatabase()
  initDefaultTemplates()
  registerIpcHandlers()
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

function registerIpcHandlers(): void {
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:name', () => {
    return app.getName()
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
        auditLogService.log({
          action: 'server_connect',
          targetType: 'server',
          targetId: server.id,
          targetName: server.name,
          status: 'success',
          details: `Connected to ${server.host}:${server.port}`,
          serverId: server.id
        })
      } else {
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

  ipcMain.handle('app:deploy', async (_, options) => {
    try {
      const result = await appDeployService.deployApp(options)
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

  ipcMain.handle('resourceReport:startPeriodicCollection', (_, serverId: string, containerIds: string[], interval?: number) => {
    try {
      resourceReportsService.startPeriodicCollection(serverId, containerIds, interval)
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

  // 启动告警监控
  alertService.startMonitoring()

  // 启动自动清理
  auditLogService.startAutoCleanup()

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

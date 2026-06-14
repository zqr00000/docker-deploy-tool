import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { initDatabase, closeDatabase, serverQueries, templateQueries, appQueries, initDefaultTemplates } from './database'
import { sshService, generateId } from './ssh'
import { systemCheckService } from './system-check'
import { appDeployService } from './app-deploy'
import { installService } from './install-service'

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
      return server
    } catch (error) {
      log.error('server:create error:', error)
      throw error
    }
  })

  ipcMain.handle('server:update', (_, id: string, updates) => {
    try {
      serverQueries.update(id, updates)
    } catch (error) {
      log.error('server:update error:', error)
      throw error
    }
  })

  ipcMain.handle('server:delete', (_, id: string) => {
    try {
      sshService.disconnect(id)
      serverQueries.delete(id)
    } catch (error) {
      log.error('server:delete error:', error)
      throw error
    }
  })

  ipcMain.handle('server:connect', async (_, server) => {
    try {
      const result = await sshService.connect(server)
      if (result.success) {
        serverQueries.updateStatus(server.id, 'online')
      } else {
        serverQueries.updateStatus(server.id, 'error')
      }
      return result
    } catch (error) {
      log.error('server:connect error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('server:disconnect', (_, serverId: string) => {
    try {
      sshService.disconnect(serverId)
      serverQueries.updateStatus(serverId, 'offline')
    } catch (error) {
      log.error('server:disconnect error:', error)
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
        isBuiltIn: 0
      })
      return {
        id,
        ...templateData,
        category: templateData.category || 'app',
        isBuiltIn: false,
        createdAt: new Date().toISOString()
      }
    } catch (error) {
      log.error('template:create error:', error)
      throw error
    }
  })

  ipcMain.handle('template:update', (_, id: string, updates) => {
    try {
      templateQueries.update(id, updates)
    } catch (error) {
      log.error('template:update error:', error)
      throw error
    }
  })

  ipcMain.handle('template:delete', (_, id: string) => {
    try {
      templateQueries.delete(id)
    } catch (error) {
      log.error('template:delete error:', error)
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
      appQueries.delete(id)
    } catch (error) {
      log.error('app:delete error:', error)
    }
  })

  ipcMain.handle('app:deploy', async (_, options) => {
    try {
      return await appDeployService.deployApp(options)
    } catch (error) {
      log.error('app:deploy error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:start', async (_, appId: string) => {
    try {
      return await appDeployService.startApp(appId)
    } catch (error) {
      log.error('app:start error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:stop', async (_, appId: string) => {
    try {
      return await appDeployService.stopApp(appId)
    } catch (error) {
      log.error('app:stop error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:restart', async (_, appId: string) => {
    try {
      return await appDeployService.restartApp(appId)
    } catch (error) {
      log.error('app:restart error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('app:updateCompose', async (_, appId: string, dockerCompose?: string) => {
    try {
      return await appDeployService.updateApp(appId, dockerCompose)
    } catch (error) {
      log.error('app:updateCompose error:', error)
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

  log.info('IPC handlers registered')
}

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection:', reason)
})

// ============================================================
// 自动更新服务：基于 electron-updater + GitHub Releases
// 事件统一以 'updater:event' 推送给渲染进程，由设置页消费
// ============================================================
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import log from 'electron-log'

export interface UpdateProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: { version: string; releaseNotes?: string; releaseDate?: string } }
  | { type: 'not-available' }
  | { type: 'progress'; progress: UpdateProgressInfo }
  | { type: 'downloaded' }
  | { type: 'error'; message: string }

export interface UpdaterCheckResult {
  hasUpdate: boolean
  version?: string
  releaseNotes?: string
  releaseDate?: string
  message?: string
}

type UpdaterStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error'

// ==================== 更新源 ====================
// 更新源由 electron-builder 打包时生成的 app-update.yml 提供
// （provider: github, owner: zqr00000, repo: docker-deploy-tool, releaseType: release）
// electron-updater 默认读取该文件，无需 setFeedURL 硬编码

let status: UpdaterStatus = 'idle'

function sendEvent(event: UpdaterEvent): void {
  try {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('updater:event', event)
      }
    })
  } catch (error) {
    log.error('updater: sendEvent error:', error)
  }
}

/** 将 releaseNotes（字符串或摘要块数组）归一化为纯文本 */
function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((item: { note?: string }) => (typeof item?.note === 'string' ? item.note : ''))
      .filter(Boolean)
      .join('\n\n')
  }
  return undefined
}

function onDownloadProgress(progress: UpdateProgressInfo): void {
  status = 'downloading'
  log.info(`updater: download progress ${progress.percent.toFixed(1)}% (${progress.transferred}/${progress.total} bytes, ${progress.bytesPerSecond} B/s)`)
  sendEvent({ type: 'progress', progress })
}

export function initUpdater(): void {
  // 开发模式下禁用自动更新逻辑（electron-updater 要求打包后才可用），
  // 但 IPC handler 仍需注册，否则渲染进程调用会报 "No handler registered"
  const isDev = !app.isPackaged
  if (isDev) {
    log.info('updater: dev mode, auto updater disabled (IPC still registered)')
  } else {
    autoUpdater.logger = log
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => {
      status = 'checking'
      log.info('updater: checking for update...')
      sendEvent({ type: 'checking' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      status = 'idle'
      log.info(`updater: update available, version=${info.version}, date=${info.releaseDate}`)
      sendEvent({
        type: 'available',
        info: {
          version: info.version,
          releaseNotes: normalizeReleaseNotes(info.releaseNotes),
          releaseDate: info.releaseDate
        }
      })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      status = 'idle'
      log.info(`updater: update not available, current=${app.getVersion()}, latest=${info.version}`)
      sendEvent({ type: 'not-available' })
    })

    autoUpdater.on('download-progress', onDownloadProgress)

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      status = 'downloaded'
      log.info(`updater: update downloaded, version=${info.version}`)
      sendEvent({ type: 'downloaded' })
    })
  }

  autoUpdater.on('error', (error: Error) => {
    status = 'error'
    log.error('updater: error:', error)
    sendEvent({ type: 'error', message: error.message })
  })

  // ==================== IPC ====================
  ipcMain.handle('update:check', async (): Promise<UpdaterCheckResult> => {
    if (!app.isPackaged) {
      return { hasUpdate: false, message: '开发模式下不可更新' }
    }
    try {
      log.info('updater: checking for update...')
      const result = await autoUpdater.checkForUpdates()
      const info = result?.updateInfo
      const hasUpdate = info ? info.version !== app.getVersion() : false
      log.info(`updater: check ok, hasUpdate=${hasUpdate}, latest=${info?.version}`)
      return {
        hasUpdate,
        version: info?.version,
        releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
        releaseDate: info?.releaseDate
      }
    } catch (error) {
      log.error('updater: check failed:', error)
      return { hasUpdate: false, message: (error as Error).message || '更新源不可达' }
    }
  })

  ipcMain.handle('update:download', async (): Promise<{ success: boolean; message?: string }> => {
    try {
      log.info('updater: start download')
      status = 'downloading'
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      status = 'error'
      log.error('updater: download error:', error)
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('update:install', (): { success: boolean } => {
    try {
      log.info('updater: quit and install')
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (error) {
      log.error('updater: install error:', error)
      return { success: false }
    }
  })

  ipcMain.handle('update:getStatus', (): UpdaterStatus => status)

  log.info('updater: initialized')
}

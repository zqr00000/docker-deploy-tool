import { Client, ConnectConfig } from 'ssh2'
import log from 'electron-log'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { promises as fsp } from 'fs'
import path from 'path'

// 远端目录条目（XFTP 式浏览用）
export interface RemoteDirEntry {
  name: string
  type: 'dir' | 'file' | 'link' | 'other'
  size: number
  mtime: number
  mode: number
}

export interface SSHServerConfig {
  id: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
}

interface ConnectionEntry {
  client: Client
  serverId: string
  connectedAt: Date
  authenticated: boolean
  keepAliveTimer?: NodeJS.Timeout
  connectConfig?: ConnectConfig
  serverConfig?: SSHServerConfig
  reconnectAttempts: number
  maxReconnectAttempts: number
  reconnectDelay: number
  reconnectTimer?: NodeJS.Timeout
  isReconnecting: boolean
  lastActivity: Date
  healthCheckTimer?: NodeJS.Timeout
}

class SSHService {
  private connections: Map<string, ConnectionEntry> = new Map()
  private connectionTimeout = 30000
  private maxConcurrentCommands = 5
  private commandQueues: Map<string, Array<() => void>> = new Map()
  private activeCommands: Map<string, number> = new Map()
  private maxReconnectAttempts = 3
  private reconnectDelayBase = 2000
  private healthCheckInterval = 60000
  private idleTimeout = 300000 // 5 minutes idle timeout
  private maxConnections = 20 // Maximum concurrent connections
  private idleCheckInterval = 60000 // Check idle connections every minute
  private idleCheckTimer?: NodeJS.Timeout

  constructor() {
    // Start idle connection cleanup timer
    this.idleCheckTimer = setInterval(() => {
      this.cleanupIdleConnections()
    }, this.idleCheckInterval)
  }

  // Cleanup idle connections to free resources
  private cleanupIdleConnections(): void {
    const now = Date.now()
    const toDisconnect: string[] = []

    for (const [serverId, entry] of this.connections.entries()) {
      const idleTime = now - entry.lastActivity.getTime()
      if (idleTime > this.idleTimeout && !this.activeCommands.get(serverId)) {
        toDisconnect.push(serverId)
      }
    }

    for (const serverId of toDisconnect) {
      log.info(`Disconnecting idle connection for server: ${serverId}`)
      this.disconnect(serverId)
    }
  }

  // Get connection count
  getConnectionCount(): number {
    return this.connections.size
  }

  // Get active command count for a server
  getActiveCommandCount(serverId: string): number {
    return this.activeCommands.get(serverId) || 0
  }

  // Cleanup on service destroy
  destroy(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer)
    }
    this.disconnectAll()
  }

  private async acquireCommandSlot(serverId: string): Promise<void> {
    const active = this.activeCommands.get(serverId) || 0
    if (active >= this.maxConcurrentCommands) {
      await new Promise<void>((resolve) => {
        const queue = this.commandQueues.get(serverId) || []
        queue.push(resolve)
        this.commandQueues.set(serverId, queue)
      })
    }
    this.activeCommands.set(serverId, (this.activeCommands.get(serverId) || 0) + 1)
  }

  private releaseCommandSlot(serverId: string): void {
    const currentActive = this.activeCommands.get(serverId) || 0
    const newActive = currentActive - 1
    
    if (newActive <= 0) {
      this.activeCommands.delete(serverId)
    } else {
      this.activeCommands.set(serverId, newActive)
    }
    
    const queue = this.commandQueues.get(serverId) || []
    if (queue.length > 0) {
      const next = queue.shift()
      this.commandQueues.set(serverId, queue)
      if (next) next()
    }
  }

  private createClient(config: SSHServerConfig): Client {
    return new Client()
  }

  private getConnectConfig(config: SSHServerConfig): ConnectConfig {
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: this.connectionTimeout,
      keepaliveInterval: 30000,
      keepaliveCountMax: 3
    }

    if (config.authType === 'password' && config.password) {
      connectConfig.password = config.password
    } else if (config.authType === 'key' && config.privateKey) {
      connectConfig.privateKey = config.privateKey
    }

    return connectConfig
  }

  async connect(config: SSHServerConfig): Promise<{ success: boolean; message: string }> {
    const { id: serverId } = config

    if (this.connections.has(serverId)) {
      const existing = this.connections.get(serverId)!
      if (existing.authenticated) {
        return { success: true, message: 'Already connected' }
      }
      this.disconnect(serverId)
    }

    return new Promise((resolve) => {
      const client = this.createClient(config)
      const connectConfig = this.getConnectConfig(config)

      const entry: ConnectionEntry = {
        client,
        serverId,
        connectedAt: new Date(),
        authenticated: false,
        connectConfig: { ...connectConfig },
        serverConfig: { ...config },
        reconnectAttempts: 0,
        maxReconnectAttempts: this.maxReconnectAttempts,
        reconnectDelay: this.reconnectDelayBase,
        isReconnecting: false,
        lastActivity: new Date()
      }

      const timeout = setTimeout(() => {
        client.end()
        this.connections.delete(serverId)
        resolve({ success: false, message: 'Connection timeout' })
      }, this.connectionTimeout)

      client.on('ready', () => {
        clearTimeout(timeout)
        log.info(`SSH connected to ${config.host}:${config.port}`)
        entry.authenticated = true
        entry.reconnectAttempts = 0
        entry.isReconnecting = false
        entry.lastActivity = new Date()

        // 启动健康检查
        this.startHealthCheck(serverId)

        this.connections.set(serverId, entry)
        resolve({ success: true, message: 'Connection established' })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        log.error(`SSH connection error for ${config.host}: ${err.message}`)
        this.connections.delete(serverId)
        resolve({ success: false, message: err.message })
      })

      client.on('close', () => {
        log.info(`SSH connection closed for ${config.host}`)
        entry.authenticated = false
        this.handleDisconnect(serverId)
      })

      client.on('end', () => {
        log.info(`SSH connection ended for ${config.host}`)
        entry.authenticated = false
        this.handleDisconnect(serverId)
      })

      try {
        client.connect(connectConfig)
      } catch (err) {
        clearTimeout(timeout)
        const error = err as Error
        log.error(`SSH connect error: ${error.message}`)
        resolve({ success: false, message: error.message })
      }
    })
  }

  disconnect(serverId: string): void {
    const entry = this.connections.get(serverId)
    if (entry) {
      this.clearTimers(entry)
      entry.authenticated = false
      entry.client.end()
      this.connections.delete(serverId)
      log.info(`SSH disconnected for server ${serverId}`)
    }
    
    const queue = this.commandQueues.get(serverId) || []
    if (queue.length > 0) {
      log.warn(`Canceling ${queue.length} pending commands for server ${serverId}`)
      queue.forEach(resolve => resolve())
      this.commandQueues.delete(serverId)
    }
    this.activeCommands.delete(serverId)
  }

  private clearTimers(entry: ConnectionEntry): void {
    if (entry.keepAliveTimer) {
      clearInterval(entry.keepAliveTimer)
      entry.keepAliveTimer = undefined
    }
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer)
      entry.reconnectTimer = undefined
    }
    if (entry.healthCheckTimer) {
      clearInterval(entry.healthCheckTimer)
      entry.healthCheckTimer = undefined
    }
  }

  private handleDisconnect(serverId: string): void {
    const entry = this.connections.get(serverId)
    if (!entry) return

    // 清理定时器
    if (entry.keepAliveTimer) {
      clearInterval(entry.keepAliveTimer)
      entry.keepAliveTimer = undefined
    }
    if (entry.healthCheckTimer) {
      clearInterval(entry.healthCheckTimer)
      entry.healthCheckTimer = undefined
    }

    // 尝试自动重连
    if (entry.reconnectAttempts < entry.maxReconnectAttempts && entry.serverConfig) {
      this.scheduleReconnect(serverId)
    } else if (entry.reconnectAttempts >= entry.maxReconnectAttempts) {
      log.warn(`Max reconnect attempts reached for server ${serverId}`)
      this.connections.delete(serverId)
    }
  }

  private scheduleReconnect(serverId: string): void {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.serverConfig) return

    entry.isReconnecting = true
    entry.reconnectAttempts++

    // 指数退避延迟
    const delay = entry.reconnectDelay * Math.pow(2, entry.reconnectAttempts - 1)
    log.info(`Scheduling reconnect for server ${serverId} in ${delay}ms (attempt ${entry.reconnectAttempts}/${entry.maxReconnectAttempts})`)

    entry.reconnectTimer = setTimeout(async () => {
      try {
        const result = await this.connect(entry.serverConfig!)
        if (result.success) {
          log.info(`Reconnect successful for server ${serverId}`)
        } else {
          log.warn(`Reconnect failed for server ${serverId}: ${result.message}`)
        }
      } catch (error) {
        log.error(`Reconnect error for server ${serverId}:`, error)
      }
    }, delay)
  }

  private startHealthCheck(serverId: string): void {
    const entry = this.connections.get(serverId)
    if (!entry) return

    // 清除旧的定时器
    if (entry.healthCheckTimer) {
      clearInterval(entry.healthCheckTimer)
    }

    entry.healthCheckTimer = setInterval(async () => {
      if (!this.isConnected(serverId)) {
        if (entry.healthCheckTimer) {
          clearInterval(entry.healthCheckTimer)
          entry.healthCheckTimer = undefined
        }
        return
      }

      try {
        // 简单的健康检查：执行 echo 命令
        const result = await this.executeCommand(serverId, 'echo "ping"', 0, 5000, 10000)
        if (!result.success) {
          log.warn(`Health check failed for server ${serverId}`)
          entry.lastActivity = new Date(Date.now() - this.healthCheckInterval * 2)
        } else {
          entry.lastActivity = new Date()
        }
      } catch {
        log.warn(`Health check error for server ${serverId}`)
      }
    }, this.healthCheckInterval)
  }

  isConnected(serverId: string): boolean {
    const entry = this.connections.get(serverId)
    return entry !== undefined && entry.authenticated
  }

  getConnectionStatus(serverId: string): 'online' | 'offline' | 'connecting' {
    const entry = this.connections.get(serverId)
    if (!entry) {
      return 'offline'
    }
    if (entry.authenticated) {
      return 'online'
    }
    return 'connecting'
  }

  async executeCommand(
    serverId: string,
    command: string,
    maxRetries = 2,
    retryDelay = 1000,
    timeout = 30000
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
    let entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      // 连接可能正处于"断开→自动重连"的空窗，短暂等待其就绪，避免对在线服务器误报未连接
      const deadline = Date.now() + 2500
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 150))
        entry = this.connections.get(serverId)
        if (entry && entry.authenticated) break
      }
    }
    if (!entry || !entry.authenticated) {
      return {
        success: false,
        stdout: '',
        stderr: 'Not connected to server',
        exitCode: -1
      }
    }

    await this.acquireCommandSlot(serverId)

    const executeOnce = (): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> => {
      return new Promise((resolve) => {
        const timeoutTimer = setTimeout(() => {
          resolve({
            success: false,
            stdout: '',
            stderr: 'Command execution timeout',
            exitCode: -1
          })
        }, timeout)

        entry.client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutTimer)
            resolve({
              success: false,
              stdout: '',
              stderr: err.message,
              exitCode: -1
            })
            return
          }

          let stdout = ''
          let stderr = ''

          stream.on('close', (code: number) => {
            clearTimeout(timeoutTimer)
            resolve({
              success: code === 0,
              stdout,
              stderr,
              exitCode: code
            })
          })

          stream.on('data', (data: Buffer) => {
            stdout += data.toString()
          })

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })
        })
      })
    }

    try {
      let lastError = null
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          log.info(`SSH command retry ${attempt}/${maxRetries} for server ${serverId}`)
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
        }
        
        const result = await executeOnce()
        
        if (result.success || result.exitCode !== -1) {
          return result
        }
        
        lastError = result.stderr
      }
      
      return {
        success: false,
        stdout: '',
        stderr: lastError || 'Command failed after retries',
        exitCode: -1
      }
    } finally {
      this.releaseCommandSlot(serverId)
    }
  }

  async uploadFile(
    serverId: string,
    localPath: string,
    remotePath: string
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    if (!existsSync(localPath)) {
      return { success: false, message: `Local file not found: ${localPath}` }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }

        try {
          const fileContent = readFileSync(localPath)
          sftp.writeFile(remotePath, fileContent, (writeErr) => {
            if (writeErr) {
              log.error(`SFTP write error: ${writeErr.message}`)
              resolve({ success: false, message: writeErr.message })
            } else {
              log.info(`File uploaded to ${remotePath}`)
              resolve({ success: true, message: 'File uploaded successfully' })
            }
            sftp.end()
          })
        } catch (readErr) {
          const error = readErr as Error
          log.error(`File read error: ${error.message}`)
          resolve({ success: false, message: error.message })
          sftp.end()
        }
      })
    })
  }

  async uploadContent(
    serverId: string,
    content: string | Buffer,
    remotePath: string
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }

        try {
          // Buffer 直接写入以保持二进制完整性；字符串按 utf8 编码
          const payload = Buffer.isBuffer(content) ? content : Buffer.from(content)
          sftp.writeFile(remotePath, payload, (writeErr) => {
            if (writeErr) {
              log.error(`SFTP write error: ${writeErr.message}`)
              resolve({ success: false, message: writeErr.message })
            } else {
              log.info(`Content uploaded to ${remotePath}`)
              resolve({ success: true, message: 'Content uploaded successfully' })
            }
            sftp.end()
          })
        } catch (writeErr) {
          const error = writeErr as Error
          log.error(`SFTP write error: ${error.message}`)
          resolve({ success: false, message: error.message })
          sftp.end()
        }
      })
    })
  }

  /**
   * 执行长时间运行的命令并流式返回输出
   */
  async executeCommandStream(
    serverId: string,
    command: string,
    onData: (data: string) => void,
    onError: (data: string) => void,
    onClose: (code: number) => void
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    return new Promise((resolve) => {
      try {
        entry.client.exec(command, (err, stream) => {
          if (err) {
            resolve({ success: false, message: err.message })
            return
          }

          stream.on('data', (data: Buffer) => {
            onData(data.toString())
          })

          stream.stderr.on('data', (data: Buffer) => {
            onError(data.toString())
          })

          stream.on('close', (code: number) => {
            onClose(code)
          })

          resolve({ success: true, message: 'Stream started' })
        })
      } catch (err) {
        const error = err as Error
        resolve({ success: false, message: error.message })
      }
    })
  }

  /**
   * 通过 SFTP 流式上传大文件（适用于镜像包等大文件传输，避免整包读入内存）
   */
  async uploadFileStream(
    serverId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    if (!existsSync(localPath)) {
      return { success: false, message: `Local file not found: ${localPath}` }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }

        sftp.fastPut(localPath, remotePath, {
          step: (total: number, _chunk: number, fsize: number) => {
            if (fsize > 0) onProgress?.(Math.min(total, fsize), fsize)
          }
        }, (putErr) => {
          sftp.end()
          if (putErr) {
            log.error(`SFTP fastPut error: ${putErr.message}`)
            resolve({ success: false, message: putErr.message })
          } else {
            log.info(`File stream uploaded to ${remotePath}`)
            resolve({ success: true, message: 'File uploaded successfully' })
          }
        })
      })
    })
  }

  /**
   * 通过 SFTP 流式下载远端文件到本地（适用于镜像包等大文件传输）
   */
  async downloadFile(
    serverId: string,
    remotePath: string,
    localPath: string,
    onProgress?: (transferred: number, total: number) => void
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }

        sftp.fastGet(remotePath, localPath, {
          step: (total: number, _chunk: number, fsize: number) => {
            if (fsize > 0) onProgress?.(Math.min(total, fsize), fsize)
          }
        }, (getErr) => {
          sftp.end()
          if (getErr) {
            log.error(`SFTP fastGet error: ${getErr.message}`)
            resolve({ success: false, message: getErr.message })
          } else {
            log.info(`File downloaded from ${remotePath} to ${localPath}`)
            resolve({ success: true, message: 'File downloaded successfully' })
          }
        })
      })
    })
  }

  /**
   * 读取远端文件内容（UTF-8 文本，供查看/编辑）
   */
  async readRemoteFile(
    serverId: string,
    remotePath: string
  ): Promise<{ success: boolean; content?: string; message?: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }
        sftp.stat(remotePath, (statErr, stats) => {
          if (statErr) {
            sftp.end()
            resolve({ success: false, message: statErr.message })
            return
          }
          // 超 50MB 拒绝：避免大文件一次性读入内存导致卡顿/崩溃
          if (stats.size > 50 * 1024 * 1024) {
            sftp.end()
            resolve({ success: false, message: '文件超过 50MB，请使用终端处理' })
            return
          }
          sftp.readFile(remotePath, (readErr, data) => {
            sftp.end()
            if (readErr) {
              log.error(`SFTP readFile error: ${readErr.message}`)
              resolve({ success: false, message: readErr.message })
              return
            }
            try {
              resolve({ success: true, content: (data as Buffer).toString('utf-8') })
            } catch (e) {
              resolve({ success: false, message: (e as Error).message })
            }
          })
        })
      })
    })
  }

  /**
   * 列举远端目录（XFTP 式浏览）：返回名称/类型/大小/修改时间/权限
   */
  async listRemoteDir(
    serverId: string,
    remotePath: string
  ): Promise<{ success: boolean; entries?: RemoteDirEntry[]; message?: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }
        sftp.readdir(remotePath, (readErr, list) => {
          sftp.end()
          if (readErr) {
            log.error(`SFTP readdir error: ${readErr.message}`)
            resolve({ success: false, message: readErr.message })
            return
          }
          const entries: RemoteDirEntry[] = (list || [])
            .filter(x => x.filename && x.filename !== '.' && x.filename !== '..')
            .map(x => ({
              name: x.filename,
              type: x.attrs.isDirectory() ? 'dir' as const : x.attrs.isSymbolicLink() ? 'link' as const : 'file' as const,
              size: x.attrs.size || 0,
              mtime: Math.floor((x.attrs.mtime || 0)) * 1000,
              mode: x.attrs.mode || 0
            }))
          resolve({ success: true, entries })
        })
      })
    })
  }

  /**
   * 远端文件操作：新建目录 / 重命名 / 删除（文件 unlink，空目录 rmdir）
   */
  async remoteFileOp(
    serverId: string,
    op: 'mkdir' | 'rename' | 'delete',
    target: string,
    to?: string
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server' }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message })
          return
        }
        const done = (opErr: Error | undefined, okMsg: string) => {
          sftp.end()
          if (opErr) {
            log.error(`SFTP ${op} error: ${opErr.message}`)
            resolve({ success: false, message: opErr.message })
          } else {
            resolve({ success: true, message: okMsg })
          }
        }
        switch (op) {
          case 'mkdir':
            sftp.mkdir(target, (e) => done(e ?? undefined, '目录已创建'))
            break
          case 'rename':
            sftp.rename(target, to || '', (e) => done(e ?? undefined, '重命名成功'))
            break
          case 'delete':
            // 先尝试按目录删（仅空目录），失败再按文件删
            sftp.rmdir(target, (e1) => {
              if (e1) sftp.unlink(target, (e2) => done(e2 ?? undefined, '已删除'))
              else done(undefined, '已删除')
            })
            break
          default:
            sftp.end()
            resolve({ success: false, message: 'Unknown op' })
        }
      })
    })
  }

  /**
   * 递归上传本地目录/文件到远端（SFTP）。
   * 自动创建远端目录结构；onFile 在每个文件开始/完成时回调（用于前端进度展示）。
   */
  async uploadPathRecursive(
    serverId: string,
    localPath: string,
    remotePath: string,
    onFile?: (info: { local: string; remote: string; status: 'start' | 'done' | 'error'; message?: string }) => void
  ): Promise<{ success: boolean; message: string; fileCount: number }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server', fileCount: 0 }
    }
    if (!existsSync(localPath)) {
      return { success: false, message: `Local path not found: ${localPath}`, fileCount: 0 }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message, fileCount: 0 })
          return
        }

        let fileCount = 0
        let failed = 0
        let firstError: string | undefined

        const ensureRemoteDir = (dir: string): Promise<void> => {
          return new Promise((res) => {
            sftp.stat(dir, (statErr) => {
              if (!statErr) return res()
              // 目录不存在：递归确保父级后创建
              const parent = path.posix.dirname(dir)
              if (parent === dir) return res()
              ensureRemoteDir(parent).then(() => {
                sftp.mkdir(dir, (mkdirErr) => {
                  if (mkdirErr && !(mkdirErr as any).code?.includes('EXISTS')) {
                    log.warn(`SFTP mkdir ${dir}: ${mkdirErr.message}`)
                  }
                  res()
                })
              })
            })
          })
        }

        const uploadOne = (l: string, r: string): Promise<void> => {
          return new Promise((res) => {
            onFile?.({ local: l, remote: r, status: 'start' })
            sftp.fastPut(l, r, (putErr) => {
              if (putErr) {
                failed++
                if (!firstError) firstError = putErr.message
                onFile?.({ local: l, remote: r, status: 'error', message: putErr.message })
                log.error(`SFTP fastPut ${r}: ${putErr.message}`)
              } else {
                fileCount++
                onFile?.({ local: l, remote: r, status: 'done' })
              }
              res()
            })
          })
        }

        // 递归遍历本地目录
        const walk = async (localDir: string, remoteDir: string): Promise<void> => {
          let items
          try {
            items = await fsp.readdir(localDir, { withFileTypes: true })
          } catch (e) {
            failed++
            if (!firstError) firstError = (e as Error).message
            return
          }
          for (const item of items) {
            const l = path.join(localDir, item.name)
            const r = path.posix.join(remoteDir, item.name)
            if (item.isDirectory()) {
              await ensureRemoteDir(r)
              await walk(l, r)
            } else if (item.isFile()) {
              await uploadOne(l, r)
            }
          }
        }

        ensureRemoteDir(remotePath).then(async () => {
          const st = await fsp.stat(localPath)
          if (st.isDirectory()) {
            await walk(localPath, remotePath)
          } else {
            await uploadOne(localPath, remotePath)
          }
          sftp.end()
          resolve({ success: failed === 0, message: firstError || `上传完成，共 ${fileCount} 个文件`, fileCount })
        })
      })
    })
  }

  /**
   * 递归下载远端目录/文件到本地（SFTP）。
   * 自动创建本地目录结构；onFile 在每个文件开始/完成时回调。
   */
  async downloadPathRecursive(
    serverId: string,
    remotePath: string,
    localPath: string,
    onFile?: (info: { local: string; remote: string; status: 'start' | 'done' | 'error'; message?: string }) => void
  ): Promise<{ success: boolean; message: string; fileCount: number }> {
    const entry = this.connections.get(serverId)
    if (!entry || !entry.authenticated) {
      return { success: false, message: 'Not connected to server', fileCount: 0 }
    }

    return new Promise((resolve) => {
      entry.client.sftp((err, sftp) => {
        if (err) {
          log.error(`SFTP connection error: ${err.message}`)
          resolve({ success: false, message: err.message, fileCount: 0 })
          return
        }

        let fileCount = 0
        let failed = 0
        let firstError: string | undefined

        const ensureLocalDir = async (dir: string): Promise<void> => {
          await fsp.mkdir(dir, { recursive: true })
        }

        const downloadOne = (r: string, l: string): Promise<void> => {
          return new Promise((res) => {
            onFile?.({ local: l, remote: r, status: 'start' })
            sftp.fastGet(r, l, (getErr) => {
              if (getErr) {
                failed++
                if (!firstError) firstError = getErr.message
                onFile?.({ local: l, remote: r, status: 'error', message: getErr.message })
                log.error(`SFTP fastGet ${r}: ${getErr.message}`)
              } else {
                fileCount++
                onFile?.({ local: l, remote: r, status: 'done' })
              }
              res()
            })
          })
        }

        // 递归遍历远端目录
        const walk = async (remoteDir: string, localDir: string): Promise<void> => {
          const list: { filename: string; attrs: { isDirectory(): boolean } }[] = await new Promise((res) => {
            sftp.readdir(remoteDir, (readErr, items) => {
              if (readErr) {
                res([])
                return
              }
              res((items || []) as any)
            })
          })
          for (const item of list) {
            if (!item.filename || item.filename === '.' || item.filename === '..') continue
            const r = path.posix.join(remoteDir, item.filename)
            const l = path.join(localDir, item.filename)
            if (item.attrs.isDirectory()) {
              await ensureLocalDir(l)
              await walk(r, l)
            } else {
              await downloadOne(r, l)
            }
          }
        }

        sftp.stat(remotePath, async (statErr, st) => {
          if (statErr) {
            sftp.end()
            resolve({ success: false, message: statErr.message, fileCount: 0 })
            return
          }
          if (st.isDirectory()) {
            await ensureLocalDir(localPath)
            await walk(remotePath, localPath)
          } else {
            await ensureLocalDir(path.dirname(localPath))
            await downloadOne(remotePath, localPath)
          }
          sftp.end()
          resolve({ success: failed === 0, message: firstError || `下载完成，共 ${fileCount} 个文件`, fileCount })
        })
      })
    })
  }

  /**
   * 获取容器日志流
   */
  async getContainerLogs(
    serverId: string,
    containerId: string,
    options: { tail?: number; follow?: boolean; since?: string } = {},
    onData: (data: string) => void,
    onError: (data: string) => void,
    onClose: (code: number) => void
  ): Promise<{ success: boolean; message: string }> {
    const { tail = 100, follow = true, since } = options
    
    let command = `docker logs ${containerId}`
    if (tail > 0) command += ` --tail ${tail}`
    if (follow) command += ' -f'
    if (since) command += ` --since ${since}`
    command += ' --timestamps'

    return this.executeCommandStream(serverId, command, onData, onError, onClose)
  }

  getConnectedServers(): string[] {
    return Array.from(this.connections.keys())
  }

  getAllConnectionStatuses(): Map<string, 'online' | 'offline' | 'connecting'> {
    const statuses = new Map<string, 'online' | 'offline' | 'connecting'>()
    for (const [serverId, entry] of this.connections) {
      if (entry.authenticated) {
        statuses.set(serverId, 'online')
      } else {
        statuses.set(serverId, 'connecting')
      }
    }
    return statuses
  }

  disconnectAll(): void {
    for (const serverId of this.connections.keys()) {
      this.disconnect(serverId)
    }
  }
}

export const sshService = new SSHService()

export function generateId(): string {
  return randomUUID()
}

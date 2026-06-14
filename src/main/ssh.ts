import { Client, ConnectConfig } from 'ssh2'
import log from 'electron-log'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'

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
}

class SSHService {
  private connections: Map<string, ConnectionEntry> = new Map()
  private connectionTimeout = 30000
  private maxConcurrentCommands = 5
  private commandQueues: Map<string, Array<() => void>> = new Map()
  private activeCommands: Map<string, number> = new Map()

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
        authenticated: false
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

        const keepAliveTimer = setInterval(() => {
          if (entry.authenticated) {
            client.end()
            this.disconnect(serverId)
          }
        }, 3600000)
        entry.keepAliveTimer = keepAliveTimer

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
        this.connections.delete(serverId)
      })

      client.on('end', () => {
        log.info(`SSH connection ended for ${config.host}`)
        this.connections.delete(serverId)
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
      if (entry.keepAliveTimer) {
        clearInterval(entry.keepAliveTimer)
      }
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
    const entry = this.connections.get(serverId)
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
    content: string,
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
          sftp.writeFile(remotePath, Buffer.from(content), (writeErr) => {
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

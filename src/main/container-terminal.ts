import { Client } from 'ssh2'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { randomUUID } from 'crypto'
import { sshService } from './ssh'

interface TerminalSession {
  sessionId: string
  serverId: string
  containerId: string
  client: Client
  stream: any
  cols: number
  rows: number
  createdAt: Date
  shell: string
}

class ContainerTerminalService {
  private sessions: Map<string, TerminalSession> = new Map()
  private readonly DEFAULT_SHELL = '/bin/bash'
  private readonly FALLBACK_SHELL = '/bin/sh'

  /**
   * 获取主窗口用于发送事件
   */
  private getMainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows()
    return windows.length > 0 ? windows[0] : null
  }

  /**
   * 向渲染进程发送终端数据
   */
  private sendToRenderer(channel: string, ...args: any[]): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  /**
   * 打开一个终端会话，通过 docker exec 进入容器
   */
  openTerminal(
    serverId: string,
    containerId: string,
    cols: number = 80,
    rows: number = 24
  ): Promise<{ success: boolean; sessionId?: string; message?: string }> {
    return new Promise((resolve) => {
      // 检查 SSH 连接是否存在
      if (!sshService.isConnected(serverId)) {
        resolve({ success: false, message: 'SSH connection not established' })
        return
      }

      const sessionId = randomUUID()

      // 先尝试使用 bash，如果失败则使用 sh
      const tryOpenShell = (shell: string) => {
        const command = `docker exec -it ${containerId} ${shell}`

        // 获取 SSH 连接的底层 client
        const sshClient = (sshService as any).connections.get(serverId)?.client
        if (!sshClient) {
          resolve({ success: false, message: 'SSH client not found' })
          return
        }

        const client = new Client()

        client.on('ready', () => {
          // 设置伪终端并执行 docker exec
          client.exec(
            command,
            { pty: { term: 'xterm-256color', cols, rows } },
            (err, stream) => {
              if (err) {
                log.error(`Terminal exec error: ${err.message}`)
                client.end()

                // 如果 bash 失败，尝试 sh
                if (shell === this.DEFAULT_SHELL) {
                  log.info('Falling back to /bin/sh')
                  tryOpenShell(this.FALLBACK_SHELL)
                  return
                }

                resolve({ success: false, message: err.message })
                return
              }

              const session: TerminalSession = {
                sessionId,
                serverId,
                containerId,
                client,
                stream,
                cols,
                rows,
                createdAt: new Date(),
                shell
              }

              // 监听容器输出数据并转发到渲染进程
              stream.on('data', (data: Buffer) => {
                this.sendToRenderer('terminal:data', sessionId, data.toString('utf-8'))
              })

              stream.stderr.on('data', (data: Buffer) => {
                this.sendToRenderer('terminal:data', sessionId, data.toString('utf-8'))
              })

              stream.on('close', () => {
                this.sendToRenderer('terminal:close', sessionId)
                this.sessions.delete(sessionId)
                log.info(`Terminal stream closed: ${sessionId}`)
              })

              stream.on('error', (err: Error) => {
                this.sendToRenderer('terminal:error', sessionId, err.message)
                log.error(`Terminal stream error for ${sessionId}: ${err.message}`)
              })

              this.sessions.set(sessionId, session)
              log.info(`Terminal session opened: ${sessionId} for container ${containerId}`)

              resolve({ success: true, sessionId })
            }
          )
        })

        client.on('error', (err) => {
          log.error(`Terminal SSH error: ${err.message}`)
          if (shell === this.DEFAULT_SHELL) {
            log.info('Falling back to /bin/sh due to SSH error')
            tryOpenShell(this.FALLBACK_SHELL)
            return
          }
          resolve({ success: false, message: err.message })
        })

        // 复用已有 SSH 连接的配置
        const sshConfig = this.getSSHConfig(serverId)
        if (sshConfig) {
          client.connect(sshConfig)
        } else {
          resolve({ success: false, message: 'Cannot get SSH config' })
        }
      }

      tryOpenShell(this.DEFAULT_SHELL)
    })
  }

  /**
   * 获取 SSH 连接配置
   */
  private getSSHConfig(serverId: string): any {
    const connections = (sshService as any).connections as Map<string, any>
    const entry = connections.get(serverId)
    if (!entry) return null
    return entry.connectConfig || null
  }

  /**
   * 向终端写入数据（用户输入）
   */
  writeToTerminal(sessionId: string, data: string): { success: boolean; message?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: false, message: 'Session not found' }
    }

    try {
      session.stream.write(data)
      return { success: true }
    } catch (err) {
      log.error(`Write to terminal error: ${(err as Error).message}`)
      return { success: false, message: (err as Error).message }
    }
  }

  /**
   * 调整终端大小
   */
  resizeTerminal(sessionId: string, cols: number, rows: number): { success: boolean; message?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: false, message: 'Session not found' }
    }

    try {
      session.cols = cols
      session.rows = rows
      session.stream.setWindow(rows, cols)
      return { success: true }
    } catch (err) {
      log.error(`Resize terminal error: ${(err as Error).message}`)
      return { success: false, message: (err as Error).message }
    }
  }

  /**
   * 关闭终端会话
   */
  closeTerminal(sessionId: string): { success: boolean; message?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: false, message: 'Session not found' }
    }

    try {
      // 发送 exit 命令退出 shell
      try {
        session.stream.write('exit\n')
      } catch (e) {
        // ignore
      }

      session.stream.end()
      session.client.end()
      this.sessions.delete(sessionId)
      log.info(`Terminal session closed: ${sessionId}`)
      return { success: true }
    } catch (err) {
      log.error(`Close terminal error: ${(err as Error).message}`)
      // 即使出错也删除会话
      this.sessions.delete(sessionId)
      return { success: false, message: (err as Error).message }
    }
  }

  /**
   * 获取终端会话的 stream 用于数据监听
   */
  getSessionStream(sessionId: string): any | null {
    const session = this.sessions.get(sessionId)
    return session ? session.stream : null
  }

  /**
   * 获取会话信息
   */
  getSession(sessionId: string): TerminalSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * 获取所有活跃会话
   */
  getAllSessions(): Array<{ sessionId: string; serverId: string; containerId: string; shell: string; createdAt: Date }> {
    const result = []
    for (const [sessionId, session] of this.sessions) {
      result.push({
        sessionId,
        serverId: session.serverId,
        containerId: session.containerId,
        shell: session.shell,
        createdAt: session.createdAt
      })
    }
    return result
  }

  /**
   * 关闭所有终端会话
   */
  closeAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeTerminal(sessionId)
    }
  }

  /**
   * 设置 SSH 配置（用于终端连接复用）
   */
  setSSHConfigForServer(serverId: string, config: any): void {
    const connections = (sshService as any).connections as Map<string, any>
    const entry = connections.get(serverId)
    if (entry) {
      entry.connectConfig = config
    }
  }
}

export const containerTerminalService = new ContainerTerminalService()

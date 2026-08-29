import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import log from 'electron-log'
import type { Server, ServerFormData, ServerStatus } from '../types/server'

interface ServerContextType {
  servers: Server[]
  loading: boolean
  error: string | null
  refreshServers: () => Promise<Server[]>
  addServer: (server: ServerFormData) => Promise<Server>
  updateServer: (id: string, server: Partial<ServerFormData>) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  connectServer: (server: Server) => Promise<{ success: boolean; message: string }>
  disconnectServer: (serverId: string) => Promise<void>
  executeCommand: (serverId: string, command: string) => Promise<{
    success: boolean
    stdout: string
    stderr: string
    exitCode: number
  }>
  getServerById: (id: string) => Server | undefined
}

const ServerContext = createContext<ServerContextType | undefined>(undefined)

export function ServerProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoReconnecting, setAutoReconnecting] = useState(false)

  const refreshServers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.electronAPI.server.getAll()
      setServers(data)
      return data
    } catch (err) {
      const error = err as Error
      setError(error.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // 连接失败自动重试：5s/10s/15s 逐级退避，最多 MAX_AUTO_RETRY 次
  const MAX_AUTO_RETRY = 3
  const retryTimersRef = useRef<Map<string, number>>(new Map())

  const scheduleRetry = (server: Server, attempt: number) => {
    const timer = window.setTimeout(() => {
      retryTimersRef.current.delete(server.id)
      tryConnectServer(server, attempt + 1)
    }, 5000 * (attempt + 1))
    retryTimersRef.current.set(server.id, timer)
  }

  const tryConnectServer = useCallback(async (server: Server, attempt: number) => {
    setServers(prev => prev.map(s =>
      s.id === server.id ? { ...s, status: 'connecting' as const } : s
    ))
    try {
      const result = await window.electronAPI.server.connect(server)
      if (result.success) {
        setServers(prev => prev.map(s =>
          s.id === server.id ? { ...s, status: 'online' as const } : s
        ))
      } else if (attempt < MAX_AUTO_RETRY) {
        log.warn(`[ServerContext] 连接失败，${5000 * (attempt + 1) / 1000}s 后自动重试(${server.name}): ${result.message}`)
        scheduleRetry(server, attempt)
      } else {
        setServers(prev => prev.map(s =>
          s.id === server.id ? { ...s, status: 'offline' as const } : s
        ))
      }
    } catch (err) {
      const e = err as Error
      if (attempt < MAX_AUTO_RETRY) {
        log.warn(`[ServerContext] 连接异常，将自动重试(${server.name}): ${e.message}`)
        scheduleRetry(server, attempt)
      } else {
        setServers(prev => prev.map(s =>
          s.id === server.id ? { ...s, status: 'offline' as const } : s
        ))
      }
    }
  }, [])

  // 启动自动重连（仅在 tryConnectServer 定义之后声明，避免 TDZ）
  const autoReconnectServers = useCallback(async () => {
    setAutoReconnecting(true)
    try {
      const serversData = await refreshServers()

      for (const server of serversData) {
        if (server.status === 'online') {
          // 连接失败自动重试（指数退避），无需用户手动再连
          await tryConnectServer(server, 0)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } catch (err) {
      log.error('Auto reconnect error:', err)
    } finally {
      setAutoReconnecting(false)
    }
  }, [refreshServers, tryConnectServer])

  // 卸载时清理重试定时器
  useEffect(() => {
    return () => {
      retryTimersRef.current.forEach(t => clearTimeout(t))
      retryTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    autoReconnectServers()
  }, [autoReconnectServers])

  const addServer = useCallback(async (serverData: ServerFormData): Promise<Server> => {
    const server = await window.electronAPI.server.create(serverData)
    setServers(prev => [server, ...prev])
    return server
  }, [])

  const updateServer = useCallback(async (id: string, serverData: Partial<ServerFormData>): Promise<void> => {
    await window.electronAPI.server.update(id, serverData)
    setServers(prev => prev.map(s => s.id === id ? { ...s, ...serverData } : s))
  }, [])

  const deleteServer = useCallback(async (id: string): Promise<void> => {
    await window.electronAPI.server.delete(id)
    setServers(prev => prev.filter(s => s.id !== id))
  }, [])

  const connectServer = useCallback(async (server: Server): Promise<{ success: boolean; message: string }> => {
    setServers(prev => prev.map(s =>
      s.id === server.id ? { ...s, status: 'connecting' as const } : s
    ))

    try {
      const result = await window.electronAPI.server.connect(server)
      setServers(prev => prev.map(s =>
        s.id === server.id
          ? { ...s, status: result.success ? 'online' as const : 'error' as const }
          : s
      ))
      return result
    } catch (err) {
      const error = err as Error
      setServers(prev => prev.map(s =>
        s.id === server.id ? { ...s, status: 'error' as const } : s
      ))
      return { success: false, message: error.message }
    }
  }, [])

  const disconnectServer = useCallback(async (serverId: string): Promise<void> => {
    await window.electronAPI.server.disconnect(serverId)
    setServers(prev => prev.map(s =>
      s.id === serverId ? { ...s, status: 'offline' as const } : s
    ))
  }, [])

  const executeCommand = useCallback(async (serverId: string, command: string) => {
    return window.electronAPI.server.executeCommand(serverId, command)
  }, [])

  const getServerById = useCallback((id: string): Server | undefined => {
    return servers.find(s => s.id === id)
  }, [servers])

  const value: ServerContextType = {
    servers,
    loading,
    error,
    refreshServers,
    addServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    executeCommand,
    getServerById
  }

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  )
}

export function useServers(): ServerContextType {
  const context = useContext(ServerContext)
  if (context === undefined) {
    throw new Error('useServers must be used within a ServerProvider')
  }
  return context
}

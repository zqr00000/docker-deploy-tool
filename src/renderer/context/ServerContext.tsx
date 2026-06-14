import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import log from 'electron-log'
import type { Server, ServerFormData, ServerStatus } from '../types/server'

interface ServerContextType {
  servers: Server[]
  loading: boolean
  error: string | null
  refreshServers: () => Promise<void>
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

  const autoReconnectServers = useCallback(async () => {
    setAutoReconnecting(true)
    try {
      const serversData = await refreshServers()
      
      for (const server of serversData) {
        if (server.status === 'online') {
          setServers(prev => prev.map(s =>
            s.id === server.id ? { ...s, status: 'connecting' as const } : s
          ))
          
          try {
            const result = await window.electronAPI.server.connect(server)
            setServers(prev => prev.map(s =>
              s.id === server.id
                ? { ...s, status: result.success ? 'online' as const : 'offline' as const }
                : s
            ))
          } catch {
            setServers(prev => prev.map(s =>
              s.id === server.id ? { ...s, status: 'offline' as const } : s
            ))
          }
          
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } catch (err) {
      log.error('Auto reconnect error:', err)
    } finally {
      setAutoReconnecting(false)
    }
  }, [refreshServers])

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

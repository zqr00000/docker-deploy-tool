export type AuthType = 'password' | 'key'
export type ServerStatus = 'online' | 'offline' | 'connecting' | 'error'

export interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  password?: string
  privateKey?: string
  status: ServerStatus
  createdAt: string
  updatedAt: string
}

export interface ServerFormData {
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  password?: string
  privateKey?: string
}

export interface ServerConnectionResult {
  success: boolean
  message: string
}

export interface CommandExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export interface ServerConnectionInfo {
  serverId: string
  status: ServerStatus
  connectedAt?: string
  error?: string
}

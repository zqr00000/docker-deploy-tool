import type { App } from './electron-api'

// App 的规范定义在 ./electron-api（与 preload 共享的单一来源），此处仅 re-export
export type { App } from './electron-api'

export type AppStatus = 'stopped' | 'running' | 'deploying' | 'error'

export interface AppFormData {
  name: string
  serverId: string
  templateId?: string
  dockerCompose?: string
  projectPath?: string
}

export interface DeployOptions {
  serverId: string
  appName: string
  dockerCompose: string
  projectPath: string
}

export interface DeployResult {
  success: boolean
  app?: App
  message: string
  containerIds?: string[]
}

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  ports: string[]
  created: string
}

export interface ContainerStats {
  containerId: string
  containerName: string
  cpuPercent: number
  memoryUsage: string
  memoryLimit: string
  memoryPercent: number
  networkIO: string
  blockIO: string
  pids: number
}

export interface AppWithServer extends App {
  serverName?: string
  templateName?: string
}

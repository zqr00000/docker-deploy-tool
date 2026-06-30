import { contextBridge, ipcRenderer } from 'electron'

export interface ServerFormData {
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
}

export interface Server extends ServerFormData {
  id: string
  status: 'online' | 'offline' | 'connecting' | 'error'
  createdAt: string
  updatedAt: string
}

export interface DockerCheckResult {
  dockerInstalled: boolean
  dockerRunning: boolean
  dockerVersion: string
  composeInstalled: boolean
  composeVersion: string
  error?: string
}

export interface EnvVariableSchema {
  name: string
  defaultValue?: string
  description?: string
  required?: boolean
}

export interface Template {
  id: string
  name: string
  description: string
  category: 'web' | 'database' | 'cache' | 'cms' | 'app'
  dockerCompose: string
  isBuiltIn: boolean
  envSchema: EnvVariableSchema[]
  createdAt: string
}

export interface TemplateFormData {
  name: string
  description: string
  category: 'web' | 'database' | 'cache' | 'cms' | 'app'
  dockerCompose: string
  envSchema: EnvVariableSchema[]
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

export interface App {
  id: string
  name: string
  serverId: string
  templateId: string
  projectPath: string
  status: 'running' | 'stopped' | 'deploying' | 'error'
  containerIds: string
  createdAt: string
  updatedAt: string
}

export interface EnvVariable {
  name: string
  value: string
}

export interface DeployOptions {
  serverId: string
  appName: string
  dockerCompose: string
  projectPath: string
  templateId?: string
  envVariables?: EnvVariable[]
}

export interface DeployResult {
  success: boolean
  appId?: string
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

export interface SystemInfo {
  osName: string
  osVersion: string
  kernel: string
  architecture: string
  hostname: string
  uptime: string
}

export interface HardwareInfo {
  cpuCores: number
  cpuModel: string
  memoryTotal: string
  memoryUsed: string
  memoryPercent: number
  diskTotal: string
  diskUsed: string
  diskPercent: number
}

export interface NetworkInfo {
  hostname: string
  ipAddresses: string[]
  internetConnected: boolean
}

export interface PortInfo {
  port: number
  service: string
  isOpen: boolean
}

export interface DebugLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  context?: Record<string, unknown>
}

export interface SystemCheckResult {
  systemInfo: SystemInfo | null
  hardwareInfo: HardwareInfo | null
  networkInfo: NetworkInfo | null
  requiredPorts: PortInfo[]
  networkOk: boolean
  systemOk: boolean
  hardwareOk: boolean
  dockerOk: boolean
  error?: string
}

export interface HardwareRequirements {
  minMemoryGB?: number
  minDiskGB?: number
  minCpuCores?: number
  requiredPorts?: number[]
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

export interface ElectronAPI {
  getAppVersion: () => Promise<string>
  getAppName: () => Promise<string>
  platform: string
  arch: string
  server: {
    getAll: () => Promise<Server[]>
    getById: (id: string) => Promise<Server | undefined>
    create: (server: ServerFormData) => Promise<Server>
    update: (id: string, server: Partial<ServerFormData>) => Promise<void>
    delete: (id: string) => Promise<void>
    connect: (server: Server) => Promise<ServerConnectionResult>
    disconnect: (serverId: string) => Promise<void>
    executeCommand: (serverId: string, command: string) => Promise<CommandExecutionResult>
    getConnectionStatus: (serverId: string) => Promise<'online' | 'offline' | 'connecting'>
    checkDockerEnvironment: (serverId: string) => Promise<DockerCheckResult>
    checkSystemEnvironment: (serverId: string, requirements?: HardwareRequirements) => Promise<SystemCheckResult>
    getSystemInfo: (serverId: string) => Promise<SystemInfo | null>
    getHardwareInfo: (serverId: string) => Promise<HardwareInfo | null>
    getNetworkInfo: (serverId: string) => Promise<NetworkInfo | null>
    openPort: (serverId: string, port: number) => Promise<boolean>
  }
  template: {
    getAll: () => Promise<Template[]>
    getById: (id: string) => Promise<Template | undefined>
    create: (template: TemplateFormData) => Promise<Template>
    update: (id: string, template: Partial<TemplateFormData>) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  app: {
    getAll: () => Promise<App[]>
    getById: (id: string) => Promise<App | undefined>
    getByServerId: (serverId: string) => Promise<App[]>
    create: (app: Partial<App>) => Promise<App>
    update: (id: string, app: Partial<App>) => Promise<void>
    delete: (id: string) => Promise<void>
    deploy: (options: DeployOptions) => Promise<DeployResult>
    start: (appId: string) => Promise<{ success: boolean; message: string }>
    stop: (appId: string) => Promise<{ success: boolean; message: string }>
    restart: (appId: string) => Promise<{ success: boolean; message: string }>
    updateCompose: (appId: string, dockerCompose?: string) => Promise<{ success: boolean; message: string }>
    getContainers: (serverId: string, projectPath: string) => Promise<ContainerInfo[]>
    getLogs: (serverId: string, projectPath: string, lines?: number) => Promise<string>
    getContainerStats: (serverId: string, containerId: string) => Promise<ContainerStats | null>
    getContainerStatsByProject: (serverId: string, projectPath: string) => Promise<ContainerStats[]>
    getContainerLogs: (serverId: string, containerId: string, lines?: number) => Promise<string>
    startContainer: (serverId: string, containerId: string) => Promise<{ success: boolean; message: string }>
    stopContainer: (serverId: string, containerId: string) => Promise<{ success: boolean; message: string }>
    restartContainer: (serverId: string, containerId: string) => Promise<{ success: boolean; message: string }>
  }
}

const electronAPI: ElectronAPI = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getAppName: (): Promise<string> => ipcRenderer.invoke('app:name'),

  platform: process.platform,
  arch: process.arch,

  server: {
    getAll: (): Promise<Server[]> => ipcRenderer.invoke('server:getAll'),
    getById: (id: string): Promise<Server | undefined> => ipcRenderer.invoke('server:getById', id),
    create: (server: ServerFormData): Promise<Server> => ipcRenderer.invoke('server:create', server),
    update: (id: string, server: Partial<ServerFormData>): Promise<void> => ipcRenderer.invoke('server:update', id, server),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('server:delete', id),
    connect: (server: Server): Promise<ServerConnectionResult> => ipcRenderer.invoke('server:connect', server),
    disconnect: (serverId: string): Promise<void> => ipcRenderer.invoke('server:disconnect', serverId),
    executeCommand: (serverId: string, command: string): Promise<CommandExecutionResult> => ipcRenderer.invoke('server:executeCommand', serverId, command),
    getConnectionStatus: (serverId: string): Promise<'online' | 'offline' | 'connecting'> => ipcRenderer.invoke('server:getConnectionStatus', serverId),
    checkDockerEnvironment: (serverId: string): Promise<DockerCheckResult> => ipcRenderer.invoke('server:checkDockerEnvironment', serverId),
    checkSystemEnvironment: (serverId: string, requirements?: HardwareRequirements): Promise<SystemCheckResult> => ipcRenderer.invoke('server:checkSystemEnvironment', serverId, requirements),
    getSystemInfo: (serverId: string): Promise<SystemInfo | null> => ipcRenderer.invoke('server:getSystemInfo', serverId),
    getHardwareInfo: (serverId: string): Promise<HardwareInfo | null> => ipcRenderer.invoke('server:getHardwareInfo', serverId),
    getNetworkInfo: (serverId: string): Promise<NetworkInfo | null> => ipcRenderer.invoke('server:getNetworkInfo', serverId),
    openPort: (serverId: string, port: number): Promise<boolean> => ipcRenderer.invoke('server:openPort', serverId, port)
  },

  template: {
    getAll: (): Promise<Template[]> => ipcRenderer.invoke('template:getAll'),
    getById: (id: string): Promise<Template | undefined> => ipcRenderer.invoke('template:getById', id),
    create: (template: TemplateFormData): Promise<Template> => ipcRenderer.invoke('template:create', template),
    update: (id: string, template: Partial<TemplateFormData>): Promise<void> => ipcRenderer.invoke('template:update', id, template),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('template:delete', id)
  },

  app: {
    getAll: (): Promise<App[]> => ipcRenderer.invoke('app:getAll'),
    getById: (id: string): Promise<App | undefined> => ipcRenderer.invoke('app:getById', id),
    getByServerId: (serverId: string): Promise<App[]> => ipcRenderer.invoke('app:getByServerId', serverId),
    create: (app: Partial<App>): Promise<App> => ipcRenderer.invoke('app:create', app),
    update: (id: string, app: Partial<App>): Promise<void> => ipcRenderer.invoke('app:update', id, app),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('app:delete', id),
    deploy: (options: DeployOptions): Promise<DeployResult> => ipcRenderer.invoke('app:deploy', options),
    start: (appId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:start', appId),
    stop: (appId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:stop', appId),
    restart: (appId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:restart', appId),
    updateCompose: (appId: string, dockerCompose?: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:updateCompose', appId, dockerCompose),
    getContainers: (serverId: string, projectPath: string): Promise<ContainerInfo[]> => ipcRenderer.invoke('app:getContainers', serverId, projectPath),
    getLogs: (serverId: string, projectPath: string, lines?: number): Promise<string> => ipcRenderer.invoke('app:getLogs', serverId, projectPath, lines),
    getContainerStats: (serverId: string, containerId: string): Promise<ContainerStats | null> => ipcRenderer.invoke('app:getContainerStats', serverId, containerId),
    getContainerStatsByProject: (serverId: string, projectPath: string): Promise<ContainerStats[]> => ipcRenderer.invoke('app:getContainerStatsByProject', serverId, projectPath),
    getContainerLogs: (serverId: string, containerId: string, lines?: number): Promise<string> => ipcRenderer.invoke('app:getContainerLogs', serverId, containerId, lines),
    startContainer: (serverId: string, containerId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:startContainer', serverId, containerId),
    stopContainer: (serverId: string, containerId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:stopContainer', serverId, containerId),
    restartContainer: (serverId: string, containerId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:restartContainer', serverId, containerId)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

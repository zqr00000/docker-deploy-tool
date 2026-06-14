import type { Template, TemplateFormData, Server, ServerFormData, App, DeployOptions, DeployResult, ContainerInfo, ContainerStats, SystemInfo, HardwareInfo, NetworkInfo, PortInfo, SystemCheckResult, HardwareRequirements } from '../preload/index'

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
    connect: (server: Server) => Promise<{ success: boolean; message: string }>
    disconnect: (serverId: string) => Promise<void>
    executeCommand: (serverId: string, command: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
    getConnectionStatus: (serverId: string) => Promise<'online' | 'offline' | 'connecting'>
    checkDockerEnvironment: (serverId: string) => Promise<{ dockerInstalled: boolean; dockerRunning: boolean; dockerVersion: string; composeInstalled: boolean; composeVersion: string; error?: string }>
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

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}

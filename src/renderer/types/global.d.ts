import type { Template, TemplateFormData, Server, ServerFormData, App, DeployOptions, DeployResult, ContainerInfo, ContainerStats, SystemInfo, HardwareInfo, NetworkInfo, PortInfo, SystemCheckResult, HardwareRequirements, ConfigImportResult, DialogResult, DockerImage, VolumeInfo, VolumeDetail, PruneResult, AuditLogRow, AuditLogFilter, AuditLogResult, TerminalSession, DockerNetworkInfo, DockerNetworkDetail, DockerNetworkCreateOptions, DockerNetworkPruneResult, ResourceMetricRow, ResourceMetricsQuery, MetricsSummary, ResourceMetricsResult, DeployHistoryRecord, RollbackResult, ServerGroup, BatchDeployOptions, BatchDeployResult, BatchOperationResult, ServerStatusInfo, AlertRule, AlertRuleFormData, AlertHistoryEntry, AlertStats, ScheduledTask, ScheduledTaskFormData, ContainerHealthStatus, AppHealthStatus, HealthCheckConfig, HealthCheckConfigFormData, HealthCheckHistoryRecord, HealthCheckReport } from '../preload/index'

// Re-export types for use in renderer process
export type {
  Template,
  TemplateFormData,
  Server,
  ServerFormData,
  App,
  DeployOptions,
  DeployResult,
  ContainerInfo,
  ContainerStats,
  SystemInfo,
  HardwareInfo,
  NetworkInfo,
  PortInfo,
  SystemCheckResult,
  HardwareRequirements,
  ConfigImportResult,
  DialogResult,
  DockerImage,
  VolumeInfo,
  VolumeDetail,
  PruneResult,
  AuditLogRow,
  AuditLogFilter,
  AuditLogResult,
  TerminalSession,
  DockerNetworkInfo,
  DockerNetworkDetail,
  DockerNetworkCreateOptions,
  DockerNetworkPruneResult,
  ResourceMetricRow,
  ResourceMetricsQuery,
  MetricsSummary,
  ResourceMetricsResult,
  DeployHistoryRecord,
  RollbackResult,
  ServerGroup,
  BatchDeployOptions,
  BatchDeployResult,
  BatchOperationResult,
  ServerStatusInfo,
  AlertRule,
  AlertRuleFormData,
  AlertHistoryEntry,
  AlertStats,
  ScheduledTask,
  ScheduledTaskFormData,
  ContainerHealthStatus,
  AppHealthStatus,
  HealthCheckConfig,
  HealthCheckConfigFormData,
  HealthCheckHistoryRecord,
  HealthCheckReport
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
    installDependencies: (serverId: string, options: { docker?: boolean; compose?: boolean }) => Promise<{ success: boolean; message: string }>
    uploadOfflinePackage: (serverId: string, fileName: string, content: string) => Promise<{ success: boolean; message: string }>
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
    removeContainer: (serverId: string, containerId: string) => Promise<{ success: boolean; message: string }>
  }
  config: {
    exportConfig: (filePath: string) => Promise<{ success: boolean; message: string }>
    importConfig: (filePath: string) => Promise<ConfigImportResult>
    showSaveDialog: () => Promise<DialogResult>
    showOpenDialog: () => Promise<DialogResult>
  }
  image: {
    getAll: (serverId: string) => Promise<DockerImage[]>
    pull: (serverId: string, imageName: string) => Promise<{ success: boolean; message: string }>
    remove: (serverId: string, imageId: string) => Promise<{ success: boolean; message: string }>
    prune: (serverId: string) => Promise<PruneResult>
    getInfo: (serverId: string, imageId: string) => Promise<string>
  }
  volume: {
    getAll: (serverId: string) => Promise<VolumeInfo[]>
    create: (serverId: string, name: string, driver?: string, labels?: Record<string, string>, options?: Record<string, string>) => Promise<{ success: boolean; message: string }>
    remove: (serverId: string, name: string, force?: boolean) => Promise<{ success: boolean; message: string }>
    prune: (serverId: string, force?: boolean, all?: boolean) => Promise<PruneResult>
    getInfo: (serverId: string, name: string) => Promise<VolumeDetail | null>
    getSize: (serverId: string, name: string) => Promise<string>
  }
  network: {
    getAll: (serverId: string) => Promise<DockerNetworkInfo[]>
    create: (serverId: string, options: DockerNetworkCreateOptions) => Promise<{ success: boolean; message: string; networkId?: string }>
    remove: (serverId: string, networkId: string) => Promise<{ success: boolean; message: string }>
    getInfo: (serverId: string, networkId: string) => Promise<DockerNetworkDetail | null>
    connect: (serverId: string, networkId: string, containerId: string, ip?: string, ipv6?: string, aliases?: string[]) => Promise<{ success: boolean; message: string }>
    disconnect: (serverId: string, networkId: string, containerId: string, force?: boolean) => Promise<{ success: boolean; message: string }>
    prune: (serverId: string, force?: boolean) => Promise<DockerNetworkPruneResult>
    getContainers: (serverId: string) => Promise<Array<{ id: string; name: string; status: string }>>
  }
  terminal: {
    open: (serverId: string, containerId: string, cols?: number, rows?: number) => Promise<{ success: boolean; sessionId?: string; message?: string }>
    write: (sessionId: string, data: string) => Promise<{ success: boolean; message?: string }>
    resize: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; message?: string }>
    close: (sessionId: string) => Promise<{ success: boolean; message?: string }>
    getAllSessions: () => Promise<TerminalSession[]>
    onData: (callback: (sessionId: string, data: string) => void) => void
    onClose: (callback: (sessionId: string) => void) => void
    onError: (callback: (sessionId: string, error: string) => void) => void
  }
  alertRule: {
    getAll: () => Promise<AlertRule[]>
    getById: (id: string) => Promise<AlertRule | undefined>
    create: (rule: AlertRuleFormData) => Promise<AlertRule>
    update: (id: string, updates: Partial<AlertRuleFormData>) => Promise<AlertRule | undefined>
    delete: (id: string) => Promise<void>
    toggle: (id: string, enabled: boolean) => Promise<AlertRule | undefined>
  }
  alertHistory: {
    getAll: (limit?: number) => Promise<AlertHistoryEntry[]>
    getActive: () => Promise<AlertHistoryEntry[]>
    resolve: (id: string) => Promise<{ success: boolean }>
    resolveAll: () => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean }>
    clear: () => Promise<{ success: boolean }>
    cleanup: (days?: number) => Promise<{ success: boolean; deleted: number }>
  }
  alert: {
    getStats: () => Promise<AlertStats>
    getActiveAlerts: () => Promise<AlertHistoryEntry[]>
  }
  auditLog: {
    query: (filter: AuditLogFilter) => Promise<AuditLogResult>
    getAll: (options?: { limit?: number }) => Promise<AuditLogResult>
    getActions: () => Promise<string[]>
    getTargetTypes: () => Promise<string[]>
    exportCSV: (filter: AuditLogFilter) => Promise<{ success: boolean; message: string }>
    cleanup: (days?: number) => Promise<{ success: boolean; deleted: number }>
    clear: () => Promise<{ success: boolean }>
  }
  logs: {
    start: (serverId: string, containerId: string, options?: { tail?: number; follow?: boolean }) => Promise<{ success: boolean; message?: string }>
    stop: (serverId: string, containerId: string) => Promise<{ success: boolean }>
    onData: (callback: (streamId: string, data: string) => void) => void
    onError: (callback: (streamId: string, error: string) => void) => void
    onClose: (callback: (streamId: string, code: number) => void) => void
  }
  deployHistory: {
    getByAppId: (appId: string) => Promise<DeployHistoryRecord[]>
    getAll: () => Promise<DeployHistoryRecord[]>
    getById: (id: string) => Promise<DeployHistoryRecord | undefined>
    rollback: (historyId: string) => Promise<RollbackResult>
    compare: (historyId1: string, historyId2: string) => Promise<{ version1: number; version2: number; compose1: string; compose2: string } | null>
  }
  serverGroup: {
    getAll: () => Promise<ServerGroup[]>
    getById: (id: string) => Promise<ServerGroup | undefined>
    create: (group: { name: string; description?: string }) => Promise<ServerGroup>
    update: (id: string, updates: Partial<{ name: string; description: string }>) => Promise<void>
    delete: (id: string) => Promise<void>
    getServers: (groupId: string) => Promise<Server[]>
    addServer: (groupId: string, serverId: string) => Promise<{ success: boolean; message?: string }>
    removeServer: (groupId: string, serverId: string) => Promise<{ success: boolean; message?: string }>
    getServerGroups: (serverId: string) => Promise<ServerGroup[]>
  }
  batch: {
    deploy: (options: BatchDeployOptions) => Promise<BatchDeployResult>
    start: (appIds: string[]) => Promise<BatchOperationResult>
    stop: (appIds: string[]) => Promise<BatchOperationResult>
    restart: (appIds: string[]) => Promise<BatchOperationResult>
    getServerStatuses: (serverIds: string[]) => Promise<ServerStatusInfo[]>
    getAllServerStatuses: () => Promise<ServerStatusInfo[]>
  }
  scheduledTask: {
    getAll: () => Promise<ScheduledTask[]>
    getById: (id: string) => Promise<ScheduledTask | undefined>
    create: (task: ScheduledTaskFormData) => Promise<ScheduledTask>
    update: (id: string, updates: Partial<ScheduledTaskFormData>) => Promise<ScheduledTask | undefined>
    delete: (id: string) => Promise<{ success: boolean }>
    toggle: (id: string, enabled: boolean) => Promise<{ success: boolean; message?: string }>
    runNow: (id: string) => Promise<{ success: boolean; message: string }>
    getActiveCount: () => Promise<number>
  }
  healthCheck: {
    getContainerHealth: (serverId: string, containerId: string) => Promise<ContainerHealthStatus | null>
    getAppHealth: (serverId: string, projectPath: string) => Promise<AppHealthStatus | null>
    updateConfig: (appId: string, config: HealthCheckConfigFormData) => Promise<HealthCheckConfig>
    getConfig: (appId: string) => Promise<HealthCheckConfig | null>
    performCheck: (appId?: string) => Promise<AppHealthStatus[]>
    getHistory: (appId: string, limit?: number) => Promise<HealthCheckHistoryRecord[]>
    getReport: (appId: string) => Promise<HealthCheckReport | null>
    getAllReports: () => Promise<HealthCheckReport[]>
    cleanupHistory: (days?: number) => Promise<{ success: boolean; deleted: number }>
    startPeriodic: (intervalMs?: number) => Promise<{ success: boolean }>
    stopPeriodic: () => Promise<{ success: boolean }>
  }
  resourceReport: {
    collectMetrics: (serverId: string, appId: string, containerId: string) => Promise<{
      containerId: string
      containerName: string
      cpuPercent: number
      memoryUsage: number
      memoryLimit: number
      networkRx: number
      networkTx: number
      blockRead: number
      blockWrite: number
    } | null>
    getMetrics: (params: ResourceMetricsQuery) => Promise<ResourceMetricsResult>
    getSummary: (serverId?: string, appId?: string, period?: string) => Promise<MetricsSummary>
    exportCSV: (metrics: ResourceMetricRow[]) => Promise<{ success: boolean; message: string }>
    cleanup: (days?: number) => Promise<{ success: boolean; deleted: number }>
    startPeriodicCollection: (serverId: string, containerIds: string[], interval?: number) => Promise<{ success: boolean }>
    stopPeriodicCollection: (serverId: string, containerIds?: string[]) => Promise<{ success: boolean }>
    getActiveCollectionCount: () => Promise<number>
    getLatestMetrics: (serverId: string) => Promise<ResourceMetricRow | null>
    getLatestMetricsByContainer: (containerId: string) => Promise<ResourceMetricRow | null>
  }
  ai: {
    getModels: (provider: string, apiKey: string, baseUrl?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    chat: (provider: string, apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number, baseUrl?: string) => Promise<{ success: boolean; data?: any; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}

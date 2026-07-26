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

export interface VolumeInfo {
  name: string
  mountpoint: string
  driver: string
  size: string
  scope: string
  createdAt: string
  labels: string
  options: string
}

export interface VolumeDetail {
  name: string
  driver: string
  mountpoint: string
  scope: string
  createdAt: string
  labels: Record<string, string>
  options: Record<string, string>
  status?: Record<string, string>
  usageData?: {
    size: string
    refCount: number
  }
}

export interface PruneResult {
  success: boolean
  message: string
  deletedVolumes?: string[]
  deletedImages?: string[]
  spaceReclaimed?: string
}

export interface ConfigImportResult {
  success: boolean
  message: string
  serversImported: number
  templatesImported: number
  appsImported: number
}

export interface DialogResult {
  canceled: boolean
  filePath?: string
  filePaths?: string[]
}

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  created: string
}

export interface DockerNetworkInfo {
  id: string
  name: string
  driver: string
  scope: string
  subnet: string
  gateway: string
  createdAt: string
  internal: boolean
  labels: string
}

export interface DockerNetworkDetail {
  id: string
  name: string
  driver: string
  scope: string
  created: string
  internal: boolean
  enableIPv6: boolean
  ipam: {
    driver: string
    config: Array<{
      subnet: string
      gateway: string
      ipRange?: string
    }>
    options?: Record<string, string>
  }
  options: Record<string, string>
  labels: Record<string, string>
  containers: Array<{
    name: string
    id: string
    ipv4Address: string
    ipv6Address: string
    macAddress: string
  }>
}

export interface DockerNetworkCreateOptions {
  name: string
  driver?: string
  subnet?: string
  gateway?: string
  internal?: boolean
  labels?: Record<string, string>
  options?: Record<string, string>
  ipamOptions?: Record<string, string>
  enableIPv6?: boolean
  ipRange?: string
  auxAddresses?: Record<string, string>
}

export interface DockerNetworkPruneResult {
  success: boolean
  deletedNetworks: string[]
  message: string
}

export interface AuditLogRow {
  id: string
  timestamp: string
  action: string
  targetType: string
  targetId: string | null
  targetName: string | null
  status: string
  details: string | null
  serverId: string | null
  createdAt: string
}

export interface AuditLogFilter {
  action?: string
  targetType?: string
  status?: string
  serverId?: string
  startDate?: string
  endDate?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface AuditLogResult {
  logs: AuditLogRow[]
  total: number
  page: number
  pageSize: number
}

export interface ServerGroup {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  serverCount?: number
}

export interface BatchDeployOptions {
  serverIds: string[]
  appName: string
  dockerCompose: string
  projectPath: string
  templateId?: string
  envVariables?: { name: string; value: string }[]
  parallelLimit?: number
}

export interface BatchDeployResult {
  success: boolean
  totalServers: number
  successCount: number
  failureCount: number
  results: {
    serverId: string
    serverName: string
    success: boolean
    message: string
    appId?: string
    containerIds?: string[]
  }[]
  message: string
}

export interface BatchOperationResult {
  success: boolean
  total: number
  successCount: number
  failureCount: number
  results: {
    appId: string
    appName: string
    serverId: string
    success: boolean
    message: string
  }[]
  message: string
}

export interface ServerStatusInfo {
  serverId: string
  serverName: string
  serverHost: string
  status: 'online' | 'offline' | 'connecting' | 'error'
  apps: {
    appId: string
    appName: string
    appStatus: 'running' | 'stopped' | 'deploying' | 'error'
    containerCount: number
  }[]
}

export interface TerminalSession {
  sessionId: string
  serverId: string
  containerId: string
  shell: string
  createdAt: string
}

export interface DeployHistoryRecord {
  id: string
  appId: string
  appName: string
  serverId: string
  version: number
  dockerCompose: string
  envVariables: string | null
  deployedAt: string
  status: string
}

export interface RollbackResult {
  success: boolean
  message: string
  appId?: string
}

export type AlertRuleType = 'container_exit' | 'container_restart_loop' | 'high_cpu' | 'high_memory' | 'high_disk'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'active' | 'resolved'
export type NotifyChannel = 'system' | 'webhook'

export interface AlertRule {
  id: string
  name: string
  ruleType: AlertRuleType
  serverId?: string
  appId?: string
  threshold?: number
  enabled: boolean
  notifyChannels: NotifyChannel[]
  createdAt: string
  updatedAt: string
}

export interface AlertHistoryEntry {
  id: string
  ruleId: string
  ruleName: string
  alertType: AlertRuleType
  message: string
  severity: AlertSeverity
  status: AlertStatus
  triggeredAt: string
  resolvedAt?: string
}

export interface AlertRuleFormData {
  name: string
  ruleType: AlertRuleType
  serverId?: string
  appId?: string
  threshold?: number
  enabled?: boolean
  notifyChannels?: NotifyChannel[]
}

export interface AlertStats {
  totalRules: number
  activeRules: number
  activeAlerts: number
  totalAlerts: number
}

export type ScheduledTaskType = 'restart_container' | 'update_container' | 'backup_database' | 'backup_volume' | 'cleanup_images' | 'cleanup_volumes'

export interface ScheduledTask {
  id: string
  name: string
  description: string | null
  taskType: ScheduledTaskType
  cronExpression: string
  serverId: string
  appId: string | null
  enabled: number
  lastRun: string | null
  lastStatus: string | null
  createdAt: string
  updatedAt: string
}

export interface ScheduledTaskFormData {
  name: string
  description?: string
  taskType: ScheduledTaskType
  cronExpression: string
  serverId: string
  appId?: string
  enabled?: boolean
}

export interface ContainerHealthStatus {
  containerId: string
  containerName: string
  status: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown'
  healthStatus: string
  uptime: string
  restartCount: number
  exitCode: number
  errorMessage?: string
  responseTime?: number
}

export interface AppHealthStatus {
  appId: string
  appName: string
  serverId: string
  projectPath: string
  overallStatus: 'healthy' | 'unhealthy' | 'partial' | 'unknown'
  containers: ContainerHealthStatus[]
  lastCheckTime: string
  autoRestartEnabled: boolean
  restartCount: number
}

export interface HealthCheckConfig {
  id: string
  appId: string
  autoRestart: boolean
  maxRestarts: number
  restartWindow: number
  notifyOnRestart: boolean
  createdAt: string
  updatedAt: string
}

export interface HealthCheckHistoryRecord {
  id: string
  appId: string
  containerId: string | null
  containerName: string | null
  checkTime: string
  status: string
  healthStatus: string | null
  restartCount: number
  autoRestarted: number
  errorMessage: string | null
  responseTime: number | null
  createdAt: string
}

export interface HealthCheckReport {
  appId: string
  appName: string
  serverId: string
  totalChecks: number
  healthyCount: number
  unhealthyCount: number
  autoRestarts: number
  uptime: number
  lastCheckTime: string
  containers: {
    name: string
    status: string
    healthStatus: string
    restartCount: number
  }[]
}

export interface HealthCheckConfigFormData {
  autoRestart?: boolean
  maxRestarts?: number
  restartWindow?: number
  notifyOnRestart?: boolean
}

export interface ResourceMetricRow {
  id: string
  serverId: string
  appId: string | null
  containerId: string | null
  cpuPercent: number | null
  memoryUsage: number | null
  memoryLimit: number | null
  networkRx: number | null
  networkTx: number | null
  blockRead: number | null
  blockWrite: number | null
  timestamp: string
}

export interface ResourceMetricsQuery {
  serverId?: string
  appId?: string
  containerId?: string
  startTime?: string
  endTime?: string
  limit?: number
  offset?: number
}

export interface MetricsSummary {
  avgCpuPercent: number
  maxCpuPercent: number
  avgMemoryUsage: number
  maxMemoryUsage: number
  avgNetworkRx: number
  avgNetworkTx: number
  totalBlockRead: number
  totalBlockWrite: number
  dataPoints: number
  period: string
}

export interface ResourceMetricsResult {
  metrics: ResourceMetricRow[]
  total: number
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
  auditLog: {
    query: (filter: AuditLogFilter) => Promise<AuditLogResult>
    getAll: (options?: { limit?: number }) => Promise<AuditLogResult>
    getActions: () => Promise<string[]>
    getTargetTypes: () => Promise<string[]>
    exportCSV: (filter: AuditLogFilter) => Promise<{ success: boolean; message: string }>
    cleanup: (days?: number) => Promise<{ success: boolean; deleted: number }>
    clear: () => Promise<{ success: boolean }>
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
  logs: {
    start: (serverId: string, containerId: string, options?: { tail?: number; follow?: boolean }) => Promise<{ success: boolean; message?: string }>
    stop: (serverId: string, containerId: string) => Promise<{ success: boolean }>
    onData: (callback: (streamId: string, data: string) => void) => void
    onError: (callback: (streamId: string, error: string) => void) => void
    onClose: (callback: (streamId: string, code: number) => void) => void
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
  ai: {
    getModels: (provider: string, apiKey: string, baseUrl?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    chat: (provider: string, apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number, baseUrl?: string) => Promise<{ success: boolean; data?: any; error?: string }>
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
    openPort: (serverId: string, port: number): Promise<boolean> => ipcRenderer.invoke('server:openPort', serverId, port),
    installDependencies: (serverId: string, options: { docker?: boolean; compose?: boolean }): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('server:installDependencies', serverId, options),
    uploadOfflinePackage: (serverId: string, fileName: string, content: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('server:uploadOfflinePackage', serverId, fileName, content)
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
    restartContainer: (serverId: string, containerId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:restartContainer', serverId, containerId),
    removeContainer: (serverId: string, containerId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('app:removeContainer', serverId, containerId)
  },
  config: {
    exportConfig: (filePath: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('config:export', filePath),
    importConfig: (filePath: string): Promise<ConfigImportResult> => ipcRenderer.invoke('config:import', filePath),
    showSaveDialog: (): Promise<DialogResult> => ipcRenderer.invoke('config:showSaveDialog'),
    showOpenDialog: (): Promise<DialogResult> => ipcRenderer.invoke('config:showOpenDialog')
  },
  image: {
    getAll: (serverId: string): Promise<DockerImage[]> => ipcRenderer.invoke('image:getAll', serverId),
    pull: (serverId: string, imageName: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('image:pull', serverId, imageName),
    remove: (serverId: string, imageId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('image:remove', serverId, imageId),
    prune: (serverId: string): Promise<PruneResult> => ipcRenderer.invoke('image:prune', serverId),
    getInfo: (serverId: string, imageId: string): Promise<string> => ipcRenderer.invoke('image:getInfo', serverId, imageId)
  },
  volume: {
    getAll: (serverId: string): Promise<VolumeInfo[]> => ipcRenderer.invoke('volume:getAll', serverId),
    create: (serverId: string, name: string, driver?: string, labels?: Record<string, string>, options?: Record<string, string>): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('volume:create', serverId, name, driver, labels, options),
    remove: (serverId: string, name: string, force?: boolean): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('volume:remove', serverId, name, force),
    prune: (serverId: string, force?: boolean, all?: boolean): Promise<PruneResult> => ipcRenderer.invoke('volume:prune', serverId, force, all),
    getInfo: (serverId: string, name: string): Promise<VolumeDetail | null> => ipcRenderer.invoke('volume:getInfo', serverId, name),
    getSize: (serverId: string, name: string): Promise<string> => ipcRenderer.invoke('volume:getSize', serverId, name)
  },
  network: {
    getAll: (serverId: string): Promise<DockerNetworkInfo[]> => ipcRenderer.invoke('network:getAll', serverId),
    create: (serverId: string, options: DockerNetworkCreateOptions): Promise<{ success: boolean; message: string; networkId?: string }> => ipcRenderer.invoke('network:create', serverId, options),
    remove: (serverId: string, networkId: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('network:remove', serverId, networkId),
    getInfo: (serverId: string, networkId: string): Promise<DockerNetworkDetail | null> => ipcRenderer.invoke('network:getInfo', serverId, networkId),
    connect: (serverId: string, networkId: string, containerId: string, ip?: string, ipv6?: string, aliases?: string[]): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('network:connect', serverId, networkId, containerId, ip, ipv6, aliases),
    disconnect: (serverId: string, networkId: string, containerId: string, force?: boolean): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('network:disconnect', serverId, networkId, containerId, force),
    prune: (serverId: string, force?: boolean): Promise<DockerNetworkPruneResult> => ipcRenderer.invoke('network:prune', serverId, force),
    getContainers: (serverId: string): Promise<Array<{ id: string; name: string; status: string }>> => ipcRenderer.invoke('network:getContainers', serverId)
  },
  auditLog: {
    query: (filter: AuditLogFilter): Promise<AuditLogResult> => ipcRenderer.invoke('auditLog:query', filter),
    getAll: (options?: { limit?: number }): Promise<AuditLogResult> => ipcRenderer.invoke('auditLog:getAll', options),
    getActions: (): Promise<string[]> => ipcRenderer.invoke('auditLog:getActions'),
    getTargetTypes: (): Promise<string[]> => ipcRenderer.invoke('auditLog:getTargetTypes'),
    exportCSV: (filter: AuditLogFilter): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('auditLog:exportCSV', filter),
    cleanup: (days?: number): Promise<{ success: boolean; deleted: number }> => ipcRenderer.invoke('auditLog:cleanup', days),
    clear: (): Promise<{ success: boolean }> => ipcRenderer.invoke('auditLog:clear')
  },
  terminal: {
    open: (serverId: string, containerId: string, cols?: number, rows?: number): Promise<{ success: boolean; sessionId?: string; message?: string }> => ipcRenderer.invoke('terminal:open', serverId, containerId, cols, rows),
    write: (sessionId: string, data: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
    close: (sessionId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('terminal:close', sessionId),
    getAllSessions: (): Promise<TerminalSession[]> => ipcRenderer.invoke('terminal:getAllSessions'),
    onData: (callback: (sessionId: string, data: string) => void): void => {
      ipcRenderer.on('terminal:data', (_, sessionId: string, data: string) => callback(sessionId, data))
    },
    onClose: (callback: (sessionId: string) => void): void => {
      ipcRenderer.on('terminal:close', (_, sessionId: string) => callback(sessionId))
    },
    onError: (callback: (sessionId: string, error: string) => void): void => {
      ipcRenderer.on('terminal:error', (_, sessionId: string, error: string) => callback(sessionId, error))
    }
  },
  logs: {
    start: (serverId: string, containerId: string, options?: { tail?: number; follow?: boolean }): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('logs:start', serverId, containerId, options),
    stop: (serverId: string, containerId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('logs:stop', serverId, containerId),
    onData: (callback: (streamId: string, data: string) => void): void => {
      ipcRenderer.on('logs:data', (_, streamId: string, data: string) => callback(streamId, data))
    },
    onError: (callback: (streamId: string, error: string) => void): void => {
      ipcRenderer.on('logs:error', (_, streamId: string, error: string) => callback(streamId, error))
    },
    onClose: (callback: (streamId: string, code: number) => void): void => {
      ipcRenderer.on('logs:close', (_, streamId: string, code: number) => callback(streamId, code))
    }
  },
  deployHistory: {
    getByAppId: (appId: string): Promise<DeployHistoryRecord[]> => ipcRenderer.invoke('deployHistory:getByAppId', appId),
    getAll: (): Promise<DeployHistoryRecord[]> => ipcRenderer.invoke('deployHistory:getAll'),
    getById: (id: string): Promise<DeployHistoryRecord | undefined> => ipcRenderer.invoke('deployHistory:getById', id),
    rollback: (historyId: string): Promise<RollbackResult> => ipcRenderer.invoke('deployHistory:rollback', historyId),
    compare: (historyId1: string, historyId2: string): Promise<{ version1: number; version2: number; compose1: string; compose2: string } | null> => ipcRenderer.invoke('deployHistory:compare', historyId1, historyId2)
  },
  serverGroup: {
    getAll: (): Promise<ServerGroup[]> => ipcRenderer.invoke('serverGroup:getAll'),
    getById: (id: string): Promise<ServerGroup | undefined> => ipcRenderer.invoke('serverGroup:getById', id),
    create: (group: { name: string; description?: string }): Promise<ServerGroup> => ipcRenderer.invoke('serverGroup:create', group),
    update: (id: string, updates: Partial<{ name: string; description: string }>): Promise<void> => ipcRenderer.invoke('serverGroup:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('serverGroup:delete', id),
    getServers: (groupId: string): Promise<Server[]> => ipcRenderer.invoke('serverGroup:getServers', groupId),
    addServer: (groupId: string, serverId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('serverGroup:addServer', groupId, serverId),
    removeServer: (groupId: string, serverId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('serverGroup:removeServer', groupId, serverId),
    getServerGroups: (serverId: string): Promise<ServerGroup[]> => ipcRenderer.invoke('serverGroup:getServerGroups', serverId)
  },
  batch: {
    deploy: (options: BatchDeployOptions): Promise<BatchDeployResult> => ipcRenderer.invoke('batch:deploy', options),
    start: (appIds: string[]): Promise<BatchOperationResult> => ipcRenderer.invoke('batch:start', appIds),
    stop: (appIds: string[]): Promise<BatchOperationResult> => ipcRenderer.invoke('batch:stop', appIds),
    restart: (appIds: string[]): Promise<BatchOperationResult> => ipcRenderer.invoke('batch:restart', appIds),
    getServerStatuses: (serverIds: string[]): Promise<ServerStatusInfo[]> => ipcRenderer.invoke('batch:getServerStatuses', serverIds),
    getAllServerStatuses: (): Promise<ServerStatusInfo[]> => ipcRenderer.invoke('batch:getAllServerStatuses')
  },
  alertRule: {
    getAll: (): Promise<AlertRule[]> => ipcRenderer.invoke('alertRule:getAll'),
    getById: (id: string): Promise<AlertRule | undefined> => ipcRenderer.invoke('alertRule:getById', id),
    create: (rule: AlertRuleFormData): Promise<AlertRule> => ipcRenderer.invoke('alertRule:create', rule),
    update: (id: string, updates: Partial<AlertRuleFormData>): Promise<AlertRule | undefined> => ipcRenderer.invoke('alertRule:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('alertRule:delete', id),
    toggle: (id: string, enabled: boolean): Promise<AlertRule | undefined> => ipcRenderer.invoke('alertRule:toggle', id, enabled)
  },
  alertHistory: {
    getAll: (limit?: number): Promise<AlertHistoryEntry[]> => ipcRenderer.invoke('alertHistory:getAll', limit),
    getActive: (): Promise<AlertHistoryEntry[]> => ipcRenderer.invoke('alertHistory:getActive'),
    resolve: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('alertHistory:resolve', id),
    resolveAll: (): Promise<{ success: boolean }> => ipcRenderer.invoke('alertHistory:resolveAll'),
    delete: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('alertHistory:delete', id),
    clear: (): Promise<{ success: boolean }> => ipcRenderer.invoke('alertHistory:clear'),
    cleanup: (days?: number): Promise<{ success: boolean; deleted: number }> => ipcRenderer.invoke('alertHistory:cleanup', days)
  },
  alert: {
    getStats: (): Promise<AlertStats> => ipcRenderer.invoke('alert:getStats'),
    getActiveAlerts: (): Promise<AlertHistoryEntry[]> => ipcRenderer.invoke('alertHistory:getActive')
  },
  ai: {
    getModels: (provider: string, apiKey: string, baseUrl?: string): Promise<{ success: boolean; data?: any[]; error?: string }> => ipcRenderer.invoke('ai:getModels', provider, apiKey, baseUrl),
    chat: (provider: string, apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number, baseUrl?: string, extraParams?: any): Promise<{ success: boolean; data?: any; error?: string }> => ipcRenderer.invoke('ai:chat', provider, apiKey, model, messages, temperature, maxTokens, baseUrl, extraParams)
  },
  scheduledTask: {
    getAll: (): Promise<ScheduledTask[]> => ipcRenderer.invoke('scheduledTask:getAll'),
    getById: (id: string): Promise<ScheduledTask | undefined> => ipcRenderer.invoke('scheduledTask:getById', id),
    create: (task: ScheduledTaskFormData): Promise<ScheduledTask> => ipcRenderer.invoke('scheduledTask:create', task),
    update: (id: string, updates: Partial<ScheduledTaskFormData>): Promise<ScheduledTask | undefined> => ipcRenderer.invoke('scheduledTask:update', id, updates),
    delete: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('scheduledTask:delete', id),
    toggle: (id: string, enabled: boolean): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('scheduledTask:toggle', id, enabled),
    runNow: (id: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('scheduledTask:runNow', id),
    getActiveCount: (): Promise<number> => ipcRenderer.invoke('scheduledTask:getActiveCount')
  },
  healthCheck: {
    getContainerHealth: (serverId: string, containerId: string): Promise<ContainerHealthStatus | null> => ipcRenderer.invoke('healthCheck:getContainerHealth', serverId, containerId),
    getAppHealth: (serverId: string, projectPath: string): Promise<AppHealthStatus | null> => ipcRenderer.invoke('healthCheck:getAppHealth', serverId, projectPath),
    updateConfig: (appId: string, config: HealthCheckConfigFormData): Promise<HealthCheckConfig> => ipcRenderer.invoke('healthCheck:updateConfig', appId, config),
    getConfig: (appId: string): Promise<HealthCheckConfig | null> => ipcRenderer.invoke('healthCheck:getConfig', appId),
    performCheck: (appId?: string): Promise<AppHealthStatus[]> => ipcRenderer.invoke('healthCheck:performCheck', appId),
    getHistory: (appId: string, limit?: number): Promise<HealthCheckHistoryRecord[]> => ipcRenderer.invoke('healthCheck:getHistory', appId, limit),
    getReport: (appId: string): Promise<HealthCheckReport | null> => ipcRenderer.invoke('healthCheck:getReport', appId),
    getAllReports: (): Promise<HealthCheckReport[]> => ipcRenderer.invoke('healthCheck:getAllReports'),
    cleanupHistory: (days?: number): Promise<{ success: boolean; deleted: number }> => ipcRenderer.invoke('healthCheck:cleanupHistory', days),
    startPeriodic: (intervalMs?: number): Promise<{ success: boolean }> => ipcRenderer.invoke('healthCheck:startPeriodic', intervalMs),
    stopPeriodic: (): Promise<{ success: boolean }> => ipcRenderer.invoke('healthCheck:stopPeriodic')
  },
  resourceReport: {
    collectMetrics: (serverId: string, appId: string, containerId: string): Promise<{
      containerId: string
      containerName: string
      cpuPercent: number
      memoryUsage: number
      memoryLimit: number
      networkRx: number
      networkTx: number
      blockRead: number
      blockWrite: number
    } | null> => ipcRenderer.invoke('resourceReport:collectMetrics', serverId, appId, containerId),
    getMetrics: (params: ResourceMetricsQuery): Promise<ResourceMetricsResult> => ipcRenderer.invoke('resourceReport:getMetrics', params),
    getSummary: (serverId?: string, appId?: string, period?: string): Promise<MetricsSummary> => ipcRenderer.invoke('resourceReport:getSummary', serverId, appId, period),
    exportCSV: (metrics: ResourceMetricRow[]): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('resourceReport:exportCSV', metrics),
    cleanup: (days?: number): Promise<{ success: boolean; deleted: number }> => ipcRenderer.invoke('resourceReport:cleanup', days),
    startPeriodicCollection: (serverId: string, containerIds: string[], interval?: number): Promise<{ success: boolean }> => ipcRenderer.invoke('resourceReport:startPeriodicCollection', serverId, containerIds, interval),
    stopPeriodicCollection: (serverId: string, containerIds?: string[]): Promise<{ success: boolean }> => ipcRenderer.invoke('resourceReport:stopPeriodicCollection', serverId, containerIds),
    getActiveCollectionCount: (): Promise<number> => ipcRenderer.invoke('resourceReport:getActiveCollectionCount'),
    getLatestMetrics: (serverId: string): Promise<ResourceMetricRow | null> => ipcRenderer.invoke('resourceReport:getLatestMetrics', serverId),
    getLatestMetricsByContainer: (containerId: string): Promise<ResourceMetricRow | null> => ipcRenderer.invoke('resourceReport:getLatestMetricsByContainer', containerId)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

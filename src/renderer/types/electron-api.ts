// ============================================================
// Electron API 类型规范（单一来源 / Single Source of Truth）
// preload 与 renderer 共享的 IPC API 与数据类型定义。
// 修改 API 时只改本文件；
//   - src/preload/index.ts 引用并 re-export 本文件，保留实现；
//   - src/renderer/types/global.d.ts 引用本文件并声明 window.electronAPI。
// ============================================================
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
  // 数据库为自由 TEXT 列，分类集合由 UI 层约束
  category: string
  dockerCompose: string
  isBuiltIn: boolean
  envSchema: EnvVariableSchema[]
  createdAt: string
}

export interface TemplateFormData {
  name: string
  description: string
  category: string
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
  // 部分查询会联表返回模板的 compose 内容（可选）
  dockerCompose?: string
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

export interface DiskPartition {
  device: string
  mountPoint: string
  total: string
  used: string
  percent: number
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
  diskPartitions: DiskPartition[]
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
  dockerInstalled: boolean
  dockerRunning: boolean
  dockerVersion: string
  composeInstalled: boolean
  composeVersion: string
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

export interface ScanVulnerability {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'negligible'
  packageName: string
  installedVersion: string
  fixedVersion?: string
  description: string
  cveId?: string
  cvssScore?: number
  remediation: string
}

export interface ScanSummary {
  critical: number
  high: number
  medium: number
  low: number
  negligible: number
  total: number
}

export interface ScanImageResult {
  success: boolean
  message: string
  trivyInstalled: boolean
  vulnerabilities: ScanVulnerability[]
  summary: ScanSummary
  scanTime: string
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

export interface ShellScript {
  id: string
  name: string
  description: string | null
  category: string
  content: string
  version: number
  timeout: number
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

export interface ShellScriptInput {
  name: string
  description?: string
  category?: string
  content: string
  timeout?: number
}

export interface ShellScriptVersion {
  id: string
  scriptId: string
  version: number
  content: string
  changeNote: string | null
  createdAt: string
}

export interface ShellScriptExecutionLog {
  id: string
  scriptId: string
  scriptName: string
  version: number
  serverId: string
  serverName: string
  status: string
  exitCode: number | null
  stdout: string | null
  stderr: string | null
  params: string | null
  startedAt: string
  finishedAt: string | null
  duration: number | null
}

export interface ShellScriptRunOptions {
  serverIds: string[]
  params?: Record<string, string>
  args?: string[]
  timeout?: number
}

export interface ShellScriptServerResult {
  serverId: string
  serverName: string
  success: boolean
  status: string
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

export interface ShellScriptRunResult {
  success: boolean
  total: number
  successCount: number
  failureCount: number
  results: ShellScriptServerResult[]
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
  /** 规则级静默窗口（分钟）：同一目标在窗口内不重复触发 */
  silenceMinutes?: number
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

// ==================== 自动更新 ====================
export interface UpdateReleaseInfo {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

export interface UpdateProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: UpdateReleaseInfo }
  | { type: 'not-available' }
  | { type: 'progress'; progress: UpdateProgressInfo }
  | { type: 'downloaded' }
  | { type: 'error'; message: string }

export interface UpdaterCheckResult extends UpdateReleaseInfo {
  hasUpdate: boolean
  message?: string
}

export type UpdaterStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error'

export interface ElectronAPI {
  getAppVersion: () => Promise<string>
  getAppName: () => Promise<string>
  showItemInFolder: (filePath: string) => Promise<{ success: boolean; message?: string }>
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
    // 部署进度事件（app:deploy 执行期间分阶段推送）
    onDeployProgress: (callback: (payload: { appName: string; percent: number; stage: string; message: string }) => void) => () => void
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
    removeBatch: (serverId: string, imageIds: string[]) => Promise<{ success: boolean; successCount: number; failCount: number; message: string }>
    prune: (serverId: string) => Promise<PruneResult>
    getInfo: (serverId: string, imageId: string) => Promise<string>
    export: (serverId: string, imageName: string, localFilePath: string) => Promise<{ success: boolean; message: string }>
    import: (serverId: string, localFilePath: string) => Promise<{ success: boolean; message: string }>
    showSaveDialog: (defaultName?: string) => Promise<DialogResult>
    showOpenDialog: () => Promise<DialogResult>
    getUsedImageNames: (serverId: string) => Promise<string[]>
  }
  security: {
    scanImage: (serverId: string, imageName: string, proxy?: string) => Promise<ScanImageResult>
    installTrivy: (serverId: string, proxy?: string) => Promise<{ success: boolean; message: string }>
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
    onData: (callback: (sessionId: string, data: string) => void) => () => void
    onClose: (callback: (sessionId: string) => void) => () => void
    onError: (callback: (sessionId: string, error: string) => void) => () => void
  }
  // 文件传输（SFTP 上传/下载 + 本地路径选择）
  fileTransfer: {
    selectFile: () => Promise<{ success: boolean; canceled?: boolean; path?: string; paths?: string[] }>
    selectSavePath: (defaultName?: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>
    upload: (serverId: string, localPath: string, remotePath: string, taskId?: string) => Promise<{ success: boolean; message?: string }>
    download: (serverId: string, remotePath: string, localPath: string, taskId?: string) => Promise<{ success: boolean; message?: string }>
    listRemote: (serverId: string, remotePath: string) => Promise<{ success: boolean; entries?: Array<{ name: string; type: 'dir' | 'link' | 'file'; size: number; mtime: number; mode?: number }>; message?: string }>
    listLocal: (localPath: string) => Promise<{ success: boolean; entries?: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: number }>; message?: string }>
    homeLocal: () => Promise<{ success: boolean; path?: string; message?: string }>
    listDrives: () => Promise<{ success: boolean; drives?: string[]; message?: string }>
    localOp: (op: 'mkdir' | 'rename' | 'delete', target: string, to?: string) => Promise<{ success: boolean; message?: string }>
    remoteOp: (serverId: string, op: 'mkdir' | 'rename' | 'delete', target: string, to?: string) => Promise<{ success: boolean; message?: string }>
    readLocal: (filePath: string) => Promise<{ success: boolean; content?: string; message?: string }>
    writeLocal: (filePath: string, content: string) => Promise<{ success: boolean; message?: string }>
    readRemote: (serverId: string, remotePath: string) => Promise<{ success: boolean; content?: string; message?: string }>
    writeRemote: (serverId: string, remotePath: string, content: string) => Promise<{ success: boolean; message?: string }>
    onProgress: (callback: (payload: { taskId: string; transferred: number; total: number }) => void) => () => void
  }
  logs: {
    start: (serverId: string, containerId: string, options?: { tail?: number; follow?: boolean }) => Promise<{ success: boolean; message?: string }>
    stop: (serverId: string, containerId: string) => Promise<{ success: boolean }>
    onData: (callback: (streamId: string, data: string) => void) => () => void
    onError: (callback: (streamId: string, error: string) => void) => () => void
    onClose: (callback: (streamId: string, code: number) => void) => () => void
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
    generateScript: (cfg: any, prompt: string) => Promise<{ success: boolean; text?: string; error?: string }>
  }
  secure: {
    encrypt: (text: string) => Promise<{ success: boolean; data?: string; error?: string }>
    decrypt: (cipher: string) => Promise<{ success: boolean; data?: string; error?: string }>
  }
  opsAgent: {
    setConfig: (config: any) => Promise<{ success: boolean; error?: string }>
    getConfig: () => Promise<{ success: boolean; data?: any; error?: string }>
    chat: (requestId: string, options: { serverId?: string; serverName?: string; userInput: string; threadId?: string; historySummary?: string; temperature?: number }) => Promise<{ success: boolean; requestId?: string; error?: string }>
    cancel: (requestId: string) => Promise<{ success: boolean; error?: string }>
    approval: (id: string, approved: boolean) => Promise<{ success: boolean }>
    // AI 建议命令执行前的风控门禁：黑名单拒绝 + 高危命令统一审批
    approveCommand: (command: string, riskLevel?: string) => Promise<{ approved: boolean; riskLevel: string; blocked: boolean }>
    onChunk: (callback: (payload: { requestId: string; delta: string }) => void) => () => void
    onReasoning: (callback: (payload: { requestId: string; delta: string }) => void) => () => void
    onToolCall: (callback: (payload: { requestId: string; toolName: string; args: any; toolCallId?: string }) => void) => () => void
    onToolResult: (callback: (payload: { requestId: string; toolName: string; success: boolean; output: any; toolCallId?: string }) => void) => () => void
    onError: (callback: (payload: { requestId: string; error: string }) => void) => () => void
    onDone: (callback: (payload: { requestId: string }) => void) => () => void
    onApprovalRequest: (callback: (payload: { id: string; action: string; riskLevel: string }) => void) => () => void
    onRoute: (callback: (payload: { requestId: string; route: string }) => void) => () => void
    onUsage: (callback: (payload: { requestId: string; usage: { input: number; output: number } }) => void) => () => void
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
    startPeriodicCollection: (serverId: string, containerIds: string[], interval?: number, appId?: string | null) => Promise<{ success: boolean }>
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
  shellScript: {
    getAll: () => Promise<ShellScript[]>
    getById: (id: string) => Promise<ShellScript | undefined>
    create: (input: ShellScriptInput) => Promise<ShellScript | undefined>
    update: (id: string, input: Partial<ShellScriptInput>, changeNote?: string) => Promise<ShellScript | undefined>
    delete: (id: string) => Promise<void>
    getVersions: (scriptId: string) => Promise<ShellScriptVersion[]>
    getVersionById: (id: string) => Promise<ShellScriptVersion | undefined>
    rollback: (scriptId: string, versionId: string, changeNote?: string) => Promise<ShellScript | undefined>
    run: (scriptId: string, options: ShellScriptRunOptions) => Promise<ShellScriptRunResult>
    getExecutionLogs: (scriptId?: string, limit?: number) => Promise<ShellScriptExecutionLog[]>
    deleteExecutionLog: (logId: string) => Promise<{ success: boolean; message?: string }>
    clearExecutionLogs: (scriptId?: string) => Promise<{ success: boolean; message?: string }>
  }
  updater: {
    check: () => Promise<UpdaterCheckResult>
    download: () => Promise<{ success: boolean; message?: string }>
    install: () => Promise<{ success: boolean }>
    getStatus: () => Promise<UpdaterStatus>
    onEvent: (callback: (event: UpdaterEvent) => void) => () => void
  }
}

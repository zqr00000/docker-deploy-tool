import { contextBridge, ipcRenderer } from 'electron'
// 类型定义已迁移到 ../renderer/types/electron-api（单一来源），此处仅保留实现与类型 re-export
import type {
  ServerFormData, Server, DockerCheckResult, EnvVariableSchema, Template, TemplateFormData,
  ServerConnectionResult, CommandExecutionResult, App, EnvVariable, DeployOptions, DeployResult,
  ContainerInfo, SystemInfo, DiskPartition, HardwareInfo, NetworkInfo, PortInfo,
  DebugLogEntry, SystemCheckResult, HardwareRequirements, ContainerStats, VolumeInfo, VolumeDetail,
  PruneResult, ConfigImportResult, DialogResult, DockerImage, ScanVulnerability, ScanSummary,
  ScanImageResult, DockerNetworkInfo, DockerNetworkDetail, DockerNetworkCreateOptions, DockerNetworkPruneResult, AuditLogRow,
  AuditLogFilter, AuditLogResult, ServerGroup, BatchDeployOptions, BatchDeployResult, BatchOperationResult,
  ServerStatusInfo, TerminalSession, DeployHistoryRecord, RollbackResult, ShellScript, ShellScriptInput,
  ShellScriptVersion, ShellScriptExecutionLog, ShellScriptRunOptions, ShellScriptServerResult, ShellScriptRunResult, AlertRuleType,
  AlertSeverity, AlertStatus, NotifyChannel, AlertRule, AlertHistoryEntry, AlertRuleFormData,
  AlertStats, ScheduledTaskType, ScheduledTask, ScheduledTaskFormData, ContainerHealthStatus, AppHealthStatus,
  HealthCheckConfig, HealthCheckHistoryRecord, HealthCheckReport, HealthCheckConfigFormData, ResourceMetricRow, ResourceMetricsQuery,
  MetricsSummary, ResourceMetricsResult, ElectronAPI
} from '../renderer/types/electron-api'

export * from '../renderer/types/electron-api'

const electronAPI: ElectronAPI = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getAppName: (): Promise<string> => ipcRenderer.invoke('app:name'),
  showItemInFolder: (filePath: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('app:showItemInFolder', filePath),

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
    // 部署进度事件（app:deploy 执行期间分阶段推送）
    onDeployProgress: (callback: (payload: { appName: string; percent: number; stage: string; message: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { appName: string; percent: number; stage: string; message: string }) => callback(payload)
      ipcRenderer.on('deploy:progress', listener)
      return () => { ipcRenderer.removeListener('deploy:progress', listener) }
    },
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
    removeBatch: (serverId: string, imageIds: string[]): Promise<{ success: boolean; successCount: number; failCount: number; message: string }> => ipcRenderer.invoke('image:removeBatch', serverId, imageIds),
    prune: (serverId: string): Promise<PruneResult> => ipcRenderer.invoke('image:prune', serverId),
    getInfo: (serverId: string, imageId: string): Promise<string> => ipcRenderer.invoke('image:getInfo', serverId, imageId),
    export: (serverId: string, imageName: string, localFilePath: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('image:export', serverId, imageName, localFilePath),
    import: (serverId: string, localFilePath: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('image:import', serverId, localFilePath),
    showSaveDialog: (defaultName?: string): Promise<DialogResult> => ipcRenderer.invoke('image:showSaveDialog', defaultName),
    showOpenDialog: (): Promise<DialogResult> => ipcRenderer.invoke('image:showOpenDialog'),
    getUsedImageNames: (serverId: string): Promise<string[]> => ipcRenderer.invoke('image:getUsedImageNames', serverId)
  },
  security: {
    scanImage: (serverId: string, imageName: string, proxy?: string): Promise<ScanImageResult> => ipcRenderer.invoke('security:scanImage', serverId, imageName, proxy),
    installTrivy: (serverId: string, proxy?: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('security:installTrivy', serverId, proxy)
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
    onData: (callback: (sessionId: string, data: string) => void): (() => void) => {
      const listener = (_: any, sessionId: string, data: string) => callback(sessionId, data)
      ipcRenderer.on('terminal:data', listener)
      return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onClose: (callback: (sessionId: string) => void): (() => void) => {
      const listener = (_: any, sessionId: string) => callback(sessionId)
      ipcRenderer.on('terminal:close', listener)
      return () => ipcRenderer.removeListener('terminal:close', listener)
    },
    onError: (callback: (sessionId: string, error: string) => void): (() => void) => {
      const listener = (_: any, sessionId: string, error: string) => callback(sessionId, error)
      ipcRenderer.on('terminal:error', listener)
      return () => ipcRenderer.removeListener('terminal:error', listener)
    }
  },
  fileTransfer: {
    selectFile: (): Promise<{ success: boolean; canceled?: boolean; path?: string; paths?: string[] }> => ipcRenderer.invoke('fileTrans:selectFile'),
    selectSavePath: (defaultName?: string): Promise<{ success: boolean; canceled?: boolean; path?: string }> => ipcRenderer.invoke('fileTrans:selectSavePath', defaultName),
    upload: (serverId: string, localPath: string, remotePath: string, taskId?: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('fileTrans:upload', serverId, localPath, remotePath, taskId),
    download: (serverId: string, remotePath: string, localPath: string, taskId?: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('fileTrans:download', serverId, remotePath, localPath, taskId),
    listRemote: (serverId: string, remotePath: string): Promise<{ success: boolean; entries?: Array<{ name: string; type: 'dir' | 'link' | 'file'; size: number; mtime: number; mode?: number }>; message?: string }> => ipcRenderer.invoke('fileTrans:listRemote', serverId, remotePath),
    listLocal: (localPath: string): Promise<{ success: boolean; entries?: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: number }>; message?: string }> => ipcRenderer.invoke('fileTrans:listLocal', localPath),
    homeLocal: (): Promise<{ success: boolean; path?: string; message?: string }> => ipcRenderer.invoke('fileTrans:homeLocal'),
    listDrives: (): Promise<{ success: boolean; drives?: string[]; message?: string }> => ipcRenderer.invoke('fileTrans:listDrives'),
    localOp: (op: 'mkdir' | 'rename' | 'delete', target: string, to?: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('fileTrans:localOp', op, target, to),
    remoteOp: (serverId: string, op: 'mkdir' | 'rename' | 'delete', target: string, to?: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('fileTrans:remoteOp', serverId, op, target, to),
    readLocal: (filePath: string): Promise<{ success: boolean; content?: string; message?: string }> => ipcRenderer.invoke('fileTrans:readLocal', filePath),
    writeLocal: (filePath: string, content: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('fileTrans:writeLocal', filePath, content),
    readRemote: (serverId: string, remotePath: string): Promise<{ success: boolean; content?: string; message?: string }> => ipcRenderer.invoke('fileTrans:readRemote', serverId, remotePath),
    writeRemote: (serverId: string, remotePath: string, content: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('fileTrans:writeRemote', serverId, remotePath, content),
    onProgress: (callback: (payload: { taskId: string; transferred: number; total: number }) => void): (() => void) => {
      const listener = (_e: any, payload: { taskId: string; transferred: number; total: number }) => callback(payload)
      ipcRenderer.on('fileTrans:progress', listener)
      return () => ipcRenderer.removeListener('fileTrans:progress', listener)
    }
  },
  logs: {
    start: (serverId: string, containerId: string, options?: { tail?: number; follow?: boolean }): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('logs:start', serverId, containerId, options),
    stop: (serverId: string, containerId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('logs:stop', serverId, containerId),
    onData: (callback: (streamId: string, data: string) => void): (() => void) => {
      const listener = (_e: any, streamId: string, data: string) => callback(streamId, data)
      ipcRenderer.on('logs:data', listener)
      return () => { ipcRenderer.removeListener('logs:data', listener) }
    },
    onError: (callback: (streamId: string, error: string) => void): (() => void) => {
      const listener = (_e: any, streamId: string, error: string) => callback(streamId, error)
      ipcRenderer.on('logs:error', listener)
      return () => { ipcRenderer.removeListener('logs:error', listener) }
    },
    onClose: (callback: (streamId: string, code: number) => void): (() => void) => {
      const listener = (_e: any, streamId: string, code: number) => callback(streamId, code)
      ipcRenderer.on('logs:close', listener)
      return () => { ipcRenderer.removeListener('logs:close', listener) }
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
    generateScript: (cfg: any, prompt: string): Promise<{ success: boolean; text?: string; error?: string }> => ipcRenderer.invoke('ai:generateScript', cfg, prompt)
  },
  secure: {
    encrypt: (text: string): Promise<{ success: boolean; data?: string; error?: string }> => ipcRenderer.invoke('secure:encrypt', text),
    decrypt: (cipher: string): Promise<{ success: boolean; data?: string; error?: string }> => ipcRenderer.invoke('secure:decrypt', cipher)
  },
  opsAgent: {
    setConfig: (config: any): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('opsAgent:setConfig', config),
    getConfig: (): Promise<{ success: boolean; data?: any; error?: string }> => ipcRenderer.invoke('opsAgent:getConfig'),
    chat: (requestId: string, options: { serverId?: string; serverName?: string; userInput: string; threadId?: string; historySummary?: string }): Promise<{ success: boolean; requestId?: string; error?: string }> => ipcRenderer.invoke('opsAgent:chat', requestId, options),
    cancel: (requestId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('opsAgent:cancel', requestId),
    approval: (id: string, approved: boolean): Promise<{ success: boolean }> => ipcRenderer.invoke('opsAgent:approval', id, approved),
    // AI 建议命令执行前的风控门禁：黑名单拒绝 + 高危命令统一审批
    approveCommand: (command: string, riskLevel?: string): Promise<{ approved: boolean; riskLevel: string; blocked: boolean }> => ipcRenderer.invoke('opsAgent:approveCommand', { command, riskLevel }),
    onChunk: (callback: (payload: { requestId: string; delta: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; delta: string }) => callback(payload)
      ipcRenderer.on('opsAgent:chunk', listener)
      return () => { ipcRenderer.removeListener('opsAgent:chunk', listener) }
    },
    onReasoning: (callback: (payload: { requestId: string; delta: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; delta: string }) => callback(payload)
      ipcRenderer.on('opsAgent:reasoning', listener)
      return () => { ipcRenderer.removeListener('opsAgent:reasoning', listener) }
    },
    onToolCall: (callback: (payload: { requestId: string; toolName: string; args: any; toolCallId?: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; toolName: string; args: any; toolCallId?: string }) => callback(payload)
      ipcRenderer.on('opsAgent:toolCall', listener)
      return () => { ipcRenderer.removeListener('opsAgent:toolCall', listener) }
    },
    onToolResult: (callback: (payload: { requestId: string; toolName: string; success: boolean; output: any; toolCallId?: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; toolName: string; success: boolean; output: any; toolCallId?: string }) => callback(payload)
      ipcRenderer.on('opsAgent:toolResult', listener)
      return () => { ipcRenderer.removeListener('opsAgent:toolResult', listener) }
    },
    onError: (callback: (payload: { requestId: string; error: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; error: string }) => callback(payload)
      ipcRenderer.on('opsAgent:error', listener)
      return () => { ipcRenderer.removeListener('opsAgent:error', listener) }
    },
    onDone: (callback: (payload: { requestId: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string }) => callback(payload)
      ipcRenderer.on('opsAgent:done', listener)
      return () => { ipcRenderer.removeListener('opsAgent:done', listener) }
    },
    onApprovalRequest: (callback: (payload: { id: string; action: string; riskLevel: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { id: string; action: string; riskLevel: string }) => callback(payload)
      ipcRenderer.on('opsAgent:approval-request', listener)
      return () => { ipcRenderer.removeListener('opsAgent:approval-request', listener) }
    },
    onRoute: (callback: (payload: { requestId: string; route: string }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; route: string }) => callback(payload)
      ipcRenderer.on('opsAgent:route', listener)
      return () => { ipcRenderer.removeListener('opsAgent:route', listener) }
    },
    onUsage: (callback: (payload: { requestId: string; usage: { input: number; output: number } }) => void): (() => void) => {
      const listener = (_e: any, payload: { requestId: string; usage: { input: number; output: number } }) => callback(payload)
      ipcRenderer.on('opsAgent:usage', listener)
      return () => { ipcRenderer.removeListener('opsAgent:usage', listener) }
    }
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
    startPeriodicCollection: (serverId: string, containerIds: string[], interval?: number, appId?: string | null): Promise<{ success: boolean }> => ipcRenderer.invoke('resourceReport:startPeriodicCollection', serverId, containerIds, interval, appId),
    stopPeriodicCollection: (serverId: string, containerIds?: string[]): Promise<{ success: boolean }> => ipcRenderer.invoke('resourceReport:stopPeriodicCollection', serverId, containerIds),
    getActiveCollectionCount: (): Promise<number> => ipcRenderer.invoke('resourceReport:getActiveCollectionCount'),
    getLatestMetrics: (serverId: string): Promise<ResourceMetricRow | null> => ipcRenderer.invoke('resourceReport:getLatestMetrics', serverId),
    getLatestMetricsByContainer: (containerId: string): Promise<ResourceMetricRow | null> => ipcRenderer.invoke('resourceReport:getLatestMetricsByContainer', containerId)
  },
  shellScript: {
    getAll: (): Promise<ShellScript[]> => ipcRenderer.invoke('shellScript:getAll'),
    getById: (id: string): Promise<ShellScript | undefined> => ipcRenderer.invoke('shellScript:getById', id),
    create: (input: ShellScriptInput): Promise<ShellScript | undefined> => ipcRenderer.invoke('shellScript:create', input),
    update: (id: string, input: Partial<ShellScriptInput>, changeNote?: string): Promise<ShellScript | undefined> => ipcRenderer.invoke('shellScript:update', id, input, changeNote),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('shellScript:delete', id),
    getVersions: (scriptId: string): Promise<ShellScriptVersion[]> => ipcRenderer.invoke('shellScript:getVersions', scriptId),
    getVersionById: (id: string): Promise<ShellScriptVersion | undefined> => ipcRenderer.invoke('shellScript:getVersionById', id),
    rollback: (scriptId: string, versionId: string, changeNote?: string): Promise<ShellScript | undefined> => ipcRenderer.invoke('shellScript:rollback', scriptId, versionId, changeNote),
    run: (scriptId: string, options: ShellScriptRunOptions): Promise<ShellScriptRunResult> => ipcRenderer.invoke('shellScript:run', scriptId, options),
    getExecutionLogs: (scriptId?: string, limit?: number): Promise<ShellScriptExecutionLog[]> => ipcRenderer.invoke('shellScript:getExecutionLogs', scriptId, limit),
    deleteExecutionLog: (logId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('shellScript:deleteExecutionLog', logId),
    clearExecutionLogs: (scriptId?: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('shellScript:clearExecutionLogs', scriptId)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

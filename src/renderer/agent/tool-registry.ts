/**
 * 工具注册系统
 * 参考 OpenDev 的工具注册机制
 */

import type { Tool, ToolResult, ValidationResult, RiskLevel } from './types'
import { RISK_PATTERNS } from './types'

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  private static instance: ToolRegistry

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry()
    }
    return ToolRegistry.instance
  }

  // 注册工具
  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  // 批量注册
  registerAll(tools: Tool[]): void {
    tools.forEach(tool => this.register(tool))
  }

  // 获取工具
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  // 获取所有工具
  getAll(): Tool[] {
    return Array.from(this.tools.values())
  }

  // 获取工具列表（用于AI）
  getToolList(): Array<{ name: string; description: string; parameters: any }> {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }

  // 执行工具
  async execute(name: string, params: any): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` }
    }

    // 验证参数
    if (tool.validate) {
      const validation = tool.validate(params)
      if (!validation.valid) {
        return { success: false, error: validation.reason || 'Validation failed' }
      }
    }

    try {
      const startTime = Date.now()
      const result = await tool.execute(params)
      result.executionTime = Date.now() - startTime
      return result
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  // 检查是否需要审批
  requiresApproval(name: string): boolean {
    const tool = this.tools.get(name)
    return tool?.requiresApproval ?? false
  }

  // 获取工具风险等级
  getRiskLevel(name: string): RiskLevel {
    const tool = this.tools.get(name)
    return tool?.riskLevel ?? 'low'
  }
}

// 内置工具定义
export const createBuiltInTools = (): Tool[] => [
  {
    name: 'shell_execute',
    description: '在远程服务器上执行Shell命令',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        serverId: { type: 'string', description: '服务器ID' },
        timeout: { type: 'number', description: '超时时间(ms)', default: 30000 }
      },
      required: ['command', 'serverId']
    },
    execute: async (params) => {
      const result = await window.electronAPI.server.executeCommand(
        params.serverId,
        params.command
      )
      return {
        success: result.success,
        data: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
        error: result.success ? undefined : result.stderr
      }
    },
    validate: (params) => {
      // 命令注入检测
      if (params.command.includes(';') || params.command.includes('&&') || params.command.includes('||')) {
        // 只允许简单的命令链
        const allowedChains = ['&&', '||']
        for (const chain of allowedChains) {
          if (params.command.includes(chain)) {
            // 检查是否是安全的链
            const parts = params.command.split(chain).map((s: string) => s.trim())
            for (const part of parts) {
              if (isDangerousCommand(part)) {
                return { valid: false, reason: `Dangerous command detected: ${part}` }
              }
            }
          }
        }
      }
      
      if (isDangerousCommand(params.command)) {
        return { valid: false, reason: 'High risk command detected' }
      }
      
      return { valid: true }
    },
    riskLevel: 'medium',
    requiresApproval: false
  },

  {
    name: 'file_read',
    description: '读取远程服务器上的文件',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        serverId: { type: 'string', description: '服务器ID' }
      },
      required: ['path', 'serverId']
    },
    execute: async (params) => {
      const result = await window.electronAPI.server.executeCommand(
        params.serverId,
        `cat "${params.path}"`
      )
      return {
        success: result.success,
        data: result.stdout,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'file_write',
    description: '写入文件到远程服务器',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' },
        serverId: { type: 'string', description: '服务器ID' }
      },
      required: ['path', 'content', 'serverId']
    },
    execute: async (params) => {
      // 使用base64编码避免转义问题
      const base64Content = btoa(params.content)
      const result = await window.electronAPI.server.executeCommand(
        params.serverId,
        `echo "${base64Content}" | base64 -d > "${params.path}"`
      )
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'medium',
    requiresApproval: true
  },

  {
    name: 'docker_exec',
    description: '在Docker容器中执行命令',
    parameters: {
      type: 'object',
      properties: {
        container: { type: 'string', description: '容器名称或ID' },
        command: { type: 'string', description: '要执行的命令' },
        serverId: { type: 'string', description: '服务器ID' }
      },
      required: ['container', 'command', 'serverId']
    },
    execute: async (params) => {
      const result = await window.electronAPI.server.executeCommand(
        params.serverId,
        `docker exec ${params.container} ${params.command}`
      )
      return {
        success: result.success,
        data: { stdout: result.stdout, stderr: result.stderr },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'medium',
    requiresApproval: false
  },

  {
    name: 'docker_logs',
    description: '获取Docker容器日志',
    parameters: {
      type: 'object',
      properties: {
        container: { type: 'string', description: '容器名称或ID' },
        serverId: { type: 'string', description: '服务器ID' },
        tail: { type: 'number', description: '显示最后N行', default: 100 }
      },
      required: ['container', 'serverId']
    },
    execute: async (params) => {
      const result = await window.electronAPI.server.executeCommand(
        params.serverId,
        `docker logs --tail ${params.tail || 100} ${params.container}`
      )
      return {
        success: result.success,
        data: result.stdout,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'system_info',
    description: '获取系统信息',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        type: { type: 'string', description: '信息类型', enum: ['cpu', 'memory', 'disk', 'all'] }
      },
      required: ['serverId', 'type']
    },
    execute: async (params) => {
      let command = ''
      switch (params.type) {
        case 'cpu':
          command = "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"
          break
        case 'memory':
          command = "free | grep Mem | awk '{printf \"%.2f\", ($3/$2) * 100}'"
          break
        case 'disk':
          command = "df / | tail -1 | awk '{print $5}' | sed 's/%//'"
          break
        case 'all':
        default:
          command = `echo "CPU: $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')%" && echo "Memory: $(free | grep Mem | awk '{printf "%.2f", ($3/$2) * 100}')%" && echo "Disk: $(df / | tail -1 | awk '{print $5}')"`
      }
      
      const result = await window.electronAPI.server.executeCommand(params.serverId, command)
      return {
        success: result.success,
        data: result.stdout,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'service_control',
    description: '控制系统服务',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: '服务名称' },
        action: { type: 'string', description: '操作', enum: ['start', 'stop', 'restart', 'status', 'enable', 'disable'] },
        serverId: { type: 'string', description: '服务器ID' }
      },
      required: ['service', 'action', 'serverId']
    },
    execute: async (params) => {
      const result = await window.electronAPI.server.executeCommand(
        params.serverId,
        `systemctl ${params.action} ${params.service}`
      )
      return {
        success: result.success,
        data: { stdout: result.stdout, stderr: result.stderr },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'high',
    requiresApproval: true
  },

  {
    name: 'package_manager',
    description: '包管理器操作',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作', enum: ['install', 'remove', 'update', 'search', 'list'] },
        package: { type: 'string', description: '包名称' },
        serverId: { type: 'string', description: '服务器ID' },
        manager: { type: 'string', description: '包管理器', enum: ['apt', 'yum', 'dnf', 'pip', 'npm'] }
      },
      required: ['action', 'serverId']
    },
    execute: async (params) => {
      let command = ''
      const manager = params.manager || 'apt'
      
      switch (params.action) {
        case 'install':
          command = `${manager} install -y ${params.package}`
          break
        case 'remove':
          command = `${manager} remove -y ${params.package}`
          break
        case 'update':
          command = `${manager} update && ${manager} upgrade -y`
          break
        case 'search':
          command = `${manager} search ${params.package}`
          break
        case 'list':
          command = `${manager} list --installed`
          break
      }
      
      const result = await window.electronAPI.server.executeCommand(params.serverId, command)
      return {
        success: result.success,
        data: result.stdout,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'high',
    requiresApproval: true
  },

  {
    name: 'network_diagnostic',
    description: '网络诊断工具',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标主机' },
        serverId: { type: 'string', description: '服务器ID' },
        type: { type: 'string', description: '诊断类型', enum: ['ping', 'traceroute', 'netstat', 'curl', 'dig'] }
      },
      required: ['target', 'serverId', 'type']
    },
    execute: async (params) => {
      let command = ''
      switch (params.type) {
        case 'ping':
          command = `ping -c 4 ${params.target}`
          break
        case 'traceroute':
          command = `traceroute ${params.target}`
          break
        case 'netstat':
          command = `netstat -tuln`
          break
        case 'curl':
          command = `curl -I ${params.target}`
          break
        case 'dig':
          command = `dig ${params.target}`
          break
      }
      
      const result = await window.electronAPI.server.executeCommand(params.serverId, command)
      return {
        success: result.success,
        data: result.stdout,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'process_manager',
    description: '进程管理',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作', enum: ['list', 'kill', 'info'] },
        serverId: { type: 'string', description: '服务器ID' },
        pid: { type: 'number', description: '进程ID' },
        name: { type: 'string', description: '进程名称' }
      },
      required: ['action', 'serverId']
    },
    execute: async (params) => {
      let command = ''
      switch (params.action) {
        case 'list':
          command = 'ps aux --sort=-%mem'
          break
        case 'kill':
          command = `kill -9 ${params.pid}`
          break
        case 'info':
          command = `ps -p ${params.pid} -o pid,ppid,user,%cpu,%mem,command`
          break
      }
      
      const result = await window.electronAPI.server.executeCommand(params.serverId, command)
      return {
        success: result.success,
        data: result.stdout,
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'medium',
    requiresApproval: false
  },

  // ==================== 扩展工具 ====================

  {
    name: 'log_analyze',
    description: '分析日志文件，提取错误、警告和关键信息',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        logPath: { type: 'string', description: '日志文件路径' },
        lines: { type: 'number', description: '分析最后N行', default: 100 },
        pattern: { type: 'string', description: '过滤正则表达式', default: 'error|warn|fatal|failed' }
      },
      required: ['serverId', 'logPath']
    },
    execute: async (params) => {
      const cmd = `tail -n ${params.lines || 100} "${params.logPath}" | grep -iE "${params.pattern || 'error|warn|fatal|failed'}" | tail -50`
      const result = await window.electronAPI.server.executeCommand(params.serverId, cmd)
      return {
        success: result.success,
        data: { logs: result.stdout, errorCount: (result.stdout.match(/error/gi) || []).length },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'config_edit',
    description: '安全地编辑配置文件（支持备份和回滚）',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        filePath: { type: 'string', description: '配置文件路径' },
        key: { type: 'string', description: '配置键' },
        value: { type: 'string', description: '配置值' },
        createBackup: { type: 'boolean', description: '是否创建备份', default: true }
      },
      required: ['serverId', 'filePath', 'key', 'value']
    },
    execute: async (params) => {
      // 先创建备份
      if (params.createBackup !== false) {
        const backupCmd = `cp "${params.filePath}" "${params.filePath}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true`
        await window.electronAPI.server.executeCommand(params.serverId, backupCmd)
      }
      // 使用 sed 修改配置
      const cmd = `sed -i 's|^${params.key}\\s*=.*|${params.key}=${params.value}|' "${params.filePath}" || echo "${params.key}=${params.value}" >> "${params.filePath}"`
      const result = await window.electronAPI.server.executeCommand(params.serverId, cmd)
      return {
        success: result.success,
        data: { message: `配置已更新: ${params.key}=${params.value}` },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'medium',
    requiresApproval: true
  },

  {
    name: 'file_search',
    description: '在服务器上搜索文件内容',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        path: { type: 'string', description: '搜索路径', default: '/' },
        pattern: { type: 'string', description: '搜索模式（grep 正则）' },
        fileType: { type: 'string', description: '文件类型过滤', default: '' },
        maxResults: { type: 'number', description: '最大结果数', default: 50 }
      },
      required: ['serverId', 'pattern']
    },
    execute: async (params) => {
      const typeFilter = params.fileType ? `--include="${params.fileType}"` : ''
      const cmd = `grep -r ${typeFilter} -l "${params.pattern}" ${params.path || '/etc'} 2>/dev/null | head -${params.maxResults || 50}`
      const result = await window.electronAPI.server.executeCommand(params.serverId, cmd)
      return {
        success: result.success,
        data: { files: result.stdout.split('\n').filter(Boolean) },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'cron_manager',
    description: '管理定时任务（crontab）',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        action: { type: 'string', description: '操作', enum: ['list', 'add', 'remove'] },
        cronExpression: { type: 'string', description: 'Cron 表达式（add时必填）' },
        command: { type: 'string', description: '要执行的命令（add时必填）' },
        comment: { type: 'string', description: '任务备注' }
      },
      required: ['serverId', 'action']
    },
    execute: async (params) => {
      let cmd = ''
      switch (params.action) {
        case 'list':
          cmd = 'crontab -l 2>/dev/null || echo "No crontab"'
          break
        case 'add':
          if (!params.cronExpression || !params.command) {
            return { success: false, error: 'cronExpression and command are required for add action' }
          }
          const comment = params.comment ? `# ${params.comment}` : ''
          cmd = `(crontab -l 2>/dev/null; echo "${params.cronExpression} ${params.command} ${comment}") | crontab -`
          break
        case 'remove':
          if (!params.command) {
            return { success: false, error: 'command is required for remove action' }
          }
          cmd = `crontab -l 2>/dev/null | grep -v "${params.command}" | crontab -`
          break
      }
      const result = await window.electronAPI.server.executeCommand(params.serverId, cmd)
      return {
        success: result.success,
        data: { output: result.stdout },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'medium',
    requiresApproval: params => params.action !== 'list'
  },

  {
    name: 'ssl_check',
    description: '检查 SSL 证书状态和过期时间',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        domain: { type: 'string', description: '域名' },
        port: { type: 'number', description: '端口', default: 443 }
      },
      required: ['serverId', 'domain']
    },
    execute: async (params) => {
      const cmd = `echo | openssl s_client -servername ${params.domain} -connect ${params.domain}:${params.port || 443} 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null`
      const result = await window.electronAPI.server.executeCommand(params.serverId, cmd)
      return {
        success: result.success,
        data: { certInfo: result.stdout },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  },

  {
    name: 'backup_create',
    description: '创建文件或目录备份',
    parameters: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '服务器ID' },
        sourcePath: { type: 'string', description: '要备份的路径' },
        backupDir: { type: 'string', description: '备份存储目录', default: '/tmp/backups' },
        compress: { type: 'boolean', description: '是否压缩', default: true }
      },
      required: ['serverId', 'sourcePath']
    },
    execute: async (params) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupName = `${params.sourcePath.split('/').pop()}_${timestamp}`
      const backupPath = `${params.backupDir || '/tmp/backups'}/${backupName}`
      
      let cmd = `mkdir -p "${params.backupDir || '/tmp/backups'}" && `
      if (params.compress !== false) {
        cmd += `tar -czf "${backupPath}.tar.gz" -C "$(dirname ${params.sourcePath})" "$(basename ${params.sourcePath})"`
      } else {
        cmd += `cp -r "${params.sourcePath}" "${backupPath}"`
      }
      
      const result = await window.electronAPI.server.executeCommand(params.serverId, cmd)
      return {
        success: result.success,
        data: { backupPath: params.compress !== false ? `${backupPath}.tar.gz` : backupPath },
        error: result.success ? undefined : result.stderr
      }
    },
    riskLevel: 'low',
    requiresApproval: false
  }
]

// 辅助函数：检测危险命令
function isDangerousCommand(command: string): boolean {
  const lowerCmd = command.toLowerCase()
  
  for (const pattern of RISK_PATTERNS.high) {
    if (pattern.test(lowerCmd)) return true
  }
  
  return false
}

// 辅助函数：评估命令风险等级
export function assessRiskLevel(command: string): RiskLevel {
  const lowerCmd = command.toLowerCase()
  
  for (const pattern of RISK_PATTERNS.high) {
    if (pattern.test(lowerCmd)) return 'high'
  }
  
  for (const pattern of RISK_PATTERNS.medium) {
    if (pattern.test(lowerCmd)) return 'medium'
  }
  
  return 'low'
}

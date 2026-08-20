/**
 * 运维 Agent - 基于 Mastra + Vercel AI SDK
 * Agent / 工具 / Memory 全部由 Mastra 管理，工具直接调用 sshService
 */
import { z } from 'zod'
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import log from 'electron-log'
import { sshService } from '../ssh'
import { createAIModel } from './ai-model'
import { createSqliteMemoryStorage } from './sqlite-memory-store'

// ==================== 类型 ====================

export interface AgentModelConfig {
  provider: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  baseUrl: string
  systemPrompt: string
  azureEndpoint?: string
  azureDeployment?: string
  apiVersion?: string
  enableHistory?: boolean
  commandTimeout?: number
  maxIterations?: number
  commandBlocklist?: string[]
  approvalMode?: 'manual' | 'auto'
  enableWebSearch?: boolean
}

export interface ChatCallbacks {
  onDelta?: (delta: string) => void
  onToolCall?: (toolName: string, args: any, toolCallId?: string) => void
  onToolResult?: (toolName: string, success: boolean, output: any, toolCallId?: string) => void
  onError?: (error: string) => void
  onDone?: () => void
}

// ==================== Mastra 动态加载 ====================

let mastraModule: any = null
async function getMastra(): Promise<any> {
  if (!mastraModule) {
    const [agent, tools, storage, memory] = await Promise.all([
      import('@mastra/core/agent'),
      import('@mastra/core/tools'),
      import('@mastra/core/storage'),
      import('@mastra/memory')
    ])
    mastraModule = {
      Agent: agent.Agent,
      createTool: tools.createTool,
      MastraCompositeStore: storage.MastraCompositeStore,
      Memory: memory.Memory
    }
  }
  return mastraModule
}

// ==================== 配置管理 ====================

let currentConfig: AgentModelConfig | null = null
let agentInstance: any = null
let toolsInstance: Record<string, any> | null = null

export function setAgentModelConfig(config: AgentModelConfig): void {
  currentConfig = config
  agentInstance = null // 配置变化时重建 Agent
  toolsInstance = null // 工具集可能随配置变化（如 Web 搜索开关）
  log.info(`[ops-agent] 模型配置已更新: provider=${config.provider}, model=${config.model || '(未设置)'}, baseUrl=${config.baseUrl || '(默认)'}`)
}

export function getAgentConfig(): AgentModelConfig | null {
  return currentConfig ? { ...currentConfig } : null
}

// ==================== 人工审批 ====================

type ApprovalSender = (payload: { id: string; action: string; riskLevel: string }) => void
let approvalSender: ApprovalSender | null = null
const pendingApprovals = new Map<string, (approved: boolean) => void>()

export function setApprovalSender(sender: ApprovalSender): void {
  approvalSender = sender
}

export function resolveApproval(id: string, approved: boolean): void {
  const resolve = pendingApprovals.get(id)
  if (resolve) {
    resolve(approved)
    pendingApprovals.delete(id)
  }
}

// 审批：带超时（默认 60s 未响应视为拒绝，避免工具永久挂起）
async function requestApproval(action: string, riskLevel: string, timeoutMs = 60000): Promise<boolean> {
  // 自动审批模式（配置 approvalMode=auto）直接放行
  if (currentConfig?.approvalMode === 'auto') {
    log.warn(`[ops-agent] 自动审批模式放行: risk=${riskLevel}, action=${action.slice(0, 80)}`)
    return true
  }
  return new Promise((resolve) => {
    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const timer = setTimeout(() => {
      pendingApprovals.delete(id)
      log.warn(`[ops-agent] 审批超时自动拒绝: id=${id}, action=${action.slice(0, 80)}`)
      resolve(false)
    }, timeoutMs)
    pendingApprovals.set(id, (approved) => {
      clearTimeout(timer)
      pendingApprovals.delete(id)
      log.info(`[ops-agent] 审批${approved ? '通过' : '拒绝'}: id=${id}, action=${action.slice(0, 80)}`)
      resolve(approved)
    })
    approvalSender?.({ id, action, riskLevel })
    log.info(`[ops-agent] 已发起审批请求: id=${id}, risk=${riskLevel}, action=${action.slice(0, 80)}`)
  })
}

// 命令黑名单（来自配置，命中直接拒绝执行，无需审批）
function isBlocklisted(command: string): boolean {
  const list = currentConfig?.commandBlocklist || []
  return list.some(block => block && command.includes(block))
}

// 危险命令检测
const HIGH_RISK_PATTERNS = [
  /rm\s+-rf/i, /mkfs/i, /dd\s+if=\/dev\/zero/i, /chmod\s+777/i,
  /chown\s+-R\s+root/i, /iptables\s+-F/i, /systemctl\s+(stop|disable)/i,
  /docker\s+rm\s+-f/i, /kubectl\s+delete/i, /DROP\s+TABLE/i, /TRUNCATE/i,
  /fdisk/i, /parted/i, /mkfs\./i
]

// ==================== 工具执行 ====================

// 工具输出上限（保护上下文窗口与前端渲染）
const MAX_TOOL_OUTPUT = 8000

async function exec(serverId: string, command: string, timeout = 30000): Promise<{ success: boolean; output: string; exitCode: number }> {
  // 命令默认超时优先使用配置中的 commandTimeout（Netcatty 风格的 AI 命令超时设置）
  const effTimeout = timeout || currentConfig?.commandTimeout || 30000
  const r = await sshService.executeCommand(serverId, command, 2, 1000, effTimeout)
  let output = r.success ? r.stdout : r.stderr
  if (output.length > MAX_TOOL_OUTPUT) {
    output = `${output.slice(0, MAX_TOOL_OUTPUT)}\n... [输出已截断，共 ${output.length} 字符]`
  }
  return { success: r.success, output, exitCode: r.exitCode }
}

// ==================== 工具定义 ====================

async function createOpsTools(): Promise<Record<string, any>> {
  if (toolsInstance) return toolsInstance

  const { createTool } = await getMastra()
  interface ToolDef {
    id: string
    description: string
    inputSchema: any
    execute: (input: any, context?: any) => Promise<any>
  }
  const mk = (opts: ToolDef) => createTool(opts as any)
  const srv = (extra?: any) => z.object({ serverId: z.string().describe('服务器ID'), ...(extra || {}) })

  toolsInstance = {
    // 通用命令执行（危险命令需审批）
    shell_execute: mk({
      id: 'shell_execute',
      description: '在远程服务器上执行Shell命令。读取/查询类命令直接执行；删除、格式化等危险操作会请求用户审批；命中黑名单的命令直接拒绝。',
      inputSchema: srv({ command: z.string().describe('要执行的命令'), timeout: z.number().optional().describe('超时毫秒，默认30000') }),
      execute: async ({ serverId, command, timeout }) => {
        if (isBlocklisted(command)) {
          log.warn(`[ops-agent] 黑名单拦截命令: ${command.slice(0, 80)}`)
          return { success: false, output: `命令被黑名单拦截，已拒绝执行: ${command.slice(0, 100)}`, exitCode: -1 }
        }
        if (HIGH_RISK_PATTERNS.some(p => p.test(command))) {
          const ok = await requestApproval(`执行高危命令: ${command}`, 'high')
          if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
        }
        return exec(serverId, command, timeout)
      }
    }),

    // 综合健康检查
    health_check: mk({
      id: 'health_check',
      description: '综合健康检查：系统信息/CPU/内存/磁盘/负载/Docker状态/系统错误日志',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId, [
        'echo "=== 系统 ==="; uname -a; uptime',
        'echo "=== CPU ==="; top -bn1 | grep "Cpu(s)"',
        'echo "=== 内存 ==="; free -h',
        'echo "=== 磁盘 ==="; df -h | grep -vE "tmpfs|overlay"',
        'echo "=== Docker ==="; docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" 2>/dev/null || echo "Docker未运行"',
        'echo "=== 错误日志 ==="; journalctl -p err -n 10 --no-pager 2>/dev/null || echo "无journalctl"'
      ].join('\n'), 30000)
    }),

    docker_ps: mk({
      id: 'docker_ps',
      description: '列出Docker容器',
      inputSchema: srv({ all: z.boolean().optional().describe('是否包含已停止容器') }),
      execute: async ({ serverId, all }) => exec(serverId, all ? 'docker ps -a' : 'docker ps')
    }),

    docker_logs: mk({
      id: 'docker_logs',
      description: '获取Docker容器日志',
      inputSchema: srv({ container: z.string().describe('容器名称或ID'), tail: z.number().optional().describe('最后N行，默认100') }),
      execute: async ({ serverId, container, tail }) => exec(serverId, `docker logs --tail ${tail || 100} ${container}`, 15000)
    }),

    docker_stats: mk({
      id: 'docker_stats',
      description: '查看Docker容器资源占用（CPU/内存）',
      inputSchema: srv({ container: z.string().optional().describe('容器名称或ID，默认全部') }),
      execute: async ({ serverId, container }) => exec(serverId, `docker stats --no-stream${container ? ` ${container}` : ''}`, 15000)
    }),

    docker_images: mk({
      id: 'docker_images',
      description: '列出Docker镜像',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId, 'docker images')
    }),

    docker_inspect: mk({
      id: 'docker_inspect',
      description: '查看Docker容器详细配置',
      inputSchema: srv({ container: z.string().describe('容器名称或ID') }),
      execute: async ({ serverId, container }) => exec(serverId, `docker inspect ${container}`, 15000)
    }),

    docker_exec: mk({
      id: 'docker_exec',
      description: '在Docker容器内执行命令',
      inputSchema: srv({ container: z.string().describe('容器名称或ID'), command: z.string().describe('要执行的命令') }),
      execute: async ({ serverId, container, command }) => exec(serverId, `docker exec ${container} ${command}`, 30000)
    }),

    // 重启容器（需审批）
    docker_restart: mk({
      id: 'docker_restart',
      description: '重启Docker容器（需要用户审批）',
      inputSchema: srv({ container: z.string().describe('容器名称或ID') }),
      execute: async ({ serverId, container }) => {
        const ok = await requestApproval(`重启容器: ${container}`, 'medium')
        if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
        return exec(serverId, `docker restart ${container}`, 30000)
      }
    }),

    system_info: mk({
      id: 'system_info',
      description: '获取系统 CPU/内存/磁盘 使用率',
      inputSchema: srv({ type: z.enum(['cpu', 'memory', 'disk', 'all']).describe('信息类型') }),
      execute: async ({ serverId, type }) => {
        const cmds: Record<string, string> = {
          cpu: "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'",
          memory: "free | grep Mem | awk '{printf \"%.2f\", ($3/$2) * 100}'",
          disk: "df / | tail -1 | awk '{print $5}' | sed 's/%//'",
          all: 'echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk \'{print $2}\')%" && echo "Memory: $(free | grep Mem | awk \'{printf "%.2f", ($3/$2) * 100}\')%" && echo "Disk: $(df / | tail -1 | awk \'{print $5}\')"'
        }
        return exec(serverId, cmds[type] || cmds.all)
      }
    }),

    // 服务控制（需审批）
    service_control: mk({
      id: 'service_control',
      description: '控制系统服务（start/stop/restart/status/enable/disable，变更类操作需审批）',
      inputSchema: srv({
        service: z.string().describe('服务名称'),
        action: z.enum(['start', 'stop', 'restart', 'status', 'enable', 'disable']).describe('操作')
      }),
      execute: async ({ serverId, service, action }) => {
        if (action !== 'status') {
          const ok = await requestApproval(`${action} 服务: ${service}`, 'medium')
          if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
        }
        return exec(serverId, `systemctl ${action} ${service}`, 30000)
      }
    }),

    network_diagnostic: mk({
      id: 'network_diagnostic',
      description: '网络诊断：ping/traceroute/netstat/curl/dig',
      inputSchema: srv({
        type: z.enum(['ping', 'traceroute', 'netstat', 'curl', 'dig']).describe('诊断类型'),
        target: z.string().optional().describe('目标主机/URL（ping等需要）')
      }),
      execute: async ({ serverId, type, target }) => {
        const cmds: Record<string, string> = {
          ping: `ping -c 4 ${target}`,
          traceroute: `traceroute ${target}`,
          netstat: 'netstat -tuln',
          curl: `curl -I --connect-timeout 5 ${target}`,
          dig: `dig ${target}`
        }
        return exec(serverId, cmds[type], 20000)
      }
    }),

    process_manager: mk({
      id: 'process_manager',
      description: '进程管理：list/info/kill（kill需审批）',
      inputSchema: srv({
        action: z.enum(['list', 'info', 'kill']).describe('操作'),
        pid: z.number().optional().describe('进程ID（info/kill需要）'),
        name: z.string().optional().describe('进程名（list可按名过滤）')
      }),
      execute: async ({ serverId, action, pid, name }) => {
        if (action === 'kill') {
          const ok = await requestApproval(`杀死进程 PID ${pid}`, 'medium')
          if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
          return exec(serverId, `kill -9 ${pid}`, 15000)
        }
        if (action === 'info') return exec(serverId, `ps -p ${pid} -o pid,ppid,user,%cpu,%mem,command`)
        return exec(serverId, name ? `ps aux | grep -i "${name}" | grep -v grep` : 'ps aux --sort=-%mem | head -20', 15000)
      }
    }),

    log_analyze: mk({
      id: 'log_analyze',
      description: '分析日志文件，提取错误/警告',
      inputSchema: srv({
        logPath: z.string().describe('日志文件路径'),
        lines: z.number().optional().describe('分析最后N行，默认100'),
        pattern: z.string().optional().describe('过滤正则，默认 error|warn|fatal|failed')
      }),
      execute: async ({ serverId, logPath, lines, pattern }) => exec(serverId, `tail -n ${lines || 100} "${logPath}" | grep -iE "${pattern || 'error|warn|fatal|failed'}" | tail -50`, 15000)
    }),

    file_read: mk({
      id: 'file_read',
      description: '读取服务器上的文件',
      inputSchema: srv({ path: z.string().describe('文件路径') }),
      execute: async ({ serverId, path }) => exec(serverId, `cat "${path}"`, 15000)
    }),

    // 端口占用排查
    port_check: mk({
      id: 'port_check',
      description: '排查端口占用情况，可指定端口查看监听进程',
      inputSchema: srv({ port: z.number().optional().describe('端口号，不填则列出全部监听端口') }),
      execute: async ({ serverId, port }) => exec(serverId, port
        ? `ss -tlnp | grep -E "(:${port}\\s)" || (lsof -i:${port} 2>/dev/null || echo "端口 ${port} 未被占用")`
        : 'ss -tlnp | head -40', 15000)
    }),

    // Docker Compose 管理（变更需审批）
    docker_compose: mk({
      id: 'docker_compose',
      description: 'Docker Compose 项目管理（ps/logs 只读直接执行；up/down/restart 变更操作需审批）',
      inputSchema: srv({
        action: z.enum(['ps', 'logs', 'up', 'down', 'restart']).describe('操作'),
        projectPath: z.string().describe('docker-compose.yml 所在目录'),
        service: z.string().optional().describe('服务名（可选，针对单个服务）')
      }),
      execute: async ({ serverId, action, projectPath, service }) => {
        const svc = service ? ` ${service}` : ''
        // 兼容 Compose V1（docker-compose）与 V2（docker compose 插件）
        const c = (cmd: string) =>
          `cd ${projectPath} && (docker compose -f docker-compose.yml ${cmd} 2>/dev/null || docker-compose -f docker-compose.yml ${cmd})`
        if (action === 'up') {
          const ok = await requestApproval(`启动 Compose 项目: ${projectPath}${svc}`, 'medium')
          if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
          return exec(serverId, c(`up -d${svc}`), 60000)
        }
        if (action === 'down') {
          const ok = await requestApproval(`停止 Compose 项目: ${projectPath}`, 'medium')
          if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
          return exec(serverId, c('down'), 60000)
        }
        if (action === 'restart') {
          const ok = await requestApproval(`重启 Compose 服务: ${projectPath}${svc}`, 'medium')
          if (!ok) return { success: false, output: '用户拒绝了此操作', exitCode: -1 }
          return exec(serverId, c(`restart${svc}`), 60000)
        }
        if (action === 'logs') return exec(serverId, c(`logs --tail 100${svc}`), 20000)
        return exec(serverId, c('ps'), 15000)
      }
    }),

    // Docker 网络
    docker_network: mk({
      id: 'docker_network',
      description: '查看 Docker 网络（list/inspect）',
      inputSchema: srv({ network: z.string().optional().describe('网络名称，不填则列出全部') }),
      execute: async ({ serverId, network }) => exec(serverId, network ? `docker network inspect ${network}` : 'docker network ls', 15000)
    }),

    // Docker 数据卷
    docker_volume: mk({
      id: 'docker_volume',
      description: '查看 Docker 数据卷',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId, 'docker volume ls', 15000)
    }),

    // 定时任务
    crontab_list: mk({
      id: 'crontab_list',
      description: '查看当前用户的定时任务（crontab）',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId, 'crontab -l 2>/dev/null || echo "当前用户无定时任务"', 15000)
    }),

    // 防火墙状态
    firewall_status: mk({
      id: 'firewall_status',
      description: '查看防火墙状态与规则（ufw / firewalld）',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId,
        '(command -v ufw >/dev/null && echo "== ufw ==" && ufw status verbose) || (command -v firewall-cmd >/dev/null && echo "== firewalld ==" && firewall-cmd --list-all) || echo "未检测到 ufw/firewalld"', 15000)
    }),

    // 磁盘占用 TOP
    disk_usage: mk({
      id: 'disk_usage',
      description: '查看磁盘空间与目录占用 TOP（排查磁盘满问题）',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId,
        'echo "== 磁盘使用 =="; df -h | grep -vE "tmpfs|overlay"; echo "== 目录占用 TOP =="; du -sh /var /home /opt /tmp /root /srv /usr/local 2>/dev/null | sort -rh | head -15', 30000)
    }),

    // 系统更新检查（只读）
    system_update_check: mk({
      id: 'system_update_check',
      description: '检查系统可更新软件包（只读，不执行安装）',
      inputSchema: srv(),
      execute: async ({ serverId }) => exec(serverId,
        '(command -v apt >/dev/null && echo "== apt 可更新 ==" && apt list --upgradable 2>/dev/null | head -20) || (command -v yum >/dev/null && echo "== yum 可更新 ==" && yum check-update -q 2>/dev/null | head -20) || echo "无法检测更新源"', 30000)
    })
  }

  // Web 搜索工具（配置启用时注入；参考 Netcatty webSearchConfig，用 DuckDuckGo 即时搜索，无需 API Key）
  if (currentConfig?.enableWebSearch) {
    toolsInstance.web_search = mk({
      id: 'web_search',
      description: '联网搜索技术资料（DuckDuckGo 即时搜索）。用于查询不熟悉的报错信息、命令用法、版本兼容性等。',
      inputSchema: z.object({ query: z.string().describe('搜索关键词') }),
      execute: async ({ query }) => {
        try {
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
          if (!res.ok) return { success: false, output: `搜索失败: HTTP ${res.status}`, exitCode: -1 }
          const data: any = await res.json()
          const parts: string[] = []
          if (data.AbstractText) parts.push(data.AbstractText)
          if (data.AbstractURL) parts.push(`来源: ${data.AbstractURL}`)
          const topics = (data.RelatedTopics || [])
            .filter((t: any) => typeof t === 'object' && t.Text)
            .slice(0, 6)
            .map((t: any) => `- ${t.Text}`)
          if (topics.length > 0) parts.push('相关结果:', ...topics)
          const output = parts.length > 0 ? parts.join('\n') : '未找到相关搜索结果'
          return { success: true, output, exitCode: 0 }
        } catch (e: any) {
          return { success: false, output: `搜索失败: ${e?.message || String(e)}`, exitCode: -1 }
        }
      }
    })
  }

  return toolsInstance
}

// ==================== Agent ====================

const DEFAULT_INSTRUCTIONS = `你是一个专业的服务器运维 AI 助手，负责管理和诊断远程服务器。

核心能力：
1. 使用工具执行实际运维操作（查看容器、日志、系统状态、执行命令），绝不编造数据
2. 分析系统问题根因，给出可执行的修复方案
3. 高风险操作（删除、重启、停止服务、kill 进程、compose 变更等）会触发人工审批，请先说明操作目的
4. 回答时先给出分析和结论，再简要说明执行了哪些操作，不要重复粘贴工具输出的原始全文
5. 排查问题时可组合多个工具交叉验证（如磁盘占用 + 容器状态 + 日志），一步步缩小范围
6. 支持多轮工具调用：根据上一步结果决定下一步，直到定位根因或完成任务

安全规则：
- 读取/查询类操作直接执行
- 删除、格式化、重启、停止服务等破坏性操作必须谨慎，说明原因
- 不确定的命令先查询再执行
- 批量/高影响操作前先向用户说明影响范围`

let memoryDb: Database.Database | null = null

async function getAgent(): Promise<any> {
  if (agentInstance) return agentInstance
  const { Agent, MastraCompositeStore, Memory } = await getMastra()
  const cfg = currentConfig
  if (!cfg || !cfg.model) throw new Error('请先配置 AI 模型')
  if (cfg.provider !== 'ollama' && !cfg.apiKey) throw new Error('请先配置 API Key')

  const model = await createAIModel(cfg.provider, cfg.apiKey, cfg.model, cfg.baseUrl || undefined, cfg)
  const tools = await createOpsTools()

  // 基于 better-sqlite3 的持久化 Memory（文件位于用户数据目录）
  if (!memoryDb) {
    const dbPath = join(app.getPath('userData'), 'mastra-memory.db')
    memoryDb = new Database(dbPath)
    memoryDb.pragma('journal_mode = WAL')
  }
  const memoryDomain = await createSqliteMemoryStorage(memoryDb)
  const storage = new MastraCompositeStore({ id: 'sqlite-memory', domains: { memory: memoryDomain } })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })

  agentInstance = new Agent({
    name: 'ops-agent',
    instructions: cfg.systemPrompt || DEFAULT_INSTRUCTIONS,
    model,
    tools,
    memory
  })
  log.info(`[ops-agent] Agent 构建完成: model=${cfg.model}, provider=${cfg.provider}, 工具数=${Object.keys(tools).length}`)
  return agentInstance
}

// ==================== 对话 ====================

export async function chatWithAgent(params: {
  serverId?: string
  serverName?: string
  userInput: string
  threadId: string
  callbacks: ChatCallbacks
  signal?: AbortSignal
}): Promise<void> {
  const { serverId, serverName, userInput, threadId, callbacks, signal } = params
  const agent = await getAgent()
  const cfg = currentConfig
  log.info(`[ops-agent] 对话开始: thread=${threadId}, server=${serverName || serverId || '(未选择)'}, input=${userInput.slice(0, 80)}`)

  const messages: any[] = []
  if (serverId) {
    // 智能上下文感知：注入服务器标识，帮助 AI 精准定位目标主机
    messages.push({
      role: 'system',
      content: `[服务器上下文] 当前目标服务器: ${serverName || '未命名'} (ID: ${serverId})。执行任何远程操作时，工具参数中的 serverId 必须填 ${serverId}。`
    })
  }
  messages.push({ role: 'user', content: userInput })

  try {
    // Mastra 1.x: stream() 返回 Promise<MastraModelOutput>，需 await 后消费 fullStream
    // Memory 需要同时提供 thread 与 resource；透传温度/最大Token/maxSteps 限制工具循环
    const result = await agent.stream(messages, {
      memory: { thread: threadId, resource: 'default' },
      abortSignal: signal,
      maxSteps: cfg?.maxIterations || 15,
      modelSettings: cfg ? {
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens
      } : undefined
    })
    for await (const chunk of result.fullStream) {
      if (signal?.aborted) break
      switch (chunk.type) {
        case 'text-delta':
          callbacks.onDelta?.(chunk.payload?.text || '')
          break
        case 'tool-call':
          callbacks.onToolCall?.(chunk.payload?.toolName, chunk.payload?.args, chunk.payload?.toolCallId)
          break
        case 'tool-result':
          callbacks.onToolResult?.(chunk.payload?.toolName, !chunk.payload?.isError, chunk.payload?.result, chunk.payload?.toolCallId)
          break
        case 'tool-error':
          // 工具执行出错：按 tool-result 失败转发，避免前端卡片卡在"执行中"
          callbacks.onToolResult?.(chunk.payload?.toolName, false, errMessage(chunk.payload?.error), chunk.payload?.toolCallId)
          break
        case 'tool-output-denied':
          // 审批拒绝：同样按失败结果转发
          callbacks.onToolResult?.(chunk.payload?.toolName, false, '操作已被拒绝', chunk.payload?.toolCallId)
          break
        case 'abort':
          callbacks.onError?.('cancelled')
          break
        case 'error':
          callbacks.onError?.(errMessage(chunk.payload?.error) || 'Agent 执行出错')
          break
        default:
          break
      }
    }
    log.info(`[ops-agent] 对话完成: thread=${threadId}`)
    callbacks.onDone?.()
  } catch (error) {
    const err = error as Error
    if (err.name === 'AbortError' || /abort|cancel/i.test(err.message || '')) {
      log.warn(`[ops-agent] 对话已取消: thread=${threadId}`)
      callbacks.onError?.('cancelled')
    } else {
      log.error(`[ops-agent] 对话出错: thread=${threadId}, error=${err.message}`)
      callbacks.onError?.(err.message)
    }
    callbacks.onDone?.()
  }
}

// 统一提取错误信息（Error 实例 / 字符串 / 其他对象）
function errMessage(e: unknown): string {
  if (!e) return ''
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try { return JSON.stringify(e) } catch { return String(e) }
}

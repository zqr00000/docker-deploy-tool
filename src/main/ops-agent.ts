/**
 * 运维 Agent - 基于 Mastra + Vercel AI SDK
 * Agent / 工具 / Memory 全部由 Mastra 管理，工具直接调用 sshService
 */
import { z } from 'zod'
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { sshService } from './ssh'
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
}

export interface ChatCallbacks {
  onDelta?: (delta: string) => void
  onToolCall?: (toolName: string, args: any) => void
  onToolResult?: (toolName: string, success: boolean, output: any) => void
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

async function requestApproval(action: string, riskLevel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    pendingApprovals.set(id, resolve)
    approvalSender?.({ id, action, riskLevel })
  })
}

// 危险命令检测
const HIGH_RISK_PATTERNS = [
  /rm\s+-rf/i, /mkfs/i, /dd\s+if=\/dev\/zero/i, /chmod\s+777/i,
  /chown\s+-R\s+root/i, /iptables\s+-F/i, /systemctl\s+(stop|disable)/i,
  /docker\s+rm\s+-f/i, /kubectl\s+delete/i, /DROP\s+TABLE/i, /TRUNCATE/i,
  /fdisk/i, /parted/i, /mkfs\./i
]

// ==================== 工具执行 ====================

async function exec(serverId: string, command: string, timeout = 30000): Promise<{ success: boolean; output: string; exitCode: number }> {
  const r = await sshService.executeCommand(serverId, command, 2, 1000, timeout)
  return { success: r.success, output: r.success ? r.stdout : r.stderr, exitCode: r.exitCode }
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
      description: '在远程服务器上执行Shell命令。读取/查询类命令直接执行；删除、格式化等危险操作会请求用户审批。',
      inputSchema: srv({ command: z.string().describe('要执行的命令'), timeout: z.number().optional().describe('超时毫秒，默认30000') }),
      execute: async ({ serverId, command, timeout }) => {
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
    })
  }

  return toolsInstance
}

// ==================== Agent ====================

const DEFAULT_INSTRUCTIONS = `你是一个专业的服务器运维 AI 助手，负责管理和诊断远程服务器。

核心能力：
1. 使用工具执行实际运维操作（查看容器、日志、系统状态、执行命令），绝不编造数据
2. 分析系统问题根因，给出可执行的修复方案
3. 高风险操作（删除、重启、停止服务、kill 进程等）会触发人工审批，请先说明操作目的
4. 回答时先给出分析和结论，再说明执行了哪些操作

安全规则：
- 读取/查询类操作直接执行
- 删除、格式化、重启、停止服务等破坏性操作必须谨慎，说明原因
- 不确定的命令先查询再执行`

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

  const messages: any[] = []
  if (serverId) {
    messages.push({
      role: 'system',
      content: `[服务器上下文] 当前服务器: ${serverName || serverId} (ID: ${serverId})。使用工具时 serverId 参数请填 ${serverId}。`
    })
  }
  messages.push({ role: 'user', content: userInput })

  try {
    const result = agent.stream(messages, { threadId, signal })
    for await (const chunk of result.fullStream) {
      if (signal?.aborted) break
      switch (chunk.type) {
        case 'text-delta':
          callbacks.onDelta?.(chunk.payload?.text || '')
          break
        case 'tool-call':
          callbacks.onToolCall?.(chunk.payload?.toolName, chunk.payload?.args)
          break
        case 'tool-result':
          callbacks.onToolResult?.(chunk.payload?.toolName, !chunk.payload?.error, chunk.payload?.output)
          break
        case 'error':
          callbacks.onError?.(chunk.error?.message || 'Agent 执行出错')
          break
        default:
          break
      }
    }
    callbacks.onDone?.()
  } catch (error) {
    const err = error as Error
    if (err.name === 'AbortError' || /abort|cancel/i.test(err.message || '')) {
      callbacks.onError?.('cancelled')
    } else {
      callbacks.onError?.(err.message)
    }
    callbacks.onDone?.()
  }
}

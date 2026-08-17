import log from 'electron-log'
import { randomUUID } from 'crypto'
import { sshService } from '../ssh'
import {
  shellScriptQueries,
  shellScriptVersionQueries,
  shellScriptExecutionLogQueries,
  serverQueries,
  ShellScriptRow
} from '../database'

export interface ShellScriptInput {
  name: string
  description?: string
  category?: string
  content: string
  timeout?: number
}

export interface ShellScriptRunOptions {
  serverIds: string[]
  /** 环境变量参数，脚本内可通过 ${KEY} 或 ${KEY:-default} 引用 */
  params?: Record<string, string>
  /** 位置参数，脚本内可通过 $1 $2 ... 引用 */
  args?: string[]
  /** 单台服务器执行超时时间（秒），默认取脚本配置的 timeout */
  timeout?: number
}

export interface ShellScriptRunResult {
  success: boolean
  total: number
  successCount: number
  failureCount: number
  results: ShellScriptServerResult[]
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

const DEFAULT_CONCURRENCY = 3

/**
 * 生成远端执行命令。
 * 通过 base64 传输脚本内容，避免引号/换行转义问题；base64 属 coreutils 自带工具，跨发行版兼容。
 * 参数注入采用「环境变量导出 + 位置参数」两种方式，均交由 bash 原生展开，
 * 因此脚本内可直接使用 ${KEY}、${KEY:-default}、$1 等标准语法。
 */
function buildCommand(
  content: string,
  params: Record<string, string> = {},
  args: string[] = []
): string {
  const lines: string[] = []
  const envKeys = Object.keys(params)
  if (envKeys.length > 0) {
    lines.push('set -a')
    for (const [key, value] of Object.entries(params)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
      const escaped = value.replace(/'/g, `'\\''`)
      lines.push(`export ${key}='${escaped}'`)
    }
    lines.push('set +a')
  }
  if (args.length > 0) {
    const escapedArgs = args.map(a => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')
    lines.push(`set -- ${escapedArgs}`)
  }
  lines.push(content)

  const b64 = Buffer.from(lines.join('\n'), 'utf-8').toString('base64')
  return `echo '${b64}' | base64 -d | bash`
}

/** 限制并发数的 map 执行器，避免对远端服务器造成过大压力 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index
      index += 1
      await fn(items[current])
    }
  })
  await Promise.all(workers)
}

class ShellScriptService {
  /** 数据库行转 API 结构：isBuiltIn 数字转布尔 */
  private toApi(row: ShellScriptRow | undefined) {
    if (!row) return undefined
    return { ...row, isBuiltIn: row.isBuiltIn === 1 }
  }

  getAll() {
    return shellScriptQueries.getAll().map(row => this.toApi(row)!)
  }

  getById(id: string) {
    return this.toApi(shellScriptQueries.getById(id))
  }

  create(input: ShellScriptInput) {
    const id = randomUUID()
    shellScriptQueries.insert({
      id,
      name: input.name,
      description: input.description || null,
      category: input.category || 'common',
      content: input.content,
      version: 1,
      timeout: input.timeout || 60,
      isBuiltIn: 0
    })
    // 初始版本记录，用于后续版本对比与回滚
    shellScriptVersionQueries.insert({
      scriptId: id,
      version: 1,
      content: input.content,
      changeNote: '初始创建'
    })
    log.info(`Shell script created: ${id} (${input.name})`)
    return this.toApi(shellScriptQueries.getById(id))
  }

  update(id: string, input: Partial<ShellScriptInput>, changeNote?: string) {
    const existing = shellScriptQueries.getById(id)
    if (!existing) {
      throw new Error('Shell script not found')
    }

    const newVersion = existing.version + 1
    const updates: Partial<ShellScriptRow> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.description !== undefined) updates.description = input.description || null
    if (input.category !== undefined) updates.category = input.category || 'common'
    if (input.content !== undefined) updates.content = input.content
    if (input.timeout !== undefined) updates.timeout = input.timeout

    // 内容发生变化时保留旧版本快照并升级版本号
    if (input.content !== undefined && input.content !== existing.content) {
      shellScriptVersionQueries.insert({
        scriptId: id,
        version: existing.version,
        content: existing.content,
        changeNote: changeNote || '更新前快照'
      })
      updates.version = newVersion
    }

    shellScriptQueries.update(id, updates)
    log.info(`Shell script updated: ${id} -> v${newVersion}`)
    return this.toApi(shellScriptQueries.getById(id))
  }

  delete(id: string) {
    const existing = shellScriptQueries.getById(id)
    if (!existing) return
    shellScriptVersionQueries.deleteByScriptId(id)
    shellScriptExecutionLogQueries.deleteByScriptId(id)
    shellScriptQueries.delete(id)
    log.info(`Shell script deleted: ${id} (${existing.name})`)
  }

  getVersions(scriptId: string) {
    return shellScriptVersionQueries.getByScriptId(scriptId)
  }

  getVersionById(id: string) {
    return shellScriptVersionQueries.getById(id)
  }

  /** 回滚到指定版本：用历史版本内容覆盖当前脚本并升级版本号 */
  rollback(scriptId: string, versionId: string, changeNote?: string) {
    const script = shellScriptQueries.getById(scriptId)
    const version = shellScriptVersionQueries.getById(versionId)
    if (!script) throw new Error('Shell script not found')
    if (!version) throw new Error('Shell script version not found')
    if (version.scriptId !== scriptId) throw new Error('Version does not belong to script')

    const newVersion = script.version + 1
    // 回滚前保存当前内容快照
    shellScriptVersionQueries.insert({
      scriptId,
      version: script.version,
      content: script.content,
      changeNote: changeNote || '回滚前快照'
    })
    shellScriptQueries.update(scriptId, {
      content: version.content,
      version: newVersion
    })
    log.info(`Shell script rolled back: ${scriptId} -> v${newVersion} (from v${version.version})`)
    return this.toApi(shellScriptQueries.getById(scriptId))
  }

  getExecutionLogs(scriptId?: string, limit = 100) {
    if (scriptId) {
      return shellScriptExecutionLogQueries.getByScriptId(scriptId, limit)
    }
    return shellScriptExecutionLogQueries.getAll(limit)
  }

  deleteExecutionLog(logId: string) {
    shellScriptExecutionLogQueries.delete(logId)
  }

  clearExecutionLogs(scriptId?: string) {
    if (scriptId) {
      shellScriptExecutionLogQueries.clearByScriptId(scriptId)
    } else {
      shellScriptExecutionLogQueries.clear()
    }
  }

  /** 在多台服务器上执行脚本，记录执行日志并返回每台服务器的执行结果 */
  async run(scriptId: string, options: ShellScriptRunOptions): Promise<ShellScriptRunResult> {
    const script = shellScriptQueries.getById(scriptId)
    if (!script) {
      throw new Error('Shell script not found')
    }
    if (!options.serverIds || options.serverIds.length === 0) {
      throw new Error('Please select at least one server')
    }

    // 一次性加载服务器信息建立映射，避免循环内查询（N+1 问题）
    const servers = serverQueries.getAll()
    const serverNameMap = new Map(servers.map(s => [s.id, s.name]))

    const timeoutMs = (options.timeout || script.timeout || 60) * 1000
    const command = buildCommand(script.content, options.params || {}, options.args || [])
    const startedAt = new Date().toISOString()
    const results: ShellScriptServerResult[] = []

    const executeOnServer = async (serverId: string): Promise<void> => {
      const serverName = serverNameMap.get(serverId) || serverId
      const perServerStart = Date.now()
      let result: { success: boolean; stdout: string; stderr: string; exitCode: number }

      try {
        result = await sshService.executeCommand(serverId, command, 1, 1000, timeoutMs)
      } catch (error) {
        result = {
          success: false,
          stdout: '',
          stderr: (error as Error).message,
          exitCode: -1
        }
      }

      const duration = Date.now() - perServerStart
      const serverResult: ShellScriptServerResult = {
        serverId,
        serverName,
        success: result.success,
        status: result.success ? 'success' : 'failure',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration
      }
      results.push(serverResult)

      // 记录执行日志
      try {
        shellScriptExecutionLogQueries.insert({
          scriptId: script.id,
          scriptName: script.name,
          version: script.version,
          serverId,
          serverName,
          status: serverResult.status,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          params: JSON.stringify({
            params: options.params || {},
            args: options.args || []
          }),
          startedAt,
          finishedAt: new Date().toISOString(),
          duration
        })
      } catch (error) {
        log.error(`Failed to save execution log for server ${serverId}:`, error)
      }

      log.info(
        `Shell script ${script.name} (v${script.version}) executed on ${serverName}: ${serverResult.status} (${duration}ms, exit=${result.exitCode})`
      )
    }

    await runWithConcurrency(options.serverIds, DEFAULT_CONCURRENCY, executeOnServer)

    const successCount = results.filter(r => r.success).length
    const failureCount = results.length - successCount

    return {
      success: failureCount === 0,
      total: results.length,
      successCount,
      failureCount,
      results
    }
  }
}

export const shellScriptService = new ShellScriptService()

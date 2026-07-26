/**
 * 执行代理 - 负责具体命令执行和结果验证
 * 参考 OpenDev 的双代理架构
 */

import type { Plan, PlanStep, ExecutedCommand } from './types'
import { ToolRegistry } from './tool-registry'
import { SafetySystem } from './safety-system'

export class ExecutionAgent {
  private toolRegistry: ToolRegistry
  private safetySystem: SafetySystem

  constructor() {
    this.toolRegistry = ToolRegistry.getInstance()
    this.safetySystem = SafetySystem.getInstance()
  }

  // 执行计划
  async execute(plan: Plan, onProgress?: (step: PlanStep, result: ExecutedCommand) => void): Promise<ExecutedCommand[]> {
    const results: ExecutedCommand[] = []

    for (const step of plan.steps) {
      // 执行前安全检查
      const safetyCheck = await this.safetySystem.validate(step.command || step.description, step.params)
      
      if (!safetyCheck.passed) {
        results.push({
          command: step.command || step.description,
          output: `Safety check failed: ${safetyCheck.failures.join(', ')}`,
          status: 'error',
          riskLevel: step.riskLevel
        })
        continue
      }

      // 执行步骤
      const result = await this.executeStep(step)
      results.push(result)

      // 通知进度
      if (onProgress) {
        onProgress(step, result)
      }

      // 如果执行失败，停止后续步骤
      if (result.status === 'error') {
        console.error(`[ExecutionAgent] Step failed: ${step.description}`)
        break
      }
    }

    return results
  }

  // 执行单个步骤
  async executeStep(step: PlanStep): Promise<ExecutedCommand> {
    const startTime = Date.now()

    try {
      let result: any

      if (step.tool) {
        // 使用工具系统执行
        result = await this.toolRegistry.execute(step.tool, step.params)
      } else if (step.command) {
        // 直接执行Shell命令
        result = await this.executeShellCommand(step.command, step.params)
      } else {
        return {
          command: step.description,
          output: 'No executable command or tool specified',
          status: 'error',
          riskLevel: step.riskLevel,
          executionTime: Date.now() - startTime
        }
      }

      return {
        command: step.command || step.tool || step.description,
        output: result.success ? (result.data?.stdout || JSON.stringify(result.data, null, 2)) : result.error || 'Unknown error',
        status: result.success ? 'success' : 'error',
        riskLevel: step.riskLevel,
        executionTime: Date.now() - startTime
      }
    } catch (error) {
      return {
        command: step.command || step.tool || step.description,
        output: (error as Error).message,
        status: 'error',
        riskLevel: step.riskLevel,
        executionTime: Date.now() - startTime
      }
    }
  }

  // 执行Shell命令
  private async executeShellCommand(command: string, params?: any): Promise<any> {
    const serverId = params?.serverId
    if (!serverId) {
      return { success: false, error: 'Server ID is required' }
    }

    const result = await window.electronAPI.server.executeCommand(serverId, command)
    return {
      success: result.success,
      data: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
      error: result.success ? undefined : result.stderr
    }
  }

  // 验证执行结果
  async validateResult(result: ExecutedCommand, expectedPattern?: string): Promise<boolean> {
    if (result.status !== 'success') {
      return false
    }

    if (expectedPattern) {
      const regex = new RegExp(expectedPattern, 'i')
      return regex.test(result.output)
    }

    // 默认验证：检查输出中是否包含错误关键字
    const errorPatterns = [
      /error/i,
      /failed/i,
      /permission denied/i,
      /not found/i,
      /no such file/i
    ]

    for (const pattern of errorPatterns) {
      if (pattern.test(result.output)) {
        return false
      }
    }

    return true
  }

  // 回滚执行
  async rollback(plan: Plan): Promise<void> {
    if (!plan.rollbackPlan) {
      return
    }

    console.log('[ExecutionAgent] Starting rollback...')

    for (const step of plan.rollbackPlan) {
      try {
        await this.executeShellCommand(step.command, { serverId: (step as any).serverId || '' })
        console.log(`[ExecutionAgent] Rollback step completed: ${step.description}`)
      } catch (error) {
        console.error(`[ExecutionAgent] Rollback step failed: ${step.description}`, error)
      }
    }
  }

  // 批量执行命令
  async executeBatch(commands: Array<{ command: string; serverId: string; description?: string }>): Promise<ExecutedCommand[]> {
    const results: ExecutedCommand[] = []

    for (const cmd of commands) {
      const startTime = Date.now()
      
      try {
        const result = await window.electronAPI.server.executeCommand(cmd.serverId, cmd.command)
        results.push({
          command: cmd.command,
          output: result.stdout,
          status: result.success ? 'success' : 'error',
          riskLevel: 'medium',
          executionTime: Date.now() - startTime,
          serverId: cmd.serverId
        })
      } catch (error) {
        results.push({
          command: cmd.command,
          output: (error as Error).message,
          status: 'error',
          riskLevel: 'medium',
          executionTime: Date.now() - startTime,
          serverId: cmd.serverId
        })
      }
    }

    return results
  }
}

// 导出单例
export const executionAgent = new ExecutionAgent()

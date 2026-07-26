/**
 * 规划代理 - 负责任务分解和策略制定
 * 参考 OpenDev 的双代理架构
 */

import type { Plan, PlanStep, RiskLevel } from './types'
import { ToolRegistry } from './tool-registry'
import { assessRiskLevel } from './tool-registry'

export class PlanningAgent {
  private toolRegistry: ToolRegistry

  constructor() {
    this.toolRegistry = ToolRegistry.getInstance()
  }

  // 分析任务并生成执行计划
  async plan(task: string, context: any): Promise<Plan> {
    // 1. 分析任务类型和复杂度
    const analysis = await this.analyzeTask(task, context)
    
    // 2. 分解任务为步骤
    const steps = await this.decomposeTask(analysis, context)
    
    // 3. 评估整体风险
    const riskLevel = this.assessPlanRisk(steps)
    
    // 4. 生成回滚计划
    const rollbackPlan = await this.createRollbackPlan(steps)

    return {
      id: `plan-${Date.now()}`,
      goal: task,
      steps,
      riskLevel,
      rollbackPlan,
      estimatedTime: this.estimateTime(steps)
    }
  }

  // 分析任务
  private async analyzeTask(task: string, context: any) {
    const lowerTask = task.toLowerCase()
    
    // 识别任务类型
    let type = 'general'
    if (lowerTask.includes('install') || lowerTask.includes('部署')) type = 'installation'
    if (lowerTask.includes('check') || lowerTask.includes('检查') || lowerTask.includes('status')) type = 'diagnostic'
    if (lowerTask.includes('fix') || lowerTask.includes('修复') || lowerTask.includes('troubleshoot')) type = 'troubleshooting'
    if (lowerTask.includes('update') || lowerTask.includes('升级')) type = 'update'
    if (lowerTask.includes('backup') || lowerTask.includes('备份')) type = 'backup'
    if (lowerTask.includes('configure') || lowerTask.includes('配置')) type = 'configuration'
    if (lowerTask.includes('docker') || lowerTask.includes('容器')) type = 'docker'
    if (lowerTask.includes('network') || lowerTask.includes('网络')) type = 'network'

    // 识别目标服务器
    const serverId = context?.serverId || 'unknown'

    // 评估复杂度
    const complexity = this.assessComplexity(task)

    return {
      type,
      serverId,
      complexity,
      originalTask: task
    }
  }

  // 评估任务复杂度
  private assessComplexity(task: string): 'simple' | 'moderate' | 'complex' {
    const indicators = {
      complex: ['and', 'then', 'after', 'before', 'if', 'multiple', 'all servers', 'batch'],
      moderate: ['check', 'verify', 'update', 'configure', 'install', 'restart']
    }

    const lowerTask = task.toLowerCase()
    
    for (const indicator of indicators.complex) {
      if (lowerTask.includes(indicator)) return 'complex'
    }
    
    for (const indicator of indicators.moderate) {
      if (lowerTask.includes(indicator)) return 'moderate'
    }

    return 'simple'
  }

  // 分解任务为步骤
  private async decomposeTask(analysis: any, context: any): Promise<PlanStep[]> {
    const steps: PlanStep[] = []
    const { type, originalTask } = analysis

    switch (type) {
      case 'diagnostic':
        steps.push(...this.createDiagnosticSteps(analysis))
        break
      case 'installation':
        steps.push(...this.createInstallationSteps(analysis))
        break
      case 'docker':
        steps.push(...this.createDockerSteps(analysis))
        break
      case 'network':
        steps.push(...this.createNetworkSteps(analysis))
        break
      case 'troubleshooting':
        steps.push(...this.createTroubleshootingSteps(analysis))
        break
      default:
        steps.push(...this.createGenericSteps(analysis))
    }

    return steps
  }

  // 创建诊断步骤
  private createDiagnosticSteps(analysis: any): PlanStep[] {
    const { serverId } = analysis
    return [
      {
        id: 'step-1',
        description: '检查系统基本信息',
        tool: 'shell_execute',
        params: { command: 'uname -a && uptime', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-2',
        description: '检查CPU使用率',
        tool: 'system_info',
        params: { serverId, type: 'cpu' },
        riskLevel: 'low'
      },
      {
        id: 'step-3',
        description: '检查内存使用率',
        tool: 'system_info',
        params: { serverId, type: 'memory' },
        riskLevel: 'low'
      },
      {
        id: 'step-4',
        description: '检查磁盘使用率',
        tool: 'system_info',
        params: { serverId, type: 'disk' },
        riskLevel: 'low'
      },
      {
        id: 'step-5',
        description: '检查Docker容器状态',
        tool: 'shell_execute',
        params: { command: 'docker ps -a', serverId },
        riskLevel: 'low'
      }
    ]
  }

  // 创建安装步骤
  private createInstallationSteps(analysis: any): PlanStep[] {
    const { serverId, originalTask } = analysis
    
    // 提取包名
    const packageMatch = originalTask.match(/install\s+(\w+)/i)
    const packageName = packageMatch ? packageMatch[1] : 'unknown'

    return [
      {
        id: 'step-1',
        description: '更新包列表',
        tool: 'shell_execute',
        params: { command: 'apt update', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-2',
        description: `安装 ${packageName}`,
        tool: 'package_manager',
        params: { action: 'install', package: packageName, serverId, manager: 'apt' },
        riskLevel: 'medium',
        rollbackCommand: `apt remove -y ${packageName}`
      },
      {
        id: 'step-3',
        description: '验证安装',
        tool: 'shell_execute',
        params: { command: `which ${packageName} || ${packageName} --version`, serverId },
        riskLevel: 'low'
      }
    ]
  }

  // 创建Docker步骤
  private createDockerSteps(analysis: any): PlanStep[] {
    const { serverId, originalTask } = analysis
    const lowerTask = originalTask.toLowerCase()

    if (lowerTask.includes('list') || lowerTask.includes('列表')) {
      return [
        {
          id: 'step-1',
          description: '列出所有容器',
          tool: 'shell_execute',
          params: { command: 'docker ps -a', serverId },
          riskLevel: 'low'
        }
      ]
    }

    if (lowerTask.includes('logs') || lowerTask.includes('日志')) {
      const containerMatch = originalTask.match(/(\w+)/g)
      const container = containerMatch ? containerMatch[containerMatch.length - 1] : 'container'
      
      return [
        {
          id: 'step-1',
          description: `获取容器 ${container} 日志`,
          tool: 'docker_logs',
          params: { container, serverId, tail: 100 },
          riskLevel: 'low'
        }
      ]
    }

    return [
      {
        id: 'step-1',
        description: '检查Docker状态',
        tool: 'shell_execute',
        params: { command: 'docker info', serverId },
        riskLevel: 'low'
      }
    ]
  }

  // 创建网络诊断步骤
  private createNetworkSteps(analysis: any): PlanStep[] {
    const { serverId } = analysis
    return [
      {
        id: 'step-1',
        description: '检查网络接口',
        tool: 'shell_execute',
        params: { command: 'ip addr show', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-2',
        description: '检查监听端口',
        tool: 'shell_execute',
        params: { command: 'netstat -tuln', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-3',
        description: '检查DNS配置',
        tool: 'shell_execute',
        params: { command: 'cat /etc/resolv.conf', serverId },
        riskLevel: 'low'
      }
    ]
  }

  // 创建故障排查步骤
  private createTroubleshootingSteps(analysis: any): PlanStep[] {
    const { serverId } = analysis
    return [
      {
        id: 'step-1',
        description: '检查系统日志',
        tool: 'shell_execute',
        params: { command: 'journalctl -n 50 --no-pager', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-2',
        description: '检查磁盘空间',
        tool: 'shell_execute',
        params: { command: 'df -h', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-3',
        description: '检查内存使用',
        tool: 'shell_execute',
        params: { command: 'free -h', serverId },
        riskLevel: 'low'
      },
      {
        id: 'step-4',
        description: '检查进程状态',
        tool: 'shell_execute',
        params: { command: 'ps aux --sort=-%mem | head -20', serverId },
        riskLevel: 'low'
      }
    ]
  }

  // 创建通用步骤
  private createGenericSteps(analysis: any): PlanStep[] {
    const { serverId, originalTask } = analysis
    return [
      {
        id: 'step-1',
        description: '执行用户请求',
        tool: 'shell_execute',
        params: { command: originalTask, serverId },
        riskLevel: assessRiskLevel(originalTask)
      }
    ]
  }

  // 评估计划风险
  private assessPlanRisk(steps: PlanStep[]): RiskLevel {
    let hasHigh = false
    let hasMedium = false

    for (const step of steps) {
      if (step.riskLevel === 'high') hasHigh = true
      if (step.riskLevel === 'medium') hasMedium = true
    }

    if (hasHigh) return 'high'
    if (hasMedium) return 'medium'
    return 'low'
  }

  // 创建回滚计划
  private async createRollbackPlan(steps: PlanStep[]): Promise<any[]> {
    const rollbackSteps: any[] = []

    for (const step of steps) {
      if (step.rollbackCommand) {
        rollbackSteps.push({
          stepId: step.id,
          command: step.rollbackCommand,
          description: `Rollback: ${step.description}`
        })
      }
    }

    return rollbackSteps.reverse() // 反向执行回滚
  }

  // 估算执行时间
  private estimateTime(steps: PlanStep[]): number {
    // 简单估算：每步约5秒
    return steps.length * 5000
  }
}

// 导出单例
export const planningAgent = new PlanningAgent()

/**
 * 安全系统 - 5层安全栈
 * 参考 OpenDev 的安全架构设计
 */

import type { SafetyCheck, ApprovalRequest, RiskLevel } from './types'
import { RISK_PATTERNS } from './types'

export class SafetySystem {
  private approvalRequests = new Map<string, ApprovalRequest>()
  private approvedActions = new Set<string>()
  private blockedActions = new Set<string>()
  private static instance: SafetySystem

  static getInstance(): SafetySystem {
    if (!SafetySystem.instance) {
      SafetySystem.instance = new SafetySystem()
    }
    return SafetySystem.instance
  }

  // 执行完整的安全检查
  async validate(action: string, params?: any): Promise<SafetyCheck> {
    const checks = {
      promptGuard: await this.checkPromptGuard(action),
      schemaValidation: await this.checkSchemaValidation(action, params),
      runtimeApproval: await this.checkRuntimeApproval(action),
      toolValidation: await this.checkToolValidation(action, params),
      lifecycleHook: await this.checkLifecycleHook(action)
    }

    const failures: string[] = []
    if (!checks.promptGuard) failures.push('Prompt guard check failed')
    if (!checks.schemaValidation) failures.push('Schema validation failed')
    if (!checks.runtimeApproval) failures.push('Runtime approval required')
    if (!checks.toolValidation) failures.push('Tool validation failed')
    if (!checks.lifecycleHook) failures.push('Lifecycle hook failed')

    const level = this.assessActionRisk(action)

    return {
      level,
      passed: failures.length === 0,
      checks,
      failures
    }
  }

  // Layer 1: Prompt Guard - 防止提示注入
  private async checkPromptGuard(action: string): Promise<boolean> {
    // 检查是否包含提示注入模式
    const injectionPatterns = [
      /ignore\s+previous\s+instructions/i,
      /you\s+are\s+now/i,
      /system\s+prompt/i,
      /<\s*script\s*>/i,
      /javascript\s*:/i,
      /on\w+\s*=/i,
      /\$\{.*\}/,
      /\{\{.*\}\}/,
      /%\d*[a-fA-F]/
    ]

    for (const pattern of injectionPatterns) {
      if (pattern.test(action)) {
        console.warn(`[Safety] Prompt injection detected: ${action}`)
        return false
      }
    }

    return true
  }

  // Layer 2: Schema Validation - 验证参数结构
  private async checkSchemaValidation(action: string, params?: any): Promise<boolean> {
    if (!params) return true

    // 检查参数是否包含危险字符
    const paramStr = JSON.stringify(params)
    
    // 检查路径遍历
    if (paramStr.includes('../') || paramStr.includes('..\\')) {
      console.warn(`[Safety] Path traversal detected in params`)
      return false
    }

    // 检查空字节注入
    if (paramStr.includes('\0')) {
      console.warn(`[Safety] Null byte detected in params`)
      return false
    }

    return true
  }

  // Layer 3: Runtime Approval - 运行时审批
  private async checkRuntimeApproval(action: string): Promise<boolean> {
    const riskLevel = this.assessActionRisk(action)

    // 低风险直接通过
    if (riskLevel === 'low') return true

    // 检查是否已审批
    if (this.approvedActions.has(action)) return true

    // 检查是否已阻止
    if (this.blockedActions.has(action)) return false

    // 中风险需要确认
    if (riskLevel === 'medium') {
      return await this.requestApproval(action, riskLevel)
    }

    // 高风险需要严格确认
    if (riskLevel === 'high') {
      return await this.requestApproval(action, riskLevel, true)
    }

    return true
  }

  // Layer 4: Tool Validation - 工具验证
  private async checkToolValidation(action: string, params?: any): Promise<boolean> {
    // 验证命令长度
    if (action.length > 10000) {
      console.warn(`[Safety] Command too long: ${action.length} chars`)
      return false
    }

    // 验证参数大小
    if (params) {
      const paramSize = JSON.stringify(params).length
      if (paramSize > 100000) {
        console.warn(`[Safety] Params too large: ${paramSize} bytes`)
        return false
      }
    }

    return true
  }

  // Layer 5: Lifecycle Hook - 生命周期钩子
  private async checkLifecycleHook(action: string): Promise<boolean> {
    // 执行前置钩子
    const hooks = this.getLifecycleHooks()
    for (const hook of hooks) {
      try {
        const result = await hook(action)
        if (!result) {
          console.warn(`[Safety] Lifecycle hook rejected action`)
          return false
        }
      } catch (error) {
        console.error(`[Safety] Lifecycle hook error:`, error)
        return false
      }
    }
    return true
  }

  // 评估操作风险等级
  assessActionRisk(action: string): RiskLevel {
    const lowerAction = action.toLowerCase()

    for (const pattern of RISK_PATTERNS.high) {
      if (pattern.test(lowerAction)) return 'high'
    }

    for (const pattern of RISK_PATTERNS.medium) {
      if (pattern.test(lowerAction)) return 'medium'
    }

    return 'low'
  }

  // 请求审批
  private async requestApproval(
    action: string,
    riskLevel: RiskLevel,
    strict: boolean = false
  ): Promise<boolean> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const request: ApprovalRequest = {
      id: requestId,
      action,
      riskLevel,
      details: this.generateApprovalDetails(action, riskLevel),
      timestamp: new Date().toISOString()
    }

    this.approvalRequests.set(requestId, request)

    // 触发审批UI
    return new Promise((resolve) => {
      this.showApprovalModal(request, (approved) => {
        if (approved) {
          this.approvedActions.add(action)
          request.approved = true
        } else {
          this.blockedActions.add(action)
          request.approved = false
        }
        resolve(approved)
      })
    })
  }

  // 生成审批详情
  private generateApprovalDetails(action: string, riskLevel: RiskLevel): string {
    const riskLabels = {
      low: '低风险',
      medium: '中风险',
      high: '高风险'
    }

    return `操作: ${action}\n风险等级: ${riskLabels[riskLevel]}`
  }

  // 显示审批模态框
  private showApprovalModal(
    request: ApprovalRequest,
    callback: (approved: boolean) => void
  ): void {
    // 通过事件总线通知UI显示审批模态框
    window.dispatchEvent(new CustomEvent('agent:approval-request', {
      detail: { request, callback }
    }))
  }

  // 获取生命周期钩子
  private getLifecycleHooks(): Array<(action: string) => Promise<boolean>> {
    return [
      // 检查是否在允许的时间窗口内
      async (action) => {
        const now = new Date()
        const hour = now.getHours()
        // 限制高风险操作只能在工作时间执行（可选）
        return true
      },
      // 检查操作频率限制
      async (action) => {
        // 实现频率限制逻辑
        return true
      }
    ]
  }

  // 清除审批缓存
  clearApprovalCache(): void {
    this.approvedActions.clear()
    this.blockedActions.clear()
  }

  // 获取审批历史
  getApprovalHistory(): ApprovalRequest[] {
    return Array.from(this.approvalRequests.values())
  }

  // 手动批准操作
  approveAction(action: string): void {
    this.approvedActions.add(action)
  }

  // 手动阻止操作
  blockAction(action: string): void {
    this.blockedActions.add(action)
  }
}

// 导出单例
export const safetySystem = SafetySystem.getInstance()

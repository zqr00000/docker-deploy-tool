// ==================== cron 表达式工具（renderer 侧） ====================
// 与主进程 alert-service 的 matchCron 语义保持一致（5 段：分 时 日 月 周）
// 用于可视化 cron 编辑器：解析/构建表达式、计算接下来的执行时间

export interface CronFieldConfig {
  mode: 'all' | 'step' | 'specific'
  /** 步进模式下的步长（每隔 N 个时间单位触发一次） */
  step?: number
  /** 指定模式下的具体值列表（如 0,15,30） */
  values?: number[]
}

export const CRON_FIELD_RANGES: Array<{ min: number; max: number }> = [
  { min: 0, max: 59 }, // 分钟
  { min: 0, max: 23 }, // 小时
  { min: 1, max: 31 }, // 日期
  { min: 1, max: 12 }, // 月份
  { min: 0, max: 6 } // 星期（0=周日）
]

// 判断某段模式是否匹配给定值
function matchField(pattern: string, value: number, min: number, max: number): boolean {
  const segments = pattern.split(',')
  for (const raw of segments) {
    const seg = raw.trim()
    if (!seg) continue
    if (seg === '*') return true

    let step = 1
    let range = seg
    if (seg.includes('/')) {
      const slashIdx = seg.indexOf('/')
      const stepStr = seg.slice(slashIdx + 1)
      if (!/^\d+$/.test(stepStr) || Number(stepStr) <= 0) continue
      step = Number(stepStr)
      range = seg.slice(0, slashIdx)
      if (range === '*') range = `${min}-${max}`
    }

    let start = 0
    let end = 0
    if (range.includes('-')) {
      const [s, e] = range.split('-')
      if (!/^\d+$/.test(s) || !/^\d+$/.test(e)) continue
      start = Number(s)
      end = Number(e)
    } else if (/^\d+$/.test(range)) {
      start = Number(range)
      end = Number(range)
    } else {
      continue
    }

    for (let v = start; v <= end; v += step) {
      if (v === value) return true
    }
  }
  return false
}

// 校验 5 段 cron 表达式是否合法
export function isValidCronExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const ok = (p: string, min: number, max: number): boolean => {
    for (const seg of p.split(',').map(s => s.trim())) {
      if (seg === '*') continue
      if (seg.includes('/')) {
        const idx = seg.indexOf('/')
        if (!/^\d+$/.test(seg.slice(idx + 1)) || Number(seg.slice(idx + 1)) <= 0) return false
        const range = seg.slice(0, idx)
        if (range !== '*' && !isValidRange(range, min, max)) return false
      } else if (!isValidRange(seg, min, max)) {
        return false
      }
    }
    return true
  }
  return ok(parts[0], 0, 59) && ok(parts[1], 0, 23) && ok(parts[2], 1, 31) && ok(parts[3], 1, 12) && ok(parts[4], 0, 6)
}

function isValidRange(seg: string, min: number, max: number): boolean {
  if (seg.includes('-')) {
    const [s, e] = seg.split('-')
    if (!/^\d+$/.test(s) || !/^\d+$/.test(e)) return false
    const sn = Number(s)
    const en = Number(e)
    return sn >= min && en <= max && sn <= en
  }
  if (/^\d+$/.test(seg)) {
    const n = Number(seg)
    return n >= min && n <= max
  }
  return false
}

// 解析单个字段为可视化配置；无法映射（如范围表达式）时返回 null
function parseField(pattern: string): CronFieldConfig | null {
  const seg = pattern.trim()
  if (seg === '*') return { mode: 'all' }
  if (seg.includes('/')) {
    const slashIdx = seg.indexOf('/')
    const stepStr = seg.slice(slashIdx + 1)
    const base = seg.slice(0, slashIdx)
    if (base === '*' && /^\d+$/.test(stepStr) && Number(stepStr) > 0) {
      return { mode: 'step', step: Number(stepStr) }
    }
    return null
  }
  if (/^(\d+)(,\d+)*$/.test(seg)) {
    const values = seg.split(',').map(Number)
    if (values.every(v => Number.isInteger(v))) {
      return { mode: 'specific', values }
    }
  }
  return null
}

// 解析整个 5 段表达式；任一段无法可视化映射时返回 null
export function parseCron(expr: string): CronFieldConfig[] | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const fields: CronFieldConfig[] = []
  for (let i = 0; i < 5; i++) {
    const field = parseField(parts[i])
    if (!field) return null
    // 约束具体值/步长在合法范围，防止越界
    const { min, max } = CRON_FIELD_RANGES[i]
    if (field.mode === 'step' && (!field.step || field.step < 1 || field.step > (max - min + 1))) return null
    if (field.mode === 'specific' && (!field.values || field.values.length === 0 || field.values.some(v => v < min || v > max))) return null
    fields.push(field)
  }
  return fields
}

const fieldPattern = (field: CronFieldConfig): string => {
  if (field.mode === 'all') return '*'
  if (field.mode === 'step') return field.step && field.step > 1 ? `*/${field.step}` : '*'
  if (field.mode === 'specific') {
    const values = field.values || []
    if (values.length === 0) return '*'
    if (values.length === 1) return `${values[0]}`
    return values.join(',')
  }
  return '*'
}

// 由可视化配置重建 5 段表达式
export function buildCron(fields: CronFieldConfig[]): string {
  if (fields.length !== 5) return '* * * * *'
  return fields.map(fieldPattern).join(' ')
}

// 计算接下来若干次执行时间（每分钟扫描，最多向后 7 天）
export function getNextOccurrences(expr: string, now: Date = new Date(), count = 5): Date[] {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return []
  const [min, hour, dom, month, dow] = parts
  const cursor = new Date(now)
  cursor.setSeconds(0, 0)
  const results: Date[] = []
  for (let i = 0; i < 7 * 24 * 60 && results.length < count; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1)
    if (
      matchField(min, cursor.getMinutes(), 0, 59) &&
      matchField(hour, cursor.getHours(), 0, 23) &&
      matchField(dom, cursor.getDate(), 1, 31) &&
      matchField(month, cursor.getMonth() + 1, 1, 12) &&
      matchField(dow, cursor.getDay(), 0, 6)
    ) {
      results.push(new Date(cursor))
    }
  }
  return results
}

export function formatCronTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 星期选项标签
export const DOW_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
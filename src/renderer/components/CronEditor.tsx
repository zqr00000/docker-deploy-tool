import React, { useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Divider,
  InputNumber,
  Radio,
  Select,
  Space,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
  message
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import {
  CaretDownOutlined,
  CaretUpOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  MinusCircleOutlined
} from '@ant-design/icons'
import {
  CronFieldConfig,
  buildCron,
  formatCronTime,
  getNextOccurrences,
  isValidCronExpr,
  parseCron
} from '../utils/cron'

const { Text } = Typography

interface CronEditorProps {
  value?: string
  onChange?: (value: string) => void
}

// ==================== 配置状态模型 ====================
type CronType = 'minute' | 'everyMinute' | 'everyHour' | 'daily' | 'weekly' | 'monthly' | 'yearly'

interface Settings {
  type: CronType
  /** 每隔 N 分钟 */
  minuteStep: number
  /** 每隔 N 小时 */
  hourStep: number
  /** 第 M 分钟（每隔 N 小时 / 具体时刻共用） */
  minuteOfHour: number
  /** 具体执行时刻列表 HH:mm */
  times: string[]
  /** 星期（cron: 0=周日） */
  dows: number[]
  /** 日期 1-31 */
  doms: number[]
  /** 月份 1-12 */
  months: number[]
}

function baseSettings(): Settings {
  return {
    type: 'minute',
    minuteStep: 5,
    hourStep: 2,
    minuteOfHour: 0,
    times: ['00:00'],
    dows: [1, 3, 5],
    doms: [1],
    months: [1]
  }
}

function presetSettings(patch: Partial<Settings>): Settings {
  return { ...baseSettings(), ...patch }
}

// 常用预设：一键生成后可在下方微调
const PRESETS: Array<{ label: string; patch: Partial<Settings> }> = [
  { label: '每分钟', patch: { type: 'minute' } },
  { label: '每 5 分钟', patch: { type: 'everyMinute', minuteStep: 5 } },
  { label: '每 10 分钟', patch: { type: 'everyMinute', minuteStep: 10 } },
  { label: '每 30 分钟', patch: { type: 'everyMinute', minuteStep: 30 } },
  { label: '每小时', patch: { type: 'everyHour', hourStep: 1, minuteOfHour: 0 } },
  { label: '每 2 小时', patch: { type: 'everyHour', hourStep: 2, minuteOfHour: 0 } },
  { label: '每天 00:00', patch: { type: 'daily', times: ['00:00'] } },
  { label: '每天 08:00', patch: { type: 'daily', times: ['08:00'] } },
  { label: '工作日 09:00', patch: { type: 'weekly', dows: [1, 2, 3, 4, 5], times: ['09:00'] } },
  { label: '每周一 08:00', patch: { type: 'weekly', dows: [1], times: ['08:00'] } },
  { label: '每月 1 号 00:00', patch: { type: 'monthly', doms: [1], times: ['00:00'] } }
]

const WEEK_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' }
]

const DOM_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1} 号` }))
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月` }))

const TYPE_LABELS: Array<{ value: CronType; label: string }> = [
  { value: 'minute', label: '每分钟' },
  { value: 'everyMinute', label: '每隔N分钟' },
  { value: 'everyHour', label: '每隔N小时' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' }
]

const pad2 = (n: number) => String(n).padStart(2, '0')

// ==================== 状态 ↔ 表达式 ====================
// 由具体时刻列表推导 分/时 字段；分钟不一致时返回 null（5 段 cron 无法精确表达）
function timesToFields(times: string[]): { minute: CronFieldConfig; hour: CronFieldConfig } | null {
  if (times.length === 0) return { minute: { mode: 'specific', values: [0] }, hour: { mode: 'specific', values: [0] } }
  const mins = [...new Set(times.map(t => Number(t.split(':')[1])))]
  const hours = [...new Set(times.map(t => Number(t.split(':')[0])))].sort((a, b) => a - b)
  if (mins.length > 1) return null
  return {
    minute: { mode: 'specific', values: [mins[0]] },
    hour: hours.length === 24 ? { mode: 'all' } : { mode: 'specific', values: hours }
  }
}

function buildCronFromSettings(s: Settings): string {
  if (s.type === 'minute') {
    return buildCron([{ mode: 'all' }, { mode: 'all' }, { mode: 'all' }, { mode: 'all' }, { mode: 'all' }])
  }
  if (s.type === 'everyMinute') {
    return buildCron([{ mode: 'step', step: s.minuteStep }, { mode: 'all' }, { mode: 'all' }, { mode: 'all' }, { mode: 'all' }])
  }
  const tf = timesToFields(s.times)
  if (!tf) return ''
  let domCfg: CronFieldConfig = { mode: 'all' }
  let monthCfg: CronFieldConfig = { mode: 'all' }
  let dowCfg: CronFieldConfig = { mode: 'all' }
  if (s.type === 'weekly' && s.dows.length > 0) dowCfg = { mode: 'specific', values: [...s.dows].sort((a, b) => a - b) }
  if (s.type === 'monthly' && s.doms.length > 0) domCfg = { mode: 'specific', values: [...s.doms].sort((a, b) => a - b) }
  if (s.type === 'yearly') {
    if (s.months.length > 0) monthCfg = { mode: 'specific', values: [...s.months].sort((a, b) => a - b) }
    if (s.doms.length > 0) domCfg = { mode: 'specific', values: [...s.doms].sort((a, b) => a - b) }
  }
  if (s.type === 'everyHour') {
    return buildCron([
      { mode: 'specific', values: [s.minuteOfHour] },
      { mode: 'step', step: s.hourStep },
      domCfg,
      monthCfg,
      dowCfg
    ])
  }
  return buildCron([tf.minute, tf.hour, domCfg, monthCfg, dowCfg])
}

// 从已有表达式回显配置；无法映射时返回 null（保留手动输入）
function parseExprToSettings(expr: string): Settings | null {
  const fields = parseCron(expr)
  if (!fields) return null
  const [minF, hourF, domF, monthF, dowF] = fields
  const def = baseSettings()
  const minVals = minF.mode === 'specific' ? minF.values || [] : []
  const hourAll = hourF.mode === 'all'
  const hourVals = hourF.mode === 'specific' ? hourF.values || [] : []
  const domVals = domF.mode === 'specific' ? domF.values || [] : []
  const monthVals = monthF.mode === 'specific' ? monthF.values || [] : []
  const dowVals = dowF.mode === 'specific' ? dowF.values || [] : []
  const domMonthDowOk = domF.mode !== 'step' && monthF.mode !== 'step' && dowF.mode !== 'step'

  // 每分钟
  if (minF.mode === 'all' && hourAll && domF.mode === 'all' && monthF.mode === 'all' && dowF.mode === 'all') {
    return { ...def, type: 'minute' }
  }
  // 每隔 N 分钟
  if (minF.mode === 'step' && hourAll && domF.mode === 'all' && monthF.mode === 'all' && dowF.mode === 'all') {
    return { ...def, type: 'everyMinute', minuteStep: minF.step || 5 }
  }
  if (minF.mode !== 'all' && minF.mode !== 'step' && !domMonthDowOk) return null
  // 每隔 N 小时（第 M 分）
  if (hourF.mode === 'step') {
    if (minVals.length !== 1) return null
    return { ...def, type: 'everyHour', hourStep: hourF.step || 1, minuteOfHour: minVals[0] }
  }
  // 每小时的第 M 分 → 每隔 1 小时
  if (hourAll && minVals.length === 1) {
    return { ...def, type: 'everyHour', hourStep: 1, minuteOfHour: minVals[0] }
  }
  if (hourVals.length === 0) return null
  const times = hourVals.map(h => `${pad2(h)}:${pad2(minVals[0] ?? 0)}`)
  if (dowVals.length > 0) return { ...def, type: 'weekly', times, dows: dowVals }
  if (domVals.length > 0) {
    if (monthVals.length > 0) return { ...def, type: 'yearly', times, doms: domVals, months: monthVals }
    return { ...def, type: 'monthly', times, doms: domVals }
  }
  return { ...def, type: 'daily', times }
}

// cron 手输框联想预设（依赖上文工具函数，放置于此）
const cronPresetOptions = PRESETS.map(p => ({ value: buildCronFromSettings(presetSettings(p.patch)), label: p.label }))

// ==================== 组件 ====================
const CronEditor: React.FC<CronEditorProps> = ({ value, onChange }) => {
  const expr = value || '* * * * *'
  const [visualOpen, setVisualOpen] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(() => parseExprToSettings(expr))

  // 外部输入变化时同步面板（仅当表达式与面板结果不一致时回显）
  useEffect(() => {
    setSettings(prev => {
      if (prev && buildCronFromSettings(prev) === expr) return prev
      return parseExprToSettings(expr)
    })
  }, [expr])

  const nextTimes = useMemo(() => {
    if (!isValidCronExpr(expr)) return []
    return getNextOccurrences(expr, new Date(), 5)
  }, [expr])

  const valid = isValidCronExpr(expr)

  // 应用新配置 → 写回表达式
  const apply = (next: Settings) => {
    const nextExpr = buildCronFromSettings(next)
    if (!nextExpr) {
      message.warning('时间组合分钟不一致，5 段 cron 无法精确表达。请保持各时间点同分钟，或使用上方手动输入')
      return
    }
    setSettings(next)
    onChange?.(nextExpr)
  }

  const s = settings

  const updateTimes = (idx: number, time: Dayjs | null) => {
    if (!s) return
    const times = [...s.times]
    if (!time) times.splice(idx, 1)
    else times[idx] = time.format('HH:mm')
    apply({ ...s, times: times.length > 0 ? times : ['00:00'] })
  }

  const addTime = () => {
    if (!s) return
    apply({ ...s, times: [...s.times, '00:00'] })
  }

  const removeTime = (idx: number) => {
    if (!s || s.times.length <= 1) return
    apply({ ...s, times: s.times.filter((_, i) => i !== idx) })
  }

  const switchType = (type: CronType) => {
    if (!s) return
    apply({ ...s, type })
  }

  return (
    <div>
      <Space.Compact style={{ width: '100%' }}>
        <AutoComplete
          style={{ flex: 1 }}
          value={value}
          options={cronPresetOptions}
          onChange={onChange}
          allowClear
        />
        <Button onClick={() => setVisualOpen(v => !v)}>
          {visualOpen ? <CaretUpOutlined /> : <CaretDownOutlined />}
          配置向导
        </Button>
      </Space.Compact>

      {visualOpen && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 16px',
            border: '1px solid var(--app-border-color)',
            borderRadius: 8,
            background: 'var(--app-content-bg)'
          }}
        >
          {s ? (
            <div>
              {/* 常用预设 */}
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 13, marginRight: 8 }}>常用预设</Text>
                <Space size={4} wrap>
                  {PRESETS.map(p => {
                    const pExpr = buildCronFromSettings(presetSettings(p.patch))
                    return (
                      <Button
                        key={p.label}
                        size="small"
                        type={expr === pExpr ? 'primary' : 'default'}
                        onClick={() => apply(presetSettings(p.patch))}
                      >
                        {p.label}
                      </Button>
                    )
                  })}
                </Space>
              </div>

              {/* 频率类型 */}
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 13, marginRight: 8 }}>频率</Text>
                <Radio.Group
                  size="small"
                  value={s.type}
                  onChange={(e) => switchType(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  {TYPE_LABELS.map(t => (
                    <Radio.Button key={t.value} value={t.value}>{t.label}</Radio.Button>
                  ))}
                </Radio.Group>
              </div>

              {/* 按频率显示参数 */}
              <div style={{ marginBottom: 12 }}>
                {s.type === 'minute' && (
                  <Text type="secondary" style={{ fontSize: 12 }}>每分钟执行一次（无需其他参数）</Text>
                )}

                {s.type === 'everyMinute' && (
                  <Space size={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>每隔</Text>
                    <InputNumber
                      size="small"
                      min={2}
                      max={59}
                      value={s.minuteStep}
                      onChange={(n) => apply({ ...s, minuteStep: n ?? 5 })}
                      style={{ width: 64 }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>分钟执行一次</Text>
                  </Space>
                )}

                {s.type === 'everyHour' && (
                  <Space size={6} wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>每隔</Text>
                    <InputNumber
                      size="small"
                      min={1}
                      max={24}
                      value={s.hourStep}
                      onChange={(n) => apply({ ...s, hourStep: n ?? 1 })}
                      style={{ width: 64 }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>小时，第</Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={59}
                      value={s.minuteOfHour}
                      onChange={(n) => apply({ ...s, minuteOfHour: n ?? 0 })}
                      style={{ width: 64 }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>分钟执行</Text>
                  </Space>
                )}

                {(s.type === 'daily' || s.type === 'weekly' || s.type === 'monthly' || s.type === 'yearly') && (
                  <div>
                    {s.type === 'weekly' && (
                      <div style={{ marginBottom: 8 }}>
                        <Space size={6} wrap>
                          <Text type="secondary" style={{ fontSize: 12 }}>选择星期</Text>
                          <Select
                            size="small"
                            mode="multiple"
                            allowClear
                            maxTagCount="responsive"
                            value={s.dows}
                            options={WEEK_OPTIONS}
                            onChange={(values: number[]) => apply({ ...s, dows: values })}
                            style={{ minWidth: 220 }}
                            placeholder="全部星期"
                          />
                        </Space>
                      </div>
                    )}
                    {s.type === 'monthly' && (
                      <div style={{ marginBottom: 8 }}>
                        <Space size={6} wrap>
                          <Text type="secondary" style={{ fontSize: 12 }}>选择日期</Text>
                          <Select
                            size="small"
                            mode="multiple"
                            allowClear
                            maxTagCount="responsive"
                            value={s.doms}
                            options={DOM_OPTIONS}
                            onChange={(values: number[]) => apply({ ...s, doms: values })}
                            style={{ minWidth: 200 }}
                            placeholder="全部日期"
                          />
                        </Space>
                      </div>
                    )}
                    {s.type === 'yearly' && (
                      <div style={{ marginBottom: 8 }}>
                        <Space size={6} wrap>
                          <Text type="secondary" style={{ fontSize: 12 }}>选择月份</Text>
                          <Select
                            size="small"
                            mode="multiple"
                            allowClear
                            maxTagCount="responsive"
                            value={s.months}
                            options={MONTH_OPTIONS}
                            onChange={(values: number[]) => apply({ ...s, months: values })}
                            style={{ minWidth: 200 }}
                            placeholder="全部月份"
                          />
                          <Text type="secondary" style={{ fontSize: 12 }}>选择日期</Text>
                          <Select
                            size="small"
                            mode="multiple"
                            allowClear
                            maxTagCount="responsive"
                            value={s.doms}
                            options={DOM_OPTIONS}
                            onChange={(values: number[]) => apply({ ...s, doms: values })}
                            style={{ minWidth: 200 }}
                            placeholder="全部日期"
                          />
                        </Space>
                      </div>
                    )}

                    <div>
                      <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>执行时间</Text>
                      <Space size={6} wrap>
                        {s.times.map((t, idx) => (
                          <Space key={idx} size={4}>
                            <TimePicker
                              size="small"
                              format="HH:mm"
                              value={dayjs(t, 'HH:mm')}
                              onChange={(v) => updateTimes(idx, v)}
                              placeholder="HH:mm"
                              style={{ width: 96 }}
                            />
                            <Button
                              size="small"
                              type="text"
                              icon={<MinusCircleOutlined />}
                              onClick={() => removeTime(idx)}
                              disabled={s.times.length <= 1}
                            />
                          </Space>
                        ))}
                        <Button size="small" icon={<PlusOutlined />} onClick={addTime}>
                          添加时间
                        </Button>
                      </Space>
                      {s.times.length > 1 && (
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            提示：多个时间需保持同一分钟，否则无法用 5 段 cron 精确表达
                          </Text>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 当前表达式 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 10, borderTop: '1px dashed var(--app-border-color)' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>当前表达式</Text>
                <Text code style={{ fontSize: 12 }}>{expr}</Text>
              </div>
            </div>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前表达式包含范围等特殊写法，暂不支持可视化编辑，请直接在上方输入框修改
            </Text>
          )}
        </div>
      )}

      <Divider style={{ margin: '12px 0 8px' }} />
      {valid ? (
        nextTimes.length > 0 ? (
          <div style={{ marginTop: 4 }}>
            <Space size={6} align="center" wrap>
              <ClockCircleOutlined style={{ fontSize: 12, color: 'var(--app-text-secondary)' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>接下来 5 次执行时间：</Text>
              {nextTimes.map((time, idx) => (
                <Tooltip key={idx} title={time.toLocaleString('zh-CN')}>
                  <Tag style={{ fontSize: 12, marginRight: 0 }}>{formatCronTime(time)}</Tag>
                </Tooltip>
              ))}
            </Space>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>近 7 天内无匹配的执行时间，请检查表达式是否合法</Text>
        )
      ) : (
        <Text type="danger" style={{ fontSize: 12 }}>cron 表达式格式不正确（应为 5 段：分 时 日 月 周）</Text>
      )}
    </div>
  )
}

export default CronEditor
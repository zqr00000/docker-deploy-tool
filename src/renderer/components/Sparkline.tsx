import React, { useMemo, memo } from 'react'

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
  strokeWidth?: number
  fill?: boolean
  max?: number
  min?: number
}

/**
 * 迷你折线图 — 纯 SVG 实现，无外部依赖
 * Apple 风格：平滑曲线 + 渐变填充 + 末尾光点
 */
const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#007AFF',
  width = 120,
  height = 36,
  strokeWidth = 2,
  fill = true,
  max,
  min
}) => {
  const { pathD, areaD, dotPos, gradientId } = useMemo(() => {
    if (!data || data.length < 2) {
      return { pathD: '', areaD: '', dotPos: null, gradientId: '' }
    }

    const dataMax = max ?? Math.max(...data, 1)
    const dataMin = min ?? Math.min(...data, 0)
    const range = dataMax - dataMin || 1

    const stepX = width / (data.length - 1)
    const pad = strokeWidth + 2
    const usableHeight = height - pad * 2

    // 生成平滑曲线路径（Catmull-Rom -> Bezier）
    const points = data.map((val, i) => ({
      x: i * stepX,
      y: pad + usableHeight - ((val - dataMin) / range) * usableHeight
    }))

    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]
      const p1 = points[i]
      const cp1x = p0.x + stepX / 2
      const cp1y = p0.y
      const cp2x = p1.x - stepX / 2
      const cp2y = p1.y
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
    }

    // 填充区域路径
    const area = d + ` L ${points[points.length - 1].x.toFixed(2)} ${height} L ${points[0].x.toFixed(2)} ${height} Z`

    // 末尾光点
    const last = points[points.length - 1]
    const gid = `spark-grad-${Math.random().toString(36).slice(2, 9)}`

    return {
      pathD: d,
      areaD: area,
      dotPos: { x: last.x, y: last.y },
      gradientId: gid
    }
  }, [data, width, height, strokeWidth, max, min])

  if (!pathD) {
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <line
          x1={0} y1={height / 2}
          x2={width} y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.2}
          strokeDasharray="4 4"
        />
      </svg>
    )
  }

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={areaD} fill={`url(#${gradientId})`} />}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dotPos && (
        <>
          <circle cx={dotPos.x} cy={dotPos.y} r={strokeWidth + 1} fill={color} fillOpacity={0.2} />
          <circle cx={dotPos.x} cy={dotPos.y} r={strokeWidth} fill={color} />
        </>
      )}
    </svg>
  )
}

export default memo(Sparkline)

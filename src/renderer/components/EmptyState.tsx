import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
  type?: 'default' | 'server' | 'app' | 'container' | 'alert' | 'network' | 'volume' | 'image' | 'log' | 'search'
}

const typeIconMap: Record<string, { icon: string; color: string }> = {
  server: { icon: '🖥', color: '#007AFF' },
  app: { icon: '📦', color: '#34C759' },
  container: { icon: '🐳', color: '#5AC8FA' },
  alert: { icon: '🔔', color: '#FF9500' },
  network: { icon: '🌐', color: '#5856D6' },
  volume: { icon: '💾', color: '#AF52DE' },
  image: { icon: '🖼', color: '#FF3B30' },
  log: { icon: '📋', color: '#8E8E93' },
  search: { icon: '🔍', color: '#007AFF' },
  default: { icon: '📭', color: '#8E8E93' }
}

/**
 * Apple-style Empty State component
 * Clean centered layout with icon, title, description, and optional action
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title = '暂无数据',
  description = '',
  action,
  type = 'default'
}) => {
  const config = typeIconMap[type] || typeIconMap.default

  return (
    <div className="apple-empty">
      <div
        className="apple-empty-icon"
        style={{
          background: `rgba(${hexToRgb(config.color)}, 0.08)`,
          color: config.color
        }}
      >
        {icon || <span style={{ fontSize: 24 }}>{config.icon}</span>}
      </div>
      <div className="apple-empty-title">{title}</div>
      {description && <div className="apple-empty-desc">{description}</div>}
      {action && <div className="apple-empty-action">{action}</div>}
    </div>
  )
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

export default EmptyState

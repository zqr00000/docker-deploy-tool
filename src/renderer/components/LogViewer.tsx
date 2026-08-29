import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Card, Button, Select, Space, Typography, Alert, Tooltip, message, Badge, Switch, Input } from 'antd'
import {
  ReloadOutlined,
  DownOutlined,
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  FilterOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  ports: string[]
  created: string
}

interface LogViewerProps {
  serverId: string
  projectPath: string
  containers: ContainerInfo[]
  defaultContainerId?: string
  defaultLines?: number
  autoRefresh?: boolean
  refreshInterval?: number
  height?: number
  showContainerSelect?: boolean
}

const LogViewer: React.FC<LogViewerProps> = ({
  serverId,
  projectPath,
  containers,
  defaultContainerId,
  defaultLines = 100,
  autoRefresh = false,
  refreshInterval = 3000,
  height = 500,
  showContainerSelect = true
}) => {
  const { t } = useTranslation()
  const [selectedContainer, setSelectedContainer] = useState<string | null>(defaultContainerId || null)
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState(defaultLines)
  const [isFollowing, setIsFollowing] = useState(autoRefresh)
  const [isStreaming, setIsStreaming] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [logLines, setLogLines] = useState<string[]>([])
  const logsRef = useRef<HTMLPreElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const streamIdRef = useRef<string | null>(null)

  // 过滤后的日志
  const filteredLogs = useMemo(() => {
    if (!filterText) return logLines
    const lowerFilter = filterText.toLowerCase()
    return logLines.filter(line => line.toLowerCase().includes(lowerFilter))
  }, [logLines, filterText])

  // 日志级别高亮：识别 FATAL/ERROR/WARN/INFO/DEBUG/TRACE 等关键词
  const LOG_LEVEL_RE = /(FATAL|SEVERE|ERROR|ERR|WARN|WARNING|INFO|NOTICE|DEBUG|TRACE|VERBOSE|SUCCESS|OK)/gi
  const logLevelColor = (level: string): string => {
    const l = level.toUpperCase()
    if (/(FATAL|SEVERE|ERROR|ERR)/.test(l)) return '#ff6b6b' // 红色：致命/错误
    if (/(WARN|WARNING)/.test(l)) return '#ffc107' // 橙黄：警告
    if (/(INFO|NOTICE|SUCCESS|OK)/.test(l)) return '#52c7ff' // 蓝色：信息
    return '#8b949e' // 灰色：调试
  }
  const highlightedLogs = useMemo(() => {
    if (!logs) return null
    const parts = logs.split(LOG_LEVEL_RE)
    if (parts.length <= 1) return logs
    return parts.map((part, i) => {
      // split 带捕获组时，奇数索引是匹配到的级别词
      if (i % 2 === 1) {
        return (
          <span key={i} style={{ color: logLevelColor(part), fontWeight: 600 }}>
            {part}
          </span>
        )
      }
      return part
    })
  }, [logs])

  // 获取日志（非流式）
  const fetchLogs = useCallback(async () => {
    if (!selectedContainer || !serverId) {
      setLogs('')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const logsData = await window.electronAPI.app.getContainerLogs(serverId, selectedContainer, lines)
      const newLines = logsData ? logsData.split('\n').filter(l => l.trim()) : []
      setLogLines(newLines)
      setLogs(logsData || t('app.logs.noLogs'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [serverId, selectedContainer, lines, t])

  // 开始实时流式日志
  const startStreaming = useCallback(async () => {
    if (!selectedContainer || !serverId) return

    // 停止现有的流
    if (streamIdRef.current) {
      const [sid, cid] = streamIdRef.current.split(':')
      await window.electronAPI.logs.stop(sid, cid)
    }

    setLoading(true)
    setError(null)
    setLogLines([])
    setLogs('')

    const streamId = `${serverId}:${selectedContainer}`
    streamIdRef.current = streamId

    try {
      const result = await window.electronAPI.logs.start(serverId, selectedContainer, {
        tail: lines,
        follow: true
      })

      if (result.success) {
        setIsStreaming(true)
      } else {
        setError(result.message || 'Failed to start log stream')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [serverId, selectedContainer, lines])

  // 停止实时流式日志
  const stopStreaming = useCallback(async () => {
    if (streamIdRef.current) {
      const [sid, cid] = streamIdRef.current.split(':')
      await window.electronAPI.logs.stop(sid, cid)
      streamIdRef.current = null
    }
    setIsStreaming(false)
  }, [])

  // 监听流式日志数据
  useEffect(() => {
    const handleData = (streamId: string, data: string) => {
      if (streamId === streamIdRef.current) {
        const newLines = data.split('\n').filter(l => l.trim())
        setLogLines(prev => {
          const updated = [...prev, ...newLines]
          // 限制最大行数
          const maxLines = 5000
          return updated.length > maxLines ? updated.slice(-maxLines) : updated
        })
      }
    }

    const handleError = (streamId: string, error: string) => {
      if (streamId === streamIdRef.current) {
        setError(error)
      }
    }

    const handleClose = (streamId: string, code: number) => {
      if (streamId === streamIdRef.current) {
        setIsStreaming(false)
        streamIdRef.current = null
      }
    }

    window.electronAPI.logs.onData(handleData)
    window.electronAPI.logs.onError(handleError)
    window.electronAPI.logs.onClose(handleClose)

    return () => {
      // 清理函数
    }
  }, [])

  // 更新 logs 字符串
  useEffect(() => {
    if (filterText) {
      setLogs(filteredLogs.join('\n'))
    } else {
      setLogs(logLines.join('\n'))
    }
  }, [logLines, filteredLogs, filterText])

  // 初始加载
  useEffect(() => {
    if (selectedContainer && !isStreaming) {
      fetchLogs()
    }
  }, [selectedContainer, fetchLogs, isStreaming])

  // 自动刷新（非流式模式）
  useEffect(() => {
    if (isFollowing && !isStreaming && selectedContainer) {
      intervalRef.current = setInterval(fetchLogs, refreshInterval)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isFollowing, isStreaming, selectedContainer, refreshInterval, fetchLogs])

  // 组件卸载时停止流
  useEffect(() => {
    return () => {
      if (streamIdRef.current) {
        const [sid, cid] = streamIdRef.current.split(':')
        window.electronAPI.logs.stop(sid, cid)
      }
    }
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // 处理容器切换
  const handleContainerChange = (value: string) => {
    setSelectedContainer(value)
    setLogs('')
    setLogLines([])
    setIsFollowing(false)
    setIsStreaming(false)
    if (streamIdRef.current) {
      const [sid, cid] = streamIdRef.current.split(':')
      window.electronAPI.logs.stop(sid, cid)
      streamIdRef.current = null
    }
  }

  // 处理行数变化
  const handleLinesChange = (value: number) => {
    setLines(value)
  }

  // 滚动到底部
  const scrollToBottom = () => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }

  // 复制日志
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs)
      message.success(t('app.logs.copySuccess'))
    } catch {
      message.error(t('app.logs.copyFailed'))
    }
  }

  // 下载日志
  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `container-${selectedContainer?.substring(0, 12) || 'logs'}-${new Date().toISOString().slice(0, 10)}.log`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 清空日志
  const handleClear = () => {
    setLogs('')
    setLogLines([])
  }

  // 切换跟随模式
  const toggleFollow = () => {
    if (isStreaming) {
      stopStreaming()
    }
    setIsFollowing(!isFollowing)
  }

  // 切换实时流模式
  const toggleStreaming = () => {
    if (isStreaming) {
      stopStreaming()
    } else {
      startStreaming()
    }
    setIsFollowing(false)
  }

  // 自动选择容器
  useEffect(() => {
    if (containers.length > 0 && !selectedContainer) {
      const runningContainer = containers.find(c => c.status.toLowerCase().includes('up'))
      if (runningContainer) {
        setSelectedContainer(runningContainer.id)
      } else if (defaultContainerId) {
        setSelectedContainer(defaultContainerId)
      } else {
        setSelectedContainer(containers[0].id)
      }
    }
  }, [containers, selectedContainer, defaultContainerId])

  const containerOptions = containers.map(c => ({
    value: c.id,
    label: `${c.name} (${c.status})`
  }))

  const lineOptions = [
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: 200, label: '200' },
    { value: 500, label: '500' },
    { value: 1000, label: '1000' }
  ]

  if (containers.length === 0) {
    return (
      <Card>
        <Text type="secondary">{t('app.logs.noContainers')}</Text>
      </Card>
    )
  }

  return (
    <Card
      title={
        <Space>
          {t('app.logs.title')}
          {isStreaming && (
            <Badge status="processing" text={t('logViewer.liveMode')} />
          )}
        </Space>
      }
      extra={
        <Space wrap>
          {showContainerSelect && (
            <Select
              value={selectedContainer}
              onChange={handleContainerChange}
              options={containerOptions}
              style={{ minWidth: 180 }}
              placeholder={t('app.logs.selectContainer')}
            />
          )}
          <Select
            value={lines}
            onChange={handleLinesChange}
            options={lineOptions}
            style={{ width: 80 }}
          />
          <Tooltip title={isStreaming ? t('logViewer.stopStream') : t('logViewer.startStream')}>
            <Button
              icon={isStreaming ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={toggleStreaming}
              type={isStreaming ? 'primary' : 'default'}
              danger={isStreaming}
            >
              {isStreaming ? t('logViewer.live') : t('logViewer.stream')}
            </Button>
          </Tooltip>
          <Tooltip title={isFollowing ? t('app.logs.stopFollowing') : t('app.logs.followLogs')}>
            <Button
              icon={<ReloadOutlined />}
              onClick={toggleFollow}
              type={isFollowing ? 'primary' : 'default'}
              disabled={isStreaming}
            >
              {t('app.logs.followLogs')}
            </Button>
          </Tooltip>
          <Tooltip title={t('app.logs.scrollToBottom')}>
            <Button icon={<DownOutlined />} onClick={scrollToBottom} />
          </Tooltip>
          <Tooltip title={showFilter ? t('logViewer.hideFilter') : t('logViewer.showFilter')}>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilter(!showFilter)}
              type={showFilter ? 'primary' : 'default'}
            />
          </Tooltip>
          <Tooltip title={t('app.logs.copy')}>
            <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!logs} />
          </Tooltip>
          <Tooltip title={t('app.logs.download')}>
            <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!logs} />
          </Tooltip>
          <Tooltip title={t('app.logs.clear')}>
            <Button icon={<ClearOutlined />} onClick={handleClear} disabled={!logs} />
          </Tooltip>
        </Space>
      }
    >
      {error && (
        <Alert
          type="error"
          message={t('common.error')}
          description={error}
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* 过滤栏 */}
      {showFilter && (
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Select
              value={lines}
              onChange={handleLinesChange}
              options={lineOptions}
              style={{ width: 100 }}
            />
            <Input
              placeholder={t('logViewer.filterPlaceholder')}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Text type="secondary">
              {t('logViewer.showingLines').replace('{{count}}', filteredLogs.length.toString()).replace('{{total}}', logLines.length.toString())}
            </Text>
          </Space>
        </div>
      )}

      {/* 自动滚动开关 */}
      <div style={{ marginBottom: 8 }}>
        <Space>
          <Switch
            checked={autoScroll}
            onChange={setAutoScroll}
            size="small"
          />
          <Text type="secondary">{t('logViewer.autoScroll')}</Text>
          <Text type="secondary">|</Text>
          <Text type="secondary">
            {t('logViewer.totalLines').replace('{{count}}', logLines.length.toString())}
          </Text>
        </Space>
      </div>

      {/* 日志内容 */}
      <pre
        ref={logsRef}
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 6,
          maxHeight: height,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
          marginBottom: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {loading && !logs ? t('common.loading') : highlightedLogs || t('app.logs.noLogs')}
      </pre>
    </Card>
  )
}

export default LogViewer

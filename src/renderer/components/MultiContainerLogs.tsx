import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Card,
  Select,
  Button,
  Space,
  Typography,
  Alert,
  Tooltip,
  Badge,
  Switch,
  Input,
  Tabs,
  Checkbox,
  Divider
} from 'antd'
import {
  ReloadOutlined,
  DownOutlined,
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  FilterOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
}

interface LogEntry {
  timestamp: string
  containerId: string
  containerName: string
  message: string
}

interface MultiContainerLogsProps {
  serverId: string
  containers: ContainerInfo[]
  height?: number
}

const MultiContainerLogs: React.FC<MultiContainerLogsProps> = ({
  serverId,
  containers,
  height = 500
}) => {
  const { t } = useTranslation()
  const [selectedContainers, setSelectedContainers] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'errors' | 'warnings'>('all')
  const logsRef = useRef<HTMLDivElement>(null)
  const streamIdsRef = useRef<Set<string>>(new Set())

  // 过滤后的日志
  const filteredLogs = React.useMemo(() => {
    let result = logs

    // 按类型过滤
    if (activeTab === 'errors') {
      result = result.filter(l => /error|exception|fatal/i.test(l.message))
    } else if (activeTab === 'warnings') {
      result = result.filter(l => /warn|warning/i.test(l.message))
    }

    // 按文本过滤
    if (filterText) {
      const lowerFilter = filterText.toLowerCase()
      result = result.filter(l => l.message.toLowerCase().includes(lowerFilter))
    }

    return result
  }, [logs, activeTab, filterText])

  // 开始多容器日志流
  const startMultiStreaming = useCallback(async () => {
    if (selectedContainers.length === 0 || !serverId) return

    setLoading(true)
    setError(null)
    setLogs([])
    streamIdsRef.current.clear()

    try {
      for (const containerId of selectedContainers) {
        const streamId = `${serverId}:${containerId}`
        streamIdsRef.current.add(streamId)

        await window.electronAPI.logs.start(serverId, containerId, {
          tail: 100,
          follow: true
        })
      }
      setIsStreaming(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [serverId, selectedContainers])

  // 停止所有日志流
  const stopMultiStreaming = useCallback(async () => {
    for (const streamId of streamIdsRef.current) {
      const [sid, cid] = streamId.split(':')
      await window.electronAPI.logs.stop(sid, cid)
    }
    streamIdsRef.current.clear()
    setIsStreaming(false)
  }, [])

  // 监听日志数据
  useEffect(() => {
    const handleData = (streamId: string, data: string) => {
      if (streamIdsRef.current.has(streamId)) {
        const containerId = streamId.split(':')[1]
        const container = containers.find(c => c.id === containerId)
        const newLines = data.split('\n').filter(l => l.trim())

        const entries: LogEntry[] = newLines.map(line => ({
          timestamp: new Date().toISOString(),
          containerId,
          containerName: container?.name || containerId.substring(0, 8),
          message: line
        }))

        setLogs(prev => {
          const updated = [...prev, ...entries]
          // 限制最大日志条数
          const maxLogs = 10000
          return updated.length > maxLogs ? updated.slice(-maxLogs) : updated
        })
      }
    }

    const handleError = (streamId: string, error: string) => {
      if (streamIdsRef.current.has(streamId)) {
        setError(error)
      }
    }

    const handleClose = (streamId: string) => {
      streamIdsRef.current.delete(streamId)
      if (streamIdsRef.current.size === 0) {
        setIsStreaming(false)
      }
    }

    window.electronAPI.logs.onData(handleData)
    window.electronAPI.logs.onError(handleError)
    window.electronAPI.logs.onClose(handleClose)

    return () => {}
  }, [containers])

  // 组件卸载时停止所有流
  useEffect(() => {
    return () => {
      for (const streamId of streamIdsRef.current) {
        const [sid, cid] = streamId.split(':')
        window.electronAPI.logs.stop(sid, cid)
      }
    }
  }, [])

  // 自动滚动
  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll])

  // 复制日志
  const handleCopy = async () => {
    const text = filteredLogs.map(l => `[${l.containerName}] ${l.message}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      message.success(t('app.logs.copySuccess'))
    } catch {
      message.error(t('app.logs.copyFailed'))
    }
  }

  // 下载日志
  const handleDownload = () => {
    const text = filteredLogs.map(l => `[${l.timestamp}][${l.containerName}] ${l.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `multi-container-logs-${new Date().toISOString().slice(0, 10)}.log`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 清空日志
  const handleClear = () => {
    setLogs([])
  }

  // 切换流式状态
  const toggleStreaming = () => {
    if (isStreaming) {
      stopMultiStreaming()
    } else {
      startMultiStreaming()
    }
  }

  // 滚动到底部
  const scrollToBottom = () => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }

  // 获取容器颜色
  const getContainerColor = (index: number) => {
    const colors = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'red', 'geekblue']
    return colors[index % colors.length]
  }

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
          <AppstoreOutlined />
          {t('multiContainerLogs.title')}
          {isStreaming && (
            <Badge status="processing" text={t('logViewer.liveMode')} />
          )}
        </Space>
      }
      extra={
        <Space wrap>
          <Tooltip title={isStreaming ? t('logViewer.stopStream') : t('logViewer.startStream')}>
            <Button
              icon={isStreaming ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={toggleStreaming}
              type={isStreaming ? 'primary' : 'default'}
              danger={isStreaming}
              disabled={selectedContainers.length === 0}
            >
              {isStreaming ? t('logViewer.live') : t('logViewer.stream')}
            </Button>
          </Tooltip>
          <Tooltip title={showFilter ? t('logViewer.hideFilter') : t('logViewer.showFilter')}>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilter(!showFilter)}
              type={showFilter ? 'primary' : 'default'}
            />
          </Tooltip>
          <Tooltip title={t('app.logs.scrollToBottom')}>
            <Button icon={<DownOutlined />} onClick={scrollToBottom} />
          </Tooltip>
          <Tooltip title={t('app.logs.copy')}>
            <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={filteredLogs.length === 0} />
          </Tooltip>
          <Tooltip title={t('app.logs.download')}>
            <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={filteredLogs.length === 0} />
          </Tooltip>
          <Tooltip title={t('app.logs.clear')}>
            <Button icon={<ClearOutlined />} onClick={handleClear} disabled={filteredLogs.length === 0} />
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

      {/* 容器选择 */}
      <div style={{ marginBottom: 16 }}>
        <Text strong>{t('multiContainerLogs.selectContainers')}:</Text>
        <Checkbox.Group
          style={{ width: '100%', marginTop: 8 }}
          value={selectedContainers}
          onChange={(values) => setSelectedContainers(values as string[])}
        >
          <Space wrap>
            {containers.map((container, index) => (
              <Checkbox key={container.id} value={container.id}>
                <Badge color={getContainerColor(index)} text={container.name} />
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </div>

      {/* 过滤栏 */}
      {showFilter && (
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Input
              placeholder={t('logViewer.filterPlaceholder')}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Text type="secondary">
              {t('logViewer.showingLines')
                .replace('{{count}}', filteredLogs.length.toString())
                .replace('{{total}}', logs.length.toString())}
            </Text>
          </Space>
        </div>
      )}

      {/* 日志类型标签 */}
      <div style={{ marginBottom: 8 }}>
        <Space>
          <Button
            type={activeTab === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setActiveTab('all')}
          >
            {t('multiContainerLogs.allLogs')} ({logs.length})
          </Button>
          <Button
            type={activeTab === 'errors' ? 'primary' : 'default'}
            size="small"
            onClick={() => setActiveTab('errors')}
          >
            {t('multiContainerLogs.errors')} ({logs.filter(l => /error|exception|fatal/i.test(l.message)).length})
          </Button>
          <Button
            type={activeTab === 'warnings' ? 'primary' : 'default'}
            size="small"
            onClick={() => setActiveTab('warnings')}
          >
            {t('multiContainerLogs.warnings')} ({logs.filter(l => /warn|warning/i.test(l.message)).length})
          </Button>
          <Divider type="vertical" />
          <Switch
            checked={autoScroll}
            onChange={setAutoScroll}
            size="small"
          />
          <Text type="secondary">{t('logViewer.autoScroll')}</Text>
        </Space>
      </div>

      {/* 日志内容 */}
      <div
        ref={logsRef}
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 4,
          height,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'Monaco, Consolas, "Courier New", monospace'
        }}
      >
        {loading && filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            {t('common.loading')}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
            {t('multiContainerLogs.noLogs')}
          </div>
        ) : (
          filteredLogs.map((entry, index) => {
            const containerIndex = containers.findIndex(c => c.id === entry.containerId)
            const color = getContainerColor(containerIndex)
            const isError = /error|exception|fatal/i.test(entry.message)
            const isWarning = /warn|warning/i.test(entry.message)

            return (
              <div
                key={`${entry.timestamp}-${index}`}
                style={{
                  padding: '2px 0',
                  color: isError ? '#ff7875' : isWarning ? '#ffc53d' : '#d4d4d4'
                }}
              >
                <Text style={{ color: '#888', marginRight: 8 }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={{ color, fontWeight: 'bold', marginRight: 8 }}>
                  [{entry.containerName}]
                </Text>
                <span>{entry.message}</span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

export default MultiContainerLogs

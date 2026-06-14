import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Card, Button, Select, Space, Typography, Alert, Tooltip, message } from 'antd'
import {
  ReloadOutlined,
  DownOutlined,
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined
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
}

const LogViewer: React.FC<LogViewerProps> = ({
  serverId,
  projectPath,
  containers,
  defaultContainerId,
  defaultLines = 100,
  autoRefresh = false,
  refreshInterval = 3000
}) => {
  const { t } = useTranslation()
  const [selectedContainer, setSelectedContainer] = useState<string | null>(defaultContainerId || null)
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState(defaultLines)
  const [isFollowing, setIsFollowing] = useState(autoRefresh)
  const logsRef = useRef<HTMLPreElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchLogs = useCallback(async () => {
    if (!selectedContainer || !serverId) {
      setLogs('')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const logsData = await window.electronAPI.app.getContainerLogs(serverId, selectedContainer, lines)
      setLogs(logsData || t('app.logs.noLogs'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [serverId, selectedContainer, lines, t])

  useEffect(() => {
    if (selectedContainer) {
      fetchLogs()
    }
  }, [selectedContainer, fetchLogs])

  useEffect(() => {
    if (isFollowing && selectedContainer) {
      intervalRef.current = setInterval(fetchLogs, refreshInterval)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isFollowing, selectedContainer, refreshInterval, fetchLogs])

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

  const handleContainerChange = (value: string) => {
    setSelectedContainer(value)
    setLogs('')
    setIsFollowing(false)
  }

  const handleLinesChange = (value: number) => {
    setLines(value)
  }

  const scrollToBottom = () => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs)
      message.success(t('app.logs.copySuccess'))
    } catch {
      message.error(t('app.logs.copyFailed'))
    }
  }

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

  const handleClear = () => {
    setLogs('')
  }

  const toggleFollow = () => {
    setIsFollowing(!isFollowing)
  }

  useEffect(() => {
    if (isFollowing && logsRef.current) {
      scrollToBottom()
    }
  }, [logs, isFollowing])

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
      title={t('app.logs.title')}
      extra={
        <Space wrap>
          <Select
            value={selectedContainer}
            onChange={handleContainerChange}
            options={containerOptions}
            style={{ minWidth: 180 }}
            placeholder={t('app.logs.selectContainer')}
          />
          <Select
            value={lines}
            onChange={handleLinesChange}
            options={lineOptions}
            style={{ width: 80 }}
          />
          <Tooltip title={isFollowing ? t('app.logs.stopFollowing') : t('app.logs.followLogs')}>
            <Button
              icon={isFollowing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={toggleFollow}
              type={isFollowing ? 'primary' : 'default'}
            />
          </Tooltip>
          <Tooltip title={t('common.refresh')}>
            <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading} />
          </Tooltip>
          <Tooltip title={t('app.logs.scrollToBottom')}>
            <Button icon={<DownOutlined />} onClick={scrollToBottom} />
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
        />
      )}

      <pre
        ref={logsRef}
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 4,
          maxHeight: 500,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
          marginBottom: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {loading && !logs ? t('common.loading') : logs || t('app.logs.noLogs')}
      </pre>
    </Card>
  )
}

export default LogViewer

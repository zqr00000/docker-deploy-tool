import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Card, Select, Spin, Typography, Space, Progress, Row, Col, Alert, Empty } from 'antd'
import { ReloadOutlined, DashboardOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text, Title } = Typography

interface ContainerStats {
  containerId: string
  containerName: string
  cpuPercent: number
  memoryUsage: string
  memoryLimit: string
  memoryPercent: number
  networkIO: string
  blockIO: string
  pids: number
}

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  ports: string[]
  created: string
}

interface ResourceMonitorProps {
  serverId: string
  projectPath: string
  containers: ContainerInfo[]
  autoRefresh?: boolean
  refreshInterval?: number
}

const ResourceMonitor: React.FC<ResourceMonitorProps> = ({
  serverId,
  projectPath,
  containers,
  autoRefresh = true,
  refreshInterval = 3000
}) => {
  const { t } = useTranslation()
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null)
  const [stats, setStats] = useState<ContainerStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isContainerRunning, setIsContainerRunning] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStats = useCallback(async () => {
    if (!selectedContainer || !serverId) {
      setStats(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.app.getContainerStats(serverId, selectedContainer)
      if (result) {
        setStats(result)
        setIsContainerRunning(true)
      } else {
        setStats(null)
        setIsContainerRunning(false)
      }
    } catch (err) {
      setError((err as Error).message)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [serverId, selectedContainer])

  useEffect(() => {
    if (selectedContainer && autoRefresh) {
      fetchStats()
      intervalRef.current = setInterval(fetchStats, refreshInterval)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [selectedContainer, autoRefresh, refreshInterval, fetchStats])

  useEffect(() => {
    if (containers.length > 0 && !selectedContainer) {
      const runningContainer = containers.find(c => c.status.toLowerCase().includes('up'))
      if (runningContainer) {
        setSelectedContainer(runningContainer.id)
      } else {
        setSelectedContainer(containers[0].id)
      }
    }
  }, [containers, selectedContainer])

  const handleContainerChange = (value: string) => {
    setSelectedContainer(value)
    setStats(null)
  }

  const containerOptions = containers.map(c => ({
    value: c.id,
    label: `${c.name} (${c.status})`
  }))

  const getStatusColor = (percent: number): string => {
    if (percent >= 80) return '#FF3B30'
    if (percent >= 60) return '#FF9500'
    return '#34C759'
  }

  const renderStats = () => {
    if (!isContainerRunning) {
      return (
        <Alert
          type="warning"
          message={t('app.monitorDetail.containerStopped')}
          description={t('app.monitorDetail.containerStoppedDescription')}
          showIcon
        />
      )
    }

    if (!stats) {
      return <Empty description={t('app.monitorDetail.noStatsData')} />
    }

    return (
      <>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card size="small" title={t('app.monitorDetail.cpuUsage')}>
              <Progress
                percent={Math.round(stats.cpuPercent)}
                status={stats.cpuPercent >= 80 ? 'exception' : 'normal'}
                strokeColor={getStatusColor(stats.cpuPercent)}
              />
              <Text type="secondary">{stats.cpuPercent.toFixed(2)}%</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card size="small" title={t('app.monitorDetail.memoryUsage')}>
              <Progress
                percent={Math.round(stats.memoryPercent)}
                status={stats.memoryPercent >= 80 ? 'exception' : 'normal'}
                strokeColor={getStatusColor(stats.memoryPercent)}
              />
              <Text type="secondary">
                {stats.memoryUsage} / {stats.memoryLimit}
              </Text>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" title={t('app.monitorDetail.networkIO')}>
              <Text style={{ fontFamily: 'monospace' }}>{stats.networkIO}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" title={t('app.monitorDetail.blockIO')}>
              <Text style={{ fontFamily: 'monospace' }}>{stats.blockIO}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" title={t('app.monitorDetail.pids')}>
              <Text style={{ fontFamily: 'monospace' }}>{stats.pids}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" title={t('app.monitorDetail.containerName')}>
              <Text style={{ fontFamily: 'monospace' }} copyable={{ text: stats.containerName }}>
                {stats.containerName}
              </Text>
            </Card>
          </Col>
        </Row>
      </>
    )
  }

  if (containers.length === 0) {
    return (
      <Card>
        <Empty description={t('app.monitorDetail.noContainers')} />
      </Card>
    )
  }

  return (
    <Card
      title={
        <Space>
          <DashboardOutlined />
          <span>{t('app.monitorDetail.title')}</span>
        </Space>
      }
      extra={
        <Space>
          <Select
            value={selectedContainer}
            onChange={handleContainerChange}
            options={containerOptions}
            style={{ minWidth: 200 }}
            placeholder={t('app.monitorDetail.selectContainer')}
          />
          <ReloadOutlined
            onClick={fetchStats}
            style={{ cursor: 'pointer', fontSize: 16 }}
            spin={loading}
          />
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

      {loading && !stats ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        renderStats()
      )}
    </Card>
  )
}

export default ResourceMonitor

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Card,
  Select,
  Button,
  Space,
  Row,
  Col,
  Statistic,
  Typography,
  message,
  Spin,
  Empty,
  Switch,
  Tag,
  Progress,
  Tooltip,
  Badge,
  List,
  Divider,
  Alert
} from 'antd'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts'
import {
  ReloadOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text, Title } = Typography

interface Container {
  id: string
  name: string
  serverId: string
  serverName: string
  appName: string
  status: 'running' | 'stopped' | 'error'
}

interface PerformanceMetrics {
  containerId: string
  containerName: string
  cpuPercent: number
  memoryUsage: string
  memoryLimit: string
  memoryPercent: number
  networkRx: number
  networkTx: number
  networkIO: string
  blockIO: string
  pids: number
  timestamp: string
}

interface HistoricalMetric {
  timestamp: string
  cpuPercent: number
  memoryPercent: number
}

interface PerformanceAlert {
  containerId: string
  containerName: string
  type: 'cpu' | 'memory' | 'network'
  severity: 'warning' | 'critical'
  message: string
  value: number
  threshold: number
}

const ContainerPerformance: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [containers, setContainers] = useState<Container[]>([])
  const [selectedContainers, setSelectedContainers] = useState<string[]>([])
  const [metrics, setMetrics] = useState<Map<string, PerformanceMetrics>>(new Map())
  const [historicalData, setHistoricalData] = useState<Map<string, HistoricalMetric[]>>(new Map())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(5)
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([])
  const [viewMode, setViewMode] = useState<'realtime' | 'comparison'>('realtime')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // CPU 和内存阈值
  const CPU_WARNING_THRESHOLD = 70
  const CPU_CRITICAL_THRESHOLD = 90
  const MEMORY_WARNING_THRESHOLD = 70
  const MEMORY_CRITICAL_THRESHOLD = 90

  // 加载容器列表
  const loadContainers = useCallback(async () => {
    try {
      const [apps, servers] = await Promise.all([
        window.electronAPI.app.getAll(),
        window.electronAPI.server.getAll()
      ])
      const serverNames = new Map(servers.map(s => [s.id, s.name]))
      const containersList: Container[] = []

      for (const app of apps) {
        if (app.containerIds) {
          try {
            const containerIds = JSON.parse(app.containerIds)
            for (const containerId of containerIds) {
              containersList.push({
                id: containerId,
                name: `${app.name}-${containerId.substring(0, 8)}`,
                serverId: app.serverId,
                serverName: serverNames.get(app.serverId) || 'Unknown',
                appName: app.name,
                status: 'running'
              })
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setContainers(containersList)
    } catch (error) {
      console.error('Failed to load containers:', error)
    }
  }, [])

  // 获取容器实时性能指标
  const fetchMetrics = useCallback(async (containerIds: string[]) => {
    if (containerIds.length === 0) return

    const newMetrics = new Map(metrics)
    const newHistoricalData = new Map(historicalData)
    const newAlerts: PerformanceAlert[] = []

    for (const containerId of containerIds) {
      try {
        const container = containers.find(c => c.id === containerId)
        if (!container) continue

        const result = await window.electronAPI.app.getContainerStats(container.serverId, containerId)
        if (result) {
          const metric: PerformanceMetrics = {
            containerId,
            containerName: container.name,
            cpuPercent: result.cpuPercent || 0,
            memoryUsage: result.memoryUsage || '0B',
            memoryLimit: result.memoryLimit || '0B',
            memoryPercent: result.memoryPercent || 0,
            networkRx: 0,
            networkTx: 0,
            networkIO: result.networkIO || '0B / 0B',
            blockIO: result.blockIO || '0B / 0B',
            pids: result.pids || 0,
            timestamp: new Date().toISOString()
          }

          newMetrics.set(containerId, metric)

          // 更新历史数据
          const history = newHistoricalData.get(containerId) || []
          history.push({
            timestamp: metric.timestamp,
            cpuPercent: metric.cpuPercent,
            memoryPercent: metric.memoryPercent
          })
          // 保留最近 60 个数据点
          if (history.length > 60) {
            history.shift()
          }
          newHistoricalData.set(containerId, history)

          // 检查告警
          if (metric.cpuPercent >= CPU_CRITICAL_THRESHOLD) {
            newAlerts.push({
              containerId,
              containerName: container.name,
              type: 'cpu',
              severity: 'critical',
              message: `CPU 使用率过高: ${metric.cpuPercent.toFixed(1)}%`,
              value: metric.cpuPercent,
              threshold: CPU_CRITICAL_THRESHOLD
            })
          } else if (metric.cpuPercent >= CPU_WARNING_THRESHOLD) {
            newAlerts.push({
              containerId,
              containerName: container.name,
              type: 'cpu',
              severity: 'warning',
              message: `CPU 使用率较高: ${metric.cpuPercent.toFixed(1)}%`,
              value: metric.cpuPercent,
              threshold: CPU_WARNING_THRESHOLD
            })
          }

          if (metric.memoryPercent >= MEMORY_CRITICAL_THRESHOLD) {
            newAlerts.push({
              containerId,
              containerName: container.name,
              type: 'memory',
              severity: 'critical',
              message: `内存使用率过高: ${metric.memoryPercent.toFixed(1)}%`,
              value: metric.memoryPercent,
              threshold: MEMORY_CRITICAL_THRESHOLD
            })
          } else if (metric.memoryPercent >= MEMORY_WARNING_THRESHOLD) {
            newAlerts.push({
              containerId,
              containerName: container.name,
              type: 'memory',
              severity: 'warning',
              message: `内存使用率较高: ${metric.memoryPercent.toFixed(1)}%`,
              value: metric.memoryPercent,
              threshold: MEMORY_WARNING_THRESHOLD
            })
          }
        }
      } catch (error) {
        console.error(`Failed to fetch metrics for container ${containerId}:`, error)
      }
    }

    setMetrics(newMetrics)
    setHistoricalData(newHistoricalData)
    setAlerts(newAlerts)
  }, [containers, metrics, historicalData])

  // 刷新数据
  const handleRefresh = useCallback(async () => {
    if (selectedContainers.length === 0) {
      message.warning(t('containerPerformance.selectContainers'))
      return
    }

    setLoading(true)
    try {
      await fetchMetrics(selectedContainers)
    } finally {
      setLoading(false)
    }
  }, [selectedContainers, fetchMetrics, t])

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && selectedContainers.length > 0) {
      intervalRef.current = setInterval(() => {
        fetchMetrics(selectedContainers)
      }, refreshInterval * 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, selectedContainers, fetchMetrics])

  // 初始加载
  useEffect(() => {
    loadContainers()
  }, [loadContainers])

  // 格式化字节
  const formatBytes = (bytes: number | null): string => {
    if (bytes === null || bytes === undefined) return 'N/A'
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 准备图表数据
  const chartData = useMemo(() => {
    const data: Array<Record<string, string | number>> = []
    if (historicalData.size === 0) return data

    const maxLength = Math.max(...Array.from(historicalData.values()).map(h => h.length))

    for (let i = 0; i < maxLength; i++) {
      const point: Record<string, string | number> = {}
      historicalData.forEach((history, containerId) => {
        if (history[i]) {
          point[`cpu_${containerId}`] = history[i].cpuPercent
          point[`memory_${containerId}`] = history[i].memoryPercent
        }
      })
      const firstHistory = Array.from(historicalData.values())[0]
      if (firstHistory?.[i]) {
        point.time = new Date(firstHistory[i].timestamp).toLocaleTimeString()
      }
      data.push(point)
    }

    return data
  }, [historicalData])

  // 准备雷达图数据
  const radarData = useMemo(() => {
    if (metrics.size === 0) return []

    const latestMetrics = Array.from(metrics.values())
    const maxCpu = Math.max(...latestMetrics.map(m => m.cpuPercent), 1)
    const maxMemory = Math.max(...latestMetrics.map(m => m.memoryPercent), 1)
    const maxNetwork = Math.max(...latestMetrics.map(m => m.networkRx + m.networkTx), 1)

    return [
      {
        metric: 'CPU',
        ...Object.fromEntries(latestMetrics.map(m => [m.containerName, (m.cpuPercent / maxCpu) * 100]))
      },
      {
        metric: '内存',
        ...Object.fromEntries(latestMetrics.map(m => [m.containerName, (m.memoryPercent / maxMemory) * 100]))
      },
      {
        metric: '网络',
        ...Object.fromEntries(latestMetrics.map(m => [m.containerName, ((m.networkRx + m.networkTx) / maxNetwork) * 100]))
      }
    ]
  }, [metrics])

  // 获取状态颜色
  const getStatusColor = (value: number, warning: number, critical: number): string => {
    if (value >= critical) return '#FF3B30'
    if (value >= warning) return '#FF9500'
    return '#34C759'
  }

  // 获取趋势图标
  const getTrendIcon = (containerId: string, metric: 'cpu' | 'memory') => {
    const history = historicalData.get(containerId)
    if (!history || history.length < 2) return null

    const latest = history[history.length - 1]
    const previous = history[history.length - 2]
    const diff = metric === 'cpu' 
      ? latest.cpuPercent - previous.cpuPercent 
      : latest.memoryPercent - previous.memoryPercent

    if (diff > 5) return <RiseOutlined style={{ color: '#FF3B30' }} />
    if (diff < -5) return <FallOutlined style={{ color: '#34C759' }} />
    return null
  }

  // 容器选择选项
  const containerOptions = containers.map(c => ({
    value: c.id,
    label: (
      <Space>
        <Badge status={c.status === 'running' ? 'success' : 'default'} />
        <span>{c.name}</span>
        <Text type="secondary" style={{ fontSize: 12 }}>({c.serverName})</Text>
      </Space>
    )
  }))

  // 雷达图颜色
  const radarColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#387908', '#00C49F']

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={3} style={{ margin: 0 }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            {t('containerPerformance.title')}
          </Title>
          <Text type="secondary">{t('containerPerformance.description')}</Text>
        </div>
      </div>

      {/* 控制面板 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Text strong>{t('containerPerformance.selectContainers')}:</Text>
          <Select
            mode="multiple"
            style={{ minWidth: 300, maxWidth: 600 }}
            placeholder={t('containerPerformance.selectContainersPlaceholder')}
            value={selectedContainers}
            onChange={setSelectedContainers}
            options={containerOptions}
            optionFilterProp="label"
            allowClear
            showSearch
          />
          <Divider type="vertical" />
          <Text>{t('containerPerformance.autoRefresh')}:</Text>
          <Switch
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedChildren={<PlayCircleOutlined />}
            unCheckedChildren={<StopOutlined />}
          />
          <Select
            value={refreshInterval}
            onChange={setRefreshInterval}
            disabled={autoRefresh}
            style={{ width: 100 }}
            options={[
              { value: 3, label: '3s' },
              { value: 5, label: '5s' },
              { value: 10, label: '10s' },
              { value: 30, label: '30s' }
            ]}
          />
          <Divider type="vertical" />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
            disabled={selectedContainers.length === 0}
          >
            {t('containerPerformance.refresh')}
          </Button>
        </Space>
      </Card>

      {/* 告警信息 */}
      {alerts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={
            <Space>
              <Text strong>{t('containerPerformance.alerts')}:</Text>
              <Tag color="error">{alerts.filter(a => a.severity === 'critical').length} {t('containerPerformance.critical')}</Tag>
              <Tag color="warning">{alerts.filter(a => a.severity === 'warning').length} {t('containerPerformance.warning')}</Tag>
            </Space>
          }
          description={
            <List
              size="small"
              dataSource={alerts.slice(0, 5)}
              renderItem={item => (
                <List.Item>
                  <Space>
                    <Tag color={item.severity === 'critical' ? 'error' : 'warning'}>{item.type.toUpperCase()}</Tag>
                    <Text>{item.containerName}</Text>
                    <Text type="secondary">{item.message}</Text>
                  </Space>
                </List.Item>
              )}
            />
          }
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      {selectedContainers.length === 0 ? (
        <Card>
          <Empty description={t('containerPerformance.noContainersSelected')} />
        </Card>
      ) : loading && metrics.size === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* 实时指标卡片 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {Array.from(metrics.entries()).map(([containerId, metric]) => {
              const container = containers.find(c => c.id === containerId)
              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={containerId}>
                  <Card
                    size="small"
                    title={
                      <Space>
                        <Badge status="success" />
                        <Text strong ellipsis style={{ maxWidth: 120 }} title={metric.containerName}>
                          {metric.containerName}
                        </Text>
                      </Space>
                    }
                    extra={getTrendIcon(containerId, 'cpu')}
                  >
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      <div>
                        <Text type="secondary">{t('containerPerformance.cpu')}</Text>
                        <Progress
                          percent={Math.round(metric.cpuPercent)}
                          size="small"
                          strokeColor={getStatusColor(metric.cpuPercent, CPU_WARNING_THRESHOLD, CPU_CRITICAL_THRESHOLD)}
                          format={(percent) => `${percent}%`}
                        />
                      </div>
                      <div>
                        <Text type="secondary">{t('containerPerformance.memory')}</Text>
                        <Progress
                          percent={Math.round(metric.memoryPercent)}
                          size="small"
                          strokeColor={getStatusColor(metric.memoryPercent, MEMORY_WARNING_THRESHOLD, MEMORY_CRITICAL_THRESHOLD)}
                          format={(percent) => `${percent}%`}
                        />
                      </div>
                      <Row gutter={8}>
                        <Col span={12}>
                          <Statistic
                            title={t('containerPerformance.memUsage')}
                            value={metric.memoryUsage}
                            valueStyle={{ fontSize: 14 }}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title={t('containerPerformance.memLimit')}
                            value={metric.memoryLimit}
                            valueStyle={{ fontSize: 14 }}
                          />
                        </Col>
                      </Row>
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>

          {/* 视图切换 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space>
              <Text strong>{t('containerPerformance.viewMode')}:</Text>
              <Button
                type={viewMode === 'realtime' ? 'primary' : 'default'}
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => setViewMode('realtime')}
              >
                {t('containerPerformance.realtimeChart')}
              </Button>
              <Button
                type={viewMode === 'comparison' ? 'primary' : 'default'}
                size="small"
                icon={<DashboardOutlined />}
                onClick={() => setViewMode('comparison')}
              >
                {t('containerPerformance.comparison')}
              </Button>
            </Space>
          </Card>

          {/* 实时图表 */}
          {viewMode === 'realtime' && (
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title={t('containerPerformance.cpuChart')} size="small">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <RechartsTooltip />
                      <Legend />
                      {selectedContainers.map((containerId, index) => {
                        const container = containers.find(c => c.id === containerId)
                        return (
                          <Line
                            key={containerId}
                            type="monotone"
                            dataKey={`cpu_${containerId}`}
                            name={container?.name || containerId.substring(0, 8)}
                            stroke={radarColors[index % radarColors.length]}
                            dot={false}
                            strokeWidth={2}
                          />
                        )
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title={t('containerPerformance.memoryChart')} size="small">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <RechartsTooltip />
                      <Legend />
                      {selectedContainers.map((containerId, index) => {
                        const container = containers.find(c => c.id === containerId)
                        return (
                          <Line
                            key={containerId}
                            type="monotone"
                            dataKey={`memory_${containerId}`}
                            name={container?.name || containerId.substring(0, 8)}
                            stroke={radarColors[index % radarColors.length]}
                            dot={false}
                            strokeWidth={2}
                          />
                        )
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>
          )}

          {/* 对比视图 */}
          {viewMode === 'comparison' && (
            <Card title={t('containerPerformance.radarComparison')} size="small">
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  {selectedContainers.map((containerId, index) => {
                    const container = containers.find(c => c.id === containerId)
                    return (
                      <Radar
                        key={containerId}
                        name={container?.name || containerId.substring(0, 8)}
                        dataKey={container?.name || containerId.substring(0, 8)}
                        stroke={radarColors[index % radarColors.length]}
                        fill={radarColors[index % radarColors.length]}
                        fillOpacity={0.3}
                      />
                    )
                  })}
                  <Legend />
                  <RechartsTooltip />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default ContainerPerformance

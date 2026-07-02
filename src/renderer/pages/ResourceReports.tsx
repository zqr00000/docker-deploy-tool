import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Select,
  DatePicker,
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
  InputNumber,
  Tooltip,
  Table,
  Tag
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
  AreaChart,
  Area
} from 'recharts'
import {
  DownloadOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  StopOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { Dayjs } from 'dayjs'

const { Text, Title } = Typography
const { RangePicker } = DatePicker

interface ResourceMetric {
  id: string
  serverId: string
  appId: string | null
  containerId: string | null
  cpuPercent: number | null
  memoryUsage: number | null
  memoryLimit: number | null
  networkRx: number | null
  networkTx: number | null
  blockRead: number | null
  blockWrite: number | null
  timestamp: string
}

interface MetricsSummary {
  avgCpuPercent: number
  maxCpuPercent: number
  avgMemoryUsage: number
  maxMemoryUsage: number
  avgNetworkRx: number
  avgNetworkTx: number
  totalBlockRead: number
  totalBlockWrite: number
  dataPoints: number
  period: string
}

interface Server {
  id: string
  name: string
  host: string
  status: string
}

interface App {
  id: string
  name: string
  serverId: string
}

const PERIOD_OPTIONS = [
  { value: '1h', label: '1 小时' },
  { value: '6h', label: '6 小时' },
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' }
]

const ResourceReports: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined)
  const [selectedApp, setSelectedApp] = useState<string | undefined>(undefined)
  const [period, setPeriod] = useState<string>('24h')
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [metrics, setMetrics] = useState<ResourceMetric[]>([])
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [autoCollect, setAutoCollect] = useState(false)
  const [collectInterval, setCollectInterval] = useState(60)
  const [activeCollectionCount, setActiveCollectionCount] = useState(0)

  // Load servers
  const loadServers = useCallback(async () => {
    try {
      const data = await window.electronAPI.server.getAll()
      setServers(data)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }, [])

  // Load apps
  const loadApps = useCallback(async () => {
    try {
      const data = await window.electronAPI.app.getAll()
      setApps(data)
    } catch (error) {
      console.error('Failed to load apps:', error)
    }
  }, [])

  // Load metrics data
  const loadMetrics = useCallback(async () => {
    if (!selectedServer && !selectedApp) {
      message.warning(t('resourceReports.selectServerOrApp'))
      return
    }

    setLoading(true)
    try {
      let startTime: string | undefined
      let endTime: string | undefined

      if (dateRange && dateRange[0] && dateRange[1]) {
        startTime = dateRange[0].toISOString()
        endTime = dateRange[1].toISOString()
      } else {
        const now = new Date()
        switch (period) {
          case '1h':
            startTime = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
            break
          case '6h':
            startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
            break
          case '24h':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
            break
          case '7d':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
            break
          case '30d':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
            break
        }
        endTime = now.toISOString()
      }

      const result = await window.electronAPI.resourceReport.getMetrics({
        serverId: selectedServer,
        appId: selectedApp,
        startTime,
        endTime,
        limit: 10000
      })

      setMetrics(result.metrics)

      // Load summary
      const summaryData = await window.electronAPI.resourceReport.getSummary(
        selectedServer,
        selectedApp,
        period
      )
      setSummary(summaryData)
    } catch (error) {
      message.error(t('resourceReports.loadError'))
      console.error('Failed to load metrics:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedServer, selectedApp, period, dateRange, t])

  // Export to CSV
  const handleExportCSV = async () => {
    if (metrics.length === 0) {
      message.warning(t('resourceReports.noDataToExport'))
      return
    }

    try {
      const result = await window.electronAPI.resourceReport.exportCSV(metrics)
      if (result.success) {
        message.success(t('resourceReports.exportSuccess'))
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error(t('resourceReports.exportFailed'))
      console.error('Export error:', error)
    }
  }

  // Cleanup old data
  const handleCleanup = async () => {
    try {
      const result = await window.electronAPI.resourceReport.cleanup(30)
      if (result.success) {
        message.success(t('resourceReports.cleanupSuccess').replace('{{count}}', result.deleted.toString()))
        loadMetrics()
      }
    } catch (error) {
      message.error(t('resourceReports.cleanupFailed'))
      console.error('Cleanup error:', error)
    }
  }

  // Toggle auto collection
  const handleToggleAutoCollect = async (checked: boolean) => {
    setAutoCollect(checked)
    if (checked) {
      if (!selectedServer) {
        message.warning(t('resourceReports.selectServerFirst'))
        setAutoCollect(false)
        return
      }

      // Get containers for the selected app or server
      let containerIds: string[] = []
      if (selectedApp) {
        const appInfo = apps.find(a => a.id === selectedApp)
        if (appInfo?.containerIds) {
          try {
            containerIds = JSON.parse(appInfo.containerIds)
          } catch {
            containerIds = []
          }
        }
      } else {
        // Get all containers from all apps on this server
        const serverApps = apps.filter(a => a.serverId === selectedServer)
        for (const app of serverApps) {
          if (app.containerIds) {
            try {
              const ids = JSON.parse(app.containerIds)
              containerIds.push(...ids)
            } catch {
              // ignore
            }
          }
        }
      }

      if (containerIds.length === 0) {
        message.warning(t('resourceReports.noContainersFound'))
        setAutoCollect(false)
        return
      }

      try {
        await window.electronAPI.resourceReport.startPeriodicCollection(
          selectedServer,
          containerIds,
          collectInterval * 1000
        )
        const count = await window.electronAPI.resourceReport.getActiveCollectionCount()
        setActiveCollectionCount(count)
        message.success(t('resourceReports.collectionStarted'))
      } catch (error) {
        message.error(t('resourceReports.collectionStartFailed'))
        setAutoCollect(false)
      }
    } else {
      try {
        if (selectedServer) {
          await window.electronAPI.resourceReport.stopPeriodicCollection(selectedServer)
        }
        const count = await window.electronAPI.resourceReport.getActiveCollectionCount()
        setActiveCollectionCount(count)
        message.success(t('resourceReports.collectionStopped'))
      } catch (error) {
        message.error(t('resourceReports.collectionStopFailed'))
      }
    }
  }

  // Initial load
  useEffect(() => {
    loadServers()
    loadApps()
  }, [loadServers, loadApps])

  // Auto-load metrics when server/app/period changes
  useEffect(() => {
    if (selectedServer || selectedApp) {
      loadMetrics()
    }
  }, [selectedServer, selectedApp, period])

  // Format bytes to human readable
  const formatBytes = (bytes: number | null): string => {
    if (bytes === null || bytes === undefined) return 'N/A'
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Prepare chart data
  const chartData = metrics.map(m => ({
    time: new Date(m.timestamp).toLocaleString(),
    cpuPercent: m.cpuPercent || 0,
    memoryUsage: m.memoryUsage || 0,
    memoryLimit: m.memoryLimit || 0,
    networkRx: m.networkRx || 0,
    networkTx: m.networkTx || 0,
    blockRead: m.blockRead || 0,
    blockWrite: m.blockWrite || 0
  }))

  // Table columns
  const columns = [
    {
      title: t('resourceReports.timestamp'),
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (text: string) => new Date(text).toLocaleString(),
      width: 180
    },
    {
      title: t('resourceReports.cpuPercent'),
      dataIndex: 'cpuPercent',
      key: 'cpuPercent',
      render: (value: number | null) => (
        <Tag color={value && value > 80 ? 'red' : value && value > 60 ? 'orange' : 'green'}>
          {value?.toFixed(2)}%
        </Tag>
      ),
      width: 120
    },
    {
      title: t('resourceReports.memoryUsage'),
      dataIndex: 'memoryUsage',
      key: 'memoryUsage',
      render: (value: number | null) => formatBytes(value),
      width: 120
    },
    {
      title: t('resourceReports.networkRx'),
      dataIndex: 'networkRx',
      key: 'networkRx',
      render: (value: number | null) => formatBytes(value),
      width: 120
    },
    {
      title: t('resourceReports.networkTx'),
      dataIndex: 'networkTx',
      key: 'networkTx',
      render: (value: number | null) => formatBytes(value),
      width: 120
    },
    {
      title: t('resourceReports.blockRead'),
      dataIndex: 'blockRead',
      key: 'blockRead',
      render: (value: number | null) => formatBytes(value),
      width: 120
    },
    {
      title: t('resourceReports.blockWrite'),
      dataIndex: 'blockWrite',
      key: 'blockWrite',
      render: (value: number | null) => formatBytes(value),
      width: 120
    }
  ]

  // Filter apps based on selected server
  const filteredApps = selectedServer
    ? apps.filter(a => a.serverId === selectedServer)
    : apps

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={3} style={{ margin: 0 }}>{t('resourceReports.title')}</Title>
        </div>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>{t('resourceReports.server')}:</Text>
          <Select
            value={selectedServer}
            onChange={(value) => {
              setSelectedServer(value)
              setSelectedApp(undefined)
            }}
            allowClear
            placeholder={t('resourceReports.selectServer')}
            style={{ width: 200 }}
            options={servers.map(s => ({ value: s.id, label: `${s.name} (${s.host})` }))}
          />
          <Text>{t('resourceReports.app')}:</Text>
          <Select
            value={selectedApp}
            onChange={setSelectedApp}
            allowClear
            placeholder={t('resourceReports.selectApp')}
            style={{ width: 200 }}
            options={filteredApps.map(a => ({ value: a.id, label: a.name }))}
          />
          <Text>{t('resourceReports.period')}:</Text>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 120 }}
            options={PERIOD_OPTIONS}
            disabled={!!dateRange}
          />
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            showTime
            placeholder={[t('resourceReports.startTime'), t('resourceReports.endTime')]}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadMetrics}
            loading={loading}
          >
            {t('resourceReports.query')}
          </Button>
        </Space>
      </Card>

      {/* Summary Statistics */}
      {summary && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.avgCpu')}
                value={summary.avgCpuPercent.toFixed(2)}
                suffix="%"
                valueStyle={{ color: summary.avgCpuPercent > 80 ? '#cf1322' : '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.maxCpu')}
                value={summary.maxCpuPercent.toFixed(2)}
                suffix="%"
                valueStyle={{ color: summary.maxCpuPercent > 80 ? '#cf1322' : '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.avgMemory')}
                value={formatBytes(summary.avgMemoryUsage)}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.maxMemory')}
                value={formatBytes(summary.maxMemoryUsage)}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.totalNetworkRx')}
                value={formatBytes(summary.avgNetworkRx * summary.dataPoints)}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.totalNetworkTx')}
                value={formatBytes(summary.avgNetworkTx * summary.dataPoints)}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.totalBlockRead')}
                value={formatBytes(summary.totalBlockRead)}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <Statistic
                title={t('resourceReports.totalBlockWrite')}
                value={formatBytes(summary.totalBlockWrite)}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Auto Collection Control */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Text>{t('resourceReports.autoCollect')}:</Text>
          <Switch
            checked={autoCollect}
            onChange={handleToggleAutoCollect}
            checkedChildren={<PlayCircleOutlined />}
            unCheckedChildren={<StopOutlined />}
          />
          <Text>{t('resourceReports.interval')}:</Text>
          <InputNumber
            value={collectInterval}
            onChange={(value) => setCollectInterval(value || 60)}
            min={10}
            max={3600}
            disabled={autoCollect}
            addonAfter="s"
          />
          <Tooltip title={t('resourceReports.activeCollectionTooltip')}>
            <Tag color="blue">
              {t('resourceReports.activeCollections')}: {activeCollectionCount}
            </Tag>
          </Tooltip>
          <Button
            icon={<DeleteOutlined />}
            onClick={handleCleanup}
            size="small"
          >
            {t('resourceReports.cleanup')}
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
            size="small"
            disabled={metrics.length === 0}
          >
            {t('resourceReports.exportCSV')}
          </Button>
        </Space>
      </Card>

      {/* Charts */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : metrics.length === 0 ? (
        <Card>
          <Empty description={t('resourceReports.noData')} />
        </Card>
      ) : (
        <>
          {/* CPU Chart */}
          <Card title={t('resourceReports.cpuChart')} size="small" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  label={{ value: '%', angle: -90, position: 'insideLeft' }}
                />
                <RechartsTooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="cpuPercent"
                  name={t('resourceReports.cpuPercent')}
                  stroke="#8884d8"
                  fill="#8884d8"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Memory Chart */}
          <Card title={t('resourceReports.memoryChart')} size="small" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => formatBytes(value)}
                />
                <RechartsTooltip formatter={(value: number) => formatBytes(value)} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="memoryUsage"
                  name={t('resourceReports.memoryUsage')}
                  stroke="#82ca9d"
                  fill="#82ca9d"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="memoryLimit"
                  name={t('resourceReports.memoryLimit')}
                  stroke="#ffc658"
                  fill="#ffc658"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Network Chart */}
          <Card title={t('resourceReports.networkChart')} size="small" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => formatBytes(value)}
                />
                <RechartsTooltip formatter={(value: number) => formatBytes(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="networkRx"
                  name={t('resourceReports.networkRx')}
                  stroke="#8884d8"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="networkTx"
                  name={t('resourceReports.networkTx')}
                  stroke="#82ca9d"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Disk I/O Chart */}
          <Card title={t('resourceReports.diskChart')} size="small" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => formatBytes(value)}
                />
                <RechartsTooltip formatter={(value: number) => formatBytes(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="blockRead"
                  name={t('resourceReports.blockRead')}
                  stroke="#ff7300"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="blockWrite"
                  name={t('resourceReports.blockWrite')}
                  stroke="#387908"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Data Table */}
          <Card title={t('resourceReports.dataTable')} size="small">
            <Table
              columns={columns}
              dataSource={metrics}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 900 }}
            />
          </Card>
        </>
      )}
    </div>
  )
}

export default ResourceReports

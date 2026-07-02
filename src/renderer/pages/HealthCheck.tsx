import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  InputNumber,
  Switch,
  message,
  Typography,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Tabs,
  Tooltip,
  Empty,
  Descriptions,
  Progress,
  Select,
  Badge,
  Timeline
} from 'antd'
import {
  ReloadOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  ClearOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography
const { Option } = Select

interface ContainerHealthStatus {
  containerId: string
  containerName: string
  status: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown'
  healthStatus: string
  uptime: string
  restartCount: number
  exitCode: number
  errorMessage?: string
  responseTime?: number
}

interface AppHealthStatus {
  appId: string
  appName: string
  serverId: string
  projectPath: string
  overallStatus: 'healthy' | 'unhealthy' | 'partial' | 'unknown'
  containers: ContainerHealthStatus[]
  lastCheckTime: string
  autoRestartEnabled: boolean
  restartCount: number
}

interface HealthCheckConfig {
  id: string
  appId: string
  autoRestart: boolean
  maxRestarts: number
  restartWindow: number
  notifyOnRestart: boolean
  createdAt: string
  updatedAt: string
}

interface HealthCheckHistoryRecord {
  id: string
  appId: string
  containerId: string | null
  containerName: string | null
  checkTime: string
  status: string
  healthStatus: string | null
  restartCount: number
  autoRestarted: number
  errorMessage: string | null
  responseTime: number | null
  createdAt: string
}

interface HealthCheckReport {
  appId: string
  appName: string
  serverId: string
  totalChecks: number
  healthyCount: number
  unhealthyCount: number
  autoRestarts: number
  uptime: number
  lastCheckTime: string
  containers: {
    name: string
    status: string
    healthStatus: string
    restartCount: number
  }[]
}

const statusColors: Record<string, string> = {
  healthy: 'success',
  unhealthy: 'error',
  starting: 'processing',
  partial: 'warning',
  none: 'default',
  unknown: 'default'
}

const statusLabels: Record<string, string> = {
  healthy: '健康',
  unhealthy: '异常',
  starting: '启动中',
  partial: '部分异常',
  none: '无状态',
  unknown: '未知'
}

const HealthCheckPage: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState<HealthCheckReport[]>([])
  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [healthDetail, setHealthDetail] = useState<AppHealthStatus | null>(null)
  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [config, setConfig] = useState<HealthCheckConfig | null>(null)
  const [history, setHistory] = useState<HealthCheckHistoryRecord[]>([])
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('overview')
  const [periodicRunning, setPeriodicRunning] = useState(true)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.healthCheck.getAllReports()
      setReports(result)
    } catch (error) {
      message.error('获取健康检查报告失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleViewDetail = async (appId: string, serverId: string, projectPath: string) => {
    try {
      const result = await window.electronAPI.healthCheck.getAppHealth(serverId, projectPath)
      setHealthDetail(result)
      setSelectedApp(appId)
    } catch (error) {
      message.error('获取健康状态失败')
    }
  }

  const handleConfig = async (appId: string) => {
    try {
      const result = await window.electronAPI.healthCheck.getConfig(appId)
      setConfig(result)
      form.setFieldsValue({
        autoRestart: result?.autoRestart ?? false,
        maxRestarts: result?.maxRestarts ?? 3,
        restartWindow: result?.restartWindow ?? 3600,
        notifyOnRestart: result?.notifyOnRestart ?? true
      })
      setConfigModalVisible(true)
    } catch (error) {
      message.error('获取配置失败')
    }
  }

  const handleSaveConfig = async () => {
    try {
      const values = await form.validateFields()
      if (selectedApp) {
        await window.electronAPI.healthCheck.updateConfig(selectedApp, values)
        message.success('配置保存成功')
        setConfigModalVisible(false)
      }
    } catch (error) {
      message.error('保存配置失败')
    }
  }

  const handleViewHistory = async (appId: string) => {
    try {
      const result = await window.electronAPI.healthCheck.getHistory(appId, 100)
      setHistory(result)
      setSelectedApp(appId)
      setHistoryModalVisible(true)
    } catch (error) {
      message.error('获取历史记录失败')
    }
  }

  const handlePerformCheck = async () => {
    setLoading(true)
    try {
      await window.electronAPI.healthCheck.performCheck()
      await fetchReports()
      message.success('健康检查完成')
    } catch (error) {
      message.error('健康检查失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCleanupHistory = async () => {
    try {
      const result = await window.electronAPI.healthCheck.cleanupHistory(30)
      if (result.success) {
        message.success(`已清理 ${result.deleted} 条过期记录`)
      }
    } catch (error) {
      message.error('清理失败')
    }
  }

  const handleTogglePeriodic = async () => {
    try {
      if (periodicRunning) {
        await window.electronAPI.healthCheck.stopPeriodic()
        message.success('已停止定期健康检查')
      } else {
        await window.electronAPI.healthCheck.startPeriodic(60000)
        message.success('已启动定期健康检查')
      }
      setPeriodicRunning(!periodicRunning)
    } catch (error) {
      message.error('操作失败')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'unhealthy':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      case 'starting':
        return <LoadingOutlined style={{ color: '#1890ff' }} />
      case 'partial':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      default:
        return <ExclamationCircleOutlined style={{ color: '#d9d9d9' }} />
    }
  }

  const reportColumns: ColumnsType<HealthCheckReport> = [
    {
      title: '应用名称',
      dataIndex: 'appName',
      key: 'appName',
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '状态',
      key: 'status',
      render: (_: unknown, record: HealthCheckReport) => {
        const hasUnhealthy = record.containers.some(c => c.status === 'unhealthy')
        const hasHealthy = record.containers.some(c => c.status === 'healthy')
        let status = 'healthy'
        if (hasUnhealthy && hasHealthy) status = 'partial'
        else if (hasUnhealthy) status = 'unhealthy'
        else if (!hasHealthy) status = 'unknown'
        
        return (
          <Space>
            {getStatusIcon(status)}
            <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
          </Space>
        )
      }
    },
    {
      title: '可用率',
      dataIndex: 'uptime',
      key: 'uptime',
      render: (value: number) => (
        <Progress
          percent={value}
          size="small"
          status={value >= 95 ? 'success' : value >= 80 ? 'normal' : 'exception'}
          style={{ width: 100 }}
        />
      )
    },
    {
      title: '总检查次数',
      dataIndex: 'totalChecks',
      key: 'totalChecks'
    },
    {
      title: '自动重启次数',
      dataIndex: 'autoRestarts',
      key: 'autoRestarts',
      render: (value: number) => value > 0 ? <Text type="warning">{value}</Text> : value
    },
    {
      title: '最后检查',
      dataIndex: 'lastCheckTime',
      key: 'lastCheckTime',
      render: (text: string) => text !== '-' ? new Date(text).toLocaleString() : '-'
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: HealthCheckReport) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewDetail(record.appId, record.serverId, '')}
            />
          </Tooltip>
          <Tooltip title="配置">
            <Button
              type="link"
              size="small"
              icon={<SettingOutlined />}
              onClick={() => {
                setSelectedApp(record.appId)
                handleConfig(record.appId)
              }}
            />
          </Tooltip>
          <Tooltip title="历史记录">
            <Button
              type="link"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewHistory(record.appId)}
            />
          </Tooltip>
        </Space>
      )
    }
  ]

  const historyColumns: ColumnsType<HealthCheckHistoryRecord> = [
    {
      title: '时间',
      dataIndex: 'checkTime',
      key: 'checkTime',
      render: (text: string) => new Date(text).toLocaleString()
    },
    {
      title: '容器',
      dataIndex: 'containerName',
      key: 'containerName'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColors[status] || 'default'}>
          {statusLabels[status] || status}
        </Tag>
      )
    },
    {
      title: '健康状态',
      dataIndex: 'healthStatus',
      key: 'healthStatus'
    },
    {
      title: '自动重启',
      dataIndex: 'autoRestarted',
      key: 'autoRestarted',
      render: (value: number) => value === 1 ? <Tag color="orange">是</Tag> : '否'
    },
    {
      title: '响应时间',
      dataIndex: 'responseTime',
      key: 'responseTime',
      render: (value: number | null) => value ? `${value}ms` : '-'
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (text: string | null) => text || '-'
    }
  ]

  const totalApps = reports.length
  const healthyApps = reports.filter(r => !r.containers.some(c => c.status === 'unhealthy')).length
  const unhealthyApps = reports.filter(r => r.containers.some(c => c.status === 'unhealthy')).length
  const totalRestarts = reports.reduce((sum, r) => sum + r.autoRestarts, 0)

  return (
    <div className="page-content">
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="应用总数"
              value={totalApps}
              prefix={<Badge status="default" />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="健康应用"
              value={healthyApps}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="异常应用"
              value={unhealthyApps}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="自动重启次数"
              value={totalRestarts}
              valueStyle={{ color: totalRestarts > 0 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

        <Card
          title="健康检查报告"
          extra={
            <Space wrap>
              <Button
                icon={periodicRunning ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={handleTogglePeriodic}
              >
                {periodicRunning ? '停止定期检查' : '启动定期检查'}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handlePerformCheck}
                loading={loading}
              >
                立即检查
              </Button>
              <Popconfirm
                title="确定清理30天前的历史记录吗？"
                onConfirm={handleCleanupHistory}
              >
                <Button icon={<ClearOutlined />}>清理历史</Button>
              </Popconfirm>
            </Space>
          }
        >
          <Table
            columns={reportColumns}
            dataSource={reports}
            rowKey="appId"
            loading={loading}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: <Empty description="暂无健康检查数据" /> }}
            scroll={{ x: 800 }}
          />
        </Card>

      {/* 健康详情模态框 */}
      <Modal
        title={`健康详情 - ${healthDetail?.appName || ''}`}
        open={!!healthDetail}
        onCancel={() => setHealthDetail(null)}
        footer={null}
        width={800}
      >
        {healthDetail && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="应用名称">{healthDetail.appName}</Descriptions.Item>
              <Descriptions.Item label="总体状态">
                <Tag color={statusColors[healthDetail.overallStatus]}>
                  {statusLabels[healthDetail.overallStatus]}
                </Tag>
                  </Descriptions.Item>
              <Descriptions.Item label="自动重启">
                {healthDetail.autoRestartEnabled ? '已启用' : '已禁用'}
              </Descriptions.Item>
              <Descriptions.Item label="总重启次数">{healthDetail.restartCount}</Descriptions.Item>
              <Descriptions.Item label="最后检查时间" span={2}>
                {new Date(healthDetail.lastCheckTime).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>容器状态</Title>
            <Table
              columns={[
                {
                  title: '容器名称',
                  dataIndex: 'containerName',
                  key: 'containerName'
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
                  )
                },
                {
                  title: '健康状态',
                  dataIndex: 'healthStatus',
                  key: 'healthStatus'
                },
                {
                  title: '运行时间',
                  dataIndex: 'uptime',
                  key: 'uptime'
                },
                {
                  title: '重启次数',
                  dataIndex: 'restartCount',
                  key: 'restartCount'
                },
                {
                  title: '响应时间',
                  dataIndex: 'responseTime',
                  key: 'responseTime',
                  render: (value: number | undefined) => value ? `${value}ms` : '-'
                }
              ]}
              dataSource={healthDetail.containers}
              rowKey="containerId"
              pagination={false}
              size="small"
            />
          </Space>
        )}
      </Modal>

      {/* 配置模态框 */}
      <Modal
        title="健康检查配置"
        open={configModalVisible}
        onOk={handleSaveConfig}
        onCancel={() => setConfigModalVisible(false)}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            autoRestart: false,
            maxRestarts: 3,
            restartWindow: 3600,
            notifyOnRestart: true
          }}
        >
          <Form.Item
            name="autoRestart"
            label="自动重启异常容器"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="maxRestarts"
            label="最大重启次数"
            tooltip="在重启窗口期内允许的最大自动重启次数"
          >
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="restartWindow"
            label="重启窗口（秒）"
            tooltip="计算最大重启次数的时间窗口"
          >
            <InputNumber min={60} max={86400} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="notifyOnRestart"
            label="重启时通知"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 历史记录模态框 */}
      <Modal
        title="健康检查历史"
        open={historyModalVisible}
        onCancel={() => setHistoryModalVisible(false)}
        footer={null}
        width={900}
      >
        <Table
          columns={historyColumns}
          dataSource={history}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
          scroll={{ y: 400 }}
        />
      </Modal>
    </div>
  )
}

export default HealthCheckPage

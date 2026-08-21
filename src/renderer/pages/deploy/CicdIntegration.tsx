import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Select,
  Button,
  Space,
  Row,
  Col,
  Typography,
  message,
  Empty,
  Table,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  Tabs,
  Timeline,
  Badge,
  Tooltip,
  Alert,
  List,
  Divider,
  Statistic
} from 'antd'
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  BranchesOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  SettingOutlined,
  ApiOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Server } from '../../types/server'

const { Text, Title, Paragraph } = Typography
const { TextArea } = Input

interface Pipeline {
  id: string
  name: string
  serverId: string
  serverName: string
  repoUrl: string
  branch: string
  triggerType: 'webhook' | 'manual' | 'schedule'
  webhookUrl?: string
  autoDeploy: boolean
  enabled: boolean
  lastRun?: string
  status: 'idle' | 'running' | 'success' | 'failed'
}

interface DeploymentRecord {
  id: string
  pipelineId: string
  pipelineName: string
  serverName: string
  commit: string
  branch: string
  triggeredBy: string
  startTime: string
  endTime?: string
  status: 'running' | 'success' | 'failed'
  duration?: number
  logs?: string
}

const CicdIntegration: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([])
  const [activeTab, setActiveTab] = useState('pipelines')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null)
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentRecord | null>(null)
  const [logsModalVisible, setLogsModalVisible] = useState(false)
  const [form] = Form.useForm()

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    try {
      const data = await window.electronAPI.server.getAll()
      setServers(data.filter(s => s.status === 'online'))
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    loadServers()
    // 模拟数据
    setPipelines([
      {
        id: 'pipeline1',
        name: 'Frontend App Deploy',
        serverId: 'server1',
        serverName: 'Production Server',
        repoUrl: 'https://github.com/example/frontend.git',
        branch: 'main',
        triggerType: 'webhook',
        webhookUrl: 'https://api.example.com/webhook/deploy',
        autoDeploy: true,
        enabled: true,
        lastRun: new Date(Date.now() - 3600000).toISOString(),
        status: 'success'
      },
      {
        id: 'pipeline2',
        name: 'Backend API Deploy',
        serverId: 'server1',
        serverName: 'Production Server',
        repoUrl: 'https://github.com/example/backend.git',
        branch: 'develop',
        triggerType: 'manual',
        autoDeploy: false,
        enabled: true,
        lastRun: new Date(Date.now() - 86400000).toISOString(),
        status: 'failed'
      }
    ])

    setDeployments([
      {
        id: 'deploy1',
        pipelineId: 'pipeline1',
        pipelineName: 'Frontend App Deploy',
        serverName: 'Production Server',
        commit: 'abc1234',
        branch: 'main',
        triggeredBy: 'webhook',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() - 3540000).toISOString(),
        status: 'success',
        duration: 60
      },
      {
        id: 'deploy2',
        pipelineId: 'pipeline2',
        pipelineName: 'Backend API Deploy',
        serverName: 'Production Server',
        commit: 'def5678',
        branch: 'develop',
        triggeredBy: 'manual',
        startTime: new Date(Date.now() - 86400000).toISOString(),
        endTime: new Date(Date.now() - 86340000).toISOString(),
        status: 'failed',
        duration: 60
      }
    ])
  }, [loadServers])

  // 打开创建/编辑流水线模态框
  const handleOpenModal = (pipeline?: Pipeline) => {
    if (pipeline) {
      setEditingPipeline(pipeline)
      form.setFieldsValue(pipeline)
    } else {
      setEditingPipeline(null)
      form.resetFields()
    }
    setModalVisible(true)
  }

  // 保存流水线
  const handleSavePipeline = async () => {
    try {
      const values = await form.validateFields()
      if (editingPipeline) {
        setPipelines(prev =>
          prev.map(p => p.id === editingPipeline.id ? { ...p, ...values } : p)
        )
        message.success(t('cicd.pipelineUpdated'))
      } else {
        const newPipeline: Pipeline = {
          id: `pipeline-${Date.now()}`,
          ...values,
          serverName: servers.find(s => s.id === values.serverId)?.name || 'Unknown',
          status: 'idle',
          lastRun: undefined
        }
        setPipelines(prev => [...prev, newPipeline])
        message.success(t('cicd.pipelineCreated'))
      }
      setModalVisible(false)
    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  // 删除流水线
  const handleDeletePipeline = (pipelineId: string) => {
    Modal.confirm({
      title: t('cicd.deletePipelineConfirm'),
      content: t('cicd.deletePipelineWarning'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: () => {
        setPipelines(prev => prev.filter(p => p.id !== pipelineId))
        message.success(t('cicd.pipelineDeleted'))
      }
    })
  }

  // 触发部署
  const handleTriggerDeploy = async (pipeline: Pipeline) => {
    setLoading(true)
    try {
      // 模拟部署
      await new Promise(resolve => setTimeout(resolve, 2000))

      const newDeployment: DeploymentRecord = {
        id: `deploy-${Date.now()}`,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        serverName: pipeline.serverName,
        commit: Math.random().toString(36).substring(2, 9),
        branch: pipeline.branch,
        triggeredBy: 'manual',
        startTime: new Date().toISOString(),
        status: 'running'
      }

      setDeployments(prev => [newDeployment, ...prev])
      setPipelines(prev =>
        prev.map(p => p.id === pipeline.id ? { ...p, status: 'running', lastRun: new Date().toISOString() } : p)
      )

      message.success(t('cicd.deployTriggered'))
      setActiveTab('deployments')
    } catch (error) {
      message.error(t('cicd.deployFailed'))
    } finally {
      setLoading(false)
    }
  }

  // 查看部署日志
  const handleViewLogs = (deployment: DeploymentRecord) => {
    setSelectedDeployment(deployment)
    setLogsModalVisible(true)
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: 'default',
      running: 'processing',
      success: 'success',
      failed: 'error'
    }
    return colors[status] || 'default'
  }

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <SyncOutlined spin />
      case 'success':
        return <CheckCircleOutlined />
      case 'failed':
        return <CloseCircleOutlined />
      default:
        return <ClockCircleOutlined />
    }
  }

  // 流水线表格列
  const pipelineColumns = [
    {
      title: t('cicd.pipelineName'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Pipeline) => (
        <Space>
          <BranchesOutlined />
          <Text strong>{text}</Text>
          <Badge status={record.enabled ? 'success' : 'default'} />
        </Space>
      )
    },
    {
      title: t('cicd.repository'),
      dataIndex: 'repoUrl',
      key: 'repoUrl',
      ellipsis: true,
      render: (url: string) => (
        <Text code style={{ fontSize: 12 }}>{url}</Text>
      )
    },
    {
      title: t('cicd.branch'),
      dataIndex: 'branch',
      key: 'branch',
      width: 100,
      render: (branch: string) => <Tag>{branch}</Tag>
    },
    {
      title: t('cicd.trigger'),
      dataIndex: 'triggerType',
      key: 'triggerType',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'webhook' ? 'blue' : type === 'manual' ? 'green' : 'orange'}>
          {t(`cicd.triggers.${type}`)}
        </Tag>
      )
    },
    {
      title: t('cicd.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)} icon={getStatusIcon(status)}>
          {t(`cicd.statuses.${status}`)}
        </Tag>
      )
    },
    {
      title: t('cicd.lastRun'),
      dataIndex: 'lastRun',
      key: 'lastRun',
      width: 150,
      render: (time: string) => time ? new Date(time).toLocaleString() : '-'
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 150,
      render: (_: unknown, record: Pipeline) => (
        <Space size="small">
          <Tooltip title={t('cicd.triggerDeploy')}>
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleTriggerDeploy(record)}
              loading={record.status === 'running'}
            />
          </Tooltip>
          <Tooltip title={t('common.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(record)} />
          </Tooltip>
          <Tooltip title={t('common.delete')}>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeletePipeline(record.id)} />
          </Tooltip>
        </Space>
      )
    }
  ]

  // 部署记录表格列
  const deploymentColumns = [
    {
      title: t('cicd.pipelineName'),
      dataIndex: 'pipelineName',
      key: 'pipelineName'
    },
    {
      title: t('cicd.commit'),
      dataIndex: 'commit',
      key: 'commit',
      width: 100,
      render: (commit: string) => <Text code>{commit}</Text>
    },
    {
      title: t('cicd.branch'),
      dataIndex: 'branch',
      key: 'branch',
      width: 100,
      render: (branch: string) => <Tag>{branch}</Tag>
    },
    {
      title: t('cicd.triggeredBy'),
      dataIndex: 'triggeredBy',
      key: 'triggeredBy',
      width: 120,
      render: (by: string) => <Tag color="blue">{by}</Tag>
    },
    {
      title: t('cicd.startTime'),
      dataIndex: 'startTime',
      key: 'startTime',
      width: 150,
      render: (time: string) => new Date(time).toLocaleString()
    },
    {
      title: t('cicd.duration'),
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (duration: number) => duration ? `${duration}s` : '-'
    },
    {
      title: t('cicd.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)} icon={getStatusIcon(status)}>
          {t(`cicd.statuses.${status}`)}
        </Tag>
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 80,
      render: (_: unknown, record: DeploymentRecord) => (
        <Button size="small" icon={<HistoryOutlined />} onClick={() => handleViewLogs(record)}>
          {t('cicd.viewLogs')}
        </Button>
      )
    }
  ]

  const tabItems = [
    {
      key: 'pipelines',
      label: (
        <span>
          <BranchesOutlined />
          {t('cicd.pipelines')}
          <Badge count={pipelines.length} size="small" style={{ marginLeft: 8 }} />
        </span>
      ),
      children: (
        <Card
          title={t('cicd.pipelineList')}
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              {t('cicd.createPipeline')}
            </Button>
          }
          size="small"
        >
          {pipelines.length === 0 ? (
            <Empty description={t('cicd.noPipelines')} />
          ) : (
            <Table
              columns={pipelineColumns}
              dataSource={pipelines}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 900 }}
            />
          )}
        </Card>
      )
    },
    {
      key: 'deployments',
      label: (
        <span>
          <CloudUploadOutlined />
          {t('cicd.deployments')}
          <Badge count={deployments.length} size="small" style={{ marginLeft: 8 }} />
        </span>
      ),
      children: (
        <Card title={t('cicd.deploymentHistory')} size="small">
          {deployments.length === 0 ? (
            <Empty description={t('cicd.noDeployments')} />
          ) : (
            <Table
              columns={deploymentColumns}
              dataSource={deployments}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 900 }}
            />
          )}
        </Card>
      )
    },
    {
      key: 'settings',
      label: (
        <span>
          <SettingOutlined />
          {t('cicd.settings')}
        </span>
      ),
      children: (
        <Card title={t('cicd.webhookSettings')} size="small">
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type="info"
              showIcon
              message={t('cicd.webhookTip')}
            />
            <Card size="small" title={t('cicd.webhookUrl')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  value="https://your-domain.com/api/webhook/deploy"
                  readOnly
                  suffix={
                    <Button
                      size="small"
                      type="link"
                      onClick={() => {
                        navigator.clipboard.writeText('https://your-domain.com/api/webhook/deploy')
                        message.success(t('common.copySuccess'))
                      }}
                    >
                      {t('common.copy')}
                    </Button>
                  }
                />
                <Text type="secondary">{t('cicd.webhookDescription')}</Text>
              </Space>
            </Card>
            <Card size="small" title={t('cicd.githubToken')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input.Password placeholder={t('cicd.githubTokenPlaceholder')} />
                <Text type="secondary">{t('cicd.githubTokenDescription')}</Text>
              </Space>
            </Card>
          </Space>
        </Card>
      )
    }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={3} style={{ margin: 0 }}>
            <CloudUploadOutlined style={{ marginRight: 8 }} />
            {t('cicd.title')}
          </Title>
          <Text type="secondary">{t('cicd.description')}</Text>
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('cicd.totalPipelines')}
              value={pipelines.length}
              prefix={<BranchesOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('cicd.totalDeployments')}
              value={deployments.length}
              prefix={<CloudUploadOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('cicd.successfulDeploys')}
              value={deployments.filter(d => d.status === 'success').length}
              valueStyle={{ color: '#34C759' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('cicd.failedDeploys')}
              value={deployments.filter(d => d.status === 'failed').length}
              valueStyle={{ color: '#FF3B30' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
      />

      {/* 创建/编辑流水线模态框 */}
      <Modal
        title={editingPipeline ? t('cicd.editPipeline') : t('cicd.createPipeline')}
        open={modalVisible}
        onOk={handleSavePipeline}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            branch: 'main',
            triggerType: 'manual',
            autoDeploy: false,
            enabled: true
          }}
        >
          <Form.Item
            name="name"
            label={t('cicd.pipelineName')}
            rules={[{ required: true, message: t('cicd.nameRequired') }]}
          >
            <Input placeholder={t('cicd.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="serverId"
            label={t('cicd.targetServer')}
            rules={[{ required: true, message: t('cicd.serverRequired') }]}
          >
            <Select
              placeholder={t('cicd.selectServer')}
              options={servers.map(s => ({
                value: s.id,
                label: `${s.name} (${s.host})`
              }))}
            />
          </Form.Item>
          <Form.Item
            name="repoUrl"
            label={t('cicd.repositoryUrl')}
            rules={[{ required: true, message: t('cicd.repoRequired') }]}
          >
            <Input placeholder="https://github.com/username/repo.git" />
          </Form.Item>
          <Form.Item
            name="branch"
            label={t('cicd.branch')}
            rules={[{ required: true }]}
          >
            <Input placeholder="main" />
          </Form.Item>
          <Form.Item
            name="triggerType"
            label={t('cicd.triggerType')}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'manual', label: t('cicd.triggers.manual') },
                { value: 'webhook', label: t('cicd.triggers.webhook') },
                { value: 'schedule', label: t('cicd.triggers.schedule') }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="webhookUrl"
            label={t('cicd.webhookUrl')}
          >
            <Input placeholder="https://api.example.com/webhook" />
          </Form.Item>
          <Form.Item
            name="autoDeploy"
            label={t('cicd.autoDeploy')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="enabled"
            label={t('cicd.enabled')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 部署日志模态框 */}
      <Modal
        title={`${t('cicd.deploymentLogs')}: ${selectedDeployment?.pipelineName || ''}`}
        open={logsModalVisible}
        onCancel={() => setLogsModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedDeployment && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Timeline
              items={[
                {
                  color: 'blue',
                  children: (
                    <Space direction="vertical" size={0}>
                      <Text strong>{t('cicd.deployStarted')}</Text>
                      <Text type="secondary">{new Date(selectedDeployment.startTime).toLocaleString()}</Text>
                    </Space>
                  )
                },
                {
                  color: selectedDeployment.status === 'success' ? 'green' : 'red',
                  children: (
                    <Space direction="vertical" size={0}>
                      <Text strong>
                        {selectedDeployment.status === 'success'
                          ? t('cicd.deploySuccess')
                          : t('cicd.deployFailed')}
                      </Text>
                      {selectedDeployment.endTime && (
                        <Text type="secondary">{new Date(selectedDeployment.endTime).toLocaleString()}</Text>
                      )}
                      {selectedDeployment.duration && (
                        <Text type="secondary">
                          {t('cicd.duration')}: {selectedDeployment.duration}s
                        </Text>
                      )}
                    </Space>
                  )
                }
              ]}
            />
            <Card size="small" title={t('cicd.logs')}>
              <pre
                style={{
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: 16,
                  borderRadius: 6,
                  maxHeight: 300,
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: 'Monaco, Consolas, monospace'
                }}
              >
                {`> Cloning repository...
> Checking out branch: ${selectedDeployment.branch}
> Commit: ${selectedDeployment.commit}
> Building Docker image...
> Pushing to registry...
> Deploying to server...
> ${selectedDeployment.status === 'success' ? 'Deployment completed successfully!' : 'Deployment failed!'}`}
              </pre>
            </Card>
          </Space>
        )}
      </Modal>
    </div>
  )
}

export default CicdIntegration

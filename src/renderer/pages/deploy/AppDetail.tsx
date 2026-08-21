import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Button, Space, Tag, Typography, message, Spin, Alert, Tabs, Descriptions, Table, Popconfirm, Modal, Input, Badge, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ReloadOutlined as RefreshIcon,
  DashboardOutlined,
  ContainerOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { App, AppStatus, ContainerInfo } from '../../types/app'
import type { Server } from '../../types/server'
import type { Template } from '../../types/template'
import ResourceMonitor from '../../components/ResourceMonitor'
import LogViewer from '../../components/LogViewer'

const { Title, Text } = Typography
const { TextArea } = Input

const AppDetail: React.FC = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [app, setApp] = useState<App | null>(null)
  const [server, setServer] = useState<Server | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [logs, setLogs] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [newDockerCompose, setNewDockerCompose] = useState('')
  const [containerActionLoading, setContainerActionLoading] = useState<string | null>(null)
  const [containerLogsVisible, setContainerLogsVisible] = useState(false)
  const [containerLogs, setContainerLogs] = useState('')
  const [containerLogsLoading, setContainerLogsLoading] = useState(false)
  const [selectedContainerName, setSelectedContainerName] = useState('')

  const loadApp = useCallback(async () => {
    if (!id) return
    try {
      const appData = await window.electronAPI.app.getById(id)
      if (appData) {
        setApp(appData)

        const [serverData, templatesData] = await Promise.all([
          window.electronAPI.server.getById(appData.serverId),
          window.electronAPI.template.getAll()
        ])

        setServer(serverData || null)
        const templateData = templatesData.find((t: Template) => t.id === appData.templateId)
        setTemplate(templateData || null)
      } else {
        message.error(t('app.notFound'))
        navigate('/apps')
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [id, navigate, t])

  useEffect(() => {
    loadApp()
  }, [loadApp])

  const loadContainers = useCallback(async () => {
    if (!app || !server || server.status !== 'online') {
      setContainers([])
      return
    }

    try {
      const containerData = await window.electronAPI.app.getContainers(app.serverId, app.projectPath)
      setContainers(containerData)
    } catch (error) {
      console.error('Failed to load containers:', error)
      setContainers([])
    }
  }, [app, server])

  const loadLogs = useCallback(async () => {
    if (!app || !server || server.status !== 'online') {
      setLogs(t('app.serverOffline'))
      return
    }

    setLogsLoading(true)
    try {
      const logsData = await window.electronAPI.app.getLogs(app.serverId, app.projectPath, 200)
      setLogs(logsData || t('app.noLogs'))
    } catch (error) {
      setLogs(`Error: ${(error as Error).message}`)
    } finally {
      setLogsLoading(false)
    }
  }, [app, server, t])

  useEffect(() => {
    if (activeTab === 'containers' && app) {
      loadContainers()
    }
  }, [activeTab, app, loadContainers])

  useEffect(() => {
    if (activeTab === 'monitor' && app) {
      loadContainers()
    }
  }, [activeTab, app, loadContainers])

  useEffect(() => {
    if (activeTab === 'logs' && app) {
      loadLogs()
    }
  }, [activeTab, app, loadLogs])

  const handleStart = async () => {
    if (!app) return
    setActionLoading(true)
    try {
      const result = await window.electronAPI.app.start(app.id)
      if (result.success) {
        message.success(t('app.startSuccess'))
        loadApp()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleStop = async () => {
    if (!app) return
    setActionLoading(true)
    try {
      const result = await window.electronAPI.app.stop(app.id)
      if (result.success) {
        message.success(t('app.stopSuccess'))
        loadApp()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestart = async () => {
    if (!app) return
    setActionLoading(true)
    try {
      const result = await window.electronAPI.app.restart(app.id)
      if (result.success) {
        message.success(t('app.restartSuccess'))
        loadApp()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!app) return
    try {
      await window.electronAPI.app.delete(app.id)
      message.success(t('app.deleteSuccess'))
      navigate('/apps')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const handleUpdate = async () => {
    if (!app || !newDockerCompose) return
    setActionLoading(true)
    try {
      const result = await window.electronAPI.app.updateCompose(app.id, newDockerCompose)
      if (result.success) {
        message.success(t('app.updateSuccess'))
        setUpdateModalVisible(false)
        loadApp()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const openUpdateModal = () => {
    setNewDockerCompose(template?.dockerCompose || '')
    setUpdateModalVisible(true)
  }

  const handleContainerStart = async (containerId: string) => {
    if (!app) return
    setContainerActionLoading(containerId)
    try {
      const result = await window.electronAPI.app.startContainer(app.serverId, containerId)
      if (result.success) {
        message.success(result.message)
        loadContainers()
        syncAppStatus()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setContainerActionLoading(null)
    }
  }

  const handleContainerStop = async (containerId: string) => {
    if (!app) return
    setContainerActionLoading(containerId)
    try {
      const result = await window.electronAPI.app.stopContainer(app.serverId, containerId)
      if (result.success) {
        message.success(result.message)
        loadContainers()
        syncAppStatus()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setContainerActionLoading(null)
    }
  }

  const handleContainerRestart = async (containerId: string) => {
    if (!app) return
    setContainerActionLoading(containerId)
    try {
      const result = await window.electronAPI.app.restartContainer(app.serverId, containerId)
      if (result.success) {
        message.success(result.message)
        loadContainers()
        syncAppStatus()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setContainerActionLoading(null)
    }
  }

  const syncAppStatus = async () => {
    if (!app) return
    try {
      const containerData = await window.electronAPI.app.getContainers(app.serverId, app.projectPath)
      const hasRunning = containerData.some(c => c.status.toLowerCase().includes('up'))
      const newStatus: AppStatus = hasRunning ? 'running' : 'stopped'
      
      if (newStatus !== app.status) {
        setApp(prev => prev ? { ...prev, status: newStatus } : null)
        try {
          await window.electronAPI.app.update(app.id, { status: newStatus })
        } catch {
          // silently ignore status update error
        }
      }
    } catch {
      // silently ignore
    }
  }

  const handleContainerLogs = async (containerId: string, containerName: string) => {
    if (!app) return
    setSelectedContainerName(containerName)
    setContainerLogsVisible(true)
    setContainerLogsLoading(true)
    try {
      const logsData = await window.electronAPI.app.getContainerLogs(app.serverId, containerId, 200)
      setContainerLogs(logsData || t('app.noLogs'))
    } catch (error) {
      setContainerLogs(`Error: ${(error as Error).message}`)
    } finally {
      setContainerLogsLoading(false)
    }
  }

  const getStatusTag = (status: AppStatus) => {
    switch (status) {
      case 'running':
        return <Tag color="success">{t('app.statusRunning')}</Tag>
      case 'stopped':
        return <Tag color="default">{t('app.statusStopped')}</Tag>
      case 'deploying':
        return <Tag color="processing">{t('app.statusDeploying')}</Tag>
      case 'error':
        return <Tag color="error">{t('app.statusError')}</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  const containerColumns = [
    {
      title: t('app.container.id'),
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (id: string) => <Text copyable={{ text: id }} style={{ fontFamily: 'monospace', fontSize: 12 }}>{id.substring(0, 12)}</Text>
    },
    {
      title: t('app.container.name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => <Text strong>{name}</Text>
    },
    {
      title: t('app.container.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const isRunning = status.toLowerCase().includes('up')
        return (
          <Badge status={isRunning ? 'success' : 'default'} text={isRunning ? t('app.container.running') : t('app.container.stopped')} />
        )
      }
    },
    {
      title: t('app.container.image'),
      dataIndex: 'image',
      key: 'image',
      ellipsis: true,
      render: (image: string) => <Text type="secondary" style={{ fontSize: 12 }}>{image}</Text>
    },
    {
      title: t('app.container.ports'),
      dataIndex: 'ports',
      key: 'ports',
      width: 150,
      render: (ports: string[]) => (
        <Space wrap size={[4, 4]}>
          {ports && ports.length > 0 ? (
            ports.slice(0, 3).map((port, index) => (
              <Tag key={index} color="blue" style={{ fontSize: 11, margin: 0 }}>
                {port.split(':').pop()}
              </Tag>
            ))
          ) : (
            <Text type="secondary">-</Text>
          )}
          {ports && ports.length > 3 && (
            <Tag style={{ fontSize: 11, margin: 0 }}>+{ports.length - 3}</Tag>
          )}
        </Space>
      )
    },
    {
      title: t('app.actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: ContainerInfo) => {
        const isRunning = record.status.toLowerCase().includes('up')
        return (
          <Space size="small">
            {isRunning ? (
              <Tooltip title={t('app.stop')}>
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  loading={containerActionLoading === record.id}
                  onClick={() => handleContainerStop(record.id)}
                />
              </Tooltip>
            ) : (
              <Tooltip title={t('app.start')}>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={containerActionLoading === record.id}
                  onClick={() => handleContainerStart(record.id)}
                />
              </Tooltip>
            )}
            <Tooltip title={t('app.restart')}>
              <Button
                size="small"
                icon={<RefreshIcon />}
                loading={containerActionLoading === record.id}
                onClick={() => handleContainerRestart(record.id)}
              />
            </Tooltip>
            <Tooltip title={t('app.viewLogs')}>
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => handleContainerLogs(record.id, record.name)}
              />
            </Tooltip>
          </Space>
        )
      }
    }
  ]

  const renderOverview = () => (
    <Descriptions column={2} size="small" bordered>
      <Descriptions.Item label={t('app.name')}>
        <Text strong>{app?.name}</Text>
      </Descriptions.Item>
      <Descriptions.Item label={t('app.status')}>
        {app && getStatusTag(app.status)}
      </Descriptions.Item>
      <Descriptions.Item label={t('app.server')}>
        {server?.name || app?.serverId}
      </Descriptions.Item>
      <Descriptions.Item label={t('app.template')}>
        {template?.name || app?.templateId === 'custom' ? t('app.custom') : app?.templateId}
      </Descriptions.Item>
      <Descriptions.Item label={t('app.projectPath')} span={2}>
        <Text copyable style={{ fontFamily: 'monospace' }}>{app?.projectPath}</Text>
      </Descriptions.Item>
      <Descriptions.Item label={t('app.created')}>
        {app?.createdAt ? new Date(app.createdAt).toLocaleString() : '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('app.updated')}>
        {app?.updatedAt ? new Date(app.updatedAt).toLocaleString() : '-'}
      </Descriptions.Item>
    </Descriptions>
  )

  const renderContainers = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button
          icon={<RefreshIcon />}
          onClick={loadContainers}
          disabled={!server || server.status !== 'online'}
        >
          {t('common.refresh')}
        </Button>
      </div>
      {server?.status !== 'online' ? (
        <Alert
          type="warning"
          message={t('app.serverOffline')}
          description={t('app.serverOfflineDescription')}
          showIcon
        />
      ) : (
        <Table
          columns={containerColumns}
          dataSource={containers}
          rowKey="id"
          size="small"
          pagination={containers.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: t('common.noData') }}
        />
      )}
    </div>
  )

  const renderMonitor = () => {
    if (!app || !server || server.status !== 'online') {
      return (
        <Alert
          type="warning"
          message={t('app.serverOffline')}
          description={t('app.serverOfflineDescription')}
          showIcon
        />
      )
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <ResourceMonitor
          serverId={app.serverId}
          projectPath={app.projectPath}
          containers={containers}
          autoRefresh={true}
          refreshInterval={3000}
        />
        <LogViewer
          serverId={app.serverId}
          projectPath={app.projectPath}
          containers={containers}
          defaultLines={100}
          autoRefresh={false}
        />
      </Space>
    )
  }

  const renderLogs = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button
          icon={<RefreshIcon />}
          onClick={loadLogs}
          loading={logsLoading}
          disabled={!server || server.status !== 'online'}
        >
          {t('common.refresh')}
        </Button>
      </div>
      <pre style={{
        background: '#1e1e1e',
        color: '#d4d4d4',
        padding: 16,
        borderRadius: 6,
        maxHeight: 500,
        overflow: 'auto',
        fontSize: 12,
        fontFamily: 'Monaco, Consolas, "Courier New", monospace'
      }}>
        {logsLoading ? t('common.loading') : logs}
      </pre>
    </div>
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!app) {
    return null
  }

  const items = [
    {
      key: 'overview',
      label: t('app.overview'),
      children: renderOverview()
    },
    {
      key: 'containers',
      label: (
        <span>
          <ContainerOutlined />
          {t('app.containers')}
        </span>
      ),
      children: renderContainers()
    },
    {
      key: 'monitor',
      label: (
        <span>
          <DashboardOutlined />
          {t('app.monitor')}
        </span>
      ),
      children: renderMonitor()
    },
    {
      key: 'logs',
      label: t('app.viewLogs'),
      children: renderLogs()
    }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/apps')}>
              {t('common.back')}
            </Button>
            <Title level={4} style={{ margin: 0 }}>{app.name}</Title>
          </Space>
        </div>
        <div className="page-header-right">
          {app.status === 'running' ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
              loading={actionLoading}
            >
              {t('app.stop')}
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              loading={actionLoading}
              disabled={app.status === 'deploying'}
            >
              {t('app.start')}
            </Button>
          )}
          <Button
            icon={<RefreshIcon />}
            onClick={handleRestart}
            loading={actionLoading}
            disabled={app.status === 'deploying'}
          >
            {t('app.restart')}
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={openUpdateModal}
            disabled={app.status !== 'running'}
          >
            {t('app.update')}
          </Button>
          <Popconfirm
            title={t('app.confirmDelete')}
            onConfirm={handleDelete}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Button danger icon={<DeleteOutlined />}>
              {t('app.delete')}
            </Button>
          </Popconfirm>
        </div>
      </div>

      <Card>
        <Tabs
          items={items}
          activeKey={activeTab}
          onChange={setActiveTab}
        />
      </Card>

      <Modal
        title={t('app.update')}
        open={updateModalVisible}
        onCancel={() => setUpdateModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setUpdateModalVisible(false)}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="update"
            type="primary"
            loading={actionLoading}
            onClick={handleUpdate}
          >
            {t('app.update')}
          </Button>
        ]}
        width={700}
      >
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
            {t('app.updateTip')}
          </Text>
          <TextArea
            rows={15}
            value={newDockerCompose}
            onChange={(e) => setNewDockerCompose(e.target.value)}
            style={{
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              fontSize: 12
            }}
          />
        </div>
      </Modal>

      <Modal
        title={`${t('app.viewLogs')}: ${selectedContainerName}`}
        open={containerLogsVisible}
        onCancel={() => setContainerLogsVisible(false)}
        footer={[
          <Button key="close" onClick={() => setContainerLogsVisible(false)}>
            {t('common.close')}
          </Button>
        ]}
        width={800}
      >
        <pre style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 6,
          maxHeight: 500,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'Monaco, Consolas, "Courier New", monospace'
        }}>
          {containerLogsLoading ? t('common.loading') : containerLogs}
        </pre>
      </Modal>
    </div>
  )
}

export default AppDetail

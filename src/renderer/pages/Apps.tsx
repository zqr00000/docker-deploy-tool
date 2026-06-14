import React, { useState, useEffect } from 'react'
import {
  Table,
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Popconfirm,
  message,
  Tooltip,
  Modal
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  EyeOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { App, AppStatus } from '../types/app'
import type { Server } from '../types/server'
import type { Template } from '../types/template'

const { Title } = Typography

const Apps: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [apps, setApps] = useState<App[]>([])
  const [servers, setServers] = useState<Server[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [logsModalVisible, setLogsModalVisible] = useState(false)
  const [selectedApp, setSelectedApp] = useState<App | null>(null)
  const [logs, setLogs] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [appsData, serversData, templatesData] = await Promise.all([
        window.electronAPI.app.getAll(),
        window.electronAPI.server.getAll(),
        window.electronAPI.template.getAll()
      ])
      setApps(appsData)
      setServers(serversData)
      setTemplates(templatesData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getServerName = (serverId: string) => {
    const server = servers.find(s => s.id === serverId)
    return server?.name || serverId
  }

  const getTemplateName = (templateId: string) => {
    if (templateId === 'custom') return t('app.custom')
    const template = templates.find(t => t.id === templateId)
    return template?.name || templateId
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

  const handleStart = async (app: App) => {
    setActionLoading(app.id)
    try {
      const result = await window.electronAPI.app.start(app.id)
      if (result.success) {
        message.success(t('app.startSuccess'))
        loadData()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = async (app: App) => {
    setActionLoading(app.id)
    try {
      const result = await window.electronAPI.app.stop(app.id)
      if (result.success) {
        message.success(t('app.stopSuccess'))
        loadData()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleRestart = async (app: App) => {
    setActionLoading(app.id)
    try {
      const result = await window.electronAPI.app.restart(app.id)
      if (result.success) {
        message.success(t('app.restartSuccess'))
        loadData()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (app: App) => {
    try {
      await window.electronAPI.app.delete(app.id)
      message.success(t('app.deleteSuccess'))
      loadData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const handleViewLogs = async (app: App) => {
    setSelectedApp(app)
    setLogsModalVisible(true)
    setLogsLoading(true)
    try {
      const server = servers.find(s => s.id === app.serverId)
      if (server && server.status === 'online') {
        const logsData = await window.electronAPI.app.getLogs(app.serverId, app.projectPath, 100)
        setLogs(logsData || t('app.noLogs'))
      } else {
        setLogs(t('app.serverOffline'))
      }
    } catch (error) {
      setLogs(`Error: ${(error as Error).message}`)
    } finally {
      setLogsLoading(false)
    }
  }

  const handleViewDetail = (app: App) => {
    navigate(`/apps/${app.id}`)
  }

  const handleDeploy = () => {
    navigate('/apps/deploy')
  }

  const columns = [
    {
      title: t('app.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>
    },
    {
      title: t('app.server'),
      dataIndex: 'serverId',
      key: 'serverId',
      render: (serverId: string) => getServerName(serverId)
    },
    {
      title: t('app.template'),
      dataIndex: 'templateId',
      key: 'templateId',
      render: (templateId: string) => getTemplateName(templateId)
    },
    {
      title: t('app.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: AppStatus) => getStatusTag(status)
    },
    {
      title: t('app.created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => new Date(createdAt).toLocaleString()
    },
    {
      title: t('app.actions'),
      key: 'actions',
      width: 280,
      render: (_: unknown, record: App) => (
        <Space size="small">
          {record.status === 'running' ? (
            <Tooltip title={t('app.stop')}>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={actionLoading === record.id}
                onClick={() => handleStop(record)}
              />
            </Tooltip>
          ) : (
            <Tooltip title={t('app.start')}>
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={actionLoading === record.id}
                onClick={() => handleStart(record)}
                disabled={record.status === 'deploying'}
              />
            </Tooltip>
          )}
          <Tooltip title={t('app.restart')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={actionLoading === record.id}
              onClick={() => handleRestart(record)}
              disabled={record.status === 'deploying'}
            />
          </Tooltip>
          <Tooltip title={t('app.viewLogs')}>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewLogs(record)}
            />
          </Tooltip>
          <Tooltip title={t('app.viewDetail')}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('app.confirmDelete')}
            onConfirm={() => handleDelete(record)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('app.delete')}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('app.title')}</Title>
        <Space>
          <Button onClick={loadData}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleDeploy}>
            {t('app.deploy')}
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={apps}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={`${t('app.viewLogs')}: ${selectedApp?.name}`}
        open={logsModalVisible}
        onCancel={() => setLogsModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setLogsModalVisible(false)}>
            {t('common.close')}
          </Button>,
          <Button key="refresh" onClick={() => selectedApp && handleViewLogs(selectedApp)}>
            {t('common.refresh')}
          </Button>
        ]}
        width={800}
      >
        <pre style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 4,
          maxHeight: 400,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'Monaco, Consolas, "Courier New", monospace'
        }}>
          {logsLoading ? t('common.loading') : logs}
        </pre>
      </Modal>
    </div>
  )
}

export default Apps

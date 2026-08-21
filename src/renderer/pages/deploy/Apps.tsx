import React, { useState, useEffect, useCallback, useMemo, memo } from 'react'
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
  Modal,
  Row,
  Col
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
import type { App, AppStatus } from '../../types/app'
import type { Server } from '../../types/server'
import type { Template } from '../../types/template'

const { Title, Text } = Typography

// 状态标签组件 - 使用 memo 避免重复渲染
const AppStatusTag: React.FC<{ status: AppStatus }> = memo(({ status }) => {
  const { t } = useTranslation()
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
})
AppStatusTag.displayName = 'AppStatusTag'

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

  const loadData = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 使用 useMemo 创建查找 Map，避免每次渲染进行 O(n) 查找
  const serverMap = useMemo(() => {
    const map = new Map<string, string>()
    servers.forEach(s => map.set(s.id, s.name))
    return map
  }, [servers])

  const templateMap = useMemo(() => {
    const map = new Map<string, string>()
    templates.forEach(t => map.set(t.id, t.name))
    return map
  }, [templates])

  const getServerName = useCallback((serverId: string) => {
    return serverMap.get(serverId) || serverId
  }, [serverMap])

  const getTemplateName = useCallback((templateId: string) => {
    if (templateId === 'custom') return t('app.custom')
    return templateMap.get(templateId) || templateId
  }, [templateMap, t])

  const handleStart = useCallback(async (appId: string) => {
    setActionLoading(appId)
    try {
      const result = await window.electronAPI.app.start(appId)
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
  }, [t, loadData])

  const handleStop = useCallback(async (appId: string) => {
    setActionLoading(appId)
    try {
      const result = await window.electronAPI.app.stop(appId)
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
  }, [t, loadData])

  const handleRestart = useCallback(async (appId: string) => {
    setActionLoading(appId)
    try {
      const result = await window.electronAPI.app.restart(appId)
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
  }, [t, loadData])

  const handleDelete = useCallback(async (appId: string) => {
    try {
      await window.electronAPI.app.delete(appId)
      message.success(t('app.deleteSuccess'))
      loadData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }, [t, loadData])

  const handleViewLogs = useCallback(async (app: App) => {
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
  }, [servers, t])

  const handleViewDetail = useCallback((appId: string) => {
    navigate(`/apps/${appId}`)
  }, [navigate])

  const handleDeploy = useCallback(() => {
    navigate('/apps/deploy')
  }, [navigate])

  const handleCloseLogsModal = useCallback(() => {
    setLogsModalVisible(false)
  }, [])

  const handleRefreshLogs = useCallback(() => {
    if (selectedApp) {
      handleViewLogs(selectedApp)
    }
  }, [selectedApp, handleViewLogs])

  // 使用 useMemo 缓存表格列定义
  const columns = useMemo(() => [
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
      render: (status: AppStatus) => <AppStatusTag status={status} />
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
        <Space size="small" wrap>
          {record.status === 'running' ? (
            <Tooltip title={t('app.stop')}>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={actionLoading === record.id}
                onClick={() => handleStop(record.id)}
              />
            </Tooltip>
          ) : (
            <Tooltip title={t('app.start')}>
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={actionLoading === record.id}
                onClick={() => handleStart(record.id)}
                disabled={record.status === 'deploying'}
              />
            </Tooltip>
          )}
          <Tooltip title={t('app.restart')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={actionLoading === record.id}
              onClick={() => handleRestart(record.id)}
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
              onClick={() => handleViewDetail(record.id)}
            />
          </Tooltip>
          <Popconfirm
            title={t('app.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
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
  ], [t, getServerName, getTemplateName, actionLoading, handleStop, handleStart, handleRestart, handleViewLogs, handleViewDetail, handleDelete])

  // 展开行渲染 — 应用详细信息
  const expandedRowRender = useCallback((record: App) => {
    return (
      <div style={{ padding: '8px 0' }}>
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                项目路径
              </Text>
            </div>
            <Text code style={{ fontSize: 12 }}>{record.projectPath || '-'}</Text>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                模板
              </Text>
            </div>
            <Text style={{ fontSize: 13 }}>{getTemplateName(record.templateId)}</Text>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                服务器
              </Text>
            </div>
            <Text style={{ fontSize: 13 }}>{getServerName(record.serverId)}</Text>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                创建时间
              </Text>
            </div>
            <Text style={{ fontSize: 13 }}>{new Date(record.createdAt).toLocaleString()}</Text>
          </Col>
        </Row>
        {record.dockerCompose && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Docker Compose
            </Text>
            <pre className="log-viewer" style={{ maxHeight: 200, marginTop: 4, fontSize: 11 }}>
              {record.dockerCompose}
            </pre>
          </div>
        )}
      </div>
    )
  }, [getServerName, getTemplateName])

  return (
    <div className="page-content">
      {/* Page Header - Flex Layout */}
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>{t('app.title')}</Title>
        </div>
        <div className="page-header-right">
          <Button onClick={loadData} icon={<ReloadOutlined />}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleDeploy}>
            {t('app.deploy')}
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card>
        <Table
          columns={columns}
          dataSource={apps}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('common.items')}` }}
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender,
            rowExpandable: (record) => record.status !== 'deploying',
          }}
        />
      </Card>

      {/* Logs Modal */}
      <Modal
        title={`${t('app.viewLogs')}: ${selectedApp?.name}`}
        open={logsModalVisible}
        onCancel={handleCloseLogsModal}
        footer={[
          <Button key="close" onClick={handleCloseLogsModal}>
            {t('common.close')}
          </Button>,
          <Button key="refresh" onClick={handleRefreshLogs}>
            {t('common.refresh')}
          </Button>
        ]}
        width={800}
      >
        <pre className="log-viewer" style={{ maxHeight: 400 }}>
          {logsLoading ? t('common.loading') : logs}
        </pre>
      </Modal>
    </div>
  )
}

export default Apps

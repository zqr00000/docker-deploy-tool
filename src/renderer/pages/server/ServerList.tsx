import React, { useState, useCallback, memo } from 'react'
import {
  Card,
  Button,
  Tag,
  Typography,
  Popconfirm,
  message,
  Tooltip,
  Drawer,
  Empty,
  Row,
  Col,
  Segmented
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  LinkOutlined,
  DisconnectOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  TableOutlined,
  CloudServerOutlined,
  UserOutlined,
  KeyOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useServers } from '../../context/ServerContext'
import ServerForm from '../../components/ServerForm'
import type { Server, ServerFormData } from '../../types/server'

const { Title, Text } = Typography

// 头像背景色 — Apple 系统色循环
const AVATAR_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#AF52DE',
  '#5AC8FA', '#FF3B30', '#5856D6', '#FF2D55'
]

const getAvatarColor = (name: string): string => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const getInitial = (name: string): string => {
  return name.charAt(0).toUpperCase()
}

const StatusDot: React.FC<{ status: Server['status'] }> = memo(({ status }) => {
  const colors: Record<string, string> = {
    online: '#34C759',
    offline: '#8e8e93',
    connecting: '#FF9500',
    error: '#FF3B30'
  }
  return (
    <span
      className="server-avatar-dot"
      style={{
        background: colors[status] || '#8e8e93',
        boxShadow: status === 'online' ? `0 0 0 1px ${colors[status]}40` : 'none'
      }}
    />
  )
})
StatusDot.displayName = 'StatusDot'

const StatusTag: React.FC<{ status: Server['status'] }> = memo(({ status }) => {
  const { t } = useTranslation()
  const config: Record<string, { color: string; text: string }> = {
    online: { color: 'success', text: t('server.connected') },
    offline: { color: 'default', text: t('server.disconnected') },
    connecting: { color: 'processing', text: t('server.connecting') },
    error: { color: 'error', text: t('common.error') }
  }
  const cfg = config[status] || config.offline
  return <Tag color={cfg.color} style={{ borderRadius: 6 }}>{cfg.text}</Tag>
})
StatusTag.displayName = 'StatusTag'

const ServerList: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    servers,
    loading,
    addServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    refreshServers
  } = useServers()

  const [drawerVisible, setDrawerVisible] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  const handleAdd = useCallback(() => {
    setEditingServer(null)
    setDrawerVisible(true)
  }, [])

  const handleEdit = useCallback((server: Server) => {
    setEditingServer(server)
    setDrawerVisible(true)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false)
    setEditingServer(null)
  }, [])

  const handleSubmit = useCallback(async (values: ServerFormData) => {
    setFormLoading(true)
    try {
      if (editingServer) {
        await updateServer(editingServer.id, values)
        message.success(t('common.success'))
      } else {
        await addServer(values)
        message.success(t('server.add') + ' - ' + values.name)
      }
      handleCloseDrawer()
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('common.error'))
    } finally {
      setFormLoading(false)
    }
  }, [editingServer, updateServer, addServer, t, handleCloseDrawer])

  const handleConnect = useCallback(async (server: Server) => {
    try {
      const result = await connectServer(server)
      if (result.success) {
        message.success(t('server.connectSuccess'))
      } else {
        message.error(`${t('server.connectFailed')}: ${result.message}`)
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('server.connectFailed'))
    }
  }, [connectServer, t])

  const handleDisconnect = useCallback(async (serverId: string) => {
    try {
      await disconnectServer(serverId)
      message.success(t('server.disconnected'))
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    }
  }, [disconnectServer, t])

  const handleDelete = useCallback(async (serverId: string) => {
    try {
      await deleteServer(serverId)
      message.success(t('server.deleteSuccess'))
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    }
  }, [deleteServer, t])

  const handleViewDetail = useCallback((serverId: string) => {
    navigate(`/servers/${serverId}`)
  }, [navigate])

  const renderServerCard = useCallback((server: Server) => {
    const avatarColor = getAvatarColor(server.name)
    return (
      <Col xs={24} sm={12} lg={8} xl={6} key={server.id}>
        <Card
          className="server-card"
          hoverable
          onClick={() => handleViewDetail(server.id)}
        >
          {/* Header: Avatar + Name + Status */}
          <div className="server-card-header">
            <div
              className="server-avatar"
              style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}dd)` }}
            >
              {getInitial(server.name)}
              <StatusDot status={server.status} />
            </div>
            <div className="server-info">
              <div className="server-name">{server.name}</div>
              <div className="server-host">{server.host}:{server.port}</div>
            </div>
            <StatusTag status={server.status} />
          </div>

          {/* Meta: Username + Auth */}
          <div className="server-meta">
            <div className="server-meta-item">
              <span className="server-meta-label"><UserOutlined /> {t('server.username')}</span>
              <span className="server-meta-value">{server.username}</span>
            </div>
            <div className="server-meta-item">
              <span className="server-meta-label"><KeyOutlined /> {t('server.authMethod')}</span>
              <span className="server-meta-value">
                {server.authType === 'password' ? t('server.passwordAuth') : t('server.keyAuth')}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="server-actions" onClick={(e) => e.stopPropagation()}>
            {server.status === 'online' ? (
              <Tooltip title={t('server.disconnect')}>
                <Button
                  size="small"
                  icon={<DisconnectOutlined />}
                  onClick={() => handleDisconnect(server.id)}
                />
              </Tooltip>
            ) : (
              <Tooltip title={t('server.connect')}>
                <Button
                  size="small"
                  type="primary"
                  icon={<LinkOutlined />}
                  loading={server.status === 'connecting'}
                  onClick={() => handleConnect(server)}
                />
              </Tooltip>
            )}
            <Tooltip title={t('server.viewDetail')}>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleViewDetail(server.id)}
              />
            </Tooltip>
            <Tooltip title={t('server.edit')}>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(server)}
                disabled={server.status === 'online'}
              />
            </Tooltip>
            <Popconfirm
              title={t('server.confirmDelete')}
              onConfirm={() => handleDelete(server.id)}
              okText={t('common.yes')}
              cancelText={t('common.no')}
            >
              <Tooltip title={t('server.delete')}>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={server.status === 'online'}
                />
              </Tooltip>
            </Popconfirm>
          </div>
        </Card>
      </Col>
    )
  }, [t, handleDisconnect, handleConnect, handleViewDetail, handleEdit, handleDelete])

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            <CloudServerOutlined style={{ marginRight: 8, color: '#007AFF' }} />
            {t('server.title')}
          </Title>
          <Text type="secondary" className="subtitle">
            {servers.length} {t('common.items')}
          </Text>
        </div>
        <div className="page-header-right">
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'grid' | 'table')}
            options={[
              { value: 'grid', icon: <AppstoreOutlined />, label: '' },
              { value: 'table', icon: <TableOutlined />, label: '' }
            ]}
            size="small"
          />
          <Button onClick={refreshServers} icon={<ReloadOutlined />}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('server.add')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {servers.length === 0 && !loading ? (
        <Card>
          <Empty
            description={t('common.noData')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '40px 0' }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {t('server.add')}
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {servers.map(server => renderServerCard(server))}
        </Row>
      )}

      {/* Bottom Sheet for Add/Edit */}
      <Drawer
        title={editingServer ? t('server.edit') : t('server.add')}
        placement="bottom"
        height="70vh"
        onClose={handleCloseDrawer}
        open={drawerVisible}
        destroyOnClose
      >
        <ServerForm
          server={editingServer}
          onSubmit={handleSubmit}
          onCancel={handleCloseDrawer}
          loading={formLoading}
        />
      </Drawer>
    </div>
  )
}

export default ServerList

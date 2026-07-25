import React, { useState, useCallback, useMemo, memo } from 'react'
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
  Drawer
} from 'antd'
import { PlusOutlined, DeleteOutlined, LinkOutlined, DisconnectOutlined, EditOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useServers } from '../context/ServerContext'
import ServerForm from '../components/ServerForm'
import type { Server, ServerFormData } from '../types/server'

const { Title } = Typography

// 状态标签组件 - 使用 memo 避免重复渲染
const StatusTag: React.FC<{ status: Server['status'] }> = memo(({ status }) => {
  const { t } = useTranslation()
  switch (status) {
    case 'online':
      return <Tag color="success">{t('server.connected')}</Tag>
    case 'offline':
      return <Tag color="default">{t('server.disconnected')}</Tag>
    case 'connecting':
      return <Tag color="processing">{t('server.connecting')}</Tag>
    case 'error':
      return <Tag color="error">{t('common.error')}</Tag>
    default:
      return null
  }
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

  // 使用 useMemo 缓存表格列定义，避免每次渲染重新创建
  const columns = useMemo(() => [
    {
      title: t('server.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>
    },
    {
      title: `${t('server.host')}:${t('server.port')}`,
      key: 'connection',
      render: (_: unknown, record: Server) => `${record.host}:${record.port}`
    },
    {
      title: t('server.username'),
      dataIndex: 'username',
      key: 'username'
    },
    {
      title: t('server.authMethod'),
      dataIndex: 'authType',
      key: 'authType',
      render: (authType: string) => authType === 'password' ? t('server.passwordAuth') : t('server.keyAuth')
    },
    {
      title: t('server.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: Server['status']) => <StatusTag status={status} />
    },
    {
      title: t('server.actions'),
      key: 'actions',
      width: 220,
      render: (_: unknown, record: Server) => (
        <Space size="small" wrap>
          {record.status === 'online' ? (
            <Tooltip title={t('server.disconnect')}>
              <Button
                size="small"
                icon={<DisconnectOutlined />}
                onClick={() => handleDisconnect(record.id)}
              />
            </Tooltip>
          ) : (
            <Tooltip title={t('server.connect')}>
              <Button
                size="small"
                type="primary"
                icon={<LinkOutlined />}
                loading={record.status === 'connecting'}
                onClick={() => handleConnect(record)}
              />
            </Tooltip>
          )}
          <Tooltip title={t('server.viewDetail')}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            />
          </Tooltip>
          <Tooltip title={t('server.edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              disabled={record.status === 'online'}
            />
          </Tooltip>
          <Popconfirm
            title={t('server.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('server.delete')}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={record.status === 'online'}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ], [t, handleDisconnect, handleConnect, handleViewDetail, handleEdit, handleDelete])

  return (
    <div className="page-content">
      {/* Page Header - Flex Layout */}
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>{t('server.title')}</Title>
        </div>
        <div className="page-header-right">
          <Button onClick={refreshServers} icon={<ReloadOutlined />}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('server.add')}
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card>
        <Table
          columns={columns}
          dataSource={servers}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('common.items')}` }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Drawer for Add/Edit */}
      <Drawer
        title={editingServer ? t('server.edit') : t('server.add')}
        placement="right"
        width={480}
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

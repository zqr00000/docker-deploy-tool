import React, { useState } from 'react'
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
  Drawer
} from 'antd'
import { PlusOutlined, DeleteOutlined, LinkOutlined, DisconnectOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useServers } from '../context/ServerContext'
import ServerForm from '../components/ServerForm'
import type { Server, ServerFormData } from '../types/server'

const { Title } = Typography

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

  const handleAdd = () => {
    setEditingServer(null)
    setDrawerVisible(true)
  }

  const handleEdit = (server: Server) => {
    setEditingServer(server)
    setDrawerVisible(true)
  }

  const handleCloseDrawer = () => {
    setDrawerVisible(false)
    setEditingServer(null)
  }

  const handleSubmit = async (values: ServerFormData) => {
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
  }

  const handleConnect = async (server: Server) => {
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
  }

  const handleDisconnect = async (server: Server) => {
    try {
      await disconnectServer(server.id)
      message.success(t('server.disconnected'))
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    }
  }

  const handleDelete = async (server: Server) => {
    try {
      await deleteServer(server.id)
      message.success(t('server.deleteSuccess'))
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    }
  }

  const handleViewDetail = (server: Server) => {
    navigate(`/servers/${server.id}`)
  }

  const getStatusTag = (status: Server['status']) => {
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
  }

  const columns = [
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
      render: (status: Server['status']) => getStatusTag(status)
    },
    {
      title: t('server.actions'),
      key: 'actions',
      width: 220,
      render: (_: unknown, record: Server) => (
        <Space size="small">
          {record.status === 'online' ? (
            <Tooltip title={t('server.disconnect')}>
              <Button
                size="small"
                icon={<DisconnectOutlined />}
                onClick={() => handleDisconnect(record)}
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
              onClick={() => handleViewDetail(record)}
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
            onConfirm={() => handleDelete(record)}
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
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('server.title')}</Title>
        <Space>
          <Button onClick={refreshServers}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('server.add')}
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={servers}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

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

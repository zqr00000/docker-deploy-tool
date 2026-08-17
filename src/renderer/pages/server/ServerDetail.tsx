import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Button, Space, Tag, Typography, message, Spin, Tabs, Descriptions, Popconfirm, Alert, Row, Col } from 'antd'
import { ArrowLeftOutlined, LinkOutlined, DisconnectOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import SystemEnvironmentStatus from '../../components/SystemEnvironmentStatus'
import { useServers } from '../../context/ServerContext'
import type { Server } from '../../types/server'

const { Title, Text } = Typography

const ServerDetail: React.FC = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { connectServer, disconnectServer, refreshServers } = useServers()

  const [server, setServer] = useState<Server | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  const loadServer = useCallback(async () => {
    if (!id) return
    try {
      const data = await window.electronAPI.server.getById(id)
      if (data) {
        setServer(data)
      } else {
        message.error(t('server.notFound'))
        navigate('/servers')
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [id, navigate, t])

  useEffect(() => {
    loadServer()
  }, [loadServer])

  const handleConnect = async () => {
    if (!server) return
    setConnecting(true)
    try {
      const result = await connectServer(server)
      if (result.success) {
        message.success(t('server.connectSuccess'))
        await loadServer()
      } else {
        message.error(`${t('server.connectFailed')}: ${result.message}`)
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('server.connectFailed'))
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!server) return
    try {
      await disconnectServer(server.id)
      message.success(t('server.disconnected'))
      await loadServer()
    } catch (error) {
      const err = error as Error
      message.error(err.message)
    }
  }

  const getStatusTag = (status: Server['status']) => {
    switch (status) {
      case 'online':
        return <Tag color="success" icon={<CheckCircleOutlined />}>{t('server.connected')}</Tag>
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

  const renderConnectionInfo = () => (
    <Descriptions column={{ xs: 1, sm: 1, md: 2 }} size="small">
      <Descriptions.Item label={t('server.name')}>
        <Text strong>{server?.name}</Text>
      </Descriptions.Item>
      <Descriptions.Item label={t('server.status')}>
        {server && getStatusTag(server.status)}
      </Descriptions.Item>
      <Descriptions.Item label={t('server.host')}>
        {server?.host}
      </Descriptions.Item>
      <Descriptions.Item label={t('server.port')}>
        {server?.port}
      </Descriptions.Item>
      <Descriptions.Item label={t('server.username')}>
        {server?.username}
      </Descriptions.Item>
      <Descriptions.Item label={t('server.authMethod')}>
        {server?.authType === 'password' ? t('server.passwordAuth') : t('server.keyAuth')}
      </Descriptions.Item>
    </Descriptions>
  )

  if (loading) {
    return (
      <div className="loading-container">
        <Spin size="large" />
      </div>
    )
  }

  if (!server) {
    return null
  }

  const items = [
    {
      key: 'connection',
      label: t('server.connection'),
      children: renderConnectionInfo()
    },
    {
      key: 'system',
      label: t('environment.systemCheck'),
      children: (
        <div>
          {server?.status !== 'online' ? (
            <Alert
              type="warning"
              message={t('environment.connectFirst')}
              description={t('environment.connectFirstDescription')}
              showIcon
            />
          ) : (
            <SystemEnvironmentStatus serverId={server.id} />
          )}
        </div>
      )
    }
  ]

  return (
    <div className="page-content">
      {/* Page Header - Flex Layout */}
      <div className="page-header">
        <div className="page-header-left">
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/servers')}>
              {t('common.back')}
            </Button>
            <Title level={4} style={{ margin: 0 }}>{server.name}</Title>
          </Space>
        </div>
        <div className="page-header-right">
          {server.status === 'online' ? (
            <Popconfirm
              title={t('server.confirmDisconnect')}
              onConfirm={handleDisconnect}
              okText={t('common.yes')}
              cancelText={t('common.no')}
            >
              <Button danger icon={<DisconnectOutlined />}>
                {t('server.disconnect')}
              </Button>
            </Popconfirm>
          ) : (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              loading={connecting || server.status === 'connecting'}
              onClick={handleConnect}
            >
              {t('server.connect')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <Tabs items={items} />
      </Card>
    </div>
  )
}

export default ServerDetail

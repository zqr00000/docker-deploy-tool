import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card,
  Select,
  Button,
  Space,
  Row,
  Col,
  Typography,
  message,
  Spin,
  Empty,
  Table,
  Tag,
  Progress,
  Modal,
  List,
  Tooltip,
  Popconfirm,
  Alert,
  Tabs,
  Statistic,
  Divider,
  Badge
} from 'antd'
import {
  DatabaseOutlined,
  HddOutlined,
  CloudServerOutlined,
  DownloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  FileZipOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Server } from '../types/server'

const { Text, Title, Paragraph } = Typography

interface BackupItem {
  id: string
  name: string
  type: 'database' | 'volume' | 'config'
  serverId: string
  serverName: string
  size: number
  createdAt: string
  status: 'completed' | 'failed' | 'in_progress'
  path: string
}

interface BackupTask {
  id: string
  name: string
  type: 'database' | 'volume' | 'config'
  serverId: string
  serverName: string
  schedule: string
  lastRun?: string
  nextRun?: string
  enabled: boolean
}

const BackupRestore: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined)
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [backupTasks, setBackupTasks] = useState<BackupTask[]>([])
  const [activeTab, setActiveTab] = useState('backup')
  const [backupInProgress, setBackupInProgress] = useState(false)
  const [backupProgress, setBackupProgress] = useState(0)
  const [restoreModalVisible, setRestoreModalVisible] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<BackupItem | null>(null)

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    try {
      const data = await window.electronAPI.server.getAll()
      setServers(data.filter(s => s.status === 'online'))
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }, [])

  // 加载备份列表
  const loadBackups = useCallback(async () => {
    try {
      // 模拟备份数据 - 实际应从主进程获取
      const mockBackups: BackupItem[] = [
        {
          id: '1',
          name: 'mysql-backup-20240725',
          type: 'database',
          serverId: 'server1',
          serverName: 'Production Server',
          size: 1024 * 1024 * 50,
          createdAt: new Date().toISOString(),
          status: 'completed',
          path: '/backups/mysql-backup-20240725.sql'
        },
        {
          id: '2',
          name: 'volumes-backup-20240725',
          type: 'volume',
          serverId: 'server1',
          serverName: 'Production Server',
          size: 1024 * 1024 * 120,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          status: 'completed',
          path: '/backups/volumes-backup-20240725.tar.gz'
        }
      ]
      setBackups(mockBackups)
    } catch (error) {
      console.error('Failed to load backups:', error)
    }
  }, [])

  // 加载定时备份任务
  const loadBackupTasks = useCallback(async () => {
    try {
      // 模拟定时任务数据
      const mockTasks: BackupTask[] = [
        {
          id: 'task1',
          name: 'Daily Database Backup',
          type: 'database',
          serverId: 'server1',
          serverName: 'Production Server',
          schedule: '0 2 * * *',
          lastRun: new Date(Date.now() - 86400000).toISOString(),
          nextRun: new Date(Date.now() + 86400000).toISOString(),
          enabled: true
        }
      ]
      setBackupTasks(mockTasks)
    } catch (error) {
      console.error('Failed to load backup tasks:', error)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    loadServers()
    loadBackups()
    loadBackupTasks()
  }, [loadServers, loadBackups, loadBackupTasks])

  // 执行备份
  const handleBackup = async (type: 'database' | 'volume' | 'config') => {
    if (!selectedServer) {
      message.warning(t('backupRestore.selectServerFirst'))
      return
    }

    setBackupInProgress(true)
    setBackupProgress(0)

    // 模拟备份进度
    const progressInterval = setInterval(() => {
      setBackupProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 10
      })
    }, 500)

    try {
      // 实际应调用主进程 API
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      setBackupProgress(100)
      message.success(t('backupRestore.backupSuccess'))
      loadBackups()
    } catch (error) {
      message.error(t('backupRestore.backupFailed'))
    } finally {
      clearInterval(progressInterval)
      setBackupInProgress(false)
      setBackupProgress(0)
    }
  }

  // 执行恢复
  const handleRestore = async (backup: BackupItem) => {
    Modal.confirm({
      title: t('backupRestore.restoreConfirm'),
      icon: <ExclamationCircleOutlined />,
      content: t('backupRestore.restoreWarning'),
      okText: t('backupRestore.confirmRestore'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setLoading(true)
        try {
          await new Promise(resolve => setTimeout(resolve, 2000))
          message.success(t('backupRestore.restoreSuccess'))
        } catch (error) {
          message.error(t('backupRestore.restoreFailed'))
        } finally {
          setLoading(false)
          setRestoreModalVisible(false)
        }
      }
    })
  }

  // 删除备份
  const handleDeleteBackup = async (backupId: string) => {
    try {
      setBackups(prev => prev.filter(b => b.id !== backupId))
      message.success(t('backupRestore.deleteSuccess'))
    } catch (error) {
      message.error(t('backupRestore.deleteFailed'))
    }
  }

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 获取备份类型图标
  const getBackupTypeIcon = (type: string) => {
    switch (type) {
      case 'database':
        return <DatabaseOutlined />
      case 'volume':
        return <HddOutlined />
      case 'config':
        return <SettingOutlined />
      default:
        return <FileZipOutlined />
    }
  }

  // 获取备份类型颜色
  const getBackupTypeColor = (type: string) => {
    switch (type) {
      case 'database':
        return 'blue'
      case 'volume':
        return 'green'
      case 'config':
        return 'orange'
      default:
        return 'default'
    }
  }

  // 备份列表表格列
  const backupColumns = [
    {
      title: t('backupRestore.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: BackupItem) => (
        <Space>
          {getBackupTypeIcon(record.type)}
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: t('backupRestore.type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={getBackupTypeColor(type)}>
          {t(`backupRestore.types.${type}`)}
        </Tag>
      )
    },
    {
      title: t('backupRestore.server'),
      dataIndex: 'serverName',
      key: 'serverName'
    },
    {
      title: t('backupRestore.size'),
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => formatSize(size)
    },
    {
      title: t('backupRestore.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString()
    },
    {
      title: t('backupRestore.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
          completed: { color: 'success', icon: <CheckCircleOutlined /> },
          failed: { color: 'error', icon: <ExclamationCircleOutlined /> },
          in_progress: { color: 'processing', icon: <ClockCircleOutlined /> }
        }
        const config = statusConfig[status] || statusConfig.completed
        return <Tag color={config.color} icon={config.icon}>{t(`backupRestore.statuses.${status}`)}</Tag>
      }
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: BackupItem) => (
        <Space size="small">
          <Tooltip title={t('backupRestore.restore')}>
            <Button
              size="small"
              icon={<UploadOutlined />}
              onClick={() => {
                setSelectedBackup(record)
                setRestoreModalVisible(true)
              }}
            />
          </Tooltip>
          <Tooltip title={t('backupRestore.download')}>
            <Button size="small" icon={<DownloadOutlined />} />
          </Tooltip>
          <Popconfirm
            title={t('backupRestore.deleteConfirm')}
            onConfirm={() => handleDeleteBackup(record.id)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('common.delete')}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  // 统计数据
  const stats = useMemo(() => {
    const totalBackups = backups.length
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0)
    const databaseBackups = backups.filter(b => b.type === 'database').length
    const volumeBackups = backups.filter(b => b.type === 'volume').length

    return { totalBackups, totalSize, databaseBackups, volumeBackups }
  }, [backups])

  const tabItems = [
    {
      key: 'backup',
      label: (
        <span>
          <DatabaseOutlined />
          {t('backupRestore.backup')}
        </span>
      ),
      children: (
        <>
          {/* 统计卡片 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title={t('backupRestore.totalBackups')}
                  value={stats.totalBackups}
                  prefix={<HistoryOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title={t('backupRestore.totalSize')}
                  value={formatSize(stats.totalSize)}
                  prefix={<FileZipOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title={t('backupRestore.databaseBackups')}
                  value={stats.databaseBackups}
                  prefix={<DatabaseOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title={t('backupRestore.volumeBackups')}
                  value={stats.volumeBackups}
                  prefix={<HddOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 备份操作区 */}
          <Card title={t('backupRestore.quickBackup')} size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>{t('backupRestore.selectServer')}:</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={t('backupRestore.selectServerPlaceholder')}
                  value={selectedServer}
                  onChange={setSelectedServer}
                  options={servers.map(s => ({
                    value: s.id,
                    label: (
                      <Space>
                        <Badge status={s.status === 'online' ? 'success' : 'default'} />
                        <span>{s.name}</span>
                        <Text type="secondary">({s.host})</Text>
                      </Space>
                    )
                  }))}
                />
              </div>

              <Row gutter={[16, 16]}>
                <Col xs={24} sm={8}>
                  <Card
                    hoverable
                    size="small"
                    style={{ textAlign: 'center', height: '100%' }}
                    onClick={() => handleBackup('database')}
                    disabled={!selectedServer || backupInProgress}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <DatabaseOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                      <Text strong>{t('backupRestore.backupDatabase')}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('backupRestore.backupDatabaseDesc')}
                      </Text>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card
                    hoverable
                    size="small"
                    style={{ textAlign: 'center', height: '100%' }}
                    onClick={() => handleBackup('volume')}
                    disabled={!selectedServer || backupInProgress}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <HddOutlined style={{ fontSize: 32, color: '#52c41a' }} />
                      <Text strong>{t('backupRestore.backupVolume')}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('backupRestore.backupVolumeDesc')}
                      </Text>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card
                    hoverable
                    size="small"
                    style={{ textAlign: 'center', height: '100%' }}
                    onClick={() => handleBackup('config')}
                    disabled={!selectedServer || backupInProgress}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <SettingOutlined style={{ fontSize: 32, color: '#faad14' }} />
                      <Text strong>{t('backupRestore.backupConfig')}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('backupRestore.backupConfigDesc')}
                      </Text>
                    </Space>
                  </Card>
                </Col>
              </Row>

              {backupInProgress && (
                <div style={{ marginTop: 16 }}>
                  <Text>{t('backupRestore.backupInProgress')}...</Text>
                  <Progress percent={backupProgress} status="active" />
                </div>
              )}
            </Space>
          </Card>

          {/* 备份列表 */}
          <Card title={t('backupRestore.backupHistory')} size="small">
            {backups.length === 0 ? (
              <Empty description={t('backupRestore.noBackups')} />
            ) : (
              <Table
                columns={backupColumns}
                dataSource={backups}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 800 }}
              />
            )}
          </Card>
        </>
      )
    },
    {
      key: 'restore',
      label: (
        <span>
          <UploadOutlined />
          {t('backupRestore.restore')}
        </span>
      ),
      children: (
        <Card title={t('backupRestore.restoreFromBackup')} size="small">
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              message={t('backupRestore.restoreTip')}
              type="info"
              showIcon
            />
            <div>
              <Text strong>{t('backupRestore.selectBackup')}:</Text>
              <List
                style={{ marginTop: 8 }}
                dataSource={backups.filter(b => b.status === 'completed')}
                renderItem={item => (
                  <List.Item
                    actions={[
                      <Button
                        type="primary"
                        size="small"
                        icon={<UploadOutlined />}
                        onClick={() => handleRestore(item)}
                      >
                        {t('backupRestore.restore')}
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={getBackupTypeIcon(item.type)}
                      title={
                        <Space>
                          <Text strong>{item.name}</Text>
                          <Tag color={getBackupTypeColor(item.type)}>
                            {t(`backupRestore.types.${item.type}`)}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space split={<Divider type="vertical" />}>
                          <Text type="secondary">{item.serverName}</Text>
                          <Text type="secondary">{formatSize(item.size)}</Text>
                          <Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          </Space>
        </Card>
      )
    },
    {
      key: 'schedule',
      label: (
        <span>
          <ClockCircleOutlined />
          {t('backupRestore.schedule')}
        </span>
      ),
      children: (
        <Card title={t('backupRestore.scheduledBackups')} size="small">
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              message={t('backupRestore.scheduleTip')}
              type="info"
              showIcon
              action={
                <Button size="small" type="primary">
                  {t('backupRestore.createSchedule')}
                </Button>
              }
            />
            {backupTasks.length === 0 ? (
              <Empty description={t('backupRestore.noSchedules')} />
            ) : (
              <List
                dataSource={backupTasks}
                renderItem={item => (
                  <List.Item
                    actions={[
                      <Switch
                        checked={item.enabled}
                        onChange={() => {
                          setBackupTasks(prev =>
                            prev.map(t => t.id === item.id ? { ...t, enabled: !t.enabled } : t)
                          )
                        }}
                      />
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <Badge status={item.enabled ? 'success' : 'default'}>
                          {getBackupTypeIcon(item.type)}
                        </Badge>
                      }
                      title={
                        <Space>
                          <Text strong>{item.name}</Text>
                          <Tag color={getBackupTypeColor(item.type)}>
                            {t(`backupRestore.types.${item.type}`)}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">{item.serverName}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('backupRestore.schedule')}: {item.schedule}
                          </Text>
                          {item.lastRun && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {t('backupRestore.lastRun')}: {new Date(item.lastRun).toLocaleString()}
                            </Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
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
            <DatabaseOutlined style={{ marginRight: 8 }} />
            {t('backupRestore.title')}
          </Title>
          <Text type="secondary">{t('backupRestore.description')}</Text>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
      />

      {/* 恢复确认模态框 */}
      <Modal
        title={t('backupRestore.restoreConfirm')}
        open={restoreModalVisible}
        onCancel={() => setRestoreModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setRestoreModalVisible(false)}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="restore"
            type="primary"
            danger
            onClick={() => selectedBackup && handleRestore(selectedBackup)}
          >
            {t('backupRestore.confirmRestore')}
          </Button>
        ]}
      >
        {selectedBackup && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>{t('backupRestore.selectedBackup')}:</Text>
            <Card size="small">
              <Space>
                {getBackupTypeIcon(selectedBackup.type)}
                <Text strong>{selectedBackup.name}</Text>
              </Space>
              <br />
              <Text type="secondary">
                {t('backupRestore.server')}: {selectedBackup.serverName}
              </Text>
              <br />
              <Text type="secondary">
                {t('backupRestore.createdAt')}: {new Date(selectedBackup.createdAt).toLocaleString()}
              </Text>
            </Card>
            <Alert
              message={t('backupRestore.restoreWarning')}
              type="warning"
              showIcon
            />
          </Space>
        )}
      </Modal>
    </div>
  )
}

export default BackupRestore

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
  Modal,
  Form,
  Input,
  Select,
  Descriptions,
  Tooltip,
  Alert,
  Empty
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
  ClearOutlined,
  DatabaseOutlined,
  HddOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { VolumeInfo, VolumeDetail } from '../types/global'

const { Title, Paragraph } = Typography

interface VolumeSizeMap {
  [key: string]: string
}

const Volumes: React.FC = () => {
  const { t } = useTranslation()
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [servers, setServers] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedVolume, setSelectedVolume] = useState<VolumeDetail | null>(null)
  const [volumeSizes, setVolumeSizes] = useState<VolumeSizeMap>({})
  const [pruneModalVisible, setPruneModalVisible] = useState(false)
  const [pruneLoading, setPruneLoading] = useState(false)
  const [form] = Form.useForm()

  const loadServers = async () => {
    try {
      const serversData = await window.electronAPI.server.getAll()
      setServers(serversData.map(s => ({ id: s.id, name: s.name, status: s.status })))
      const onlineServer = serversData.find(s => s.status === 'online')
      if (onlineServer) {
        setSelectedServerId(onlineServer.id)
      } else if (serversData.length > 0) {
        setSelectedServerId(serversData[0].id)
      }
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }

  const loadVolumes = async () => {
    if (!selectedServerId) {
      setVolumes([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await window.electronAPI.volume.getAll(selectedServerId)
      setVolumes(data)

      // 加载每个卷的大小
      const sizes: VolumeSizeMap = {}
      for (const vol of data) {
        try {
          const size = await window.electronAPI.volume.getSize(selectedServerId, vol.name)
          sizes[vol.name] = size
        } catch {
          sizes[vol.name] = '-'
        }
      }
      setVolumeSizes(sizes)
    } catch (error) {
      console.error('Failed to load volumes:', error)
      message.error(t('volume.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServers()
  }, [])

  useEffect(() => {
    if (selectedServerId) {
      loadVolumes()
    }
  }, [selectedServerId])

  const getDriverTag = (driver: string) => {
    const colorMap: Record<string, string> = {
      local: 'blue',
      nfs: 'green',
      ceph: 'purple',
      vfs: 'orange'
    }
    return <Tag color={colorMap[driver] || 'default'}>{driver}</Tag>
  }

  const handleCreate = async (values: { name: string; driver: string }) => {
    if (!selectedServerId) {
      message.warning(t('volume.selectServerFirst'))
      return
    }
    setActionLoading('create')
    try {
      const result = await window.electronAPI.volume.create(
        selectedServerId,
        values.name,
        values.driver
      )
      if (result.success) {
        message.success(t('volume.createSuccess'))
        setCreateModalVisible(false)
        form.resetFields()
        loadVolumes()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (volumeName: string) => {
    if (!selectedServerId) return
    setActionLoading(volumeName)
    try {
      const result = await window.electronAPI.volume.remove(selectedServerId, volumeName)
      if (result.success) {
        message.success(t('volume.deleteSuccess'))
        loadVolumes()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handlePrune = async () => {
    if (!selectedServerId) return
    setPruneLoading(true)
    try {
      const result = await window.electronAPI.volume.prune(selectedServerId, true, false)
      if (result.success) {
        message.success(result.message)
        setPruneModalVisible(false)
        loadVolumes()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setPruneLoading(false)
    }
  }

  const handleViewDetail = async (volumeName: string) => {
    if (!selectedServerId) return
    try {
      const info = await window.electronAPI.volume.getInfo(selectedServerId, volumeName)
      setSelectedVolume(info)
      setDetailModalVisible(true)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const getSelectedServer = () => {
    return servers.find(s => s.id === selectedServerId)
  }

  const columns = [
    {
      title: t('volume.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <DatabaseOutlined />
          <strong>{text}</strong>
        </Space>
      )
    },
    {
      title: t('volume.mountpoint'),
      dataIndex: 'mountpoint',
      key: 'mountpoint',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span>
        </Tooltip>
      )
    },
    {
      title: t('volume.driver'),
      dataIndex: 'driver',
      key: 'driver',
      render: (driver: string) => getDriverTag(driver)
    },
    {
      title: t('volume.size'),
      dataIndex: 'name',
      key: 'size',
      render: (name: string) => (
        <Space>
          <HddOutlined />
          <span>{volumeSizes[name] || '-'}</span>
        </Space>
      )
    },
    {
      title: t('volume.scope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (scope: string) => <Tag>{scope}</Tag>
    },
    {
      title: t('volume.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => text ? new Date(text).toLocaleString() : '-'
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: VolumeInfo) => (
        <Space size="small">
          <Tooltip title={t('volume.viewDetail')}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.name)}
            />
          </Tooltip>
          <Popconfirm
            title={t('volume.confirmDelete')}
            onConfirm={() => handleDelete(record.name)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('common.delete')}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={actionLoading === record.name}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const selectedServer = getSelectedServer()
  const isServerOnline = selectedServer?.status === 'online'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('volume.title')}</Title>
        <Space>
          <Select
            style={{ width: 200 }}
            placeholder={t('volume.selectServer')}
            value={selectedServerId}
            onChange={setSelectedServerId}
          >
            {servers.map(server => (
              <Select.Option key={server.id} value={server.id}>
                <Space>
                  {server.name}
                  <Tag color={server.status === 'online' ? 'success' : 'default'}>
                    {server.status === 'online' ? t('server.online') : t('server.offline')}
                  </Tag>
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Space>
      </div>

      {!selectedServerId && (
        <Alert
          type="info"
          message={t('volume.noServer')}
          description={t('volume.noServerDescription')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedServerId && !isServerOnline && (
        <Alert
          type="warning"
          message={t('volume.serverOffline')}
          description={t('volume.serverOfflineDescription')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              disabled={!isServerOnline}
            >
              {t('volume.create')}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadVolumes}
              loading={loading}
            >
              {t('common.refresh')}
            </Button>
          </Space>
          <Popconfirm
            title={t('volume.confirmPrune')}
            onConfirm={() => setPruneModalVisible(true)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button
              danger
              icon={<ClearOutlined />}
              disabled={!isServerOnline}
            >
              {t('volume.prune')}
            </Button>
          </Popconfirm>
        </div>

        <Table
          columns={columns}
          dataSource={volumes}
          rowKey="name"
          loading={loading}
          locale={{ emptyText: <Empty description={t('common.noData')} /> }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 创建数据卷模态框 */}
      <Modal
        title={t('volume.create')}
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          form.resetFields()
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ driver: 'local' }}
        >
          <Form.Item
            label={t('volume.name')}
            name="name"
            rules={[
              { required: true, message: t('volume.nameRequired') },
              { pattern: /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, message: t('volume.namePattern') }
            ]}
          >
            <Input placeholder={t('volume.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('volume.driver')}
            name="driver"
            rules={[{ required: true, message: t('volume.driverRequired') }]}
          >
            <Select
              options={[
                { label: 'local', value: 'local' },
                { label: 'nfs', value: 'nfs' },
                { label: 'ceph', value: 'ceph' }
              ]}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setCreateModalVisible(false)
                form.resetFields()
              }}>
                {t('common.cancel')}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={actionLoading === 'create'}
              >
                {t('common.confirm')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 数据卷详情模态框 */}
      <Modal
        title={`${t('volume.detail')}: ${selectedVolume?.name || ''}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            {t('common.close')}
          </Button>
        ]}
        width={700}
      >
        {selectedVolume && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label={t('volume.name')}>
              {selectedVolume.name}
            </Descriptions.Item>
            <Descriptions.Item label={t('volume.driver')}>
              {getDriverTag(selectedVolume.driver)}
            </Descriptions.Item>
            <Descriptions.Item label={t('volume.mountpoint')}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {selectedVolume.mountpoint}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label={t('volume.scope')}>
              {selectedVolume.scope}
            </Descriptions.Item>
            <Descriptions.Item label={t('volume.createdAt')}>
              {selectedVolume.createdAt ? new Date(selectedVolume.createdAt).toLocaleString() : '-'}
            </Descriptions.Item>
            {selectedVolume.labels && Object.keys(selectedVolume.labels).length > 0 && (
              <Descriptions.Item label={t('volume.labels')}>
                {Object.entries(selectedVolume.labels).map(([key, value]) => (
                  <Tag key={key}>{key}={value}</Tag>
                ))}
              </Descriptions.Item>
            )}
            {selectedVolume.options && Object.keys(selectedVolume.options).length > 0 && (
              <Descriptions.Item label={t('volume.options')}>
                {Object.entries(selectedVolume.options).map(([key, value]) => (
                  <Tag key={key} color="blue">{key}={value}</Tag>
                ))}
              </Descriptions.Item>
            )}
            {selectedVolume.usageData && (
              <>
                <Descriptions.Item label={t('volume.usageSize')}>
                  {selectedVolume.usageData.size}
                </Descriptions.Item>
                <Descriptions.Item label={t('volume.refCount')}>
                  {selectedVolume.usageData.refCount}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 清理确认模态框 */}
      <Modal
        title={t('volume.confirmPrune')}
        open={pruneModalVisible}
        onCancel={() => setPruneModalVisible(false)}
        onOk={handlePrune}
        confirmLoading={pruneLoading}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true }}
      >
        <Alert
          type="warning"
          message={t('volume.pruneWarning')}
          description={t('volume.pruneWarningDescription')}
          showIcon
        />
        <Paragraph style={{ marginTop: 16 }}>
          {t('volume.pruneConfirmText')}
        </Paragraph>
      </Modal>
    </div>
  )
}

export default Volumes

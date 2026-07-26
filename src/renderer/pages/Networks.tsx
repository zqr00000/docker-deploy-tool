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
  Empty,
  Switch,
  Divider,
  List,
  InputNumber,
  Row,
  Col
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
  ClearOutlined,
  ApiOutlined,
  LinkOutlined,
  DisconnectOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { DockerNetworkInfo, DockerNetworkDetail } from '../types/global'

const { Title, Paragraph } = Typography

const Networks: React.FC = () => {
  const { t } = useTranslation()
  const [networks, setNetworks] = useState<DockerNetworkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [servers, setServers] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<DockerNetworkDetail | null>(null)
  const [pruneModalVisible, setPruneModalVisible] = useState(false)
  const [pruneLoading, setPruneLoading] = useState(false)
  const [connectModalVisible, setConnectModalVisible] = useState(false)
  const [connectNetworkId, setConnectNetworkId] = useState<string>('')
  const [containers, setContainers] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [form] = Form.useForm()
  const [connectForm] = Form.useForm()

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

  const loadNetworks = async () => {
    if (!selectedServerId) {
      setNetworks([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await window.electronAPI.network.getAll(selectedServerId)
      setNetworks(data)
    } catch (error) {
      console.error('Failed to load networks:', error)
      message.error(t('network.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const loadContainers = async () => {
    if (!selectedServerId) return
    try {
      const data = await window.electronAPI.network.getContainers(selectedServerId)
      setContainers(data)
    } catch (error) {
      console.error('Failed to load containers:', error)
    }
  }

  useEffect(() => {
    loadServers()
  }, [])

  useEffect(() => {
    if (selectedServerId) {
      loadNetworks()
    }
  }, [selectedServerId])

  const getDriverTag = (driver: string) => {
    const colorMap: Record<string, string> = {
      bridge: 'blue',
      host: 'green',
      none: 'red',
      overlay: 'purple',
      macvlan: 'orange',
      ipvlan: 'cyan'
    }
    return <Tag color={colorMap[driver] || 'default'}>{driver}</Tag>
  }

  const handleCreate = async (values: {
    name: string
    driver: string
    subnet: string
    gateway: string
    internal: boolean
    enableIPv6: boolean
    ipRange: string
  }) => {
    if (!selectedServerId) {
      message.warning(t('network.selectServerFirst'))
      return
    }
    setActionLoading('create')
    try {
      const result = await window.electronAPI.network.create(selectedServerId, {
        name: values.name,
        driver: values.driver,
        subnet: values.subnet || undefined,
        gateway: values.gateway || undefined,
        internal: values.internal,
        enableIPv6: values.enableIPv6,
        ipRange: values.ipRange || undefined
      })
      if (result.success) {
        message.success(t('network.createSuccess'))
        setCreateModalVisible(false)
        form.resetFields()
        loadNetworks()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (networkId: string) => {
    if (!selectedServerId) return
    setActionLoading(networkId)
    try {
      const result = await window.electronAPI.network.remove(selectedServerId, networkId)
      if (result.success) {
        message.success(t('network.deleteSuccess'))
        loadNetworks()
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
      const result = await window.electronAPI.network.prune(selectedServerId, true)
      if (result.success) {
        message.success(result.message)
        setPruneModalVisible(false)
        loadNetworks()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setPruneLoading(false)
    }
  }

  const handleViewDetail = async (networkId: string) => {
    if (!selectedServerId) return
    try {
      const info = await window.electronAPI.network.getInfo(selectedServerId, networkId)
      setSelectedNetwork(info)
      setDetailModalVisible(true)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const handleOpenConnectModal = async (networkId: string) => {
    setConnectNetworkId(networkId)
    await loadContainers()
    setConnectModalVisible(true)
  }

  const handleConnect = async (values: { containerId: string; ip: string; aliases: string }) => {
    if (!selectedServerId) return
    setActionLoading('connect')
    try {
      const aliases = values.aliases ? values.aliases.split(',').map(a => a.trim()).filter(a => a) : undefined
      const result = await window.electronAPI.network.connect(
        selectedServerId,
        connectNetworkId,
        values.containerId,
        values.ip || undefined,
        undefined,
        aliases
      )
      if (result.success) {
        message.success(result.message)
        setConnectModalVisible(false)
        connectForm.resetFields()
        loadNetworks()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisconnect = async (networkId: string, containerId: string) => {
    if (!selectedServerId) return
    setActionLoading(`disconnect-${containerId}`)
    try {
      const result = await window.electronAPI.network.disconnect(selectedServerId, networkId, containerId)
      if (result.success) {
        message.success(result.message)
        // 刷新详情
        const info = await window.electronAPI.network.getInfo(selectedServerId, networkId)
        setSelectedNetwork(info)
        loadNetworks()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const getSelectedServer = () => {
    return servers.find(s => s.id === selectedServerId)
  }

  const columns = [
    {
      title: t('network.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <ApiOutlined />
          <strong>{text}</strong>
        </Space>
      )
    },
    {
      title: t('network.id'),
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text.substring(0, 12)}</span>
        </Tooltip>
      )
    },
    {
      title: t('network.driver'),
      dataIndex: 'driver',
      key: 'driver',
      render: (driver: string) => getDriverTag(driver)
    },
    {
      title: t('network.scope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (scope: string) => <Tag>{scope}</Tag>
    },
    {
      title: t('network.subnet'),
      dataIndex: 'subnet',
      key: 'subnet',
      render: (text: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text || '-'}</span>
      )
    },
    {
      title: t('network.gateway'),
      dataIndex: 'gateway',
      key: 'gateway',
      render: (text: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text || '-'}</span>
      )
    },
    {
      title: t('network.internal'),
      dataIndex: 'internal',
      key: 'internal',
      render: (internal: boolean) => (
        <Tag color={internal ? 'orange' : 'default'}>
          {internal ? t('common.yes') : t('common.no')}
        </Tag>
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 240,
      render: (_: unknown, record: DockerNetworkInfo) => (
        <Space size="small">
          <Tooltip title={t('network.viewDetail')}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            />
          </Tooltip>
          <Tooltip title={t('network.connectContainer')}>
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => handleOpenConnectModal(record.id)}
            />
          </Tooltip>
          <Popconfirm
            title={t('network.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('common.delete')}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={actionLoading === record.id}
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
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>{t('network.title')}</Title>
        </div>
        <div className="page-header-right">
          <Select
            style={{ width: '100%', maxWidth: 280 }}
            placeholder={t('network.selectServer')}
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
        </div>
      </div>

      {!selectedServerId && (
        <Alert
          type="info"
          message={t('network.noServer')}
          description={t('network.noServerDescription')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedServerId && !isServerOnline && (
        <Alert
          type="warning"
          message={t('network.serverOffline')}
          description={t('network.serverOfflineDescription')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <div className="action-bar" style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
            disabled={!isServerOnline}
          >
            {t('network.create')}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadNetworks}
            loading={loading}
          >
            {t('common.refresh')}
          </Button>
          <Popconfirm
            title={t('network.confirmPrune')}
            onConfirm={() => setPruneModalVisible(true)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button
              danger
              icon={<ClearOutlined />}
              disabled={!isServerOnline}
            >
              {t('network.prune')}
            </Button>
          </Popconfirm>
        </div>

        <Table
          columns={columns}
          dataSource={networks}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: <Empty description={t('common.noData')} /> }}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* 创建网络模态框 */}
      <Modal
        title={t('network.create')}
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          form.resetFields()
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ driver: 'bridge', internal: false, enableIPv6: false }}
        >
          <Form.Item
            label={t('network.name')}
            name="name"
            rules={[
              { required: true, message: t('network.nameRequired') },
              { pattern: /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, message: t('network.namePattern') }
            ]}
          >
            <Input placeholder={t('network.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('network.driver')}
            name="driver"
            rules={[{ required: true, message: t('network.driverRequired') }]}
          >
            <Select
              options={[
                { label: 'bridge', value: 'bridge' },
                { label: 'host', value: 'host' },
                { label: 'none', value: 'none' },
                { label: 'overlay', value: 'overlay' },
                { label: 'macvlan', value: 'macvlan' },
                { label: 'ipvlan', value: 'ipvlan' }
              ]}
            />
          </Form.Item>
          <Form.Item
            label={t('network.subnet')}
            name="subnet"
          >
            <Input placeholder={t('network.subnetPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('network.gateway')}
            name="gateway"
          >
            <Input placeholder={t('network.gatewayPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('network.ipRange')}
            name="ipRange"
          >
            <Input placeholder={t('network.ipRangePlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('network.internal')}
            name="internal"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label={t('network.enableIPv6')}
            name="enableIPv6"
            valuePropName="checked"
          >
            <Switch />
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

      {/* 网络详情模态框 */}
      <Modal
        title={`${t('network.detail')}: ${selectedNetwork?.name || ''}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            {t('common.close')}
          </Button>
        ]}
        width={800}
      >
        {selectedNetwork && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t('network.name')}>
                {selectedNetwork.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('network.id')}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedNetwork.id}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('network.driver')}>
                {getDriverTag(selectedNetwork.driver)}
              </Descriptions.Item>
              <Descriptions.Item label={t('network.scope')}>
                {selectedNetwork.scope}
              </Descriptions.Item>
              <Descriptions.Item label={t('network.created')}>
                {selectedNetwork.created ? new Date(selectedNetwork.created).toLocaleString() : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('network.internal')}>
                <Tag color={selectedNetwork.internal ? 'orange' : 'default'}>
                  {selectedNetwork.internal ? t('common.yes') : t('common.no')}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">{t('network.ipamConfig')}</Divider>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t('network.ipamDriver')}>
                {selectedNetwork.ipam.driver}
              </Descriptions.Item>
              {selectedNetwork.ipam.config.map((config: { subnet: string; gateway: string; ipRange?: string }, index: number) => (
                <Descriptions.Item key={index} label={`${t('network.subnet')} ${index + 1}`}>
                  <Space direction="vertical" size={0}>
                    <span><strong>{t('network.subnet')}:</strong> {config.subnet}</span>
                    <span><strong>{t('network.gateway')}:</strong> {config.gateway}</span>
                    {config.ipRange && <span><strong>{t('network.ipRange')}:</strong> {config.ipRange}</span>}
                  </Space>
                </Descriptions.Item>
              ))}
            </Descriptions>

            {selectedNetwork.labels && Object.keys(selectedNetwork.labels).length > 0 && (
              <>
                <Divider orientation="left">{t('network.labels')}</Divider>
                <div style={{ marginBottom: 16 }}>
                  {Object.entries(selectedNetwork.labels).map(([key, value]) => (
                    <Tag key={key}>{key}={String(value)}</Tag>
                  ))}
                </div>
              </>
            )}

            {selectedNetwork.options && Object.keys(selectedNetwork.options).length > 0 && (
              <>
                <Divider orientation="left">{t('network.options')}</Divider>
                <div style={{ marginBottom: 16 }}>
                  {Object.entries(selectedNetwork.options).map(([key, value]) => (
                    <Tag key={key} color="blue">{key}={String(value)}</Tag>
                  ))}
                </div>
              </>
            )}

            <Divider orientation="left">{t('network.connectedContainers')}</Divider>
            {selectedNetwork.containers.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={selectedNetwork.containers}
                renderItem={(item: { id: string; name: string; ipv4Address: string; ipv6Address: string; macAddress: string }) => (
                  <List.Item
                    actions={[
                      <Popconfirm
                        title={t('network.confirmDisconnect')}
                        onConfirm={() => handleDisconnect(selectedNetwork.id, item.id)}
                        okText={t('common.yes')}
                        cancelText={t('common.no')}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<DisconnectOutlined />}
                          loading={actionLoading === `disconnect-${item.id}`}
                        >
                          {t('network.disconnect')}
                        </Button>
                      </Popconfirm>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <GlobalOutlined />
                          <span>{item.name}</span>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            ID: {item.id.substring(0, 12)}
                          </span>
                          {item.ipv4Address && (
                            <span><strong>IPv4:</strong> {item.ipv4Address}</span>
                          )}
                          {item.ipv6Address && (
                            <span><strong>IPv6:</strong> {item.ipv6Address}</span>
                          )}
                          {item.macAddress && (
                            <span><strong>MAC:</strong> {item.macAddress}</span>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Alert
                type="info"
                message={t('network.noContainers')}
                showIcon
              />
            )}
          </>
        )}
      </Modal>

      {/* 连接容器模态框 */}
      <Modal
        title={t('network.connectContainer')}
        open={connectModalVisible}
        onCancel={() => {
          setConnectModalVisible(false)
          connectForm.resetFields()
        }}
        footer={null}
      >
        <Form
          form={connectForm}
          layout="vertical"
          onFinish={handleConnect}
        >
          <Form.Item
            label={t('network.selectContainer')}
            name="containerId"
            rules={[{ required: true, message: t('network.selectContainerRequired') }]}
          >
            <Select
              placeholder={t('network.selectContainerPlaceholder')}
              options={containers.map(c => ({
                label: (
                  <Space>
                    {c.name}
                    <Tag color={c.status.includes('Up') ? 'success' : 'default'}>
                      {c.status}
                    </Tag>
                  </Space>
                ),
                value: c.id
              }))}
            />
          </Form.Item>
          <Form.Item
            label={t('network.containerIP')}
            name="ip"
          >
            <Input placeholder={t('network.containerIPPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('network.aliases')}
            name="aliases"
          >
            <Input placeholder={t('network.aliasesPlaceholder')} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setConnectModalVisible(false)
                connectForm.resetFields()
              }}>
                {t('common.cancel')}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={actionLoading === 'connect'}
              >
                {t('network.connect')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 清理确认模态框 */}
      <Modal
        title={t('network.confirmPrune')}
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
          message={t('network.pruneWarning')}
          description={t('network.pruneWarningDescription')}
          showIcon
        />
        <Paragraph style={{ marginTop: 16 }}>
          {t('network.pruneConfirmText')}
        </Paragraph>
      </Modal>
    </div>
  )
}

export default Networks

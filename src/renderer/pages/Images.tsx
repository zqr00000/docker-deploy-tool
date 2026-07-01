import React, { useState, useEffect, useCallback } from 'react'
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
  Input,
  Select,
  Tooltip,
  Alert,
  Spin
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
  InfoCircleOutlined,
  SearchOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useServers } from '../context/ServerContext'
import type { DockerImage } from '../../preload/index'

const { Title, Paragraph } = Typography
const { Option } = Select

const Images: React.FC = () => {
  const { t } = useTranslation()
  const { servers } = useServers()

  const [images, setImages] = useState<DockerImage[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [pullModalVisible, setPullModalVisible] = useState(false)
  const [pullImageName, setPullImageName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [infoModalVisible, setInfoModalVisible] = useState(false)
  const [selectedImage, setSelectedImage] = useState<DockerImage | null>(null)
  const [imageInfo, setImageInfo] = useState('')
  const [infoLoading, setInfoLoading] = useState(false)
  const [searchText, setSearchText] = useState('')

  // 获取在线服务器列表
  const onlineServers = servers.filter(s => s.status === 'online')

  // 加载镜像列表
  const loadImages = useCallback(async () => {
    if (!selectedServerId) {
      setImages([])
      return
    }

    setLoading(true)
    try {
      const data = await window.electronAPI.image.getAll(selectedServerId)
      setImages(data)
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('common.error'))
      setImages([])
    } finally {
      setLoading(false)
    }
  }, [selectedServerId, t])

  // 当选择的服务器变化时加载镜像
  useEffect(() => {
    if (selectedServerId) {
      loadImages()
    } else {
      setImages([])
    }
  }, [selectedServerId, loadImages])

  // 自动选择第一个在线服务器
  useEffect(() => {
    if (!selectedServerId && onlineServers.length > 0) {
      setSelectedServerId(onlineServers[0].id)
    }
  }, [onlineServers, selectedServerId])

  // 拉取镜像
  const handlePull = async () => {
    if (!selectedServerId || !pullImageName.trim()) {
      message.warning(t('image.nameRequired'))
      return
    }

    setPulling(true)
    try {
      const result = await window.electronAPI.image.pull(selectedServerId, pullImageName.trim())
      if (result.success) {
        message.success(t('image.pullSuccess'))
        setPullModalVisible(false)
        setPullImageName('')
        loadImages()
      } else {
        message.error(`${t('image.pullFailed')}: ${result.message}`)
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('image.pullFailed'))
    } finally {
      setPulling(false)
    }
  }

  // 删除镜像
  const handleDelete = async (image: DockerImage) => {
    if (!selectedServerId) return

    try {
      const result = await window.electronAPI.image.remove(selectedServerId, image.id)
      if (result.success) {
        message.success(t('image.deleteSuccess'))
        loadImages()
      } else {
        message.error(`${t('image.deleteFailed')}: ${result.message}`)
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('image.deleteFailed'))
    }
  }

  // 清理未使用镜像
  const handlePrune = async () => {
    if (!selectedServerId) return

    Modal.confirm({
      title: t('image.pruneConfirm'),
      content: t('image.pruneConfirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const result = await window.electronAPI.image.prune(selectedServerId)
          if (result.success) {
            message.success(
              `${t('image.pruneSuccess')} - ${t('image.spaceReclaimed')}: ${result.spaceReclaimed || '0B'}`
            )
            loadImages()
          } else {
            message.error(`${t('image.pruneFailed')}: ${result.message}`)
          }
        } catch (error) {
          const err = error as Error
          message.error(err.message || t('image.pruneFailed'))
        }
      }
    })
  }

  // 查看镜像详情
  const handleViewInfo = async (image: DockerImage) => {
    if (!selectedServerId) return

    setSelectedImage(image)
    setInfoModalVisible(true)
    setInfoLoading(true)
    try {
      const info = await window.electronAPI.image.getInfo(selectedServerId, image.id)
      setImageInfo(info)
    } catch (error) {
      const err = error as Error
      setImageInfo(err.message)
    } finally {
      setInfoLoading(false)
    }
  }

  // 过滤镜像列表
  const filteredImages = images.filter(image => {
    if (!searchText) return true
    const search = searchText.toLowerCase()
    return (
      image.repository.toLowerCase().includes(search) ||
      image.tag.toLowerCase().includes(search) ||
      image.id.toLowerCase().includes(search)
    )
  })

  const columns = [
    {
      title: t('image.repository'),
      dataIndex: 'repository',
      key: 'repository',
      render: (text: string) => <strong>{text}</strong>,
      sorter: (a: DockerImage, b: DockerImage) => a.repository.localeCompare(b.repository)
    },
    {
      title: t('image.tag'),
      dataIndex: 'tag',
      key: 'tag',
      render: (tag: string) => (
        <Tag color={tag === 'latest' ? 'blue' : 'default'}>{tag}</Tag>
      ),
      sorter: (a: DockerImage, b: DockerImage) => a.tag.localeCompare(b.tag)
    },
    {
      title: t('image.id'),
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <code style={{ fontSize: 12 }}>{id.substring(0, 19)}</code>
      )
    },
    {
      title: t('image.size'),
      dataIndex: 'size',
      key: 'size',
      sorter: (a: DockerImage, b: DockerImage) => {
        const sizeA = parseFloat(a.size)
        const sizeB = parseFloat(b.size)
        return sizeA - sizeB
      }
    },
    {
      title: t('image.created'),
      dataIndex: 'created',
      key: 'created',
      sorter: (a: DockerImage, b: DockerImage) => a.created.localeCompare(b.created)
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 150,
      render: (_: unknown, record: DockerImage) => (
        <Space size="small">
          <Tooltip title={t('image.viewInfo')}>
            <Button
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => handleViewInfo(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('image.confirmDelete')}
            onConfirm={() => handleDelete(record)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('common.delete')}>
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
        <Title level={4} style={{ margin: 0 }}>{t('image.title')}</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadImages} loading={loading}>
            {t('common.refresh')}
          </Button>
        </Space>
      </div>

      {/* 服务器选择 */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontWeight: 500 }}>{t('image.selectServer')}:</span>
            <Select
              style={{ width: 300 }}
              placeholder={t('image.selectServerPlaceholder')}
              value={selectedServerId}
              onChange={setSelectedServerId}
              allowClear
            >
              {onlineServers.map(server => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.host})
                </Option>
              ))}
            </Select>
            {!selectedServerId && onlineServers.length === 0 && (
              <Alert
                message={t('image.noOnlineServers')}
                type="warning"
                showIcon
                style={{ flex: 1 }}
              />
            )}
          </div>
        </Space>
      </Card>

      {/* 操作栏 */}
      {selectedServerId && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setPullModalVisible(true)}
            >
              {t('image.pull')}
            </Button>
            <Button
              icon={<ClearOutlined />}
              onClick={handlePrune}
            >
              {t('image.prune')}
            </Button>
            <Input
              placeholder={t('image.searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 250 }}
              allowClear
            />
          </Space>
        </Card>
      )}

      {/* 镜像列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredImages}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} ${t('image.totalItems')}`
          }}
          size="middle"
        />
      </Card>

      {/* 拉取镜像弹窗 */}
      <Modal
        title={t('image.pull')}
        open={pullModalVisible}
        onOk={handlePull}
        onCancel={() => {
          setPullModalVisible(false)
          setPullImageName('')
        }}
        confirmLoading={pulling}
        okText={t('image.pull')}
        cancelText={t('common.cancel')}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              {t('image.imageName')} <span style={{ color: 'red' }}>*</span>
            </label>
            <Input
              placeholder={t('image.imageNamePlaceholder')}
              value={pullImageName}
              onChange={e => setPullImageName(e.target.value)}
              onPressEnter={handlePull}
            />
          </div>
          <Alert
            message={t('image.pullTip')}
            description={
              <div>
                <Paragraph style={{ marginBottom: 4 }}>
                  {t('image.pullExamples')}:
                </Paragraph>
                <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                  <li><code>nginx:latest</code></li>
                  <li><code>mysql:8.0</code></li>
                  <li><code>redis:7-alpine</code></li>
                  <li><code>ubuntu:22.04</code></li>
                </ul>
              </div>
            }
            type="info"
            showIcon
          />
        </Space>
      </Modal>

      {/* 镜像详情弹窗 */}
      <Modal
        title={`${t('image.imageInfo')} - ${selectedImage?.repository || ''}:${selectedImage?.tag || ''}`}
        open={infoModalVisible}
        onCancel={() => {
          setInfoModalVisible(false)
          setImageInfo('')
          setSelectedImage(null)
        }}
        footer={null}
        width={700}
      >
        <Spin spinning={infoLoading}>
          <pre
            style={{
              maxHeight: 500,
              overflow: 'auto',
              backgroundColor: '#f5f5f5',
              padding: 16,
              borderRadius: 4,
              fontSize: 12
            }}
          >
            {imageInfo || t('common.noData')}
          </pre>
        </Spin>
      </Modal>
    </div>
  )
}

export default Images

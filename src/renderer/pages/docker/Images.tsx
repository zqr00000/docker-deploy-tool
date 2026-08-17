import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Spin,
  Row,
  Col
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  ExportOutlined,
  ImportOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useServers } from '../../context/ServerContext'
import type { DockerImage } from '../../../preload/index'

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
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  // 缓存选中的镜像对象（跨页/搜索过滤时仍可获取完整数据）
  const selectedImagesRef = useRef<Map<string, DockerImage>>(new Map())
  const [deleting, setDeleting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  // 格式化镜像创建时间：后端返回 UTC ISO，此处按本机时区显示
  const formatCreated = (created: string): string => {
    const d = new Date(created)
    if (isNaN(d.getTime())) return created
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

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
    // 切换服务器时清空选中
    setSelectedRowKeys([])
    selectedImagesRef.current.clear()

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

  // 批量删除镜像
  const handleBatchDelete = () => {
    if (!selectedServerId || selectedRowKeys.length === 0) return

    const imagesToDelete = Array.from(selectedImagesRef.current.values())

    Modal.confirm({
      title: t('image.batchDeleteConfirm').replace('{count}', String(imagesToDelete.length)),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeleting(true)
        try {
          const result = await window.electronAPI.image.removeBatch(
            selectedServerId,
            imagesToDelete.map(img => img.id)
          )

          if (result.failCount > 0) {
            message.warning(
              t('image.batchDeletePartial')
                .replace('{success}', String(result.successCount))
                .replace('{fail}', String(result.failCount))
            )
          } else {
            message.success(t('image.batchDeleteSuccess').replace('{count}', String(result.successCount)))
          }

          setSelectedRowKeys([])
          selectedImagesRef.current.clear()
          loadImages()
        } catch (error) {
          const err = error as Error
          message.error(err.message || t('image.deleteFailed'))
        } finally {
          setDeleting(false)
        }
      }
    })
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

  // 导出镜像到本地
  const handleExport = async (image: DockerImage) => {
    if (!selectedServerId) return
    if (image.repository === '<none>') {
      message.warning(t('image.noneImageExportTip'))
      return
    }

    // 生成默认导出文件名
    const safeRepo = image.repository.replace(/[^\w./:@-]/g, '_')
    const defaultName = `${safeRepo}-${image.tag || 'latest'}-${new Date().toISOString().slice(0, 10)}.tar`

    try {
      const dialogResult = await window.electronAPI.image.showSaveDialog(defaultName)
      if (dialogResult.canceled || !dialogResult.filePath) return

      setExportingId(image.id)
      message.info(t('image.exportTip'))
      const result = await window.electronAPI.image.export(
        selectedServerId,
        `${image.repository}:${image.tag}`,
        dialogResult.filePath
      )
      if (result.success) {
        message.success({
          content: (
            <Space size={4}>
              <span>{result.message || t('image.exportSuccess')}</span>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  if (dialogResult.filePath) {
                    window.electronAPI.showItemInFolder(dialogResult.filePath)
                  }
                }}
              >
                {t('image.openFolder')}
              </Button>
            </Space>
          ),
          duration: 8
        })
      } else {
        message.error(result.message || t('image.exportFailed'))
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('image.exportFailed'))
    } finally {
      setExportingId(null)
    }
  }

  // 从本地文件导入镜像
  const handleImport = async () => {
    if (!selectedServerId) return

    try {
      const dialogResult = await window.electronAPI.image.showOpenDialog()
      if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) return

      const localPath = dialogResult.filePaths[0]
      setImporting(true)
      message.info(t('image.importTip'))
      const result = await window.electronAPI.image.import(selectedServerId, localPath)
      if (result.success) {
        message.success(t('image.importSuccess'))
        loadImages()
      } else {
        message.error(result.message || t('image.importFailed'))
      }
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('image.importFailed'))
    } finally {
      setImporting(false)
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
      render: (created: string) => formatCreated(created),
      sorter: (a: DockerImage, b: DockerImage) => new Date(a.created).getTime() - new Date(b.created).getTime()
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: DockerImage) => (
        <Space size="small">
          <Tooltip title={t('image.viewInfo')}>
            <Button
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => handleViewInfo(record)}
            />
          </Tooltip>
          <Tooltip title={t('image.export')}>
            <Button
              size="small"
              icon={<ExportOutlined />}
              loading={exportingId === record.id}
              disabled={record.repository === '<none>'}
              onClick={() => handleExport(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('image.confirmDelete')}
            description={t('image.forceDeleteTip')}
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
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>{t('image.title')}</Title>
        </div>
        <div className="page-header-right">
          <Button icon={<ReloadOutlined />} onClick={loadImages} loading={loading}>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* 服务器选择 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]} align="middle">
          <Col xs={24} sm={24} md={8} lg={6}>
            <span style={{ fontWeight: 500 }}>{t('image.selectServer')}:</span>
          </Col>
          <Col xs={24} sm={24} md={16} lg={18}>
            <Select
              style={{ width: '100%', maxWidth: 400 }}
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
          </Col>
        </Row>
        {!selectedServerId && onlineServers.length === 0 && (
          <Alert
            message={t('image.noOnlineServers')}
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
          />
        )}
      </Card>

      {/* 操作栏 */}
      {selectedServerId && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div className="filter-bar">
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
            <Button
              icon={<ImportOutlined />}
              onClick={handleImport}
              loading={importing}
            >
              {t('image.import')}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
              loading={deleting}
            >
              {t('image.batchDelete')}
              {selectedRowKeys.length > 0 && ` (${selectedRowKeys.length})`}
            </Button>
            <Input
              placeholder={t('image.searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ flex: 1, minWidth: 150, maxWidth: 300 }}
              allowClear
            />
          </div>
        </Card>
      )}

      {/* 镜像列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredImages}
          rowKey={(record: DockerImage) => `${record.id}-${record.repository}-${record.tag}`}
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => {
              // 移除取消选中的项
              const keySet = new Set(keys.map(String))
              selectedImagesRef.current.forEach((_, key) => {
                if (!keySet.has(key)) selectedImagesRef.current.delete(key)
              })
              // 加入新选中的项（跨页也可用）
              rows.forEach((row) => {
                const img = row as DockerImage
                selectedImagesRef.current.set(`${img.id}-${img.repository}-${img.tag}`, img)
              })
              setSelectedRowKeys(keys)
            },
            preserveSelectedRowKeys: true
          }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `${total} ${t('image.totalItems')}`
          }}
          size="middle"
          scroll={{ x: 800 }}
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

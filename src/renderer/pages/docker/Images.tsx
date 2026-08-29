import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

interface AggregatedImage {
  id: string
  items: DockerImage[]
  isUsed: boolean
  size: string
  created: string
}

const Images: React.FC = () => {
  const { t } = useTranslation()
  const { servers } = useServers()

  const [images, setImages] = useState<DockerImage[]>([])
  const [usedImageNames, setUsedImageNames] = useState<Set<string>>(new Set())
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
  const selectedImagesRef = useRef<Map<string, DockerImage>>(new Map())
  const [deleting, setDeleting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const formatCreated = (created: string): string => {
    const d = new Date(created)
    if (isNaN(d.getTime())) return created
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const onlineServers = servers.filter(s => s.status === 'online')

  const loadImages = useCallback(async () => {
    if (!selectedServerId) {
      setImages([])
      setUsedImageNames(new Set())
      return
    }

    setLoading(true)
    try {
      const [data, usedNamesArr] = await Promise.all([
        window.electronAPI.image.getAll(selectedServerId),
        window.electronAPI.image.getUsedImageNames(selectedServerId).catch(() => [])
      ])
      setImages(data)
      setUsedImageNames(new Set(usedNamesArr))
    } catch (error) {
      const err = error as Error
      message.error(err.message || t('common.error'))
      setImages([])
      setUsedImageNames(new Set())
    } finally {
      setLoading(false)
    }
  }, [selectedServerId, t])

  useEffect(() => {
    setSelectedRowKeys([])
    selectedImagesRef.current.clear()

    if (selectedServerId) {
      loadImages()
    } else {
      setImages([])
      setUsedImageNames(new Set())
    }
  }, [selectedServerId, loadImages])

  useEffect(() => {
    if (!selectedServerId && onlineServers.length > 0) {
      setSelectedServerId(onlineServers[0].id)
    }
  }, [onlineServers, selectedServerId])

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

  const handleDelete = async (aggregated: AggregatedImage) => {
    if (!selectedServerId) return

    try {
      const result = await window.electronAPI.image.remove(selectedServerId, aggregated.id)
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
          const uniqueIds = [...new Set(imagesToDelete.map(img => img.id))]
          const result = await window.electronAPI.image.removeBatch(
            selectedServerId,
            uniqueIds
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

  const handleViewInfo = async (aggregated: AggregatedImage) => {
    if (!selectedServerId) return

    const primaryImage = aggregated.items[0]
    setSelectedImage(primaryImage)
    setInfoModalVisible(true)
    setInfoLoading(true)
    try {
      const info = await window.electronAPI.image.getInfo(selectedServerId, aggregated.id)
      setImageInfo(info)
    } catch (error) {
      const err = error as Error
      setImageInfo(err.message)
    } finally {
      setInfoLoading(false)
    }
  }

  const handleExport = async (aggregated: AggregatedImage) => {
    if (!selectedServerId) return
    const primaryImage = aggregated.items[0]
    if (!primaryImage || primaryImage.repository === '<none>') {
      message.warning(t('image.noneImageExportTip'))
      return
    }

    const safeRepo = primaryImage.repository.replace(/[^\w./:@-]/g, '_')
    const defaultName = `${safeRepo}-${primaryImage.tag || 'latest'}-${new Date().toISOString().slice(0, 10)}.tar`

    try {
      const dialogResult = await window.electronAPI.image.showSaveDialog(defaultName)
      if (dialogResult.canceled || !dialogResult.filePath) return

      setExportingId(aggregated.id)
      message.info(t('image.exportTip'))
      const result = await window.electronAPI.image.export(
        selectedServerId,
        `${primaryImage.repository}:${primaryImage.tag}`,
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

  const aggregatedImages = useMemo(() => {
    const map = new Map<string, AggregatedImage>()
    const usedNamesArr = Array.from(usedImageNames)

    for (const img of images) {
      const key = img.id
      const existing = map.get(key)
      const repoTag = `${img.repository}:${img.tag}`
      const cleanId = img.id.replace(/^sha256:/, '')

      // 使用中判定：精确匹配（repo:tag / 完整镜像 ID / 12 位短 ID / digest 摘要）
      const isUsed = usedImageNames.has(repoTag) || usedNamesArr.some((name) => {
        if (!name || name === 'N/A' || name === '<none>') return false
        const cleanName = String(name).replace(/^sha256:/, '')
        if (cleanName === repoTag) return true
        // 仅当镜像无 <none> 时才做 ID 级比对（不同仓库同名不会再互相误标）
        if (cleanName === cleanId) return true
        if (cleanName.length >= 12 && cleanId.startsWith(cleanName)) return true
        // digest 引用（repo@sha256:xxx）
        const digIdx = cleanName.indexOf('@sha256:')
        if (digIdx >= 0) {
          const digestId = cleanName.slice(digIdx + '@sha256:'.length)
          if (digestId === cleanId || cleanId.startsWith(digestId.slice(0, 12))) return true
        }
        return false
      })

      if (existing) {
        existing.items.push(img)
        if (!existing.isUsed && isUsed) existing.isUsed = true
        if (!existing.size || img.size > existing.size) existing.size = img.size
        if (!existing.created || new Date(img.created) > new Date(existing.created)) {
          existing.created = img.created
        }
      } else {
        map.set(key, {
          id: img.id,
          items: [img],
          isUsed,
          size: img.size,
          created: img.created
        })
      }
    }

    return Array.from(map.values())
  }, [images, usedImageNames])

  const filteredImages = useMemo(() => {
    if (!searchText) return aggregatedImages
    const search = searchText.toLowerCase()
    return aggregatedImages.filter(agg => {
      if (agg.id.toLowerCase().includes(search)) return true
      return agg.items.some(item =>
        item.repository.toLowerCase().includes(search) ||
        item.tag.toLowerCase().includes(search) ||
        `${item.repository}:${item.tag}`.toLowerCase().includes(search)
      )
    })
  }, [aggregatedImages, searchText])

  const columns = [
    {
      title: (
        <span>
          Id <span style={{ color: '#888', fontSize: 12 }}>↓↑</span>
        </span>
      ),
      dataIndex: 'id',
      key: 'id',
      width: 280,
      render: (id: string) => (
        <Tooltip title={id}>
          <code style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
            {id.length > 40 ? `${id.substring(0, 40)}...` : id}
          </code>
        </Tooltip>
      ),
      sorter: (a: AggregatedImage, b: AggregatedImage) => a.id.localeCompare(b.id)
    },
    {
      title: (
        <span>
          标记 <span style={{ color: '#888', fontSize: 12 }}>↓↑</span>
        </span>
      ),
      key: 'status',
      width: 100,
      render: (_: unknown, record: AggregatedImage) => (
        record.isUsed ? null : (
          <Tag color="orange" style={{ fontWeight: 500 }}>未使用</Tag>
        )
      ),
      sorter: (a: AggregatedImage, b: AggregatedImage) => {
        return (a.isUsed === b.isUsed ? 0 : a.isUsed ? 1 : -1)
      }
    },
    {
      title: '仓库标签',
      key: 'tags',
      render: (_: unknown, record: AggregatedImage) => (
        <Space size={[4, 4]} wrap>
          {record.items.map((item, idx) => (
            <Tag
              key={`${record.id}-${item.repository}-${item.tag}-${idx}`}
              color="blue"
              style={{
                margin: 0,
                borderRadius: 4,
                fontSize: 12,
                lineHeight: '20px'
              }}
              title={`${item.repository}:${item.tag}`}
            >
              {item.repository}:{item.tag}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: t('image.size'),
      dataIndex: 'size',
      key: 'size',
      width: 80,
      sorter: (a: AggregatedImage, b: AggregatedImage) => {
        const sizeA = parseFloat(a.size)
        const sizeB = parseFloat(b.size)
        return sizeA - sizeB
      }
    },
    {
      title: t('image.created'),
      dataIndex: 'created',
      key: 'created',
      width: 140,
      render: (created: string) => formatCreated(created),
      sorter: (a: AggregatedImage, b: AggregatedImage) => new Date(a.created).getTime() - new Date(b.created).getTime()
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: AggregatedImage) => (
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
              disabled={record.items.length === 0 || record.items[0].repository === '<none>'}
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

      <Card>
        <Table
          columns={columns}
          dataSource={filteredImages}
          rowKey={(record: AggregatedImage) => record.id}
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => {
              const keySet = new Set(keys.map(String))
              selectedImagesRef.current.forEach((_, key) => {
                if (!keySet.has(key)) selectedImagesRef.current.delete(key)
              })
              rows.forEach((row) => {
                const agg = row as AggregatedImage
                agg.items.forEach(item => {
                  selectedImagesRef.current.set(`${agg.id}-${item.repository}-${item.tag}`, item)
                })
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
          scroll={{ x: 900 }}
          style={{
            '--ant-color-border-secondary': 'transparent'
          } as React.CSSProperties}
        />
      </Card>

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
              backgroundColor: 'var(--app-hover-bg)',
              padding: 16,
              borderRadius: 6,
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

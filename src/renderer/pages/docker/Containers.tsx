import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Card,
  Table,
  Button,
  Select,
  Input,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  Modal,
  Spin,
  Empty
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ContainerOutlined,
  ReloadOutlined,
  SearchOutlined,
  CaretRightOutlined,
  PauseCircleOutlined,
  RedoOutlined,
  DeleteOutlined,
  FileTextOutlined,
  CloudServerOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useServers } from '../../context/ServerContext'
import type { ContainerInfo } from '../../types/global'

const { Title, Text } = Typography
const { Option } = Select

// 判断容器是否在运行
const isRunning = (status: string) => {
  const s = (status || '').toLowerCase()
  return s.includes('up') || s.includes('running')
}

// 提取状态中的关键标记（Up/Exited/...）
const statusTag = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s.includes('up')) return { color: 'green', text: status }
  if (s.includes('exited')) return { color: 'default', text: status }
  if (s.includes('restarting')) return { color: 'orange', text: status }
  if (s.includes('paused')) return { color: 'blue', text: status }
  if (s.includes('dead')) return { color: 'red', text: status }
  return { color: 'default', text: status || 'unknown' }
}

const Containers: React.FC = () => {
  const { t } = useTranslation()
  const { servers } = useServers()

  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [operating, setOperating] = useState<string | null>(null)

  // 日志查看
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [logContainer, setLogContainer] = useState<ContainerInfo | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logLoading, setLogLoading] = useState(false)

  const onlineServers = servers.filter(s => s.status === 'online')

  const loadContainers = useCallback(async () => {
    if (!selectedServerId) {
      setContainers([])
      return
    }
    setLoading(true)
    try {
      const data = await window.electronAPI.container.getAll(selectedServerId)
      setContainers(data)
    } catch (error) {
      message.error((error as Error).message || t('common.error'))
      setContainers([])
    } finally {
      setLoading(false)
    }
  }, [selectedServerId, t])

  useEffect(() => {
    if (selectedServerId) {
      loadContainers()
    } else {
      setContainers([])
    }
  }, [selectedServerId, loadContainers])

  useEffect(() => {
    if (!selectedServerId && onlineServers.length > 0) {
      setSelectedServerId(onlineServers[0].id)
    }
  }, [onlineServers, selectedServerId])

  // 操作容器后刷新
  const afterOp = (success: boolean, okMsg: string, failMsg: string) => {
    if (success) {
      message.success(okMsg)
      loadContainers()
    } else {
      message.error(failMsg)
    }
  }

  const handleStart = async (c: ContainerInfo) => {
    if (!selectedServerId) return
    setOperating(c.id)
    try {
      const r = await window.electronAPI.container.start(selectedServerId, c.id)
      afterOp(r.success, t('container.startSuccess'), `${t('container.startFailed')}: ${r.message}`)
    } finally {
      setOperating(null)
    }
  }

  const handleStop = async (c: ContainerInfo) => {
    if (!selectedServerId) return
    setOperating(c.id)
    try {
      const r = await window.electronAPI.container.stop(selectedServerId, c.id)
      afterOp(r.success, t('container.stopSuccess'), `${t('container.stopFailed')}: ${r.message}`)
    } finally {
      setOperating(null)
    }
  }

  const handleRestart = async (c: ContainerInfo) => {
    if (!selectedServerId) return
    setOperating(c.id)
    try {
      const r = await window.electronAPI.container.restart(selectedServerId, c.id)
      afterOp(r.success, t('container.restartSuccess'), `${t('container.restartFailed')}: ${r.message}`)
    } finally {
      setOperating(null)
    }
  }

  const handleRemove = (c: ContainerInfo) => {
    if (!selectedServerId) return
    Modal.confirm({
      title: t('container.removeConfirmTitle'),
      content: t('container.removeConfirmContent').replace('{name}', c.name),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setOperating(c.id)
        try {
          const r = await window.electronAPI.container.remove(selectedServerId, c.id)
          afterOp(r.success, t('container.removeSuccess'), `${t('container.removeFailed')}: ${r.message}`)
        } finally {
          setOperating(null)
        }
      }
    })
  }

  const handleViewLogs = async (c: ContainerInfo) => {
    if (!selectedServerId) return
    setLogContainer(c)
    setLogModalOpen(true)
    setLogLoading(true)
    setLogContent('')
    try {
      const content = await window.electronAPI.container.getLogs(selectedServerId, c.id, 500)
      setLogContent(content || t('container.noLogs'))
    } catch (error) {
      setLogContent((error as Error).message)
    } finally {
      setLogLoading(false)
    }
  }

  // 过滤
  const filtered = useMemo(() => {
    const kw = searchText.trim().toLowerCase()
    if (!kw) return containers
    return containers.filter(c =>
      c.name.toLowerCase().includes(kw) ||
      c.image.toLowerCase().includes(kw) ||
      c.id.toLowerCase().includes(kw)
    )
  }, [containers, searchText])

  const columns: ColumnsType<ContainerInfo> = [
    {
      title: t('container.name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => (
        <Space size={6}>
          <ContainerOutlined style={{ color: '#0A84FF' }} />
          <span style={{ fontWeight: 500 }}>{name}</span>
        </Space>
      )
    },
    {
      title: t('container.image'),
      dataIndex: 'image',
      key: 'image',
      ellipsis: true,
      render: (image: string) => <Text type="secondary" style={{ fontSize: 12 }}>{image}</Text>
    },
    {
      title: t('container.status'),
      dataIndex: 'status',
      key: 'status',
      width: 220,
      render: (status: string) => {
        const tag = statusTag(status)
        return <Tag color={tag.color} style={{ marginRight: 0 }}>{tag.text}</Tag>
      }
    },
    {
      title: t('container.ports'),
      dataIndex: 'ports',
      key: 'ports',
      width: 180,
      ellipsis: true,
      render: (ports: string[]) => {
        if (!ports || ports.length === 0) return <Text type="secondary">-</Text>
        return <Text style={{ fontSize: 12 }}>{ports.join(', ')}</Text>
      }
    },
    {
      title: t('container.created'),
      dataIndex: 'created',
      key: 'created',
      width: 170,
      render: (created: string) => <Text type="secondary" style={{ fontSize: 12 }}>{created}</Text>
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 210,
      render: (_, record) => {
        const running = isRunning(record.status)
        const busy = operating === record.id
        return (
          <Space size={4}>
            {running ? (
              <Tooltip title={t('container.stop')}>
                <Button size="small" icon={<PauseCircleOutlined />} loading={busy} onClick={() => handleStop(record)} />
              </Tooltip>
            ) : (
              <Tooltip title={t('container.start')}>
                <Button size="small" type="primary" icon={<CaretRightOutlined />} loading={busy} onClick={() => handleStart(record)} />
              </Tooltip>
            )}
            <Tooltip title={t('container.restart')}>
              <Button size="small" icon={<RedoOutlined />} loading={busy} onClick={() => handleRestart(record)} />
            </Tooltip>
            <Tooltip title={t('container.viewLogs')}>
              <Button size="small" icon={<FileTextOutlined />} onClick={() => handleViewLogs(record)} />
            </Tooltip>
            <Tooltip title={t('container.remove')}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={busy} onClick={() => handleRemove(record)} />
            </Tooltip>
          </Space>
        )
      }
    }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            <ContainerOutlined style={{ marginRight: 8, color: '#0A84FF' }} />
            {t('container.title')}
          </Title>
          <Text type="secondary" className="subtitle">
            {t('container.subtitle')}
          </Text>
        </div>
      </div>

      <Card>
        {/* 工具栏：服务器选择 / 搜索 / 刷新 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <Select
            value={selectedServerId || undefined}
            placeholder={t('container.selectServer')}
            style={{ minWidth: 220 }}
            onChange={(v) => setSelectedServerId(v)}
            suffixIcon={<CloudServerOutlined />}
          >
            {onlineServers.map(s => (
              <Option key={s.id} value={s.id}>{s.name} ({s.host})</Option>
            ))}
          </Select>

          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#8e8e93' }} />}
            placeholder={t('container.searchPlaceholder')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
          />

          <Button icon={<ReloadOutlined />} onClick={loadContainers} loading={loading}>
            {t('container.refresh')}
          </Button>

          <Text type="secondary" style={{ marginLeft: 'auto' }}>
            {t('container.totalCount').replace('{count}', String(filtered.length))}
          </Text>
        </div>

        <Table<ContainerInfo>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t2) => t('container.totalCount').replace('{count}', String(t2)) }}
          locale={{ emptyText: <Empty description={t('container.empty')} /> }}
        />
      </Card>

      {/* 日志查看 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: '#0A84FF' }} />
            <span>{logContainer ? logContainer.name : t('container.viewLogs')}</span>
          </Space>
        }
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        footer={null}
        width={760}
      >
        {logLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <pre style={{
            maxHeight: 480,
            overflow: 'auto',
            margin: 0,
            padding: 12,
            borderRadius: 8,
            background: 'var(--bg-secondary, rgba(128,128,128,0.08))',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {logContent}
          </pre>
        )}
      </Modal>
    </div>
  )
}

export default Containers

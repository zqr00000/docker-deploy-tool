import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  DatePicker,
  Popconfirm,
  message,
  Typography,
  Row,
  Col,
  Tooltip
} from 'antd'
import {
  SearchOutlined,
  ExportOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

interface AuditLogRow {
  id: string
  timestamp: string
  action: string
  targetType: string
  targetId: string | null
  targetName: string | null
  status: string
  details: string | null
  serverId: string | null
  createdAt: string
}

interface AuditLogResult {
  logs: AuditLogRow[]
  total: number
  page: number
  pageSize: number
}

const actionColorMap: Record<string, string> = {
  server_connect: 'blue',
  server_disconnect: 'default',
  server_create: 'green',
  server_update: 'orange',
  server_delete: 'red',
  app_deploy: 'purple',
  app_start: 'green',
  app_stop: 'default',
  app_restart: 'cyan',
  app_delete: 'red',
  app_update: 'orange',
  template_create: 'green',
  template_update: 'orange',
  template_delete: 'red',
  settings_change: 'geekblue'
}

const statusColorMap: Record<string, string> = {
  success: 'success',
  failure: 'error',
  pending: 'processing'
}

const AuditLog: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AuditLogResult>({ logs: [], total: 0, page: 1, pageSize: 50 })
  const [searchText, setSearchText] = useState('')
  const [actionFilter, setActionFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [actions, setActions] = useState<string[]>([])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const filter: Record<string, unknown> = {
        page: data.page,
        pageSize: data.pageSize
      }
      if (searchText) filter.search = searchText
      if (actionFilter) filter.action = actionFilter
      if (statusFilter) filter.status = statusFilter
      if (dateRange?.[0]) filter.startDate = dateRange[0].startOf('day').toISOString()
      if (dateRange?.[1]) filter.endDate = dateRange[1].endOf('day').toISOString()

      const result = await window.electronAPI.auditLog.query(filter)
      setData(result)
    } catch (error) {
      message.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [data.page, data.pageSize, searchText, actionFilter, statusFilter, dateRange, t])

  const fetchActions = useCallback(async () => {
    try {
      const result = await window.electronAPI.auditLog.getActions()
      setActions(result)
    } catch (error) {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetchActions()
  }, [fetchActions])

  const handleExport = async () => {
    try {
      const filter: Record<string, unknown> = {}
      if (searchText) filter.search = searchText
      if (actionFilter) filter.action = actionFilter
      if (statusFilter) filter.status = statusFilter
      if (dateRange?.[0]) filter.startDate = dateRange[0].startOf('day').toISOString()
      if (dateRange?.[1]) filter.endDate = dateRange[1].endOf('day').toISOString()

      const result = await window.electronAPI.auditLog.exportCSV(filter)
      if (result.success) {
        message.success(t('auditLog.exportSuccess'))
      } else if (result.message !== '已取消') {
        message.error(result.message)
      }
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleCleanup = async () => {
    try {
      const result = await window.electronAPI.auditLog.cleanup(90)
      if (result.success) {
        message.success(t('auditLog.cleanupSuccess').replace('{{count}}', String(result.deleted)))
        fetchLogs()
      }
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleClear = async () => {
    try {
      const result = await window.electronAPI.auditLog.clear()
      if (result.success) {
        message.success(t('auditLog.clearSuccess'))
        fetchLogs()
        fetchActions()
      }
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleReset = () => {
    setSearchText('')
    setActionFilter(undefined)
    setStatusFilter(undefined)
    setDateRange(null)
  }

  const columns: ColumnsType<AuditLogRow> = [
    {
      title: t('auditLog.timestamp'),
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (value: string) => {
        const date = new Date(value)
        return (
          <Text style={{ fontSize: 12 }}>
            {date.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </Text>
        )
      }
    },
    {
      title: t('auditLog.action'),
      dataIndex: 'action',
      key: 'action',
      width: 160,
      render: (value: string) => (
        <Tag color={actionColorMap[value] || 'default'}>
          {t(`auditLog.actions.${value}`, { defaultValue: value })}
        </Tag>
      )
    },
    {
      title: t('auditLog.targetType'),
      dataIndex: 'targetType',
      key: 'targetType',
      width: 100,
      render: (value: string) => (
        <Tag>{t(`auditLog.targetTypes.${value}`, { defaultValue: value })}</Tag>
      )
    },
    {
      title: t('auditLog.targetName'),
      dataIndex: 'targetName',
      key: 'targetName',
      ellipsis: true,
      render: (value: string | null) => value || '-'
    },
    {
      title: t('auditLog.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={statusColorMap[value] || 'default'}>
          {t(`auditLog.statuses.${value}`, { defaultValue: value })}
        </Tag>
      )
    },
    {
      title: t('auditLog.details'),
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
      render: (value: string | null) => (
        <Tooltip title={value}>
          <span>{value || '-'}</span>
        </Tooltip>
      )
    }
  ]

  return (
    <div>
      <Title level={4}>{t('auditLog.title')}</Title>

      <Card style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder={t('auditLog.searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Select
              placeholder={t('auditLog.actionFilter')}
              value={actionFilter}
              onChange={setActionFilter}
              allowClear
              style={{ width: '100%' }}
            >
              {actions.map(action => (
                <Option key={action} value={action}>
                  {t(`auditLog.actions.${action}`, { defaultValue: action })}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Select
              placeholder={t('auditLog.statusFilter')}
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="success">{t('auditLog.statuses.success')}</Option>
              <Option value="failure">{t('auditLog.statuses.failure')}</Option>
              <Option value="pending">{t('auditLog.statuses.pending')}</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [Dayjs | null,Dayjs | null] | null)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Space>
              <Button icon={<SearchOutlined />} type="primary" onClick={() => fetchLogs()}>
                {t('common.search')}
              </Button>
              <Button onClick={handleReset}>{t('settings.reset')}</Button>
            </Space>
          </Col>
        </Row>

        <Row justify="end" style={{ marginBottom: 16 }}>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchLogs}>
              {t('common.refresh')}
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              {t('auditLog.export')}
            </Button>
            <Popconfirm
              title={t('auditLog.cleanupConfirm')}
              onConfirm={handleCleanup}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button icon={<DeleteOutlined />}>
                {t('auditLog.cleanup')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('auditLog.clearConfirm')}
              onConfirm={handleClear}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button icon={<ClearOutlined />} danger>
                {t('auditLog.clear')}
              </Button>
            </Popconfirm>
          </Space>
        </Row>

        <Table
          columns={columns}
          dataSource={data.logs}
          rowKey="id"
          loading={loading}
          pagination={{
            current: data.page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('auditLog.totalCount').replace('{{count}}', String(total)),
            pageSizeOptions: ['20', '50', '100', '200']
          }}
          onChange={(pagination) => {
            setData(prev => ({
              ...prev,
              page: pagination.current || 1,
              pageSize: pagination.pageSize || 50
            }))
          }}
          size="middle"
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  )
}

export default AuditLog

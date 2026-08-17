import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Modal,
  message,
  Popconfirm,
  Drawer,
  Select,
  Input,
  Tooltip
} from 'antd'
import {
  RollbackOutlined,
  HistoryOutlined,
  DiffOutlined,
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import { DiffEditor } from '@monaco-editor/react'

const { Title, Text } = Typography
const { Option } = Select

interface DeployHistoryRecord {
  id: string
  appId: string
  appName: string
  serverId: string
  version: number
  dockerCompose: string
  envVariables: string | null
  deployedAt: string
  status: string
}

interface AppOption {
  id: string
  name: string
}

const statusColorMap: Record<string, string> = {
  success: 'success',
  failure: 'error',
  pending: 'processing'
}

const DeployHistory: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DeployHistoryRecord[]>([])
  const [filteredData, setFilteredData] = useState<DeployHistoryRecord[]>([])
  const [searchText, setSearchText] = useState('')
  const [appIdFilter, setAppIdFilter] = useState<string | undefined>()
  const [apps, setApps] = useState<AppOption[]>([])
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null)

  // Diff modal state
  const [diffVisible, setDiffVisible] = useState(false)
  const [diffRecord, setDiffRecord] = useState<DeployHistoryRecord | null>(null)
  const [compareRecord, setCompareRecord] = useState<DeployHistoryRecord | null>(null)
  const [compareVersion, setCompareVersion] = useState<number | undefined>()
  const [availableVersions, setAvailableVersions] = useState<DeployHistoryRecord[]>([])

  // Preview drawer state
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewRecord, setPreviewRecord] = useState<DeployHistoryRecord | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.deployHistory.getAll()
      setData(result)
      setFilteredData(result)
    } catch (error) {
      message.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchApps = useCallback(async () => {
    try {
      const result = await window.electronAPI.app.getAll()
      setApps(result.map(app => ({ id: app.id, name: app.name })))
    } catch (error) {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchHistory()
    fetchApps()
  }, [fetchHistory, fetchApps])

  useEffect(() => {
    let filtered = data
    if (appIdFilter) {
      filtered = filtered.filter(item => item.appId === appIdFilter)
    }
    if (searchText) {
      const search = searchText.toLowerCase()
      filtered = filtered.filter(item =>
        item.appName.toLowerCase().includes(search) ||
        item.serverId.toLowerCase().includes(search)
      )
    }
    setFilteredData(filtered)
  }, [data, appIdFilter, searchText])

  const handleRollback = async (historyId: string) => {
    setRollbackLoading(historyId)
    try {
      const result = await window.electronAPI.deployHistory.rollback(historyId)
      if (result.success) {
        message.success(t('deployHistory.rollbackSuccess').replace('{{version}}', ''))
        fetchHistory()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error(t('common.error'))
    } finally {
      setRollbackLoading(null)
    }
  }

  const handleShowDiff = (record: DeployHistoryRecord) => {
    setDiffRecord(record)
    // 获取同一应用的其他版本
    const sameAppVersions = data.filter(item => item.appId === record.appId && item.id !== record.id)
    setAvailableVersions(sameAppVersions)
    setCompareVersion(undefined)
    setCompareRecord(null)
    setDiffVisible(true)
  }

  const handleCompareSelect = (version: number) => {
    const record = availableVersions.find(v => v.version === version)
    setCompareRecord(record || null)
    setCompareVersion(version)
  }

  const handlePreview = (record: DeployHistoryRecord) => {
    setPreviewRecord(record)
    setPreviewVisible(true)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const columns: ColumnsType<DeployHistoryRecord> = [
    {
      title: t('deployHistory.version'),
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (value: number) => (
        <Tag color="blue">v{value}</Tag>
      )
    },
    {
      title: t('deployHistory.appName'),
      dataIndex: 'appName',
      key: 'appName',
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={value}>
          <span>{value}</span>
        </Tooltip>
      )
    },
    {
      title: t('deployHistory.deployedAt'),
      dataIndex: 'deployedAt',
      key: 'deployedAt',
      width: 180,
      render: (value: string) => (
        <Text style={{ fontSize: 12 }}>{formatDate(value)}</Text>
      )
    },
    {
      title: t('deployHistory.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={statusColorMap[value] || 'default'}>
          {t(`deployHistory.statuses.${value}`, { defaultValue: value })}
        </Tag>
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title={t('deployHistory.preview')}>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
          <Tooltip title={t('deployHistory.compare')}>
            <Button
              type="text"
              size="small"
              icon={<DiffOutlined />}
              onClick={() => handleShowDiff(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('deployHistory.rollbackConfirm').replace('{{version}}', String(record.version))}
            onConfirm={() => handleRollback(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="text"
              size="small"
              icon={<RollbackOutlined />}
              loading={rollbackLoading === record.id}
              danger
            >
              {t('deployHistory.rollback')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>
            <HistoryOutlined style={{ marginRight: 8 }} />
            {t('deployHistory.title')}
          </Title>
        </div>
      </div>

      <Card>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder={t('deployHistory.searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              placeholder={t('deployHistory.appFilter')}
              value={appIdFilter}
              onChange={setAppIdFilter}
              allowClear
              style={{ width: '100%' }}
            >
              {apps.map(app => (
                <Option key={app.id} value={app.id}>
                  {app.name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Button icon={<ReloadOutlined />} onClick={fetchHistory}>
              {t('common.refresh')}
            </Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('auditLog.totalCount').replace('{{count}}', String(total)),
            pageSizeOptions: ['20', '50', '100']
          }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Diff 对比弹窗 */}
      <Modal
        title={t('deployHistory.compareTitle')}
        open={diffVisible}
        onCancel={() => setDiffVisible(false)}
        width={900}
        footer={null}
      >
        {diffRecord && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Text strong>{t('deployHistory.currentVersion')}: v{diffRecord.version}</Text>
              </Col>
              <Col span={12}>
                <Space>
                  <Text strong>{t('deployHistory.compareWith')}:</Text>
                  <Select
                    placeholder={t('deployHistory.selectVersion')}
                    value={compareVersion}
                    onChange={handleCompareSelect}
                    style={{ width: 150 }}
                  >
                    {availableVersions.map(v => (
                      <Option key={v.id} value={v.version}>
                        v{v.version}
                      </Option>
                    ))}
                  </Select>
                </Space>
              </Col>
            </Row>
            {compareRecord ? (
              <div style={{ height: 400, border: '1px solid #d9d9d9' }}>
                <DiffEditor
                  height="400px"
                  language="yaml"
                  original={compareRecord.dockerCompose}
                  modified={diffRecord.dockerCompose}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    renderSideBySide: true
                  }}
                />
              </div>
            ) : (
              <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #d9d9d9' }}>
                <Text type="secondary">{t('deployHistory.selectVersionHint')}</Text>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 预览抽屉 */}
      <Drawer
        title={t('deployHistory.previewTitle')}
        placement="right"
        width={600}
        open={previewVisible}
        onClose={() => setPreviewVisible(false)}
      >
        {previewRecord && (
          <div>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Text strong>{t('deployHistory.version')}: </Text>
                <Tag color="blue">v{previewRecord.version}</Tag>
              </Col>
              <Col span={12}>
                <Text strong>{t('deployHistory.status')}: </Text>
                <Tag color={statusColorMap[previewRecord.status] || 'default'}>
                  {t(`deployHistory.statuses.${previewRecord.status}`, { defaultValue: previewRecord.status })}
                </Tag>
              </Col>
              <Col span={24}>
                <Text strong>{t('deployHistory.appName')}: </Text>
                <Text>{previewRecord.appName}</Text>
              </Col>
              <Col span={24}>
                <Text strong>{t('deployHistory.deployedAt')}: </Text>
                <Text>{formatDate(previewRecord.deployedAt)}</Text>
              </Col>
            </Row>
            <Text strong>{t('deployHistory.dockerCompose')}:</Text>
            <pre style={{
              background: '#f5f5f5',
              padding: 16,
              borderRadius: 8,
              maxHeight: 500,
              overflow: 'auto',
              fontSize: 12,
              marginTop: 8
            }}>
              {previewRecord.dockerCompose}
            </pre>
            {previewRecord.envVariables && (
              <>
                <Text strong style={{ display: 'block', marginTop: 16 }}>{t('deployHistory.envVariables')}:</Text>
                <pre style={{
                  background: '#f5f5f5',
                  padding: 16,
                  borderRadius: 8,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 12,
                  marginTop: 8
                }}>
                  {(() => {
                    try {
                      const envs = JSON.parse(previewRecord.envVariables)
                      return envs.map((e: { name: string; value: string }) => `${e.name}=${e.value}`).join('\n')
                    } catch {
                      return previewRecord.envVariables
                    }
                  })()}
                </pre>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default DeployHistory

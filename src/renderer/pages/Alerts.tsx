import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Checkbox,
  message,
  Typography,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Tabs,
  Tooltip,
  Badge,
  Empty
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  AlertOutlined,
  BellOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography
const { Option } = Select

interface AlertRule {
  id: string
  name: string
  ruleType: string
  serverId?: string
  appId?: string
  threshold?: number
  enabled: boolean
  notifyChannels: string[]
  createdAt: string
  updatedAt: string
}

interface AlertHistoryEntry {
  id: string
  ruleId: string
  ruleName: string
  alertType: string
  message: string
  severity: string
  status: string
  triggeredAt: string
  resolvedAt?: string
}

interface AlertStats {
  totalRules: number
  activeRules: number
  activeAlerts: number
  totalAlerts: number
}

const ruleTypeLabels: Record<string, string> = {
  container_exit: '容器退出',
  container_restart_loop: '重启循环',
  high_cpu: 'CPU 过高',
  high_memory: '内存过高',
  high_disk: '磁盘过高'
}

const ruleTypeColors: Record<string, string> = {
  container_exit: 'red',
  container_restart_loop: 'orange',
  high_cpu: 'blue',
  high_memory: 'purple',
  high_disk: 'cyan'
}

const severityColors: Record<string, string> = {
  info: 'blue',
  warning: 'orange',
  critical: 'red'
}

const severityLabels: Record<string, string> = {
  info: '信息',
  warning: '警告',
  critical: '严重'
}

const Alerts: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<AlertRule[]>([])
  const [history, setHistory] = useState<AlertHistoryEntry[]>([])
  const [stats, setStats] = useState<AlertStats>({ totalRules: 0, activeRules: 0, activeAlerts: 0, totalAlerts: 0 })
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [activeTab, setActiveTab] = useState('rules')
  const [form] = Form.useForm()

  const fetchRules = useCallback(async () => {
    try {
      const result = await window.electronAPI.alertRule.getAll()
      setRules(result)
    } catch (error) {
      message.error(t('common.error'))
    }
  }, [t])

  const fetchHistory = useCallback(async () => {
    try {
      const result = await window.electronAPI.alertHistory.getAll(100)
      setHistory(result)
    } catch (error) {
      message.error(t('common.error'))
    }
  }, [t])

  const fetchStats = useCallback(async () => {
    try {
      const result = await window.electronAPI.alert.getStats()
      setStats(result)
    } catch (error) {
      // silent
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([fetchRules(), fetchHistory(), fetchStats()])
    } finally {
      setLoading(false)
    }
  }, [fetchRules, fetchHistory, fetchStats])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleCreateRule = () => {
    setEditingRule(null)
    form.resetFields()
    form.setFieldsValue({
      enabled: true,
      notifyChannels: ['system'],
      ruleType: 'high_cpu',
      threshold: 80
    })
    setModalVisible(true)
  }

  const handleEditRule = (rule: AlertRule) => {
    setEditingRule(rule)
    form.setFieldsValue({
      ...rule,
      notifyChannels: rule.notifyChannels || ['system']
    })
    setModalVisible(true)
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await window.electronAPI.alertRule.delete(id)
      message.success(t('common.success'))
      fetchRules()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleToggleRule = async (id: string, enabled: boolean) => {
    try {
      await window.electronAPI.alertRule.toggle(id, enabled)
      fetchRules()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingRule) {
        await window.electronAPI.alertRule.update(editingRule.id, values)
        message.success(t('common.success'))
      } else {
        await window.electronAPI.alertRule.create(values)
        message.success(t('common.success'))
      }
      setModalVisible(false)
      fetchRules()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleResolveAlert = async (id: string) => {
    try {
      await window.electronAPI.alertHistory.resolve(id)
      message.success(t('common.success'))
      fetchHistory()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleResolveAll = async () => {
    try {
      await window.electronAPI.alertHistory.resolveAll()
      message.success(t('common.success'))
      fetchHistory()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleDeleteAlert = async (id: string) => {
    try {
      await window.electronAPI.alertHistory.delete(id)
      message.success(t('common.success'))
      fetchHistory()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleClearHistory = async () => {
    try {
      await window.electronAPI.alertHistory.clear()
      message.success(t('common.success'))
      fetchHistory()
      fetchStats()
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const ruleColumns: ColumnsType<AlertRule> = [
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Text strong>{value}</Text>
    },
    {
      title: '规则类型',
      dataIndex: 'ruleType',
      key: 'ruleType',
      width: 140,
      render: (value: string) => (
        <Tag color={ruleTypeColors[value] || 'default'}>
          {ruleTypeLabels[value] || value}
        </Tag>
      )
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      width: 100,
      render: (value: number | null, record: AlertRule) => {
        if (value === null || value === undefined) return '-'
        if (record.ruleType === 'high_cpu' || record.ruleType === 'high_memory' || record.ruleType === 'high_disk') {
          return `${value}%`
        }
        return value
      }
    },
    {
      title: '通知渠道',
      dataIndex: 'notifyChannels',
      key: 'notifyChannels',
      width: 150,
      render: (value: string[]) => (
        <Space>
          {value?.includes('system') && <Tag color="blue">系统通知</Tag>}
          {value?.includes('webhook') && <Tag color="green">Webhook</Tag>}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (value: boolean, record: AlertRule) => (
        <Switch
          checked={value}
          onChange={(checked) => handleToggleRule(record.id, checked)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => (
        <Text style={{ fontSize: 12 }}>
          {new Date(value).toLocaleString('zh-CN')}
        </Text>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record: AlertRule) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => handleEditRule(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该规则吗？"
            onConfirm={() => handleDeleteRule(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const historyColumns: ColumnsType<AlertHistoryEntry> = [
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (value: string) => (
        <Tag color={severityColors[value] || 'default'}>
          {severityLabels[value] || value}
        </Tag>
      )
    },
    {
      title: '规则名称',
      dataIndex: 'ruleName',
      key: 'ruleName',
      render: (value: string) => <Text strong>{value}</Text>
    },
    {
      title: '告警消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={value}>
          <span>{value}</span>
        </Tooltip>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: string) => (
        <Badge
          status={value === 'active' ? 'processing' : 'success'}
          text={value === 'active' ? '活动中' : '已解决'}
        />
      )
    },
    {
      title: '触发时间',
      dataIndex: 'triggeredAt',
      key: 'triggeredAt',
      width: 180,
      render: (value: string) => (
        <Text style={{ fontSize: 12 }}>
          {new Date(value).toLocaleString('zh-CN')}
        </Text>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, record: AlertHistoryEntry) => (
        <Space>
          {record.status === 'active' && (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleResolveAlert(record.id)}
            >
              解决
            </Button>
          )}
          <Popconfirm
            title="确定删除该记录吗？"
            onConfirm={() => handleDeleteAlert(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const ruleType = Form.useWatch('ruleType', form)
  const showThreshold = ['high_cpu', 'high_memory', 'high_disk'].includes(ruleType)

  const tabItems = [
    {
      key: 'rules',
      label: (
        <span>
          <SettingOutlined />
          告警规则
        </span>
      ),
      children: (
        <div>
          <Row justify="space-between" style={{ marginBottom: 16 }}>
            <Col>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateRule}
              >
                创建规则
              </Button>
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={fetchAll}>
                {t('common.refresh')}
              </Button>
            </Col>
          </Row>
          {rules.length === 0 ? (
            <Empty
              description="暂无告警规则"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={handleCreateRule}>
                创建第一个规则
              </Button>
            </Empty>
          ) : (
            <Table
              columns={ruleColumns}
              dataSource={rules}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条规则`
              }}
              size="middle"
              scroll={{ x: 900 }}
            />
          )}
        </div>
      )
    },
    {
      key: 'history',
      label: (
        <span>
          <Badge count={stats.activeAlerts} size="small">
            <BellOutlined />
            告警历史
          </Badge>
        </span>
      ),
      children: (
        <div>
          <Row justify="space-between" style={{ marginBottom: 16 }}>
            <Col>
              <Space>
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={handleResolveAll}
                  disabled={stats.activeAlerts === 0}
                >
                  全部解决
                </Button>
                <Popconfirm
                  title="确定清空所有告警历史吗？"
                  onConfirm={handleClearHistory}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                >
                  <Button icon={<ClearOutlined />} danger>
                    清空历史
                  </Button>
                </Popconfirm>
              </Space>
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={fetchAll}>
                {t('common.refresh')}
              </Button>
            </Col>
          </Row>
          {history.length === 0 ? (
            <Empty
              description="暂无告警记录"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Table
              columns={historyColumns}
              dataSource={history}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条记录`
              }}
              size="middle"
              scroll={{ x: 900 }}
            />
          )}
        </div>
      )
    }
  ]

  return (
    <div>
      <Title level={4}>
        <BellOutlined style={{ marginRight: 8 }} />
        告警管理
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="总规则数"
              value={stats.totalRules}
              prefix={<SettingOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="启用规则"
              value={stats.activeRules}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="活动告警"
              value={stats.activeAlerts}
              valueStyle={{ color: stats.activeAlerts > 0 ? '#cf1322' : '#3f8600' }}
              prefix={stats.activeAlerts > 0 ? <AlertOutlined /> : <CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="总告警数"
              value={stats.totalAlerts}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      <Modal
        title={editingRule ? '编辑告警规则' : '创建告警规则'}
        open={modalVisible}
        onOk={handleFormSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: true,
            notifyChannels: ['system'],
            ruleType: 'high_cpu',
            threshold: 80
          }}
        >
          <Form.Item
            label="规则名称"
            name="name"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="请输入规则名称" />
          </Form.Item>

          <Form.Item
            label="规则类型"
            name="ruleType"
            rules={[{ required: true, message: '请选择规则类型' }]}
          >
            <Select placeholder="请选择规则类型">
              <Option value="container_exit">容器退出</Option>
              <Option value="container_restart_loop">重启循环</Option>
              <Option value="high_cpu">CPU 使用率过高</Option>
              <Option value="high_memory">内存使用率过高</Option>
              <Option value="high_disk">磁盘使用率过高</Option>
            </Select>
          </Form.Item>

          {showThreshold && (
            <Form.Item
              label="阈值 (%)"
              name="threshold"
              rules={[{ required: true, message: '请输入阈值' }]}
            >
              <InputNumber
                min={1}
                max={100}
                style={{ width: '100%' }}
                placeholder="请输入阈值 (1-100)"
              />
            </Form.Item>
          )}

          <Form.Item
            label="通知渠道"
            name="notifyChannels"
            rules={[{ required: true, message: '请选择通知渠道' }]}
          >
            <Checkbox.Group>
              <Checkbox value="system">系统通知</Checkbox>
              <Checkbox value="webhook">Webhook</Checkbox>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item
            label="启用规则"
            name="enabled"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Alerts

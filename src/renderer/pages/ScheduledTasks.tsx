import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Popconfirm,
  message,
  Typography,
  Row,
  Col,
  Tooltip,
  Switch,
  Modal,
  Form,
  Descriptions,
  Badge
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

type ScheduledTaskType = 'restart_container' | 'update_container' | 'backup_database' | 'backup_volume' | 'cleanup_images' | 'cleanup_volumes'

interface ScheduledTask {
  id: string
  name: string
  description: string | null
  taskType: ScheduledTaskType
  cronExpression: string
  serverId: string
  appId: string | null
  enabled: number
  lastRun: string | null
  lastStatus: string | null
  createdAt: string
  updatedAt: string
}

interface Server {
  id: string
  name: string
  host: string
}

interface App {
  id: string
  name: string
  serverId: string
}

const taskTypeColorMap: Record<ScheduledTaskType, string> = {
  restart_container: 'blue',
  update_container: 'purple',
  backup_database: 'green',
  backup_volume: 'cyan',
  cleanup_images: 'orange',
  cleanup_volumes: 'gold'
}

const statusColorMap: Record<string, string> = {
  success: 'success',
  failure: 'error'
}

const ScheduledTasks: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [servers, setServers] = useState<Server[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [form] = Form.useForm()
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.scheduledTask.getAll()
      setTasks(result)
    } catch (error) {
      message.error(t('scheduledTasks.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchServers = useCallback(async () => {
    try {
      const result = await window.electronAPI.server.getAll()
      setServers(result)
    } catch (error) {
      console.error('Failed to fetch servers:', error)
    }
  }, [])

  const fetchApps = useCallback(async () => {
    try {
      const result = await window.electronAPI.app.getAll()
      setApps(result)
    } catch (error) {
      console.error('Failed to fetch apps:', error)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchServers()
    fetchApps()
  }, [fetchTasks, fetchServers, fetchApps])

  const handleCreate = () => {
    setEditingTask(null)
    form.resetFields()
    form.setFieldsValue({ enabled: true })
    setModalVisible(true)
  }

  const handleEdit = (task: ScheduledTask) => {
    setEditingTask(task)
    form.setFieldsValue({
      name: task.name,
      description: task.description,
      taskType: task.taskType,
      cronExpression: task.cronExpression,
      serverId: task.serverId,
      appId: task.appId,
      enabled: task.enabled === 1
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.scheduledTask.delete(id)
      message.success(t('scheduledTasks.deleteSuccess'))
      fetchTasks()
    } catch (error) {
      message.error(t('scheduledTasks.deleteFailed'))
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await window.electronAPI.scheduledTask.toggle(id, enabled)
      message.success(enabled ? t('scheduledTasks.enableSuccess') : t('scheduledTasks.disableSuccess'))
      fetchTasks()
    } catch (error) {
      message.error(t('scheduledTasks.toggleFailed'))
    }
  }

  const handleRunNow = async (id: string) => {
    try {
      const result = await window.electronAPI.scheduledTask.runNow(id)
      if (result.success) {
        message.success(t('scheduledTasks.runSuccess'))
      } else {
        message.error(result.message)
      }
      fetchTasks()
    } catch (error) {
      message.error(t('scheduledTasks.runFailed'))
    }
  }

  const handleViewDetail = (task: ScheduledTask) => {
    setSelectedTask(task)
    setDetailModalVisible(true)
  }

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields()
      const taskData = {
        name: values.name,
        description: values.description || '',
        taskType: values.taskType,
        cronExpression: values.cronExpression,
        serverId: values.serverId,
        appId: values.appId || undefined,
        enabled: values.enabled !== undefined ? values.enabled : true
      }

      if (editingTask) {
        await window.electronAPI.scheduledTask.update(editingTask.id, taskData)
        message.success(t('scheduledTasks.updateSuccess'))
      } else {
        await window.electronAPI.scheduledTask.create(taskData)
        message.success(t('scheduledTasks.createSuccess'))
      }

      setModalVisible(false)
      fetchTasks()
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const getServerName = (serverId: string) => {
    const server = servers.find(s => s.id === serverId)
    return server ? `${server.name} (${server.host})` : serverId
  }

  const getAppName = (appId: string | null) => {
    if (!appId) return '-'
    const app = apps.find(a => a.id === appId)
    return app ? app.name : appId
  }

  const filteredApps = (serverId: string) => {
    return apps.filter(a => a.serverId === serverId)
  }

  const columns: ColumnsType<ScheduledTask> = [
    {
      title: t('scheduledTasks.name'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string, record: ScheduledTask) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
          )}
        </Space>
      )
    },
    {
      title: t('scheduledTasks.taskType'),
      dataIndex: 'taskType',
      key: 'taskType',
      width: 150,
      render: (taskType: ScheduledTaskType) => (
        <Tag color={taskTypeColorMap[taskType]}>
          {t(`scheduledTasks.types.${taskType}`)}
        </Tag>
      )
    },
    {
      title: t('scheduledTasks.cronExpression'),
      dataIndex: 'cronExpression',
      key: 'cronExpression',
      width: 150,
      render: (cron: string) => (
        <Space>
          <ClockCircleOutlined />
          <Text code>{cron}</Text>
        </Space>
      )
    },
    {
      title: t('scheduledTasks.target'),
      key: 'target',
      width: 200,
      render: (_: unknown, record: ScheduledTask) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>
            {t('scheduledTasks.server')}: {getServerName(record.serverId)}
          </Text>
          {(record.taskType === 'restart_container' || record.taskType === 'update_container') && record.appId && (
            <Text style={{ fontSize: 12 }}>
              {t('scheduledTasks.app')}: {getAppName(record.appId)}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: t('scheduledTasks.lastRun'),
      dataIndex: 'lastRun',
      key: 'lastRun',
      width: 160,
      render: (lastRun: string | null, record: ScheduledTask) => (
        <Space direction="vertical" size={0}>
          {lastRun ? (
            <>
              <Text style={{ fontSize: 12 }}>
                {new Date(lastRun).toLocaleString()}
              </Text>
              {record.lastStatus && (
                <Tag color={statusColorMap[record.lastStatus] || 'default'} style={{ fontSize: 11 }}>
                  {record.lastStatus === 'success' ? (
                    <><CheckCircleOutlined /> {t('common.success')}</>
                  ) : (
                    <><CloseCircleOutlined /> {t('common.error')}</>
                  )}
                </Tag>
              )}
            </>
          ) : (
            <Text type="secondary">-</Text>
          )}
        </Space>
      )
    },
    {
      title: t('scheduledTasks.enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: number, record: ScheduledTask) => (
        <Switch
          checked={enabled === 1}
          onChange={(checked) => handleToggle(record.id, checked)}
          size="small"
        />
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 150,
      render: (_: unknown, record: ScheduledTask) => (
        <Space size="small">
          <Tooltip title={t('scheduledTasks.runNow')}>
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              onClick={() => handleRunNow(record.id)}
              size="small"
            />
          </Tooltip>
          <Tooltip title={t('scheduledTasks.viewDetail')}>
            <Button
              type="text"
              icon={<ClockCircleOutlined />}
              onClick={() => handleViewDetail(record.id)}
              size="small"
            />
          </Tooltip>
          <Tooltip title={t('common.edit')}>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              size="small"
            />
          </Tooltip>
          <Popconfirm
            title={t('scheduledTasks.deleteConfirm')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('common.delete')}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const cronPresets = [
    { label: t('scheduledTasks.presets.everyMinute'), value: '* * * * *' },
    { label: t('scheduledTasks.presets.every5Minutes'), value: '*/5 * * * *' },
    { label: t('scheduledTasks.presets.every15Minutes'), value: '*/15 * * * *' },
    { label: t('scheduledTasks.presets.every30Minutes'), value: '*/30 * * * *' },
    { label: t('scheduledTasks.presets.everyHour'), value: '0 * * * *' },
    { label: t('scheduledTasks.presets.every6Hours'), value: '0 */6 * * *' },
    { label: t('scheduledTasks.presets.every12Hours'), value: '0 */12 * * *' },
    { label: t('scheduledTasks.presets.daily'), value: '0 0 * * *' },
    { label: t('scheduledTasks.presets.weekly'), value: '0 0 * * 0' },
    { label: t('scheduledTasks.presets.monthly'), value: '0 0 1 * *' }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>
            {t('scheduledTasks.title')}
            <Badge
              count={tasks.filter(t => t.enabled === 1).length}
              style={{ marginLeft: 8, backgroundColor: '#52c41a' }}
            />
          </Title>
        </div>
        <div className="page-header-right">
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchTasks}
          >
            {t('common.refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            {t('scheduledTasks.add')}
          </Button>
        </div>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => t('common.totalCount', { count: total })
          }}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* 创建/编辑任务 Modal */}
      <Modal
        title={editingTask ? t('scheduledTasks.edit') : t('scheduledTasks.add')}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
        >
          <Form.Item
            name="name"
            label={t('scheduledTasks.name')}
            rules={[{ required: true, message: t('scheduledTasks.nameRequired') }]}
          >
            <Input placeholder={t('scheduledTasks.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('scheduledTasks.description')}
          >
            <TextArea
              rows={2}
              placeholder={t('scheduledTasks.descriptionPlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="taskType"
            label={t('scheduledTasks.taskType')}
            rules={[{ required: true, message: t('scheduledTasks.taskTypeRequired') }]}
          >
            <Select placeholder={t('scheduledTasks.taskTypePlaceholder')}>
              <Option value="restart_container">{t('scheduledTasks.types.restart_container')}</Option>
              <Option value="update_container">{t('scheduledTasks.types.update_container')}</Option>
              <Option value="backup_database">{t('scheduledTasks.types.backup_database')}</Option>
              <Option value="backup_volume">{t('scheduledTasks.types.backup_volume')}</Option>
              <Option value="cleanup_images">{t('scheduledTasks.types.cleanup_images')}</Option>
              <Option value="cleanup_volumes">{t('scheduledTasks.types.cleanup_volumes')}</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="cronExpression"
            label={t('scheduledTasks.cronExpression')}
            rules={[
              { required: true, message: t('scheduledTasks.cronRequired') },
              {
                pattern: /^(\*|\d+) (\*|\d+) (\*|\d+) (\*|\d+) (\*|\d+)$/,
                message: t('scheduledTasks.cronInvalid')
              }
            ]}
          >
            <Input
              placeholder={t('scheduledTasks.cronPlaceholder')}
              addonAfter={
                <Select
                  bordered={false}
                  placeholder={t('scheduledTasks.presets.label')}
                  onChange={(value) => form.setFieldsValue({ cronExpression: value })}
                  style={{ width: 140 }}
                >
                  {cronPresets.map(preset => (
                    <Option key={preset.value} value={preset.value}>
                      {preset.label}
                    </Option>
                  ))}
                </Select>
              }
            />
          </Form.Item>

          <Form.Item
            name="serverId"
            label={t('scheduledTasks.server')}
            rules={[{ required: true, message: t('scheduledTasks.serverRequired') }]}
          >
            <Select
              placeholder={t('scheduledTasks.serverPlaceholder')}
              onChange={() => form.setFieldsValue({ appId: undefined })}
            >
              {servers.map(server => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.host})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.taskType !== curr.taskType}
          >
            {({ getFieldValue }) => {
              const taskType = getFieldValue('taskType')
              if (taskType === 'restart_container' || taskType === 'update_container') {
                return (
                  <Form.Item
                    name="appId"
                    label={t('scheduledTasks.app')}
                    rules={[{ required: true, message: t('scheduledTasks.appRequired') }]}
                  >
                    <Select placeholder={t('scheduledTasks.appPlaceholder')}>
                      {filteredApps(getFieldValue('serverId')).map(app => (
                        <Option key={app.id} value={app.id}>
                          {app.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                )
              }
              return null
            }}
          </Form.Item>

          <Form.Item
            name="enabled"
            label={t('scheduledTasks.enabled')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 任务详情 Modal */}
      <Modal
        title={t('scheduledTasks.detail')}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={600}
      >
        {selectedTask && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('scheduledTasks.name')}>
              {selectedTask.name}
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.description')}>
              {selectedTask.description || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.taskType')}>
              <Tag color={taskTypeColorMap[selectedTask.taskType as ScheduledTaskType]}>
                {t(`scheduledTasks.types.${selectedTask.taskType}`)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.cronExpression')}>
              <Text code>{selectedTask.cronExpression}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.server')}>
              {getServerName(selectedTask.serverId)}
            </Descriptions.Item>
            {selectedTask.appId && (
              <Descriptions.Item label={t('scheduledTasks.app')}>
                {getAppName(selectedTask.appId)}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('scheduledTasks.lastRun')}>
              {selectedTask.lastRun ? new Date(selectedTask.lastRun).toLocaleString() : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.lastStatus')}>
              {selectedTask.lastStatus ? (
                <Tag color={statusColorMap[selectedTask.lastStatus] || 'default'}>
                  {selectedTask.lastStatus}
                </Tag>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.enabled')}>
              {selectedTask.enabled === 1 ? (
                <Tag color="success">{t('common.yes')}</Tag>
              ) : (
                <Tag color="default">{t('common.no')}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.createdAt')}>
              {new Date(selectedTask.createdAt).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label={t('scheduledTasks.updatedAt')}>
              {new Date(selectedTask.updatedAt).toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default ScheduledTasks

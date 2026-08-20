import React, { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Transfer,
  Spin,
  Empty,
  Badge,
  Row,
  Col,
  Alert
} from 'antd'
import { useTranslation } from 'react-i18next'
import {
  TeamOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CloudServerOutlined,
  UserOutlined
} from '@ant-design/icons'
import type { Server } from '../../types/server'

const { Title, Text, Paragraph } = Typography

interface ServerGroup {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  serverCount?: number
}

const ServerGroups: React.FC = () => {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<ServerGroup[]>([])
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [memberModalVisible, setMemberModalVisible] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ServerGroup | null>(null)
  const [currentGroup, setCurrentGroup] = useState<ServerGroup | null>(null)
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [groupsData, serversData] = await Promise.all([
        window.electronAPI.serverGroup.getAll(),
        window.electronAPI.server.getAll()
      ])
      setGroups(groupsData)
      setServers(serversData)
    } catch (error) {
      console.error('Failed to load data:', error)
      message.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingGroup(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (group: ServerGroup) => {
    setEditingGroup(group)
    form.setFieldsValue({
      name: group.name,
      description: group.description || ''
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.serverGroup.delete(id)
      message.success(t('common.success'))
      loadData()
    } catch (error) {
      console.error('Failed to delete group:', error)
      message.error(t('common.error'))
    }
  }

  const handleModalSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      if (editingGroup) {
        await window.electronAPI.serverGroup.update(editingGroup.id, values)
        message.success(t('common.success'))
      } else {
        await window.electronAPI.serverGroup.create(values)
        message.success(t('common.success'))
      }

      setModalVisible(false)
      loadData()
    } catch (error) {
      console.error('Failed to save group:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleManageMembers = async (group: ServerGroup) => {
    setCurrentGroup(group)
    try {
      const groupServers = await window.electronAPI.serverGroup.getServers(group.id)
      setSelectedServerIds(groupServers.map(s => s.id))
      setMemberModalVisible(true)
    } catch (error) {
      console.error('Failed to load group members:', error)
    }
  }

  const handleMemberSubmit = async () => {
    if (!currentGroup) return

    setSubmitting(true)
    try {
      // Get current members
      const currentMembers = await window.electronAPI.serverGroup.getServers(currentGroup.id)
      const currentIds = currentMembers.map(s => s.id)

      // Calculate additions and removals
      const toAdd = selectedServerIds.filter(id => !currentIds.includes(id))
      const toRemove = currentIds.filter(id => !selectedServerIds.includes(id))

      // Execute changes
      for (const serverId of toAdd) {
        await window.electronAPI.serverGroup.addServer(currentGroup.id, serverId)
      }
      for (const serverId of toRemove) {
        await window.electronAPI.serverGroup.removeServer(currentGroup.id, serverId)
      }

      message.success(t('serverGroup.membersUpdated'))
      setMemberModalVisible(false)
      loadData()
    } catch (error) {
      console.error('Failed to update members:', error)
      message.error(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: t('serverGroup.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <TeamOutlined style={{ color: '#007AFF' }} />
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: t('serverGroup.description'),
      dataIndex: 'description',
      key: 'description',
      render: (text: string | null) => text || <Text type="secondary">-</Text>
    },
    {
      title: t('serverGroup.serverCount'),
      dataIndex: 'serverCount',
      key: 'serverCount',
      render: (count: number) => (
        <Badge count={count || 0} showZero style={{ backgroundColor: '#34C759' }} />
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ServerGroup) => (
        <Space>
          <Button
            type="link"
            icon={<UserOutlined />}
            onClick={() => handleManageMembers(record)}
          >
            {t('serverGroup.manageMembers')}
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('serverGroup.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={3} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 8 }} />
            {t('serverGroup.title')}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>{t('serverGroup.description')}</Paragraph>
        </div>
        <div className="page-header-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('serverGroup.create')}
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        locale={{ emptyText: <Empty description={t('serverGroup.noGroups')} /> }}
        pagination={groups.length > 10 ? { pageSize: 10 } : false}
        scroll={{ x: 600 }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingGroup ? t('serverGroup.edit') : t('serverGroup.create')}
        open={modalVisible}
        onOk={handleModalSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('serverGroup.name')}
            rules={[{ required: true, message: t('serverGroup.nameRequired') }]}
          >
            <Input placeholder={t('serverGroup.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('serverGroup.description')}
          >
            <Input.TextArea
              rows={3}
              placeholder={t('serverGroup.descriptionPlaceholder')}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Members Modal */}
      <Modal
        title={t('serverGroup.manageMembers')}
        open={memberModalVisible}
        onOk={handleMemberSubmit}
        onCancel={() => setMemberModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={600}
      >
        {currentGroup && (
          <>
            <Alert
              type="info"
              showIcon
              message={t('serverGroup.currentGroup', { name: currentGroup.name })}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text strong>{t('serverGroup.availableServers')}</Text>
                <div style={{ marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
                  {servers.filter(s => !selectedServerIds.includes(s.id)).map(server => (
                    <div
                      key={server.id}
                      style={{
                        padding: '8px 12px',
                        marginBottom: 4,
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedServerIds([...selectedServerIds, server.id])}
                    >
                      <CloudServerOutlined style={{ marginRight: 8 }} />
                      {server.name}
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        ({server.host})
                      </Text>
                    </div>
                  ))}
                  {servers.filter(s => !selectedServerIds.includes(s.id)).length === 0 && (
                    <Text type="secondary">{t('serverGroup.noAvailableServers')}</Text>
                  )}
                </div>
              </Col>
              <Col span={12}>
                <Text strong>{t('serverGroup.groupMembers')}</Text>
                <div style={{ marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
                  {servers.filter(s => selectedServerIds.includes(s.id)).map(server => (
                    <div
                      key={server.id}
                      style={{
                        padding: '8px 12px',
                        marginBottom: 4,
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: '#f6ffed'
                      }}
                      onClick={() => setSelectedServerIds(selectedServerIds.filter(id => id !== server.id))}
                    >
                      <CloudServerOutlined style={{ marginRight: 8 }} />
                      {server.name}
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        ({server.host})
                      </Text>
                    </div>
                  ))}
                  {servers.filter(s => selectedServerIds.includes(s.id)).length === 0 && (
                    <Text type="secondary">{t('serverGroup.noMembers')}</Text>
                  )}
                </div>
              </Col>
            </Row>
          </>
        )}
      </Modal>
    </div>
  )
}

export default ServerGroups

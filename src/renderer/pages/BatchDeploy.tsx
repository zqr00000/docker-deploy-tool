import React, { useState, useEffect } from 'react'
import {
  Card,
  Select,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Row,
  Col,
  Progress,
  Alert,
  Checkbox,
  message,
  Spin,
  Collapse,
  Divider,
  Badge
} from 'antd'
import { useTranslation } from 'react-i18next'
import {
  CloudServerOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  TeamOutlined
} from '@ant-design/icons'
import type { Server } from '../types/server'
import type { Template } from '../types/template'

const { Title, Text } = Typography
const { TextArea } = Input
const { Panel } = Collapse

interface DeployResult {
  serverId: string
  serverName: string
  success: boolean
  message: string
  appId?: string
  containerIds?: string[]
}

const BatchDeploy: React.FC = () => {
  const { t } = useTranslation()
  const [servers, setServers] = useState<Server[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined)
  const [groups, setGroups] = useState<{ id: string; name: string; serverCount: number }[]>([])
  const [appName, setAppName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [dockerCompose, setDockerCompose] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
  const [deploying, setDeploying] = useState(false)
  const [results, setResults] = useState<DeployResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId)
      if (template) {
        setDockerCompose(template.dockerCompose)
        if (!appName) {
          setAppName(template.name.toLowerCase().replace(/\s+/g, '-'))
        }
        if (!projectPath) {
          setProjectPath(`/opt/docker-apps/${template.name.toLowerCase().replace(/\s+/g, '-')}`)
        }
      }
    }
  }, [selectedTemplateId, templates])

  const loadData = async () => {
    try {
      const [serversData, templatesData, groupsData] = await Promise.all([
        window.electronAPI.server.getAll(),
        window.electronAPI.template.getAll(),
        window.electronAPI.serverGroup.getAll()
      ])
      setServers(serversData)
      setTemplates(templatesData)
      setGroups(groupsData.map(g => ({ id: g.id, name: g.name, serverCount: g.serverCount || 0 })))
    } catch (error) {
      console.error('Failed to load data:', error)
      message.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleGroupSelect = async (groupId: string | undefined) => {
    setSelectedGroupId(groupId)
    if (groupId) {
      try {
        const groupServers = await window.electronAPI.serverGroup.getServers(groupId)
        setSelectedServerIds(groupServers.map(s => s.id))
      } catch (error) {
        console.error('Failed to load group servers:', error)
      }
    }
  }

  const handleDeploy = async () => {
    if (selectedServerIds.length === 0) {
      message.warning(t('batchDeploy.selectServersRequired'))
      return
    }
    if (!appName.trim()) {
      message.warning(t('batchDeploy.nameRequired'))
      return
    }
    if (!dockerCompose.trim()) {
      message.warning(t('batchDeploy.dockerComposeRequired'))
      return
    }

    setDeploying(true)
    setResults([])
    setShowResults(false)

    try {
      const result = await window.electronAPI.batch.deploy({
        serverIds: selectedServerIds,
        appName: appName.trim(),
        dockerCompose,
        projectPath: projectPath || `/opt/docker-apps/${appName}`,
        templateId: selectedTemplateId,
        parallelLimit: 3
      })

      setResults(result.results)
      setShowResults(true)

      if (result.success) {
        message.success(t('batchDeploy.deploySuccess', { count: result.successCount }))
      } else if (result.successCount > 0) {
        message.warning(t('batchDeploy.deployPartial', { success: result.successCount, total: result.totalServers }))
      } else {
        message.error(t('batchDeploy.deployFailed'))
      }
    } catch (error) {
      console.error('Batch deploy error:', error)
      message.error(t('batchDeploy.deployError'))
    } finally {
      setDeploying(false)
    }
  }

  const serverColumns = [
    {
      title: t('server.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Server) => (
        <Space>
          <CloudServerOutlined />
          <Text strong>{text}</Text>
          <Badge
            status={record.status === 'online' ? 'success' : 'default'}
            text={record.status === 'online' ? t('server.online') : t('server.offline')}
          />
        </Space>
      )
    },
    {
      title: t('server.host'),
      dataIndex: 'host',
      key: 'host',
      render: (_: string, record: Server) => (
        <Text code>{record.host}:{record.port}</Text>
      )
    },
    {
      title: t('server.username'),
      dataIndex: 'username',
      key: 'username'
    }
  ]

  const resultColumns = [
    {
      title: t('server.name'),
      dataIndex: 'serverName',
      key: 'serverName'
    },
    {
      title: t('common.status'),
      dataIndex: 'success',
      key: 'success',
      render: (success: boolean) =>
        success ? (
          <Tag icon={<CheckCircleOutlined />} color="success">{t('common.success')}</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">{t('common.error')}</Tag>
        )
    },
    {
      title: t('common.details'),
      dataIndex: 'message',
      key: 'message'
    }
  ]

  const selectedServers = servers.filter(s => selectedServerIds.includes(s.id))
  const onlineSelectedCount = selectedServers.filter(s => s.status === 'online').length

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
            <RocketOutlined style={{ marginRight: 8 }} />
            {t('batchDeploy.title')}
          </Title>
          <Text type="secondary">{t('batchDeploy.description')}</Text>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card title={t('batchDeploy.selectServers')} size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>{t('batchDeploy.selectGroup')}</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={t('batchDeploy.selectGroupPlaceholder')}
                  allowClear
                  value={selectedGroupId}
                  onChange={handleGroupSelect}
                  options={groups.map(g => ({
                    value: g.id,
                    label: `${g.name} (${g.serverCount} ${t('batchDeploy.servers')})`
                  }))}
                  notFoundContent={t('batchDeploy.noGroups')}
                />
              </div>

              <div>
                <Text strong>{t('batchDeploy.servers')} 
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({selectedServerIds.length} {t('batchDeploy.selected')})
                  </Text>
                </Text>
                <Table
                  style={{ marginTop: 8 }}
                  columns={serverColumns}
                  dataSource={servers}
                  rowKey="id"
                  size="small"
                  rowSelection={{
                    selectedRowKeys: selectedServerIds,
                    onChange: (keys) => setSelectedServerIds(keys as string[])
                  }}
                  pagination={{ pageSize: 5 }}
                  scroll={{ y: 240 }}
                />
              </div>

              {selectedServerIds.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  message={t('batchDeploy.onlineCount', { online: onlineSelectedCount, total: selectedServerIds.length })}
                />
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={t('batchDeploy.deployConfig')} size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>{t('batchDeploy.selectTemplate')}</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={t('batchDeploy.selectTemplatePlaceholder')}
                  allowClear
                  value={selectedTemplateId}
                  onChange={(value) => setSelectedTemplateId(value)}
                  options={templates.map(template => ({
                    value: template.id,
                    label: (
                      <Space>
                        {template.name}
                        {template.isBuiltIn && <Tag color="blue">{t('template.builtIn')}</Tag>}
                      </Space>
                    )
                  }))}
                />
              </div>

              <div>
                <Text strong>{t('app.name')} <Text type="danger">*</Text></Text>
                <Input
                  style={{ marginTop: 8 }}
                  placeholder={t('app.namePlaceholder')}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                />
              </div>

              <div>
                <Text strong>{t('app.projectPath')}</Text>
                <Input
                  style={{ marginTop: 8 }}
                  placeholder="/opt/docker-apps/my-app"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                />
              </div>

              <div>
                <Text strong>{t('app.dockerCompose')} <Text type="danger">*</Text></Text>
                <TextArea
                  style={{ marginTop: 8 }}
                  rows={10}
                  placeholder={t('app.dockerComposePlaceholder')}
                  value={dockerCompose}
                  onChange={(e) => setDockerCompose(e.target.value)}
                  spellCheck={false}
                />
              </div>

              <Button
                type="primary"
                icon={deploying ? <LoadingOutlined /> : <RocketOutlined />}
                onClick={handleDeploy}
                loading={deploying}
                disabled={selectedServerIds.length === 0 || !appName.trim() || !dockerCompose.trim()}
                block
                size="large"
              >
                {deploying ? t('batchDeploy.deploying') : t('batchDeploy.deployToServers', { count: selectedServerIds.length })}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {showResults && (
        <Card
          title={t('batchDeploy.deployResults')}
          size="small"
          style={{ marginTop: 24 }}
          extra={
            <Space>
              <Tag color="success">{t('common.success')}: {results.filter(r => r.success).length}</Tag>
              <Tag color="error">{t('common.error')}: {results.filter(r => !r.success).length}</Tag>
            </Space>
          }
        >
          <Table
            columns={resultColumns}
            dataSource={results}
            rowKey="serverId"
            size="small"
            pagination={false}
          />
        </Card>
      )}
    </div>
  )
}

export default BatchDeploy

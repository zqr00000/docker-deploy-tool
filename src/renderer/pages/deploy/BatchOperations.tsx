import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Select,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Progress,
  Alert,
  message,
  Spin,
  Modal,
  Radio,
  Badge,
  Tooltip,
  Row,
  Col,
  Result,
  List,
  Divider,
  Dropdown,
  Input
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloudServerOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  StopOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  FilterOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'

const { Title, Text } = Typography

interface ContainerInfo {
  id: string
  name: string
  serverId: string
  serverName: string
  appName: string
  status: string
  image: string
}

interface OperationResult {
  containerId: string
  containerName: string
  serverName: string
  success: boolean
  message: string
}

type OperationType = 'start' | 'stop' | 'restart' | 'remove'

interface OperationTemplate {
  id: string
  name: string
  operation: OperationType
  createdAt: string
}

const BatchOperations: React.FC = () => {
  const [servers, setServers] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([])
  const [selectedContainerIds, setSelectedContainerIds] = useState<string[]>([])
  const [operation, setOperation] = useState<OperationType>('restart')
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [results, setResults] = useState<OperationResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [templates, setTemplates] = useState<OperationTemplate[]>([])
  const [saveTemplateModalVisible, setSaveTemplateModalVisible] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const serverList = await window.electronAPI.server.getAll()
      setServers(serverList.map(s => ({ id: s.id, name: s.name, status: s.status })))

      // 加载所有在线服务器的容器
      const allContainers: ContainerInfo[] = []
      for (const server of serverList.filter(s => s.status === 'online')) {
        try {
          const apps = await window.electronAPI.app.getByServerId(server.id)
          for (const app of apps) {
            if (app.projectPath) {
              const appContainers = await window.electronAPI.app.getContainers(server.id, app.projectPath)
              allContainers.push(...appContainers.map(c => ({
                id: c.id,
                name: c.name,
                serverId: server.id,
                serverName: server.name,
                appName: app.name,
                status: c.status,
                image: c.image
              })))
            }
          }
        } catch {
          // 忽略错误
        }
      }
      setContainers(allContainers)
    } catch (error) {
      console.error('Failed to load data:', error)
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 增强的容器过滤（支持状态过滤和搜索）
  const filteredContainers = React.useMemo(() => {
    let result = selectedServerIds.length > 0
      ? containers.filter(c => selectedServerIds.includes(c.serverId))
      : containers

    // 状态过滤
    if (statusFilter !== 'all') {
      result = result.filter(c => {
        if (statusFilter === 'running') return c.status.toLowerCase().includes('up')
        if (statusFilter === 'stopped') return !c.status.toLowerCase().includes('up')
        return true
      })
    }

    // 文本搜索
    if (searchText) {
      const lowerSearch = searchText.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(lowerSearch) ||
        c.serverName.toLowerCase().includes(lowerSearch) ||
        c.appName.toLowerCase().includes(lowerSearch)
      )
    }

    return result
  }, [containers, selectedServerIds, statusFilter, searchText])

  const handleSelectAll = () => {
    setSelectedContainerIds(filteredContainers.map(c => c.id))
  }

  const handleDeselectAll = () => {
    setSelectedContainerIds([])
  }

  // 按状态选择容器
  const handleSelectByStatus = (status: string) => {
    const filtered = containers.filter(c => {
      if (status === 'running') return c.status.toLowerCase().includes('up')
      if (status === 'stopped') return !c.status.toLowerCase().includes('up')
      return true
    })
    setSelectedContainerIds(filtered.map(c => c.id))
  }

  // 保存操作模板
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      message.warning('请输入模板名称')
      return
    }
    const newTemplate: OperationTemplate = {
      id: `template-${Date.now()}`,
      name: templateName,
      operation,
      createdAt: new Date().toISOString()
    }
    setTemplates([...templates, newTemplate])
    setSaveTemplateModalVisible(false)
    setTemplateName('')
    message.success('模板保存成功')
  }

  // 加载操作模板
  const handleLoadTemplate = (template: OperationTemplate) => {
    setOperation(template.operation)
    message.success(`已加载模板: ${template.name}`)
  }

  // 删除操作模板
  const handleDeleteTemplate = (templateId: string) => {
    setTemplates(templates.filter(t => t.id !== templateId))
  }

  const handleExecute = () => {
    if (selectedContainerIds.length === 0) {
      message.warning('请选择要操作的容器')
      return
    }
    setVisible(true)
  }

  // 模板下拉菜单
  const templateMenuItems: MenuProps['items'] = [
    ...templates.map(t => ({
      key: t.id,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>{t.name}</span>
          <Tag color="blue">{getOperationText(t.operation)}</Tag>
        </Space>
      ),
      onClick: () => handleLoadTemplate(t)
    })),
    ...(templates.length > 0 ? [{ type: 'divider' as const, key: 'divider' }] : []),
    {
      key: 'save',
      icon: <SaveOutlined />,
      label: '保存当前操作为模板',
      onClick: () => setSaveTemplateModalVisible(true)
    }
  ]

  const handleConfirm = async () => {
    setVisible(false)
    setOperating(true)
    setResults([])
    setShowResults(true)
    setProgress(0)

    const selectedContainers = containers.filter(c => selectedContainerIds.includes(c.id))
    const operationResults: OperationResult[] = []
    const total = selectedContainers.length

    for (let i = 0; i < selectedContainers.length; i++) {
      const container = selectedContainers[i]
      try {
        let result: { success: boolean; message: string }

        switch (operation) {
          case 'start':
            result = await window.electronAPI.app.startContainer(container.serverId, container.id)
            break
          case 'stop':
            result = await window.electronAPI.app.stopContainer(container.serverId, container.id)
            break
          case 'restart':
            result = await window.electronAPI.app.restartContainer(container.serverId, container.id)
            break
          case 'remove':
            result = await window.electronAPI.app.removeContainer(container.serverId, container.id)
            break
          default:
            result = { success: false, message: '未知操作' }
        }

        operationResults.push({
          containerId: container.id,
          containerName: container.name,
          serverName: container.serverName,
          success: result.success,
          message: result.message
        })
      } catch (error) {
        operationResults.push({
          containerId: container.id,
          containerName: container.name,
          serverName: container.serverName,
          success: false,
          message: (error as Error).message
        })
      }

      setProgress(Math.round(((i + 1) / total) * 100))
    }

    setResults(operationResults)
    setOperating(false)
    loadData() // 刷新容器列表
  }

  const getOperationText = (op: OperationType) => {
    switch (op) {
      case 'start': return '启动'
      case 'stop': return '停止'
      case 'restart': return '重启'
      case 'remove': return '删除'
      default: return op
    }
  }

  const getOperationIcon = (op: OperationType) => {
    switch (op) {
      case 'start': return <PlayCircleOutlined />
      case 'stop': return <StopOutlined />
      case 'restart': return <ReloadOutlined />
      case 'remove': return <DeleteOutlined />
      default: return null
    }
  }

  const getOperationColor = (op: OperationType) => {
    switch (op) {
      case 'start': return 'success'
      case 'stop': return 'warning'
      case 'restart': return 'processing'
      case 'remove': return 'error'
      default: return 'default'
    }
  }

  const containerColumns = [
    {
      title: '容器名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ContainerInfo) => (
        <Space>
          <AppstoreOutlined style={{ color: '#1677ff' }} />
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: '所属服务器',
      dataIndex: 'serverName',
      key: 'serverName',
      render: (text: string) => (
        <Space>
          <CloudServerOutlined />
          <Text>{text}</Text>
        </Space>
      )
    },
    {
      title: '应用',
      dataIndex: 'appName',
      key: 'appName'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const isRunning = status.includes('running') || status.includes('Up')
        return (
          <Badge
            status={isRunning ? 'success' : 'default'}
            text={status}
          />
        )
      }
    },
    {
      title: '镜像',
      dataIndex: 'image',
      key: 'image',
      render: (text: string) => <Text code style={{ fontSize: 11 }}>{text}</Text>
    }
  ]

  const resultColumns = [
    {
      title: '容器',
      dataIndex: 'containerName',
      key: 'containerName'
    },
    {
      title: '服务器',
      dataIndex: 'serverName',
      key: 'serverName'
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'success',
      render: (success: boolean) =>
        success ? (
          <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
        )
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message'
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
          <Title level={4} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 8 }} />
            批量操作
          </Title>
          <Text type="secondary">批量管理多个容器</Text>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="选择容器" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>筛选服务器</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  mode="multiple"
                  placeholder="选择服务器（留空显示全部）"
                  allowClear
                  value={selectedServerIds}
                  onChange={setSelectedServerIds}
                  options={servers.map(s => ({
                    value: s.id,
                    label: (
                      <Space>
                        {s.name}
                        <Badge status={s.status === 'online' ? 'success' : 'default'} />
                      </Space>
                    )
                  }))}
                />
              </div>

              {/* 增强的过滤选项 */}
              <Space wrap>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ width: 120 }}
                  options={[
                    { value: 'all', label: '全部状态' },
                    { value: 'running', label: '运行中' },
                    { value: 'stopped', label: '已停止' }
                  ]}
                />
                <Input.Search
                  placeholder="搜索容器/服务器/应用"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 200 }}
                  allowClear
                />
                <Dropdown menu={{ items: [
                  { key: 'selectRunning', label: '选择运行中', onClick: () => handleSelectByStatus('running') },
                  { key: 'selectStopped', label: '选择已停止', onClick: () => handleSelectByStatus('stopped') },
                  { type: 'divider' as const },
                  { key: 'selectAll', label: '全选', onClick: handleSelectAll },
                  { key: 'deselectAll', label: '取消全选', onClick: handleDeselectAll }
                ] }}>
                  <Button icon={<FilterOutlined />}>快捷选择</Button>
                </Dropdown>
              </Space>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>
                  容器列表
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({selectedContainerIds.length}/{filteredContainers.length})
                  </Text>
                </Text>
                <Space>
                  <Button size="small" onClick={handleSelectAll}>全选</Button>
                  <Button size="small" onClick={handleDeselectAll}>取消全选</Button>
                </Space>
              </div>

              <Table
                columns={containerColumns}
                dataSource={filteredContainers}
                rowKey="id"
                size="small"
                rowSelection={{
                  selectedRowKeys: selectedContainerIds,
                  onChange: (keys) => setSelectedContainerIds(keys as string[])
                }}
                pagination={{ pageSize: 10 }}
                scroll={{ y: 300 }}
              />
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="操作配置"
            size="small"
            extra={
              <Dropdown menu={{ items: templateMenuItems }}>
                <Button size="small" icon={<FolderOpenOutlined />}>模板</Button>
              </Dropdown>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>选择操作</Text>
                <Radio.Group
                  style={{ width: '100%', marginTop: 8 }}
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                >
                  <Row gutter={[8, 8]}>
                    <Col span={12}>
                      <Radio.Button value="start" style={{ width: '100%' }}>
                        <PlayCircleOutlined style={{ color: '#52c41a' }} /> 启动
                      </Radio.Button>
                    </Col>
                    <Col span={12}>
                      <Radio.Button value="stop" style={{ width: '100%' }}>
                        <StopOutlined style={{ color: '#faad14' }} /> 停止
                      </Radio.Button>
                    </Col>
                    <Col span={12}>
                      <Radio.Button value="restart" style={{ width: '100%' }}>
                        <ReloadOutlined style={{ color: '#1677ff' }} /> 重启
                      </Radio.Button>
                    </Col>
                    <Col span={12}>
                      <Radio.Button value="remove" style={{ width: '100%' }}>
                        <DeleteOutlined style={{ color: '#ff4d4f' }} /> 删除
                      </Radio.Button>
                    </Col>
                  </Row>
                </Radio.Group>
              </div>

              {/* 已保存的模板列表 */}
              {templates.length > 0 && (
                <div>
                  <Text strong>已保存的模板</Text>
                  <div style={{ marginTop: 8 }}>
                    {templates.map(t => (
                      <Tag
                        key={t.id}
                        closable
                        onClose={() => handleDeleteTemplate(t.id)}
                        onClick={() => handleLoadTemplate(t)}
                        style={{ cursor: 'pointer', marginBottom: 4 }}
                      >
                        {t.name} ({getOperationText(t.operation)})
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              {selectedContainerIds.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`将对 ${selectedContainerIds.length} 个容器执行${getOperationText(operation)}操作`}
                />
              )}

              <Button
                type="primary"
                icon={operating ? <LoadingOutlined /> : getOperationIcon(operation)}
                onClick={handleExecute}
                disabled={selectedContainerIds.length === 0}
                block
                size="large"
                danger={operation === 'remove'}
              >
                {operating ? '执行中...' : `执行${getOperationText(operation)}`}
              </Button>

              {operating && (
                <div>
                  <Progress percent={progress} status="active" />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    正在处理... {progress}%
                  </Text>
                </div>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 保存模板模态框 */}
      <Modal
        title="保存操作模板"
        open={saveTemplateModalVisible}
        onOk={handleSaveTemplate}
        onCancel={() => setSaveTemplateModalVisible(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>模板名称</Text>
          <Input
            placeholder="输入模板名称"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Text type="secondary">当前操作: {getOperationText(operation)}</Text>
        </Space>
      </Modal>

      {showResults && (
        <Card
          title="操作结果"
          size="small"
          style={{ marginTop: 16 }}
          extra={
            <Space>
              <Tag color="success">成功: {results.filter(r => r.success).length}</Tag>
              <Tag color="error">失败: {results.filter(r => !r.success).length}</Tag>
            </Space>
          }
        >
          {results.length === 0 ? (
            <Result
              status="success"
              title="操作完成"
              subTitle="所有操作已成功执行"
            />
          ) : (
            <Table
              columns={resultColumns}
              dataSource={results}
              rowKey="containerId"
              size="small"
              pagination={false}
            />
          )}
        </Card>
      )}

      <Modal
        title="确认操作"
        open={visible}
        onOk={handleConfirm}
        onCancel={() => setVisible(false)}
        okText="确认执行"
        cancelText="取消"
        okButtonProps={{ danger: operation === 'remove' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type={operation === 'remove' ? 'error' : 'warning'}
            showIcon
            message={
              <span>
                确定要对 <Text strong>{selectedContainerIds.length}</Text> 个容器执行
                <Tag color={getOperationColor(operation)} style={{ marginLeft: 8 }}>
                  {getOperationText(operation)}
                </Tag>
                操作吗？
              </span>
            }
          />
          {operation === 'remove' && (
            <Alert
              type="error"
              message="此操作不可恢复，请谨慎操作！"
            />
          )}
          <Divider style={{ margin: '8px 0' }} />
          <Text type="secondary">将操作的容器:</Text>
          <List
            size="small"
            dataSource={containers.filter(c => selectedContainerIds.includes(c.id)).slice(0, 5)}
            renderItem={item => (
              <List.Item>
                <Space>
                  <AppstoreOutlined />
                  <Text>{item.name}</Text>
                  <Text type="secondary">({item.serverName})</Text>
                </Space>
              </List.Item>
            )}
          />
          {selectedContainerIds.length > 5 && (
            <Text type="secondary">...还有 {selectedContainerIds.length - 5} 个容器</Text>
          )}
        </Space>
      </Modal>
    </div>
  )
}

export default BatchOperations

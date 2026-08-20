import React, { useState, useEffect } from 'react'
import {
  Layout,
  Card,
  Button,
  Space,
  Typography,
  Form,
  Input,
  Select,
  Switch,
  Tabs,
  List,
  Tag,
  Tooltip,
  Modal,
  message,
  Divider,
  Empty,
  Popconfirm,
  Row,
  Col,
  Alert
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  FileOutlined,
  CloudServerOutlined,
  ApiOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UploadOutlined,
  DownloadOutlined,
  CopyOutlined,
  EditOutlined,
  ContainerOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input

// ============ 类型定义 ============

interface PortMapping {
  id: string
  hostPort: string
  containerPort: string
  protocol: string
}

interface EnvVariable {
  id: string
  key: string
  value: string
}

interface VolumeMount {
  id: string
  source: string
  target: string
  type: string
}

interface ServiceConfig {
  id: string
  name: string
  image: string
  container_name: string
  restart: string
  ports: PortMapping[]
  environment: EnvVariable[]
  volumes: VolumeMount[]
  networks: string[]
  depends_on: string[]
  command: string
  entrypoint: string
  working_dir: string
  user: string
  labels: EnvVariable[]
  privileged: boolean
  stdin_open: boolean
  tty: boolean
}

interface NetworkConfig {
  id: string
  name: string
  driver: string
  internal: boolean
  enableIPv6: boolean
  subnet: string
  gateway: string
  ipRange: string
  labels: EnvVariable[]
}

interface VolumeConfig {
  id: string
  name: string
  driver: string
  labels: EnvVariable[]
}

type ComponentType = 'service' | 'network' | 'volume'

interface ComposeProject {
  version: string
  services: ServiceConfig[]
  networks: NetworkConfig[]
  volumes: VolumeConfig[]
}

// ============ 工具函数 ============

const generateId = () => Math.random().toString(36).substring(2, 10)

const generateYaml = (project: ComposeProject): string => {
  const lines: string[] = []
  
  lines.push(`version: "${project.version}"`)
  lines.push('')

  // Services
  if (project.services.length > 0) {
    lines.push('services:')
    project.services.forEach(service => {
      lines.push(`  ${service.name}:`)
      lines.push(`    image: ${service.image}`)
      if (service.container_name) {
        lines.push(`    container_name: ${service.container_name}`)
      }
      if (service.restart) {
        lines.push(`    restart: ${service.restart}`)
      }
      if (service.command) {
        lines.push(`    command: ${service.command}`)
      }
      if (service.entrypoint) {
        lines.push(`    entrypoint: ${service.entrypoint}`)
      }
      if (service.working_dir) {
        lines.push(`    working_dir: ${service.working_dir}`)
      }
      if (service.user) {
        lines.push(`    user: ${service.user}`)
      }
      
      if (service.ports.length > 0) {
        lines.push('    ports:')
        service.ports.forEach(port => {
          if (port.hostPort && port.containerPort) {
            const proto = port.protocol !== 'tcp' ? `/${port.protocol}` : ''
            lines.push(`      - "${port.hostPort}:${port.containerPort}${proto}"`)
          }
        })
      }

      if (service.environment.length > 0) {
        lines.push('    environment:')
        service.environment.forEach(env => {
          if (env.key) {
            lines.push(`      - ${env.key}=${env.value}`)
          }
        })
      }

      if (service.volumes.length > 0) {
        lines.push('    volumes:')
        service.volumes.forEach(vol => {
          if (vol.target) {
            const type = vol.type === 'ro' ? ':ro' : vol.type === 'rw' ? ':rw' : ''
            lines.push(`      - ${vol.source}:${vol.target}${type}`)
          }
        })
      }

      if (service.networks.length > 0) {
        lines.push('    networks:')
        service.networks.forEach(net => {
          lines.push(`      - ${net}`)
        })
      }

      if (service.depends_on.length > 0) {
        lines.push('    depends_on:')
        service.depends_on.forEach(dep => {
          lines.push(`      - ${dep}`)
        })
      }

      if (service.labels.length > 0) {
        lines.push('    labels:')
        service.labels.forEach(label => {
          if (label.key) {
            lines.push(`      - ${label.key}=${label.value}`)
          }
        })
      }

      if (service.privileged) {
        lines.push('    privileged: true')
      }
      if (service.stdin_open) {
        lines.push('    stdin_open: true')
      }
      if (service.tty) {
        lines.push('    tty: true')
      }

      lines.push('')
    })
  }

  // Networks
  if (project.networks.length > 0) {
    lines.push('networks:')
    project.networks.forEach(network => {
      lines.push(`  ${network.name}:`)
      if (network.driver && network.driver !== 'bridge') {
        lines.push(`    driver: ${network.driver}`)
      }
      if (network.internal) {
        lines.push('    internal: true')
      }
      if (network.enableIPv6) {
        lines.push('    enable_ipv6: true')
      }
      if (network.subnet) {
        lines.push('    ipam:')
        lines.push('      config:')
        lines.push(`        - subnet: ${network.subnet}`)
        if (network.gateway) {
          lines.push(`          gateway: ${network.gateway}`)
        }
        if (network.ipRange) {
          lines.push(`          ip_range: ${network.ipRange}`)
        }
      }
      if (network.labels.length > 0) {
        lines.push('    labels:')
        network.labels.forEach(label => {
          if (label.key) {
            lines.push(`      - ${label.key}=${label.value}`)
          }
        })
      }
      lines.push('')
    })
  }

  // Volumes
  if (project.volumes.length > 0) {
    lines.push('volumes:')
    project.volumes.forEach(volume => {
      lines.push(`  ${volume.name}:`)
      if (volume.driver && volume.driver !== 'local') {
        lines.push(`    driver: ${volume.driver}`)
      }
      if (volume.labels.length > 0) {
        lines.push('    labels:')
        volume.labels.forEach(label => {
          if (label.key) {
            lines.push(`      - ${label.key}=${label.value}`)
          }
        })
      }
      lines.push('')
    })
  }

  return lines.join('\n')
}

const createEmptyService = (): ServiceConfig => ({
  id: generateId(),
  name: `service_${generateId()}`,
  image: '',
  container_name: '',
  restart: 'unless-stopped',
  ports: [],
  environment: [],
  volumes: [],
  networks: [],
  depends_on: [],
  command: '',
  entrypoint: '',
  working_dir: '',
  user: '',
  labels: [],
  privileged: false,
  stdin_open: false,
  tty: false
})

const createEmptyNetwork = (): NetworkConfig => ({
  id: generateId(),
  name: `network_${generateId()}`,
  driver: 'bridge',
  internal: false,
  enableIPv6: false,
  subnet: '',
  gateway: '',
  ipRange: '',
  labels: []
})

const createEmptyVolume = (): VolumeConfig => ({
  id: generateId(),
  name: `volume_${generateId()}`,
  driver: 'local',
  labels: []
})

// ============ 主组件 ============

const ComposeEditor: React.FC = () => {
  const { t } = useTranslation()
  const [project, setProject] = useState<ComposeProject>({
    version: '3.8',
    services: [],
    networks: [],
    volumes: []
  })
  const [selectedType, setSelectedType] = useState<ComponentType>('service')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [yamlContent, setYamlContent] = useState('')
  const [yamlValid, setYamlValid] = useState(true)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importYaml, setImportYaml] = useState('')

  // 实时生成 YAML
  useEffect(() => {
    const yaml = generateYaml(project)
    setYamlContent(yaml)
  }, [project])

  // 获取当前选中的组件
  const getSelectedService = (): ServiceConfig | undefined => {
    return project.services.find(s => s.id === selectedId)
  }

  const getSelectedNetwork = (): NetworkConfig | undefined => {
    return project.networks.find(n => n.id === selectedId)
  }

  const getSelectedVolume = (): VolumeConfig | undefined => {
    return project.volumes.find(v => v.id === selectedId)
  }

  // 添加组件
  const handleAddComponent = (type: ComponentType) => {
    if (type === 'service') {
      const newService = createEmptyService()
      setProject(prev => ({
        ...prev,
        services: [...prev.services, newService]
      }))
      setSelectedId(newService.id)
      setSelectedType('service')
    } else if (type === 'network') {
      const newNetwork = createEmptyNetwork()
      setProject(prev => ({
        ...prev,
        networks: [...prev.networks, newNetwork]
      }))
      setSelectedId(newNetwork.id)
      setSelectedType('network')
    } else if (type === 'volume') {
      const newVolume = createEmptyVolume()
      setProject(prev => ({
        ...prev,
        volumes: [...prev.volumes, newVolume]
      }))
      setSelectedId(newVolume.id)
      setSelectedType('volume')
    }
  }

  // 删除组件
  const handleDeleteComponent = (type: ComponentType, id: string) => {
    if (type === 'service') {
      setProject(prev => ({
        ...prev,
        services: prev.services.filter(s => s.id !== id)
      }))
    } else if (type === 'network') {
      setProject(prev => ({
        ...prev,
        networks: prev.networks.filter(n => n.id !== id)
      }))
    } else if (type === 'volume') {
      setProject(prev => ({
        ...prev,
        volumes: prev.volumes.filter(v => v.id !== id)
      }))
    }
    if (selectedId === id) {
      setSelectedId(null)
    }
  }

  // 更新服务
  const updateService = (id: string, updates: Partial<ServiceConfig>) => {
    setProject(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === id ? { ...s, ...updates } : s)
    }))
  }

  // 更新网络
  const updateNetwork = (id: string, updates: Partial<NetworkConfig>) => {
    setProject(prev => ({
      ...prev,
      networks: prev.networks.map(n => n.id === id ? { ...n, ...updates } : n)
    }))
  }

  // 更新卷
  const updateVolume = (id: string, updates: Partial<VolumeConfig>) => {
    setProject(prev => ({
      ...prev,
      volumes: prev.volumes.map(v => v.id === id ? { ...v, ...updates } : v)
    }))
  }

  // 保存配置
  const handleSave = () => {
    try {
      const yaml = generateYaml(project)
      localStorage.setItem('compose-editor-project', JSON.stringify(project))
      localStorage.setItem('compose-editor-yaml', yaml)
      message.success(t('composeEditor.saveSuccess'))
    } catch {
      message.error(t('composeEditor.saveFailed'))
    }
  }

  // 加载配置
  const handleLoad = () => {
    try {
      const saved = localStorage.getItem('compose-editor-project')
      if (saved) {
        const parsed = JSON.parse(saved) as ComposeProject
        setProject(parsed)
        setSelectedId(null)
        message.success(t('composeEditor.loadSuccess'))
      } else {
        message.info(t('composeEditor.noSavedData'))
      }
    } catch {
      message.error(t('composeEditor.loadFailed'))
    }
  }

  // 导入 YAML
  const handleImportYaml = () => {
    if (!importYaml.trim()) {
      message.warning(t('composeEditor.emptyYaml'))
      return
    }
    // 简化的 YAML 解析（仅支持基本结构）
    try {
      const lines = importYaml.split('\n')
      const newProject: ComposeProject = {
        version: '3.8',
        services: [],
        networks: [],
        volumes: []
      }

      let currentSection: string | null = null
      let currentItem: Record<string, unknown> | null = null
      let currentName: string = ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        if (trimmed.startsWith('version:')) {
          newProject.version = trimmed.split(':')[1].trim().replace(/['"]/g, '')
          continue
        }

        if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed.endsWith(':')) {
          currentSection = trimmed.slice(0, -1)
          continue
        }

        if (currentSection && line.startsWith('  ') && !line.startsWith('    ') && trimmed.endsWith(':')) {
          if (currentSection === 'services') {
            currentName = trimmed.slice(0, -1)
            currentItem = { name: currentName, image: '' }
          }
          continue
        }

        if (currentSection === 'services' && currentItem && line.startsWith('    ')) {
          const propLine = trimmed
          if (propLine.startsWith('image:')) {
            (currentItem as Record<string, string>).image = propLine.split(':')[1].trim()
          }
        }
      }

      // 对于复杂导入，提示用户使用表单编辑
      setProject(newProject)
      setImportModalVisible(false)
      setImportYaml('')
      message.success(t('composeEditor.importSuccess'))
    } catch {
      message.error(t('composeEditor.importFailed'))
    }
  }

  // 导出 YAML
  const handleExport = () => {
    const yaml = generateYaml(project)
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'docker-compose.yml'
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('composeEditor.exportSuccess'))
  }

  // 复制 YAML
  const handleCopyYaml = () => {
    navigator.clipboard.writeText(yamlContent).then(() => {
      message.success(t('composeEditor.copySuccess'))
    }).catch(() => {
      message.error(t('composeEditor.copyFailed'))
    })
  }

  // 校验 YAML
  const handleValidate = () => {
    if (!yamlContent.trim()) {
      message.warning(t('composeEditor.emptyYaml'))
      return
    }
    // 基本校验：检查是否有服务定义
    const hasServices = project.services.length > 0
    const hasValidServices = project.services.every(s => s.name && s.image)
    
    if (hasServices && hasValidServices) {
      setYamlValid(true)
      message.success(t('composeEditor.validateSuccess'))
    } else {
      setYamlValid(false)
      message.warning(t('composeEditor.validateWarning'))
    }
  }

  // 从现有容器生成（占位功能）
  const handleGenerateFromContainer = () => {
    message.info(t('composeEditor.generateFromContainerTip'))
  }

  // ============ 渲染组件面板 ============
  const renderComponentPanel = () => (
    <div style={{ padding: '16px' }}>
      <Title level={5} style={{ marginTop: 0 }}>{t('composeEditor.componentPanel')}</Title>
      
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Card
          size="small"
          hoverable
          onClick={() => handleAddComponent('service')}
          style={{ cursor: 'pointer' }}
        >
          <Space>
            <CloudServerOutlined style={{ fontSize: 18, color: '#007AFF' }} />
            <div>
              <Text strong>{t('composeEditor.service')}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>{t('composeEditor.serviceDesc')}</Text>
            </div>
          </Space>
        </Card>

        <Card
          size="small"
          hoverable
          onClick={() => handleAddComponent('network')}
          style={{ cursor: 'pointer' }}
        >
          <Space>
            <ApiOutlined style={{ fontSize: 18, color: '#34C759' }} />
            <div>
              <Text strong>{t('composeEditor.network')}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>{t('composeEditor.networkDesc')}</Text>
            </div>
          </Space>
        </Card>

        <Card
          size="small"
          hoverable
          onClick={() => handleAddComponent('volume')}
          style={{ cursor: 'pointer' }}
        >
          <Space>
            <DatabaseOutlined style={{ fontSize: 18, color: '#FF9500' }} />
            <div>
              <Text strong>{t('composeEditor.volume')}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>{t('composeEditor.volumeDesc')}</Text>
            </div>
          </Space>
        </Card>
      </Space>

      <Divider />

      <Title level={5}>{t('composeEditor.componentList')}</Title>
      
      {/* 服务列表 */}
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ color: '#007AFF' }}>
          <CloudServerOutlined /> {t('composeEditor.services')} ({project.services.length})
        </Text>
        {project.services.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('composeEditor.noComponents')} style={{ marginTop: 8 }} />
        ) : (
          <List
            size="small"
            style={{ marginTop: 8 }}
            dataSource={project.services}
            renderItem={service => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: selectedId === service.id ? '#e6f7ff' : undefined,
                  padding: '6px 8px',
                  borderRadius: 4
                }}
                onClick={() => {
                  setSelectedId(service.id)
                  setSelectedType('service')
                }}
                actions={[
                  <Popconfirm
                    title={t('composeEditor.confirmDelete')}
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      handleDeleteComponent('service', service.id)
                    }}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  avatar={<ContainerOutlined style={{ color: '#007AFF' }} />}
                  title={<Text style={{ fontSize: 13 }}>{service.name}</Text>}
                  description={<Text type="secondary" style={{ fontSize: 11 }}>{service.image || t('composeEditor.noImage')}</Text>}
                />
              </List.Item>
            )}
          />
        )}
      </div>

      {/* 网络列表 */}
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ color: '#34C759' }}>
          <ApiOutlined /> {t('composeEditor.networks')} ({project.networks.length})
        </Text>
        {project.networks.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('composeEditor.noComponents')} style={{ marginTop: 8 }} />
        ) : (
          <List
            size="small"
            style={{ marginTop: 8 }}
            dataSource={project.networks}
            renderItem={network => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: selectedId === network.id ? '#f6ffed' : undefined,
                  padding: '6px 8px',
                  borderRadius: 4
                }}
                onClick={() => {
                  setSelectedId(network.id)
                  setSelectedType('network')
                }}
                actions={[
                  <Popconfirm
                    title={t('composeEditor.confirmDelete')}
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      handleDeleteComponent('network', network.id)
                    }}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  avatar={<GlobalOutlined style={{ color: '#34C759' }} />}
                  title={<Text style={{ fontSize: 13 }}>{network.name}</Text>}
                  description={<Text type="secondary" style={{ fontSize: 11 }}>{network.driver}</Text>}
                />
              </List.Item>
            )}
          />
        )}
      </div>

      {/* 卷列表 */}
      <div>
        <Text strong style={{ color: '#FF9500' }}>
          <DatabaseOutlined /> {t('composeEditor.volumes')} ({project.volumes.length})
        </Text>
        {project.volumes.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('composeEditor.noComponents')} style={{ marginTop: 8 }} />
        ) : (
          <List
            size="small"
            style={{ marginTop: 8 }}
            dataSource={project.volumes}
            renderItem={volume => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: selectedId === volume.id ? '#fffbe6' : undefined,
                  padding: '6px 8px',
                  borderRadius: 4
                }}
                onClick={() => {
                  setSelectedId(volume.id)
                  setSelectedType('volume')
                }}
                actions={[
                  <Popconfirm
                    title={t('composeEditor.confirmDelete')}
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      handleDeleteComponent('volume', volume.id)
                    }}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  avatar={<DatabaseOutlined style={{ color: '#FF9500' }} />}
                  title={<Text style={{ fontSize: 13 }}>{volume.name}</Text>}
                  description={<Text type="secondary" style={{ fontSize: 11 }}>{volume.driver}</Text>}
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  )

  // ============ 渲染属性面板 ============
  const renderServiceProperties = (service: ServiceConfig) => (
    <div style={{ padding: '16px' }}>
      <Title level={5} style={{ marginTop: 0 }}>
        <EditOutlined /> {t('composeEditor.serviceProperties')}
      </Title>
      
      <Form layout="vertical" size="small">
        <Form.Item label={t('composeEditor.serviceName')}>
          <Input
            value={service.name}
            onChange={(e) => updateService(service.id, { name: e.target.value })}
            placeholder={t('composeEditor.serviceNamePlaceholder')}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.image')}>
          <Select
            value={service.image || undefined}
            onChange={(value) => updateService(service.id, { image: value })}
            placeholder={t('composeEditor.imagePlaceholder')}
            showSearch
            allowClear
            options={[
              { label: 'nginx:latest', value: 'nginx:latest' },
              { label: 'nginx:alpine', value: 'nginx:alpine' },
              { label: 'mysql:8.0', value: 'mysql:8.0' },
              { label: 'mysql:5.7', value: 'mysql:5.7' },
              { label: 'postgres:15', value: 'postgres:15' },
              { label: 'postgres:14', value: 'postgres:14' },
              { label: 'redis:7', value: 'redis:7' },
              { label: 'redis:6', value: 'redis:6' },
              { label: 'mongo:6', value: 'mongo:6' },
              { label: 'node:18', value: 'node:18' },
              { label: 'node:20', value: 'node:20' },
              { label: 'python:3.11', value: 'python:3.11' },
              { label: 'ubuntu:22.04', value: 'ubuntu:22.04' },
              { label: 'alpine:latest', value: 'alpine:latest' },
              { label: 'httpd:latest', value: 'httpd:latest' },
              { label: 'wordpress:latest', value: 'wordpress:latest' }
            ]}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.containerName')}>
          <Input
            value={service.container_name}
            onChange={(e) => updateService(service.id, { container_name: e.target.value })}
            placeholder={t('composeEditor.containerNamePlaceholder')}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.restart')}>
          <Select
            value={service.restart}
            onChange={(value) => updateService(service.id, { restart: value })}
            options={[
              { label: 'no', value: 'no' },
              { label: 'always', value: 'always' },
              { label: 'on-failure', value: 'on-failure' },
              { label: 'unless-stopped', value: 'unless-stopped' }
            ]}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.command')}>
          <Input
            value={service.command}
            onChange={(e) => updateService(service.id, { command: e.target.value })}
            placeholder={t('composeEditor.commandPlaceholder')}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.workingDir')}>
          <Input
            value={service.working_dir}
            onChange={(e) => updateService(service.id, { working_dir: e.target.value })}
            placeholder="/app"
          />
        </Form.Item>

        {/* 端口映射 */}
        <Divider orientation="left" style={{ fontSize: 12 }}>{t('composeEditor.ports')}</Divider>
        {service.ports.map((port, index) => (
          <Row key={port.id} gutter={4} style={{ marginBottom: 4 }}>
            <Col span={8}>
              <Input
                value={port.hostPort}
                onChange={(e) => {
                  const newPorts = [...service.ports]
                  newPorts[index] = { ...port, hostPort: e.target.value }
                  updateService(service.id, { ports: newPorts })
                }}
                placeholder="80"
                size="small"
              />
            </Col>
            <Col span={8}>
              <Input
                value={port.containerPort}
                onChange={(e) => {
                  const newPorts = [...service.ports]
                  newPorts[index] = { ...port, containerPort: e.target.value }
                  updateService(service.id, { ports: newPorts })
                }}
                placeholder="80"
                size="small"
              />
            </Col>
            <Col span={5}>
              <Select
                value={port.protocol}
                onChange={(value) => {
                  const newPorts = [...service.ports]
                  newPorts[index] = { ...port, protocol: value }
                  updateService(service.id, { ports: newPorts })
                }}
                size="small"
                style={{ width: '100%' }}
                options={[
                  { label: 'tcp', value: 'tcp' },
                  { label: 'udp', value: 'udp' }
                ]}
              />
            </Col>
            <Col span={3}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  const newPorts = service.ports.filter(p => p.id !== port.id)
                  updateService(service.id, { ports: newPorts })
                }}
              />
            </Col>
          </Row>
        ))}
        <Button
          type="dashed"
          size="small"
          block
          icon={<PlusOutlined />}
          onClick={() => {
            const newPort: PortMapping = { id: generateId(), hostPort: '', containerPort: '', protocol: 'tcp' }
            updateService(service.id, { ports: [...service.ports, newPort] })
          }}
        >
          {t('composeEditor.addPort')}
        </Button>

        {/* 环境变量 */}
        <Divider orientation="left" style={{ fontSize: 12 }}>{t('composeEditor.environment')}</Divider>
        {service.environment.map((env, index) => (
          <Row key={env.id} gutter={4} style={{ marginBottom: 4 }}>
            <Col span={9}>
              <Input
                value={env.key}
                onChange={(e) => {
                  const newEnv = [...service.environment]
                  newEnv[index] = { ...env, key: e.target.value }
                  updateService(service.id, { environment: newEnv })
                }}
                placeholder="KEY"
                size="small"
              />
            </Col>
            <Col span={12}>
              <Input
                value={env.value}
                onChange={(e) => {
                  const newEnv = [...service.environment]
                  newEnv[index] = { ...env, value: e.target.value }
                  updateService(service.id, { environment: newEnv })
                }}
                placeholder="value"
                size="small"
              />
            </Col>
            <Col span={3}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  const newEnv = service.environment.filter(e => e.id !== env.id)
                  updateService(service.id, { environment: newEnv })
                }}
              />
            </Col>
          </Row>
        ))}
        <Button
          type="dashed"
          size="small"
          block
          icon={<PlusOutlined />}
          onClick={() => {
            const newEnv: EnvVariable = { id: generateId(), key: '', value: '' }
            updateService(service.id, { environment: [...service.environment, newEnv] })
          }}
        >
          {t('composeEditor.addEnv')}
        </Button>

        {/* 卷挂载 */}
        <Divider orientation="left" style={{ fontSize: 12 }}>{t('composeEditor.volumes')}</Divider>
        {service.volumes.map((vol, index) => (
          <Row key={vol.id} gutter={4} style={{ marginBottom: 4 }}>
            <Col span={8}>
              <Input
                value={vol.source}
                onChange={(e) => {
                  const newVols = [...service.volumes]
                  newVols[index] = { ...vol, source: e.target.value }
                  updateService(service.id, { volumes: newVols })
                }}
                placeholder={t('composeEditor.volumeSource')}
                size="small"
              />
            </Col>
            <Col span={8}>
              <Input
                value={vol.target}
                onChange={(e) => {
                  const newVols = [...service.volumes]
                  newVols[index] = { ...vol, target: e.target.value }
                  updateService(service.id, { volumes: newVols })
                }}
                placeholder="/data"
                size="small"
              />
            </Col>
            <Col span={5}>
              <Select
                value={vol.type}
                onChange={(value) => {
                  const newVols = [...service.volumes]
                  newVols[index] = { ...vol, type: value }
                  updateService(service.id, { volumes: newVols })
                }}
                size="small"
                style={{ width: '100%' }}
                options={[
                  { label: 'rw', value: 'rw' },
                  { label: 'ro', value: 'ro' },
                  { label: 'z', value: 'z' },
                  { label: 'Z', value: 'Z' }
                ]}
              />
            </Col>
            <Col span={3}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  const newVols = service.volumes.filter(v => v.id !== vol.id)
                  updateService(service.id, { volumes: newVols })
                }}
              />
            </Col>
          </Row>
        ))}
        <Button
          type="dashed"
          size="small"
          block
          icon={<PlusOutlined />}
          onClick={() => {
            const newVol: VolumeMount = { id: generateId(), source: '', target: '', type: 'rw' }
            updateService(service.id, { volumes: [...service.volumes, newVol] })
          }}
        >
          {t('composeEditor.addVolume')}
        </Button>

        {/* 网络 */}
        <Divider orientation="left" style={{ fontSize: 12 }}>{t('composeEditor.networks')}</Divider>
        <Select
          mode="multiple"
          value={service.networks}
          onChange={(value) => updateService(service.id, { networks: value })}
          placeholder={t('composeEditor.selectNetworks')}
          style={{ width: '100%' }}
          options={project.networks.map(n => ({ label: n.name, value: n.name }))}
        />

        {/* 依赖 */}
        <Form.Item label={t('composeEditor.dependsOn')} style={{ marginTop: 8 }}>
          <Select
            mode="multiple"
            value={service.depends_on}
            onChange={(value) => updateService(service.id, { depends_on: value })}
            placeholder={t('composeEditor.selectDependsOn')}
            options={project.services.filter(s => s.id !== service.id).map(s => ({ label: s.name, value: s.name }))}
          />
        </Form.Item>

        {/* 高级选项 */}
        <Divider orientation="left" style={{ fontSize: 12 }}>{t('composeEditor.advanced')}</Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('composeEditor.privileged')} style={{ marginBottom: 4 }}>
              <Switch
                checked={service.privileged}
                onChange={(checked) => updateService(service.id, { privileged: checked })}
                size="small"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="stdin_open" style={{ marginBottom: 4 }}>
              <Switch
                checked={service.stdin_open}
                onChange={(checked) => updateService(service.id, { stdin_open: checked })}
                size="small"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="tty" style={{ marginBottom: 4 }}>
              <Switch
                checked={service.tty}
                onChange={(checked) => updateService(service.id, { tty: checked })}
                size="small"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </div>
  )

  const renderNetworkProperties = (network: NetworkConfig) => (
    <div style={{ padding: '16px' }}>
      <Title level={5} style={{ marginTop: 0 }}>
        <EditOutlined /> {t('composeEditor.networkProperties')}
      </Title>
      
      <Form layout="vertical" size="small">
        <Form.Item label={t('composeEditor.networkName')}>
          <Input
            value={network.name}
            onChange={(e) => updateNetwork(network.id, { name: e.target.value })}
            placeholder={t('composeEditor.networkNamePlaceholder')}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.driver')}>
          <Select
            value={network.driver}
            onChange={(value) => updateNetwork(network.id, { driver: value })}
            options={[
              { label: 'bridge', value: 'bridge' },
              { label: 'host', value: 'host' },
              { label: 'none', value: 'none' },
              { label: 'overlay', value: 'overlay' },
              { label: 'macvlan', value: 'macvlan' }
            ]}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.subnet')}>
          <Input
            value={network.subnet}
            onChange={(e) => updateNetwork(network.id, { subnet: e.target.value })}
            placeholder="172.20.0.0/16"
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.gateway')}>
          <Input
            value={network.gateway}
            onChange={(e) => updateNetwork(network.id, { gateway: e.target.value })}
            placeholder="172.20.0.1"
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.ipRange')}>
          <Input
            value={network.ipRange}
            onChange={(e) => updateNetwork(network.id, { ipRange: e.target.value })}
            placeholder="172.20.0.0/24"
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t('composeEditor.internal')} style={{ marginBottom: 4 }}>
              <Switch
                checked={network.internal}
                onChange={(checked) => updateNetwork(network.id, { internal: checked })}
                size="small"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t('composeEditor.enableIPv6')} style={{ marginBottom: 4 }}>
              <Switch
                checked={network.enableIPv6}
                onChange={(checked) => updateNetwork(network.id, { enableIPv6: checked })}
                size="small"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </div>
  )

  const renderVolumeProperties = (volume: VolumeConfig) => (
    <div style={{ padding: '16px' }}>
      <Title level={5} style={{ marginTop: 0 }}>
        <EditOutlined /> {t('composeEditor.volumeProperties')}
      </Title>
      
      <Form layout="vertical" size="small">
        <Form.Item label={t('composeEditor.volumeName')}>
          <Input
            value={volume.name}
            onChange={(e) => updateVolume(volume.id, { name: e.target.value })}
            placeholder={t('composeEditor.volumeNamePlaceholder')}
          />
        </Form.Item>

        <Form.Item label={t('composeEditor.driver')}>
          <Select
            value={volume.driver}
            onChange={(value) => updateVolume(volume.id, { driver: value })}
            options={[
              { label: 'local', value: 'local' },
              { label: 'nfs', value: 'nfs' },
              { label: 'tmpfs', value: 'tmpfs' }
            ]}
          />
        </Form.Item>
      </Form>
    </div>
  )

  const renderEmptyProperties = () => (
    <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('composeEditor.selectComponentHint')}
      />
    </div>
  )

  // ============ 主渲染 ============
  return (
    <Layout style={{ height: '100%', background: '#f0f2f5' }}>
      {/* 顶部工具栏 */}
      <Header style={{ background: '#fff', padding: '0 16px', borderBottom: '1px solid #f0f2f5', height: 'auto', lineHeight: 'normal', paddingTop: 8, paddingBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <FileOutlined style={{ fontSize: 18, color: '#007AFF' }} />
            <Text strong>{t('composeEditor.title')}</Text>
            {yamlContent && (
              <Tag color={yamlValid ? 'success' : 'error'} icon={yamlValid ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                {yamlValid ? t('composeEditor.valid') : t('composeEditor.invalid')}
              </Tag>
            )}
          </Space>
          <Space wrap>
            <Tooltip title={t('composeEditor.import')}>
              <Button size="small" icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>
                {t('composeEditor.import')}
              </Button>
            </Tooltip>
            <Tooltip title={t('composeEditor.export')}>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
                {t('composeEditor.export')}
              </Button>
            </Tooltip>
            <Tooltip title={t('composeEditor.validate')}>
              <Button size="small" icon={<CheckCircleOutlined />} onClick={handleValidate}>
                {t('composeEditor.validate')}
              </Button>
            </Tooltip>
            <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              {t('common.save')}
            </Button>
          </Space>
        </div>
      </Header>

      <Layout>
        {/* 左侧组件面板 */}
        <Sider width={260} style={{ background: '#fff', borderRight: '1px solid #f0f2f5', overflow: 'auto' }}>
          {renderComponentPanel()}
        </Sider>

        {/* 中间编辑区域 */}
        <Layout>
          <Content style={{ background: '#fff', overflow: 'auto' }}>
            <div style={{ padding: 16 }}>
              <Card>
                <Empty
                  image={<FileOutlined style={{ fontSize: 48, color: '#007AFF' }} />}
                  description={
                    <Space direction="vertical">
                      <Text strong style={{ fontSize: 16 }}>{t('composeEditor.welcomeTitle')}</Text>
                      <Text type="secondary">{t('composeEditor.welcomeDesc')}</Text>
                    </Space>
                  }
                >
                  <Space>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddComponent('service')}>
                      {t('composeEditor.addService')}
                    </Button>
                    <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>
                      {t('composeEditor.importYaml')}
                    </Button>
                  </Space>
                </Empty>
              </Card>

              {/* 快速模板 */}
              <Card title={t('composeEditor.quickTemplates')} style={{ marginTop: 16 }}>
                <Row gutter={[16, 16]}>
                  <Col xs={12} sm={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        const nginx = createEmptyService()
                        nginx.name = 'nginx'
                        nginx.image = 'nginx:latest'
                        nginx.ports = [{ id: generateId(), hostPort: '80', containerPort: '80', protocol: 'tcp' }]
                        setProject(prev => ({ ...prev, services: [...prev.services, nginx] }))
                        setSelectedId(nginx.id)
                        setSelectedType('service')
                      }}
                    >
                      <Space>
                        <CloudServerOutlined style={{ color: '#007AFF' }} />
                        <Text>Nginx</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        const mysql = createEmptyService()
                        mysql.name = 'mysql'
                        mysql.image = 'mysql:8.0'
                        mysql.ports = [{ id: generateId(), hostPort: '3306', containerPort: '3306', protocol: 'tcp' }]
                        mysql.environment = [
                          { id: generateId(), key: 'MYSQL_ROOT_PASSWORD', value: 'root123' }
                        ]
                        setProject(prev => ({ ...prev, services: [...prev.services, mysql] }))
                        setSelectedId(mysql.id)
                        setSelectedType('service')
                      }}
                    >
                      <Space>
                        <CloudServerOutlined style={{ color: '#007AFF' }} />
                        <Text>MySQL</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        const redis = createEmptyService()
                        redis.name = 'redis'
                        redis.image = 'redis:7'
                        redis.ports = [{ id: generateId(), hostPort: '6379', containerPort: '6379', protocol: 'tcp' }]
                        setProject(prev => ({ ...prev, services: [...prev.services, redis] }))
                        setSelectedId(redis.id)
                        setSelectedType('service')
                      }}
                    >
                      <Space>
                        <CloudServerOutlined style={{ color: '#007AFF' }} />
                        <Text>Redis</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        const postgres = createEmptyService()
                        postgres.name = 'postgres'
                        postgres.image = 'postgres:15'
                        postgres.ports = [{ id: generateId(), hostPort: '5432', containerPort: '5432', protocol: 'tcp' }]
                        postgres.environment = [
                          { id: generateId(), key: 'POSTGRES_PASSWORD', value: 'postgres123' }
                        ]
                        setProject(prev => ({ ...prev, services: [...prev.services, postgres] }))
                        setSelectedId(postgres.id)
                        setSelectedType('service')
                      }}
                    >
                      <Space>
                        <CloudServerOutlined style={{ color: '#007AFF' }} />
                        <Text>PostgreSQL</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        const mongo = createEmptyService()
                        mongo.name = 'mongo'
                        mongo.image = 'mongo:6'
                        mongo.ports = [{ id: generateId(), hostPort: '27017', containerPort: '27017', protocol: 'tcp' }]
                        setProject(prev => ({ ...prev, services: [...prev.services, mongo] }))
                        setSelectedId(mongo.id)
                        setSelectedType('service')
                      }}
                    >
                      <Space>
                        <CloudServerOutlined style={{ color: '#007AFF' }} />
                        <Text>MongoDB</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        const wordpress = createEmptyService()
                        wordpress.name = 'wordpress'
                        wordpress.image = 'wordpress:latest'
                        wordpress.ports = [{ id: generateId(), hostPort: '8080', containerPort: '80', protocol: 'tcp' }]
                        wordpress.environment = [
                          { id: generateId(), key: 'WORDPRESS_DB_HOST', value: 'db:3306' },
                          { id: generateId(), key: 'WORDPRESS_DB_PASSWORD', value: 'wordpress' }
                        ]
                        const db = createEmptyService()
                        db.name = 'db'
                        db.image = 'mysql:5.7'
                        db.environment = [
                          { id: generateId(), key: 'MYSQL_DATABASE', value: 'wordpress' },
                          { id: generateId(), key: 'MYSQL_PASSWORD', value: 'wordpress' }
                        ]
                        setProject(prev => ({ ...prev, services: [...prev.services, wordpress, db] }))
                        setSelectedId(wordpress.id)
                        setSelectedType('service')
                      }}
                    >
                      <Space>
                        <CloudServerOutlined style={{ color: '#007AFF' }} />
                        <Text>WordPress</Text>
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </Card>
            </div>
          </Content>

          {/* 底部 YAML 预览 */}
          <div style={{ height: 280, borderTop: '1px solid #f0f2f5', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #f0f2f5' }}>
              <Space size={4}>
                <FileOutlined style={{ color: '#007AFF' }} />
                <Text strong>{t('composeEditor.yamlPreview')}</Text>
              </Space>
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopyYaml}>
                {t('composeEditor.copy')}
              </Button>
            </div>
            <div style={{ flex: 1, padding: 8 }}>
              <TextArea
                value={yamlContent}
                readOnly
                style={{
                  height: '100%',
                  fontFamily: 'Monaco, Consolas, monospace',
                  fontSize: 13,
                  resize: 'none',
                  background: '#f5f5f5',
                  whiteSpace: 'pre',
                  overflow: 'auto'
                }}
                placeholder={t('composeEditor.yamlPlaceholder')}
              />
            </div>
          </div>
        </Layout>

        {/* 右侧属性面板 */}
        <Sider width={320} style={{ background: '#fff', borderLeft: '1px solid #f0f2f5', overflow: 'auto' }}>
          {selectedId ? (
            selectedType === 'service' && getSelectedService()
              ? renderServiceProperties(getSelectedService()!)
              : selectedType === 'network' && getSelectedNetwork()
              ? renderNetworkProperties(getSelectedNetwork()!)
              : selectedType === 'volume' && getSelectedVolume()
              ? renderVolumeProperties(getSelectedVolume()!)
              : renderEmptyProperties()
          ) : (
            renderEmptyProperties()
          )}
        </Sider>
      </Layout>

      {/* 导入 YAML 模态框 */}
      <Modal
        title={t('composeEditor.importYaml')}
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false)
          setImportYaml('')
        }}
        onOk={handleImportYaml}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={700}
      >
        <Alert
          type="info"
          message={t('composeEditor.importTip')}
          showIcon
          style={{ marginBottom: 16 }}
        />
        <TextArea
          value={importYaml}
          onChange={(e) => setImportYaml(e.target.value)}
          placeholder={t('composeEditor.importPlaceholder')}
          rows={15}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Modal>

    </Layout>
  )
}

export default ComposeEditor

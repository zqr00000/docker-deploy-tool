import React, { useState, useEffect } from 'react'
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Space,
  Radio,
  Upload,
  message,
  Spin,
  Typography,
  Alert,
  Table,
  Popconfirm,
  Modal,
  Tooltip
} from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { UploadOutlined, FileTextOutlined, PlusOutlined, DeleteOutlined, CheckCircleFilled, CloseCircleFilled, QuestionCircleFilled } from '@ant-design/icons'
import type { Server } from '../types/server'
import type { Template, EnvVariableSchema } from '../types/template'
import type { ComposeImageCheckItem } from '../types/electron-api'

interface EnvVariable {
  name: string
  value: string
}

const { TextArea } = Input
const { Text } = Typography

interface DeployFormProps {
  servers: Server[]
  templates: Template[]
  defaultTemplateId?: string
  onTemplateChange?: (templateId: string) => void
  templateEnvSchema?: EnvVariableSchema[]
  onDeploy: (values: {
    serverId: string
    appName: string
    templateId?: string
    dockerCompose: string
    projectPath: string
    envVariables: EnvVariable[]
    pullServices?: string[]
  }) => Promise<{ success: boolean; message: string }>
}

const extractEnvVariables = (dockerComposeContent: string): EnvVariable[] => {
  const envPattern = /\$\{([^}]+)\}/g
  const matches = dockerComposeContent.match(envPattern) || []
  const variables = new Set<string>()
  
  matches.forEach(match => {
    const varName = match.replace(/\$\{|\}/g, '')
    const defaultValueMatch = varName.match(/(.+?):-(.+)/)
    if (defaultValueMatch) {
      variables.add(defaultValueMatch[1])
    } else {
      variables.add(varName)
    }
  })

  return Array.from(variables).map(name => ({
    name,
    value: ''
  }))
}

const DeployForm: React.FC<DeployFormProps> = ({
  servers,
  templates,
  defaultTemplateId,
  onTemplateChange,
  templateEnvSchema,
  onDeploy
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [deployType, setDeployType] = useState<'template' | 'file'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [dockerCompose, setDockerCompose] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployProgress, setDeployProgress] = useState('')
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([])
  // 部署前镜像检查弹窗
  const [imageCheckModalOpen, setImageCheckModalOpen] = useState(false)
  const [imageCheckLoading, setImageCheckLoading] = useState(false)
  const [checkItems, setCheckItems] = useState<ComposeImageCheckItem[]>([])
  // 每个服务选择的处理方式：pull=在线拉取，upload=自行上传
  const [imageModes, setImageModes] = useState<Record<string, 'pull' | 'upload'>>({})
  // 每个服务「自行上传」的上传状态
  const [uploadStates, setUploadStates] = useState<Record<string, { status: 'idle' | 'uploading' | 'success' | 'error'; message?: string }>>({})
  // 暂存表单校验通过的值，用户在弹窗确认「开始部署」时使用
  const [pendingDeployValues, setPendingDeployValues] = useState<{
    serverId: string
    appName: string
    templateId?: string
    dockerCompose: string
    projectPath?: string
  } | null>(null)

  const onlineServers = servers.filter(s => s.status === 'online')

  useEffect(() => {
    if (defaultTemplateId) {
      const template = templates.find(t => t.id === defaultTemplateId)
      if (template) {
        setSelectedTemplate(template)
        setDockerCompose(template.dockerCompose)
        form.setFieldsValue({
          templateId: template.id,
          dockerCompose: template.dockerCompose
        })
      }
    }
  }, [defaultTemplateId, templates, form])

  useEffect(() => {
    if (selectedTemplate) {
      setDockerCompose(selectedTemplate.dockerCompose)
      form.setFieldsValue({
        templateId: selectedTemplate.id,
        dockerCompose: selectedTemplate.dockerCompose
      })
    }
  }, [selectedTemplate, form])

  useEffect(() => {
    if (templateEnvSchema && templateEnvSchema.length > 0) {
      const schemaVars = templateEnvSchema.map(schema => ({
        name: schema.name,
        value: schema.defaultValue || ''
      }))
      setEnvVariables(schemaVars)
    } else if (dockerCompose) {
      const extractedVars = extractEnvVariables(dockerCompose)
      const existingNames = new Set(envVariables.map(v => v.name))
      const newVars = extractedVars.map(v => {
        const existing = envVariables.find(ev => ev.name === v.name)
        return existing || v
      })
      setEnvVariables(newVars)
    }
  }, [dockerCompose, templateEnvSchema])

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    setSelectedTemplate(template || null)
    onTemplateChange?.(templateId)
  }

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setDockerCompose(content)
      form.setFieldsValue({ dockerCompose: content })
    }
    reader.readAsText(file)
    return false
  }

  const handleEnvVariableChange = (index: number, field: 'name' | 'value', value: string) => {
    const newVariables = [...envVariables]
    newVariables[index] = { ...newVariables[index], [field]: value }
    setEnvVariables(newVariables)
  }

  const addEnvVariable = () => {
    setEnvVariables([...envVariables, { name: '', value: '' }])
  }

  const removeEnvVariable = (index: number) => {
    setEnvVariables(envVariables.filter((_, i) => i !== index))
  }

  const handleDeploy = async () => {
    try {
      const values = await form.validateFields()

      if (!values.dockerCompose || !values.dockerCompose.includes('services:')) {
        message.error(t('template.invalidDockerCompose'))
        return
      }

      const serverId = values.serverId
      if (!serverId) {
        message.error(t('app.selectServerRequired'))
        return
      }

      const projectPath = values.projectPath || `/opt/docker-apps/${values.appName}`

      // 部署前镜像存在性校验：解析 compose 各服务的镜像并检查远端是否存在，供用户逐服务选择处理方式
      setImageCheckLoading(true)
      try {
        const result = await window.electronAPI.app.checkImages({
          serverId,
          dockerCompose: values.dockerCompose,
          envVariables
        })

        if (!result.success) {
          message.error(result.message || t('app.imageCheck.failed'))
          return
        }

        if (result.services.length === 0) {
          // 无可检查的镜像服务（如仅 build 型），直接部署
          await performDeploy({ ...values, projectPath }, [])
          return
        }

        // 初始化每个服务的处理方式（默认在线拉取）与上传状态
        const modes: Record<string, 'pull' | 'upload'> = {}
        const uploads: Record<string, { status: 'idle' | 'uploading' | 'success' | 'error'; message?: string }> = {}
        result.services.forEach(item => {
          modes[item.service] = 'pull'
          uploads[item.service] = { status: 'idle' }
        })
        setCheckItems(result.services)
        setImageModes(modes)
        setUploadStates(uploads)
        setPendingDeployValues({ ...values, projectPath })
        setImageCheckModalOpen(true)
      } catch (error) {
        console.error('Image check failed:', error)
        message.error(t('app.imageCheck.failed'))
      } finally {
        setImageCheckLoading(false)
      }
    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  // 实际执行部署（镜像检查弹窗确认后调用）
  const performDeploy = async (
    values: {
      serverId: string
      appName: string
      templateId?: string
      dockerCompose: string
      projectPath: string
    },
    pullServices: string[]
  ) => {
    const projectPath = values.projectPath || `/opt/docker-apps/${values.appName}`

    setDeploying(true)
    setDeployProgress(t('app.deploying'))

    try {
      const result = await onDeploy({
        serverId: values.serverId,
        appName: values.appName,
        templateId: values.templateId,
        dockerCompose: values.dockerCompose,
        projectPath,
        envVariables,
        pullServices
      })

      if (result.success) {
        message.success(result.message)
        navigate('/apps')
      } else {
        message.error(result.message)
      }
    } finally {
      setDeploying(false)
      setDeployProgress('')
    }
  }

  // 镜像检查弹窗确认：校验「自行上传」服务已完成上传后开始部署
  const handleStartDeploy = async () => {
    if (!pendingDeployValues) return

    const unfinishedUploads = checkItems.filter(item =>
      imageModes[item.service] === 'upload' && uploadStates[item.service]?.status !== 'success'
    )
    if (unfinishedUploads.length > 0) {
      message.warning(t('app.imageCheck.uploadRequired'))
      return
    }

    // 汇总选择「在线拉取」的服务名；其余（自行上传）服务跳过拉取
    const pullServices = checkItems
      .filter(item => imageModes[item.service] === 'pull')
      .map(item => item.service)

    setImageCheckModalOpen(false)
    await performDeploy(pendingDeployValues, pullServices)
  }

  // 「自行上传」：选择本地镜像包并上传到服务器（docker load）
  const handleUploadImage = async (service: string) => {
    const serverId = pendingDeployValues?.serverId || form.getFieldValue('serverId')
    if (!serverId) return

    setUploadStates(prev => ({ ...prev, [service]: { status: 'uploading' } }))
    try {
      const dialogResult = await window.electronAPI.image.showOpenDialog()
      if (dialogResult.canceled || !dialogResult.filePath) {
        setUploadStates(prev => ({ ...prev, [service]: { status: 'idle' } }))
        return
      }

      const result = await window.electronAPI.image.import(serverId, dialogResult.filePath)
      if (result.success) {
        setUploadStates(prev => ({ ...prev, [service]: { status: 'success' } }))
        message.success(t('app.imageCheck.uploadSuccess'))
      } else {
        setUploadStates(prev => ({ ...prev, [service]: { status: 'error', message: result.message } }))
        message.error(result.message || t('app.imageCheck.uploadFailed'))
      }
    } catch (error) {
      console.error('Image upload failed:', error)
      setUploadStates(prev => ({ ...prev, [service]: { status: 'error', message: (error as Error).message } }))
      message.error(t('app.imageCheck.uploadFailed'))
    }
  }

  // 批量上传：可多选镜像包一次上传（一个 tar 内可能包含多个镜像），上传后重新校验镜像是否就绪
  const handleBatchUpload = async () => {
    const serverId = pendingDeployValues?.serverId || form.getFieldValue('serverId')
    const compose = pendingDeployValues?.dockerCompose
    if (!serverId || !compose) return

    const uploadServices = checkItems.filter(item => imageModes[item.service] === 'upload').map(item => item.service)
    if (uploadServices.length === 0) return

    // 全部标记为上传中
    setUploadStates(prev => {
      const next = { ...prev }
      uploadServices.forEach(s => { next[s] = { status: 'uploading' } })
      return next
    })

    try {
      const dialogResult = await window.electronAPI.image.showOpenDialogMulti()
      const files = (dialogResult.filePaths || []).filter(Boolean)
      if (dialogResult.canceled || files.length === 0) {
        setUploadStates(prev => {
          const next = { ...prev }
          uploadServices.forEach(s => { next[s] = { status: 'idle' } })
          return next
        })
        return
      }

      let successCount = 0
      let failCount = 0
      for (const file of files) {
        const result = await window.electronAPI.image.import(serverId, file)
        if (result.success) {
          successCount += 1
        } else {
          failCount += 1
          console.warn(`Failed to import image package ${file}: ${result.message}`)
        }
      }
      if (successCount > 0) message.success(t('app.imageCheck.batchUploadImported', { count: successCount }))
      if (failCount > 0) message.error(t('app.imageCheck.batchUploadFailed', { count: failCount }))

      // 重新校验镜像存在性：已就绪的「自行上传」服务自动标记为已上传
      const recheck = await window.electronAPI.app.checkImages({
        serverId,
        dockerCompose: compose,
        envVariables
      })
      const existsMap = new Map(recheck.services.map(item => [item.service, item.exists]))
      setUploadStates(prev => {
        const next = { ...prev }
        uploadServices.forEach(s => {
          next[s] = existsMap.get(s) ? { status: 'success' } : { status: 'idle' }
        })
        return next
      })
    } catch (error) {
      console.error('Batch image upload failed:', error)
      setUploadStates(prev => {
        const next = { ...prev }
        uploadServices.forEach(s => { next[s] = { status: 'idle' } })
        return next
      })
      message.error(t('app.imageCheck.uploadFailed'))
    }
  }

  // 一键统一所有服务的处理方式
  const setAllImageModes = (mode: 'pull' | 'upload') => {
    const next: Record<string, 'pull' | 'upload'> = {}
    checkItems.forEach(item => { next[item.service] = mode })
    setImageModes(next)
  }

  const handleCancel = () => {
    navigate('/apps')
  }

  // 是否存在选择「自行上传」的服务、是否正处于批量上传中
  const hasUploadMode = checkItems.some(item => imageModes[item.service] === 'upload')
  const isBatchUploading = checkItems.some(item =>
    imageModes[item.service] === 'upload' && uploadStates[item.service]?.status === 'uploading'
  )

  return (
    <div>
      <Card
        title={t('app.deploy')}
        extra={
          <Button onClick={handleCancel}>
            {t('common.back')}
          </Button>
        }
      >
        {deploying && (
          <Alert
            message={deployProgress}
            type="info"
            showIcon
            icon={<Spin size="small" />}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            serverId: onlineServers.length > 0 ? onlineServers[0].id : undefined,
            deployType: 'template'
          }}
        >
          <Form.Item
            name="serverId"
            label={t('app.selectServer')}
            rules={[{ required: true, message: t('app.selectServerRequired') }]}
          >
            <Select placeholder={t('app.selectServerPlaceholder')}>
              {onlineServers.map(server => (
                <Select.Option key={server.id} value={server.id} disabled={server.status !== 'online'}>
                  {server.name} ({server.host}) - {server.status === 'online' ? t('server.connected') : t('server.disconnected')}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {onlineServers.length === 0 && (
            <Alert
              message={t('app.noOnlineServers')}
              description={t('app.noOnlineServersDescription')}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item
            name="appName"
            label={t('app.name')}
            rules={[
              { required: true, message: t('app.nameRequired') },
              { pattern: /^[a-zA-Z0-9-_]+$/, message: t('app.namePattern') }
            ]}
          >
            <Input placeholder={t('app.namePlaceholder')} disabled={deploying} />
          </Form.Item>

          <Form.Item
            name="deployType"
            label={t('app.deployType')}
          >
            <Radio.Group
              value={deployType}
              onChange={(e) => {
                setDeployType(e.target.value)
                form.setFieldsValue({ deployType: e.target.value })
              }}
              disabled={deploying}
            >
              <Radio.Button value="template">{t('app.useTemplate')}</Radio.Button>
              <Radio.Button value="file">{t('app.uploadFile')}</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {deployType === 'template' && (
            <Form.Item
              name="templateId"
              label={t('app.selectTemplate')}
              rules={[{ required: deployType === 'template', message: t('app.selectTemplateRequired') }]}
            >
              <Select
                placeholder={t('app.selectTemplatePlaceholder')}
                onChange={handleTemplateChange}
                disabled={deploying}
              >
                {templates.map(template => (
                  <Select.Option key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {deployType === 'file' && (
            <Form.Item label={t('app.dockerComposeFile')}>
              <Upload
                accept=".yml,.yaml"
                beforeUpload={handleFileUpload}
                showUploadList={false}
                disabled={deploying}
              >
                <Button icon={<UploadOutlined />} disabled={deploying}>
                  {t('app.selectDockerComposeFile')}
                </Button>
              </Upload>
            </Form.Item>
          )}

          <Form.Item
            name="dockerCompose"
            label={t('app.dockerCompose')}
            rules={[
              { required: true, message: t('app.dockerComposeRequired') }
            ]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('app.dockerComposeTip')}
              </Text>
            }
          >
            <TextArea
              rows={12}
              placeholder={t('app.dockerComposePlaceholder')}
              value={dockerCompose}
              onChange={(e) => {
                setDockerCompose(e.target.value)
                form.setFieldsValue({ dockerCompose: e.target.value })
              }}
              style={{
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                fontSize: 12
              }}
              disabled={deploying}
            />
          </Form.Item>

          <Form.Item
            name="projectPath"
            label={t('app.projectPath')}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('app.projectPathDefault')}: /opt/docker-apps/&#123;appName&#125;
              </Text>
            }
          >
            <Input
              placeholder={`/opt/docker-apps/${form.getFieldValue('appName') || '<app-name>'}`}
              disabled={deploying}
            />
          </Form.Item>

          <Form.Item
            label={t('app.envVariables')}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('app.envVariablesTip')}
              </Text>
            }
          >
            <Card
              title={t('app.envVariables')}
              extra={
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={addEnvVariable}
                  disabled={deploying}
                >
                  {t('app.addEnvVariable')}
                </Button>
              }
              style={{ marginBottom: 16 }}
            >
              {envVariables.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#999', padding: '16px' }}>
                  {t('app.noEnvVariables')}
                </p>
              ) : (
                <Table
                  dataSource={envVariables}
                  pagination={false}
                  bordered
                  rowKey={(record, index) => index?.toString() ?? ''}
                  columns={[
                    {
                      title: t('app.variableName'),
                      dataIndex: 'name',
                      width: '30%',
                      render: (_, record, index) => (
                        <Input
                          value={record.name}
                          onChange={(e) => handleEnvVariableChange(index ?? 0, 'name', e.target.value)}
                          placeholder={t('app.variableNamePlaceholder')}
                          disabled={deploying}
                        />
                      )
                    },
                    {
                      title: t('app.variableValue'),
                      dataIndex: 'value',
                      width: '50%',
                      render: (_, record, index) => (
                        <Input
                          value={record.value}
                          onChange={(e) => handleEnvVariableChange(index ?? 0, 'value', e.target.value)}
                          placeholder={t('app.variableValuePlaceholder')}
                          disabled={deploying}
                        />
                      )
                    },
                    {
                      title: t('common.actions'),
                      width: '20%',
                      render: (_, __, index) => (
                        <Popconfirm
                          title={t('app.confirmDeleteEnvVariable')}
                          onConfirm={() => removeEnvVariable(index ?? 0)}
                          okText={t('common.yes')}
                          cancelText={t('common.no')}
                        >
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={deploying}
                          >
                            {t('common.delete')}
                          </Button>
                        </Popconfirm>
                      )
                    }
                  ]}
                />
              )}
            </Card>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                onClick={handleDeploy}
                loading={deploying || imageCheckLoading}
                disabled={onlineServers.length === 0}
                icon={<FileTextOutlined />}
              >
                {imageCheckLoading ? t('app.imageCheck.checking') : deploying ? t('app.deploying') : t('app.deploy')}
              </Button>
              <Button onClick={handleCancel} disabled={deploying}>
                {t('common.cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 部署前镜像校验弹窗：逐服务选择「在线拉取 / 自行上传」 */}
      <Modal
        title={t('app.imageCheck.title')}
        open={imageCheckModalOpen}
        width={900}
        maskClosable={false}
        onCancel={() => setImageCheckModalOpen(false)}
        onOk={handleStartDeploy}
        okText={t('app.imageCheck.startDeploy')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: deploying }}
      >
        <Alert
          type="info"
          showIcon
          message={t('app.imageCheck.desc')}
          style={{ marginBottom: 12 }}
        />
        {/* 批量操作：一键统一处理方式 + 批量上传镜像包 */}
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <Space size={8}>
            <Button size="small" onClick={() => setAllImageModes('pull')}>{t('app.imageCheck.allPull')}</Button>
            <Button size="small" onClick={() => setAllImageModes('upload')}>{t('app.imageCheck.allUpload')}</Button>
          </Space>
          {hasUploadMode && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<UploadOutlined />}
              onClick={handleBatchUpload}
              loading={isBatchUploading}
            >
              {t('app.imageCheck.batchUpload')}
            </Button>
          )}
        </Space>
        <Table
          dataSource={checkItems}
          rowKey={(record) => record.service}
          pagination={false}
          size="small"
          bordered
          columns={[
            {
              title: t('app.imageCheck.table.service'),
              dataIndex: 'service',
              width: 150,
              ellipsis: true
            },
            {
              title: t('app.imageCheck.table.image'),
              dataIndex: 'image',
              ellipsis: true,
              render: (_, record) => (
                <Tooltip title={record.image}>
                  <Text style={{ fontFamily: 'Monaco, Consolas, "Courier New", monospace', fontSize: 12 }} ellipsis>
                    {record.image}
                  </Text>
                </Tooltip>
              )
            },
            {
              title: t('app.imageCheck.table.status'),
              width: 130,
              render: (_, record) => {
                if (!record.checked) {
                  return (
                    <Tooltip title={record.reason}>
                      <Space size={4}>
                        <QuestionCircleFilled style={{ color: '#8c8c8c' }} />
                        <Text type="secondary">{t('app.imageCheck.unchecked')}</Text>
                      </Space>
                    </Tooltip>
                  )
                }
                return record.exists ? (
                  <Space size={4}>
                    <CheckCircleFilled style={{ color: '#52c41a' }} />
                    <Text style={{ color: '#52c41a' }}>{t('app.imageCheck.exists')}</Text>
                  </Space>
                ) : (
                  <Space size={4}>
                    <CloseCircleFilled style={{ color: '#ff4d4f' }} />
                    <Text style={{ color: '#ff4d4f' }}>{t('app.imageCheck.missing')}</Text>
                  </Space>
                )
              }
            },
            {
              title: t('app.imageCheck.table.mode'),
              width: 210,
              render: (_, record) => (
                <Radio.Group
                  size="small"
                  value={imageModes[record.service] || 'pull'}
                  onChange={(e) => setImageModes(prev => ({ ...prev, [record.service]: e.target.value }))}
                  disabled={!record.checked || deploying}
                >
                  <Radio.Button value="pull">{t('app.imageCheck.modePull')}</Radio.Button>
                  <Radio.Button value="upload">{t('app.imageCheck.modeUpload')}</Radio.Button>
                </Radio.Group>
              )
            },
            {
              title: t('common.actions'),
              width: 170,
              render: (_, record) => {
                if (imageModes[record.service] !== 'upload') return null
                const state = uploadStates[record.service] || { status: 'idle' }
                if (state.status === 'uploading') {
                  return <Spin size="small" />
                }
                if (state.status === 'success') {
                  return (
                    <Space size={4}>
                      <CheckCircleFilled style={{ color: '#52c41a' }} />
                      <Text style={{ color: '#52c41a' }}>{t('app.imageCheck.uploaded')}</Text>
                    </Space>
                  )
                }
                return (
                  <Button
                    size="small"
                    icon={<UploadOutlined />}
                    onClick={() => handleUploadImage(record.service)}
                  >
                    {t('app.imageCheck.upload')}
                  </Button>
                )
              }
            }
          ]}
        />
      </Modal>
    </div>
  )
}

export default DeployForm

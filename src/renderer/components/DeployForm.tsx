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
  Alert
} from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons'
import type { Server } from '../types/server'
import type { Template } from '../types/template'

const { TextArea } = Input
const { Text } = Typography

interface DeployFormProps {
  servers: Server[]
  templates: Template[]
  defaultTemplateId?: string
  onDeploy: (values: {
    serverId: string
    appName: string
    templateId?: string
    dockerCompose: string
    projectPath: string
  }) => Promise<{ success: boolean; message: string }>
}

const DeployForm: React.FC<DeployFormProps> = ({
  servers,
  templates,
  defaultTemplateId,
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

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    setSelectedTemplate(template || null)
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

  const handleDeploy = async () => {
    try {
      const values = await form.validateFields()

      if (!values.dockerCompose || !values.dockerCompose.includes('version:')) {
        message.error(t('template.invalidDockerCompose'))
        return
      }

      const projectPath = values.projectPath || `/opt/docker-apps/${values.appName}`

      setDeploying(true)
      setDeployProgress(t('app.deploying'))

      const result = await onDeploy({
        serverId: values.serverId,
        appName: values.appName,
        templateId: values.templateId,
        dockerCompose: values.dockerCompose,
        projectPath
      })

      if (result.success) {
        message.success(result.message)
        navigate('/apps')
      } else {
        message.error(result.message)
      }
    } catch (error) {
      console.error('Validation failed:', error)
    } finally {
      setDeploying(false)
      setDeployProgress('')
    }
  }

  const handleCancel = () => {
    navigate('/apps')
  }

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

          <Form.Item>
            <Space>
              <Button
                type="primary"
                onClick={handleDeploy}
                loading={deploying}
                disabled={onlineServers.length === 0}
                icon={<FileTextOutlined />}
              >
                {deploying ? t('app.deploying') : t('app.deploy')}
              </Button>
              <Button onClick={handleCancel} disabled={deploying}>
                {t('common.cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default DeployForm

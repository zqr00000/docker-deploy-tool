import React, { useEffect, useState } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Tag,
  Table,
  Popconfirm,
  Checkbox
} from 'antd'
import { useTranslation } from 'react-i18next'
import type { Template, TemplateFormData, EnvVariableSchema } from '../types/template'
import { CATEGORY_LABELS, ALL_CATEGORIES } from '../types/template'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'

const { TextArea } = Input

const extractEnvVariables = (dockerComposeContent: string): EnvVariableSchema[] => {
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
    defaultValue: '',
    description: '',
    required: false
  }))
}

interface TemplateEditorProps {
  open: boolean
  template?: Template | null
  onSave: (values: TemplateFormData) => void
  onCancel: () => void
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({
  open,
  template,
  onSave,
  onCancel
}) => {
  const { t, i18n } = useTranslation()
  const [form] = Form.useForm()
  const [extractedVariables, setExtractedVariables] = useState<EnvVariableSchema[]>([])
  const [envSchema, setEnvSchema] = useState<EnvVariableSchema[]>([])
  const isEdit = !!template

  useEffect(() => {
    if (open) {
      if (template) {
        form.setFieldsValue({
          name: template.name,
          description: template.description,
          category: template.category,
          dockerCompose: template.dockerCompose
        })
        setExtractedVariables(extractEnvVariables(template.dockerCompose))
        setEnvSchema(template.envSchema || [])
      } else {
        form.resetFields()
        form.setFieldsValue({
          category: 'app'
        })
        setExtractedVariables([])
        setEnvSchema([])
      }
    }
  }, [open, template, form])

  useEffect(() => {
    const dockerComposeValue = form.getFieldValue('dockerCompose') as string
    if (dockerComposeValue) {
      setExtractedVariables(extractEnvVariables(dockerComposeValue))
    }
  }, [form])

  const handleEnvSchemaChange = (index: number, field: keyof EnvVariableSchema, value: string | boolean) => {
    const newSchema = [...envSchema]
    newSchema[index] = { ...newSchema[index], [field]: value }
    setEnvSchema(newSchema)
  }

  const addEnvVariable = () => {
    setEnvSchema([...envSchema, { name: '', defaultValue: '', description: '', required: false }])
  }

  const removeEnvVariable = (index: number) => {
    setEnvSchema(envSchema.filter((_, i) => i !== index))
  }

  const extractVariablesToSchema = () => {
    const dockerComposeValue = form.getFieldValue('dockerCompose') as string
    if (!dockerComposeValue) {
      message.warning(t('template.dockerComposeRequired'))
      return
    }
    
    const extracted = extractEnvVariables(dockerComposeValue)
    const existingNames = new Set(envSchema.map(v => v.name))
    const newVariables = extracted.filter(v => !existingNames.has(v.name))
    
    if (newVariables.length === 0) {
      message.info(t('template.noNewVariables'))
      return
    }
    
    setEnvSchema([...envSchema, ...newVariables])
    message.success(t('template.variablesExtracted', { count: newVariables.length }))
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      
      if (!values.dockerCompose.includes('version:')) {
        message.error(t('template.invalidDockerCompose'))
        return
      }
      
      onSave({
        ...values,
        envSchema
      })
    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  const handleCategoryChange = () => {
  }

  return (
    <Modal
      title={isEdit ? t('template.edit') : t('template.add')}
      open={open}
      onCancel={onCancel}
      footer={
        <Space>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      }
      width={700}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="name"
          label={t('template.name')}
          rules={[
            { required: true, message: t('template.nameRequired') }
          ]}
        >
          <Input placeholder={t('template.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="description"
          label={t('template.description')}
          rules={[
            { required: true, message: t('template.descriptionRequired') }
          ]}
        >
          <Input.TextArea
            placeholder={t('template.descriptionPlaceholder')}
            rows={2}
          />
        </Form.Item>

        <Form.Item
          name="category"
          label={t('template.category')}
          rules={[
            { required: true, message: t('template.categoryRequired') }
          ]}
        >
          <Select onChange={handleCategoryChange}>
            {ALL_CATEGORIES.map(cat => (
              <Select.Option key={cat} value={cat}>
                {CATEGORY_LABELS[cat][i18n.language === 'zh-CN' ? 'zh' : 'en']}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="dockerCompose"
          label={t('template.dockerCompose')}
          rules={[
            { required: true, message: t('template.dockerComposeRequired') }
          ]}
          extra={
            <span style={{ color: '#999', fontSize: 12 }}>
              {t('template.dockerComposeTip')}
            </span>
          }
        >
          <TextArea
            placeholder={t('template.dockerComposePlaceholder')}
            rows={12}
            style={{
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              fontSize: 12
            }}
          />
        </Form.Item>

        {extractedVariables.length > 0 && (
          <Form.Item
            label={t('app.envVariables')}
            extra={
              <span style={{ color: '#999', fontSize: 12 }}>
                {t('app.envVariablesTip')}
              </span>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: 8 }}>
              {extractedVariables.map((varItem, index) => (
                <Tag key={index} color="blue">
                  {varItem.name}
                </Tag>
              ))}
            </div>
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={extractVariablesToSchema}
            >
              {t('template.extractVariables')}
            </Button>
          </Form.Item>
        )}

        <Form.Item
          label={t('template.envSchema')}
          extra={
            <span style={{ color: '#999', fontSize: 12 }}>
              {t('template.envSchemaTip')}
            </span>
          }
        >
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={addEnvVariable}
            style={{ marginBottom: 8 }}
          >
            {t('template.addEnvVariable')}
          </Button>
          
          {envSchema.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '16px' }}>
              {t('template.noEnvSchema')}
            </p>
          ) : (
            <Table
              dataSource={envSchema}
              pagination={false}
              bordered
              rowKey={(record, index) => index?.toString() ?? ''}
              columns={[
                {
                  title: t('template.variableName'),
                  dataIndex: 'name',
                  width: '20%',
                  render: (_, record, index) => (
                    <Input
                      value={record.name}
                      onChange={(e) => handleEnvSchemaChange(index, 'name', e.target.value)}
                      placeholder={t('template.variableNamePlaceholder')}
                    />
                  )
                },
                {
                  title: t('template.defaultValue'),
                  dataIndex: 'defaultValue',
                  width: '20%',
                  render: (_, record, index) => (
                    <Input
                      value={record.defaultValue}
                      onChange={(e) => handleEnvSchemaChange(index, 'defaultValue', e.target.value)}
                      placeholder={t('template.defaultValuePlaceholder')}
                    />
                  )
                },
                {
                  title: t('template.description'),
                  dataIndex: 'description',
                  width: '35%',
                  render: (_, record, index) => (
                    <Input
                      value={record.description}
                      onChange={(e) => handleEnvSchemaChange(index, 'description', e.target.value)}
                      placeholder={t('template.descriptionPlaceholder')}
                    />
                  )
                },
                {
                  title: t('template.required'),
                  dataIndex: 'required',
                  width: '15%',
                  render: (_, record, index) => (
                    <Checkbox
                      checked={record.required}
                      onChange={(e) => handleEnvSchemaChange(index, 'required', e.target.checked)}
                    />
                  )
                },
                {
                  title: t('common.actions'),
                  width: '10%',
                  render: (_, __, index) => (
                    <Popconfirm
                      title={t('template.confirmDeleteEnvVariable')}
                      onConfirm={() => removeEnvVariable(index)}
                      okText={t('common.yes')}
                      cancelText={t('common.no')}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                      >
                        {t('common.delete')}
                      </Button>
                    </Popconfirm>
                  )
                }
              ]}
            />
          )}
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default TemplateEditor

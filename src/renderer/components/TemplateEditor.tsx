import React, { useEffect } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  message
} from 'antd'
import { useTranslation } from 'react-i18next'
import type { Template, TemplateFormData } from '../types/template'
import { CATEGORY_LABELS, ALL_CATEGORIES } from '../types/template'

const { TextArea } = Input

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
      } else {
        form.resetFields()
        form.setFieldsValue({
          category: 'app'
        })
      }
    }
  }, [open, template, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      
      // 简单的 YAML 语法验证
      if (!values.dockerCompose.includes('version:')) {
        message.error(t('template.invalidDockerCompose'))
        return
      }
      
      onSave(values)
    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  const handleCategoryChange = () => {
    // 可以在这里添加根据分类自动填充模板的逻辑
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
      </Form>
    </Modal>
  )
}

export default TemplateEditor

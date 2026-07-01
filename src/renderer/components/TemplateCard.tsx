import React, { useState } from 'react'
import {
  Card,
  Tag,
  Typography,
  Button,
  Space,
  Modal,
  message,
  Tooltip,
  Popconfirm,
  Descriptions,
  Badge,
  List,
  Divider
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  RocketOutlined,
  CodeOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  ClusterOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Template } from '../types/template'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../types/template'
import TemplateEditor from './TemplateEditor'

const { Text, Paragraph } = Typography

interface TemplateCardProps {
  template: Template
  onUseTemplate?: (template: Template) => void
  onEdit?: (template: Template) => void
  onDelete?: (id: string) => void
  onShowDetail?: (template: Template) => void
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onUseTemplate,
  onEdit,
  onDelete,
  onShowDetail
}) => {
  const { t, i18n } = useTranslation()
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)

  const isBuiltIn = template.isBuiltIn
  const isStack = template.category === 'stack'
  const categoryLabel = CATEGORY_LABELS[template.category]?.[i18n.language === 'zh-CN' ? 'zh' : 'en'] || template.category
  const categoryColor = CATEGORY_COLORS[template.category] || 'default'

  const handleUseTemplate = () => {
    if (onUseTemplate) {
      onUseTemplate(template)
    }
  }

  const handleEdit = () => {
    if (isBuiltIn) {
      message.warning(t('template.cannotEditBuiltIn'))
      return
    }
    setEditModalVisible(true)
  }

  const handleDelete = () => {
    if (onDelete) {
      onDelete(template.id)
    }
  }

  const handleExport = () => {
    const exportData = {
      name: template.name,
      description: template.description,
      category: template.category,
      dockerCompose: template.dockerCompose,
      envSchema: template.envSchema
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `template-${template.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    message.success(t('template.exportSuccess'))
  }

  const handleEditSave = (values: Partial<Template>) => {
    if (onEdit) {
      onEdit({ ...template, ...values })
    }
    setEditModalVisible(false)
  }

  const handleShowDetail = () => {
    if (onShowDetail) {
      onShowDetail(template)
    }
  }

  const getServicesFromCompose = () => {
    const lines = template.dockerCompose.split('\n')
    const services: string[] = []
    let inServices = false
    for (const line of lines) {
      if (line.trim() === 'services:') {
        inServices = true
        continue
      }
      if (inServices) {
        if (line.match(/^\s{2}\w+:\s*$/) || line.match(/^\s{2}\w+:\s/)) {
          const serviceName = line.trim().replace(':', '')
          if (serviceName && !serviceName.startsWith('#')) {
            services.push(serviceName)
          }
        } else if (line.match(/^\w+:/)) {
          break
        }
      }
    }
    return services
  }

  const services = getServicesFromCompose()

  return (
    <>
      <Card
        hoverable
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        cover={
          <div
            style={{
              background: isStack
                ? 'linear-gradient(135deg, #f5222d 0%, #ff7875 100%)'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            {isStack ? (
              <ClusterOutlined style={{ fontSize: 36, color: '#fff' }} />
            ) : (
              <AppstoreOutlined style={{ fontSize: 36, color: '#fff' }} />
            )}
            {isStack && (
              <Badge
                count={services.length}
                style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#faad14' }}
              />
            )}
          </div>
        }
        actions={[
          <Tooltip key="use" title={t('template.use')}>
            <Button
              type="text"
              icon={<RocketOutlined />}
              onClick={handleUseTemplate}
            >
              {t('template.use')}
            </Button>
          </Tooltip>,
          <Tooltip key="detail" title={t('template.viewDetail')}>
            <Button
              type="text"
              icon={<InfoCircleOutlined />}
              onClick={handleShowDetail}
            >
              {t('template.viewDetail')}
            </Button>
          </Tooltip>,
          <Tooltip key="preview" title={t('template.preview')}>
            <Button
              type="text"
              icon={<CodeOutlined />}
              onClick={() => setPreviewVisible(true)}
            >
              {t('template.preview')}
            </Button>
          </Tooltip>,
          <Tooltip key="export" title={t('template.export')}>
            <Button
              type="text"
              icon={<ExportOutlined />}
              onClick={handleExport}
            >
              {t('template.export')}
            </Button>
          </Tooltip>,
          isBuiltIn ? (
            <Tooltip key="edit" title={t('template.cannotEditBuiltIn')}>
              <Button type="text" icon={<EditOutlined />} disabled>
                {t('common.edit')}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip key="edit" title={t('common.edit')}>
              <Button type="text" icon={<EditOutlined />} onClick={handleEdit}>
                {t('common.edit')}
              </Button>
            </Tooltip>
          ),
          isBuiltIn ? (
            <Tooltip key="delete" title={t('template.cannotDeleteBuiltIn')}>
              <Button type="text" danger icon={<DeleteOutlined />} disabled>
                {t('common.delete')}
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm
              key="delete"
              title={t('template.confirmDelete')}
              onConfirm={handleDelete}
              okText={t('common.yes')}
              cancelText={t('common.no')}
            >
              <Button type="text" danger icon={<DeleteOutlined />}>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          )
        ]}
      >
        <Card.Meta
          title={
            <Space>
              <span>{template.name}</span>
              {isBuiltIn && <Tag color="gold">{t('template.builtIn')}</Tag>}
              {isStack && <Tag color="red">{t('template.appStackTag')}</Tag>}
            </Space>
          }
          description={
            <>
              <Tag color={categoryColor} style={{ marginBottom: 8 }}>
                {categoryLabel}
              </Tag>
              {isStack && services.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('template.services')}: {services.slice(0, 3).join(', ')}
                    {services.length > 3 && ` +${services.length - 3}`}
                  </Text>
                </div>
              )}
              <Paragraph
                type="secondary"
                ellipsis={{ rows: 2, expandable: false }}
                style={{ marginBottom: 0, fontSize: 13 }}
              >
                {template.description}
              </Paragraph>
              {template.envSchema.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('template.envCount', { count: template.envSchema.length })}
                  </Text>
                </div>
              )}
            </>
          }
        />
      </Card>

      {/* Preview Modal */}
      <Modal
        title={
          <Space>
            <CodeOutlined />
            <span>{template.name}</span>
            {isStack && <Tag color="red">{t('template.appStackTag')}</Tag>}
          </Space>
        }
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            {t('common.close')}
          </Button>,
          <Button key="deploy" type="primary" onClick={() => {
            handleUseTemplate()
            setPreviewVisible(false)
          }}>
            {t('template.deploy')}
          </Button>
        ]}
        width={800}
      >
        <div>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('template.category')}>
              <Tag color={categoryColor}>{categoryLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('template.description')}>
              {template.description}
            </Descriptions.Item>
            {isStack && services.length > 0 && (
              <Descriptions.Item label={t('template.services')}>
                <Space wrap>
                  {services.map((svc, idx) => (
                    <Tag key={idx} color="blue">{svc}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            {template.envSchema.length > 0 && (
              <Descriptions.Item label={t('template.envVariables')}>
                <Space wrap>
                  {template.envSchema.map((env, idx) => (
                    <Tag key={idx} color={env.required ? 'red' : 'default'}>
                      {env.name}{env.required ? ' *' : ''}
                    </Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          <Text strong>{t('template.dockerCompose')}:</Text>
          <pre
            style={{
              background: '#f5f5f5',
              padding: 16,
              borderRadius: 4,
              marginTop: 8,
              overflow: 'auto',
              maxHeight: 400,
              fontSize: 12,
              fontFamily: 'Monaco, Consolas, monospace'
            }}
          >
            {template.dockerCompose}
          </pre>
        </div>
      </Modal>

      {/* Edit Modal */}
      <TemplateEditor
        open={editModalVisible}
        template={template}
        onSave={handleEditSave}
        onCancel={() => setEditModalVisible(false)}
      />
    </>
  )
}

export default TemplateCard

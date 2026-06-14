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
  Popconfirm
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  RocketOutlined,
  CodeOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Template } from '../types/template'
import { CATEGORY_LABELS } from '../types/template'
import TemplateEditor from './TemplateEditor'

const { Text, Paragraph } = Typography

interface TemplateCardProps {
  template: Template
  onUseTemplate?: (template: Template) => void
  onEdit?: (template: Template) => void
  onDelete?: (id: string) => void
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onUseTemplate,
  onEdit,
  onDelete
}) => {
  const { t, i18n } = useTranslation()
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)

  const isBuiltIn = template.isBuiltIn
  const categoryLabel = CATEGORY_LABELS[template.category]?.[i18n.language === 'zh-CN' ? 'zh' : 'en'] || template.category

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

  const handleEditSave = (values: Partial<Template>) => {
    if (onEdit) {
      onEdit({ ...template, ...values })
    }
    setEditModalVisible(false)
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      web: 'blue',
      database: 'green',
      cache: 'orange',
      cms: 'purple',
      app: 'cyan'
    }
    return colors[category] || 'default'
  }

  return (
    <>
      <Card
        hoverable
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        cover={
          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CodeOutlined style={{ fontSize: 32, color: '#fff' }} />
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
          <Tooltip key="preview" title={t('template.preview')}>
            <Button
              type="text"
              icon={<CodeOutlined />}
              onClick={() => setPreviewVisible(true)}
            >
              {t('template.preview')}
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
            </Space>
          }
          description={
            <>
              <Tag color={getCategoryColor(template.category)} style={{ marginBottom: 8 }}>
                {categoryLabel}
              </Tag>
              <Paragraph
                type="secondary"
                ellipsis={{ rows: 2, expandable: false }}
                style={{ marginBottom: 0, fontSize: 13 }}
              >
                {template.description}
              </Paragraph>
            </>
          }
        />
      </Card>

      <Modal
        title={template.name}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            {t('common.close')}
          </Button>
        ]}
        width={700}
      >
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
      </Modal>

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

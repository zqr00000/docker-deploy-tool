import React, { useState, useEffect, useMemo } from 'react'
import {
  Card,
  Typography,
  Space,
  Input,
  Button,
  Tag,
  message,
  Spin
} from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TemplateCard from '../components/TemplateCard'
import TemplateEditor from '../components/TemplateEditor'
import type { Template, TemplateFormData, TemplateCategory } from '../types/template'
import { CATEGORY_LABELS, ALL_CATEGORIES } from '../types/template'

const { Title, Text } = Typography

const Templates: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all')
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const allTemplates = await window.electronAPI.template.getAll() as Template[]
      setTemplates(allTemplates)
      setInitialized(true)
    } catch (error) {
      console.error('Failed to load templates:', error)
      setTemplates([])
      setInitialized(true)
    } finally {
      setLoading(false)
    }
  }

  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchText.toLowerCase()) ||
        template.description.toLowerCase().includes(searchText.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [templates, searchText, selectedCategory])

  const handleUseTemplate = (template: Template) => {
    navigate('/apps/deploy', { state: { templateId: template.id } })
  }

  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
    setEditorVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.template.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      message.success(t('template.deleteSuccess'))
    } catch (error) {
      message.error(t('common.error'))
    }
  }

  const handleAdd = () => {
    setEditingTemplate(null)
    setEditorVisible(true)
  }

  const handleSave = async (values: TemplateFormData) => {
    try {
      if (editingTemplate) {
        await window.electronAPI.template.update(editingTemplate.id, values)
        setTemplates(prev =>
          prev.map(t =>
            t.id === editingTemplate.id
              ? { ...t, ...values }
              : t
          )
        )
        message.success(t('common.success'))
      } else {
        const newTemplate = await window.electronAPI.template.create(values) as Template
        setTemplates(prev => [...prev, newTemplate])
        message.success(t('common.success'))
      }
      setEditorVisible(false)
    } catch (error) {
      message.error(t('common.error'))
    }
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

  if (loading && !initialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="templates-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('template.title')}</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadTemplates}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('template.add')}
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder={t('template.searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
          />
          <Space wrap>
            <Text>{t('template.categoryFilter')}:</Text>
            <Tag
              color={selectedCategory === 'all' ? 'blue' : 'default'}
              onClick={() => setSelectedCategory('all')}
              style={{ cursor: 'pointer' }}
            >
              {t('template.all')}
            </Tag>
            {ALL_CATEGORIES.map(cat => (
              <Tag
                key={cat}
                color={selectedCategory === cat ? getCategoryColor(cat) : 'default'}
                onClick={() => setSelectedCategory(cat)}
                style={{ cursor: 'pointer' }}
              >
                {CATEGORY_LABELS[cat][i18n.language === 'zh-CN' ? 'zh' : 'en']}
              </Tag>
            ))}
          </Space>
        </Space>
      </Card>

      {filteredTemplates.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Text type="secondary">{t('common.noData')}</Text>
          </div>
        </Card>
      ) : (
        <div className="templates-grid">
          {filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onUseTemplate={handleUseTemplate}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <TemplateEditor
        open={editorVisible}
        template={editingTemplate}
        onSave={handleSave}
        onCancel={() => setEditorVisible(false)}
      />
    </div>
  )
}

export default Templates

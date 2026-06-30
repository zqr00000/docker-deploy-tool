import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Card,
  Typography,
  Space,
  Input,
  Button,
  Tag,
  message,
  Spin,
  Upload,
  Modal
} from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TemplateCard from '../components/TemplateCard'
import TemplateEditor from '../components/TemplateEditor'
import type { Template, TemplateFormData, TemplateCategory, EnvVariableSchema } from '../types/template'
import { CATEGORY_LABELS, ALL_CATEGORIES } from '../types/template'

const { Title, Text } = Typography

interface ExportTemplate {
  name: string
  description: string
  category: TemplateCategory
  dockerCompose: string
  envSchema: EnvVariableSchema[]
}

interface ImportTemplate {
  name: string
  description: string
  category: TemplateCategory
  dockerCompose: string
  envSchema?: EnvVariableSchema[]
}

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
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importTemplates, setImportTemplates] = useState<ImportTemplate[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleExport = () => {
    const exportData: ExportTemplate[] = templates
      .filter(t => !t.isBuiltIn)
      .map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        dockerCompose: t.dockerCompose,
        envSchema: t.envSchema
      }))
    
    if (exportData.length === 0) {
      message.warning(t('template.noExportTemplates'))
      return
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `docker-deploy-templates-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    message.success(t('template.exportSuccess'))
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const validateTemplateData = (item: unknown): item is ImportTemplate => {
    if (typeof item !== 'object' || item === null) return false
    const obj = item as Record<string, unknown>
    return typeof obj.name === 'string' && typeof obj.category === 'string' && typeof obj.dockerCompose === 'string'
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const data = JSON.parse(content)
        
        let items: unknown[]
        if (Array.isArray(data)) {
          items = data
        } else if (validateTemplateData(data)) {
          items = [data]
        } else {
          throw new Error(t('template.invalidExportFormat'))
        }

        const validTemplates: ImportTemplate[] = []
        for (const item of items) {
          if (validateTemplateData(item)) {
            validTemplates.push({
              name: item.name,
              description: item.description || '',
              category: item.category,
              dockerCompose: item.dockerCompose,
              envSchema: item.envSchema || []
            })
          }
        }

        if (validTemplates.length === 0) {
          message.error(t('template.noValidTemplates'))
          return
        }

        setImportTemplates(validTemplates)
        setImportModalVisible(true)
      } catch {
        message.error(t('template.invalidExportFormat'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    let successCount = 0
    for (const tpl of importTemplates) {
      try {
        const formData: TemplateFormData = {
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          dockerCompose: tpl.dockerCompose,
          envSchema: tpl.envSchema || []
        }
        const newTemplate = await window.electronAPI.template.create(formData) as Template
        setTemplates(prev => [...prev, newTemplate])
        successCount++
      } catch {
        console.error(`Failed to import template: ${tpl.name}`)
      }
    }
    setImportModalVisible(false)
    setImportTemplates([])
    message.success(t('template.importSuccess', { count: successCount }))
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
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            {t('template.export')}
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImportClick}>
            {t('template.import')}
          </Button>
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

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      <Modal
        title={t('template.import')}
        open={importModalVisible}
        onOk={handleConfirmImport}
        onCancel={() => {
          setImportModalVisible(false)
          setImportTemplates([])
        }}
        width={600}
      >
        <div>
          <Text strong>{t('template.importConfirm', { count: importTemplates.length })}</Text>
          <ul style={{ marginTop: 16, maxHeight: 300, overflowY: 'auto' }}>
            {importTemplates.map((tpl, index) => (
              <li key={index} style={{ marginBottom: 8 }}>
                <Tag color={getCategoryColor(tpl.category)}>{CATEGORY_LABELS[tpl.category][i18n.language === 'zh-CN' ? 'zh' : 'en']}</Tag>
                <span style={{ marginLeft: 8 }}>{tpl.name}</span>
                {tpl.envSchema && tpl.envSchema.length > 0 && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({tpl.envSchema.length} {t('template.envSchema')})
                  </Text>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  )
}

export default Templates

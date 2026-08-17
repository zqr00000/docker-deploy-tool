import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import {
  Card,
  Typography,
  Space,
  Input,
  Button,
  Tag,
  message,
  Spin,
  Modal,
  Row,
  Col,
  Empty,
  Segmented
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ImportOutlined,
  ExportOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  CloudServerOutlined,
  LaptopOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TemplateCard from '../../components/TemplateCard'
import TemplateEditor from '../../components/TemplateEditor'
import type { Template, TemplateFormData, TemplateCategory, EnvVariableSchema } from '../../types/template'
import { CATEGORY_LABELS, ALL_CATEGORIES, CATEGORY_COLORS } from '../../types/template'

const { Title, Text, Paragraph } = Typography

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
  const [activeTab, setActiveTab] = useState<'all' | 'stack'>('all')
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = useCallback(async () => {
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
  }, [])

  const stackTemplates = useMemo(() => {
    return templates.filter(t => t.category === 'stack')
  }, [templates])

  const singleTemplates = useMemo(() => {
    return templates.filter(t => t.category !== 'stack')
  }, [templates])

  const filteredTemplates = useMemo(() => {
    const sourceList = activeTab === 'stack' ? stackTemplates : singleTemplates
    const searchLower = searchText.toLowerCase()
    return sourceList.filter(template => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchLower) ||
        template.description.toLowerCase().includes(searchLower)
      const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [singleTemplates, stackTemplates, searchText, selectedCategory, activeTab])

  // 使用 useMemo 缓存统计数据
  const stats = useMemo(() => ({
    total: templates.length,
    stackCount: stackTemplates.length,
    builtInCount: templates.filter(t => t.isBuiltIn).length,
    customCount: templates.filter(t => !t.isBuiltIn).length
  }), [templates, stackTemplates])

  const handleUseTemplate = useCallback((template: Template) => {
    navigate('/apps/deploy', { state: { templateId: template.id } })
  }, [navigate])

  const handleEdit = useCallback((template: Template) => {
    setEditingTemplate(template)
    setEditorVisible(true)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.electronAPI.template.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      message.success(t('template.deleteSuccess'))
    } catch {
      message.error(t('common.error'))
    }
  }, [t])

  const handleAdd = useCallback(() => {
    setEditingTemplate(null)
    setEditorVisible(true)
  }, [])

  const handleSave = useCallback(async (values: TemplateFormData) => {
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
    } catch {
      message.error(t('common.error'))
    }
  }, [editingTemplate, t])

  const handleExport = useCallback(() => {
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
  }, [templates, t])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const validateTemplateData = useCallback((item: unknown): item is ImportTemplate => {
    if (typeof item !== 'object' || item === null) return false
    const obj = item as Record<string, unknown>
    return typeof obj.name === 'string' && typeof obj.category === 'string' && typeof obj.dockerCompose === 'string'
  }, [])

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [t, validateTemplateData])

  const handleConfirmImport = useCallback(async () => {
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
  }, [importTemplates, t])

  const handleShowDetail = useCallback((template: Template) => {
    setSelectedTemplate(template)
    setDetailModalVisible(true)
  }, [])

  const getCategoryColor = useCallback((category: string) => {
    return CATEGORY_COLORS[category as TemplateCategory] || 'default'
  }, [])

  const getCategoryCount = useCallback((category: TemplateCategory | 'all') => {
    const sourceList = activeTab === 'stack' ? stackTemplates : singleTemplates
    if (category === 'all') return sourceList.length
    return sourceList.filter(t => t.category === category).length
  }, [activeTab, stackTemplates, singleTemplates])

  const displayCategories = useMemo(() => {
    return activeTab === 'stack'
      ? (['all', 'stack'] as (TemplateCategory | 'all')[])
      : (['all', ...ALL_CATEGORIES.filter(c => c !== 'stack')] as (TemplateCategory | 'all')[])
  }, [activeTab])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }, [])

  const handleCategoryChange = useCallback((category: TemplateCategory | 'all') => {
    setSelectedCategory(category)
  }, [])

  const handleTabChange = useCallback((val: string) => {
    setActiveTab(val as 'all' | 'stack')
    setSelectedCategory('all')
  }, [])

  const handleCloseImportModal = useCallback(() => {
    setImportModalVisible(false)
    setImportTemplates([])
  }, [])

  const handleCloseDetailModal = useCallback(() => {
    setDetailModalVisible(false)
    setSelectedTemplate(null)
  }, [])

  const handleDeployFromDetail = useCallback(() => {
    if (selectedTemplate) {
      handleUseTemplate(selectedTemplate)
      setDetailModalVisible(false)
    }
  }, [selectedTemplate, handleUseTemplate])

  if (loading && !initialized) {
    return (
      <div className="loading-container">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 8 }} />
            {t('template.title')}
          </Title>
          <Text type="secondary">{t('template.subtitle')}</Text>
        </div>
        <div className="page-header-right">
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
        </div>
      </div>

      {/* Stats Cards - Responsive Row/Col */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary">{t('template.totalTemplates')}</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats.total}</div>
              </div>
              <AppstoreOutlined style={{ fontSize: 32, color: '#1890ff' }} />
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary">{t('template.appStacks')}</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#f5222d' }}>{stats.stackCount}</div>
              </div>
              <ClusterOutlined style={{ fontSize: 32, color: '#f5222d' }} />
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary">{t('template.builtInTemplates')}</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                  {stats.builtInCount}
                </div>
              </div>
              <CloudServerOutlined style={{ fontSize: 32, color: '#52c41a' }} />
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary">{t('template.customTemplates')}</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>
                  {stats.customCount}
                </div>
              </div>
              <LaptopOutlined style={{ fontSize: 32, color: '#faad14' }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Search and Filter */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder={t('template.searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={handleSearchChange}
            allowClear
            size="large"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap>
              <Text strong>{t('template.categoryFilter')}:</Text>
              <Tag
                color={selectedCategory === 'all' ? 'blue' : 'default'}
                onClick={() => handleCategoryChange('all')}
                style={{ cursor: 'pointer', padding: '4px 12px' }}
              >
                {t('template.all')} ({getCategoryCount('all')})
              </Tag>
              {displayCategories.filter(c => c !== 'all').map(cat => (
                <Tag
                  key={cat}
                  color={selectedCategory === cat ? getCategoryColor(cat) : 'default'}
                  onClick={() => handleCategoryChange(cat)}
                  style={{ cursor: 'pointer', padding: '4px 12px' }}
                >
                  {CATEGORY_LABELS[cat][i18n.language === 'zh-CN' ? 'zh' : 'en']} ({getCategoryCount(cat)})
                </Tag>
              ))}
            </Space>
            <Segmented
              value={activeTab}
              onChange={handleTabChange}
              options={[
                { label: t('template.allTemplates'), value: 'all' },
                { label: t('template.appStacksOnly'), value: 'stack' }
              ]}
            />
          </div>
        </Space>
      </Card>

      {/* Template Grid */}
      {filteredTemplates.length === 0 ? (
        <Card>
          <Empty description={t('common.noData')} />
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
              onShowDetail={handleShowDetail}
            />
          ))}
        </div>
      )}

      {/* Template Editor Modal */}
      <TemplateEditor
        open={editorVisible}
        template={editingTemplate}
        onSave={handleSave}
        onCancel={() => setEditorVisible(false)}
      />

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* Import Confirmation Modal */}
      <Modal
        title={t('template.import')}
        open={importModalVisible}
        onOk={handleConfirmImport}
        onCancel={handleCloseImportModal}
        width={600}
      >
        <div>
          <Text strong>{t('template.importConfirm', { count: importTemplates.length })}</Text>
          <ul style={{ marginTop: 16, maxHeight: 300, overflowY: 'auto' }}>
            {importTemplates.map((tpl, index) => (
              <li key={index} style={{ marginBottom: 8 }}>
                <Tag color={getCategoryColor(tpl.category)}>
                  {CATEGORY_LABELS[tpl.category]?.[i18n.language === 'zh-CN' ? 'zh' : 'en'] || tpl.category}
                </Tag>
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

      {/* Template Detail Modal */}
      <Modal
        title={
          <Space>
            <AppstoreOutlined />
            <span>{selectedTemplate?.name}</span>
            {selectedTemplate?.isBuiltIn && <Tag color="gold">{t('template.builtIn')}</Tag>}
            {selectedTemplate?.category === 'stack' && <Tag color="red">{t('template.appStackTag')}</Tag>}
          </Space>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetailModal}
        footer={[
          <Button key="close" onClick={handleCloseDetailModal}>
            {t('common.close')}
          </Button>,
          <Button
            key="deploy"
            type="primary"
            icon={<CloudServerOutlined />}
            onClick={handleDeployFromDetail}
          >
            {t('template.deploy')}
          </Button>
        ]}
        width={800}
      >
        {selectedTemplate && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Tag color={getCategoryColor(selectedTemplate.category)}>
                {CATEGORY_LABELS[selectedTemplate.category]?.[i18n.language === 'zh-CN' ? 'zh' : 'en']}
              </Tag>
            </div>
            <Paragraph>{selectedTemplate.description}</Paragraph>

            <div style={{ marginBottom: 16 }}>
              <Text strong>{t('template.envVariables')}:</Text>
              {selectedTemplate.envSchema.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  {selectedTemplate.envSchema.map((env, idx) => (
                    <Tag
                      key={idx}
                      color={env.required ? 'red' : 'blue'}
                      style={{ marginBottom: 4 }}
                    >
                      {env.name}{env.required ? ' *' : ''}
                    </Tag>
                  ))}
                </div>
              ) : (
                <Text type="secondary" style={{ marginLeft: 8 }}>{t('template.noEnvSchema')}</Text>
              )}
            </div>

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
              {selectedTemplate.dockerCompose}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Templates

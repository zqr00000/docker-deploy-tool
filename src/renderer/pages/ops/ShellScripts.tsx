import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Popconfirm,
  Tabs,
  Alert,
  List,
  Empty,
  Drawer,
  Descriptions,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  HistoryOutlined,
  CopyOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  FullscreenOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import Editor from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type {
  ShellScript,
  ShellScriptVersion,
  ShellScriptExecutionLog,
  ShellScriptRunResult,
  ShellScriptServerResult,
  Server
} from '../../types/global'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const SCRIPT_CATEGORIES = ['common', 'system', 'docker', 'network', 'monitoring', 'backup', 'custom'] as const

interface ParamRow {
  key: string
  value: string
}

interface VersionModalState {
  open: boolean
  script: ShellScript | null
  versions: ShellScriptVersion[]
  loading: boolean
}

const ShellScripts: React.FC = () => {
  const { t } = useTranslation()

  // ========== 列表状态 ==========
  const [scripts, setScripts] = useState<ShellScript[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState('library')

  // ========== 编辑器状态 ==========
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingScript, setEditingScript] = useState<ShellScript | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  // ========== 运行状态 ==========
  const [runOpen, setRunOpen] = useState(false)
  const [runScript, setRunScript] = useState<ShellScript | null>(null)
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([])
  const [params, setParams] = useState<ParamRow[]>([])
  const [argsText, setArgsText] = useState('')
  const [runTimeout, setRunTimeout] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  // ========== 执行结果状态 ==========
  const [resultOpen, setResultOpen] = useState(false)
  const [runResult, setRunResult] = useState<ShellScriptRunResult | null>(null)

  // ========== 版本管理状态 ==========
  const [versionModal, setVersionModal] = useState<VersionModalState>({
    open: false,
    script: null,
    versions: [],
    loading: false
  })
  const [versionContent, setVersionContent] = useState<ShellScriptVersion | null>(null)
  const [versionContentOpen, setVersionContentOpen] = useState(false)

  // ========== 复制状态 ==========
  const [duplicateTarget, setDuplicateTarget] = useState<ShellScript | null>(null)
  const [duplicateName, setDuplicateName] = useState('')

  // ========== 历史状态 ==========
  const [historyLogs, setHistoryLogs] = useState<ShellScriptExecutionLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyScriptFilter, setHistoryScriptFilter] = useState<string>('all')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')
  const [historyDetail, setHistoryDetail] = useState<ShellScriptExecutionLog | null>(null)
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false)

  // ========== 帮助状态 ==========
  const [helpOpen, setHelpOpen] = useState(false)

  const loadScripts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.shellScript.getAll()
      setScripts(data)
    } catch (error) {
      console.error('Failed to load shell scripts:', error)
      message.error(t('common.error'))
      setScripts([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await window.electronAPI.shellScript.getExecutionLogs(undefined, 200)
      setHistoryLogs(data)
    } catch (error) {
      console.error('Failed to load execution logs:', error)
      setHistoryLogs([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory()
    }
  }, [activeTab, loadHistory])

  // ========== 筛选与统计 ==========
  const filteredScripts = useMemo(() => {
    const lower = searchText.toLowerCase()
    return scripts.filter(s => {
      const matchesSearch =
        s.name.toLowerCase().includes(lower) ||
        (s.description || '').toLowerCase().includes(lower)
      const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [scripts, searchText, categoryFilter])

  const stats = useMemo(() => ({
    total: scripts.length,
    builtIn: scripts.filter(s => s.isBuiltIn).length,
    custom: scripts.filter(s => !s.isBuiltIn).length
  }), [scripts])

  // ========== 分类颜色映射 ==========
  const categoryColorMap: Record<string, string> = {
    common: 'default',
    system: 'blue',
    docker: 'cyan',
    network: 'purple',
    monitoring: 'orange',
    backup: 'green',
    custom: 'magenta'
  }

  // ========== 新建/编辑 ==========
  const handleAdd = useCallback(() => {
    setEditingScript(null)
    setEditorOpen(true)
  }, [])

  const handleEdit = useCallback((script: ShellScript) => {
    setEditingScript(script)
    setEditorOpen(true)
  }, [])

  const handleSave = useCallback(async (values: {
    name: string
    description?: string
    category: string
    content: string
    timeout: number
    changeNote?: string
  }) => {
    setSaveLoading(true)
    try {
      if (editingScript) {
        const updated = await window.electronAPI.shellScript.update(
          editingScript.id,
          {
            name: values.name,
            description: values.description,
            category: values.category,
            content: values.content,
            timeout: values.timeout
          },
          values.changeNote
        )
        setScripts(prev => prev.map(s => (s.id === editingScript.id ? updated || s : s)))
      } else {
        const created = await window.electronAPI.shellScript.create({
          name: values.name,
          description: values.description,
          category: values.category,
          content: values.content,
          timeout: values.timeout
        })
        if (created) {
          setScripts(prev => [created, ...prev])
        }
      }
      setEditorOpen(false)
      message.success(t('shellScript.saveSuccess'))
    } catch (error) {
      console.error('Failed to save shell script:', error)
      message.error(t('common.error'))
    } finally {
      setSaveLoading(false)
    }
  }, [editingScript, t])

  const handleDelete = useCallback(async (script: ShellScript) => {
    try {
      await window.electronAPI.shellScript.delete(script.id)
      setScripts(prev => prev.filter(s => s.id !== script.id))
      message.success(t('shellScript.deleteSuccess'))
    } catch (error) {
      console.error('Failed to delete shell script:', error)
      message.error(t('common.error'))
    }
  }, [t])

  // ========== 复制 ==========
  const handleDuplicateClick = useCallback((script: ShellScript) => {
    setDuplicateTarget(script)
    setDuplicateName('')
    setDuplicateName(`${script.name} 副本`)
  }, [])

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicateTarget) return
    if (!duplicateName.trim()) {
      message.warning(t('shellScript.nameRequired'))
      return
    }
    try {
      const created = await window.electronAPI.shellScript.create({
        name: duplicateName.trim(),
        description: duplicateTarget.description || undefined,
        category: duplicateTarget.category,
        content: duplicateTarget.content,
        timeout: duplicateTarget.timeout
      })
      if (created) {
        setScripts(prev => [created, ...prev])
      }
      setDuplicateTarget(null)
      message.success(t('shellScript.saveSuccess'))
    } catch (error) {
      console.error('Failed to duplicate shell script:', error)
      message.error(t('common.error'))
    }
  }, [duplicateTarget, duplicateName, t])

  // ========== 运行 ==========
  const handleRunClick = useCallback(async (script: ShellScript) => {
    setRunScript(script)
    setSelectedServerIds([])
    setParams([])
    setArgsText('')
    setRunTimeout(script.timeout)
    setRunOpen(true)
    try {
      const allServers = await window.electronAPI.server.getAll()
      setServers(allServers)
    } catch (error) {
      console.error('Failed to load servers:', error)
      setServers([])
    }
  }, [])

  const handleRunConfirm = useCallback(async () => {
    if (!runScript) return
    if (selectedServerIds.length === 0) {
      message.warning(t('shellScript.selectServersRequired'))
      return
    }
    setRunning(true)
    try {
      const paramObj: Record<string, string> = {}
      for (const row of params) {
        if (row.key.trim()) {
          paramObj[row.key.trim()] = row.value
        }
      }
      const args = argsText.trim() ? argsText.trim().split(/\s+/) : []
      const result = await window.electronAPI.shellScript.run(runScript.id, {
        serverIds: selectedServerIds,
        params: paramObj,
        args,
        timeout: runTimeout || undefined
      })
      setRunOpen(false)
      setRunResult(result)
      setResultOpen(true)
      if (result.success) {
        message.success(
          t('shellScript.runSuccess', {
            successCount: result.successCount,
            failureCount: result.failureCount
          })
        )
      } else {
        message.warning(
          t('shellScript.runSuccess', {
            successCount: result.successCount,
            failureCount: result.failureCount
          })
        )
      }
      // 刷新执行历史（若当前在历史页）
      if (activeTab === 'history') {
        loadHistory()
      }
    } catch (error) {
      console.error('Failed to run shell script:', error)
      message.error(t('common.error'))
    } finally {
      setRunning(false)
    }
  }, [runScript, selectedServerIds, params, argsText, runTimeout, activeTab, loadHistory, t])

  // ========== 版本管理 ==========
  const handleVersionsClick = useCallback(async (script: ShellScript) => {
    setVersionModal({ open: true, script, versions: [], loading: true })
    try {
      const versions = await window.electronAPI.shellScript.getVersions(script.id)
      setVersionModal({ open: true, script, versions, loading: false })
    } catch (error) {
      console.error('Failed to load versions:', error)
      setVersionModal({ open: true, script, versions: [], loading: false })
      message.error(t('common.error'))
    }
  }, [t])

  const handleRollback = useCallback(async (version: ShellScriptVersion) => {
    if (!versionModal.script) return
    try {
      const updated = await window.electronAPI.shellScript.rollback(
        versionModal.script.id,
        version.id,
        `回滚到 v${version.version}`
      )
      message.success(
        t('shellScript.rollbackSuccess', { version: updated?.version ?? 0 })
      )
      setVersionModal(prev => ({ ...prev, open: false }))
      // 刷新列表
      const data = await window.electronAPI.shellScript.getAll()
      setScripts(data)
    } catch (error) {
      console.error('Failed to rollback shell script:', error)
      message.error(t('common.error'))
    }
  }, [versionModal.script, t])

  // ========== 执行历史 ==========
  const filteredHistory = useMemo(() => {
    return historyLogs.filter(log => {
      const matchesScript = historyScriptFilter === 'all' || log.scriptId === historyScriptFilter
      const matchesStatus = historyStatusFilter === 'all' || log.status === historyStatusFilter
      return matchesScript && matchesStatus
    })
  }, [historyLogs, historyScriptFilter, historyStatusFilter])

  const handleClearHistory = useCallback(async () => {
    try {
      await window.electronAPI.shellScript.clearExecutionLogs(undefined)
      setHistoryLogs([])
      message.success(t('shellScript.historyTab.clearSuccess'))
    } catch (error) {
      console.error('Failed to clear execution logs:', error)
      message.error(t('common.error'))
    }
  }, [t])

  // ========== 表格列 ==========
  const columns: ColumnsType<ShellScript> = [
    {
      title: t('shellScript.name'),
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space size={6}>
            <Text strong style={{ fontSize: 14 }}>{record.name}</Text>
            {record.isBuiltIn && (
              <Tag color="gold" style={{ fontSize: 11 }}>{t('shellScript.builtIn')}</Tag>
            )}
            <Tag color="blue">v{record.version}</Tag>
          </Space>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description.length > 60
                ? `${record.description.slice(0, 60)}...`
                : record.description}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: t('shellScript.category'),
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (category: string) => (
        <Tag color={categoryColorMap[category] || 'default'}>
          {t(`shellScript.categories.${category}`)}
        </Tag>
      )
    },
    {
      title: t('shellScript.updatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (value: string) => new Date(value).toLocaleString()
    },
    {
      title: t('shellScript.actions'),
      key: 'actions',
      width: 460,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleRunClick(record)}
          >
            {t('shellScript.run')}
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('shellScript.edit')}
          </Button>
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => handleVersionsClick(record)}
          >
            {t('shellScript.versions')}
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleDuplicateClick(record)}
          >
            {t('shellScript.duplicate')}
          </Button>
          <Popconfirm
            title={t('shellScript.deleteConfirm', { name: record.name })}
            onConfirm={() => handleDelete(record)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const historyColumns: ColumnsType<ShellScriptExecutionLog> = [
    {
      title: t('shellScript.historyTab.startedAt'),
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString()
    },
    {
      title: t('shellScript.historyTab.scriptName'),
      dataIndex: 'scriptName',
      key: 'scriptName',
      render: (_, record) => (
        <Space size={6}>
          <Text>{record.scriptName}</Text>
          <Tag color="blue">v{record.version}</Tag>
        </Space>
      )
    },
    {
      title: t('shellScript.historyTab.serverName'),
      dataIndex: 'serverName',
      key: 'serverName'
    },
    {
      title: t('shellScript.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) =>
        status === 'success' ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>{t('shellScript.historyTab.success')}</Tag>
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />}>{t('shellScript.historyTab.failure')}</Tag>
        )
    },
    {
      title: t('shellScript.exitCode'),
      dataIndex: 'exitCode',
      key: 'exitCode',
      width: 90,
      render: (value: number | null) => (value === null ? '-' : value)
    },
    {
      title: t('shellScript.duration'),
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (value: number | null) => (value === null ? '-' : `${(value / 1000).toFixed(2)}s`)
    },
    {
      title: t('shellScript.actions'),
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          onClick={() => {
            setHistoryDetail(record)
            setHistoryDetailOpen(true)
          }}
        >
          {t('shellScript.historyTab.viewDetail')}
        </Button>
      )
    }
  ]

  // ========== 渲染 ==========
  return (
    <div className="shell-scripts-page">
      <Title level={4} style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <CodeOutlined style={{ color: '#007AFF' }} />
        {t('shellScript.title')}
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size={16} wrap>
          <Text type="secondary">
            {t('shellScript.totalCount', {
              total: stats.total,
              builtIn: stats.builtIn,
              custom: stats.custom
            })}
          </Text>
        </Space>
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'library',
              label: t('shellScript.library'),
              children: (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 16,
                      flexWrap: 'wrap'
                    }}
                  >
                    <Space wrap>
                      <Input
                        prefix={<SearchOutlined style={{ color: '#8e8e93' }} />}
                        placeholder={t('shellScript.searchPlaceholder')}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{ width: 260 }}
                        allowClear
                      />
                      <Select
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        style={{ width: 140 }}
                      >
                        <Select.Option value="all">{t('shellScript.allCategories')}</Select.Option>
                        {SCRIPT_CATEGORIES.map(cat => (
                          <Select.Option key={cat} value={cat}>
                            {t(`shellScript.categories.${cat}`)}
                          </Select.Option>
                        ))}
                      </Select>
                    </Space>
                    <Space>
                      <Button icon={<ReloadOutlined />} onClick={loadScripts}>
                        {t('shellScript.refresh')}
                      </Button>
                      <Button icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)}>
                        {t('shellScript.help')}
                      </Button>
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                        {t('shellScript.addScript')}
                      </Button>
                    </Space>
                  </div>

                  <Table<ShellScript>
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredScripts}
                    loading={loading}
                    pagination={{ pageSize: 12, showSizeChanger: false }}
                    locale={{
                      emptyText: (
                        <Empty description={t('shellScript.noScripts')} />
                      )
                    }}
                  />
                </>
              )
            },
            {
              key: 'history',
              label: t('shellScript.history'),
              children: (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 16,
                      flexWrap: 'wrap'
                    }}
                  >
                    <Space wrap>
                      <Select
                        value={historyScriptFilter}
                        onChange={setHistoryScriptFilter}
                        style={{ width: 200 }}
                        placeholder={t('shellScript.historyTab.scriptFilter')}
                      >
                        <Select.Option value="all">{t('shellScript.historyTab.allScripts')}</Select.Option>
                        {scripts.map(s => (
                          <Select.Option key={s.id} value={s.id}>
                            {s.name}
                          </Select.Option>
                        ))}
                      </Select>
                      <Select
                        value={historyStatusFilter}
                        onChange={setHistoryStatusFilter}
                        style={{ width: 140 }}
                      >
                        <Select.Option value="all">{t('shellScript.historyTab.allStatus')}</Select.Option>
                        <Select.Option value="success">{t('shellScript.historyTab.success')}</Select.Option>
                        <Select.Option value="failure">{t('shellScript.historyTab.failure')}</Select.Option>
                      </Select>
                    </Space>
                    <Space>
                      <Button icon={<ReloadOutlined />} onClick={loadHistory}>
                        {t('shellScript.refresh')}
                      </Button>
                      <Popconfirm
                        title={t('shellScript.historyTab.clearConfirm')}
                        onConfirm={handleClearHistory}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                      >
                        <Button danger>{t('shellScript.historyTab.clear')}</Button>
                      </Popconfirm>
                    </Space>
                  </div>

                  <Table<ShellScriptExecutionLog>
                    rowKey="id"
                    columns={historyColumns}
                    dataSource={filteredHistory}
                    loading={historyLoading}
                    pagination={{ pageSize: 12, showSizeChanger: false }}
                    locale={{ emptyText: <Empty description={t('shellScript.historyTab.noLogs')} /> }}
                  />
                </>
              )
            }
          ]}
        />
      </Card>

      {/* ==================== 编辑器弹窗 ==================== */}
      <ShellScriptEditorModal
        open={editorOpen}
        script={editingScript}
        saving={saveLoading}
        onSave={handleSave}
        onCancel={() => setEditorOpen(false)}
      />

      {/* ==================== 复制名称弹窗 ==================== */}
      <Modal
        open={!!duplicateTarget}
        title={t('shellScript.duplicateTitle')}
        onCancel={() => setDuplicateTarget(null)}
        onOk={handleDuplicateConfirm}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('shellScript.name')} required>
            <Input
              value={duplicateName}
              onChange={e => setDuplicateName(e.target.value)}
              placeholder={t('shellScript.duplicateNamePlaceholder')}
              autoFocus
            />
          </Form.Item>
          {duplicateTarget && (
            <Alert
              type="info"
              showIcon
              message={`${t('shellScript.name')}: ${duplicateTarget.name}`}
              description={`${t('shellScript.category')}: ${t(`shellScript.categories.${duplicateTarget.category}`)} | ${t('shellScript.version')}: v${duplicateTarget.version}`}
            />
          )}
        </Form>
      </Modal>

      {/* ==================== 运行弹窗 ==================== */}
      <Modal
        open={runOpen}
        title={`${t('shellScript.run')} - ${runScript?.name ?? ''}`}
        onCancel={() => setRunOpen(false)}
        onOk={handleRunConfirm}
        okText={t('shellScript.run')}
        cancelText={t('common.cancel')}
        confirmLoading={running}
        width={640}
      >
        <Form layout="vertical">
          <Form.Item
            label={t('shellScript.selectServers')}
            required
            extra={servers.length === 0 ? <Text type="warning">{t('shellScript.noServersWarning')}</Text> : undefined}
          >
            <Select
              mode="multiple"
              value={selectedServerIds}
              onChange={setSelectedServerIds}
              placeholder={t('shellScript.selectServersPlaceholder')}
              optionFilterProp="label"
            >
              {servers.map(s => (
                <Select.Option key={s.id} value={s.id} label={`${s.name} (${s.host})`}>
                  {s.name} ({s.host})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={t('shellScript.params')} extra={t('shellScript.paramsHint')}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {params.map((row, index) => (
                <Space key={index} style={{ display: 'flex', width: '100%' }}>
                  <Input
                    placeholder={t('shellScript.paramKey')}
                    value={row.key}
                    style={{ flex: 1 }}
                    onChange={e => {
                      const next = [...params]
                      next[index] = { ...next[index], key: e.target.value }
                      setParams(next)
                    }}
                  />
                  <Input
                    placeholder={t('shellScript.paramValue')}
                    value={row.value}
                    style={{ flex: 2 }}
                    onChange={e => {
                      const next = [...params]
                      next[index] = { ...next[index], value: e.target.value }
                      setParams(next)
                    }}
                  />
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setParams(params.filter((_, i) => i !== index))}
                  />
                </Space>
              ))}
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setParams([...params, { key: '', value: '' }])}
              >
                {t('shellScript.addParam')}
              </Button>
            </Space>
          </Form.Item>

          <Form.Item label={t('shellScript.args')} extra={t('shellScript.argsHint')}>
            <Input
              value={argsText}
              onChange={e => setArgsText(e.target.value)}
              placeholder={t('shellScript.argsPlaceholder')}
            />
          </Form.Item>

          <Form.Item label={t('shellScript.runTimeout')}>
            <InputNumber
              min={1}
              max={3600}
              value={runTimeout}
              onChange={value => setRunTimeout(value)}
              style={{ width: 200 }}
              addonAfter={t('shellScript.seconds')}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ==================== 执行结果弹窗 ==================== */}
      <Modal
        open={resultOpen}
        title={t('shellScript.runResultTitle')}
        onCancel={() => setResultOpen(false)}
        footer={
          <Button type="primary" onClick={() => setResultOpen(false)}>
            {t('common.confirm')}
          </Button>
        }
        width={800}
      >
        {runResult && (
          <>
            <Alert
              type={runResult.success ? 'success' : 'warning'}
              showIcon
              message={t('shellScript.runSuccess', {
                successCount: runResult.successCount,
                failureCount: runResult.failureCount
              })}
              style={{ marginBottom: 16 }}
            />
            <List
              dataSource={runResult.results}
              renderItem={(item: ShellScriptServerResult) => (
                <List.Item
                  style={{ display: 'block' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Space size={8}>
                      <Text strong>{item.serverName}</Text>
                      {item.success ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>{t('shellScript.historyTab.success')}</Tag>
                      ) : (
                        <Tag color="error" icon={<CloseCircleOutlined />}>{t('shellScript.historyTab.failure')}</Tag>
                      )}
                      <Text type="secondary">exit: {item.exitCode}</Text>
                      <Text type="secondary">{(item.duration / 1000).toFixed(2)}s</Text>
                    </Space>
                  </div>
                  {item.stderr && item.stderr.trim() && (
                    <pre className="script-result-block script-result-error">
                      {item.stderr}
                    </pre>
                  )}
                  {item.stdout && item.stdout.trim() && (
                    <pre className="script-result-block">
                      {item.stdout}
                    </pre>
                  )}
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>

      {/* ==================== 版本管理弹窗 ==================== */}
      <Modal
        open={versionModal.open}
        title={
          versionModal.script
            ? `${t('shellScript.versionHistory')} - ${versionModal.script.name} (${t('shellScript.currentVersion', { version: versionModal.script.version })})`
            : t('shellScript.versionHistory')
        }
        onCancel={() => setVersionModal(prev => ({ ...prev, open: false }))}
        footer={
          <Button type="primary" onClick={() => setVersionModal(prev => ({ ...prev, open: false }))}>
            {t('common.close')}
          </Button>
        }
        width={760}
      >
        <Table<ShellScriptVersion>
          rowKey="id"
          dataSource={versionModal.versions}
          loading={versionModal.loading}
          pagination={false}
          size="small"
          columns={[
            {
              title: t('shellScript.version'),
              dataIndex: 'version',
              width: 80,
              render: (v: number) => <Tag color="blue">v{v}</Tag>
            },
            {
              title: t('shellScript.changeNote'),
              dataIndex: 'changeNote',
              render: (note: string | null) => note || '-'
            },
            {
              title: t('shellScript.createdAt'),
              dataIndex: 'createdAt',
              width: 180,
              render: (value: string) => new Date(value).toLocaleString()
            },
            {
              title: t('shellScript.actions'),
              width: 180,
              render: (_, record) => (
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<CodeOutlined />}
                    onClick={() => {
                      setVersionContent(record)
                      setVersionContentOpen(true)
                    }}
                  >
                    {t('shellScript.viewContent')}
                  </Button>
                  <Popconfirm
                    title={t('shellScript.rollbackConfirm', { version: record.version })}
                    onConfirm={() => handleRollback(record)}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                  >
                    <Button size="small" type="primary" ghost icon={<HistoryOutlined />}>
                      {t('shellScript.rollback')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Modal>

      {/* ==================== 版本内容查看弹窗 ==================== */}
      <Modal
        open={versionContentOpen}
        title={versionContent ? `${t('shellScript.viewContent')} - v${versionContent.version}` : ''}
        onCancel={() => setVersionContentOpen(false)}
        footer={
          <Button type="primary" onClick={() => setVersionContentOpen(false)}>
            {t('common.close')}
          </Button>
        }
        width={760}
        destroyOnClose
      >
        <Editor
          height={420}
          language="shell"
          theme="vs-dark"
          value={versionContent?.content || ''}
          options={{ readOnly: true, minimap: { enabled: false } }}
        />
      </Modal>

      {/* ==================== 历史详情抽屉 ==================== */}
      <Drawer
        open={historyDetailOpen}
        title={t('shellScript.historyTab.detailTitle')}
        onClose={() => setHistoryDetailOpen(false)}
        width={720}
      >
        {historyDetail && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label={t('shellScript.historyTab.scriptName')}>
                {historyDetail.scriptName} (v{historyDetail.version})
              </Descriptions.Item>
              <Descriptions.Item label={t('shellScript.historyTab.serverName')}>
                {historyDetail.serverName}
              </Descriptions.Item>
              <Descriptions.Item label={t('shellScript.status')}>
                {historyDetail.status === 'success' ? (
                  <Tag color="success">{t('shellScript.historyTab.success')}</Tag>
                ) : (
                  <Tag color="error">{t('shellScript.historyTab.failure')}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t('shellScript.exitCode')}>
                {historyDetail.exitCode ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('shellScript.historyTab.startedAt')}>
                {new Date(historyDetail.startedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label={t('shellScript.duration')}>
                {historyDetail.duration ? `${(historyDetail.duration / 1000).toFixed(2)}s` : '-'}
              </Descriptions.Item>
            </Descriptions>
            {historyDetail.params && (
              <>
                <Text strong>{t('shellScript.params')}</Text>
                <pre className="script-result-block">{historyDetail.params}</pre>
              </>
            )}
            <Text strong>{t('shellScript.stdout')}</Text>
            <pre className="script-result-block">
              {historyDetail.stdout || t('shellScript.noOutput')}
            </pre>
            <Text strong>{t('shellScript.stderr')}</Text>
            <pre className="script-result-block script-result-error">
              {historyDetail.stderr || t('shellScript.noOutput')}
            </pre>
          </Space>
        )}
      </Drawer>

      {/* ==================== 使用说明弹窗 ==================== */}
      <Modal
        open={helpOpen}
        title={t('shellScript.helpTitle')}
        onCancel={() => setHelpOpen(false)}
        footer={
          <Button type="primary" onClick={() => setHelpOpen(false)}>
            {t('common.close')}
          </Button>
        }
        width={680}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Paragraph>
            <Text strong>{t('shellScript.help.introTitle')}</Text>
            <br />
            <Text type="secondary">{t('shellScript.help.intro')}</Text>
          </Paragraph>

          <Alert type="info" showIcon message={t('shellScript.help.configTitle')} description={t('shellScript.help.configDesc')} />

          <Paragraph>
            <Text strong>{t('shellScript.help.example')}</Text>
          </Paragraph>
          <pre className="script-result-block">{`#!/usr/bin/env bash
set -euo pipefail

# 环境变量参数（运行时注入）
echo "目标目录: \${TARGET_DIR:-/tmp}"

# 位置参数（运行时注入）
echo "第一个参数: \$1"`}</pre>

          <Paragraph>
            <Text strong>{t('shellScript.help.runTitle')}</Text>
          </Paragraph>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>{t('shellScript.help.runItem1')}</li>
            <li>{t('shellScript.help.runItem2')}</li>
            <li>{t('shellScript.help.runItem3')}</li>
            <li>{t('shellScript.help.runItem4')}</li>
          </ul>

          <Paragraph>
            <Text strong>{t('shellScript.help.versionTitle')}</Text>
            <br />
            <Text type="secondary">{t('shellScript.help.versionDesc')}</Text>
          </Paragraph>

          <Paragraph>
            <Text strong>{t('shellScript.help.compatTitle')}</Text>
            <br />
            <Text type="secondary">{t('shellScript.help.compatDesc')}</Text>
          </Paragraph>
        </Space>
      </Modal>
    </div>
  )
}

interface EditorModalProps {
  open: boolean
  script: ShellScript | null
  saving: boolean
  onSave: (values: {
    name: string
    description?: string
    category: string
    content: string
    timeout: number
    changeNote?: string
  }) => void
  onCancel: () => void
}

const ShellScriptEditorModal: React.FC<EditorModalProps> = ({ open, script, saving, onSave, onCancel }) => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const isEdit = !!script
  const [content, setContent] = useState('')
  const [extractedVars, setExtractedVars] = useState<string[]>([])
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  // 记录每个参数标签当前跳转到第几次出现
  const jumpCounterRef = useRef<Map<string, number>>(new Map())

  // 在脚本内容中查找变量第 n 次出现的位置，跳转到编辑器对应行列
  const handleJumpToVar = useCallback((varName: string) => {
    const editor = editorRef.current
    if (!editor) return
    // 兼容 `${name}`、`${name:-default}`、`${name?err}`、`${name-DEF}` 等写法
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp('\\$\\{' + escaped + '(:[-+?]?[^}]*)?\\}', 'g')
    const occurrences: number[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      occurrences.push(m.index)
    }
    if (occurrences.length === 0) return
    const counter = jumpCounterRef.current
    const current = counter.get(varName) || 0
    const target = occurrences[current % occurrences.length]
    counter.set(varName, current + 1)

    const before = content.slice(0, target)
    const lines = before.split('\n')
    const position = {
      lineNumber: lines.length,
      column: lines[lines.length - 1].length + 1
    }
    editor.setPosition(position)
    editor.revealPositionInCenter(position)
    editor.focus()
    message.info(`${varName}：第 ${(current % occurrences.length) + 1} / ${occurrences.length} 处`)
  }, [content])

  useEffect(() => {
    if (open) {
      if (script) {
        form.setFieldsValue({
          name: script.name,
          description: script.description,
          category: script.category,
          timeout: script.timeout,
          changeNote: ''
        })
        setContent(script.content)
        setExtractedVars(extractVariables(script.content))
      } else {
        form.resetFields()
        form.setFieldsValue({ category: 'common', timeout: 60 })
        setContent('#!/usr/bin/env bash\n# 在这里编写你的脚本\nset -euo pipefail\n')
        setExtractedVars([])
      }
    }
  }, [open, script, form])

  const handleContentChange = useCallback((value: string | undefined) => {
    const next = value || ''
    setContent(next)
    setExtractedVars(extractVariables(next))
  }, [])

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validateFields()
      if (!content.trim()) {
        message.warning(t('shellScript.contentRequired'))
        return
      }
      onSave({
        name: values.name,
        description: values.description,
        category: values.category,
        content,
        timeout: values.timeout || 60,
        changeNote: values.changeNote
      })
    } catch {
      // 表单校验失败，由 antd 展示错误
    }
  }, [form, content, onSave, t])

  // ========== AI 编写脚本 ==========
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  // AI 编写会话记忆（多轮）：记录历次 用户需求 / AI 输出
  const aiConvoRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  // 编辑区全屏编辑层开关
  const [fullscreenEdit, setFullscreenEdit] = useState(false)

  // 从已保存的模型配置（AI 运维终端共享）中取出当前激活的提供商档案
  const getActiveModelConfig = useCallback(async (): Promise<{ success: boolean; cfg?: any; error?: string }> => {
    try {
      const raw = localStorage.getItem('agentOpsModelConfig')
      if (!raw) return { success: false, error: '尚未配置 AI 模型，请先在「自动化运维 → AI 运维终端」中完成模型配置' }
      const modelConfig = JSON.parse(raw)
      const profiles = modelConfig?.providerProfiles || []
      const active = profiles.find((p: any) => p.id === modelConfig?.activeProfileId) || profiles[0]
      if (!active || !active.provider || !active.model) {
        return { success: false, error: '尚未配置 AI 模型，请先在「自动化运维 → AI 运维终端」中完成模型配置' }
      }
      let apiKey = active.apiKey || ''
      if (apiKey.startsWith('enc:')) {
        const dec = await window.electronAPI.secure.decrypt(apiKey.slice(4))
        apiKey = dec.success ? (dec.data || '') : ''
      }
      if (!apiKey && active.provider !== 'ollama') {
        return { success: false, error: '模型 API Key 未配置或无法解密' }
      }
      return {
        success: true,
        cfg: {
          provider: active.provider,
          apiKey,
          model: active.model,
          baseUrl: active.baseUrl,
          extraParams: active.extraParams || {}
        }
      }
    } catch (e) {
      return { success: false, error: `读取模型配置失败: ${(e as Error).message}` }
    }
  }, [])

  const runAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim()
    if (!prompt) {
      message.warning('请先描述你需要的脚本功能')
      return
    }
    const cfgRes = await getActiveModelConfig()
    if (!cfgRes.success) {
      message.warning(cfgRes.error || '模型配置异常')
      return
    }
    setAiLoading(true)
    try {
      // 带上当前脚本内容作为上下文
      const scriptBlock = content.trim()
        ? `### 当前脚本内容\n\`\`\`bash\n${content}\n\`\`\`\n`
        : ''
      // 多轮会话记忆：历次 用户需求 / AI 输出
      const historyBlock = aiConvoRef.current.length
        ? '### 之前的多轮会话\n' + aiConvoRef.current
          .map(m => (m.role === 'user' ? `用户需求：\n${m.content}` : `AI 已给出的脚本：\n\`\`\`bash\n${m.content}\n\`\`\``))
          .join('\n\n') + '\n'
        : ''
      // 拼出完整提示词，交给模型（模型只输出最终脚本）
      const fullPrompt = [
        '你是 Shell 脚本专家。请根据需求与已给上下文，输出完整、健壮、带中文注释的 Shell 脚本。',
        scriptBlock,
        historyBlock,
        `### 本次需求\n${prompt}`,
        '注意：在整个会话中脚本应保持一致连贯；本次请基于现有脚本在此基础上修改。只输出脚本代码本身，不要解释、不要 markdown 代码块包裹。'
      ].filter(Boolean).join('\n\n')

      const res = await window.electronAPI.ai.generateScript(cfgRes.cfg, fullPrompt)
      if (res.success && res.text) {
        // 去除可能的 ```bash 代码块包裹
        const script = res.text.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim()
        // 记录本次会话
        aiConvoRef.current = [
          ...aiConvoRef.current.slice(-10),
          { role: 'user', content: prompt },
          { role: 'assistant', content: script }
        ]
        setContent(script)
        setExtractedVars(extractVariables(script))
        message.success(aiConvoRef.current.length > 2 ? '已基于上一版本继续生成' : '脚本已生成，可编辑后保存')
      } else {
        message.error(res.error || '生成失败')
      }
    } catch (e) {
      message.error(`生成失败: ${(e as Error).message}`)
    } finally {
      setAiLoading(false)
    }
  }, [aiPrompt, getActiveModelConfig, content])

  return (
    <>
      <Modal
      open={open}
      title={isEdit ? t('shellScript.editTitle') : t('shellScript.createTitle')}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      width={860}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item
            label={t('shellScript.name')}
            name="name"
            rules={[{ required: true, message: t('shellScript.nameRequired') }]}
          >
            <Input placeholder={t('shellScript.name')} />
          </Form.Item>
          <Form.Item label={t('shellScript.category')} name="category">
            <Select>
              {SCRIPT_CATEGORIES.map(cat => (
                <Select.Option key={cat} value={cat}>
                  {t(`shellScript.categories.${cat}`)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </div>
        <Form.Item label={t('shellScript.description')} name="description">
          <TextArea rows={2} placeholder={t('shellScript.descriptionPlaceholder')} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item label={t('shellScript.timeout')} name="timeout">
            <InputNumber min={1} max={3600} style={{ width: '100%' }} addonAfter={t('shellScript.seconds')} />
          </Form.Item>
          {isEdit && (
            <Form.Item label={t('shellScript.changeNote')} name="changeNote">
              <Input placeholder={t('shellScript.changeNotePlaceholder')} />
            </Form.Item>
          )}
        </div>
      </Form>

      {extractedVars.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={t('shellScript.detectedParams')}
          description={
            <Space wrap size={4}>
              {extractedVars.map(v => (
                <Tag
                  key={v}
                  className="jump-var-tag"
                  color="blue"
                  style={{ cursor: 'pointer', marginRight: 0 }}
                  onClick={() => handleJumpToVar(v)}
                  title={t('shellScript.jumpToVar') || '点击可跳转到编辑器中对应位置（多次点击逐处切换）'}
                >
                  {v}
                </Tag>
              ))}
            </Space>
          }
        />
      )}

      {/* AI 编写 + 全屏编辑 工具条（紧贴编辑器上方） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.25)', borderBottom: 'none', borderRadius: '8px 8px 0 0' }}>
        <Input.TextArea
          placeholder="用一句话描述你需要 AI 编写的脚本，例如：定期清理 7 天前的 Docker 容器日志"
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          autoSize={{ minRows: 1, maxRows: 2 }}
          style={{ resize: 'none', background: '#000000', border: '1px solid #3a3a3c', color: '#f5f5f7' }}
        />
        <Button type="primary" icon={<RobotOutlined />} loading={aiLoading} onClick={runAiGenerate} style={{ flexShrink: 0 }}>
          {aiLoading ? 'AI 编写中…' : 'AI 编写'}
        </Button>
        <Tooltip title="全屏编辑">
          <Button icon={<FullscreenOutlined />} onClick={() => setFullscreenEdit(true)} style={{ flexShrink: 0 }} />
        </Tooltip>
      </div>

      <Editor
        height={360}
        language="shell"
        theme="vs-dark"
        value={content}
        onChange={handleContentChange}
        onMount={(editor) => { editorRef.current = editor }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2
        }}
      />
    </Modal>

      {/* ========== 全屏编辑层 ========== */}
      <Modal
        open={fullscreenEdit}
        onCancel={() => setFullscreenEdit(false)}
        footer={null}
        closable
        width="100vw"
        style={{ top: 0, padding: 0, maxWidth: '100vw', height: '100vh' }}
        title={isEdit ? t('shellScript.editTitle') : t('shellScript.createTitle')}
        styles={{ body: { height: 'calc(100vh - 55px)', padding: 0, background: '#1e1e1e' } }}
      >
        <Editor
          height="100%"
          language="shell"
          theme="vs-dark"
          value={content}
          onChange={handleContentChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2
          }}
        />
      </Modal>
    </>
  )
}

function extractVariables(content: string): string[] {
  const pattern = /\$\{([^}]+)\}/g
  const matches = content.match(pattern) || []
  const internal = getInternallyDefinedVars(content)
  const variables = new Set<string>()
  for (const match of matches) {
    const raw = match.replace(/\$\{|\}/g, '')
    // 取变量名：兼容 `${NAME}`、`${NAME:-default}`、`${NAME-DEF}`、`${NAME?err}` 等
    const nameMatch = raw.match(/^[A-Za-z_][A-Za-z0-9_]*/)
    const name = nameMatch ? nameMatch[0] : ''
    // 只保留需外部传入的参数，脚本内部已赋值/定义的变量不计入
    if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !internal.has(name)) {
      variables.add(name)
    }
  }
  return Array.from(variables)
}

// 识别脚本内部已定义的变量（赋值、local/export/readonly、for 循环变量等）
function getInternallyDefinedVars(content: string): Set<string> {
  const defined = new Set<string>()
  // 先剥离注释（# 到行尾），注释里的 NAME=value / for NAME 不作为内部定义
  const code = content.replace(/#[^\n]*/g, ' ')
  // `NAME=`、`local NAME=`、`readonly NAME=`、`export NAME=`、`declare -x NAME=`
  const assignRe = /(?:\blocal\s+|\breadonly\s+|\bexport\s+|\bdeclare\s+-\w+\s+|\btypeset\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/g
  let m: RegExpExecArray | null
  while ((m = assignRe.exec(code)) !== null) {
    defined.add(m[1])
  }
  // `for NAME in ...` 循环变量也属于内部
  const forRe = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g
  while ((m = forRe.exec(code)) !== null) {
    defined.add(m[1])
  }
  return defined
}

export default ShellScripts

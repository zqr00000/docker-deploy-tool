/**
 * AI 模型配置面板（独立组件）
 * 由 AI 运维终端（AgentTerminal）与系统管理（Settings）页共用。
 * 组件内部自行管理配置状态并读写 localStorage key 'agentOpsModelConfig'，
 * 通过 window.electronAPI 调用 opsAgent.setConfig、secure.decrypt/encrypt、
 * ai.getModels、opsAgent.chat（测试连接）等，逻辑与 AgentTerminal 原有实现保持一致。
 */

import React, { useEffect, useState } from 'react'
import {
  Select,
  Button,
  Space,
  Typography,
  message,
  Tag,
  Input,
  Slider,
  Divider,
  Switch,
  InputNumber
} from 'antd'
import {
  SettingOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  SaveOutlined,
  SearchOutlined,
  ApiOutlined,
  RobotOutlined,
  BulbOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckOutlined,
  EditOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import type { ModelConfig, ProviderProfile, AIProvider } from '../agent/types'
import { DEFAULT_MODEL_CONFIG, PROVIDER_PRESETS } from '../agent/types'

const { Text } = Typography
const { TextArea } = Input

// Storage keys
const CONFIG_KEY = 'agentOpsModelConfig'

// 提供商元数据（配置面板卡片展示用）
const PROVIDER_OPTIONS: Array<{ provider: AIProvider; name: string; color: string; desc: string }> = [
  { provider: 'openai', name: 'OpenAI', color: '#10a37f', desc: 'GPT 系列' },
  { provider: 'anthropic', name: 'Anthropic', color: '#d97757', desc: 'Claude 系列' },
  { provider: 'azure', name: 'Azure', color: '#0078d4', desc: 'Azure OpenAI' },
  { provider: 'gemini', name: 'Gemini', color: '#4285f4', desc: 'Google AI' },
  { provider: 'ollama', name: 'Ollama', color: '#0A84FF', desc: '本地模型' },
  { provider: 'custom', name: '自定义', color: '#FF9500', desc: '兼容 API' }
]

// 路由档位展示文案与颜色（多模型路由）
const ROUTE_META: Record<string, { label: string; color: string; hint: string }> = {
  thinking: { label: '分析模型', color: 'purple', hint: '分析/诊断/排查' },
  critique: { label: '审查模型', color: 'geekblue', hint: '检查/复核/验证' },
  vision: { label: '视觉模型', color: 'cyan', hint: '截图/图片' },
  execution: { label: '默认模型', color: 'default', hint: '日常命令' }
}

// 终端配色主题（参考 Netcatty 主题系统：可切换多套终端配色）
const TERMINAL_THEMES: Record<string, { name: string; theme: any }> = {
  'github-dark': {
    name: 'Apple 暗色',
    theme: { background: '#000000', foreground: '#f5f5f7', cursor: '#0A84FF', black: '#000000', red: '#FF453A', green: '#30D158', yellow: '#FF9500', blue: '#0A84FF', magenta: '#BF5AF2', cyan: '#64D2FF', white: '#f5f5f7' }
  },
  dracula: {
    name: 'Dracula',
    theme: { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2' }
  },
  'solarized-dark': {
    name: 'Solarized 暗色',
    theme: { background: '#002b36', foreground: '#839496', cursor: '#0A84FF', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5' }
  }
}

// 兼容旧配置：无 providerProfiles 时从扁平字段生成默认档案（参考 Netcatty 多提供商管理）
function ensureProfiles(cfg: ModelConfig): ModelConfig {
  if (cfg.providerProfiles && cfg.providerProfiles.length > 0) return cfg
  const base: ProviderProfile = {
    id: 'profile-default',
    name: cfg.provider === 'openai' ? '默认配置' : cfg.provider,
    provider: cfg.provider,
    apiKey: cfg.apiKey || '',
    model: cfg.model || '',
    baseUrl: cfg.baseUrl || '',
    azureEndpoint: cfg.azureEndpoint,
    azureDeployment: cfg.azureDeployment
  }
  return { ...cfg, activeProfileId: 'profile-default', providerProfiles: [base] }
}

export interface AiModelConfigPanelProps {
  /** 测试连接时传入的服务器 id（AgentTerminal 会传入当前选中服务器；Settings 页可省略） */
  selectedServer?: string
}

const AiModelConfigPanel: React.FC<AiModelConfigPanelProps> = ({ selectedServer }) => {
  // 配置面板分组导航 + 终端主题（参考 Netcatty 设置页分组式导航）
  const [configTab, setConfigTab] = useState<'connection' | 'runtime' | 'agent' | 'appearance'>('connection')
  const [terminalThemeId, setTerminalThemeId] = useState(() => localStorage.getItem('agentTerminalTheme') || 'github-dark')

  // Config state
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => {
    const saved = localStorage.getItem(CONFIG_KEY)
    const parsed = saved ? JSON.parse(saved) : DEFAULT_MODEL_CONFIG
    return ensureProfiles(parsed)
  })
  const [configSaved, setConfigSaved] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  // 同步模型配置到主进程 Mastra Agent
  useEffect(() => {
    window.electronAPI.opsAgent.setConfig(modelConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelConfig])

  // 解密本地加密存储的 API Key（safeStorage 密文以 enc: 前缀标记；扁平 + 所有档案）
  useEffect(() => {
    const decryptAll = async () => {
      let cfg = modelConfig
      if (cfg.apiKey.startsWith('enc:')) {
        const r = await window.electronAPI.secure.decrypt(cfg.apiKey.slice(4))
        if (r.success && r.data) cfg = { ...cfg, apiKey: r.data }
      }
      if ((cfg.providerProfiles || []).some(p => p.apiKey.startsWith('enc:'))) {
        const profiles = await Promise.all((cfg.providerProfiles || []).map(async p => {
          if (!p.apiKey.startsWith('enc:')) return p
          const r = await window.electronAPI.secure.decrypt(p.apiKey.slice(4))
          return { ...p, apiKey: r.success && r.data ? r.data : p.apiKey }
        }))
        cfg = { ...cfg, providerProfiles: profiles }
      }
      setModelConfig(cfg)
    }
    decryptAll().catch(() => { /* 解密失败保持原样 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 当前激活档案（扁平字段为激活档案的镜像）
  const profiles = modelConfig.providerProfiles || []
  const activeProfile = profiles.find(p => p.id === modelConfig.activeProfileId) || profiles[0]

  // 切换激活档案（同步扁平字段，供 chat / setConfig 使用）
  const activateProfile = (id: string) => {
    const p = profiles.find(x => x.id === id)
    if (!p) return
    setModelConfig({
      ...modelConfig,
      activeProfileId: id,
      provider: p.provider, apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl,
      azureEndpoint: p.azureEndpoint, azureDeployment: p.azureDeployment,
      maxTokens: p.maxTokens ?? modelConfig.maxTokens
    })
  }

  // 更新激活档案（同时镜像到扁平字段）
  const updateProfile = (patch: Partial<ProviderProfile>) => {
    setModelConfig(prev => {
      const prevProfiles = prev.providerProfiles || []
      const updated = prevProfiles.map(p => p.id === prev.activeProfileId ? { ...p, ...patch } : p)
      const next: ModelConfig = { ...prev, providerProfiles: updated }
      if (patch.provider !== undefined) next.provider = patch.provider
      if (patch.apiKey !== undefined) next.apiKey = patch.apiKey
      if (patch.model !== undefined) next.model = patch.model
      if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl
      if (patch.azureEndpoint !== undefined) next.azureEndpoint = patch.azureEndpoint
      if (patch.azureDeployment !== undefined) next.azureDeployment = patch.azureDeployment
      if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
      return next
    })
  }

  // 新增提供商档案（参考 Netcatty 多提供商 addProvider）
  const addProfile = () => {
    const profile: ProviderProfile = {
      id: `profile-${Date.now()}`,
      name: `配置 ${(modelConfig.providerProfiles || []).length + 1}`,
      provider: 'openai',
      apiKey: '',
      model: '',
      baseUrl: 'https://api.openai.com/v1'
    }
    setModelConfig(prev => ({
      ...prev,
      providerProfiles: [...(prev.providerProfiles || []), profile],
      activeProfileId: profile.id,
      provider: 'openai', apiKey: '', model: '', baseUrl: profile.baseUrl
    }))
  }

  // 删除提供商档案（至少保留一个）
  const removeProfile = (id: string) => {
    setModelConfig(prev => {
      const prevProfiles = prev.providerProfiles || []
      if (prevProfiles.length <= 1) {
        message.warning('至少保留一个配置')
        return prev
      }
      const updated = prevProfiles.filter(p => p.id !== id)
      const activeId = prev.activeProfileId === id ? updated[0].id : prev.activeProfileId
      const active = updated.find(p => p.id === activeId) || updated[0]
      return {
        ...prev,
        providerProfiles: updated,
        activeProfileId: active.id,
        provider: active.provider, apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl,
        azureEndpoint: active.azureEndpoint, azureDeployment: active.azureDeployment
      }
    })
  }

  const saveConfig = async () => {
    if (!modelConfig.apiKey) {
      message.warning('请输入 API Key')
      return
    }
    // API Key 用系统安全存储加密后落盘（enc: 前缀标记密文）；所有档案的 Key 一并加密
    const enc = await window.electronAPI.secure.encrypt(modelConfig.apiKey)
    const storedKey = enc.success ? `enc:${enc.data}` : modelConfig.apiKey
    let profiles = modelConfig.providerProfiles || []
    if (enc.success) {
      profiles = await Promise.all((modelConfig.providerProfiles || []).map(async p => {
        const e = await window.electronAPI.secure.encrypt(p.apiKey)
        return { ...p, apiKey: e.success ? `enc:${e.data}` : p.apiKey }
      }))
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...modelConfig, apiKey: storedKey, providerProfiles: profiles }))
    window.electronAPI.opsAgent.setConfig(modelConfig)
    setConfigSaved(true)
    message.success('配置已保存')
    setTimeout(() => setConfigSaved(false), 2000)
  }

  // 设置搜索：根据关键词自动跳转到对应配置分组（参考 Netcatty 设置搜索）
  const handleConfigSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value.trim().toLowerCase()
    if (!q) return
    const map: Array<[RegExp, 'connection' | 'runtime' | 'agent' | 'appearance']> = [
      [/api|key|模型|提供商|url|endpoint|deployment|连接/, 'connection'],
      [/温度|token|运行|参数|迭代/, 'runtime'],
      [/提示词|超时|黑名单|审批|快捷|消息|命令/, 'agent'],
      [/主题|外观|配色|颜色/, 'appearance']
    ]
    for (const [re, tab] of map) {
      if (re.test(q)) { setConfigTab(tab); return }
    }
  }

  // 获取可用模型列表
  const loadModels = async () => {
    if (!modelConfig.apiKey && modelConfig.provider !== 'ollama') {
      message.warning('请先配置 API Key')
      return
    }
    setLoadingModels(true)
    try {
      const result = await window.electronAPI.ai.getModels(
        modelConfig.provider,
        modelConfig.apiKey,
        modelConfig.baseUrl || undefined
      )
      if (result.success && result.data) {
        const models = result.data.map((m: any) => m.id || m.name)
        setAvailableModels(models)
        if (models.length > 0) {
          message.success(`获取到 ${models.length} 个模型`)
        } else {
          message.info('未获取到模型列表，请手动输入')
        }
      } else {
        message.warning(result.error || '获取模型失败')
      }
    } catch (error) {
      message.error(`获取模型失败: ${(error as Error).message}`)
    } finally {
      setLoadingModels(false)
    }
  }

  const testConnection = async () => {
    if (!modelConfig.apiKey || !modelConfig.model) {
      message.warning('请先配置 API Key 和模型')
      return
    }
    setTestingConnection(true)
    const started = Date.now()
    try {
      const cfg = {
        provider: modelConfig.provider,
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        baseUrl: modelConfig.baseUrl || undefined,
        extraParams: (modelConfig.provider === 'azure')
          ? { azureEndpoint: modelConfig.azureEndpoint, apiVersion: modelConfig.apiVersion }
          : {}
      }
      // 用轻量文本生成验证连通性（不走完整 Agent，快很多）
      const res = await Promise.race([
        window.electronAPI.ai.generateScript(cfg, '请只回复两个字：成功'),
        new Promise<{ success: boolean; error?: string }>((_, reject) => {
          setTimeout(() => reject(new Error('连接测试超时（15s）')), 15000)
        })
      ]) as { success: boolean; text?: string; error?: string }
      if (!res.success) {
        throw new Error(res.error || '连接失败')
      }
      const cost = ((Date.now() - started) / 1000).toFixed(1)
      message.success(`连接成功（耗时 ${cost}s）`)
    } catch (error) {
      message.error(`连接失败: ${(error as Error).message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  // 多模型路由配置
  const updateRouting = (route: string, field: string, value: any) => {
    const routing = { ...(modelConfig.routing || {}) }
    const cur = { ...((routing as any)[route] || {}) }
    ;(routing as any)[route] = { ...cur, [field]: value }
    setModelConfig({ ...modelConfig, routing })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg-color)', overflow: 'hidden' }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--app-content-bg)', borderBottom: '1px solid var(--app-border-color)', flexShrink: 0 }}>
        <Space>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, rgba(88,166,255,0.16), rgba(10,132,255,0.16))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(88,166,255,0.3)' }}>
            <SettingOutlined style={{ color: '#0A84FF', fontSize: 13 }} />
          </div>
          <Text strong style={{ color: 'var(--app-text-color)', fontSize: 13, letterSpacing: 0.5 }}>模型配置</Text>
          <Tag style={{ margin: 0, fontSize: 10, background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.3)', color: '#0A84FF', borderRadius: 999, padding: '0 8px' }}>Mastra Agent</Tag>
        </Space>
        {modelConfig.apiKey && modelConfig.model && (
          <Tag icon={<CheckCircleOutlined />} style={{ border: '1px solid rgba(63,185,80,0.4)', background: 'rgba(63,185,80,0.08)', color: '#30D158', borderRadius: 999, fontSize: 11, flexShrink: 0 }}>
            已配置 · {modelConfig.model}
          </Tag>
        )}
      </div>

      {/* 主体内容 */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--app-bg-color)', padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          {/* 设置搜索（参考 Netcatty Ctrl+F 设置搜索） */}
          <Input prefix={<SearchOutlined />} placeholder="搜索设置… 如：API / 超时 / 主题" size="small" allowClear
            onChange={handleConfigSearch} style={{ background: 'var(--app-content-bg)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8, maxWidth: 320 }} />
          <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>
            {/* 左侧分组导航（参考 Netcatty SettingsPage 垂直 TabsList） */}
            <div style={{ width: 134, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid var(--app-border-color)', paddingRight: 10 }}>
              {[
                { key: 'connection', label: '连接', icon: <ApiOutlined /> },
                { key: 'runtime', label: '运行参数', icon: <ThunderboltOutlined /> },
                { key: 'agent', label: 'Agent 行为', icon: <RobotOutlined /> },
                { key: 'appearance', label: '外观', icon: <BulbOutlined /> }
              ].map(item => (
                <div key={item.key} className={`agent-config-nav ${configTab === item.key ? 'active' : ''}`} onClick={() => setConfigTab(item.key as any)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* 右侧分组内容 */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '100%', maxWidth: 1060, minWidth: 0 }}>
                {configTab === 'connection' && (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {/* 提供商档案列表（参考 Netcatty 多提供商管理） */}
                    <div style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(modelConfig.providerProfiles || []).map(p => {
                        const meta = PROVIDER_OPTIONS.find(x => x.provider === p.provider)
                        const isActive = modelConfig.activeProfileId === p.id
                        return (
                          <div key={p.id} className={`provider-chip ${isActive ? 'active' : ''}`} onClick={() => activateProfile(p.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, cursor: 'pointer' }}>
                            <span className="provider-dot" style={{ background: meta?.color || '#0A84FF', color: meta?.color || '#0A84FF' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, color: isActive ? 'var(--app-text-color)' : 'var(--app-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--app-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.model || meta?.name || p.provider}</div>
                            </div>
                            {isActive && <CheckCircleOutlined style={{ color: '#0A84FF', fontSize: 11, flexShrink: 0 }} />}
                            {(modelConfig.providerProfiles || []).length > 1 && (
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除配置"
                                style={{ padding: 0, width: 16, height: 16, fontSize: 10, flexShrink: 0 }}
                                onClick={(e) => { e.stopPropagation(); removeProfile(p.id) }} />
                            )}
                          </div>
                        )
                      })}
                      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addProfile}
                        style={{ borderRadius: 8, borderColor: 'var(--app-border-color)', color: '#0A84FF', fontSize: 11 }}>添加配置</Button>
                    </div>

                    {/* 激活档案表单 */}
                    <div className="config-card" style={{ flex: 1, minWidth: 0 }}>
                      <div className="config-card-title"><ApiOutlined style={{ color: '#0A84FF' }} />{activeProfile?.name || '模型连接'}</div>

                      {/* 档案名称 */}
                      <span className="field-label">配置名称</span>
                      <Input value={activeProfile?.name || ''} onChange={e => updateProfile({ name: e.target.value })}
                        size="small" style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8 }} />

                      {/* 提供商选择 */}
                      <span className="field-label" style={{ marginTop: 12 }}>提供商</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 6, marginBottom: 12, marginTop: 6 }}>
                        {PROVIDER_OPTIONS.map(p => (
                          <div key={p.provider} className={`provider-chip ${modelConfig.provider === p.provider ? 'active' : ''}`}
                            onClick={() => {
                              const preset = PROVIDER_PRESETS.find(x => x.provider === p.provider)
                              // 切换提供商时保留已填写的 API Key，仅重置模型与 Base URL
                              updateProfile({ provider: p.provider, model: '', baseUrl: preset?.baseUrl || '' })
                            }}>
                            <span className="provider-dot" style={{ background: p.color, color: p.color }} />
                            <div style={{ lineHeight: 1.25 }}>
                              <div style={{ fontSize: 12, color: modelConfig.provider === p.provider ? 'var(--app-text-color)' : 'var(--app-text-secondary)', fontWeight: 500 }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--app-text-secondary)' }}>{p.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* API Key */}
                      <span className="field-label">API Key {modelConfig.provider === 'ollama' && <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)', textTransform: 'none' }}>(可选)</Text>}</span>
                      <Input.Password value={modelConfig.apiKey} onChange={e => updateProfile({ apiKey: e.target.value })}
                        placeholder={modelConfig.provider === 'anthropic' ? 'sk-ant-...' : modelConfig.provider === 'ollama' ? '本地模型不需要' : 'sk-...'}
                        size="small" style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8 }} />

                      {/* Base URL（custom / ollama） */}
                      {(modelConfig.provider === 'custom' || modelConfig.provider === 'ollama') && (
                        <>
                          <span className="field-label" style={{ marginTop: 12 }}>Base URL</span>
                          <Input value={modelConfig.baseUrl} onChange={e => updateProfile({ baseUrl: e.target.value })}
                            placeholder={modelConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} size="small"
                            style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8 }} />
                        </>
                      )}

                      {/* Azure 特殊字段 */}
                      {modelConfig.provider === 'azure' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
                          <div>
                            <span className="field-label">Endpoint</span>
                            <Input value={modelConfig.azureEndpoint || ''} onChange={e => updateProfile({ azureEndpoint: e.target.value })}
                              placeholder="https://xxx.openai.azure.com" size="small" style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8 }} />
                          </div>
                          <div>
                            <span className="field-label">Deployment</span>
                            <Input value={modelConfig.azureDeployment || ''} onChange={e => updateProfile({ azureDeployment: e.target.value })}
                              placeholder="gpt-4o" size="small" style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8 }} />
                          </div>
                        </div>
                      )}

                      {/* 模型选择 */}
                      <span className="field-label" style={{ marginTop: 12 }}>模型</span>
                      <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                        <Select value={modelConfig.model} onChange={v => updateProfile({ model: v })}
                          style={{ flex: 1 }} size="small" placeholder="选择或输入模型"
                          showSearch
                          options={[
                            ...(PROVIDER_PRESETS.find(p => p.provider === modelConfig.provider)?.models || []).map(m => ({ value: m, label: m })),
                            ...availableModels.filter(m => !(PROVIDER_PRESETS.find(p => p.provider === modelConfig.provider)?.models || []).includes(m)).map(m => ({ value: m, label: `${m} (已获取)` }))
                          ]}
                          dropdownRender={menu => (
                            <>
                              {menu}
                              <Divider style={{ margin: '4px 0' }} />
                              <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--app-text-secondary)' }}>
                                {modelConfig.provider === 'ollama' ? '提示：先安装 Ollama 并运行模型，然后点击刷新按钮获取' : '提示：点击刷新按钮获取模型列表，或手动输入'}
                              </div>
                            </>
                          )}
                        />
                        <Button size="small" icon={<ReloadOutlined />} loading={loadingModels} onClick={loadModels} title="获取模型列表"
                          style={{ background: 'var(--app-hover-bg)', borderColor: 'var(--app-border-color)', color: '#0A84FF' }} />
                      </Space.Compact>

                      {/* 单模型：最大输出 / 上下文窗口 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                        <div>
                          <span className="field-label">最大输出（tokens）</span>
                          <InputNumber value={activeProfile?.maxTokens ?? modelConfig.maxTokens}
                            onChange={v => updateProfile({ maxTokens: (v as number) ?? modelConfig.maxTokens })}
                            min={100} max={64000} step={100} size="small" style={{ width: '100%', marginTop: 6 }} />
                        </div>
                        <div>
                          <span className="field-label">上下文窗口（tokens）</span>
                          <InputNumber value={activeProfile?.contextWindow ?? 32768}
                            onChange={v => updateProfile({ contextWindow: (v as number) || undefined })}
                            min={1024} max={1048576} step={1024} size="small" style={{ width: '100%', marginTop: 6 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configTab === 'runtime' && (
                  <div className="config-card">
                    <div className="config-card-title"><ThunderboltOutlined style={{ color: '#0A84FF' }} />运行参数</div>

                    {/* 温度 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span className="field-label" style={{ margin: 0 }}>温度</span>
                      <Text strong style={{ color: '#0A84FF', fontSize: 12 }}>{modelConfig.temperature.toFixed(1)}</Text>
                    </div>
                    <Slider value={modelConfig.temperature} onChange={v => setModelConfig({ ...modelConfig, temperature: v })} min={0} max={1} step={0.1} tooltip={{ open: false }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -8, marginBottom: 14 }}>
                      <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)' }}>保守</Text>
                      <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)' }}>创意</Text>
                    </div>

                    {/* 最大 Token */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span className="field-label" style={{ margin: 0 }}>最大 Token</span>
                      <Text strong style={{ color: '#0A84FF', fontSize: 12 }}>{modelConfig.maxTokens}</Text>
                    </div>
                    <Slider value={modelConfig.maxTokens} onChange={v => setModelConfig({ ...modelConfig, maxTokens: v })} min={100} max={8000} step={100} tooltip={{ open: false }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -8, marginBottom: 16 }}>
                      <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)' }}>100</Text>
                      <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)' }}>8000</Text>
                    </div>
                  </div>
                )}

                {configTab === 'agent' && (
                  <div className="config-card">
                    <div className="config-card-title"><RobotOutlined style={{ color: '#BF5AF2' }} />Agent 行为</div>

                    {/* 系统提示词 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className="field-label" style={{ margin: 0 }}>系统提示词</span>
                      <Button size="small" type="text" icon={editingPrompt ? <CheckOutlined /> : <EditOutlined />} onClick={() => setEditingPrompt(!editingPrompt)} style={{ color: 'var(--app-text-secondary)', padding: 0, height: 20, fontSize: 11 }}>
                        {editingPrompt ? '完成' : '编辑'}
                      </Button>
                    </div>
                    {editingPrompt ? (
                      <TextArea value={modelConfig.systemPrompt} onChange={e => setModelConfig({ ...modelConfig, systemPrompt: e.target.value })} rows={4} size="small"
                        style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 8 }} />
                    ) : (
                      <div style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--app-text-secondary)', lineHeight: 1.6, maxHeight: 84, overflow: 'hidden' }}>
                        {modelConfig.systemPrompt || '未设置系统提示词，点击"编辑"进行配置'}
                      </div>
                    )}

                    {/* 命令超时 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>命令超时</Text>
                        <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block' }}>AI 执行远程命令的最长等待时间</Text>
                      </div>
                      <InputNumber value={modelConfig.commandTimeout} onChange={v => setModelConfig({ ...modelConfig, commandTimeout: (v as number) || 30000 })}
                        min={5000} max={120000} step={5000} size="small" style={{ width: 110, background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 6 }} />
                      <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)', marginLeft: 4, flexShrink: 0 }}>ms</Text>
                    </div>

                    {/* 最大迭代步骤 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>最大迭代步骤</Text>
                        <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block' }}>一次任务中最多连续工具调用步数</Text>
                      </div>
                      <InputNumber value={modelConfig.maxIterations} onChange={v => setModelConfig({ ...modelConfig, maxIterations: (v as number) || 15 })}
                        min={1} max={50} size="small" style={{ width: 80, background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 6 }} />
                      <Text style={{ fontSize: 10, color: 'var(--app-text-secondary)', marginLeft: 4, flexShrink: 0 }}>步</Text>
                    </div>

                    {/* 自动批准高危操作 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>自动批准高危操作</Text>
                        <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block' }}>开启后高危命令无需人工确认（谨慎使用）</Text>
                      </div>
                      <Switch size="small" checked={modelConfig.approvalMode === 'auto'}
                        onChange={v => setModelConfig({ ...modelConfig, approvalMode: v ? 'auto' : 'manual' })} />
                    </div>

                    {/* Web 搜索 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>Web 搜索</Text>
                        <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block' }}>AI 可联网查询报错信息与命令用法</Text>
                      </div>
                      <Switch size="small" checked={modelConfig.enableWebSearch}
                        onChange={v => setModelConfig({ ...modelConfig, enableWebSearch: v })} />
                    </div>

                    {/* 多模型路由 */}
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>多模型路由</Text>
                          <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block' }}>按任务类型路由到不同模型（复杂分析用强模型，日常用轻量模型）</Text>
                        </div>
                        <Switch size="small" checked={modelConfig.enableRouting}
                          onChange={v => setModelConfig({ ...modelConfig, enableRouting: v })} />
                      </div>
                      {modelConfig.enableRouting && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(['thinking', 'critique', 'vision'] as string[]).map(route => {
                            const meta = ROUTE_META[route]
                            const r = (modelConfig.routing || {})[route]
                            return (
                              <div key={route} style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', borderRadius: 8, padding: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>{meta.label}</Text>
                                  <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10 }}>{meta.hint}</Text>
                                </div>
                                <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                                  <Select value={r?.provider || modelConfig.provider} onChange={v => updateRouting(route, 'provider', v)}
                                    size="small" style={{ width: 118 }}
                                    options={PROVIDER_PRESETS.map(p => ({ value: p.provider, label: p.name }))} />
                                  <Input value={r?.model || ''} onChange={e => updateRouting(route, 'model', e.target.value)}
                                    size="small" placeholder="路由模型，留空回退主模型"
                                    style={{ background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)' }} />
                                </Space.Compact>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* 审批超时 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>审批超时（秒）</Text>
                        <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block' }}>审批弹窗超时未响应自动拒绝，默认 60s</Text>
                      </div>
                      <InputNumber size="small" min={10} max={300} value={modelConfig.approvalTimeout || 60}
                        onChange={v => setModelConfig({ ...modelConfig, approvalTimeout: v || 60 })}
                        style={{ width: 90, background: 'var(--app-bg-color)', border: '1px solid var(--app-border-color)', color: 'var(--app-text-color)', borderRadius: 6 }} />
                    </div>

                    {/* 命令黑名单 */}
                    <div style={{ marginTop: 16 }}>
                      <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>命令黑名单</Text>
                      <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block', marginBottom: 6 }}>命中子串的命令将被直接拒绝执行，回车添加</Text>
                      <Select mode="tags" value={modelConfig.commandBlocklist} onChange={v => setModelConfig({ ...modelConfig, commandBlocklist: v })}
                        placeholder="如：rm -rf /" size="small" tokenSeparators={[',']} style={{ width: '100%' }} />
                    </div>

                    {/* 快捷消息 */}
                    <div style={{ marginTop: 16 }}>
                      <Text style={{ color: 'var(--app-text-color)', fontSize: 12 }}>快捷消息</Text>
                      <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block', marginBottom: 6 }}>空状态页显示的快捷命令，回车添加</Text>
                      <Select mode="tags" value={modelConfig.quickMessages} onChange={v => setModelConfig({ ...modelConfig, quickMessages: v })}
                        placeholder="输入快捷命令文案" size="small" tokenSeparators={[',']} style={{ width: '100%' }} />
                    </div>
                  </div>
                )}

                {configTab === 'appearance' && (
                  <div className="config-card">
                    <div className="config-card-title"><BulbOutlined style={{ color: '#FF9500' }} />外观</div>

                    {/* 终端主题（参考 Netcatty ThemeList） */}
                    <span className="field-label">终端主题</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {Object.entries(TERMINAL_THEMES).map(([id, t]) => (
                        <div key={id} className={`provider-chip ${terminalThemeId === id ? 'active' : ''}`}
                          onClick={() => { setTerminalThemeId(id); localStorage.setItem('agentTerminalTheme', id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}>
                          <span style={{ width: 28, height: 18, borderRadius: 4, background: `linear-gradient(135deg, ${t.theme.background} 0%, ${t.theme.blue} 100%)`, border: '1px solid var(--app-border-color)', flexShrink: 0 }} />
                          <Text style={{ color: terminalThemeId === id ? 'var(--app-text-color)' : 'var(--app-text-secondary)', fontSize: 12 }}>{t.name}</Text>
                          {terminalThemeId === id && <CheckCircleOutlined style={{ color: '#0A84FF', marginLeft: 'auto' }} />}
                        </div>
                      ))}
                    </div>
                    <Text style={{ color: 'var(--app-text-secondary)', fontSize: 10, display: 'block', marginTop: 8 }}>主题对新打开的终端会话生效</Text>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--app-content-bg)', borderTop: '1px solid var(--app-border-color)', flexShrink: 0 }}>
        <Space size={10} wrap>
          <Button icon={<ThunderboltOutlined />} loading={testingConnection} onClick={testConnection}
            style={{ borderColor: 'var(--app-border-color)', color: '#0A84FF', borderRadius: 8 }}>测试连接</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={saveConfig}
            style={{ background: 'linear-gradient(135deg, #0A84FF 0%, #0051D5 100%)', borderColor: 'transparent', borderRadius: 8, boxShadow: '0 4px 14px rgba(10,132,255,0.35)' }}>保存配置</Button>
          {configSaved && (
            <Tag success icon={<CheckCircleOutlined />} style={{ borderRadius: 999, fontSize: 11, margin: 0 }}>已保存</Tag>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
          {modelConfig.provider === 'ollama' ? 'Ollama 本地模型无需 API Key' : '配置将同步至 Mastra Agent'}
        </Text>
      </div>
    </div>
  )
}

export default AiModelConfigPanel
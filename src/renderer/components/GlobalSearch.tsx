import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Modal,
  Input,
  List,
  Tag,
  Typography,
  Empty,
  Spin,
  Space,
  Badge,
  Tabs,
  Divider,
  Card
} from 'antd'
import type { InputRef } from 'antd'
import {
  SearchOutlined,
  CloudServerOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  HddOutlined,
  ApiOutlined,
  ContainerOutlined,
  HistoryOutlined,
  EnterOutlined,
  ArrowRightOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

const { Text, Title } = Typography

interface SearchResult {
  id: string
  type: 'server' | 'app' | 'template' | 'container' | 'image' | 'volume' | 'network' | 'deployHistory'
  title: string
  subtitle?: string
  status?: string
  path: string
  icon: React.ReactNode
  color: string
}

interface GlobalSearchProps {
  visible: boolean
  onClose: () => void
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ visible, onClose }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<InputRef>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 焦点在搜索输入框
  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible])

  // 执行搜索
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    const searchResults: SearchResult[] = []
    const lowerQuery = query.toLowerCase()

    try {
      // 搜索服务器
      const servers = await window.electronAPI.server.getAll()
      servers.forEach(server => {
        if (
          server.name.toLowerCase().includes(lowerQuery) ||
          server.host.toLowerCase().includes(lowerQuery) ||
          server.username.toLowerCase().includes(lowerQuery)
        ) {
          searchResults.push({
            id: server.id,
            type: 'server',
            title: server.name,
            subtitle: `${server.host}:${server.port}`,
            status: server.status,
            path: `/servers/${server.id}`,
            icon: <CloudServerOutlined />,
            color: server.status === 'online' ? 'success' : 'default'
          })
        }
      })

      // 搜索应用
      const apps = await window.electronAPI.app.getAll()
      apps.forEach(app => {
        if (
          app.name.toLowerCase().includes(lowerQuery) ||
          app.projectPath?.toLowerCase().includes(lowerQuery)
        ) {
          searchResults.push({
            id: app.id,
            type: 'app',
            title: app.name,
            subtitle: app.projectPath,
            status: app.status,
            path: `/apps/${app.id}`,
            icon: <AppstoreOutlined />,
            color: app.status === 'running' ? 'processing' : 'default'
          })
        }
      })

      // 搜索模板
      const templates = await window.electronAPI.template.getAll()
      templates.forEach(template => {
        if (
          template.name.toLowerCase().includes(lowerQuery) ||
          template.description?.toLowerCase().includes(lowerQuery)
        ) {
          searchResults.push({
            id: template.id,
            type: 'template',
            title: template.name,
            subtitle: template.description,
            path: `/templates`,
            icon: <FileTextOutlined />,
            color: 'blue'
          })
        }
      })

      // 搜索容器
      for (const app of apps) {
        if (app.containerIds) {
          try {
            const containerIds = JSON.parse(app.containerIds)
            for (const containerId of containerIds) {
              if (containerId.toLowerCase().includes(lowerQuery) || app.name.toLowerCase().includes(lowerQuery)) {
                searchResults.push({
                  id: containerId,
                  type: 'container',
                  title: `${app.name} - ${containerId.substring(0, 12)}`,
                  subtitle: app.serverName,
                  path: `/apps/${app.id}`,
                  icon: <ContainerOutlined />,
                  color: 'cyan'
                })
              }
            }
          } catch {
            // ignore
          }
        }
      }

      // 搜索镜像
      const onlineServers = servers.filter(s => s.status === 'online')
      for (const server of onlineServers.slice(0, 3)) {
        try {
          const images = await window.electronAPI.image.getAll(server.id)
          images.forEach(image => {
            const imageName = image.repoTags?.[0] || image.id.substring(0, 12)
            if (imageName.toLowerCase().includes(lowerQuery)) {
              searchResults.push({
                id: image.id,
                type: 'image',
                title: imageName,
                subtitle: `${server.name} - ${(image.size / 1024 / 1024).toFixed(1)} MB`,
                path: `/images`,
                icon: <HddOutlined />,
                color: 'geekblue'
              })
            }
          })
        } catch {
          // ignore
        }
      }

      // 搜索数据卷
      for (const server of onlineServers.slice(0, 3)) {
        try {
          const volumes = await window.electronAPI.volume.getAll(server.id)
          volumes.forEach(volume => {
            if (volume.name.toLowerCase().includes(lowerQuery)) {
              searchResults.push({
                id: volume.name,
                type: 'volume',
                title: volume.name,
                subtitle: `${server.name} - ${volume.driver}`,
                path: `/volumes`,
                icon: <DatabaseOutlined />,
                color: 'purple'
              })
            }
          })
        } catch {
          // ignore
        }
      }

      // 搜索网络
      for (const server of onlineServers.slice(0, 3)) {
        try {
          const networks = await window.electronAPI.network.getAll(server.id)
          networks.forEach(network => {
            if (network.name?.toLowerCase().includes(lowerQuery)) {
              searchResults.push({
                id: network.id || network.name,
                type: 'network',
                title: network.name,
                subtitle: `${server.name} - ${network.driver}`,
                path: `/networks`,
                icon: <ApiOutlined />,
                color: 'magenta'
              })
            }
          })
        } catch {
          // ignore
        }
      }

    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
      setResults(searchResults)
      setSelectedIndex(0)
    }
  }, [])

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchText)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchText, performSearch])

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      handleSelectResult(results[selectedIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // 选择结果
  const handleSelectResult = (result: SearchResult) => {
    navigate(result.path)
    onClose()
    setSearchText('')
  }

  // 过滤结果
  const filteredResults = useMemo(() => {
    if (activeTab === 'all') return results
    return results.filter(r => r.type === activeTab)
  }, [results, activeTab])

  // 按类型分组统计
  const resultCounts = useMemo(() => {
    const counts: Record<string, number> = { all: results.length }
    results.forEach(r => {
      counts[r.type] = (counts[r.type] || 0) + 1
    })
    return counts
  }, [results])

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      server: t('globalSearch.types.server'),
      app: t('globalSearch.types.app'),
      template: t('globalSearch.types.template'),
      container: t('globalSearch.types.container'),
      image: t('globalSearch.types.image'),
      volume: t('globalSearch.types.volume'),
      network: t('globalSearch.types.network'),
      deployHistory: t('globalSearch.types.deployHistory')
    }
    return labels[type] || type
  }

  // Tab 配置
  const tabItems = [
    {
      key: 'all',
      label: (
        <span>
          {t('globalSearch.all')}
          <Badge count={resultCounts.all || 0} size="small" style={{ marginLeft: 8 }} />
        </span>
      )
    },
    {
      key: 'server',
      label: (
        <span>
          <CloudServerOutlined />
          {resultCounts.server ? <Badge count={resultCounts.server} size="small" style={{ marginLeft: 4 }} /> : null}
        </span>
      )
    },
    {
      key: 'app',
      label: (
        <span>
          <AppstoreOutlined />
          {resultCounts.app ? <Badge count={resultCounts.app} size="small" style={{ marginLeft: 4 }} /> : null}
        </span>
      )
    },
    {
      key: 'template',
      label: (
        <span>
          <FileTextOutlined />
          {resultCounts.template ? <Badge count={resultCounts.template} size="small" style={{ marginLeft: 4 }} /> : null}
        </span>
      )
    },
    {
      key: 'container',
      label: (
        <span>
          <ContainerOutlined />
          {resultCounts.container ? <Badge count={resultCounts.container} size="small" style={{ marginLeft: 4 }} /> : null}
        </span>
      )
    }
  ]

  return (
    <Modal
      className="spotlight-modal"
      title={null}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
      style={{ top: 80 }}
      styles={{ body: { padding: 0 } }}
      closeIcon={null}
    >
      {/* 搜索输入框 */}
      <div className="spotlight-input-wrapper">
        <SearchOutlined style={{ fontSize: 20, color: 'var(--app-text-secondary)' }} />
        <Input
          ref={inputRef}
          placeholder={t('globalSearch.placeholder')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {searchText && (
          <span className="spotlight-kbd">ESC</span>
        )}
      </div>

      {/* 结果区域 */}
      <div className="spotlight-results">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : searchText && filteredResults.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description={t('globalSearch.noResults')} />
          </div>
        ) : filteredResults.length > 0 ? (
          <>
            {/* 类型筛选 */}
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
              size="small"
              style={{ padding: '0 12px' }}
              tabBarStyle={{ marginBottom: 0 }}
            />

            <Divider style={{ margin: 0 }} />

            {/* 结果列表 */}
            <div ref={listRef}>
              {filteredResults.map((item, index) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className={`spotlight-result-item ${index === selectedIndex ? 'selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => handleSelectResult(item)}
                >
                  <div
                    className="spotlight-result-icon"
                    style={{
                      background: (() => {
                        const colors: Record<string, string> = {
                          server: 'rgba(0, 122, 255, 0.1)',
                          app: 'rgba(52, 199, 89, 0.1)',
                          template: 'rgba(90, 200, 250, 0.1)',
                          container: 'rgba(88, 86, 214, 0.1)',
                          image: 'rgba(175, 82, 222, 0.1)',
                          volume: 'rgba(255, 149, 0, 0.1)',
                          network: 'rgba(255, 45, 85, 0.1)',
                          deployHistory: 'rgba(142, 142, 147, 0.1)'
                        }
                        return colors[item.type] || 'rgba(0, 122, 255, 0.1)'
                      })()
                    }}
                  >
                    <span style={{
                      color: (() => {
                        const colors: Record<string, string> = {
                          server: '#007AFF',
                          app: '#34C759',
                          template: '#5AC8FA',
                          container: '#5856D6',
                          image: '#AF52DE',
                          volume: '#FF9500',
                          network: '#FF2D55',
                          deployHistory: '#8e8e93'
                        }
                        return colors[item.type] || '#007AFF'
                      })()
                    }}>
                      {item.icon}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="spotlight-result-title">
                      {item.title}
                      <Tag color={item.color} style={{ marginLeft: 6, borderRadius: 6 }}>
                        {getTypeLabel(item.type)}
                      </Tag>
                    </div>
                    {item.subtitle && (
                      <div className="spotlight-result-subtitle">{item.subtitle}</div>
                    )}
                  </div>
                  {index === selectedIndex && (
                    <ArrowRightOutlined style={{ color: '#007AFF', fontSize: 12 }} />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding: '16px' }}>
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>{t('globalSearch.quickTips')}:</Text>
                <Text type="secondary">
                  <Space>
                    <Tag style={{ borderRadius: 6 }}>{t('globalSearch.tip1')}</Tag>
                    <Tag style={{ borderRadius: 6 }}>{t('globalSearch.tip2')}</Tag>
                    <Tag style={{ borderRadius: 6 }}>{t('globalSearch.tip3')}</Tag>
                  </Space>
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <Space size="small">
                  <span className="spotlight-kbd">↑</span>
                  <span className="spotlight-kbd">↓</span>
                  <span className="spotlight-kbd"><EnterOutlined /></span>
                  <span className="spotlight-kbd">ESC</span>
                </Space>
              </Space>
            </Card>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      {filteredResults.length > 0 && (
        <div className="spotlight-footer">
          <Text type="secondary" style={{ fontSize: 11 }}>
            {t('globalSearch.totalResults').replace('{{count}}', filteredResults.length.toString())}
          </Text>
          <Space size="small">
            <span className="spotlight-kbd">↑</span>
            <span className="spotlight-kbd">↓</span>
            <span className="spotlight-kbd"><EnterOutlined /></span>
            <span className="spotlight-kbd">ESC</span>
          </Space>
        </div>
      )}
    </Modal>
  )
}

export default GlobalSearch

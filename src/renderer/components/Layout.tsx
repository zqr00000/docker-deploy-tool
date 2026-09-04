import React, { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { Menu, Typography, Grid, Button, Drawer, Input, Space, Tag, Tabs, Modal, List, Empty, Alert } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { releaseCache } from './KeepAliveRoutes'
import {
  CloudServerOutlined,
  ContainerOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  SettingOutlined,
  HddOutlined,
  DatabaseOutlined,
  AuditOutlined,
  TeamOutlined,
  RocketOutlined,
  HistoryOutlined,
  BellOutlined,
  ApiOutlined,
  ScheduleOutlined,
  HeartOutlined,
  BuildOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  SearchOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  CodeOutlined,
  RobotOutlined,
  CloudUploadOutlined,
  SwapOutlined,
  GiftOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import LanguageSwitcher from './LanguageSwitcher'
import Logo from './Logo'
import GlobalSearch from './GlobalSearch'
import OnboardingGuide from './OnboardingGuide'

const { Title } = Typography
const { useBreakpoint } = Grid

interface LayoutProps {
  children: React.ReactNode
}

// 菜单项配置 - 提取到组件外部避免每次渲染创建新对象
// 支持 children 形成父子级菜单（子目录）
interface MenuItemConfig {
  key: string
  iconKey?: string
  labelKey: string
  children?: MenuItemConfig[]
}

const MENU_ITEM_CONFIG: MenuItemConfig[] = [
  { key: 'dashboard', iconKey: 'DashboardOutlined', labelKey: 'menu.dashboard' },
  {
    key: 'group-server',
    iconKey: 'CloudServerOutlined',
    labelKey: 'menuGroups.server',
    children: [
      { key: 'servers', iconKey: 'CloudServerOutlined', labelKey: 'menu.servers' }
    ]
  },
  {
    key: 'group-deploy',
    iconKey: 'AppstoreOutlined',
    labelKey: 'menuGroups.deploy',
    children: [
      { key: 'templates', iconKey: 'FileTextOutlined', labelKey: 'menu.templates' },
      { key: 'apps', iconKey: 'AppstoreOutlined', labelKey: 'menu.apps' },
      { key: 'batch-operations', iconKey: 'AppstoreOutlined', labelKey: 'menu.batchOperations' },
      { key: 'deploy-history', iconKey: 'HistoryOutlined', labelKey: 'menu.deployHistory' },
      { key: 'cicd', iconKey: 'CloudUploadOutlined', labelKey: 'menu.cicd' },
      { key: 'compose-editor', iconKey: 'BuildOutlined', labelKey: 'menu.composeEditor' }
    ]
  },
  {
    key: 'group-container',
    iconKey: 'HddOutlined',
    labelKey: 'menuGroups.container',
    children: [
      { key: 'containers', iconKey: 'ContainerOutlined', labelKey: 'menu.containers' },
      { key: 'images', iconKey: 'HddOutlined', labelKey: 'menu.images' },
      { key: 'volumes', iconKey: 'DatabaseOutlined', labelKey: 'menu.volumes' },
      { key: 'networks', iconKey: 'ApiOutlined', labelKey: 'menu.networks' },
      { key: 'container-performance', iconKey: 'DashboardOutlined', labelKey: 'menu.containerPerformance' }
    ]
  },
  {
    key: 'group-ops',
    iconKey: 'CodeOutlined',
    labelKey: 'menuGroups.ops',
    children: [
      { key: 'shell-scripts', iconKey: 'CodeOutlined', labelKey: 'menu.shellScripts' },
      { key: 'file-transfer', iconKey: 'SwapOutlined', labelKey: 'menu.fileTransfer' },
      { key: 'scheduled-tasks', iconKey: 'ScheduleOutlined', labelKey: 'menu.scheduledTasks' },
      { key: 'health-check', iconKey: 'HeartOutlined', labelKey: 'menu.healthCheck' },
      { key: 'security-scan', iconKey: 'SafetyCertificateOutlined', labelKey: 'menu.securityScan' },
      { key: 'backup-restore', iconKey: 'DatabaseOutlined', labelKey: 'menu.backupRestore' },
      { key: 'agent-terminal', iconKey: 'RobotOutlined', labelKey: 'menu.agentTerminal' }
    ]
  },
  {
    key: 'group-monitor',
    iconKey: 'BellOutlined',
    labelKey: 'menuGroups.monitor',
    children: [
      { key: 'alerts', iconKey: 'BellOutlined', labelKey: 'menu.alerts' },
      { key: 'resource-reports', iconKey: 'LineChartOutlined', labelKey: 'menu.resourceReports' }
    ]
  },
  {
    key: 'group-system',
    iconKey: 'SettingOutlined',
    labelKey: 'menuGroups.system',
    children: [
      { key: 'audit-logs', iconKey: 'AuditOutlined', labelKey: 'menu.auditLogs' },
      { key: 'ai-model-config', iconKey: 'RobotOutlined', labelKey: 'menu.aiModelConfig' },
      { key: 'settings', iconKey: 'SettingOutlined', labelKey: 'menu.settings' }
    ]
  }
]

// 图标映射 - 静态对象，避免重复创建
const ICON_MAP: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  CloudServerOutlined: <CloudServerOutlined />,
  ContainerOutlined: <ContainerOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  HddOutlined: <HddOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  ApiOutlined: <ApiOutlined />,
  BuildOutlined: <BuildOutlined />,
  CodeOutlined: <CodeOutlined />,
  HistoryOutlined: <HistoryOutlined />,
  AuditOutlined: <AuditOutlined />,
  BellOutlined: <BellOutlined />,
  HeartOutlined: <HeartOutlined />,
  ScheduleOutlined: <ScheduleOutlined />,
  LineChartOutlined: <LineChartOutlined />,
  SettingOutlined: <SettingOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  RobotOutlined: <RobotOutlined />,
  CloudUploadOutlined: <CloudUploadOutlined />,
  SwapOutlined: <SwapOutlined />
}

const LayoutComponent: React.FC<LayoutProps> = memo(({ children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const screens = useBreakpoint()

  const [selectedKey, setSelectedKey] = useState('servers')
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)
  const [promoVisible, setPromoVisible] = useState(false)
  const [promos, setPromos] = useState<{ name: string; url: string; title: string; items: string[] }[] | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState(false)
  const [openKeys, setOpenKeys] = useState<string[]>([])

  // 打开福利弹窗时调用主进程抓取各厂商官网福利
  const loadPromos = useCallback(async () => {
    setPromoLoading(true)
    setPromoError(false)
    try {
      const res = await window.electronAPI.promo.fetch()
      if (res.success && res.data) {
        setPromos(res.data)
      } else {
        setPromos([])
        setPromoError(true)
      }
    } catch {
      setPromos([])
      setPromoError(true)
    } finally {
      setPromoLoading(false)
    }
  }, [])

  // ===== 标签页工作区：openTabs 记录已打开的页面标签（同一菜单只保留一个）=====
  interface OpenTab { key: string; label: string }
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])

  // 在菜单配置中递归查找叶子菜单项（不含分组）
  const findMenuByKey = useCallback((key: string): MenuItemConfig | undefined => {
    const find = (items: MenuItemConfig[]): MenuItemConfig | undefined => {
      for (const item of items) {
        if (item.key === key && !item.children) return item
        if (item.children) {
          const nested = find(item.children)
          if (nested) return nested
        }
      }
      return undefined
    }
    return find(MENU_ITEM_CONFIG)
  }, [])

  // 当前激活标签：由路由路径派生（路径对应某个已打开菜单标签时高亮）
  const currentPath = location.pathname.slice(1)
  const activeTabKey = openTabs.some(t => t.key === currentPath) ? currentPath : undefined

  // 路由变化时自动打开/高亮对应菜单标签（同一菜单不重复打开）
  useEffect(() => {
    const path = location.pathname.replace('/', '')
    if (!path) return
    const cfg = findMenuByKey(path)
    if (!cfg) return
    setOpenTabs(prev => prev.some(t => t.key === path)
      ? prev
      : [...prev, { key: path, label: t(cfg.labelKey) }])
  }, [location.pathname, findMenuByKey, t])

  // 关闭标签：若关闭的是当前激活标签，跳转到相邻标签；全部关闭则回仪表盘
  // 同时释放 KeepAliveRoutes 中对应页面的缓存，避免关闭后仍驻留内存
  const closeTab = useCallback((key: string) => {
    const idx = openTabs.findIndex(x => x.key === key)
    if (idx === -1) return
    const next = openTabs.filter(x => x.key !== key)
    setOpenTabs(next)
    releaseCache(`/${key}`)
    if (location.pathname === `/${key}`) {
      if (next.length === 0) {
        navigate('/dashboard')
      } else {
        navigate(`/${next[Math.max(0, idx - 1)].key}`)
      }
    }
  }, [openTabs, navigate, location.pathname])

  // 根据路径找到其所属的父级菜单 key（用于自动展开）
  const getParentKeyForPath = useCallback((path: string): string | undefined => {
    const find = (items: MenuItemConfig[]): string | undefined => {
      for (const item of items) {
        if (item.children) {
          if (item.children.some(c => c.key === path)) return item.key
          const nested = find(item.children)
          if (nested) return nested
        }
      }
      return undefined
    }
    return find(MENU_ITEM_CONFIG)
  }, [])

  // 响应式断点计算
  const isXs = !!screens.xs
  const isSm = !!screens.sm
  const isMd = !!screens.md
  const isLg = !!screens.lg
  const isXl = !!screens.xl
  const isMobile = isXs || (!isMd && isSm)

  // 首次访问时显示引导
  useEffect(() => {
    const onboardingCompleted = localStorage.getItem('onboardingCompleted')
    if (!onboardingCompleted) {
      const timer = setTimeout(() => {
        setOnboardingVisible(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  // 全局搜索快捷键 Ctrl/Cmd + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchVisible(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const path = location.pathname.replace('/', '')
    if (path) {
      setSelectedKey(path)
      // 自动展开当前页面所属的父级菜单
      const parent = getParentKeyForPath(path)
      if (parent) {
        setOpenKeys(prev => (prev.includes(parent) ? prev : [...prev, parent]))
      }
    }
  }, [location.pathname, getParentKeyForPath])

  // 使用 useMemo 缓存菜单项，避免每次渲染重新创建（递归构建父子层级）
  const menuItems = useMemo(() => {
    const buildItems = (items: MenuItemConfig[]): MenuProps['items'] => {
      return items.map(item => ({
        key: item.key,
        icon: item.iconKey ? ICON_MAP[item.iconKey] : undefined,
        label: t(item.labelKey),
        children: item.children ? buildItems(item.children) : undefined
      }))
    }
    return buildItems(MENU_ITEM_CONFIG)
  }, [t])

  // 使用 useCallback 缓存事件处理函数
  const handleMenuClick = useCallback(({ key }: { key: string }) => {
    setSelectedKey(key)
    navigate(`/${key}`)
    // 顶部导航：点击跳转后收起下拉面板
    setTopnavOpenKeys([])
    if (isMobile) {
      setMobileDrawerOpen(false)
    }
  }, [navigate, isMobile])

  // 顶部水平导航：受控 openKeys，强制同时只展开一个分组下拉
  // （规避 rc-menu hover 切换时旧面板偶发不关闭的竞态问题）
  const [topnavOpenKeys, setTopnavOpenKeys] = useState<string[]>([])
  const handleTopnavOpenChange = useCallback((keys: string[]) => {
    setTopnavOpenKeys(keys.slice(-1))
  }, [])

  const handleToggleMobileNav = useCallback(() => {
    setMobileDrawerOpen(prev => !prev)
  }, [])

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  // 缓存 header 样式对象 — Apple frosted glass
  const headerStyle = useMemo(() => ({
    background: isDark ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    borderBottom: `1px solid ${isDark ? '#38383a' : '#e5e5ea'}`,
    padding: isXs ? '0 12px' : isSm ? '0 16px' : '0 24px'
  }), [isDark, isXs, isSm])

  // 响应式内容区域样式
  const contentStyle = useMemo(() => ({
    padding: isXs ? 12 : isSm ? 16 : 24
  }), [isXs, isSm])

  // 标签页栏：打开多个菜单页面后切换；同一菜单只保留一个标签
  const tabBar = openTabs.length > 0 ? (
    <Tabs
      type="editable-card"
      hideAdd
      size="small"
      activeKey={activeTabKey}
      onChange={k => navigate(`/${k}`)}
      onEdit={(targetKey, action) => { if (action === 'remove') closeTab(targetKey as string) }}
      items={openTabs.map(tab => ({ key: tab.key, label: tab.label, closable: true }))}
      tabBarStyle={{
        margin: 0,
        padding: '6px 10px 0',
        background: isDark ? 'rgba(28,28,30,0.85)' : 'rgba(249,249,251,0.9)',
        borderBottom: `1px solid ${isDark ? '#38383a' : '#e5e5ea'}`
      }}
      className="app-tabbar"
    />
  ) : null

  // 移动端使用 Drawer
  if (isMobile) {
    return (
      <div className="app-layout">
        {/* Header */}
        <header className="app-header" style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isXs ? 8 : 12 }}>
            <Button
              type="text"
              icon={mobileDrawerOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={handleToggleMobileNav}
              style={{ fontSize: 16 }}
            />
            <Logo size={isXs ? 24 : 28} />
            {isSm && (
              <Title level={5} style={{ margin: 0, color: '#007AFF', fontWeight: 700 }}>
                {t('app.title')}
              </Title>
            )}
          </div>
          <Space size={isXs ? 4 : 8}>
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => setSearchVisible(true)}
            />
            <LanguageSwitcher />
          </Space>
        </header>

        {/* Mobile Drawer */}
        <Drawer
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Logo size={24} />
              <span>{t('app.title')}</span>
            </div>
          }
          placement="left"
          onClose={() => setMobileDrawerOpen(false)}
          open={mobileDrawerOpen}
          bodyStyle={{ padding: 0 }}
          width={isXs ? '100%' : 240}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ borderRight: 0, height: '100%' }}
          />
        </Drawer>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {tabBar}
          <div className={`app-content-wrapper ${location.pathname === '/agent-terminal' ? 'no-scroll' : ''}`}>
            <main className="app-content" style={{ ...contentStyle, ...(location.pathname === '/agent-terminal' ? { padding: 0, height: '100%', overflow: 'hidden' } : {}) }}>
              {children}
            </main>
          </div>
        </div>

        {/* Global Search Modal */}
        <GlobalSearch visible={searchVisible} onClose={() => setSearchVisible(false)} />
        <OnboardingGuide visible={onboardingVisible} onClose={() => setOnboardingVisible(false)} />
      </div>
    )
  }

  // 桌面端/平板布局：固定顶部水平导航（分组悬停展开下拉）
  return (
    <div className="app-layout">
      {/* 顶部导航栏 — 固定于页面顶部，内容区滚动时保持可见 */}
      <header className="app-header app-header-topnav" style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Logo size={isMd ? 26 : 30} />
        </div>

        {/* 顶部水平导航菜单：支持键盘导航与 aria 标注 */}
        <nav className="app-topnav" aria-label={t('menu.mainNav')}>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            openKeys={topnavOpenKeys}
            onOpenChange={handleTopnavOpenChange}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ flex: 1, minWidth: 0, justifyContent: 'center', background: 'transparent', borderBottom: 'none' }}
          />
        </nav>

        <Space size={isMd ? 4 : 8} style={{ flexShrink: 0 }}>
          {/* 平板显示搜索按钮，桌面显示搜索框 */}
          {isMd ? (
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => setSearchVisible(true)}
              aria-label={t('globalSearch.triggerPlaceholder')}
            />
          ) : (
            <Input
              prefix={<SearchOutlined style={{ color: '#8e8e93' }} />}
              placeholder={t('globalSearch.triggerPlaceholder')}
              readOnly
              onClick={() => setSearchVisible(true)}
              style={{ width: isLg ? 220 : 180, cursor: 'pointer' }}
              suffix={<Tag style={{ marginRight: 0 }}>⌘K</Tag>}
            />
          )}
          <Button
            type="text"
            icon={<QuestionCircleOutlined />}
            onClick={() => setOnboardingVisible(true)}
            title={t('onboarding.helpButton')}
            aria-label={t('onboarding.helpButton')}
          />
          <Button
            type="text"
            icon={<GiftOutlined style={{ color: '#FF9500' }} />}
            onClick={() => { setPromoVisible(true); loadPromos() }}
            title={t('promo.title')}
            aria-label={t('promo.title')}
          />
          <LanguageSwitcher />
        </Space>
      </header>

      {/* 内容区域 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tabBar}
        <div className={`app-content-wrapper ${location.pathname === '/agent-terminal' ? 'no-scroll' : ''}`}>
          <main className="app-content" style={{ ...contentStyle, ...(location.pathname === '/agent-terminal' ? { padding: 0, height: '100%', overflow: 'hidden' } : {}) }}>
            {children}
          </main>
        </div>
      </div>

      {/* Global Search Modal */}
      <GlobalSearch visible={searchVisible} onClose={() => setSearchVisible(false)} />

      {/* Onboarding Guide Modal */}
      <OnboardingGuide visible={onboardingVisible} onClose={() => setOnboardingVisible(false)} />

      {/* AI 厂商福利活动 Modal */}
      <Modal
        open={promoVisible}
        onCancel={() => setPromoVisible(false)}
        footer={null}
        title={
          <Space size={8}>
            <GiftOutlined style={{ color: '#FF9500' }} />
            {t('promo.title')}
          </Space>
        }
        width={520}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {t('promo.subtitle')}
        </Typography.Paragraph>
        {promoError && (
          <Alert type="warning" showIcon message={t('promo.fetchError')} style={{ marginBottom: 12 }} />
        )}
        <List
          loading={promoLoading}
          dataSource={promos || []}
          locale={{ emptyText: <Empty description={t('promo.empty')} /> }}
          renderItem={(item) => (
            <List.Item key={item.url || item.name} style={{ padding: '12px 0' }}>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Space>
                  <Tag color="orange" style={{ marginRight: 0, flexShrink: 0 }}>{item.name}</Tag>
                  {item.url && (
                    <Typography.Link href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      {item.title || item.url}
                    </Typography.Link>
                  )}
                </Space>
                {item.items.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--app-text-color)' }}>
                    {item.items.map((s, i) => (
                      <li key={i} style={{ lineHeight: 1.7, fontSize: 12 }}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('promo.unavailable')}
                  </Typography.Text>
                )}
              </Space>
            </List.Item>
          )}
        />
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
          {t('promo.footer')}
        </Typography.Text>
      </Modal>
    </div>
  )
})

LayoutComponent.displayName = 'LayoutComponent'

export default LayoutComponent

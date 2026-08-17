import React, { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { Menu, Typography, theme, Grid, Button, Drawer, Input, Space, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  CloudServerOutlined,
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
  CloudUploadOutlined
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
      { key: 'settings', iconKey: 'SettingOutlined', labelKey: 'menu.settings' }
    ]
  }
]

// 图标映射 - 静态对象，避免重复创建
const ICON_MAP: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  CloudServerOutlined: <CloudServerOutlined />,
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
  CloudUploadOutlined: <CloudUploadOutlined />
}

const LayoutComponent: React.FC<LayoutProps> = memo(({ children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, colorPrimary }
  } = theme.useToken()
  const screens = useBreakpoint()

  const [selectedKey, setSelectedKey] = useState('servers')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)
  const [openKeys, setOpenKeys] = useState<string[]>([])

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
  const isTablet = isMd && !isLg
  const isDesktop = isLg || isXl

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

  // 根据屏幕尺寸自动折叠侧边栏
  useEffect(() => {
    if (isXs) {
      setCollapsed(true)
    } else if (isSm && !isMd) {
      setCollapsed(true)
    } else if (isMd && !isLg) {
      setCollapsed(true)
    } else {
      setCollapsed(false)
    }
  }, [isXs, isSm, isMd, isLg])

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
    if (isMobile) {
      setMobileDrawerOpen(false)
    }
  }, [navigate, isMobile])

  const handleToggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileDrawerOpen(prev => !prev)
    } else {
      setCollapsed(prev => !prev)
    }
  }, [isMobile])

  // 响应式侧边栏宽度
  const sidebarWidth = collapsed ? (isMobile ? 0 : 60) : (isMobile ? 240 : 220)

  // 缓存 header 样式对象
  const headerStyle = useMemo(() => ({
    background: colorBgContainer,
    borderBottom: `1px solid ${colorPrimary}20`,
    padding: isXs ? '0 12px' : isSm ? '0 16px' : '0 24px'
  }), [colorBgContainer, colorPrimary, isXs, isSm])

  const sidebarStyle = useMemo(() => ({
    width: sidebarWidth,
    background: colorBgContainer,
    borderRight: `1px solid ${colorPrimary}20`,
    flex: `0 0 ${sidebarWidth}px`,
    transition: 'flex 0.2s ease, width 0.2s ease'
  }), [sidebarWidth, colorBgContainer, colorPrimary])

  // 响应式内容区域样式
  const contentStyle = useMemo(() => ({
    background: colorBgContainer,
    borderRadius: 0,
    padding: isXs ? 12 : isSm ? 16 : 24
  }), [colorBgContainer, isXs, isSm])

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
              onClick={handleToggleSidebar}
              style={{ fontSize: 16 }}
            />
            <Logo size={isXs ? 24 : 28} />
            {isSm && (
              <Title level={5} style={{ margin: 0, color: colorPrimary }}>
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
        <div className={`app-content-wrapper ${location.pathname === '/agent-terminal' ? 'no-scroll' : ''}`}>
          <main className="app-content" style={{ ...contentStyle, ...(location.pathname === '/agent-terminal' ? { padding: 0, height: '100%', overflow: 'hidden' } : {}) }}>
            {children}
          </main>
        </div>

        {/* Global Search Modal */}
        <GlobalSearch visible={searchVisible} onClose={() => setSearchVisible(false)} />
        <OnboardingGuide visible={onboardingVisible} onClose={() => setOnboardingVisible(false)} />
      </div>
    )
  }

  // 桌面端布局（含平板）
  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header" style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={handleToggleSidebar}
            style={{ fontSize: 16, marginRight: isMd ? 4 : 8 }}
          />
          <Logo size={isMd ? 28 : 32} />
          {!collapsed && (
            <Title level={isMd ? 5 : 4} style={{ margin: 0, color: colorPrimary }}>
              {t('app.title')}
            </Title>
          )}
        </div>
        <Space size={isMd ? 8 : 12}>
          {/* 平板显示搜索按钮，桌面显示搜索框 */}
          {isMd ? (
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => setSearchVisible(true)}
            />
          ) : (
            <Input
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
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
          />
          <LanguageSwitcher />
        </Space>
      </header>

      {/* Body */}
      <div className="app-body">
        {/* Sidebar */}
        <aside className={`app-sider ${collapsed ? 'collapsed' : ''}`} style={sidebarStyle}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              height: '100%',
              borderRight: 0,
              paddingTop: 8
            }}
            inlineCollapsed={collapsed}
          />
        </aside>

        {/* Content */}
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
    </div>
  )
})

LayoutComponent.displayName = 'LayoutComponent'

export default LayoutComponent

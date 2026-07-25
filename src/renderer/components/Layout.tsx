import React, { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { Menu, Typography, theme, Grid, Button, Drawer } from 'antd'
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
  CodeOutlined,
  HistoryOutlined,
  BellOutlined,
  ApiOutlined,
  ScheduleOutlined,
  HeartOutlined,
  BuildOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons'
import LanguageSwitcher from './LanguageSwitcher'
import Logo from './Logo'

const { Title } = Typography
const { useBreakpoint } = Grid

interface LayoutProps {
  children: React.ReactNode
}

// 菜单项配置 - 提取到组件外部避免每次渲染创建新对象
const MENU_ITEM_CONFIG = [
  { key: 'servers', iconKey: 'CloudServerOutlined', labelKey: 'menu.servers' },
  { key: 'templates', iconKey: 'FileTextOutlined', labelKey: 'menu.templates' },
  { key: 'apps', iconKey: 'AppstoreOutlined', labelKey: 'menu.apps' },
  { key: 'images', iconKey: 'HddOutlined', labelKey: 'menu.images' },
  { key: 'volumes', iconKey: 'DatabaseOutlined', labelKey: 'menu.volumes' },
  { key: 'networks', iconKey: 'ApiOutlined', labelKey: 'menu.networks' },
  { key: 'compose-editor', iconKey: 'BuildOutlined', labelKey: 'menu.composeEditor' },
  { key: 'terminal', iconKey: 'CodeOutlined', labelKey: 'menu.terminal' },
  { key: 'deploy-history', iconKey: 'HistoryOutlined', labelKey: 'menu.deployHistory' },
  { key: 'audit-logs', iconKey: 'AuditOutlined', labelKey: 'menu.auditLogs' },
  { key: 'alerts', iconKey: 'BellOutlined', labelKey: 'menu.alerts' },
  { key: 'health-check', iconKey: 'HeartOutlined', labelKey: 'menu.healthCheck' },
  { key: 'scheduled-tasks', iconKey: 'ScheduleOutlined', labelKey: 'menu.scheduledTasks' },
  { key: 'resource-reports', iconKey: 'LineChartOutlined', labelKey: 'menu.resourceReports' },
  { key: 'settings', iconKey: 'SettingOutlined', labelKey: 'menu.settings' }
]

// 图标映射 - 静态对象，避免重复创建
const ICON_MAP: Record<string, React.ReactNode> = {
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
  SettingOutlined: <SettingOutlined />
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

  // 根据屏幕尺寸自动折叠侧边栏
  useEffect(() => {
    if (screens.xs) {
      setCollapsed(true)
    } else if (screens.sm && !screens.md) {
      setCollapsed(true)
    }
  }, [screens])

  useEffect(() => {
    const path = location.pathname.replace('/', '')
    if (path) {
      setSelectedKey(path)
    }
  }, [location.pathname])

  const isMobile = screens.xs || (!screens.md && screens.sm)

  // 使用 useMemo 缓存菜单项，避免每次渲染重新创建
  const menuItems = useMemo(() => {
    return MENU_ITEM_CONFIG.map(item => ({
      key: item.key,
      icon: ICON_MAP[item.iconKey],
      label: t(item.labelKey)
    }))
  }, [t])

  // 使用 useCallback 缓存事件处理函数
  const handleMenuClick = useCallback(({ key }: { key: string }) => {
    setSelectedKey(key)
    navigate(`/${key}`)
    if (screens.xs || (!screens.md && screens.sm)) {
      setMobileDrawerOpen(false)
    }
  }, [navigate, screens])

  const handleToggleSidebar = useCallback(() => {
    if (screens.xs || (!screens.md && screens.sm)) {
      setMobileDrawerOpen(prev => !prev)
    } else {
      setCollapsed(prev => !prev)
    }
  }, [screens])

  const sidebarWidth = collapsed ? 60 : 220

  // 缓存 header 样式对象
  const headerStyle = useMemo(() => ({
    background: colorBgContainer,
    borderBottom: `1px solid ${colorPrimary}20`
  }), [colorBgContainer, colorPrimary])

  const headerStyleDesktop = useMemo(() => ({
    ...headerStyle,
    padding: '0 24px'
  }), [headerStyle])

  const sidebarStyle = useMemo(() => ({
    width: sidebarWidth,
    background: colorBgContainer,
    borderRight: `1px solid ${colorPrimary}20`,
    flex: `0 0 ${sidebarWidth}px`,
    transition: 'flex 0.2s ease, width 0.2s ease'
  }), [sidebarWidth, colorBgContainer, colorPrimary])

  const contentStyle = useMemo(() => ({
    background: colorBgContainer,
    borderRadius: 0,
    padding: 24
  }), [colorBgContainer])

  const mobileContentStyle = useMemo(() => ({
    background: colorBgContainer,
    padding: 12
  }), [colorBgContainer])

  // 移动端使用 Drawer
  if (isMobile) {
    return (
      <div className="app-layout">
        {/* Header */}
        <header className="app-header" style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={mobileDrawerOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={handleToggleSidebar}
              style={{ fontSize: 16 }}
            />
            <Logo size={28} />
            <Title level={4} style={{ margin: 0, color: colorPrimary }}>
              {t('app.title')}
            </Title>
          </div>
          <LanguageSwitcher />
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
          width={240}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ borderRight: 0, height: '100%' }}
          />
        </Drawer>

        {/* Content */}
        <div className="app-content-wrapper">
          <main className="app-content" style={mobileContentStyle}>
            {children}
          </main>
        </div>
      </div>
    )
  }

  // 桌面端布局
  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header" style={headerStyleDesktop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={handleToggleSidebar}
            style={{ fontSize: 16, marginRight: 8 }}
          />
          <Logo size={32} />
          {!collapsed && (
            <Title level={4} style={{ margin: 0, color: colorPrimary }}>
              {t('app.title')}
            </Title>
          )}
        </div>
        <LanguageSwitcher />
      </header>

      {/* Body */}
      <div className="app-body">
        {/* Sidebar */}
        <aside className={`app-sider ${collapsed ? 'collapsed' : ''}`} style={sidebarStyle}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
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
        <div className="app-content-wrapper">
          <main className="app-content" style={contentStyle}>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
})

LayoutComponent.displayName = 'LayoutComponent'

export default LayoutComponent

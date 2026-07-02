import React, { useState, useEffect } from 'react'
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

const LayoutComponent: React.FC<LayoutProps> = ({ children }) => {
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

  const menuItems = [
    {
      key: 'servers',
      icon: <CloudServerOutlined />,
      label: t('menu.servers')
    },
    {
      key: 'templates',
      icon: <FileTextOutlined />,
      label: t('menu.templates')
    },
    {
      key: 'apps',
      icon: <AppstoreOutlined />,
      label: t('menu.apps')
    },
    {
      key: 'images',
      icon: <HddOutlined />,
      label: t('menu.images')
    },
    {
      key: 'volumes',
      icon: <DatabaseOutlined />,
      label: t('menu.volumes')
    },
    {
      key: 'networks',
      icon: <ApiOutlined />,
      label: t('menu.networks')
    },
    {
      key: 'compose-editor',
      icon: <BuildOutlined />,
      label: t('menu.composeEditor')
    },
    {
      key: 'terminal',
      icon: <CodeOutlined />,
      label: t('menu.terminal')
    },
    {
      key: 'deploy-history',
      icon: <HistoryOutlined />,
      label: t('menu.deployHistory')
    },
    {
      key: 'audit-logs',
      icon: <AuditOutlined />,
      label: t('menu.auditLogs')
    },
    {
      key: 'alerts',
      icon: <BellOutlined />,
      label: t('menu.alerts')
    },
    {
      key: 'health-check',
      icon: <HeartOutlined />,
      label: t('menu.healthCheck')
    },
    {
      key: 'scheduled-tasks',
      icon: <ScheduleOutlined />,
      label: t('menu.scheduledTasks')
    },
    {
      key: 'resource-reports',
      icon: <LineChartOutlined />,
      label: t('menu.resourceReports')
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('menu.settings')
    }
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedKey(key)
    navigate(`/${key}`)
    if (isMobile) {
      setMobileDrawerOpen(false)
    }
  }

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileDrawerOpen(!mobileDrawerOpen)
    } else {
      setCollapsed(!collapsed)
    }
  }

  const sidebarWidth = collapsed ? 60 : 220

  // 移动端使用 Drawer
  if (isMobile) {
    return (
      <div className="app-layout">
        {/* Header */}
        <header
          className="app-header"
          style={{
            background: colorBgContainer,
            borderBottom: `1px solid ${colorPrimary}20`
          }}
        >
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
          <main
            className="app-content"
            style={{
              background: colorBgContainer,
              padding: 12
            }}
          >
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
      <header
        className="app-header"
        style={{
          background: colorBgContainer,
          borderBottom: `1px solid ${colorPrimary}20`,
          padding: '0 24px'
        }}
      >
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
        <aside
          className={`app-sider ${collapsed ? 'collapsed' : ''}`}
          style={{
            width: sidebarWidth,
            background: colorBgContainer,
            borderRight: `1px solid ${colorPrimary}20`,
            flex: collapsed ? `0 0 ${sidebarWidth}px` : `0 0 ${sidebarWidth}px`,
            transition: 'flex 0.2s ease, width 0.2s ease'
          }}
        >
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
          <main
            className="app-content"
            style={{
              background: colorBgContainer,
              borderRadius: 0,
              padding: 24
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

export default LayoutComponent

import React, { useEffect, Suspense, lazy } from 'react'
import { HashRouter, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import type { RouteObject } from 'react-router-dom'
import LayoutComponent from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import KeepAliveRoutes from './components/KeepAliveRoutes'
import { ServerProvider } from './context/ServerContext'
import i18n from './i18n'

// 路由级别的懒加载 - 减少初始加载的 JavaScript 大小
const ServerList = lazy(() => import('./pages/server/ServerList'))
const ServerDetail = lazy(() => import('./pages/server/ServerDetail'))
const ServerGroups = lazy(() => import('./pages/server/ServerGroups'))
const Templates = lazy(() => import('./pages/deploy/Templates'))
const Apps = lazy(() => import('./pages/deploy/Apps'))
const AppDetail = lazy(() => import('./pages/deploy/AppDetail'))
const Deploy = lazy(() => import('./pages/deploy/Deploy'))
const BatchDeploy = lazy(() => import('./pages/deploy/BatchDeploy'))
const Images = lazy(() => import('./pages/docker/Images'))
const Containers = lazy(() => import('./pages/docker/Containers'))
const Volumes = lazy(() => import('./pages/docker/Volumes'))
const Networks = lazy(() => import('./pages/docker/Networks'))

const Settings = lazy(() => import('./pages/system/Settings'))
const ModelConfig = lazy(() => import('./pages/system/ModelConfig'))
const AuditLog = lazy(() => import('./pages/system/AuditLog'))
const Alerts = lazy(() => import('./pages/monitor/Alerts'))
const DeployHistory = lazy(() => import('./pages/deploy/DeployHistory'))
const ScheduledTasks = lazy(() => import('./pages/ops/ScheduledTasks'))
const HealthCheck = lazy(() => import('./pages/ops/HealthCheck'))
const ComposeEditor = lazy(() => import('./pages/deploy/ComposeEditor'))
const ResourceReports = lazy(() => import('./pages/monitor/ResourceReports'))
const Dashboard = lazy(() => import('./pages/overview/Dashboard'))
const BatchOperations = lazy(() => import('./pages/deploy/BatchOperations'))
const ContainerPerformance = lazy(() => import('./pages/docker/ContainerPerformance'))
const BackupRestore = lazy(() => import('./pages/ops/BackupRestore'))
const SecurityScan = lazy(() => import('./pages/ops/SecurityScan'))
const CicdIntegration = lazy(() => import('./pages/deploy/CicdIntegration'))
const AgentTerminal = lazy(() => import('./pages/agent/AgentTerminal'))
const ShellScripts = lazy(() => import('./pages/ops/ShellScripts'))
const FileTransfer = lazy(() => import('./pages/ops/FileTransfer'))

type ThemeMode = 'system' | 'dark' | 'light'

// 路由配置（供 KeepAliveRoutes 使用，保持页面状态缓存）
const APP_ROUTES: RouteObject[] = [
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/servers', element: <ServerList /> },
  { path: '/servers/:id', element: <ServerDetail /> },
  { path: '/server-groups', element: <ServerGroups /> },
  { path: '/templates', element: <Templates /> },
  { path: '/apps', element: <Apps /> },
  { path: '/apps/deploy', element: <Deploy /> },
  { path: '/batch-deploy', element: <BatchDeploy /> },
  { path: '/batch-operations', element: <BatchOperations /> },
  { path: '/container-performance', element: <ContainerPerformance /> },
  { path: '/backup-restore', element: <BackupRestore /> },
  { path: '/security-scan', element: <SecurityScan /> },
  { path: '/cicd', element: <CicdIntegration /> },
  { path: '/agent-terminal', element: <AgentTerminal /> },
  { path: '/apps/:id', element: <AppDetail /> },
  { path: '/containers', element: <Containers /> },
  { path: '/images', element: <Images /> },
  { path: '/volumes', element: <Volumes /> },
  { path: '/networks', element: <Networks /> },
  { path: '/deploy-history', element: <DeployHistory /> },
  { path: '/audit-logs', element: <AuditLog /> },
  { path: '/alerts', element: <Alerts /> },
  { path: '/scheduled-tasks', element: <ScheduledTasks /> },
  { path: '/health-check', element: <HealthCheck /> },
  { path: '/resource-reports', element: <ResourceReports /> },
  { path: '/compose-editor', element: <ComposeEditor /> },
  { path: '/shell-scripts', element: <ShellScripts /> },
  { path: '/file-transfer', element: <FileTransfer /> },
  { path: '/settings', element: <Settings /> },
  { path: '/ai-model-config', element: <ModelConfig /> }
]

// 懒加载 fallback 组件 - Apple 风格加载动画
const PageLoading: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    gap: '16px'
  }}>
    <Spin size="large" />
    <div style={{
      color: 'var(--app-text-secondary)',
      fontSize: '13px',
      fontWeight: 500
    }}>Loading…</div>
  </div>
)

const App: React.FC = () => {
  const { i18n: i18nInstance } = useTranslation()

  // 主题版本：Settings 切换主题时派发 app-theme-changed 事件，强制本组件重渲染
  // （否则 antd ConfigProvider 的 token 不会随 data-theme 变化更新）
  const [themeVersion, setThemeVersion] = React.useState(0)

  useEffect(() => {
    const handleThemeChanged = () => setThemeVersion(v => v + 1)
    window.addEventListener('app-theme-changed', handleThemeChanged)
    return () => window.removeEventListener('app-theme-changed', handleThemeChanged)
  }, [])

  useEffect(() => {
    const savedLanguage = localStorage.getItem('language')
    if (savedLanguage && savedLanguage !== i18nInstance.language) {
      i18nInstance.changeLanguage(savedLanguage)
    }
  }, [i18nInstance])

  useEffect(() => {
    const savedTheme = localStorage.getItem('themeMode') as ThemeMode || 'system'
    applyTheme(savedTheme)

    if (savedTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        applyTheme('system', e.matches)
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  const applyTheme = (mode: ThemeMode, systemDark?: boolean) => {
    const root = document.documentElement
    let isDark = false
    
    if (mode === 'system') {
      isDark = systemDark ?? window.matchMedia('(prefers-color-scheme: dark)').matches
    } else {
      isDark = mode === 'dark'
    }
    
    root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }

  const getAntdTheme = () => {
    const savedTheme = localStorage.getItem('themeMode') as ThemeMode || 'system'
    
    let isDark = false
    if (savedTheme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    } else {
      isDark = savedTheme === 'dark'
    }
    
    return {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: '#007AFF',
        colorSuccess: '#34C759',
        colorError: '#FF3B30',
        colorWarning: '#FF9500',
        colorInfo: '#007AFF',
        colorLink: '#007AFF',
        colorTextBase: isDark ? '#f5f5f7' : '#1d1d1f',
        colorBgBase: isDark ? '#000000' : '#ffffff',
        borderRadius: 10,
        borderRadiusLG: 12,
        borderRadiusSM: 8,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
        fontSize: 14,
        wireframe: false,
      },
      components: {
        Layout: {
          headerBg: isDark ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.72)',
          siderBg: isDark ? 'rgba(28,28,30,0.72)' : 'rgba(242,242,247,0.72)',
          bodyBg: isDark ? '#000000' : '#f2f2f7',
        },
        Menu: {
          itemSelectedBg: 'rgba(0, 122, 255, 0.1)',
          itemSelectedColor: '#007AFF',
          itemHoverBg: isDark ? 'rgba(44,44,46,0.8)' : '#f2f2f7',
          itemBorderRadius: 8,
          itemMarginInline: 8,
        },
        Card: {
          borderRadiusLG: 12,
          headerBg: 'transparent',
        },
        Button: {
          borderRadius: 8,
          borderRadiusLG: 10,
          primaryShadow: '0 2px 8px rgba(0, 122, 255, 0.18)',
        },
        Input: {
          borderRadius: 8,
          activeShadow: '0 0 0 3px rgba(0, 122, 255, 0.12)',
        },
        Table: {
          borderRadius: 12,
          headerBg: isDark ? '#2c2c2e' : '#f2f2f7',
        },
        Modal: {
          borderRadiusLG: 14,
        },
        Tag: {
          borderRadiusSM: 6,
        },
      },
    }
  }

  // themeVersion 变化时重算 antd 主题 token（依赖它保证切换生效）
  const antdTheme = React.useMemo(() => getAntdTheme(), [themeVersion])

  return (
    <ConfigProvider
      theme={antdTheme}
    >
      <AntApp>
        <ErrorBoundary>
          <ServerProvider>
            {/* Electron 生产环境经 loadFile 加载（file:// 协议），History API 路由不可靠，必须使用 Hash 路由 */}
            <HashRouter>
              <LayoutComponent>
                <Suspense fallback={<PageLoading />}>
                  <KeepAliveRoutes routes={APP_ROUTES} />
                </Suspense>
              </LayoutComponent>
            </HashRouter>
          </ServerProvider>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  )
}

export default App

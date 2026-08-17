import React, { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import LayoutComponent from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
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
const Volumes = lazy(() => import('./pages/docker/Volumes'))
const Networks = lazy(() => import('./pages/docker/Networks'))

const Settings = lazy(() => import('./pages/system/Settings'))
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

type ThemeMode = 'system' | 'dark' | 'light'

// 懒加载 fallback 组件 - 使用 useMemo 避免重复创建
const PageLoading: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
    <Spin size="large" />
  </div>
)

const App: React.FC = () => {
  const { i18n: i18nInstance } = useTranslation()

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

  const getAntdTheme = (): { algorithm?: typeof theme.defaultAlgorithm; token?: object } => {
    const savedTheme = localStorage.getItem('themeMode') as ThemeMode || 'system'
    
    if (savedTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      return {
        algorithm: prefersDark ? theme.defaultAlgorithm : theme.defaultAlgorithm
      }
    }
    
    if (savedTheme === 'dark') {
      return { algorithm: theme.defaultAlgorithm }
    }
    
    return {}
  }

  const antdTheme = getAntdTheme()

  return (
    <ConfigProvider
      theme={{
        ...antdTheme,
        token: {
          colorPrimary: '#1677ff'
        }
      }}
    >
      <AntApp>
        <ErrorBoundary>
          <ServerProvider>
            <BrowserRouter>
              <LayoutComponent>
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/servers" element={<ServerList />} />
                    <Route path="/servers/:id" element={<ServerDetail />} />
                    <Route path="/server-groups" element={<ServerGroups />} />
                    <Route path="/templates" element={<Templates />} />
                    <Route path="/apps" element={<Apps />} />
                    <Route path="/apps/deploy" element={<Deploy />} />
                    <Route path="/batch-deploy" element={<BatchDeploy />} />
                    <Route path="/batch-operations" element={<BatchOperations />} />
                    <Route path="/container-performance" element={<ContainerPerformance />} />
                    <Route path="/backup-restore" element={<BackupRestore />} />
                    <Route path="/security-scan" element={<SecurityScan />} />
                    <Route path="/cicd" element={<CicdIntegration />} />
                    <Route path="/agent-terminal" element={<AgentTerminal />} />
                    <Route path="/apps/:id" element={<AppDetail />} />
                    <Route path="/images" element={<Images />} />
                    <Route path="/volumes" element={<Volumes />} />
                    <Route path="/networks" element={<Networks />} />

                    <Route path="/deploy-history" element={<DeployHistory />} />
                    <Route path="/audit-logs" element={<AuditLog />} />
                    <Route path="/alerts" element={<Alerts />} />
                    <Route path="/scheduled-tasks" element={<ScheduledTasks />} />
                    <Route path="/health-check" element={<HealthCheck />} />
                    <Route path="/resource-reports" element={<ResourceReports />} />
                    <Route path="/compose-editor" element={<ComposeEditor />} />
                    <Route path="/shell-scripts" element={<ShellScripts />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Suspense>
              </LayoutComponent>
            </BrowserRouter>
          </ServerProvider>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  )
}

export default App

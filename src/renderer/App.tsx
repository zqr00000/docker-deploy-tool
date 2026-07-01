import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import { useTranslation } from 'react-i18next'
import LayoutComponent from './components/Layout'
import ServerList from './pages/ServerList'
import ServerDetail from './pages/ServerDetail'
import ServerGroups from './pages/ServerGroups'
import Templates from './pages/Templates'
import Apps from './pages/Apps'
import AppDetail from './pages/AppDetail'
import Deploy from './pages/Deploy'
import BatchDeploy from './pages/BatchDeploy'
import Images from './pages/Images'
import Volumes from './pages/Volumes'
import Networks from './pages/Networks'
import ContainerTerminal from './pages/ContainerTerminal'
import Settings from './pages/Settings'
import AuditLog from './pages/AuditLog'
import Alerts from './pages/Alerts'
import DeployHistory from './pages/DeployHistory'
import ScheduledTasks from './pages/ScheduledTasks'
import HealthCheck from './pages/HealthCheck'
import ComposeEditor from './pages/ComposeEditor'
import ResourceReports from './pages/ResourceReports'
import { ServerProvider } from './context/ServerContext'
import i18n from './i18n'

type ThemeMode = 'system' | 'dark' | 'light'

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
        <ServerProvider>
          <BrowserRouter>
            <LayoutComponent>
              <Routes>
                <Route path="/" element={<Navigate to="/servers" replace />} />
                <Route path="/servers" element={<ServerList />} />
                <Route path="/servers/:id" element={<ServerDetail />} />
                <Route path="/server-groups" element={<ServerGroups />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/apps" element={<Apps />} />
                <Route path="/apps/deploy" element={<Deploy />} />
                <Route path="/batch-deploy" element={<BatchDeploy />} />
                <Route path="/apps/:id" element={<AppDetail />} />
                <Route path="/images" element={<Images />} />
                <Route path="/volumes" element={<Volumes />} />
                <Route path="/networks" element={<Networks />} />
                <Route path="/terminal" element={<ContainerTerminal />} />
                <Route path="/deploy-history" element={<DeployHistory />} />
                <Route path="/audit-logs" element={<AuditLog />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/scheduled-tasks" element={<ScheduledTasks />} />
                <Route path="/health-check" element={<HealthCheck />} />
                <Route path="/resource-reports" element={<ResourceReports />} />
                <Route path="/compose-editor" element={<ComposeEditor />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </LayoutComponent>
          </BrowserRouter>
        </ServerProvider>
      </AntApp>
    </ConfigProvider>
  )
}

export default App

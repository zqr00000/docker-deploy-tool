import React from 'react'
import ReactDOM from 'react-dom/client'
// Monaco 本地化（必须在首次创建 Monaco 编辑器前配置，避免从 CDN 加载导致编辑器一直 loading）
import './components/monaco-setup'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App'
import './i18n'
import './styles.css'

type ThemeMode = 'system' | 'dark' | 'light'

const getAntdLocale = () => {
  const savedLanguage = localStorage.getItem('language')
  return savedLanguage === 'en-US' ? enUS : zhCN
}

const getAntdTheme = () => {
  const savedTheme = (localStorage.getItem('themeMode') as ThemeMode) || 'system'

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
    },
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={getAntdLocale()}
      theme={getAntdTheme()}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
)

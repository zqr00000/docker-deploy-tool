import React from 'react'
import ReactDOM from 'react-dom/client'
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
  
  if (savedTheme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return {
      algorithm: prefersDark ? theme.defaultAlgorithm : theme.defaultAlgorithm,
      token: { colorPrimary: '#1677ff' }
    }
  }
  
  if (savedTheme === 'dark') {
    return {
      algorithm: theme.defaultAlgorithm,
      token: { colorPrimary: '#1677ff' }
    }
  }
  
  return {
    token: { colorPrimary: '#1677ff' }
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

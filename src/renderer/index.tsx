import React from 'react'
import ReactDOM from 'react-dom/client'
// 注意：Monaco 本地化配置已迁移到使用编辑器的路由模块内按需加载（ShellScripts/FileTransfer/DeployHistory），
// 避免全量 Monaco（3MB+）被打进首屏 chunk
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App'
import './i18n'
import './styles.css'

type ThemeMode = 'system' | 'dark' | 'light'

// 全局异常捕获：渲染层错误/未处理的 Promise 拒绝转发到主进程 electron-log 落盘，
// 避免仅 console 输出、应用重启后无据可查（ErrorBoundary 只兜组件树内错误）
const forwardError = (kind: string, detail: string) => {
  try {
    window.electronAPI?.logMessage('error', `[${kind}] ${detail}`).catch(() => { /* 转发失败忽略 */ })
  } catch { /* electronAPI 不可用时忽略 */ }
}
window.addEventListener('error', (e) => {
  forwardError('window.onerror', e.message || String(e.error))
})
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? (e.reason.stack || e.reason.message) : String(e.reason)
  forwardError('unhandledrejection', reason)
})

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

import React, { useState, useEffect } from 'react'
import { Card, Button, message, Typography, Space, Modal, Row, Col, Segmented, Progress, Tag, Divider } from 'antd'
import {
  ExportOutlined,
  ImportOutlined,
  SettingOutlined,
  BgColorsOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  CheckOutlined,
  SyncOutlined,
  RocketOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import type { UpdateReleaseInfo, UpdateProgressInfo, UpdaterStatus, UpdaterEvent } from '../../types/electron-api'

const { Title, Text, Paragraph } = Typography

type ThemeMode = 'system' | 'dark' | 'light'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// 主题预览组件
const ThemePreview: React.FC<{ mode: ThemeMode }> = ({ mode }) => {
  const isDark = mode === 'dark'
  const isSystem = mode === 'system'

  const sidebarBg = isDark || isSystem ? '#1c1c1e' : '#f2f2f7'
  const contentBg = isDark ? '#000000' : '#ffffff'
  const barColor = isDark ? '#3a3a3c' : '#d1d1d6'

  return (
    <div className="theme-picker-preview" style={{ background: isSystem ? 'linear-gradient(135deg, #ffffff 50%, #1c1c1e 50%)' : contentBg }}>
      <div className="preview-sidebar" style={{ background: isSystem ? 'linear-gradient(180deg, #f2f2f7 50%, #1c1c1e 50%)' : sidebarBg }} />
      <div className="preview-content">
        <div className="preview-bar" style={{ width: '60%', background: barColor }} />
        <div className="preview-bar" style={{ width: '40%', background: barColor, opacity: 0.5 }} />
        <div className="preview-bar" style={{ width: '50%', background: '#007AFF', height: 8 }} />
      </div>
    </div>
  )
}

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('system')
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateReleaseInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgressInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus>('idle')

  useEffect(() => {
    setCurrentTheme((localStorage.getItem('themeMode') as ThemeMode) || 'system')
  }, [])

  // ==================== 自动更新 ====================
  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion)
    window.electronAPI.updater.getStatus().then(setUpdateStatus)

    const unsubscribe = window.electronAPI.updater.onEvent((event: UpdaterEvent) => {
      logUpdaterEvent(event)
      switch (event.type) {
        case 'checking':
          setUpdateStatus('checking')
          break
        case 'available':
          setUpdateInfo(event.info)
          setUpdateStatus('idle')
          break
        case 'not-available':
          setUpdateStatus('idle')
          break
        case 'progress':
          setProgress(event.progress)
          setUpdateStatus('downloading')
          break
        case 'downloaded':
          setProgress(null)
          setUpdateStatus('downloaded')
          message.success(t('settings.updater.downloadedReady'))
          break
        case 'error':
          setUpdateStatus('error')
          message.error(`${t('settings.updater.checkFailed')}: ${event.message}`)
          break
      }
    })
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 更新过程日志（主进程 electron-log 已持久化，此处仅控制台跟踪）
  const logUpdaterEvent = (event: UpdaterEvent): void => {
    switch (event.type) {
      case 'progress':
        console.log(`[updater] ${event.progress.percent.toFixed(1)}% (${formatBytes(event.progress.transferred)}/${formatBytes(event.progress.total)})`)
        break
      case 'available':
        console.log(`[updater] available: v${event.info.version}`)
        break
      case 'error':
        console.error(`[updater] error: ${event.message}`)
        break
      default:
        console.log(`[updater] ${event.type}`)
    }
  }

  const handleCheckUpdate = async () => {
    try {
      setChecking(true)
      console.log('[updater] manual check started')
      const result = await window.electronAPI.updater.check()
      console.log(`[updater] check result: hasUpdate=${result.hasUpdate}, version=${result.version}, message=${result.message || '-'}`)
      if (result.hasUpdate) {
        setUpdateInfo({
          version: result.version || '',
          releaseNotes: result.releaseNotes,
          releaseDate: result.releaseDate
        })
        message.success(t('settings.updater.newVersionFound', { version: result.version }))
      } else if (result.message) {
        message.warning(result.message)
      } else {
        message.info(t('settings.updater.latestVersion'))
      }
    } catch (error) {
      console.error('[updater] check failed:', error)
      message.error(`${t('settings.updater.checkFailed')}: ${(error as Error).message}`)
    } finally {
      setChecking(false)
    }
  }

  const handleDownloadUpdate = async () => {
    setUpdateStatus('downloading')
    setProgress({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
    console.log('[updater] download started')
    const result = await window.electronAPI.updater.download()
    if (!result.success) {
      setUpdateStatus('error')
      console.error(`[updater] download failed: ${result.message}`)
      message.error(result.message)
    }
  }

  const handleInstallUpdate = () => {
    Modal.confirm({
      title: t('settings.updater.restartConfirmTitle'),
      content: t('settings.updater.restartConfirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => window.electronAPI.updater.install()
    })
  }

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else {
      root.setAttribute('data-theme', mode)
    }
  }

  const handleThemeChange = (mode: ThemeMode) => {
    localStorage.setItem('themeMode', mode)
    setCurrentTheme(mode)
    applyTheme(mode)
    // 通知 App 重算 antd 主题 token（否则卡片/表格/菜单等不会随主题变化）
    window.dispatchEvent(new Event('app-theme-changed'))
    message.success(t('settings.saveSuccess'))
  }

  const getSavedLanguage = (): string => {
    return localStorage.getItem('language') || 'zh-CN'
  }

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value)
    localStorage.setItem('language', value)
    message.success(t('settings.saveSuccess'))
  }

  const handleExport = async () => {
    try {
      setExportLoading(true)
      const dialogResult = await window.electronAPI.config.showSaveDialog()

      if (dialogResult.canceled || !dialogResult.filePath) {
        setExportLoading(false)
        return
      }

      const result = await window.electronAPI.config.exportConfig(dialogResult.filePath)

      if (result.success) {
        message.success(t('settings.configExportSuccess'))
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error(`${t('settings.configExportFailed')}: ${(error as Error).message}`)
    } finally {
      setExportLoading(false)
    }
  }

  const handleImport = async () => {
    try {
      setImportLoading(true)
      const dialogResult = await window.electronAPI.config.showOpenDialog()

      if (dialogResult.canceled || !dialogResult.filePath) {
        setImportLoading(false)
        return
      }

      const result = await window.electronAPI.config.importConfig(dialogResult.filePath)

      if (result.success) {
        Modal.success({
          title: t('settings.configImportSuccess'),
          content: (
            <div>
              <p>{result.message}</p>
            </div>
          )
        })
      } else {
        Modal.error({
          title: t('settings.configImportFailed'),
          content: result.message
        })
      }
    } catch (error) {
      Modal.error({
        title: t('settings.configImportFailed'),
        content: (error as Error).message
      })
    } finally {
      setImportLoading(false)
    }
  }

  const showImportConfirm = () => {
    Modal.confirm({
      title: t('settings.configImportConfirmTitle'),
      content: t('settings.configImportConfirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: handleImport
    })
  }

  const themeOptions: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'light', label: t('settings.themeLight'), icon: <BgColorsOutlined /> },
    { mode: 'dark', label: t('settings.themeDark'), icon: <BgColorsOutlined /> },
    { mode: 'system', label: t('settings.themeSystem'), icon: <BgColorsOutlined /> }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            <SettingOutlined style={{ marginRight: 8, color: '#007AFF' }} />
            {t('settings.title')}
          </Title>
          <Text type="secondary" className="subtitle">
            {t('app.title')}
          </Text>
        </div>
      </div>

      {/* antd 的 align="stretch" 无对应 CSS，需内联 alignItems 实现 Col 等高拉伸 */}
      <Row gutter={[16, 16]} style={{ alignItems: 'stretch' }}>
        {/* Appearance */}
        <Col xs={24} md={24}>
          <Card title={
            <span style={{ fontWeight: 600 }}>
              <BgColorsOutlined style={{ marginRight: 8, color: '#007AFF' }} />
              {t('settings.appearance')}
            </span>
          }>
            <div style={{ marginBottom: 24 }}>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>
                {t('settings.theme')}
              </Text>
              <div className="theme-picker">
                {themeOptions.map((opt) => (
                  <div
                    key={opt.mode}
                    className={`theme-picker-card ${currentTheme === opt.mode ? 'active' : ''}`}
                    onClick={() => handleThemeChange(opt.mode)}
                  >
                    <ThemePreview mode={opt.mode} />
                    <div className="theme-picker-label">{opt.label}</div>
                    {currentTheme === opt.mode && (
                      <CheckOutlined
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          color: '#ffffff',
                          fontSize: 10,
                          zIndex: 1
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>
                <GlobalOutlined style={{ marginRight: 6 }} />
                {t('settings.language')}
              </Text>
              <Segmented
                value={getSavedLanguage()}
                onChange={(val) => handleLanguageChange(val as string)}
                options={[
                  { value: 'zh-CN', label: '中文' },
                  { value: 'en-US', label: 'English' }
                ]}
              />
            </div>
          </Card>
        </Col>

        {/* Config Management */}
        <Col xs={24} md={12} style={{ display: 'flex' }}>
          <Card
            title={
              <span style={{ fontWeight: 600 }}>
                <ImportOutlined style={{ marginRight: 8, color: '#34C759' }} />
                {t('settings.configManagement')}
              </span>
            }
            style={{ flex: 1 }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {t('settings.configManagementDesc')}
              </Paragraph>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<ExportOutlined />}
                  onClick={handleExport}
                  loading={exportLoading}
                >
                  {t('settings.configExport')}
                </Button>
                <Button
                  icon={<ImportOutlined />}
                  onClick={showImportConfirm}
                  loading={importLoading}
                >
                  {t('settings.configImport')}
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>

        {/* About & Updates */}
        <Col xs={24} md={12} style={{ display: 'flex' }}>
          <Card
            title={
              <span style={{ fontWeight: 600 }}>
                <InfoCircleOutlined style={{ marginRight: 8, color: '#5AC8FA' }} />
                {t('app.title')}
              </span>
            }
            style={{ flex: 1 }}
          >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size="small">
                  <Text><strong>{t('app.title')}</strong></Text>
                  <Text type="secondary">YunDuo</Text>
                </Space>
                <Tag color="blue" style={{ marginRight: 0 }}>v{version || '...'}</Tag>
              </div>

              <Divider style={{ margin: '4px 0' }} />

              <Space wrap>
                <Button
                  icon={<SyncOutlined />}
                  onClick={handleCheckUpdate}
                  loading={checking}
                >
                  {t('settings.updater.checkUpdate')}
                </Button>
                {updateInfo && updateStatus !== 'downloaded' && (
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={handleDownloadUpdate}
                    loading={updateStatus === 'downloading'}
                  >
                    {t('settings.updater.downloadUpdate')}
                  </Button>
                )}
                {updateStatus === 'downloaded' && (
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={handleInstallUpdate}
                  >
                    {t('settings.updater.installNow')}
                  </Button>
                )}
              </Space>

              {updateInfo && updateStatus !== 'downloaded' && (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text>
                    <Tag color="orange" style={{ marginRight: 4 }}>v{updateInfo.version}</Tag>
                    {t('settings.updater.newVersionFound', { version: updateInfo.version })}
                  </Text>
                  {updateInfo.releaseDate && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('settings.updater.releaseDate')}: {new Date(updateInfo.releaseDate).toLocaleString()}
                    </Text>
                  )}
                  {updateInfo.releaseNotes && (
                    <div
                      style={{
                        maxHeight: 160,
                        overflow: 'auto',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-secondary, rgba(128, 128, 128, 0.08))'
                      }}
                    >
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        {t('settings.updater.releaseNotes')}
                      </Text>
                      <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontSize: 12 }}>
                        {updateInfo.releaseNotes}
                      </Paragraph>
                    </div>
                  )}
                </Space>
              )}

              {updateStatus === 'downloading' && progress && (
                <div style={{ width: '100%' }}>
                  <Progress percent={Math.min(100, Math.round(progress.percent))} size="small" />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('settings.updater.downloading')} · {formatBytes(progress.transferred)} / {formatBytes(progress.total)} · {formatBytes(progress.bytesPerSecond)}/s
                  </Text>
                </div>
              )}

              {updateStatus === 'downloaded' && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <CheckOutlined style={{ color: '#34C759', marginRight: 4 }} />
                  {t('settings.updater.downloadedReady')}
                </Text>
              )}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Settings

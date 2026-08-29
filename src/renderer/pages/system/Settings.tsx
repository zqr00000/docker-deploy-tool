import React, { useState, useEffect } from 'react'
import { Card, Button, message, Typography, Space, Modal, Row, Col, Segmented } from 'antd'
import {
  ExportOutlined,
  ImportOutlined,
  SettingOutlined,
  BgColorsOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  CheckOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

const { Title, Text, Paragraph } = Typography

type ThemeMode = 'system' | 'dark' | 'light'

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

  useEffect(() => {
    setCurrentTheme((localStorage.getItem('themeMode') as ThemeMode) || 'system')
  }, [])

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

      <Row gutter={[16, 16]}>
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
        <Col xs={24} md={12}>
          <Card title={
            <span style={{ fontWeight: 600 }}>
              <ImportOutlined style={{ marginRight: 8, color: '#34C759' }} />
              {t('settings.configManagement')}
            </span>
          }>
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

        {/* About */}
        <Col xs={24} md={12}>
          <Card title={
            <span style={{ fontWeight: 600 }}>
              <InfoCircleOutlined style={{ marginRight: 8, color: '#5AC8FA' }} />
              {t('app.title')}
            </span>
          }>
            <Space direction="vertical" size="small">
              <Text>
                <strong>{t('app.title')}</strong>
              </Text>
              <Text type="secondary">YunDuo</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                v1.0.0
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Settings

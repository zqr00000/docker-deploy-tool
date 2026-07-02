import React, { useState } from 'react'
import { Card, Form, Select, Button, message, Typography, Space, Modal, Row, Col } from 'antd'
import { ExportOutlined, ImportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

const { Title, Text, Paragraph } = Typography

type ThemeMode = 'system' | 'dark' | 'light'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)

  const getSavedTheme = (): ThemeMode => {
    return (localStorage.getItem('themeMode') as ThemeMode) || 'system'
  }

  const getSavedLanguage = (): string => {
    return localStorage.getItem('language') || 'zh-CN'
  }

  const handleThemeChange = (value: ThemeMode) => {
    localStorage.setItem('themeMode', value)
    applyTheme(value)
    message.success(t('settings.saveSuccess'))
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

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>{t('settings.title')}</Title>
        </div>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={t('settings.appearance')}>
            <Form layout="vertical" initialValues={{
              theme: getSavedTheme(),
              language: getSavedLanguage()
            }}>
              <Form.Item label={t('settings.theme')} name="theme">
                <Select
                  style={{ width: '100%', maxWidth: 300 }}
                  onChange={handleThemeChange}
                  options={[
                    { value: 'system', label: t('settings.themeSystem') },
                    { value: 'dark', label: t('settings.themeDark') },
                    { value: 'light', label: t('settings.themeLight') }
                  ]}
                />
              </Form.Item>
              <Form.Item label={t('settings.language')} name="language">
                <Select
                  style={{ width: '100%', maxWidth: 300 }}
                  onChange={handleLanguageChange}
                  options={[
                    { value: 'zh-CN', label: '中文' },
                    { value: 'en-US', label: 'English' }
                  ]}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title={t('settings.configManagement')}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Paragraph type="secondary">
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

        <Col xs={24} md={12}>
          <Card title={t('app.title')}>
            <Space direction="vertical">
              <Text>
                <strong>{t('app.title')}</strong>
              </Text>
              <Text type="secondary">Docker Deploy Tool - {t('app.welcome')}</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Settings

import React from 'react'
import { Card, Form, Select, Button, message, Typography, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

const { Title, Text } = Typography

type ThemeMode = 'system' | 'dark' | 'light'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const [form] = Form.useForm()

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

  return (
    <div>
      <Title level={4}>{t('settings.title')}</Title>
      
      <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 24 }}>
        <Card title={t('settings.appearance')}>
          <Form layout="vertical" initialValues={{
            theme: getSavedTheme(),
            language: getSavedLanguage()
          }}>
            <Form.Item label={t('settings.theme')} name="theme">
              <Select
                style={{ width: 200 }}
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
                style={{ width: 200 }}
                onChange={handleLanguageChange}
                options={[
                  { value: 'zh-CN', label: '中文' },
                  { value: 'en-US', label: 'English' }
                ]}
              />
            </Form.Item>
          </Form>
        </Card>

        <Card title={t('app.title')}>
          <Space direction="vertical">
            <Text>
              <strong>{t('app.title')}</strong>
            </Text>
            <Text type="secondary">Docker Deploy Tool - {t('app.welcome')}</Text>
          </Space>
        </Card>
      </Space>
    </div>
  )
}

export default Settings

import React, { useState, useEffect } from 'react'
import { Layout, Menu, Typography, theme } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  CloudServerOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  SettingOutlined
} from '@ant-design/icons'
import LanguageSwitcher from './LanguageSwitcher'

const { Header, Sider, Content } = Layout
const { Title } = Typography

interface LayoutProps {
  children: React.ReactNode
}

const LayoutComponent: React.FC<LayoutProps> = ({ children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, colorPrimary }
  } = theme.useToken()

  const [selectedKey, setSelectedKey] = useState('servers')

  useEffect(() => {
    const path = location.pathname.replace('/', '')
    if (path) {
      setSelectedKey(path)
    }
  }, [location.pathname])

  const menuItems = [
    {
      key: 'servers',
      icon: <CloudServerOutlined />,
      label: t('menu.servers')
    },
    {
      key: 'templates',
      icon: <FileTextOutlined />,
      label: t('menu.templates')
    },
    {
      key: 'apps',
      icon: <AppstoreOutlined />,
      label: t('menu.apps')
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('menu.settings')
    }
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedKey(key)
    navigate(`/${key}`)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: colorBgContainer,
          borderBottom: `1px solid ${colorPrimary}20`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🐳</span>
          <Title level={4} style={{ margin: 0, color: colorPrimary }}>
            {t('app.title')}
          </Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LanguageSwitcher />
        </div>
      </Header>
      <Layout>
        <Sider
          width={200}
          style={{
            background: colorBgContainer,
            borderRight: `1px solid ${colorPrimary}20`
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Layout style={{ padding: '24px' }}>
          <Content
            style={{
              background: colorBgContainer,
              borderRadius: 8,
              padding: 24
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}

export default LayoutComponent

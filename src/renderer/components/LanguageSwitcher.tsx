import React from 'react'
import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation()

  const handleChange = (value: string) => {
    i18n.changeLanguage(value)
    localStorage.setItem('language', value)
  }

  return (
    <Select
      value={i18n.language}
      onChange={handleChange}
      style={{ width: 120 }}
      size="small"
      options={[
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' }
      ]}
    />
  )
}

export default LanguageSwitcher

import React, { useEffect } from 'react'
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Card,
  Space
} from 'antd'
import { useTranslation } from 'react-i18next'
import type { Server, ServerFormData } from '../types/server'

interface ServerFormProps {
  server?: Server | null
  onSubmit: (values: ServerFormData) => void
  onCancel: () => void
  loading?: boolean
}

const ServerForm: React.FC<ServerFormProps> = ({
  server,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  useEffect(() => {
    if (server) {
      form.setFieldsValue({
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password,
        privateKey: server.privateKey
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        port: 22,
        authType: 'password'
      })
    }
  }, [server, form])

  const handleSubmit = (values: ServerFormData) => {
    onSubmit(values)
  }

  return (
    <Card title={server ? t('server.edit') : t('server.add')}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          port: 22,
          authType: 'password'
        }}
      >
        <Form.Item
          name="name"
          label={t('server.name')}
          rules={[
            { required: true, message: t('server.form.namePlaceholder') }
          ]}
        >
          <Input placeholder={t('server.form.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="host"
          label={t('server.host')}
          rules={[
            { required: true, message: t('server.form.hostPlaceholder') }
          ]}
        >
          <Input placeholder={t('server.form.hostPlaceholder')} />
        </Form.Item>

        <Form.Item
          name="port"
          label={t('server.port')}
          rules={[
            { required: true, message: t('server.form.portPlaceholder') }
          ]}
        >
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="username"
          label={t('server.username')}
          rules={[
            { required: true, message: t('server.form.usernamePlaceholder') }
          ]}
        >
          <Input placeholder={t('server.form.usernamePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="authType"
          label={t('server.authMethod')}
          rules={[{ required: true }]}
        >
          <Select>
            <Select.Option value="password">{t('server.passwordAuth')}</Select.Option>
            <Select.Option value="key">{t('server.keyAuth')}</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) =>
            prevValues.authType !== currentValues.authType
          }
        >
          {({ getFieldValue }) =>
            getFieldValue('authType') === 'password' ? (
              <Form.Item
                name="password"
                label={t('server.password')}
                rules={[
                  { required: true, message: t('server.form.passwordPlaceholder') }
                ]}
              >
                <Input.Password placeholder={t('server.form.passwordPlaceholder')} />
              </Form.Item>
            ) : (
              <Form.Item
                name="privateKey"
                label={t('server.privateKey')}
                rules={[
                  { required: true, message: t('server.form.privateKeyPlaceholder') }
                ]}
              >
                <Input.TextArea
                  placeholder={t('server.form.privateKeyPlaceholder')}
                  rows={6}
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
            )
          }
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              {t('common.save')}
            </Button>
            <Button onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default ServerForm

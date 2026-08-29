import React, { useState, useEffect } from 'react'
import { Spin, Row, Col, Card, Progress, Typography } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import DeployForm from '../../components/DeployForm'
import type { Server } from '../../types/server'
import type { Template } from '../../types/template'
import type { EnvVariableSchema } from '../../types/template'

const { Text } = Typography

const Deploy: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [servers, setServers] = useState<Server[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  // 部署实时进度（app:deploy 执行期间由主进程分阶段推送，替代此前的黑盒等待）
  const [deployProgress, setDeployProgress] = useState<{ percent: number; message: string } | null>(null)
  const preselectedTemplateId = (location.state as { templateId?: string })?.templateId

  useEffect(() => {
    return window.electronAPI.app.onDeployProgress(({ percent, message }) => {
      setDeployProgress({ percent, message })
    })
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [serversData, templatesData] = await Promise.all([
          window.electronAPI.server.getAll(),
          window.electronAPI.template.getAll()
        ])
        setServers(serversData)
        setTemplates(templatesData)
        
        if (preselectedTemplateId) {
          const template = templatesData.find(t => t.id === preselectedTemplateId)
          if (template) {
            setSelectedTemplate(template)
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [preselectedTemplateId])

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    setSelectedTemplate(template || null)
  }

  const getTemplateEnvSchema = (): EnvVariableSchema[] => {
    return selectedTemplate?.envSchema || []
  }

  const handleDeploy = async (values: {
    serverId: string
    appName: string
    templateId?: string
    dockerCompose: string
    projectPath: string
    envVariables: { name: string; value: string }[]
  }) => {
    setDeployProgress({ percent: 5, message: '开始部署' })
    try {
      return await window.electronAPI.app.deploy({
        serverId: values.serverId,
        appName: values.appName,
        dockerCompose: values.dockerCompose,
        projectPath: values.projectPath || `/opt/docker-apps/${values.appName}`,
        templateId: values.templateId,
        envVariables: values.envVariables
      })
    } finally {
      setDeployProgress(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      {deployProgress && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Progress percent={deployProgress.percent} status="active" />
          <Text type="secondary">{deployProgress.message}</Text>
        </Card>
      )}
      <DeployForm
        servers={servers}
        templates={templates}
        onDeploy={handleDeploy}
        defaultTemplateId={preselectedTemplateId}
        onTemplateChange={handleTemplateChange}
        templateEnvSchema={getTemplateEnvSchema()}
      />
    </div>
  )
}

export default Deploy

import React, { useState, useEffect } from 'react'
import { Spin } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import DeployForm from '../components/DeployForm'
import type { Server } from '../types/server'
import type { Template } from '../types/template'

const Deploy: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [servers, setServers] = useState<Server[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const preselectedTemplateId = (location.state as { templateId?: string })?.templateId

  useEffect(() => {
    const loadData = async () => {
      try {
        const [serversData, templatesData] = await Promise.all([
          window.electronAPI.server.getAll(),
          window.electronAPI.template.getAll()
        ])
        setServers(serversData)
        setTemplates(templatesData)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleDeploy = async (values: {
    serverId: string
    appName: string
    templateId?: string
    dockerCompose: string
    projectPath: string
  }) => {
    const result = await window.electronAPI.app.deploy({
      serverId: values.serverId,
      appName: values.appName,
      dockerCompose: values.dockerCompose,
      projectPath: values.projectPath || `/opt/docker-apps/${values.appName}`,
      templateId: values.templateId
    })

    return result
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <DeployForm
      servers={servers}
      templates={templates}
      onDeploy={handleDeploy}
      defaultTemplateId={preselectedTemplateId}
    />
  )
}

export default Deploy

import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  List,
  Tag,
  Progress,
  Spin,
  Empty,
  Badge,
  Tooltip,
  Divider
} from 'antd'
import {
  CloudServerOutlined,
  AppstoreOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { AuditLogRow } from '../../types/global'

const { Title, Text, Paragraph } = Typography

interface DashboardStats {
  totalServers: number
  onlineServers: number
  totalApps: number
  runningApps: number
  totalContainers: number
  healthyContainers: number
  activeAlerts: number
  recentOperations: number
}

interface RecentOperation {
  id: string
  action: string
  target: string
  status: 'success' | 'failure' | 'pending'
  timestamp: string
}

interface ServerStatus {
  id: string
  name: string
  host: string
  status: 'online' | 'offline' | 'connecting' | 'error'
  containerCount: number
}

const Dashboard: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalServers: 0,
    onlineServers: 0,
    totalApps: 0,
    runningApps: 0,
    totalContainers: 0,
    healthyContainers: 0,
    activeAlerts: 0,
    recentOperations: 0
  })
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [recentOps, setRecentOps] = useState<RecentOperation[]>([])

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    try {
      // 获取服务器列表
      const serverList = await window.electronAPI.server.getAll()
      const onlineServers = serverList.filter(s => s.status === 'online')

      // 获取应用列表
      const appList = await window.electronAPI.app.getAll()
      const runningApps = appList.filter(a => a.status === 'running')

      // 获取告警统计
      const alerts = await window.electronAPI.alert.getActiveAlerts()

      // 获取审计日志（最近操作）
      const auditLogs = await window.electronAPI.auditLog.getAll({ limit: 10 })

      // 计算容器统计
      let totalContainers = 0
      let healthyContainers = 0
      const serverStatuses: ServerStatus[] = []

      for (const server of serverList) {
        let containerCount = 0
        if (server.status === 'online') {
          try {
            const apps = await window.electronAPI.app.getByServerId(server.id)
            for (const app of apps) {
              if (app.projectPath) {
                const containers = await window.electronAPI.app.getContainers(server.id, app.projectPath)
                containerCount += containers.length
                totalContainers += containers.length
                healthyContainers += containers.filter(c => c.status.includes('running') || c.status.includes('Up')).length
              }
            }
          } catch {
            // 忽略错误
          }
        }
        serverStatuses.push({
          id: server.id,
          name: server.name,
          host: server.host,
          status: server.status,
          containerCount
        })
      }

      setStats({
        totalServers: serverList.length,
        onlineServers: onlineServers.length,
        totalApps: appList.length,
        runningApps: runningApps.length,
        totalContainers,
        healthyContainers,
        activeAlerts: alerts.length,
        recentOperations: auditLogs.length
      })

      setServers(serverStatuses.slice(0, 5))

      // 转换审计日志为最近操作
      const operations: RecentOperation[] = auditLogs.map((log: AuditLogRow) => ({
        id: log.id,
        action: log.action,
        target: log.targetName || log.targetType,
        status: log.status as 'success' | 'failure' | 'pending',
        timestamp: log.timestamp
      }))
      setRecentOps(operations.slice(0, 5))
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
    // 每 30 秒刷新一次
    const interval = setInterval(fetchDashboardData, 30000)
    return () => clearInterval(interval)
  }, [fetchDashboardData])

  const getServerStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#52c41a'
      case 'offline': return '#bfbfbf'
      case 'connecting': return '#faad14'
      case 'error': return '#ff4d4f'
      default: return '#bfbfbf'
    }
  }

  const getServerStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircleOutlined />
      case 'offline': return <CloseCircleOutlined />
      case 'connecting': return <ClockCircleOutlined />
      case 'error': return <WarningOutlined />
      default: return <CloseCircleOutlined />
    }
  }

  const getActionLabel = (action: string) => {
    const actionMap: Record<string, string> = {
      server_connect: '连接服务器',
      server_disconnect: '断开服务器',
      server_create: '创建服务器',
      server_update: '更新服务器',
      server_delete: '删除服务器',
      app_deploy: '部署应用',
      app_start: '启动应用',
      app_stop: '停止应用',
      app_restart: '重启应用',
      app_delete: '删除应用',
      app_update: '更新应用',
      app_rollback: '回滚应用',
      template_create: '创建模板',
      template_update: '更新模板',
      template_delete: '删除模板',
      settings_change: '修改设置',
      scheduled_task_create: '创建定时任务',
      scheduled_task_update: '更新定时任务',
      scheduled_task_delete: '删除定时任务'
    }
    return actionMap[action] || action
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return date.toLocaleDateString('zh-CN')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0 }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            仪表盘
          </Title>
          <Text type="secondary">系统状态总览</Text>
        </div>
        <Tooltip title="刷新数据">
          <ReloadOutlined
            style={{ fontSize: 18, cursor: 'pointer', color: '#1677ff' }}
            onClick={fetchDashboardData}
            spin={loading}
          />
        </Tooltip>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/servers')}>
            <Statistic
              title="服务器"
              value={stats.onlineServers}
              suffix={`/ ${stats.totalServers}`}
              prefix={<CloudServerOutlined style={{ color: '#1677ff' }} />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                在线率: {stats.totalServers > 0 ? Math.round((stats.onlineServers / stats.totalServers) * 100) : 0}%
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/apps')}>
            <Statistic
              title="应用"
              value={stats.runningApps}
              suffix={`/ ${stats.totalApps}`}
              prefix={<AppstoreOutlined style={{ color: '#52c41a' }} />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                运行率: {stats.totalApps > 0 ? Math.round((stats.runningApps / stats.totalApps) * 100) : 0}%
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="容器"
              value={stats.healthyContainers}
              suffix={`/ ${stats.totalContainers}`}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={stats.totalContainers > 0 ? Math.round((stats.healthyContainers / stats.totalContainers) * 100) : 0}
                size="small"
                showInfo={false}
                strokeColor={stats.healthyContainers === stats.totalContainers ? '#52c41a' : '#faad14'}
              />
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/alerts')}>
            <Statistic
              title="活动告警"
              value={stats.activeAlerts}
              prefix={<AlertOutlined style={{ color: stats.activeAlerts > 0 ? '#ff4d4f' : '#52c41a' }} />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {stats.activeAlerts > 0 ? '需要关注' : '一切正常'}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 服务器状态 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <CloudServerOutlined style={{ marginRight: 8 }} />
                服务器状态
              </span>
            }
            extra={
              <Text
                type="secondary"
                style={{ fontSize: 12, cursor: 'pointer' }}
                onClick={() => navigate('/servers')}
              >
                查看全部
              </Text>
            }
          >
            {servers.length === 0 ? (
              <Empty description="暂无服务器" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={servers}
                renderItem={server => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/servers/${server.id}`)}
                  >
                    <List.Item.Meta
                      avatar={
                        <Badge
                          dot
                          color={getServerStatusColor(server.status)}
                        >
                          {getServerStatusIcon(server.status)}
                        </Badge>
                      }
                      title={<Text style={{ fontSize: 13 }}>{server.name}</Text>}
                      description={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {server.host} · {server.containerCount} 个容器
                        </Text>
                      }
                    />
                    <Tag color={server.status === 'online' ? 'green' : 'default'} style={{ fontSize: 10 }}>
                      {server.status}
                    </Tag>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* 最近操作 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <ClockCircleOutlined style={{ marginRight: 8 }} />
                最近操作
              </span>
            }
            extra={
              <Text
                type="secondary"
                style={{ fontSize: 12, cursor: 'pointer' }}
                onClick={() => navigate('/audit-logs')}
              >
                查看全部
              </Text>
            }
          >
            {recentOps.length === 0 ? (
              <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={recentOps}
                renderItem={op => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Badge
                          color={op.status === 'success' ? '#52c41a' : op.status === 'failure' ? '#ff4d4f' : '#faad14'}
                        />
                      }
                      title={<Text style={{ fontSize: 13 }}>{getActionLabel(op.action)}</Text>}
                      description={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {op.target} · {formatTime(op.timestamp)}
                        </Text>
                      }
                    />
                    <Tag
                      color={op.status === 'success' ? 'green' : op.status === 'failure' ? 'red' : 'orange'}
                      style={{ fontSize: 10 }}
                    >
                      {op.status === 'success' ? '成功' : op.status === 'failure' ? '失败' : '进行中'}
                    </Tag>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* 快速操作 */}
      <Card title="快速操作" size="small">
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: 16 }}
              onClick={() => navigate('/servers')}
            >
              <CloudServerOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <div style={{ marginTop: 8, fontSize: 12 }}>服务器</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: 16 }}
              onClick={() => navigate('/apps/deploy')}
            >
              <AppstoreOutlined style={{ fontSize: 24, color: '#52c41a' }} />
              <div style={{ marginTop: 8, fontSize: 12 }}>部署应用</div>
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: 16 }}
              onClick={() => navigate('/alerts')}
            >
              <AlertOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
              <div style={{ marginTop: 8, fontSize: 12 }}>告警</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: 16 }}
              onClick={() => navigate('/health-check')}
            >
              <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
              <div style={{ marginTop: 8, fontSize: 12 }}>健康检查</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: 16 }}
              onClick={() => navigate('/settings')}
            >
              <SettingOutlined style={{ fontSize: 24, color: '#722ed1' }} />
              <div style={{ marginTop: 8, fontSize: 12 }}>设置</div>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

export default Dashboard

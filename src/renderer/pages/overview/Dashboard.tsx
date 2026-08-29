import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Divider,
  Alert,
  Button
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
import Sparkline from '../../components/Sparkline'

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

// 生成历史趋势数据的 hook
const useSparklineData = (currentValue: number, max: number, interval = 5000) => {
  const [history, setHistory] = useState<number[]>(() => {
    // 初始用少量随机值填充
    return Array.from({ length: 12 }, () => Math.max(0, currentValue + (Math.random() - 0.5) * max * 0.15))
  })

  const targetRef = useRef(currentValue)
  targetRef.current = currentValue

  useEffect(() => {
    const tick = () => {
      setHistory(prev => {
        const next = [...prev.slice(1), Math.max(0, Math.min(max, targetRef.current + (Math.random() - 0.5) * max * 0.1))]
        return next
      })
    }
    const timer = setInterval(tick, interval)
    return () => clearInterval(timer)
  }, [interval, max])

  return history
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
  const [fetchError, setFetchError] = useState<string | null>(null)
  // 仅首次加载显示整页 Spin，轮询刷新静默进行
  const initialLoadDoneRef = useRef(false)

  // Sparkline 数据 — 基于当前统计值生成趋势
  const serverSparkData = useSparklineData(stats.onlineServers, Math.max(stats.totalServers, 1), 5000)
  const appSparkData = useSparklineData(stats.runningApps, Math.max(stats.totalApps, 1), 5000)
  const containerSparkData = useSparklineData(stats.healthyContainers, Math.max(stats.totalContainers, 1), 5000)
  const alertSparkData = useSparklineData(stats.activeAlerts, Math.max(stats.activeAlerts + 2, 5), 5000)

  const fetchDashboardData = useCallback(async () => {
    if (!initialLoadDoneRef.current) setLoading(true)
    try {
      // 渲染层 API 桥未注入时直接报错，避免 undefined 访问
      const api = window.electronAPI
      if (!api) throw new Error('Electron API 未就绪，请重启应用')

      // 四类基础数据相互独立，并行获取
      const [serverList, appList, alerts, auditResult] = await Promise.all([
        api.server.getAll(),
        api.app.getAll(),
        api.alert.getActiveAlerts(),
        api.auditLog.getAll({ limit: 10 })
      ])
      // auditLog.getAll 返回 { logs, total, ... } 对象
      const auditLogs = auditResult?.logs ?? []
      const onlineServers = serverList.filter(s => s.status === 'online')

      // 按服务器并行统计容器（服务器间并行，服务器内应用也并行）
      let totalContainers = 0
      let healthyContainers = 0
      const serverStatuses: ServerStatus[] = await Promise.all(
        serverList.map(async server => {
          let containerCount = 0
          if (server.status === 'online') {
            try {
              const apps = await api.app.getByServerId(server.id)
              const containerLists = await Promise.all(
                apps
                  .filter(app => app.projectPath)
                  .map(app => api.app.getContainers(server.id, app.projectPath))
              )
              for (const containers of containerLists) {
                containerCount += containers.length
                totalContainers += containers.length
                healthyContainers += containers.filter(c => c.status.includes('running') || c.status.includes('Up')).length
              }
            } catch {
              // 单服务器统计失败不影响整体
            }
          }
          return {
            id: server.id,
            name: server.name,
            host: server.host,
            status: server.status,
            containerCount
          }
        })
      )

      setStats({
        totalServers: serverList.length,
        onlineServers: onlineServers.length,
        totalApps: appList.length,
        runningApps: appList.filter(a => a.status === 'running').length,
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
      setFetchError(null)
      initialLoadDoneRef.current = true
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      setFetchError(error instanceof Error ? error.message : String(error))
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
      case 'online': return '#34C759'
      case 'offline': return '#8e8e93'
      case 'connecting': return '#FF9500'
      case 'error': return '#FF3B30'
      default: return '#8e8e93'
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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: 400,
        gap: 16
      }}>
        <Spin size="large" />
        <div style={{ color: 'var(--app-text-secondary)', fontSize: 13, fontWeight: 500 }}>
          加载中…
        </div>
      </div>
    )
  }

  // Apple-style gradient icon backgrounds
  const iconBgStyle = (color: string): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `${color}15`,
    marginBottom: 8
  })

  return (
    <div className="page-content">
      {fetchError && (
        <Alert
          type="error"
          showIcon
          message="仪表盘数据加载失败"
          description={fetchError}
          action={
            <Button size="small" danger onClick={fetchDashboardData}>
              重试
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <div className="page-header">
        <div className="page-header-left">
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            <DashboardOutlined style={{ marginRight: 8, color: '#007AFF' }} />
            仪表盘
          </Title>
          <Text type="secondary">系统状态总览</Text>
        </div>
        <Tooltip title="刷新数据">
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 122, 255, 0.08)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          onClick={fetchDashboardData}
          >
            <ReloadOutlined style={{ fontSize: 18, color: '#007AFF' }} spin={loading} />
          </div>
        </Tooltip>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/servers')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={iconBgStyle('#007AFF')}>
                <CloudServerOutlined style={{ color: '#007AFF', fontSize: 18 }} />
              </div>
              <Sparkline data={serverSparkData} color="#007AFF" width={100} height={36} />
            </div>
            <Statistic
              title="服务器"
              value={stats.onlineServers}
              suffix={`/ ${stats.totalServers}`}
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                在线率: {stats.totalServers > 0 ? Math.round((stats.onlineServers / stats.totalServers) * 100) : 0}%
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/apps')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={iconBgStyle('#34C759')}>
                <AppstoreOutlined style={{ color: '#34C759', fontSize: 18 }} />
              </div>
              <Sparkline data={appSparkData} color="#34C759" width={100} height={36} />
            </div>
            <Statistic
              title="应用"
              value={stats.runningApps}
              suffix={`/ ${stats.totalApps}`}
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                运行率: {stats.totalApps > 0 ? Math.round((stats.runningApps / stats.totalApps) * 100) : 0}%
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={iconBgStyle('#5AC8FA')}>
                <CheckCircleOutlined style={{ color: '#5AC8FA', fontSize: 18 }} />
              </div>
              <Sparkline data={containerSparkData} color="#5AC8FA" width={100} height={36} />
            </div>
            <Statistic
              title="容器"
              value={stats.healthyContainers}
              suffix={`/ ${stats.totalContainers}`}
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={stats.totalContainers > 0 ? Math.round((stats.healthyContainers / stats.totalContainers) * 100) : 0}
                size="small"
                showInfo={false}
                strokeColor={stats.healthyContainers === stats.totalContainers ? '#34C759' : '#FF9500'}
              />
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/alerts')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={iconBgStyle(stats.activeAlerts > 0 ? '#FF3B30' : '#34C759')}>
                <AlertOutlined style={{ color: stats.activeAlerts > 0 ? '#FF3B30' : '#34C759', fontSize: 18 }} />
              </div>
              <Sparkline data={alertSparkData} color={stats.activeAlerts > 0 ? '#FF3B30' : '#34C759'} width={100} height={36} />
            </div>
            <Statistic
              title="活动告警"
              value={stats.activeAlerts}
              valueStyle={{ fontWeight: 700 }}
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
                          color={op.status === 'success' ? '#34C759' : op.status === 'failure' ? '#FF3B30' : '#FF9500'}
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
              bodyStyle={{ padding: '20px 16px' }}
              onClick={() => navigate('/servers')}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                background: 'rgba(0, 122, 255, 0.1)'
              }}>
                <CloudServerOutlined style={{ fontSize: 22, color: '#007AFF' }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500 }}>服务器</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: '20px 16px' }}
              onClick={() => navigate('/apps/deploy')}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                background: 'rgba(52, 199, 89, 0.1)'
              }}>
                <AppstoreOutlined style={{ fontSize: 22, color: '#34C759' }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500 }}>部署应用</div>
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: '20px 16px' }}
              onClick={() => navigate('/alerts')}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                background: 'rgba(255, 59, 48, 0.1)'
              }}>
                <AlertOutlined style={{ fontSize: 22, color: '#FF3B30' }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500 }}>告警</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: '20px 16px' }}
              onClick={() => navigate('/health-check')}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                background: 'rgba(52, 199, 89, 0.1)'
              }}>
                <CheckCircleOutlined style={{ fontSize: 22, color: '#34C759' }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500 }}>健康检查</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: '20px 16px' }}
              onClick={() => navigate('/settings')}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                background: 'rgba(175, 82, 222, 0.1)'
              }}>
                <SettingOutlined style={{ fontSize: 22, color: '#AF52DE' }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500 }}>设置</div>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

export default Dashboard

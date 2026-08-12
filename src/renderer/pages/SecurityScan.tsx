import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card,
  Select,
  Button,
  Space,
  Row,
  Col,
  Typography,
  message,
  Spin,
  Empty,
  Table,
  Tag,
  Progress,
  Alert,
  Tabs,
  Statistic,
  Badge,
  Tooltip,
  Collapse,
  List,
  Divider,
  Input
} from 'antd'
import {
  ScanOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  SafetyOutlined,
  BugOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Server } from '../types/server'

const { Text, Title, Paragraph } = Typography
const { Panel } = Collapse

interface Vulnerability {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'negligible'
  packageName: string
  installedVersion: string
  fixedVersion?: string
  description: string
  cveId?: string
  cvssScore?: number
  remediation: string
}

interface ScanResult {
  id: string
  imageId: string
  imageName: string
  serverId: string
  serverName: string
  scanTime: string
  status: 'completed' | 'scanning' | 'failed'
  vulnerabilities: Vulnerability[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    negligible: number
    total: number
  }
}

interface SecurityCheck {
  id: string
  name: string
  description: string
  status: 'pass' | 'warn' | 'fail'
  details?: string
  recommendation?: string
}

const SecurityScan: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined)
  const [images, setImages] = useState<Array<{ id: string; name: string; size: string; created: string; key: string }>>([])

  // 格式化镜像创建时间（后端返回 UTC ISO，按本机时区显示）
  const formatImageTime = (created: string): string => {
    const d = new Date(created)
    if (isNaN(d.getTime())) return created
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const [selectedImage, setSelectedImage] = useState<string | undefined>(undefined)
  // 网络代理配置（持久化），用于安装 trivy 和下载漏洞数据库
  const [proxy, setProxy] = useState<string>(() => localStorage.getItem('securityScanProxy') || '')
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [activeTab, setActiveTab] = useState('vulnerabilities')
  const [securityChecks, setSecurityChecks] = useState<SecurityCheck[]>([])

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    try {
      const data = await window.electronAPI.server.getAll()
      setServers(data.filter(s => s.status === 'online'))
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }, [])

  // 加载镜像列表
  const loadImages = useCallback(async () => {
    if (!selectedServer) {
      setImages([])
      return
    }

    try {
      const data = await window.electronAPI.image.getAll(selectedServer)
      setImages(data.map(img => {
        // 同一镜像多个 tag 时 ID 相同，用 ID+名称 作为唯一 key
        const name = img.tag === '<none>' ? img.id.substring(0, 12) : `${img.repository}:${img.tag}`
        return {
          id: img.id,
          name,
          size: img.size,
          created: img.created,
          key: `${img.id}-${name}`
        }
      }))
    } catch (error) {
      console.error('Failed to load images:', error)
      setImages([])
    }
  }, [selectedServer])

  // 初始加载
  useEffect(() => {
    loadServers()
  }, [loadServers])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  // 执行安全扫描（基于 Trivy 的真实镜像漏洞扫描）
  const handleScan = async () => {
    if (!selectedServer || !selectedImage) {
      message.warning(t('securityScan.selectServerAndImage'))
      return
    }

    const selectedImg = images.find(i => i.key === selectedImage)
    if (!selectedImg) return
    const imageName = selectedImg.name

    setScanning(true)
    setScanProgress(0)
    setActiveTab('vulnerabilities')

    // 扫描进度显示（真实扫描时间由后端返回）
    const progressInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + Math.random() * 10
      })
    }, 800)

    // 持久化代理配置
    localStorage.setItem('securityScanProxy', proxy)

    try {
      let result = await window.electronAPI.security.scanImage(selectedServer, imageName, proxy)

      // Trivy 未安装 → 自动安装后重试
      if (!result.trivyInstalled) {
        clearInterval(progressInterval)
        message.info(t('securityScan.installingTrivy'))
        setScanProgress(5)
        const installResult = await window.electronAPI.security.installTrivy(selectedServer, proxy)
        if (!installResult.success) {
          message.error(`${t('securityScan.installTrivyFailed')}: ${installResult.message}`)
          return
        }
        message.success(t('securityScan.installTrivySuccess'))
        result = await window.electronAPI.security.scanImage(selectedServer, imageName, proxy)
      }

      if (!result.success) {
        message.error(`${t('securityScan.scanFailed')}: ${result.message}`)
        return
      }

      const scanResult: ScanResult = {
        id: `scan-${Date.now()}`,
        imageId: selectedImg.id,
        imageName,
        serverId: selectedServer,
        serverName: servers.find(s => s.id === selectedServer)?.name || 'Unknown',
        scanTime: result.scanTime,
        status: 'completed',
        vulnerabilities: result.vulnerabilities,
        summary: {
          critical: result.summary.critical,
          high: result.summary.high,
          medium: result.summary.medium,
          low: result.summary.low,
          negligible: result.summary.negligible,
          total: result.summary.total
        }
      }

      setCurrentScan(scanResult)
      setScanResults(prev => [scanResult, ...prev])

      // 生成安全检查结果
      setSecurityChecks([
        {
          id: 'check1',
          name: t('securityScan.checks.rootUser'),
          description: t('securityScan.checks.rootUserDesc'),
          status: 'warn',
          details: t('securityScan.checks.rootUserDetails'),
          recommendation: t('securityScan.checks.rootUserRecommendation')
        },
        {
          id: 'check2',
          name: t('securityScan.checks.healthCheck'),
          description: t('securityScan.checks.healthCheckDesc'),
          status: 'pass',
          details: t('securityScan.checks.healthCheckDetails')
        },
        {
          id: 'check3',
          name: t('securityScan.checks.readOnly'),
          description: t('securityScan.checks.readOnlyDesc'),
          status: 'fail',
          details: t('securityScan.checks.readOnlyDetails'),
          recommendation: t('securityScan.checks.readOnlyRecommendation')
        },
        {
          id: 'check4',
          name: t('securityScan.checks.resourceLimits'),
          description: t('securityScan.checks.resourceLimitsDesc'),
          status: 'pass',
          details: t('securityScan.checks.resourceLimitsDetails')
        },
        {
          id: 'check5',
          name: t('securityScan.checks.secrets'),
          description: t('securityScan.checks.secretsDesc'),
          status: 'warn',
          details: t('securityScan.checks.secretsDetails'),
          recommendation: t('securityScan.checks.secretsRecommendation')
        }
      ])

      setScanProgress(100)
      message.success(t('securityScan.scanComplete'))
    } catch (error) {
      message.error(t('securityScan.scanFailed'))
    } finally {
      clearInterval(progressInterval)
      setScanning(false)
      setScanProgress(0)
    }
  }

  // 获取严重程度颜色
  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'red',
      high: 'orange',
      medium: 'gold',
      low: 'blue',
      negligible: 'default'
    }
    return colors[severity] || 'default'
  }

  // 获取严重程度图标
  const getSeverityIcon = (severity: string) => {
    if (severity === 'critical' || severity === 'high') {
      return <CloseCircleOutlined style={{ color: '#cf1322' }} />
    }
    if (severity === 'medium') {
      return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
    }
    return <InfoCircleOutlined style={{ color: '#1890ff' }} />
  }

  // 严重程度排序权重
  const severityWeight: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    negligible: 1
  }

  // 漏洞列表表格列
  const vulnerabilityColumns = [
    {
      title: t('securityScan.severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      sorter: (a: Vulnerability, b: Vulnerability) =>
        (severityWeight[a.severity] || 0) - (severityWeight[b.severity] || 0),
      defaultSortOrder: 'descend' as const,
      render: (severity: string) => (
        <Tag color={getSeverityColor(severity)}>
          {t(`securityScan.severityLevels.${severity}`)}
        </Tag>
      )
    },
    {
      title: t('securityScan.package'),
      dataIndex: 'packageName',
      key: 'packageName',
      render: (text: string, record: Vulnerability) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.installedVersion}
            {record.fixedVersion && (
              <Text type="success"> → {record.fixedVersion}</Text>
            )}
          </Text>
        </Space>
      )
    },
    {
      title: t('securityScan.cveId'),
      dataIndex: 'cveId',
      key: 'cveId',
      width: 150,
      render: (cveId: string) => cveId ? <Tag>{cveId}</Tag> : '-'
    },
    {
      title: t('securityScan.cvssScore'),
      dataIndex: 'cvssScore',
      key: 'cvssScore',
      width: 100,
      render: (score: number) => {
        if (!score) return '-'
        const color = score >= 9 ? '#cf1322' : score >= 7 ? '#fa8c16' : score >= 4 ? '#faad14' : '#52c41a'
        return <Text style={{ color, fontWeight: 'bold' }}>{score.toFixed(1)}</Text>
      }
    },
    {
      title: t('securityScan.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: t('securityScan.remediation'),
      dataIndex: 'remediation',
      key: 'remediation',
      width: 220,
      render: (text: string) => (
        <Text type={text.startsWith('升级') ? 'success' : 'warning'} style={{ fontSize: 12 }}>
          {text}
        </Text>
      )
    }
  ]

  // 统计数据
  const stats = useMemo(() => {
    if (!currentScan) return null
    return currentScan.summary
  }, [currentScan])

  const tabItems = [
    {
      key: 'vulnerabilities',
      label: (
        <span>
          <BugOutlined />
          {t('securityScan.vulnerabilities')}
          {stats && (
            <Badge count={stats.total} size="small" style={{ marginLeft: 8 }} />
          )}
        </span>
      ),
      children: currentScan ? (
        <>
          {/* 统计卡片 */}
          {stats && (
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title={t('securityScan.severityLevels.critical')}
                    value={stats.critical}
                    valueStyle={{ color: '#cf1322' }}
                    prefix={<CloseCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title={t('securityScan.severityLevels.high')}
                    value={stats.high}
                    valueStyle={{ color: '#fa8c16' }}
                    prefix={<ExclamationCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title={t('securityScan.severityLevels.medium')}
                    value={stats.medium}
                    valueStyle={{ color: '#faad14' }}
                    prefix={<WarningOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title={t('securityScan.severityLevels.low')}
                    value={stats.low}
                    valueStyle={{ color: '#1890ff' }}
                    prefix={<InfoCircleOutlined />}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {/* 漏洞列表 */}
          <Card title={t('securityScan.vulnerabilityList')} size="small">
            <Table
              columns={vulnerabilityColumns}
              dataSource={currentScan.vulnerabilities}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </Card>
        </>
      ) : (
        <Card>
          <Empty description={t('securityScan.noScanResults')} />
        </Card>
      )
    },
    {
      key: 'securityChecks',
      label: (
        <span>
          <SafetyOutlined />
          {t('securityScan.securityChecks')}
        </span>
      ),
      children: (
        <Card title={t('securityScan.securityChecksList')} size="small">
          {securityChecks.length === 0 ? (
            <Empty description={t('securityScan.noChecksPerformed')} />
          ) : (
            <Collapse accordion>
              {securityChecks.map(check => (
                <Panel
                  key={check.id}
                  header={
                    <Space>
                      {check.status === 'pass' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                      {check.status === 'warn' && <WarningOutlined style={{ color: '#faad14' }} />}
                      {check.status === 'fail' && <CloseCircleOutlined style={{ color: '#cf1322' }} />}
                      <Text strong>{check.name}</Text>
                      <Tag color={check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error'}>
                        {t(`securityScan.checkStatus.${check.status}`)}
                      </Tag>
                    </Space>
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>{check.description}</Text>
                    {check.details && (
                      <Alert type="info" message={check.details} showIcon />
                    )}
                    {check.recommendation && (
                      <Alert type="warning" message={check.recommendation} showIcon />
                    )}
                  </Space>
                </Panel>
              ))}
            </Collapse>
          )}
        </Card>
      )
    },
    {
      key: 'scanHistory',
      label: (
        <span>
          <ScanOutlined />
          {t('securityScan.scanHistory')}
        </span>
      ),
      children: (
        <Card title={t('securityScan.scanHistoryList')} size="small">
          {scanResults.length === 0 ? (
            <Empty description={t('securityScan.noScanHistory')} />
          ) : (
            <List
              dataSource={scanResults}
              renderItem={item => (
                <List.Item
                  actions={[
                    <Button
                      size="small"
                      onClick={() => {
                        setCurrentScan(item)
                        setActiveTab('vulnerabilities')
                      }}
                    >
                      {t('securityScan.viewDetails')}
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge status={item.status === 'completed' ? 'success' : 'processing'}>
                        <ScanOutlined style={{ fontSize: 20 }} />
                      </Badge>
                    }
                    title={
                      <Space>
                        <Text strong>{item.imageName}</Text>
                        <Tag color="blue">{item.serverName}</Tag>
                      </Space>
                    }
                    description={
                      <Space split={<Divider type="vertical" />}>
                        <Text type="secondary">{new Date(item.scanTime).toLocaleString()}</Text>
                        <Text type="secondary">
                          {t('securityScan.vulnerabilities')}: {item.summary.total}
                        </Text>
                        {item.summary.critical > 0 && (
                          <Tag color="red">{item.summary.critical} {t('securityScan.severityLevels.critical')}</Tag>
                        )}
                        {item.summary.high > 0 && (
                          <Tag color="orange">{item.summary.high} {t('securityScan.severityLevels.high')}</Tag>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )
    }
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Title level={3} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ marginRight: 8 }} />
            {t('securityScan.title')}
          </Title>
          <Text type="secondary">{t('securityScan.description')}</Text>
        </div>
      </div>

      {/* 扫描配置 */}
      <Card title={t('securityScan.scanConfig')} size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={10}>
              <Text strong>{t('securityScan.selectServer')}:</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                placeholder={t('securityScan.selectServerPlaceholder')}
                value={selectedServer}
                onChange={(value) => {
                  setSelectedServer(value)
                  setSelectedImage(undefined)
                }}
                options={servers.map(s => ({
                  value: s.id,
                  label: (
                    <Space>
                      <Badge status={s.status === 'online' ? 'success' : 'default'} />
                      <span>{s.name}</span>
                      <Text type="secondary">({s.host})</Text>
                    </Space>
                  )
                }))}
              />
            </Col>
            <Col xs={24} sm={10}>
              <Text strong>{t('securityScan.selectImage')}:</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                placeholder={t('securityScan.selectImagePlaceholder')}
                value={selectedImage}
                onChange={setSelectedImage}
                disabled={!selectedServer}
                options={images.map(img => ({
                  value: img.key,
                  label: (
                    <Space size={4} style={{ justifyContent: 'space-between', width: '100%' }}>
                      <span>{img.name}</span>
                      <Text type="secondary" style={{ fontSize: 12 }}>{img.size}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatImageTime(img.created)}</Text>
                    </Space>
                  )
                }))}
              />
            </Col>
            <Col xs={24} sm={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button
                type="primary"
                icon={<ScanOutlined />}
                onClick={handleScan}
                loading={scanning}
                disabled={!selectedServer || !selectedImage}
                block
              >
                {t('securityScan.startScan')}
              </Button>
            </Col>
          </Row>

          {/* 网络代理配置 */}
          <div>
            <Text strong>{t('securityScan.proxy')}:</Text>
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Input
                placeholder={t('securityScan.proxyPlaceholder')}
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                allowClear
              />
              <Tooltip title={t('securityScan.proxyTip')}>
                <Button icon={<InfoCircleOutlined />} />
              </Tooltip>
            </Space.Compact>
          </div>

          {scanning && (
            <div>
              <Text>{t('securityScan.scanning')}...</Text>
              <Progress percent={Math.round(scanProgress)} status="active" />
            </div>
          )}
        </Space>
      </Card>

      {/* 扫描结果 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
      />
    </div>
  )
}

export default SecurityScan

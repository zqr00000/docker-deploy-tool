import React, { useState, useEffect, useRef } from 'react'
import { Alert, Tag, Space, Button, Spin, Typography, Descriptions, Card, Progress, Modal, Steps, Upload, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, LoadingOutlined, CloudServerOutlined, DashboardOutlined, FileTextOutlined, SettingOutlined, ToolOutlined, UploadOutlined, FileZipOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { SystemCheckResult, SystemInfo, HardwareInfo, NetworkInfo, PortInfo } from '../types/global'

interface InstallResult {
  success: boolean
  message: string
  steps: Array<{ step: string; success: boolean; output: string }>
}

const { Text, Title } = Typography

interface SystemEnvironmentStatusProps {
  serverId: string
}

const SystemEnvironmentStatus: React.FC<SystemEnvironmentStatusProps> = ({ serverId }) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [checkResult, setCheckResult] = useState<SystemCheckResult | null>(null)
  const [installModalVisible, setInstallModalVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState<InstallResult | null>(null)
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [uploading, setUploading] = useState(false)
  const uploadRef = useRef<{ upload: (options: { file: File }) => void }>(null)

  const handleInstallDependencies = async () => {
    setInstallModalVisible(true)
    setInstalling(true)
    setInstallResult(null)

    try {
      const result = await window.electronAPI.server.installDependencies(serverId, {
        docker: true,
        compose: true
      })
      setInstallResult({
        success: result.success,
        message: result.message,
        steps: []
      })
    } catch (error) {
      setInstallResult({
        success: false,
        message: (error as Error).message,
        steps: []
      })
    } finally {
      setInstalling(false)
    }
  }

  const handleRefreshAfterInstall = () => {
    setInstallModalVisible(false)
    setInstallResult(null)
    checkEnvironment()
  }

  const handleUploadOfflinePackage = async (file: File) => {
    setUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64Content = Buffer.from(arrayBuffer).toString('base64')
      
      const result = await window.electronAPI.server.uploadOfflinePackage(serverId, file.name, base64Content)
      
      if (result.success) {
        message.success(t('environment.uploadSuccess'))
        setUploadModalVisible(false)
        checkEnvironment()
      } else {
        message.error(result.message || t('environment.uploadFailed'))
      }
    } catch (error) {
      message.error((error as Error).message || t('environment.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const checkEnvironment = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.server.checkSystemEnvironment(serverId, {
        minMemoryGB: 1,
        minDiskGB: 5,
        minCpuCores: 1,
        requiredPorts: [22, 80, 443, 2375, 2376, 8080]
      })
      setCheckResult(result)
    } catch (error) {
      console.error('Failed to check environment:', error)
      setCheckResult({
        systemInfo: null,
        hardwareInfo: null,
        networkInfo: null,
        requiredPorts: [],
        networkOk: false,
        systemOk: false,
        hardwareOk: false,
        dockerOk: false,
        error: (error as Error).message
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkEnvironment()
  }, [serverId])

  if (loading) {
    return (
      <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} tip={t('environment.checking')} />
    )
  }

  if (!checkResult) {
    return null
  }

  const isAllOk = checkResult.systemOk && checkResult.hardwareOk && checkResult.networkOk && checkResult.dockerOk

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircleOutlined style={{ color: '#34C759' }} />
    ) : (
      <CloseCircleOutlined style={{ color: '#FF3B30' }} />
    )
  }

  const getStatusTag = (status: boolean, text?: string) => {
    return status ? (
      <Tag color="success">{text || t('environment.statusOK')}</Tag>
    ) : (
      <Tag color="error">{text || t('environment.statusFailed')}</Tag>
    )
  }

  const renderSystemInfo = (info: SystemInfo, networkInfo?: NetworkInfo) => (
    <Card title={<Space><CloudServerOutlined /> {t('environment.systemInfo')}</Space>} bordered={false}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={t('environment.osName')}>{info.osName}</Descriptions.Item>
        <Descriptions.Item label={t('environment.osVersion')}>{info.osVersion}</Descriptions.Item>
        <Descriptions.Item label={t('environment.kernel')}>{info.kernel}</Descriptions.Item>
        <Descriptions.Item label={t('environment.architecture')}>{info.architecture}</Descriptions.Item>
        <Descriptions.Item label={t('environment.hostname')}>{info.hostname}</Descriptions.Item>
        <Descriptions.Item label={t('environment.uptime')}>{info.uptime}</Descriptions.Item>
        {networkInfo && (
          <>
            <Descriptions.Item label={t('environment.ipAddresses')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {networkInfo.ipAddresses.map((ip: string, index: number) => (
                  <Tag key={index} color="blue">{ip}</Tag>
                ))}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label={t('environment.internetConnectivity')}>
              <Space>
                {getStatusIcon(networkInfo.internetConnected)}
                {getStatusTag(networkInfo.internetConnected, networkInfo.internetConnected ? t('environment.connected') : t('environment.disconnected'))}
              </Space>
            </Descriptions.Item>
          </>
        )}
      </Descriptions>
    </Card>
  )

  const renderHardwareInfo = (info: HardwareInfo) => (
    <Card title={<Space><DashboardOutlined /> {t('environment.hardwareInfo')}</Space>} bordered={false}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={t('environment.cpuModel')}>{info.cpuModel}</Descriptions.Item>
        <Descriptions.Item label={t('environment.cpuCores')}>
          {info.cpuCores} {t('environment.cores')}
        </Descriptions.Item>
      </Descriptions>
      
      <div style={{ marginTop: 16 }}>
        <Title level={5}>{t('environment.memory')}</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress
            percent={info.memoryPercent}
            showInfo={false}
            strokeColor={{
              '0%': '#34C759',
              '75%': '#FF9500',
              '100%': '#FF3B30'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">{t('environment.used')}: {info.memoryUsed}</Text>
            <Text type="secondary">{t('environment.total')}: {info.memoryTotal}</Text>
          </div>
        </Space>
      </div>

      <div style={{ marginTop: 16 }}>
        <Title level={5}>{t('environment.disk')}</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress
            percent={info.diskPercent}
            showInfo={false}
            strokeColor={{
              '0%': '#34C759',
              '80%': '#FF9500',
              '100%': '#FF3B30'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">{t('environment.used')}: {info.diskUsed}</Text>
            <Text type="secondary">{t('environment.total')}: {info.diskTotal}</Text>
          </div>

          {/* 分区明细 */}
          {info.diskPartitions && info.diskPartitions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ fontSize: 12, color: '#8e8e93' }}>
                {t('environment.partitions')} ({info.diskPartitions.length})
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {info.diskPartitions.map((partition, index) => (
                  <div key={index}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <Space size={6}>
                        <Text style={{ fontSize: 12 }}>{partition.mountPoint}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{partition.device}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {partition.used} / {partition.total} ({partition.percent}%)
                      </Text>
                    </div>
                    <Progress
                      percent={partition.percent}
                      showInfo={false}
                      size="small"
                      strokeColor={{
                        '0%': '#34C759',
                        '80%': '#FF9500',
                        '100%': '#FF3B30'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Space>
      </div>
    </Card>
  )

  const renderPortInfo = (ports: PortInfo[]) => (
    <Card title={<Space><SettingOutlined /> {t('environment.portStatus')}</Space>} bordered={false}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {ports.map((port) => (
          <div
            key={port.port}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 8,
              backgroundColor: port.isOpen ? '#f6ffed' : '#fff2f0',
              borderRadius: 4,
              border: `1px solid ${port.isOpen ? '#b7eb8f' : '#ffccc7'}`
            }}
          >
            <div>
              <Text>{port.port}</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                ({port.service})
              </Text>
            </div>
            {getStatusIcon(port.isOpen)}
          </div>
        ))}
      </div>
    </Card>
  )

  const renderDockerInfo = () => {
    if (!checkResult) return null

    const { dockerInstalled, dockerRunning, dockerVersion, composeInstalled, composeVersion } = checkResult
    
    const cleanVersion = (version: string) => {
      if (!version) return ''
      const lines = version.trim().split('\n')
      const firstLine = lines[0] || ''
      const match = firstLine.match(/(\d+\.\d+\.\d+)/)
      return match ? match[1] : firstLine.substring(0, 20)
    }

    return (
      <Card title={<Space><FileTextOutlined /> {t('environment.dockerInfo')}</Space>} bordered={false}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={
            <Space>
              {getStatusIcon(dockerInstalled)}
              {t('environment.dockerInstalled')}
            </Space>
          }>
            {dockerInstalled ? (
              <Space>
                {getStatusTag(true)}
                <Text type="secondary">v{cleanVersion(dockerVersion)}</Text>
              </Space>
            ) : (
              <Space>
                {getStatusTag(false)}
                <Text type="secondary">{t('environment.notInstalled')}</Text>
              </Space>
            )}
          </Descriptions.Item>

          <Descriptions.Item label={
            <Space>
              {getStatusIcon(dockerRunning)}
              {t('environment.dockerRunning')}
            </Space>
          }>
            {getStatusTag(dockerRunning, dockerRunning ? t('environment.statusOK') : t('environment.notRunning'))}
          </Descriptions.Item>

          <Descriptions.Item label={
            <Space>
              {getStatusIcon(composeInstalled)}
              {t('environment.composeInstalled')}
            </Space>
          }>
            {composeInstalled ? (
              <Space>
                {getStatusTag(true)}
                <Text type="secondary">v{cleanVersion(composeVersion)}</Text>
              </Space>
            ) : (
              <Space>
                {getStatusTag(false)}
                <Text type="secondary">{t('environment.notInstalled')}</Text>
              </Space>
            )}
          </Descriptions.Item>

          <Descriptions.Item label={
            <Space>
              {getStatusIcon(checkResult.dockerOk)}
              {t('environment.dockerEnvironment')}
            </Space>
          }>
            {getStatusTag(checkResult.dockerOk)}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    )
  }

  return (
    <div>
      {checkResult.error && (
        <Alert
          type="error"
          message={t('environment.checkFailed')}
          description={checkResult.error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {isAllOk && !checkResult.error && (
        <Alert
          type="success"
          message={t('environment.allPassed')}
          description={t('environment.allPassedDescription')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {checkResult.systemInfo && renderSystemInfo(checkResult.systemInfo, checkResult.networkInfo)}
        {checkResult.hardwareInfo && renderHardwareInfo(checkResult.hardwareInfo)}
        {checkResult.requiredPorts.length > 0 && renderPortInfo(checkResult.requiredPorts)}
        {renderDockerInfo()}
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Space>
          {!isAllOk && (
            <>
              <Button 
                icon={<UploadOutlined />} 
                onClick={() => setUploadModalVisible(true)}
                loading={uploading}
              >
                {t('environment.uploadPackage')}
              </Button>
              <Button 
                icon={<ToolOutlined />} 
                onClick={handleInstallDependencies} 
                type="primary"
                loading={installing}
              >
                {t('environment.installDependencies')}
              </Button>
            </>
          )}
          <Button icon={<ReloadOutlined />} onClick={checkEnvironment} loading={loading}>
            {t('environment.recheck')}
          </Button>
        </Space>
      </div>

      <Modal
        title={t('environment.installDependencies')}
        visible={installModalVisible}
        footer={null}
        width={600}
        closable={!installing}
        maskClosable={false}
      >
        {installing ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
            <p style={{ marginTop: 16 }}>{t('environment.installing')}</p>
          </div>
        ) : installResult ? (
          <div>
            {installResult.success ? (
              <Alert
                type="success"
                message={installResult.message}
                showIcon
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert
                type="error"
                message={installResult.message}
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            
            <Steps current={installResult.steps.length} direction="vertical">
              {installResult.steps.map((step, index) => (
                <Steps.Step
                  key={index}
                  title={step.step}
                  status={step.success ? 'finish' : 'error'}
                  description={
                    <div>
                      <Tag color={step.success ? 'success' : 'error'}>
                        {step.success ? t('environment.success') : t('environment.failed')}
                      </Tag>
                      {step.output && (
                        <p style={{ marginTop: 8, fontSize: 12, color: '#666', wordBreak: 'break-all' }}>
                          {step.output}
                        </p>
                      )}
                    </div>
                  }
                />
              ))}
            </Steps>

            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setInstallModalVisible(false)}>
                  {t('environment.close')}
                </Button>
                <Button 
                  type="primary" 
                  onClick={handleRefreshAfterInstall}
                  icon={<ReloadOutlined />}
                >
                  {t('environment.recheck')}
                </Button>
              </Space>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={t('environment.uploadPackage')}
        visible={uploadModalVisible}
        footer={null}
        width={500}
        closable={!uploading}
        maskClosable={false}
      >
        <div style={{ padding: 20 }}>
          <Alert
            type="info"
            message={t('environment.uploadPackageInfo')}
            description={t('environment.uploadPackageDescription')}
            showIcon
            style={{ marginBottom: 20 }}
          />
          
          <Upload
            beforeUpload={(file) => {
              handleUploadOfflinePackage(file)
              return false
            }}
            accept=".deb,.rpm,.tar,.tar.gz,.zip"
            showUploadList={false}
            disabled={uploading}
          >
            <Button 
              icon={<FileZipOutlined />} 
              type="primary" 
              block 
              loading={uploading}
            >
              {uploading ? t('environment.uploading') : t('environment.selectPackage')}
            </Button>
          </Upload>
          
          <div style={{ marginTop: 16, textAlign: 'center', color: '#666', fontSize: 12 }}>
            <p>{t('environment.supportedFormats')}</p>
            <p>.deb, .rpm, .tar, .tar.gz, .zip</p>
          </div>
          
          <div style={{ marginTop: 20, textAlign: 'right' }}>
            <Button onClick={() => setUploadModalVisible(false)} disabled={uploading}>
              {t('environment.cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default SystemEnvironmentStatus
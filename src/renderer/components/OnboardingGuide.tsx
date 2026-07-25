import React, { useState, useEffect, useCallback } from 'react'
import {
  Modal,
  Button,
  Space,
  Typography,
  Steps,
  Card,
  Image,
  Divider,
  Checkbox,
  Badge,
  List,
  Alert
} from 'antd'
import {
  RocketOutlined,
  CloudServerOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  RightOutlined,
  LeftOutlined,
  CloseOutlined,
  QuestionCircleOutlined,
  BulbOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

const { Text, Title, Paragraph } = Typography

interface OnboardingGuideProps {
  visible: boolean
  onClose: () => void
}

interface GuideStep {
  title: string
  description: string
  content: React.ReactNode
  path?: string
  icon: React.ReactNode
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ visible, onClose }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // 引导步骤配置
  const steps: GuideStep[] = [
    {
      title: t('onboarding.welcomeTitle'),
      description: t('onboarding.welcomeDesc'),
      icon: <RocketOutlined />,
      content: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>{t('onboarding.whatIsThisTitle')}</Text>
              <Paragraph style={{ marginBottom: 0 }}>
                {t('onboarding.whatIsThisDesc')}
              </Paragraph>
            </Space>
          </Card>
          <Card size="small">
            <Text strong>{t('onboarding.featuresTitle')}</Text>
            <List
              size="small"
              dataSource={[
                t('onboarding.feature1'),
                t('onboarding.feature2'),
                t('onboarding.feature3'),
                t('onboarding.feature4'),
                t('onboarding.feature5')
              ]}
              renderItem={item => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text>{item}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      )
    },
    {
      title: t('onboarding.step1Title'),
      description: t('onboarding.step1Desc'),
      icon: <CloudServerOutlined />,
      path: '/servers',
      content: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message={t('onboarding.step1Tip')}
          />
          <Card size="small">
            <Text strong>{t('onboarding.step1Actions')}</Text>
            <List
              size="small"
              dataSource={[
                t('onboarding.step1Action1'),
                t('onboarding.step1Action2'),
                t('onboarding.step1Action3')
              ]}
              renderItem={item => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Text type="secondary">• {item}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      )
    },
    {
      title: t('onboarding.step2Title'),
      description: t('onboarding.step2Desc'),
      icon: <FileTextOutlined />,
      path: '/templates',
      content: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message={t('onboarding.step2Tip')}
          />
          <Card size="small">
            <Text strong>{t('onboarding.step2Actions')}</Text>
            <List
              size="small"
              dataSource={[
                t('onboarding.step2Action1'),
                t('onboarding.step2Action2'),
                t('onboarding.step2Action3')
              ]}
              renderItem={item => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Text type="secondary">• {item}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      )
    },
    {
      title: t('onboarding.step3Title'),
      description: t('onboarding.step3Desc'),
      icon: <AppstoreOutlined />,
      path: '/apps',
      content: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message={t('onboarding.step3Tip')}
          />
          <Card size="small">
            <Text strong>{t('onboarding.step3Actions')}</Text>
            <List
              size="small"
              dataSource={[
                t('onboarding.step3Action1'),
                t('onboarding.step3Action2'),
                t('onboarding.step3Action3'),
                t('onboarding.step3Action4')
              ]}
              renderItem={item => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Text type="secondary">• {item}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      )
    },
    {
      title: t('onboarding.step4Title'),
      description: t('onboarding.step4Desc'),
      icon: <BulbOutlined />,
      content: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Card size="small">
            <Text strong>{t('onboarding.tipsTitle')}</Text>
            <List
              size="small"
              dataSource={[
                t('onboarding.tip1'),
                t('onboarding.tip2'),
                t('onboarding.tip3'),
                t('onboarding.tip4')
              ]}
              renderItem={item => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Space>
                    <BulbOutlined style={{ color: '#faad14' }} />
                    <Text>{item}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
          <Alert
            type="success"
            showIcon
            message={t('onboarding.congratsMessage')}
          />
        </Space>
      )
    }
  ]

  // 处理下一步
  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      // 如果有指定路径，导航到该页面
      if (steps[nextStep].path) {
        navigate(steps[nextStep].path!)
      }
    } else {
      handleComplete()
    }
  }, [currentStep, steps, navigate])

  // 处理上一步
  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1
      setCurrentStep(prevStep)
      if (steps[prevStep].path) {
        navigate(steps[prevStep].path!)
      }
    }
  }, [currentStep, steps, navigate])

  // 处理完成
  const handleComplete = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem('onboardingCompleted', 'true')
    }
    onClose()
    setCurrentStep(0)
  }, [dontShowAgain, onClose])

  // 跳转到指定步骤
  const handleGoToStep = useCallback((index: number) => {
    setCurrentStep(index)
    if (steps[index].path) {
      navigate(steps[index].path!)
    }
  }, [steps, navigate])

  // 关闭引导
  const handleClose = useCallback(() => {
    onClose()
    setCurrentStep(0)
  }, [onClose])

  const currentStepData = steps[currentStep]

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      style={{ top: 60 }}
      styles={{ body: { padding: 0 } }}
      closeIcon={null}
    >
      {/* Header */}
      <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Badge count={<QuestionCircleOutlined style={{ color: '#1890ff' }} />}>
              <Card size="small" style={{ background: '#e6f7ff', border: 'none' }}>
                {currentStepData.icon}
              </Card>
            </Badge>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {currentStepData.title}
              </Title>
              <Text type="secondary">{currentStepData.description}</Text>
            </div>
          </Space>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={handleClose}
          />
        </Space>
      </div>

      {/* Progress Steps */}
      <div style={{ padding: '16px 24px', background: '#fafafa' }}>
        <Steps
          current={currentStep}
          size="small"
          onChange={handleGoToStep}
          items={steps.map((step, index) => ({
            title: step.title,
            icon: step.icon
          }))}
        />
      </div>

      {/* Content */}
      <div style={{ padding: '24px', minHeight: 300, maxHeight: 400, overflow: 'auto' }}>
        {currentStepData.content}
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            {currentStep > 0 && (
              <Button
                icon={<LeftOutlined />}
                onClick={handlePrev}
              >
                {t('onboarding.prev')}
              </Button>
            )}
            {currentStep < steps.length - 1 ? (
              <Button
                type="primary"
                icon={<RightOutlined />}
                onClick={handleNext}
              >
                {t('onboarding.next')}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleComplete}
              >
                {t('onboarding.complete')}
              </Button>
            )}
          </Space>
          <Space>
            <Checkbox
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            >
              {t('onboarding.dontShowAgain')}
            </Checkbox>
            <Divider type="vertical" />
            <Text type="secondary">
              {currentStep + 1} / {steps.length}
            </Text>
          </Space>
        </Space>
      </div>
    </Modal>
  )
}

export default OnboardingGuide

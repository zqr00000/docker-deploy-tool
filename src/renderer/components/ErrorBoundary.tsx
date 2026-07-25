import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Result, Button, Typography, Collapse } from 'antd'
import { ReloadOutlined, BugOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle="An unexpected error occurred. Please try again or reload the page."
          icon={<BugOutlined />}
          extra={[
            <Button key="reset" type="primary" icon={<ReloadOutlined />} onClick={this.handleReset}>
              Try Again
            </Button>,
            <Button key="reload" onClick={this.handleReload}>
              Reload Page
            </Button>
          ]}
        >
          <div style={{ textAlign: 'left', maxWidth: 600, margin: '0 auto' }}>
            {this.state.error && (
              <Collapse
                items={[
                  {
                    key: '1',
                    label: 'Error Details',
                    children: (
                      <>
                        <Paragraph>
                          <Text type="danger" strong>
                            {this.state.error.name}:
                          </Text>{' '}
                          {this.state.error.message}
                        </Paragraph>
                        {this.state.errorInfo && (
                          <Paragraph>
                            <pre
                              style={{
                                background: '#f5f5f5',
                                padding: 16,
                                borderRadius: 4,
                                maxHeight: 200,
                                overflow: 'auto',
                                fontSize: 12
                              }}
                            >
                              {this.state.errorInfo.componentStack}
                            </pre>
                          </Paragraph>
                        )}
                      </>
                    )
                  }
                ]}
              />
            )}
          </div>
        </Result>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

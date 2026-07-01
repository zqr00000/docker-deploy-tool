import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Card, Select, Button, Space, Typography, message, Spin, Tag, Empty, Row, Col, Modal } from 'antd'
import { PlusOutlined, CloseOutlined, ReloadOutlined, CodeOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const { Title, Text } = Typography

interface TerminalTab {
  sessionId: string
  containerId: string
  containerName: string
  serverId: string
  serverName: string
  terminal: Terminal
  fitAddon: FitAddon
  elementId: string
}

interface ContainerOption {
  id: string
  name: string
  image: string
  status: string
}

interface ServerOption {
  id: string
  name: string
  host: string
}

const ContainerTerminalPage: React.FC = () => {
  const { t } = useTranslation()
  const [servers, setServers] = useState<ServerOption[]>([])
  const [containers, setContainers] = useState<ContainerOption[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>()
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabKey, setActiveTabKey] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadingContainers, setLoadingContainers] = useState(false)
  const tabsRef = useRef<TerminalTab[]>(tabs)
  const terminalContainersRef = useRef<Map<string, HTMLDivElement>>(new Map())

  // 保持 ref 同步
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  // 监听终端数据事件
  useEffect(() => {
    const handleTerminalData = (sessionId: string, data: string) => {
      const tab = tabsRef.current.find(t => t.sessionId === sessionId)
      if (tab) {
        tab.terminal.write(data)
      }
    }

    const handleTerminalClose = (sessionId: string) => {
      setTabs(prev => {
        const newTabs = prev.filter(t => t.sessionId !== sessionId)
        if (activeTabKey === sessionId && newTabs.length > 0) {
          setActiveTabKey(newTabs[newTabs.length - 1].sessionId)
        }
        return newTabs
      })
    }

    const handleTerminalError = (sessionId: string, error: string) => {
      const tab = tabsRef.current.find(t => t.sessionId === sessionId)
      if (tab) {
        tab.terminal.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`)
      }
    }

    window.electronAPI.terminal.onData(handleTerminalData)
    window.electronAPI.terminal.onClose(handleTerminalClose)
    window.electronAPI.terminal.onError(handleTerminalError)
  }, [activeTabKey])

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    try {
      const serverList = await window.electronAPI.server.getAll()
      const onlineServers = serverList.filter(s => s.status === 'online')
      setServers(onlineServers.map(s => ({ id: s.id, name: s.name, host: s.host })))
    } catch (error) {
      message.error('Failed to load servers')
    }
  }, [])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  // 加载容器列表
  const loadContainers = useCallback(async (serverId: string) => {
    setLoadingContainers(true)
    try {
      // 获取所有应用
      const apps = await window.electronAPI.app.getByServerId(serverId)
      const allContainers: ContainerOption[] = []

      for (const app of apps) {
        if (app.projectPath) {
          const containers = await window.electronAPI.app.getContainers(serverId, app.projectPath)
          allContainers.push(...containers.map(c => ({
            id: c.id,
            name: c.name,
            image: c.image,
            status: c.status
          })))
        }
      }

      setContainers(allContainers)
    } catch (error) {
      message.error('Failed to load containers')
    } finally {
      setLoadingContainers(false)
    }
  }, [])

  // 服务器选择变化
  const handleServerChange = (serverId: string) => {
    setSelectedServerId(serverId)
    setContainers([])
    loadContainers(serverId)
  }

  // 打开新终端标签页
  const openNewTerminal = async (containerId: string, containerName: string) => {
    if (!selectedServerId) {
      message.warning(t('terminal.selectServerFirst'))
      return
    }

    setLoading(true)
    try {
      const server = servers.find(s => s.id === selectedServerId)
      const cols = 80
      const rows = 24

      const result = await window.electronAPI.terminal.open(selectedServerId, containerId, cols, rows)

      if (result.success && result.sessionId) {
        const sessionId = result.sessionId
        const elementId = `terminal-${sessionId}`

        // 创建 tab
        const newTab: TerminalTab = {
          sessionId,
          containerId,
          containerName,
          serverId: selectedServerId,
          serverName: server?.name || '',
          terminal: new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            theme: {
              background: '#1e1e1e',
              foreground: '#d4d4d4',
              cursor: '#d4d4d4',
              selection: '#264f78',
              black: '#000000',
              red: '#cd3131',
              green: '#0dbc79',
              yellow: '#e5e510',
              blue: '#2472c8',
              magenta: '#bc3fbc',
              cyan: '#11a8cd',
              white: '#e5e5e5'
            },
            scrollback: 10000,
            cols,
            rows
          }),
          fitAddon: new FitAddon(),
          elementId
        }

        newTab.terminal.loadAddon(newTab.fitAddon)

        setTabs(prev => [...prev, newTab])
        setActiveTabKey(sessionId)

        // 延迟挂载终端到 DOM
        setTimeout(() => {
          const container = terminalContainersRef.current.get(sessionId)
          if (container) {
            newTab.terminal.open(container)
            newTab.fitAddon.fit()

            // 获取实际 cols/rows
            const dims = newTab.fitAddon.proposeDimensions()
            if (dims) {
              newTab.terminal.resize(dims.cols, dims.rows)
              window.electronAPI.terminal.resize(sessionId, dims.cols, dims.rows)
            }

            // 监听用户输入
            newTab.terminal.onData((data) => {
              window.electronAPI.terminal.write(sessionId, data)
            })

            // 监听窗口大小变化
            const handleResize = () => {
              newTab.fitAddon.fit()
              const newDims = newTab.fitAddon.proposeDimensions()
              if (newDims) {
                window.electronAPI.terminal.resize(sessionId, newDims.cols, newDims.rows)
              }
            }
            window.addEventListener('resize', handleResize)
          }
        }, 100)

        message.success(t('terminal.openSuccess'))
      } else {
        message.error(result.message || t('terminal.openFailed'))
      }
    } catch (error) {
      message.error(`Error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  // 关闭终端标签页
  const closeTerminalTab = async (sessionId: string) => {
    try {
      await window.electronAPI.terminal.close(sessionId)
    } catch (e) {
      // ignore
    }

    setTabs(prev => {
      const tab = prev.find(t => t.sessionId === sessionId)
      if (tab) {
        tab.terminal.dispose()
      }
      const newTabs = prev.filter(t => t.sessionId !== sessionId)
      terminalContainersRef.current.delete(sessionId)

      // 如果关闭的是当前活动 tab，切换到其他 tab
      if (activeTabKey === sessionId && newTabs.length > 0) {
        setActiveTabKey(newTabs[newTabs.length - 1].sessionId)
      }
      return newTabs
    })
  }

  // 刷新容器列表
  const handleRefreshContainers = () => {
    if (selectedServerId) {
      loadContainers(selectedServerId)
    }
  }

  // 组件卸载时关闭所有终端
  useEffect(() => {
    return () => {
      tabsRef.current.forEach(tab => {
        tab.terminal.dispose()
        window.electronAPI.terminal.close(tab.sessionId).catch(() => {})
      })
    }
  }, [])

  // 当活动 tab 变化时，重新 fit 终端
  useEffect(() => {
    if (activeTabKey) {
      setTimeout(() => {
        const tab = tabs.find(t => t.sessionId === activeTabKey)
        if (tab) {
          tab.fitAddon.fit()
          const dims = tab.fitAddon.proposeDimensions()
          if (dims) {
            window.electronAPI.terminal.resize(tab.sessionId, dims.cols, dims.rows)
          }
        }
      }, 50)
    }
  }, [activeTabKey, tabs])

  // 设置终端容器 ref
  const setTerminalContainer = (sessionId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      terminalContainersRef.current.set(sessionId, el)
    } else {
      terminalContainersRef.current.delete(sessionId)
    }
  }

  // 打开新终端的模态框
  const [openNewModal, setOpenNewModal] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | undefined>()

  const handleOpenNewTerminal = () => {
    if (!selectedServerId) {
      message.warning(t('terminal.selectServerFirst'))
      return
    }
    if (containers.length === 0) {
      message.warning(t('terminal.noContainers'))
      return
    }
    setSelectedContainerId(undefined)
    setOpenNewModal(true)
  }

  const handleConfirmOpenTerminal = () => {
    if (selectedContainerId) {
      const container = containers.find(c => c.id === selectedContainerId)
      if (container) {
        openNewTerminal(container.id, container.name)
      }
    }
    setOpenNewModal(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <CodeOutlined style={{ marginRight: 8 }} />
            {t('terminal.title')}
          </Title>
          <Text type="secondary">{t('terminal.subtitle')}</Text>
        </div>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="middle" wrap>
          <Text strong>{t('terminal.selectServer')}:</Text>
          <Select
            style={{ minWidth: 200 }}
            placeholder={t('terminal.selectServerPlaceholder')}
            value={selectedServerId}
            onChange={handleServerChange}
            options={servers.map(s => ({
              value: s.id,
              label: `${s.name} (${s.host})`
            }))}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefreshContainers}
            disabled={!selectedServerId}
            loading={loadingContainers}
          >
            {t('terminal.refreshContainers')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenNewTerminal}
            disabled={!selectedServerId || containers.length === 0}
            loading={loading}
          >
            {t('terminal.newTerminal')}
          </Button>
        </Space>
      </Card>

      {tabs.length === 0 ? (
        <Card>
          <Empty
            description={t('terminal.emptyDescription')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <Card
          size="small"
          style={{ padding: 0 }}
          bodyStyle={{ padding: 0 }}
        >
          {/* 标签栏 */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--app-border-color)',
            background: 'var(--app-hover-bg)',
            overflowX: 'auto'
          }}>
            {tabs.map(tab => (
              <div
                key={tab.sessionId}
                onClick={() => setActiveTabKey(tab.sessionId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRight: '1px solid var(--app-border-color)',
                  background: activeTabKey === tab.sessionId ? 'var(--app-content-bg)' : 'transparent',
                  borderBottom: activeTabKey === tab.sessionId ? '2px solid #1677ff' : '2px solid transparent',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  minWidth: 0
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#52c41a',
                  flexShrink: 0
                }} />
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tab.containerName}
                </span>
                <CloseOutlined
                  style={{ fontSize: 10, opacity: 0.6 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTerminalTab(tab.sessionId)
                  }}
                />
              </div>
            ))}
          </div>

          {/* 终端容器 */}
          {tabs.map(tab => (
            <div
              key={tab.sessionId}
              style={{
                display: activeTabKey === tab.sessionId ? 'block' : 'none',
                height: 'calc(100vh - 320px)',
                minHeight: 400,
                background: '#1e1e1e'
              }}
            >
              <div
                ref={setTerminalContainer(tab.sessionId)}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          ))}
        </Card>
      )}

      {/* 打开新终端的模态框 */}
      <Modal
        title={t('terminal.newTerminal')}
        open={openNewModal}
        onOk={handleConfirmOpenTerminal}
        onCancel={() => setOpenNewModal(false)}
        okButtonProps={{ disabled: !selectedContainerId }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>{t('terminal.selectContainer')}:</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              placeholder={t('terminal.selectContainerPlaceholder')}
              value={selectedContainerId}
              onChange={setSelectedContainerId}
              options={containers
                .filter(c => !tabs.some(t => t.containerId === c.id && t.serverId === selectedServerId))
                .map(c => ({
                  value: c.id,
                  label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{c.name}</span>
                      <Space size={4}>
                        <Tag color="blue" style={{ fontSize: 10 }}>{c.image}</Tag>
                        <Tag color={c.status.includes('running') || c.status.includes('Up') ? 'green' : 'default'} style={{ fontSize: 10 }}>
                          {c.status}
                        </Tag>
                      </Space>
                    </div>
                  )
                }))}
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}

export default ContainerTerminalPage

import log from 'electron-log'
import { sshService } from '../ssh'
import { validateDockerRef, isValidIpOrCidr, shQuote } from '../utils/shell'

export interface NetworkInfo {
  id: string
  name: string
  driver: string
  scope: string
  subnet: string
  gateway: string
  createdAt: string
  internal: boolean
  labels: string
}

export interface NetworkDetail {
  id: string
  name: string
  driver: string
  scope: string
  created: string
  internal: boolean
  enableIPv6: boolean
  ipam: {
    driver: string
    config: Array<{
      subnet: string
      gateway: string
      ipRange?: string
    }>
    options?: Record<string, string>
  }
  options: Record<string, string>
  labels: Record<string, string>
  containers: Array<{
    name: string
    id: string
    ipv4Address: string
    ipv6Address: string
    macAddress: string
  }>
}

class DockerNetworksService {
  /**
   * 获取网络列表
   */
  async getNetworks(serverId: string): Promise<NetworkInfo[]> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        'docker network ls --format "{{json .}}"'
      )

      if (!result.success) {
        log.error(`Failed to get networks: ${result.stderr}`)
        return []
      }

      const networks: NetworkInfo[] = []
      const lines = result.stdout.trim().split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          // docker network ls --format 返回的字段: ID, Name, Driver, Scope, Labels
          networks.push({
            id: parsed.ID || '',
            name: parsed.Name || '',
            driver: parsed.Driver || 'bridge',
            scope: parsed.Scope || 'local',
            subnet: '',
            gateway: '',
            createdAt: '',
            internal: false,
            labels: parsed.Labels || ''
          })
        } catch (parseError) {
          log.warn(`Failed to parse network line: ${line}`, parseError)
        }
      }

      // 单次批量 inspect 获取全部网络的详细信息（IPAM 子网/网关、创建时间、internal）
      // 此前对每个网络串行执行 3 条 inspect，N 个网络 = 3N 次 SSH 往返，列表加载秒级卡顿
      if (networks.length > 0) {
        try {
          const detailResult = await sshService.executeCommand(
            serverId,
            `docker network inspect $(docker network ls -q) --format '{{json .}}' 2>/dev/null || echo "[]"`
          )
          if (detailResult.success && detailResult.stdout.trim()) {
            const details = JSON.parse(detailResult.stdout.trim())
            if (Array.isArray(details)) {
              const detailById = new Map<string, any>(details.map((d: any) => [d.Id, d]))
              for (const network of networks) {
                const d = detailById.get(network.id)
                if (!d) continue
                const ipamConfig = d.IPAM?.Config?.[0]
                if (ipamConfig) {
                  network.subnet = ipamConfig.Subnet || ''
                  network.gateway = ipamConfig.Gateway || ''
                }
                network.createdAt = d.Created || ''
                network.internal = !!d.Internal
              }
            }
          }
        } catch {
          // 批量获取失败时保留 ls 的基础信息，不影响列表展示
        }
      }

      return networks
    } catch (error) {
      log.error('getNetworks error:', error)
      return []
    }
  }

  /**
   * 创建网络
   */
  async createNetwork(
    serverId: string,
    name: string,
    driver: string = 'bridge',
    subnet?: string,
    gateway?: string,
    internal: boolean = false,
    labels?: Record<string, string>,
    options?: Record<string, string>,
    ipamOptions?: Record<string, string>,
    enableIPv6: boolean = false,
    ipRange?: string,
    auxAddresses?: Record<string, string>
  ): Promise<{ success: boolean; message: string; networkId?: string }> {
    try {
      // 所有参数来自渲染层输入，拼入 shell 前统一校验（防命令注入）
      const invalidName = validateDockerRef(name, '网络名称')
      if (invalidName) return { success: false, message: invalidName }
      if (driver && driver !== 'bridge') {
        const invalidDriver = validateDockerRef(driver, '网络驱动')
        if (invalidDriver) return { success: false, message: invalidDriver }
      }
      if (subnet && !isValidIpOrCidr(subnet)) {
        return { success: false, message: `子网格式非法: ${subnet}` }
      }
      if (gateway && !isValidIpOrCidr(gateway)) {
        return { success: false, message: `网关格式非法: ${gateway}` }
      }
      if (ipRange && !isValidIpOrCidr(ipRange)) {
        return { success: false, message: `IP 范围格式非法: ${ipRange}` }
      }

      let command = `docker network create`

      if (driver && driver !== 'bridge') {
        command += ` --driver ${shQuote(driver)}`
      }

      // 添加子网
      if (subnet) {
        command += ` --subnet ${subnet}`
      }

      // 添加网关
      if (gateway) {
        command += ` --gateway ${gateway}`
      }

      // 添加 IP 范围
      if (ipRange) {
        command += ` --ip-range ${ipRange}`
      }

      // 内部网络
      if (internal) {
        command += ` --internal`
      }

      // 启用 IPv6
      if (enableIPv6) {
        command += ` --ipv6`
      }

      // 添加标签
      if (labels) {
        for (const [key, value] of Object.entries(labels)) {
          command += ` --label ${shQuote(`${key}=${value}`)}`
        }
      }

      // 添加驱动选项
      if (options) {
        for (const [key, value] of Object.entries(options)) {
          command += ` --opt ${shQuote(`${key}=${value}`)}`
        }
      }

      // 添加 IPAM 选项
      if (ipamOptions) {
        for (const [key, value] of Object.entries(ipamOptions)) {
          command += ` --ipam-opt ${shQuote(`${key}=${value}`)}`
        }
      }

      // 添加辅助地址
      if (auxAddresses) {
        for (const [key, value] of Object.entries(auxAddresses)) {
          command += ` --aux-address ${shQuote(`${key}=${value}`)}`
        }
      }

      command += ` ${name}`

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        const networkId = result.stdout.trim()
        return { success: true, message: `网络 ${name} 创建成功`, networkId }
      } else {
        return { success: false, message: result.stderr || '创建失败' }
      }
    } catch (error) {
      log.error('createNetwork error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 删除网络
   */
  async removeNetwork(serverId: string, networkId: string): Promise<{ success: boolean; message: string }> {
    try {
      const command = `docker network rm ${networkId}`
      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        return { success: true, message: `网络 ${networkId} 删除成功` }
      } else {
        return { success: false, message: result.stderr || '删除失败' }
      }
    } catch (error) {
      log.error('removeNetwork error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 获取网络详情
   */
  async getNetworkInfo(serverId: string, networkId: string): Promise<NetworkDetail | null> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        `docker network inspect ${networkId}`
      )

      if (!result.success) {
        log.error(`Failed to inspect network ${networkId}: ${result.stderr}`)
        return null
      }

      try {
        const inspectData = JSON.parse(result.stdout)
        if (inspectData && inspectData.length > 0) {
          const data = inspectData[0]
          const containers: NetworkDetail['containers'] = []

          // 解析容器信息
          if (data.Containers) {
            for (const [id, containerInfo] of Object.entries(data.Containers)) {
              const info = containerInfo as Record<string, string>
              containers.push({
                name: info.Name || '',
                id: id,
                ipv4Address: info.IPv4Address || '',
                ipv6Address: info.IPv6Address || '',
                macAddress: info.MacAddress || ''
              })
            }
          }

          // 解析 IPAM 配置
          const ipamConfig: NetworkDetail['ipam']['config'] = []
          if (data.IPAM && data.IPAM.Config) {
            for (const config of data.IPAM.Config) {
              ipamConfig.push({
                subnet: config.Subnet || '',
                gateway: config.Gateway || '',
                ipRange: config.IPRange
              })
            }
          }

          return {
            id: data.Id || networkId,
            name: data.Name || '',
            driver: data.Driver || 'bridge',
            scope: data.Scope || 'local',
            created: data.Created || '',
            internal: data.Internal || false,
            enableIPv6: data.EnableIPv6 || false,
            ipam: {
              driver: data.IPAM?.Driver || 'default',
              config: ipamConfig,
              options: data.IPAM?.Options
            },
            options: data.Options || {},
            labels: data.Labels || {},
            containers
          }
        }
      } catch (parseError) {
        log.error(`Failed to parse network inspect output:`, parseError)
      }

      return null
    } catch (error) {
      log.error('getNetworkInfo error:', error)
      return null
    }
  }

  /**
   * 连接容器到网络
   */
  async connectContainer(
    serverId: string,
    networkId: string,
    containerId: string,
    ip?: string,
    ipv6?: string,
    aliases?: string[],
    links?: string[],
    linkLocalIPs?: string[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 参数来自渲染层输入，统一校验（防命令注入）
      for (const [label, value] of [['网络ID', networkId], ['容器ID', containerId]] as const) {
        const invalid = validateDockerRef(value, label)
        if (invalid) return { success: false, message: invalid }
      }
      if (ip && !isValidIpOrCidr(ip)) return { success: false, message: `IP 格式非法: ${ip}` }
      if (ipv6 && !isValidIpOrCidr(ipv6)) return { success: false, message: `IPv6 格式非法: ${ipv6}` }
      for (const alias of aliases || []) {
        const invalidAlias = validateDockerRef(alias, '别名')
        if (invalidAlias) return { success: false, message: invalidAlias }
      }
      for (const link of links || []) {
        const invalid = validateDockerRef(link, '链接')
        if (invalid) return { success: false, message: invalid }
      }
      for (const localIP of linkLocalIPs || []) {
        if (!isValidIpOrCidr(localIP)) return { success: false, message: `link-local IP 格式非法: ${localIP}` }
      }

      let command = `docker network connect`

      // 指定 IP 地址
      if (ip) {
        command += ` --ip ${ip}`
      }

      // 指定 IPv6 地址
      if (ipv6) {
        command += ` --ip6 ${ipv6}`
      }

      // 添加别名
      if (aliases && aliases.length > 0) {
        for (const alias of aliases) {
          command += ` --alias ${shQuote(alias)}`
        }
      }

      // 添加链接
      if (links && links.length > 0) {
        for (const link of links) {
          command += ` --link ${shQuote(link)}`
        }
      }

      // 添加本地链接地址
      if (linkLocalIPs && linkLocalIPs.length > 0) {
        for (const localIP of linkLocalIPs) {
          command += ` --link-local-ip ${localIP}`
        }
      }

      command += ` ${networkId} ${containerId}`

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        return { success: true, message: `容器 ${containerId} 已连接到网络 ${networkId}` }
      } else {
        return { success: false, message: result.stderr || '连接失败' }
      }
    } catch (error) {
      log.error('connectContainer error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 断开容器连接
   */
  async disconnectContainer(
    serverId: string,
    networkId: string,
    containerId: string,
    force: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    try {
      const invalidNetwork = validateDockerRef(networkId, '网络ID')
      if (invalidNetwork) return { success: false, message: invalidNetwork }
      const invalidContainer = validateDockerRef(containerId, '容器ID')
      if (invalidContainer) return { success: false, message: invalidContainer }

      let command = `docker network disconnect`
      if (force) {
        command += ` --force`
      }
      command += ` ${networkId} ${containerId}`

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        return { success: true, message: `容器 ${containerId} 已从网络 ${networkId} 断开` }
      } else {
        return { success: false, message: result.stderr || '断开失败' }
      }
    } catch (error) {
      log.error('disconnectContainer error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 清理未使用的网络
   */
  async pruneNetworks(serverId: string, force: boolean = true): Promise<{ success: boolean; deletedNetworks: string[]; message: string }> {
    try {
      let command = `docker network prune`
      if (force) {
        command += ` --force`
      }

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        const output = result.stdout + result.stderr
        const deletedNetworks: string[] = []

        // 解析 "Deleted Networks:" 部分
        const deletedMatch = output.match(/Deleted Networks:\s*\n([\s\S]*?)(?:\n\n|$)/i)
        if (deletedMatch) {
          const networkLines = deletedMatch[1].trim().split('\n')
          for (const line of networkLines) {
            const trimmed = line.trim()
            if (trimmed) {
              deletedNetworks.push(trimmed)
            }
          }
        }

        return {
          success: true,
          deletedNetworks,
          message: deletedNetworks.length > 0
            ? `已清理 ${deletedNetworks.length} 个未使用网络`
            : '没有可清理的未使用网络'
        }
      } else {
        return {
          success: false,
          deletedNetworks: [],
          message: result.stderr || '清理失败'
        }
      }
    } catch (error) {
      log.error('pruneNetworks error:', error)
      return {
        success: false,
        deletedNetworks: [],
        message: (error as Error).message
      }
    }
  }

  /**
   * 获取服务器上的所有容器（用于连接网络时选择）
   */
  async getContainersForNetwork(serverId: string): Promise<Array<{ id: string; name: string; status: string }>> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        'docker ps -a --format "{{json .}}"'
      )

      if (!result.success) {
        return []
      }

      const containers: Array<{ id: string; name: string; status: string }> = []
      const lines = result.stdout.trim().split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          containers.push({
            id: parsed.ID || '',
            name: parsed.Names || parsed.Name || '',
            status: parsed.Status || parsed.State || ''
          })
        } catch {
          // 忽略解析错误
        }
      }

      return containers
    } catch (error) {
      log.error('getContainersForNetwork error:', error)
      return []
    }
  }
}

export const dockerNetworksService = new DockerNetworksService()

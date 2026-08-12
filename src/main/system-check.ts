import log from 'electron-log'
import { sshService } from './ssh'

export interface SystemInfo {
  osName: string
  osVersion: string
  kernel: string
  architecture: string
  hostname: string
  uptime: string
}

export interface DiskPartition {
  device: string
  mountPoint: string
  total: string
  used: string
  percent: number
}

export interface HardwareInfo {
  cpuCores: number
  cpuModel: string
  memoryTotal: string
  memoryUsed: string
  memoryPercent: number
  diskTotal: string
  diskUsed: string
  diskPercent: number
  diskPartitions: DiskPartition[]
}

export interface NetworkInfo {
  hostname: string
  ipAddresses: string[]
  internetConnected: boolean
}

export interface PortInfo {
  port: number
  service: string
  isOpen: boolean
}

export interface SystemCheckResult {
  systemInfo: SystemInfo | null
  hardwareInfo: HardwareInfo | null
  networkInfo: NetworkInfo | null
  requiredPorts: PortInfo[]
  networkOk: boolean
  systemOk: boolean
  hardwareOk: boolean
  dockerOk: boolean
  dockerInstalled: boolean
  dockerRunning: boolean
  dockerVersion: string
  composeInstalled: boolean
  composeVersion: string
  error?: string
}

export interface HardwareRequirements {
  minMemoryGB?: number
  minDiskGB?: number
  minCpuCores?: number
  requiredPorts?: number[]
}

const DEFAULT_REQUIREMENTS: HardwareRequirements = {
  minMemoryGB: 1,
  minDiskGB: 5,
  minCpuCores: 1,
  requiredPorts: [22, 2375, 2376, 80, 443, 8080]
}

class SystemCheckService {
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  private parseMemoryInfo(output: string): { total: number; used: number } {
    const lines = output.split('\n')
    let total = 0
    let used = 0

    for (const line of lines) {
      if (line.includes('MemTotal:')) {
        const match = line.match(/(\d+)/)
        if (match) total = parseInt(match[1]) * 1024
      }
      if (line.includes('MemAvailable:')) {
        const match = line.match(/(\d+)/)
        if (match) used = total - parseInt(match[1]) * 1024
      }
    }

    return { total, used }
  }

  /**
   * 解析 df -kP 输出，提取所有物理磁盘分区
   * 输出格式: "Filesystem 1024-blocks Used Available Capacity Mounted on"
   */
  private parseDiskPartitions(dfOutput: string): Array<{ device: string; mountPoint: string; total: number; used: number }> {
    const partitions: Array<{ device: string; mountPoint: string; total: number; used: number }> = []
    const lines = dfOutput.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('Filesystem')) continue

      const parts = trimmed.split(/\s+/)
      if (parts.length >= 6) {
        const device = parts[0]
        const size = parseInt(parts[1])
        const used = parseInt(parts[2])
        const mountPoint = parts[5]

        // 只统计真实物理磁盘分区，排除 tmpfs/overlay 等虚拟文件系统
        if (device.startsWith('/dev/') && !isNaN(size) && size > 0 && !isNaN(used) && used >= 0) {
          partitions.push({
            device,
            mountPoint,
            total: size * 1024,
            used: used * 1024
          })
        }
      }
    }

    return partitions
  }

  private parseDiskInfo(output: string, altOutput?: string, lsblkOutput?: string): { total: number; used: number } {
    const lines = output.split('\n')
    let maxTotal = 0
    let maxUsed = 0
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('Filesystem')) {
        continue
      }
      
      const parts = trimmedLine.split(/\s+/)
      if (parts.length >= 4) {
        const device = parts[0]
        const size = parseInt(parts[1])
        const used = parseInt(parts[2])
        
        if (!isNaN(size) && size > 0 && !isNaN(used) && used >= 0) {
          if (device.startsWith('/dev/')) {
            if (size > maxTotal) {
              maxTotal = size * 1024
              maxUsed = used * 1024
            }
          }
        }
      }
    }
    
    if (maxTotal > 0) {
      return { total: maxTotal, used: maxUsed }
    }
    
    if (altOutput) {
      const result = this.parsePartitionsInfo(altOutput)
      if (result.total > 0) {
        return result
      }
    }
    
    if (lsblkOutput) {
      const lsblkSize = parseInt(lsblkOutput.trim())
      if (!isNaN(lsblkSize) && lsblkSize > 0) {
        return { total: lsblkSize, used: Math.round(lsblkSize * 0.3) }
      }
    }
    
    return { total: 0, used: 0 }
  }

  private parsePartitionsInfo(output: string): { total: number; used: number } {
    const lines = output.split('\n')
    let maxSize = 0
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('major')) {
        continue
      }
      
      const parts = trimmedLine.split(/\s+/)
      if (parts.length >= 5) {
        const size = parseInt(parts[2])
        const name = parts[3]
        
        if (!isNaN(size) && size > 0 && size > maxSize) {
          if (name.startsWith('sd') || name.startsWith('hd') || name.startsWith('nvme')) {
            maxSize = size
          }
        }
      }
    }
    
    if (maxSize > 0) {
      return { total: maxSize * 1024, used: Math.round(maxSize * 1024 * 0.3) }
    }
    
    return { total: 0, used: 0 }
  }

  private parseUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)

    return parts.join(' ') || '< 1m'
  }

  async getSystemInfo(serverId: string): Promise<SystemInfo | null> {
    try {
      const [osName, osVersion, kernel, arch, hostname] = await Promise.all([
        sshService.executeCommand(serverId, "awk -F'\"' '/^NAME=/ {print $2}' /etc/os-release 2>/dev/null || echo 'Unknown'"),
        sshService.executeCommand(serverId, "awk -F'=\"' '/^VERSION=/ {split($2,a,\"\\\"\"); print a[1]}' /etc/os-release 2>/dev/null || echo ''"),
        sshService.executeCommand(serverId, 'uname -r'),
        sshService.executeCommand(serverId, 'uname -m'),
        sshService.executeCommand(serverId, 'hostname')
      ])
      const uptimeResult = await sshService.executeCommand(serverId, 'cat /proc/uptime')
      
      const uptimeSeconds = parseFloat(uptimeResult.stdout.split(' ')[0]) || 0

      return {
        osName: osName.stdout.trim() || 'Linux',
        osVersion: osVersion.stdout.trim(),
        kernel: kernel.stdout.trim(),
        architecture: arch.stdout.trim(),
        hostname: hostname.stdout.trim(),
        uptime: this.parseUptime(uptimeSeconds)
      }
    } catch (error) {
      log.error('getSystemInfo error:', error)
      return null
    }
  }

  async getHardwareInfo(serverId: string): Promise<HardwareInfo | null> {
    try {
      const [cpuResult, memResult, dfOutput] = await Promise.all([
        sshService.executeCommand(serverId, 'nproc && cat /proc/cpuinfo | grep "model name" | head -1'),
        sshService.executeCommand(serverId, 'cat /proc/meminfo'),
        sshService.executeCommand(serverId, 'df -kP 2>/dev/null')
      ])

      const cores = parseInt(cpuResult.stdout.split('\n')[0]) || 1
      const cpuModel = cpuResult.stdout.split('\n')[1]?.replace('model name\t:', '').trim() || 'Unknown'

      const { total: memTotal, used: memUsed } = this.parseMemoryInfo(memResult.stdout)
      const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0

      const partitions = this.parseDiskPartitions(dfOutput.stdout)

      // 总览数据：优先根分区，否则取最大分区
      const rootPartition = partitions.find(p => p.mountPoint === '/')
      const mainPartition = rootPartition || partitions.reduce((max, p) => (p.total > max.total ? p : max), partitions[0])
      const diskTotal = mainPartition?.total ?? 0
      const diskUsed = mainPartition?.used ?? 0
      const diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0

      return {
        cpuCores: cores,
        cpuModel,
        memoryTotal: this.formatBytes(memTotal),
        memoryUsed: this.formatBytes(memUsed),
        memoryPercent: memPercent,
        diskTotal: this.formatBytes(diskTotal),
        diskUsed: this.formatBytes(diskUsed),
        diskPercent,
        diskPartitions: partitions.map(p => ({
          device: p.device,
          mountPoint: p.mountPoint,
          total: this.formatBytes(p.total),
          used: this.formatBytes(p.used),
          percent: p.total > 0 ? Math.round((p.used / p.total) * 100) : 0
        }))
      }
    } catch (error) {
      log.error('getHardwareInfo error:', error)
      return null
    }
  }

  async getNetworkInfo(serverId: string): Promise<NetworkInfo | null> {
    try {
      const [hostnameResult, ipResult, pingResult] = await Promise.all([
        sshService.executeCommand(serverId, 'hostname'),
        sshService.executeCommand(serverId, "ip addr show | grep 'inet ' | awk '{print $2}'"),
        sshService.executeCommand(serverId, 'ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1 && echo "online" || echo "offline"')
      ])

      const ipAddresses = ipResult.stdout
        .split('\n')
        .map(ip => ip.trim())
        .filter(ip => ip && ip !== '127.0.0.1')

      return {
        hostname: hostnameResult.stdout.trim(),
        ipAddresses,
        internetConnected: pingResult.stdout.trim() === 'online'
      }
    } catch (error) {
      log.error('getNetworkInfo error:', error)
      return null
    }
  }

  async checkPort(serverId: string, port: number): Promise<boolean> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        `timeout 2 bash -c "echo >/dev/tcp/localhost/${port}" 2>/dev/null && echo "open" || echo "closed"`
      )
      return result.stdout.trim() === 'open'
    } catch {
      return false
    }
  }

  async checkDockerInstalled(serverId: string): Promise<{ installed: boolean; version: string }> {
    try {
      let result = await sshService.executeCommand(serverId, 'docker --version')
      if (!result.success || !result.stdout) {
        result = await sshService.executeCommand(serverId, 'sudo docker --version')
      }
      
      if (result.success && result.stdout) {
        const match = result.stdout.match(/(\d+\.\d+\.\d+)/)
        return {
          installed: true,
          version: match ? match[1] : result.stdout.trim()
        }
      }
      return { installed: false, version: '' }
    } catch {
      return { installed: false, version: '' }
    }
  }

  async checkDockerRunning(serverId: string): Promise<boolean> {
    try {
      let result = await sshService.executeCommand(serverId, 'docker info')
      if (!result.success) {
        result = await sshService.executeCommand(serverId, 'sudo docker info')
      }
      return result.success
    } catch {
      return false
    }
  }

  async checkDockerComposeInstalled(serverId: string): Promise<{ installed: boolean; version: string }> {
    try {
      let result = await sshService.executeCommand(serverId, 'docker-compose --version')
      
      if (!result.success || !result.stdout) {
        result = await sshService.executeCommand(serverId, 'docker compose version')
      }
      
      if (!result.success || !result.stdout) {
        result = await sshService.executeCommand(serverId, 'sudo docker-compose --version')
      }
      
      if (!result.success || !result.stdout) {
        result = await sshService.executeCommand(serverId, 'sudo docker compose version')
      }
      
      if (result.success && result.stdout) {
        const match = result.stdout.match(/(\d+\.\d+\.\d+)/)
        return {
          installed: true,
          version: match ? match[1] : result.stdout.trim()
        }
      }
      return { installed: false, version: '' }
    } catch {
      return { installed: false, version: '' }
    }
  }

  async checkAllPorts(serverId: string, ports: number[]): Promise<PortInfo[]> {
    const portServices: Record<number, string> = {
      22: 'SSH',
      2375: 'Docker API (insecure)',
      2376: 'Docker API (TLS)',
      2377: 'Docker Swarm',
      80: 'HTTP',
      443: 'HTTPS',
      3000: 'Node.js App',
      3306: 'MySQL',
      5432: 'PostgreSQL',
      6379: 'Redis',
      8080: 'HTTP Alt',
      8443: 'HTTPS Alt',
      9200: 'Elasticsearch',
      27017: 'MongoDB'
    }

    const results: PortInfo[] = []
    for (const port of ports) {
      const isOpen = await this.checkPort(serverId, port)
      results.push({
        port,
        service: portServices[port] || 'Unknown',
        isOpen
      })
    }
    return results
  }

  validateHardware(
    hardware: HardwareInfo,
    requirements: HardwareRequirements = DEFAULT_REQUIREMENTS
  ): { ok: boolean; errors: string[] } {
    const errors: string[] = []

    if (requirements.minCpuCores && hardware.cpuCores < requirements.minCpuCores) {
      errors.push(`CPU cores: ${hardware.cpuCores} < ${requirements.minCpuCores} (required)`)
    }

    if (requirements.minMemoryGB) {
      const totalGB = parseFloat(hardware.memoryTotal) || 0
      const memMatch = hardware.memoryTotal.match(/^([\d.]+)\s*([A-Z]+)/)
      if (memMatch) {
        const value = parseFloat(memMatch[1])
        const unit = memMatch[2]
        let gbValue = value
        if (unit === 'MB') gbValue = value / 1024
        if (unit === 'KB') gbValue = value / 1024 / 1024
        if (unit === 'B') gbValue = value / 1024 / 1024 / 1024

        if (gbValue < requirements.minMemoryGB) {
          errors.push(`Memory: ${gbValue.toFixed(2)} GB < ${requirements.minMemoryGB} GB (required)`)
        }
      }
    }

    if (requirements.minDiskGB) {
      const diskMatch = hardware.diskTotal.match(/^([\d.]+)\s*([A-Z]+)/)
      if (diskMatch) {
        const value = parseFloat(diskMatch[1])
        const unit = diskMatch[2]
        let gbValue = value
        if (unit === 'MB') gbValue = value / 1024
        if (unit === 'KB') gbValue = value / 1024 / 1024
        if (unit === 'B') gbValue = value / 1024 / 1024 / 1024

        if (gbValue < requirements.minDiskGB) {
          errors.push(`Disk: ${gbValue.toFixed(2)} GB < ${requirements.minDiskGB} GB (required)`)
        }
      }
    }

    return { ok: errors.length === 0, errors }
  }

  async openPort(serverId: string, port: number): Promise<boolean> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        `sudo ufw allow ${port}/tcp 2>/dev/null || sudo firewall-cmd --permanent --add-port=${port}/tcp 2>/dev/null || sudo iptables -I INPUT -p tcp --dport ${port} -j ACCEPT 2>/dev/null && echo "success" || echo "failed"`
      )
      return result.stdout.includes('success')
    } catch (error) {
      log.error(`Failed to open port ${port}:`, error)
      return false
    }
  }

  async checkAndFixEnvironment(
    serverId: string,
    requirements: HardwareRequirements = DEFAULT_REQUIREMENTS
  ): Promise<SystemCheckResult> {
    log.info(`Starting system environment check for server: ${serverId}`)

    const result: SystemCheckResult = {
      systemInfo: null,
      hardwareInfo: null,
      networkInfo: null,
      requiredPorts: [],
      networkOk: false,
      systemOk: false,
      hardwareOk: false,
      dockerOk: false,
      dockerInstalled: false,
      dockerRunning: false,
      dockerVersion: '',
      composeInstalled: false,
      composeVersion: ''
    }

    const connectionStatus = sshService.getConnectionStatus(serverId)
    if (connectionStatus !== 'online') {
      result.error = 'SSH connection is not available'
      log.warn(`Server ${serverId} is not connected`)
      return result
    }

    try {
      const [systemInfo, hardwareInfo, networkInfo, dockerInstalled, dockerComposeInstalled] = await Promise.all([
        this.getSystemInfo(serverId),
        this.getHardwareInfo(serverId),
        this.getNetworkInfo(serverId),
        this.checkDockerInstalled(serverId),
        this.checkDockerComposeInstalled(serverId)
      ])

      result.systemInfo = systemInfo
      result.hardwareInfo = hardwareInfo
      result.networkInfo = networkInfo

      if (networkInfo) {
        result.networkOk = networkInfo.internetConnected
      }

      result.systemOk = systemInfo !== null

      if (hardwareInfo) {
        const validation = this.validateHardware(hardwareInfo, requirements)
        result.hardwareOk = validation.ok
        if (!validation.ok) {
          result.error = `Hardware requirements not met:\n${validation.errors.join('\n')}`
        }
      }

      const dockerRunning = await this.checkDockerRunning(serverId)

      result.dockerInstalled = dockerInstalled.installed
      result.dockerRunning = dockerRunning
      result.dockerVersion = dockerInstalled.version
      result.composeInstalled = dockerComposeInstalled.installed
      result.composeVersion = dockerComposeInstalled.version
      result.dockerOk = dockerInstalled.installed && dockerRunning && dockerComposeInstalled.installed

      if (requirements.requiredPorts && requirements.requiredPorts.length > 0) {
        result.requiredPorts = await this.checkAllPorts(serverId, requirements.requiredPorts)
      }

      const overallOk = result.systemOk && result.hardwareOk && result.networkOk && result.dockerOk

      log.info(`System environment check completed for server ${serverId}:`, {
        systemOk: result.systemOk,
        hardwareOk: result.hardwareOk,
        networkOk: result.networkOk,
        dockerOk: result.dockerOk,
        overallOk
      })

      if (!overallOk && !result.error) {
        const issues: string[] = []
        if (!result.systemOk) issues.push('- System information check failed')
        if (!result.hardwareOk) issues.push('- Hardware requirements not met')
        if (!result.networkOk) issues.push('- Network connectivity check failed')
        if (!result.dockerOk) issues.push('- Docker environment not ready')
        result.error = `Environment check failed:\n${issues.join('\n')}`
      }

      return result
    } catch (error) {
      const err = error as Error
      log.error(`System environment check failed for server ${serverId}:`, err)
      result.error = err.message
      return result
    }
  }
}

export const systemCheckService = new SystemCheckService()

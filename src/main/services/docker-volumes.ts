import log from 'electron-log'
import { sshService } from '../ssh'

export interface VolumeInfo {
  name: string
  mountpoint: string
  driver: string
  size: string
  scope: string
  createdAt: string
  labels: string
  options: string
}

export interface VolumeDetail {
  name: string
  driver: string
  mountpoint: string
  scope: string
  createdAt: string
  labels: Record<string, string>
  options: Record<string, string>
  status?: Record<string, string>
  usageData?: {
    size: string
    refCount: number
  }
}

export interface PruneResult {
  success: boolean
  deletedVolumes: string[]
  spaceReclaimed: string
  message: string
}

class DockerVolumesService {
  /**
   * 获取数据卷列表
   */
  async getVolumes(serverId: string): Promise<VolumeInfo[]> {
    try {
      // 使用 docker volume ls --format 获取 JSON 格式输出
      const result = await sshService.executeCommand(
        serverId,
        'docker volume ls --format "{{json .}}"'
      )

      if (!result.success) {
        log.error(`Failed to get volumes: ${result.stderr}`)
        return []
      }

      const volumes: VolumeInfo[] = []
      const lines = result.stdout.trim().split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          // docker volume ls --format 返回的字段: Name, Driver, Mountpoint, Labels, Scope, Options, CreatedAt
          volumes.push({
            name: parsed.Name || '',
            mountpoint: parsed.Mountpoint || '',
            driver: parsed.Driver || 'local',
            size: '-', // docker volume ls 不显示大小，需要额外查询
            scope: parsed.Scope || 'local',
            createdAt: parsed.CreatedAt || '',
            labels: parsed.Labels || '',
            options: parsed.Options || ''
          })
        } catch (parseError) {
          log.warn(`Failed to parse volume line: ${line}`, parseError)
        }
      }

      // 尝试获取每个卷的大小信息
      for (const volume of volumes) {
        try {
          const sizeResult = await sshService.executeCommand(
            serverId,
            `docker system df -v --format "{{json .}}" 2>/dev/null | grep -v "^$" || echo "{}"`
          )
          // 大小获取可能不可用，使用 du 作为备选
          const duResult = await sshService.executeCommand(
            serverId,
            `docker run --rm -v ${volume.name}:/vol alpine:3.18 du -sh /vol 2>/dev/null | cut -f1 || echo "-"`
          )
          if (duResult.success && duResult.stdout.trim()) {
            volume.size = duResult.stdout.trim()
          }
        } catch {
          // 忽略大小获取错误
        }
      }

      return volumes
    } catch (error) {
      log.error('getVolumes error:', error)
      return []
    }
  }

  /**
   * 创建数据卷
   */
  async createVolume(
    serverId: string,
    name: string,
    driver: string = 'local',
    labels?: Record<string, string>,
    options?: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    try {
      let command = `docker volume create`

      if (driver && driver !== 'local') {
        command += ` --driver ${driver}`
      }

      // 添加标签
      if (labels) {
        for (const [key, value] of Object.entries(labels)) {
          command += ` --label "${key}=${value}"`
        }
      }

      // 添加驱动选项
      if (options) {
        for (const [key, value] of Object.entries(options)) {
          command += ` --opt "${key}=${value}"`
        }
      }

      command += ` ${name}`

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        return { success: true, message: `数据卷 ${name} 创建成功` }
      } else {
        return { success: false, message: result.stderr || '创建失败' }
      }
    } catch (error) {
      log.error('createVolume error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 删除数据卷
   */
  async removeVolume(serverId: string, name: string, force: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      let command = `docker volume rm`
      if (force) {
        command += ` --force`
      }
      command += ` ${name}`

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        return { success: true, message: `数据卷 ${name} 删除成功` }
      } else {
        return { success: false, message: result.stderr || '删除失败' }
      }
    } catch (error) {
      log.error('removeVolume error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 清理未使用的数据卷
   */
  async pruneVolumes(serverId: string, force: boolean = true, all: boolean = false): Promise<PruneResult> {
    try {
      let command = `docker volume prune`
      if (force) {
        command += ` --force`
      }
      if (all) {
        command += ` --all`
      }

      const result = await sshService.executeCommand(serverId, command)

      if (result.success) {
        // 解析输出获取删除的卷和回收的空间
        const output = result.stdout + result.stderr
        const deletedVolumes: string[] = []
        let spaceReclaimed = '0B'

        // 解析 "Deleted Volumes:" 部分
        const deletedMatch = output.match(/Deleted Volumes:\s*\n([\s\S]*?)(?:\n\n|Total reclaimed space|$)/i)
        if (deletedMatch) {
          const volumeLines = deletedMatch[1].trim().split('\n')
          for (const line of volumeLines) {
            const trimmed = line.trim()
            if (trimmed) {
              deletedVolumes.push(trimmed)
            }
          }
        }

        // 解析 "Total reclaimed space" 部分
        const spaceMatch = output.match(/Total reclaimed space:\s*(.+)/i)
        if (spaceMatch) {
          spaceReclaimed = spaceMatch[1].trim()
        }

        return {
          success: true,
          deletedVolumes,
          spaceReclaimed,
          message: deletedVolumes.length > 0
            ? `已清理 ${deletedVolumes.length} 个未使用数据卷，回收空间 ${spaceReclaimed}`
            : '没有可清理的未使用数据卷'
        }
      } else {
        return {
          success: false,
          deletedVolumes: [],
          spaceReclaimed: '0B',
          message: result.stderr || '清理失败'
        }
      }
    } catch (error) {
      log.error('pruneVolumes error:', error)
      return {
        success: false,
        deletedVolumes: [],
        spaceReclaimed: '0B',
        message: (error as Error).message
      }
    }
  }

  /**
   * 获取数据卷详情
   */
  async getVolumeInfo(serverId: string, name: string): Promise<VolumeDetail | null> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        `docker volume inspect ${name}`
      )

      if (!result.success) {
        log.error(`Failed to inspect volume ${name}: ${result.stderr}`)
        return null
      }

      try {
        const inspectData = JSON.parse(result.stdout)
        if (inspectData && inspectData.length > 0) {
          const data = inspectData[0]
          return {
            name: data.Name || name,
            driver: data.Driver || 'local',
            mountpoint: data.Mountpoint || '',
            scope: data.Scope || 'local',
            createdAt: data.CreatedAt || '',
            labels: data.Labels || {},
            options: data.Options || {},
            status: data.Status,
            usageData: data.usageData
          }
        }
      } catch (parseError) {
        log.error(`Failed to parse volume inspect output:`, parseError)
      }

      return null
    } catch (error) {
      log.error('getVolumeInfo error:', error)
      return null
    }
  }

  /**
   * 获取数据卷大小（通过临时容器）
   */
  async getVolumeSize(serverId: string, name: string): Promise<string> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        `docker run --rm -v ${name}:/vol alpine:3.18 du -sh /vol 2>/dev/null | cut -f1`
      )
      if (result.success && result.stdout.trim()) {
        return result.stdout.trim()
      }
      return '-'
    } catch {
      return '-'
    }
  }
}

export const dockerVolumesService = new DockerVolumesService()

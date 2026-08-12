import log from 'electron-log'
import { sshService } from './ssh'

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  created: string
}

export interface PruneResult {
  success: boolean
  message: string
  deletedImages?: string[]
  spaceReclaimed?: string
}

class DockerImagesService {
  /**
   * 将 Docker CreatedAt 解析为 UTC ISO 时间戳，前端再按本机时区显示
   * 格式示例: "2026-08-12 19:13:03 +0800 CST" / "2026-08-12 15:30:00.123 +0000 UTC"
   */
  private parseCreatedAt(createdAt: string): string {
    const trimmed = createdAt.trim()

    // 仅对严格 ISO 格式（YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±hh:mm)）直接解析
    // 注意：不能用 new Date() 宽松解析 Docker 格式（"YYYY-MM-DD HH:mm:ss +0800 CST"），
    // V8 会返回错误的绝对时间（比真实值多 14 小时）
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
      const direct = new Date(trimmed)
      if (!isNaN(direct.getTime())) {
        return direct.toISOString()
      }
    }

    // Docker 格式：兼容可选小数秒与时区偏移
    // 有偏移按偏移解析；无偏移按服务器本地时区解析（通常与本机时区一致）
    const match = trimmed.match(/(\d{4}-\d{2}-\d{2})[\sT](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s+([+-]\d{4}))?/)
    if (!match) return trimmed

    const [, date, time, offset] = match
    const offsetWithColon = offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : ''
    const parsed = new Date(`${date}T${time}${offsetWithColon}`)

    return isNaN(parsed.getTime()) ? trimmed : parsed.toISOString()
  }

  /**
   * 获取远程服务器上的 Docker 镜像列表
   */
  async getImages(serverId: string): Promise<DockerImage[]> {
    try {
      // 使用 docker images 命令获取镜像列表（不含悬空/中间层镜像），输出格式为 JSON 便于解析
      const result = await sshService.executeCommand(
        serverId,
        'docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"',
        0,
        1000,
        30000
      )

      if (!result.success) {
        log.error(`Failed to get images: ${result.stderr}`)
        return []
      }

      const images: DockerImage[] = []
      const lines = result.stdout.trim().split('\n').filter(line => line.trim())

      for (const line of lines) {
        const parts = line.split('|')
        if (parts.length >= 5) {
          images.push({
            id: parts[0].trim(),
            repository: parts[1].trim(),
            tag: parts[2].trim(),
            size: parts[3].trim(),
            created: this.parseCreatedAt(parts[4].trim())
          })
        }
      }

      log.info(`Found ${images.length} images on server ${serverId}`)
      return images
    } catch (error) {
      log.error('getImages error:', error)
      return []
    }
  }

  /**
   * 拉取 Docker 镜像
   */
  async pullImage(serverId: string, imageName: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!imageName || !imageName.trim()) {
        return { success: false, message: '镜像名称不能为空' }
      }

      log.info(`Pulling image: ${imageName} on server ${serverId}`)

      // 使用较长的超时时间，因为拉取镜像可能需要较长时间
      const result = await sshService.executeCommand(
        serverId,
        `docker pull ${imageName}`,
        0,
        1000,
        300000 // 5分钟超时
      )

      if (result.success) {
        log.info(`Successfully pulled image: ${imageName}`)
        return { success: true, message: `镜像 ${imageName} 拉取成功` }
      } else {
        log.error(`Failed to pull image: ${result.stderr}`)
        return { success: false, message: result.stderr || '拉取镜像失败' }
      }
    } catch (error) {
      log.error('pullImage error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 删除 Docker 镜像
   */
  async removeImage(serverId: string, imageId: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!imageId || !imageId.trim()) {
        return { success: false, message: '镜像ID不能为空' }
      }

      log.info(`Removing image: ${imageId} on server ${serverId}`)

      const result = await sshService.executeCommand(
        serverId,
        `docker rmi -f ${imageId}`,
        0,
        1000,
        60000
      )

      if (result.success) {
        log.info(`Successfully removed image: ${imageId}`)
        return { success: true, message: `镜像 ${imageId} 删除成功` }
      } else {
        log.error(`Failed to remove image: ${result.stderr}`)
        return { success: false, message: result.stderr || '删除镜像失败' }
      }
    } catch (error) {
      log.error('removeImage error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /**
   * 批量删除 Docker 镜像（单次 SSH 命令，避免逐条执行的延迟）
   */
  async removeImages(
    serverId: string,
    imageIds: string[]
  ): Promise<{ success: boolean; successCount: number; failCount: number; message: string }> {
    try {
      const uniqueIds = [...new Set(imageIds.map(id => id.trim()).filter(id => id))]
      if (uniqueIds.length === 0) {
        return { success: false, successCount: 0, failCount: 0, message: '镜像ID不能为空' }
      }

      log.info(`Removing ${uniqueIds.length} images on server ${serverId}`)

      const result = await sshService.executeCommand(
        serverId,
        `docker rmi -f ${uniqueIds.join(' ')} 2>&1`,
        0,
        1000,
        120000
      )

      if (result.success) {
        log.info(`Successfully removed ${uniqueIds.length} images`)
        return {
          success: true,
          successCount: uniqueIds.length,
          failCount: 0,
          message: `成功删除 ${uniqueIds.length} 个镜像`
        }
      }

      // 部分失败：docker rmi 对每个失败的镜像输出一条 "Error response from daemon" 错误
      const stderr = result.stderr || ''
      const errorLines = stderr.split('\n').filter(line => line.includes('Error response from daemon')).length
      const failCount = Math.min(errorLines, uniqueIds.length)
      const successCount = uniqueIds.length - failCount

      log.warn(`Partial failure removing images: ${stderr}`)
      return {
        success: successCount > 0,
        successCount,
        failCount,
        message: stderr || '删除镜像失败'
      }
    } catch (error) {
      log.error('removeImages error:', error)
      return {
        success: false,
        successCount: 0,
        failCount: imageIds.length,
        message: (error as Error).message
      }
    }
  }

  /**
   * 清理未使用的镜像（悬空镜像 + 未被任何容器使用的镜像）
   */
  async pruneImages(serverId: string): Promise<PruneResult> {
    try {
      log.info(`Pruning images on server ${serverId}`)

      // 先获取将被删除的悬空镜像列表
      const danglingResult = await sshService.executeCommand(
        serverId,
        'docker images -f "dangling=true" --format "{{.ID}}|{{.Repository}}|{{.Tag}}"',
        0,
        1000,
        30000
      )

      const danglingImages: string[] = []
      if (danglingResult.success && danglingResult.stdout.trim()) {
        const lines = danglingResult.stdout.trim().split('\n')
        for (const line of lines) {
          const parts = line.split('|')
          if (parts.length >= 3) {
            danglingImages.push(`${parts[1].trim()}:${parts[2].trim()}`)
          }
        }
      }

      // 执行清理命令
      const result = await sshService.executeCommand(
        serverId,
        'docker image prune -a -f',
        0,
        1000,
        120000
      )

      if (result.success) {
        // 解析回收的空间
        let spaceReclaimed = ''
        const spaceMatch = result.stdout.match(/Total reclaimed space:\s*(.+)/i)
        if (spaceMatch) {
          spaceReclaimed = spaceMatch[1].trim()
        }

        log.info(`Successfully pruned images. Space reclaimed: ${spaceReclaimed}`)
        return {
          success: true,
          message: '清理完成',
          deletedImages: danglingImages,
          spaceReclaimed: spaceReclaimed || '0B'
        }
      } else {
        log.error(`Failed to prune images: ${result.stderr}`)
        return {
          success: false,
          message: result.stderr || '清理镜像失败'
        }
      }
    } catch (error) {
      log.error('pruneImages error:', error)
      return {
        success: false,
        message: (error as Error).message
      }
    }
  }

  /**
   * 获取镜像详细信息
   */
  async getImageInfo(serverId: string, imageId: string): Promise<string> {
    try {
      const result = await sshService.executeCommand(
        serverId,
        `docker image inspect ${imageId}`,
        0,
        1000,
        30000
      )

      return result.success ? result.stdout : result.stderr
    } catch (error) {
      log.error('getImageInfo error:', error)
      return (error as Error).message
    }
  }
}

export const dockerImagesService = new DockerImagesService()

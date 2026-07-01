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
   * 获取远程服务器上的 Docker 镜像列表
   */
  async getImages(serverId: string): Promise<DockerImage[]> {
    try {
      // 使用 docker images 命令获取镜像列表，输出格式为 JSON 便于解析
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
            created: parts[4].trim()
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
        `docker rmi ${imageId}`,
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

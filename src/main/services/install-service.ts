import log from 'electron-log'
import { sshService } from '../ssh'

export interface InstallResult {
  success: boolean
  message: string
  steps: Array<{ step: string; success: boolean; output: string }>
}

export interface InstallOptions {
  installDocker?: boolean
  installDockerCompose?: boolean
  installPortainer?: boolean
}

class InstallService {
  private async executeCommand(serverId: string, command: string, stepName: string, steps: InstallResult['steps']): Promise<boolean> {
    try {
      const result = await sshService.executeCommand(serverId, command, 2, 2000, 120000)
      steps.push({
        step: stepName,
        success: result.success,
        output: result.stdout || result.stderr
      })
      return result.success
    } catch (error) {
      steps.push({
        step: stepName,
        success: false,
        output: (error as Error).message
      })
      return false
    }
  }

  private async detectOS(serverId: string): Promise<'ubuntu' | 'debian' | 'centos' | 'rhel' | 'euler' | 'unknown'> {
    try {
      const result = await sshService.executeCommand(serverId, 'cat /etc/os-release 2>/dev/null || cat /etc/centos-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null || cat /etc/euleros-release 2>/dev/null')
      const output = result.stdout.toLowerCase()
      if (output.includes('ubuntu')) return 'ubuntu'
      if (output.includes('debian')) return 'debian'
      if (output.includes('openeuler') || output.includes('euleros') || output.includes('euler')) return 'euler'
      if (output.includes('centos')) return 'centos'
      if (output.includes('red hat') || output.includes('rhel')) return 'rhel'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private async checkInternet(serverId: string): Promise<boolean> {
    try {
      const result = await sshService.executeCommand(serverId, 'ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1 && echo "online" || echo "offline"')
      return result.stdout.trim() === 'online'
    } catch {
      return false
    }
  }

  async installDockerOnline(serverId: string, osType: string, steps: InstallResult['steps']): Promise<boolean> {
    log.info(`Installing Docker online on ${osType} system`)
    
    let success = true

    if (osType === 'ubuntu' || osType === 'debian') {
      success = await this.executeCommand(serverId, 'sudo apt-get update -y', '更新软件源', steps) && success
      success = await this.executeCommand(serverId, 'sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common', '安装依赖包', steps) && success
      success = await this.executeCommand(serverId, 'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg', '添加Docker GPG密钥', steps) && success
      success = await this.executeCommand(serverId, 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null', '添加Docker源', steps) && success
      success = await this.executeCommand(serverId, 'sudo apt-get update -y', '更新Docker源', steps) && success
      success = await this.executeCommand(serverId, 'sudo apt-get install -y docker-ce docker-ce-cli containerd.io', '安装Docker', steps) && success
    } else if (osType === 'centos' || osType === 'rhel' || osType === 'euler') {
      success = await this.executeCommand(serverId, 'sudo yum install -y yum-utils device-mapper-persistent-data lvm2', '安装依赖包', steps) && success
      success = await this.executeCommand(serverId, 'sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo', '添加Docker源', steps) && success
      success = await this.executeCommand(serverId, 'sudo yum install -y docker-ce docker-ce-cli containerd.io', '安装Docker', steps) && success
    } else {
      steps.push({ step: '检测操作系统', success: false, output: '不支持的操作系统类型' })
      return false
    }

    if (success) {
      success = await this.executeCommand(serverId, 'sudo systemctl start docker', '启动Docker服务', steps) && success
      success = await this.executeCommand(serverId, 'sudo systemctl enable docker', '设置Docker开机自启', steps) && success
      success = await this.executeCommand(serverId, 'sudo usermod -aG docker $USER', '添加用户到docker组', steps) && success
    }

    return success
  }

  async installDockerOffline(serverId: string, osType: string, steps: InstallResult['steps']): Promise<boolean> {
    log.info(`Installing Docker offline on ${osType} system`)
    
    let success = true

    if (osType === 'ubuntu' || osType === 'debian') {
      success = await this.executeCommand(serverId, 'sudo apt-get install -y docker.io --fix-missing 2>/dev/null || sudo apt-get install -y docker.io', '从系统包管理器安装Docker', steps)
      
      if (!success) {
        success = await this.executeCommand(serverId, 'which docker && docker --version', '检查是否已安装Docker', steps)
        if (success) {
          steps.push({ step: 'Docker已存在', success: true, output: 'Docker已安装在系统中' })
        }
      }
    } else if (osType === 'centos' || osType === 'rhel' || osType === 'euler') {
      success = await this.executeCommand(serverId, 'sudo yum install -y docker --disablerepo=* --enablerepo=base,extras 2>/dev/null || sudo yum install -y docker', '从系统包管理器安装Docker', steps)
      
      if (!success) {
        success = await this.executeCommand(serverId, 'which docker && docker --version', '检查是否已安装Docker', steps)
        if (success) {
          steps.push({ step: 'Docker已存在', success: true, output: 'Docker已安装在系统中' })
        }
      }
    } else {
      steps.push({ step: '检测操作系统', success: false, output: '不支持的操作系统类型' })
      return false
    }

    if (success) {
      const startResult = await this.executeCommand(serverId, 'sudo systemctl start docker', '启动Docker服务', steps)
      if (startResult) {
        success = startResult && success
      } else {
        steps.push({ step: '启动Docker服务', success: false, output: 'Docker服务启动失败，请手动启动' })
      }
      
      const enableResult = await this.executeCommand(serverId, 'sudo systemctl enable docker', '设置Docker开机自启', steps)
      if (enableResult) {
        success = enableResult && success
      }
      
      await this.executeCommand(serverId, 'sudo usermod -aG docker $USER 2>/dev/null || true', '添加用户到docker组', steps)
    }

    return success
  }

  async installDockerComposeOnline(serverId: string, steps: InstallResult['steps']): Promise<boolean> {
    log.info('Installing Docker Compose online')

    let success = true
    
    success = await this.executeCommand(serverId, 'sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose', '下载Docker Compose', steps) && success
    success = await this.executeCommand(serverId, 'sudo chmod +x /usr/local/bin/docker-compose', '添加执行权限', steps) && success

    return success
  }

  async installDockerComposeOffline(serverId: string, steps: InstallResult['steps']): Promise<boolean> {
    log.info('Installing Docker Compose offline')

    let success = true
    
    success = await this.executeCommand(serverId, 'sudo apt-get install -y docker-compose 2>/dev/null || sudo yum install -y docker-compose 2>/dev/null || true', '尝试系统包安装', steps) && success
    
    if (!success) {
      success = await this.executeCommand(serverId, 'pip3 install docker-compose 2>/dev/null || pip install docker-compose 2>/dev/null || true', '尝试pip安装', steps) && success
    }

    if (!success) {
      success = await this.executeCommand(serverId, 'docker compose version 2>/dev/null && echo "Docker Compose V2 integrated" || echo "Compose not found"', '检查内置Compose V2', steps)
      const composeCheck = await sshService.executeCommand(serverId, 'docker compose version 2>/dev/null')
      if (composeCheck.success && composeCheck.stdout) {
        steps.push({ step: 'Docker Compose V2', success: true, output: 'Docker Compose V2已集成在Docker CLI中' })
        success = true
      } else {
        steps.push({ step: 'Docker Compose安装', success: false, output: '离线环境下无法安装Docker Compose，请手动安装' })
        success = false
      }
    }

    return success
  }

  async installPortainer(serverId: string, steps: InstallResult['steps']): Promise<boolean> {
    log.info('Installing Portainer')

    let success = true
    
    success = await this.executeCommand(serverId, 'docker volume create portainer_data', '创建Portainer数据卷', steps) && success
    success = await this.executeCommand(serverId, 'docker run -d -p 9000:9000 -p 8000:8000 --name portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce', '启动Portainer容器', steps) && success

    return success
  }

  async installDependencies(serverId: string, options: InstallOptions = {}): Promise<InstallResult> {
    const result: InstallResult = {
      success: false,
      message: '',
      steps: []
    }

    const connectionStatus = sshService.getConnectionStatus(serverId)
    if (connectionStatus !== 'online') {
      result.message = 'SSH连接不可用'
      result.steps.push({ step: '连接检查', success: false, output: '服务器未连接' })
      return result
    }

    const hasInternet = await this.checkInternet(serverId)
    const osType = await this.detectOS(serverId)
    
    result.steps.push({ step: '网络检测', success: hasInternet, output: hasInternet ? '有互联网连接' : '离线模式' })
    result.steps.push({ step: '操作系统检测', success: osType !== 'unknown', output: osType === 'unknown' ? '未知操作系统' : osType })

    if (osType === 'unknown') {
      result.message = '无法识别操作系统类型'
      return result
    }

    const installDocker = options.installDocker !== false
    const installCompose = options.installDockerCompose !== false
    const installPortainer = options.installPortainer !== false

    if (installDocker) {
      const dockerResult = hasInternet 
        ? await this.installDockerOnline(serverId, osType, result.steps)
        : await this.installDockerOffline(serverId, osType, result.steps)
      
      if (!dockerResult) {
        result.message = 'Docker安装失败'
        return result
      }
    }

    if (installCompose) {
      const composeResult = hasInternet
        ? await this.installDockerComposeOnline(serverId, result.steps)
        : await this.installDockerComposeOffline(serverId, result.steps)
      
      if (!composeResult && hasInternet) {
        result.message = 'Docker Compose安装失败'
        return result
      }
    }

    if (installPortainer && hasInternet) {
      const portainerResult = await this.installPortainer(serverId, result.steps)
      
      if (!portainerResult) {
        result.message = 'Portainer安装失败'
        return result
      }
    } else if (installPortainer && !hasInternet) {
      result.steps.push({ step: 'Portainer安装', success: false, output: '离线模式下无法安装Portainer（需要下载镜像）' })
    }

    result.success = true
    result.message = '依赖安装完成'
    
    if (!hasInternet) {
      result.message += '（离线模式：部分组件可能未完全安装）'
    }

    return result
  }

  async uploadOfflinePackage(serverId: string, fileName: string, base64Content: string): Promise<{ success: boolean; message: string }> {
    log.info(`Uploading offline package: ${fileName} to server ${serverId}`)
    
    try {
      const content = Buffer.from(base64Content, 'base64')
      const remotePath = `/tmp/${fileName}`
      
      const result = await sshService.uploadContent(serverId, content.toString('binary'), remotePath)
      
      if (result.success) {
        const fileExtension = fileName.split('.').pop()?.toLowerCase()
        
        if (fileExtension === 'deb') {
          await sshService.executeCommand(serverId, `sudo dpkg -i ${remotePath} && sudo apt-get install -f -y`, 2, 2000, 120000)
        } else if (fileExtension === 'rpm') {
          await sshService.executeCommand(serverId, `sudo rpm -ivh ${remotePath}`, 2, 2000, 120000)
        } else if (fileExtension === 'tar' || fileExtension === 'gz' || fileName.endsWith('.tar.gz')) {
          await sshService.executeCommand(serverId, `sudo tar -xzf ${remotePath} -C /tmp/`, 2, 2000, 60000)
        } else if (fileExtension === 'zip') {
          await sshService.executeCommand(serverId, `sudo unzip ${remotePath} -d /tmp/`, 2, 2000, 60000)
        }
        
        return { success: true, message: `离线包 ${fileName} 上传并安装成功` }
      } else {
        return { success: false, message: result.message }
      }
    } catch (error) {
      log.error(`Failed to upload offline package: ${error}`)
      return { success: false, message: (error as Error).message }
    }
  }
}

export const installService = new InstallService()
import log from 'electron-log'
import { sshService } from './ssh'

export interface ScanVulnerability {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'negligible'
  packageName: string
  installedVersion: string
  fixedVersion?: string
  description: string
  cveId?: string
  cvssScore?: number
  remediation: string
}

export interface ScanSummary {
  critical: number
  high: number
  medium: number
  low: number
  negligible: number
  total: number
}

export interface ScanImageResult {
  success: boolean
  message: string
  trivyInstalled: boolean
  vulnerabilities: ScanVulnerability[]
  summary: ScanSummary
  scanTime: string
}

// Trivy 安装脚本：优先官方 GitHub，失败时降级到代理加速源（适配国内网络）
const TRIVY_INSTALL_URL = 'https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh'
const TRIVY_INSTALL_URL_MIRROR = 'https://mirror.ghproxy.com/https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh'
// 漏洞数据库：优先官方 GHCR，trivy 会按顺序自动 fallback 到国内镜像源
const TRIVY_DB_REPOSITORIES = [
  'ghcr.io/aquasecurity/trivy-db:2',
  'ghcr.nju.edu.cn/aquasecurity/trivy-db:2'
]
const TRIVY_JAVA_DB_REPOSITORIES = [
  'ghcr.io/aquasecurity/trivy-java-db:1',
  'ghcr.nju.edu.cn/aquasecurity/trivy-java-db:1'
]

class SecurityScanService {
  private emptySummary(): ScanSummary {
    return { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, total: 0 }
  }

  /** 构造代理环境变量前缀（配置了代理时生效） */
  private proxyEnv(proxy?: string): string {
    if (!proxy || !proxy.trim()) return ''
    const p = proxy.trim()
    return `export HTTPS_PROXY='${p}' HTTP_PROXY='${p}' ALL_PROXY='${p}' NO_PROXY='localhost,127.0.0.1,::1'; `
  }

  private mapSeverity(sev: string): ScanVulnerability['severity'] {
    switch ((sev || '').toUpperCase()) {
      case 'CRITICAL': return 'critical'
      case 'HIGH': return 'high'
      case 'MEDIUM': return 'medium'
      case 'LOW': return 'low'
      default: return 'negligible'
    }
  }

  /** 检查服务器是否已安装 trivy */
  async checkTrivy(serverId: string): Promise<boolean> {
    try {
      const r = await sshService.executeCommand(
        serverId,
        'command -v trivy >/dev/null 2>&1 && echo "yes" || echo "no"',
        0,
        1000,
        10000
      )
      return r.success && r.stdout.trim() === 'yes'
    } catch {
      return false
    }
  }

  /** 在服务器上自动安装 trivy */
  async installTrivy(serverId: string, proxy?: string): Promise<{ success: boolean; message: string }> {
    try {
      log.info(`Installing trivy on server ${serverId}`)
      const env = this.proxyEnv(proxy)
      // 优先官方 GitHub 源，下载失败时自动降级到代理加速源
      const r = await sshService.executeCommand(
        serverId,
        `${env}(curl -sfL --fail ${TRIVY_INSTALL_URL} -o /tmp/trivy-install.sh && sh /tmp/trivy-install.sh -b /usr/local/bin) || (curl -sfL --fail ${TRIVY_INSTALL_URL_MIRROR} -o /tmp/trivy-install.sh && sh /tmp/trivy-install.sh -b /usr/local/bin) 2>&1 && trivy --version && rm -f /tmp/trivy-install.sh`,
        0,
        1000,
        300000
      )

      if (r.success) {
        log.info(`Trivy installed on server ${serverId}`)
        return { success: true, message: 'Trivy 安装成功' }
      }
      return { success: false, message: r.stderr || 'Trivy 安装失败' }
    } catch (error) {
      log.error('installTrivy error:', error)
      return { success: false, message: (error as Error).message }
    }
  }

  /** 解析 trivy JSON 输出中的漏洞列表 */
  private parseTrivyOutput(json: string): ScanVulnerability[] {
    const vulnerabilities: ScanVulnerability[] = []
    let parsed: any

    try {
      parsed = JSON.parse(json)
    } catch (error) {
      log.error('Failed to parse trivy output:', error)
      return vulnerabilities
    }

    const results = parsed?.Results || []
    for (const item of results) {
      const vulns = item?.Vulnerabilities || []
      for (const v of vulns) {
        // CVSS 分数优先取 NVD，其次 Red Hat
        const cvssNvd = v?.CVSS?.nvd?.V3Score
        const cvssRedhat = v?.CVSS?.redhat?.V3Score
        const cvss = typeof cvssNvd === 'number' ? cvssNvd : typeof cvssRedhat === 'number' ? cvssRedhat : undefined

        // 处理方法：有修复版本则升级，否则提示关注公告
        const fixed = v.FixedVersion
        const pkgName = v.PkgName || 'unknown'
        const remediation = fixed
          ? `升级 ${pkgName} 至 ${fixed}`
          : '暂无修复版本，请关注官方安全公告'

        vulnerabilities.push({
          id: `${v.VulnerabilityID || 'unknown'}-${pkgName}-${vulnerabilities.length}`,
          severity: this.mapSeverity(v.Severity),
          packageName: pkgName,
          installedVersion: v.InstalledVersion || 'unknown',
          fixedVersion: fixed || undefined,
          description: v.Description || v.Title || v.VulnerabilityID || '暂无描述',
          cveId: v.VulnerabilityID || undefined,
          cvssScore: typeof cvss === 'number' ? Math.round(cvss * 10) / 10 : undefined,
          remediation
        })
      }
    }

    return vulnerabilities
  }

  /** 扫描镜像漏洞 */
  async scanImage(serverId: string, imageName: string, proxy?: string): Promise<ScanImageResult> {
    const empty = this.emptySummary()
    const now = new Date().toISOString()

    if (!imageName || !imageName.trim()) {
      return { success: false, message: '镜像名称不能为空', trivyInstalled: false, vulnerabilities: [], summary: empty, scanTime: now }
    }

    try {
      const trivyInstalled = await this.checkTrivy(serverId)
      if (!trivyInstalled) {
        return {
          success: false,
          message: 'Trivy 未安装，请先安装后重试',
          trivyInstalled: false,
          vulnerabilities: [],
          summary: empty,
          scanTime: now
        }
      }

      log.info(`Scanning image ${imageName} on server ${serverId}`)
      const env = this.proxyEnv(proxy)
      // --db-repository 可多次指定，trivy 按顺序尝试，官方源失败自动降级到国内镜像源
      const dbArgs = TRIVY_DB_REPOSITORIES.map(r => `--db-repository ${r}`).join(' ')
      const javaDbArgs = TRIVY_JAVA_DB_REPOSITORIES.map(r => `--java-db-repository ${r}`).join(' ')
      const result = await sshService.executeCommand(
        serverId,
        `${env}trivy image ${dbArgs} ${javaDbArgs} --format json --no-progress --quiet ${imageName} 2>&1`,
        0,
        1000,
        600000 // 首次扫描需下载漏洞数据库，最长 10 分钟
      )

      if (!result.success) {
        log.error(`Trivy scan failed: ${result.stderr}`)
        return {
          success: false,
          message: result.stderr || '扫描失败',
          trivyInstalled: true,
          vulnerabilities: [],
          summary: empty,
          scanTime: now
        }
      }

      const vulnerabilities = this.parseTrivyOutput(result.stdout)
      const summary: ScanSummary = { ...empty, total: vulnerabilities.length }
      for (const v of vulnerabilities) {
        summary[v.severity]++
      }

      log.info(`Scan completed for ${imageName}: ${vulnerabilities.length} vulnerabilities found`)
      return {
        success: true,
        message: `扫描完成，发现 ${vulnerabilities.length} 个漏洞`,
        trivyInstalled: true,
        vulnerabilities,
        summary,
        scanTime: now
      }
    } catch (error) {
      log.error('scanImage error:', error)
      return {
        success: false,
        message: (error as Error).message,
        trivyInstalled: false,
        vulnerabilities: [],
        summary: empty,
        scanTime: now
      }
    }
  }
}

export const securityScanService = new SecurityScanService()

export interface DockerCheckResult {
  dockerInstalled: boolean
  dockerRunning: boolean
  dockerVersion: string
  composeInstalled: boolean
  composeVersion: string
  error?: string
}

export interface CheckResultItem {
  label: string
  status: 'success' | 'error' | 'checking'
  value?: string
  error?: string
}

export type DockerCheckStatus = 'idle' | 'checking' | 'success' | 'error'
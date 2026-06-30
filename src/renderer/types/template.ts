export type TemplateCategory = 'web' | 'database' | 'cache' | 'cms' | 'app'

export interface EnvVariableSchema {
  name: string
  defaultValue?: string
  description?: string
  required?: boolean
}

export interface Template {
  id: string
  name: string
  description: string
  category: TemplateCategory
  dockerCompose: string
  isBuiltIn: boolean
  envSchema: EnvVariableSchema[]
  createdAt: string
}

export interface TemplateFormData {
  name: string
  description: string
  category: TemplateCategory
  dockerCompose: string
  envSchema: EnvVariableSchema[]
}

export const CATEGORY_LABELS: Record<TemplateCategory, { zh: string; en: string }> = {
  web: { zh: 'Web服务器', en: 'Web Server' },
  database: { zh: '数据库', en: 'Database' },
  cache: { zh: '缓存', en: 'Cache' },
  cms: { zh: 'CMS', en: 'CMS' },
  app: { zh: '应用', en: 'Application' }
}

export const ALL_CATEGORIES: TemplateCategory[] = ['web', 'database', 'cache', 'cms', 'app']

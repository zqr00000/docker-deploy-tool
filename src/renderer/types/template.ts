export type TemplateCategory = 'web' | 'database' | 'cache' | 'cms' | 'app'

export interface Template {
  id: string
  name: string
  description: string
  category: TemplateCategory
  dockerCompose: string
  isBuiltIn: boolean
  createdAt: string
}

export interface TemplateFormData {
  name: string
  description: string
  category: TemplateCategory
  dockerCompose: string
}

export const CATEGORY_LABELS: Record<TemplateCategory, { zh: string; en: string }> = {
  web: { zh: 'Web服务器', en: 'Web Server' },
  database: { zh: '数据库', en: 'Database' },
  cache: { zh: '缓存', en: 'Cache' },
  cms: { zh: 'CMS', en: 'CMS' },
  app: { zh: '应用', en: 'Application' }
}

export const ALL_CATEGORIES: TemplateCategory[] = ['web', 'database', 'cache', 'cms', 'app']

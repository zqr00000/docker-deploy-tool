import type { Template, TemplateFormData, EnvVariableSchema } from './electron-api'

// Template / TemplateFormData / EnvVariableSchema 的规范定义在 ./electron-api（单一来源），
// 此处 re-export 供 UI 使用；分类枚举与展示元数据仍由本文件维护
export type { Template, TemplateFormData, EnvVariableSchema }

export type TemplateCategory = 'web' | 'database' | 'cache' | 'cms' | 'app' | 'message-queue' | 'search' | 'monitoring' | 'ci-cd' | 'devops' | 'storage' | 'proxy' | 'stack'

export const CATEGORY_LABELS: Record<TemplateCategory, { zh: string; en: string }> = {
  web: { zh: 'Web服务器', en: 'Web Server' },
  database: { zh: '数据库', en: 'Database' },
  cache: { zh: '缓存', en: 'Cache' },
  cms: { zh: 'CMS', en: 'CMS' },
  app: { zh: '应用', en: 'Application' },
  'message-queue': { zh: '消息队列', en: 'Message Queue' },
  search: { zh: '搜索引擎', en: 'Search Engine' },
  monitoring: { zh: '监控', en: 'Monitoring' },
  'ci-cd': { zh: 'CI/CD', en: 'CI/CD' },
  devops: { zh: 'DevOps', en: 'DevOps' },
  storage: { zh: '存储', en: 'Storage' },
  proxy: { zh: '代理', en: 'Proxy' },
  stack: { zh: '应用栈', en: 'App Stack' }
}

export const ALL_CATEGORIES: TemplateCategory[] = [
  'web', 'database', 'cache', 'cms', 'app', 'message-queue',
  'search', 'monitoring', 'ci-cd', 'devops', 'storage', 'proxy', 'stack'
]

export const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  web: 'blue',
  database: 'green',
  cache: 'orange',
  cms: 'purple',
  app: 'cyan',
  'message-queue': 'magenta',
  search: 'geekblue',
  monitoring: 'volcano',
  'ci-cd': 'lime',
  devops: 'gold',
  storage: 'default',
  proxy: 'processing',
  stack: 'red'
}

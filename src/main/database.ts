import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import log from 'electron-log'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.')
  }
  return db
}

export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
    log.info(`Created database directory: ${dbDir}`)
  }

  const dbPath = join(dbDir, 'docker-deploy-tool.db')
  log.info(`Initializing database at: ${dbPath}`)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  createTables()

  log.info('Database initialized successfully')
  return db
}

function createTables(): void {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      authType TEXT NOT NULL DEFAULT 'password',
      password TEXT,
      privateKey TEXT,
      status TEXT DEFAULT 'offline',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      dockerCompose TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      templateId TEXT NOT NULL,
      serverId TEXT NOT NULL,
      projectPath TEXT NOT NULL,
      status TEXT DEFAULT 'stopped',
      containerIds TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (templateId) REFERENCES templates(id) ON DELETE CASCADE,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE
    );
  `)

  migrateAppsTable()
  migrateTemplatesTable()
  log.info('Database tables created/verified')
}

function migrateAppsTable(): void {
  if (!db) return

  try {
    const columns = db.prepare('PRAGMA table_info(apps)').all() as { name: string }[]
    const columnNames = columns.map(c => c.name)

    if (!columnNames.includes('projectPath')) {
      db.exec('ALTER TABLE apps ADD COLUMN projectPath TEXT NOT NULL DEFAULT \'/opt/docker-apps\'')
    }
    if (!columnNames.includes('containerIds')) {
      db.exec('ALTER TABLE apps ADD COLUMN containerIds TEXT DEFAULT \'[]\'')
    }
    if (!columnNames.includes('status')) {
      db.exec('ALTER TABLE apps ADD COLUMN status TEXT DEFAULT \'stopped\'')
    }

    log.info('Apps table migration completed')
  } catch (error) {
    log.error('Apps table migration error:', error)
  }
}

function migrateTemplatesTable(): void {
  if (!db) return

  try {
    const columns = db.prepare('PRAGMA table_info(templates)').all() as { name: string }[]
    const columnNames = columns.map(c => c.name)

    if (!columnNames.includes('category')) {
      db.exec('ALTER TABLE templates ADD COLUMN category TEXT NOT NULL DEFAULT \'app\'')
    }
    if (!columnNames.includes('isBuiltIn')) {
      db.exec('ALTER TABLE templates ADD COLUMN isBuiltIn INTEGER NOT NULL DEFAULT 0')
    }
    if (!columnNames.includes('envSchema')) {
      db.exec('ALTER TABLE templates ADD COLUMN envSchema TEXT DEFAULT \'[]\'')
    }

    log.info('Templates table migration completed')
  } catch (error) {
    log.error('Templates table migration error:', error)
  }
}



const DEFAULT_TEMPLATES = [
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    description: '高性能 HTTP 和反向代理服务器',
    category: 'web',
    dockerCompose: 'version: "3.8"\nservices:\n  nginx:\n    image: nginx:${NGINX_VERSION:-latest}\n    ports:\n      - "${HTTP_PORT:-80}:80"\n      - "${HTTPS_PORT:-443}:443"\n    volumes:\n      - ./conf:/etc/nginx/conf.d\n      - ./html:/usr/share/nginx/html\n      - ./logs:/var/log/nginx\n    restart: unless-stopped',
    envSchema: [
      { name: 'NGINX_VERSION', defaultValue: 'latest', description: 'Nginx 版本', required: false },
      { name: 'HTTP_PORT', defaultValue: '80', description: 'HTTP 端口', required: false },
      { name: 'HTTPS_PORT', defaultValue: '443', description: 'HTTPS 端口', required: false }
    ]
  },
  {
    id: 'mysql',
    name: 'MySQL 数据库',
    description: 'MySQL 8.0 数据库服务器，适合中小型应用数据存储',
    category: 'database',
    dockerCompose: 'version: "3.8"\nservices:\n  mysql:\n    image: mysql:${MYSQL_VERSION:-8.0}\n    ports:\n      - "${MYSQL_PORT:-3306}:3306"\n    environment:\n      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}\n      MYSQL_DATABASE: ${MYSQL_DATABASE:-app}\n      MYSQL_USER: ${MYSQL_USER:-app_user}\n      MYSQL_PASSWORD: ${MYSQL_PASSWORD}\n    volumes:\n      - mysql_data:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  mysql_data:',
    envSchema: [
      { name: 'MYSQL_VERSION', defaultValue: '8.0', description: 'MySQL 版本', required: false },
      { name: 'MYSQL_PORT', defaultValue: '3306', description: 'MySQL 端口', required: false },
      { name: 'MYSQL_ROOT_PASSWORD', defaultValue: '', description: 'Root 密码', required: true },
      { name: 'MYSQL_DATABASE', defaultValue: 'app', description: '数据库名', required: false },
      { name: 'MYSQL_USER', defaultValue: 'app_user', description: '用户名', required: false },
      { name: 'MYSQL_PASSWORD', defaultValue: '', description: '用户密码', required: true }
    ]
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL 数据库',
    description: 'PostgreSQL 数据库服务器，支持 JSON、地理空间数据等高级特性',
    category: 'database',
    dockerCompose: 'version: "3.8"\nservices:\n  postgres:\n    image: postgres:${POSTGRES_VERSION:-15}\n    ports:\n      - "${POSTGRES_PORT:-5432}:5432"\n    environment:\n      POSTGRES_USER: ${POSTGRES_USER:-postgres}\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n      POSTGRES_DB: ${POSTGRES_DB:-app}\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\n    restart: unless-stopped\n\nvolumes:\n  postgres_data:',
    envSchema: [
      { name: 'POSTGRES_VERSION', defaultValue: '15', description: 'PostgreSQL 版本', required: false },
      { name: 'POSTGRES_PORT', defaultValue: '5432', description: 'PostgreSQL 端口', required: false },
      { name: 'POSTGRES_USER', defaultValue: 'postgres', description: '用户名', required: false },
      { name: 'POSTGRES_PASSWORD', defaultValue: '', description: '密码', required: true },
      { name: 'POSTGRES_DB', defaultValue: 'app', description: '数据库名', required: false }
    ]
  },
  {
    id: 'redis',
    name: 'Redis 缓存',
    description: '高性能键值存储系统，常用于缓存、会话存储等场景',
    category: 'cache',
    dockerCompose: 'version: "3.8"\nservices:\n  redis:\n    image: redis:${REDIS_VERSION:-7}\n    ports:\n      - "${REDIS_PORT:-6379}:6379"\n    volumes:\n      - redis_data:/data\n    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}\n    restart: unless-stopped\n\nvolumes:\n  redis_data:',
    envSchema: [
      { name: 'REDIS_VERSION', defaultValue: '7', description: 'Redis 版本', required: false },
      { name: 'REDIS_PORT', defaultValue: '6379', description: 'Redis 端口', required: false },
      { name: 'REDIS_PASSWORD', defaultValue: '', description: 'Redis 密码', required: false }
    ]
  },
  {
    id: 'wordpress',
    name: 'WordPress CMS',
    description: '最流行的开源内容管理系统，包含 MySQL 数据库',
    category: 'cms',
    dockerCompose: 'version: "3.8"\nservices:\n  wordpress:\n    image: wordpress:${WORDPRESS_VERSION:-latest}\n    ports:\n      - "${WORDPRESS_PORT:-80}:80"\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: ${DB_USER:-wordpress}\n      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}\n      WORDPRESS_DB_NAME: ${DB_NAME:-wordpress}\n    volumes:\n      - wordpress_data:/var/www/html\n    depends_on:\n      - db\n    restart: unless-stopped\n\n  db:\n    image: mysql:${MYSQL_VERSION:-5.7}\n    environment:\n      MYSQL_DATABASE: ${DB_NAME:-wordpress}\n      MYSQL_USER: ${DB_USER:-wordpress}\n      MYSQL_PASSWORD: ${DB_PASSWORD}\n      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}\n    volumes:\n      - db_data:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  wordpress_data:\n  db_data:',
    envSchema: [
      { name: 'WORDPRESS_VERSION', defaultValue: 'latest', description: 'WordPress 版本', required: false },
      { name: 'WORDPRESS_PORT', defaultValue: '80', description: 'WordPress 端口', required: false },
      { name: 'MYSQL_VERSION', defaultValue: '5.7', description: 'MySQL 版本', required: false },
      { name: 'DB_USER', defaultValue: 'wordpress', description: '数据库用户名', required: false },
      { name: 'DB_PASSWORD', defaultValue: '', description: '数据库密码', required: true },
      { name: 'DB_NAME', defaultValue: 'wordpress', description: '数据库名', required: false },
      { name: 'DB_ROOT_PASSWORD', defaultValue: '', description: '数据库 Root 密码', required: true }
    ]
  },
  {
    id: 'nginx-php',
    name: 'Nginx + PHP-FPM',
    description: '经典的 Web 开发环境，支持 PHP 应用部署',
    category: 'web',
    dockerCompose: 'version: "3.8"\nservices:\n  web:\n    image: nginx:${NGINX_VERSION:-latest}\n    ports:\n      - "${HTTP_PORT:-80}:80"\n    volumes:\n      - ./nginx.conf:/etc/nginx/nginx.conf\n      - ./www:/var/www/html\n    depends_on:\n      - php\n    restart: unless-stopped\n\n  php:\n    image: php:${PHP_VERSION:-8.2}-fpm\n    volumes:\n      - ./www:/var/www/html\n    environment:\n      PHP_MEMORY_LIMIT: ${PHP_MEMORY_LIMIT:-256M}\n    restart: unless-stopped',
    envSchema: [
      { name: 'NGINX_VERSION', defaultValue: 'latest', description: 'Nginx 版本', required: false },
      { name: 'PHP_VERSION', defaultValue: '8.2', description: 'PHP 版本', required: false },
      { name: 'HTTP_PORT', defaultValue: '80', description: 'HTTP 端口', required: false },
      { name: 'PHP_MEMORY_LIMIT', defaultValue: '256M', description: 'PHP 内存限制', required: false }
    ]
  }
]

export function initDefaultTemplates(): void {
  if (!db) return

  const now = new Date().toISOString()
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO templates (id, name, description, category, dockerCompose, isBuiltIn, envSchema, createdAt, updatedAt)
    VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @envSchema, @createdAt, @updatedAt)
  `)

  const insertMany = db.transaction(() => {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = db.prepare('SELECT createdAt FROM templates WHERE id = ?').get(tpl.id) as { createdAt?: string }
      insertStmt.run({
        ...tpl,
        envSchema: JSON.stringify(tpl.envSchema),
        isBuiltIn: 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      })
    }
  })

  insertMany()
  log.info(`Initialized/updated ${DEFAULT_TEMPLATES.length} default templates in database`)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

export interface ServerRow {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password: string | null
  privateKey: string | null
  status: 'online' | 'offline' | 'connecting' | 'error'
  createdAt: string
  updatedAt: string
}

export interface EnvVariableSchema {
  name: string
  defaultValue?: string
  description?: string
  required?: boolean
}

export interface TemplateRow {
  id: string
  name: string
  description: string | null
  category: string
  dockerCompose: string
  isBuiltIn: number
  envSchema: string
  createdAt: string
  updatedAt: string
}

export interface AppRow {
  id: string
  name: string
  templateId: string
  serverId: string
  projectPath: string
  status: 'running' | 'stopped' | 'deploying' | 'error'
  containerIds: string
  createdAt: string
  updatedAt: string
}

export const serverQueries = {
  getAll: (): ServerRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM servers ORDER BY createdAt DESC').all() as ServerRow[]
  },

  getById: (id: string): ServerRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow | undefined
  },

  insert: (server: Omit<ServerRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO servers (id, name, host, port, username, authType, password, privateKey, status, createdAt, updatedAt)
      VALUES (@id, @name, @host, @port, @username, @authType, @password, @privateKey, @status, @createdAt, @updatedAt)
    `).run({
      ...server,
      password: server.password || null,
      privateKey: server.privateKey || null,
      createdAt: now,
      updatedAt: now
    })
  },

  update: (id: string, updates: Partial<ServerRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE servers SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  updateStatus: (id: string, status: ServerRow['status']): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE servers SET status = ?, updatedAt = ? WHERE id = ?')
      .run(status, now, id)
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM servers WHERE id = ?').run(id)
  }
}

export const templateQueries = {
  getAll: (): TemplateRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM templates ORDER BY createdAt DESC').all() as TemplateRow[]
  },

  getById: (id: string): TemplateRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
  },

  insert: (template: Omit<TemplateRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO templates (id, name, description, category, dockerCompose, isBuiltIn, envSchema, createdAt, updatedAt)
      VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @envSchema, @createdAt, @updatedAt)
    `).run({ ...template, envSchema: template.envSchema || '[]', createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<TemplateRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE templates SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  }
}

export const appQueries = {
  getAll: (): AppRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM apps ORDER BY createdAt DESC').all() as AppRow[]
  },

  getById: (id: string): AppRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined
  },

  getByServerId: (serverId: string): AppRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM apps WHERE serverId = ? ORDER BY createdAt DESC').all(serverId) as AppRow[]
  },

  insert: (app: Omit<AppRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO apps (id, name, templateId, serverId, projectPath, status, containerIds, createdAt, updatedAt)
      VALUES (@id, @name, @templateId, @serverId, @projectPath, @status, @containerIds, @createdAt, @updatedAt)
    `).run({ ...app, createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<AppRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE apps SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM apps WHERE id = ?').run(id)
  }
}

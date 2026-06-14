import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import log from 'electron-log'
import { DEFAULT_TEMPLATES } from './default-templates'

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

    log.info('Templates table migration completed')
  } catch (error) {
    log.error('Templates table migration error:', error)
  }
}

export function initDefaultTemplates(): void {
  if (!db) return

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM templates WHERE isBuiltIn = 1').get() as { count: number }
  if (existingCount.count > 0) {
    log.info(`Default templates already initialized (${existingCount.count} built-in templates)`)
    return
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO templates (id, name, description, category, dockerCompose, isBuiltIn, createdAt, updatedAt)
    VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @createdAt, @updatedAt)
  `)

  const now = new Date().toISOString()
  const insertMany = db.transaction(() => {
    for (const tpl of DEFAULT_TEMPLATES) {
      insertStmt.run({
        ...tpl,
        isBuiltIn: 1,
        createdAt: now,
        updatedAt: now
      })
    }
  })

  insertMany()
  log.info(`Initialized ${DEFAULT_TEMPLATES.length} default templates in database`)
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

export interface TemplateRow {
  id: string
  name: string
  description: string | null
  category: string
  dockerCompose: string
  isBuiltIn: number
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
      INSERT INTO templates (id, name, description, category, dockerCompose, isBuiltIn, createdAt, updatedAt)
      VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @createdAt, @updatedAt)
    `).run({ ...template, createdAt: now, updatedAt: now })
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

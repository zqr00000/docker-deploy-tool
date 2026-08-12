/**
 * 基于 better-sqlite3 的 Mastra Memory 存储
 * 实现 MemoryStorage 抽象类，将 Mastra 会话/消息持久化到本地 SQLite
 */
import type Database from 'better-sqlite3'

// ==================== 本地结构类型 ====================

interface DbThread {
  id: string
  title?: string
  resourceId: string
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

interface DbMessage {
  id: string
  threadId: string
  resourceId: string
  role?: string
  type?: string
  content: any
  createdAt?: number
  updatedAt?: number
  metadata?: Record<string, unknown>
}

const safeParse = (text: string | null | undefined): any => {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * 创建 Mastra Memory 存储域（基于 better-sqlite3）
 */
export async function createSqliteMemoryStorage(db: Database.Database): Promise<any> {
  const { MemoryStorage } = await import('@mastra/core/storage')

  class SqliteMemoryStorage extends MemoryStorage {
    private db: Database.Database

    constructor() {
      super()
      this.db = db
    }

    async init(): Promise<void> {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mastra_threads (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL,
          title TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mastra_messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          role TEXT,
          type TEXT,
          content TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_mastra_messages_thread ON mastra_messages (thread_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_mastra_threads_resource ON mastra_threads (resource_id, updated_at);
      `)
    }

    async dangerouslyClearAll(): Promise<void> {
      this.db.exec('DELETE FROM mastra_messages; DELETE FROM mastra_threads;')
    }

    // ==================== Threads ====================

    async getThreadById({ threadId, resourceId }: { threadId: string; resourceId?: string }): Promise<DbThread | null> {
      const row = this.db.prepare(
        `SELECT * FROM mastra_threads WHERE id = ?${resourceId ? ' AND resource_id = ?' : ''}`
      ).get(threadId, ...(resourceId ? [resourceId] : [])) as any
      if (!row) return null
      return this.rowToThread(row)
    }

    async saveThread({ thread }: { thread: DbThread }): Promise<DbThread> {
      const stmt = this.db.prepare(`
        INSERT INTO mastra_threads (id, resource_id, title, metadata, created_at, updated_at)
        VALUES (@id, @resourceId, @title, @metadata, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          resource_id = excluded.resource_id,
          title = excluded.title,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `)
      stmt.run(this.threadToRow(thread))
      return thread
    }

    async updateThread({ id, title, metadata }: { id: string; title?: string; metadata?: Record<string, unknown> }): Promise<DbThread> {
      const existing = await this.getThreadById({ threadId: id })
      const merged: DbThread = {
        ...(existing || { id, resourceId: 'default', createdAt: new Date(), updatedAt: new Date() }),
        title: title !== undefined ? title : existing?.title,
        metadata: metadata !== undefined ? metadata : existing?.metadata,
        updatedAt: new Date()
      }
      const stmt = this.db.prepare(`
        UPDATE mastra_threads SET title = ?, metadata = ?, updated_at = ? WHERE id = ?
      `)
      stmt.run(merged.title ?? null, JSON.stringify(merged.metadata ?? {}), merged.updatedAt.toISOString(), id)
      return merged
    }

    async deleteThread({ threadId }: { threadId: string }): Promise<void> {
      this.db.prepare('DELETE FROM mastra_messages WHERE thread_id = ?').run(threadId)
      this.db.prepare('DELETE FROM mastra_threads WHERE id = ?').run(threadId)
    }

    async listThreads(args: any): Promise<any> {
      const { resourceId, page = 0, perPage = 100, orderBy, direction, filter } = args || {}
      let where = ''
      const params: any[] = []
      if (filter?.resourceId || resourceId) {
        where += ' WHERE resource_id = ?'
        params.push(filter?.resourceId || resourceId)
      }
      const orderField = orderBy?.field === 'createdAt' ? 'created_at' : 'updated_at'
      const dir = (orderBy?.direction || direction || 'desc').toUpperCase()
      const orderClause = ` ORDER BY ${orderField} ${dir === 'ASC' ? 'ASC' : 'DESC'}`

      const total = (this.db.prepare(`SELECT COUNT(*) as c FROM mastra_threads${where}`).get(...params) as any).c
      const limit = perPage === false ? total : perPage
      const rows = this.db.prepare(`SELECT * FROM mastra_threads${where}${orderClause} LIMIT ? OFFSET ?`)
        .all(...params, limit, page * limit) as any[]
      return {
        threads: rows.map(r => this.rowToThread(r)),
        total,
        page,
        perPage: perPage === false ? undefined : perPage
      }
    }

    // ==================== Messages ====================

    async listMessages(args: any): Promise<any> {
      const { threadId, resourceId, page = 0, perPage = 100 } = args || {}
      const threadIds = Array.isArray(threadId) ? threadId : [threadId]
      const placeholders = threadIds.map(() => '?').join(',')
      const params: any[] = [...threadIds]
      let where = ` WHERE thread_id IN (${placeholders})`
      if (resourceId) {
        where += ' AND resource_id = ?'
        params.push(resourceId)
      }
      const total = (this.db.prepare(`SELECT COUNT(*) as c FROM mastra_messages${where}`).get(...params) as any).c
      const rows = this.db.prepare(`SELECT * FROM mastra_messages${where} ORDER BY created_at ASC LIMIT ? OFFSET ?`)
        .all(...params, perPage, page * perPage) as any[]
      return {
        messages: rows.map(r => this.rowToMessage(r)),
        total,
        page,
        perPage
      }
    }

    async listMessagesById({ messageIds }: { messageIds: string[] }): Promise<any> {
      if (messageIds.length === 0) return { messages: [] }
      const placeholders = messageIds.map(() => '?').join(',')
      const rows = this.db.prepare(`SELECT * FROM mastra_messages WHERE id IN (${placeholders})`)
        .all(...messageIds) as any[]
      return { messages: rows.map(r => this.rowToMessage(r)) }
    }

    async saveMessages({ messages }: { messages: any[] }): Promise<any> {
      const stmt = this.db.prepare(`
        INSERT INTO mastra_messages (id, thread_id, resource_id, role, type, content, metadata, created_at, updated_at)
        VALUES (@id, @threadId, @resourceId, @role, @type, @content, @metadata, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          role = excluded.role,
          type = excluded.type,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `)
      for (const msg of messages) {
        stmt.run(this.messageToRow(msg))
      }
      return { messages }
    }

    async updateMessages({ messages }: { messages: any[] }): Promise<any> {
      const stmt = this.db.prepare(`
        UPDATE mastra_messages SET content = ?, role = ?, type = ?, metadata = ?, updated_at = ? WHERE id = ?
      `)
      const updated: DbMessage[] = []
      for (const msg of messages) {
        const existing = await this.listMessagesById({ messageIds: [msg.id] })
        const merged = { ...(existing.messages[0] || {}), ...msg }
        stmt.run(
          JSON.stringify(msg.content ?? merged.content ?? {}),
          msg.role ?? merged.role ?? null,
          msg.type ?? merged.type ?? null,
          JSON.stringify(msg.metadata ?? merged.metadata ?? {}),
          new Date().toISOString(),
          msg.id
        )
        updated.push(merged)
      }
      return updated
    }

    // ==================== 序列化辅助 ====================

    private rowToThread(row: any): DbThread {
      return {
        id: row.id,
        resourceId: row.resource_id,
        title: row.title ?? undefined,
        metadata: safeParse(row.metadata),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }
    }

    private threadToRow(thread: DbThread): any {
      return {
        id: thread.id,
        resourceId: thread.resourceId,
        title: thread.title ?? null,
        metadata: JSON.stringify(thread.metadata ?? {}),
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString()
      }
    }

    private rowToMessage(row: any): DbMessage {
      return {
        id: row.id,
        threadId: row.thread_id,
        resourceId: row.resource_id,
        role: row.role ?? undefined,
        type: row.type ?? undefined,
        content: safeParse(row.content),
        metadata: safeParse(row.metadata),
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined
      }
    }

    private messageToRow(msg: DbMessage): any {
      return {
        id: msg.id,
        threadId: msg.threadId,
        resourceId: msg.resourceId,
        role: msg.role ?? null,
        type: msg.type ?? null,
        content: JSON.stringify(msg.content ?? {}),
        metadata: JSON.stringify(msg.metadata ?? {}),
        createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: msg.updatedAt ? new Date(msg.updatedAt).toISOString() : null
      }
    }
  }

  const instance = new SqliteMemoryStorage()
  await instance.init()
  return instance
}

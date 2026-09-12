import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

interface DatabaseRuntime {
  pool: Pool
  db: ReturnType<typeof drizzle<typeof schema>>
}

const globalDatabase = globalThis as typeof globalThis & { __forkvdoDatabase?: DatabaseRuntime }

export function databaseUrl() {
  const config = useRuntimeConfig()
  const value = String(config.databaseUrl || '').trim()
  if (!value)
    throw createError({ statusCode: 503, statusMessage: '数据库尚未配置' })
  return value
}

export function useDatabasePool() {
  if (!globalDatabase.__forkvdoDatabase) {
    const pool = new Pool({ connectionString: databaseUrl(), max: 10, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
    globalDatabase.__forkvdoDatabase = { pool, db: drizzle(pool, { schema }) }
  }
  return globalDatabase.__forkvdoDatabase.pool
}

export function useDatabase() {
  useDatabasePool()
  return globalDatabase.__forkvdoDatabase!.db
}

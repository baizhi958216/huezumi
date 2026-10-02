import type { SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { Buffer } from 'node:buffer'
import { and, eq, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

const cursorSchema = z.object({ time: z.iso.datetime(), id: z.uuid() })
export function pageQuery(input: Record<string, unknown>) {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().max(400).optional(), q: z.string().max(200).optional(), projectId: z.uuid().optional(), kind: z.enum(['text', 'video', 'image']).optional(), status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN']).optional() }).parse(input)
  let cursor: z.infer<typeof cursorSchema> | undefined
  if (query.cursor) {
    try {
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()))
    }
    catch {
      throw createError({ statusCode: 422, statusMessage: '分页游标无效' })
    }
  }
  return { ...query, cursor }
}
export function pageTime(column: PgColumn) {
  // JS Date carries milliseconds; use the same precision for ordering and cursor comparison.
  return sql`date_trunc('milliseconds', ${column})`
}
export function cursorCondition(time: PgColumn, id: PgColumn, cursor?: {
  time: string
  id: string
}): SQL | undefined {
  return cursor ? or(lt(pageTime(time), new Date(cursor.time)), and(eq(pageTime(time), new Date(cursor.time)), lt(id, cursor.id))) : undefined
}
export function pageResult<T extends {
  id: string
  createdAt: Date
}>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ time: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null }
}

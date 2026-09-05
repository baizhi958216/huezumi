import { count, eq, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets, generations, users } from '../../database/schema'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDatabase()
  const [[userCount], [generationCount], [activeCount], [failedCount], [assetUsage]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(generations),
    db.select({ value: count() }).from(generations).where(sql`${generations.status} in ('PENDING', 'RUNNING')`),
    db.select({ value: count() }).from(generations).where(eq(generations.status, 'FAILED')),
    db.select({ value: sql<number>`coalesce(sum(${assets.size}), 0)::bigint` }).from(assets),
  ])
  return {
    users: userCount?.value ?? 0,
    generations: generationCount?.value ?? 0,
    active: activeCount?.value ?? 0,
    failed: failedCount?.value ?? 0,
    assetBytes: Number(assetUsage?.value ?? 0),
  }
})

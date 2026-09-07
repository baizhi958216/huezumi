import { toPublicGenerationRecord } from '#shared/types/generation'
import { desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { generations, users } from '../../database/schema'
import { rowToGeneration } from '../../services/generation-store'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDatabase().select({ generation: generations, email: users.email, displayName: users.displayName }).from(generations).innerJoin(users, eq(users.id, generations.ownerId)).orderBy(desc(generations.createdAt)).limit(200)
  return rows.map(row => ({ ...toPublicGenerationRecord(rowToGeneration(row.generation)), owner: { email: row.email, displayName: row.displayName } }))
})

import { toPublicGenerationRecord } from '#shared/types/generation'
import { desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { generations } from '../../database/schema'
import { rowToGeneration } from '../../services/generation-store'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await useDatabase().select().from(generations).where(eq(generations.ownerId, user.id)).orderBy(desc(generations.createdAt)).limit(200)
  return rows.map(row => toPublicGenerationRecord(rowToGeneration(row)))
})

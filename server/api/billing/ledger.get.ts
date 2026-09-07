import { desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { ledgerEntries } from '../../database/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await useDatabase().select({
    id: ledgerEntries.id,
    type: ledgerEntries.type,
    amountCredits: ledgerEntries.amountCredits,
    reason: ledgerEntries.reason,
    generationId: ledgerEntries.generationId,
    createdAt: ledgerEntries.createdAt,
  }).from(ledgerEntries).where(eq(ledgerEntries.userId, user.id)).orderBy(desc(ledgerEntries.createdAt)).limit(100)
})

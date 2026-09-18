import { and, desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { ledgerEntries } from '../../database/schema'
import { requireUser } from '../../utils/auth'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const p = pageQuery(getQuery(event))
  const rows = await useDatabase().select({ id: ledgerEntries.id, type: ledgerEntries.type, amountCredits: ledgerEntries.amountCredits, reason: ledgerEntries.reason, generationId: ledgerEntries.generationId, runId: ledgerEntries.runId, createdAt: ledgerEntries.createdAt }).from(ledgerEntries).where(and(eq(ledgerEntries.userId, user.id), cursorCondition(ledgerEntries.createdAt, ledgerEntries.id, p.cursor))).orderBy(desc(pageTime(ledgerEntries.createdAt)), desc(ledgerEntries.id)).limit(p.limit + 1)
  const page = pageResult(rows, p.limit)
  return { ...page, items: page.items.map(r => ({ ...r, reason: r.reason || undefined, generationId: r.generationId || undefined, createdAt: r.createdAt.toISOString() })) }
})

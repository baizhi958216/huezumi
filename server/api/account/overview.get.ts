import type { AccountOverview } from '#shared/types/account'
import { toPublicGenerationRecord } from '#shared/types/generation'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets, generations, ledgerEntries, modelAssets, wallets } from '../../database/schema'
import { rowToGeneration } from '../../services/generation-store'
import { listOwnedModelAssets } from '../../services/model-assets'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event): Promise<AccountOverview> => {
  const user = await requireUser(event)
  const db = useDatabase()

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1)
  const [mediaUsage] = await db.select({
    used: sql<number>`coalesce(sum(${assets.size}), 0)::bigint`,
  }).from(assets).where(and(eq(assets.ownerId, user.id), isNull(assets.deletedAt)))
  const [modelUsage] = await db.select({
    count: sql<number>`count(*)::int`,
    used: sql<number>`coalesce(sum(${modelAssets.sizeBytes}), 0)::bigint`,
  }).from(modelAssets).where(and(eq(modelAssets.ownerId, user.id), isNull(modelAssets.deletedAt)))
  const [workStats] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where ${generations.status} in ('PENDING', 'RUNNING'))::int`,
    successful: sql<number>`count(*) filter (where ${generations.status} = 'SUCCEEDED')::int`,
  }).from(generations).where(eq(generations.ownerId, user.id))
  const [creditStats] = await db.select({
    totalSpent: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'charge' and ${ledgerEntries.amountCredits} < 0 then -${ledgerEntries.amountCredits} else 0 end), 0)::int`,
    monthSpent: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'charge' and ${ledgerEntries.amountCredits} < 0 and ${ledgerEntries.createdAt} >= date_trunc('month', now()) then -${ledgerEntries.amountCredits} else 0 end), 0)::int`,
  }).from(ledgerEntries).where(eq(ledgerEntries.userId, user.id))

  const [recentLedger, recentWorks, recentModels] = await Promise.all([
    db.select({
      id: ledgerEntries.id,
      type: ledgerEntries.type,
      amountCredits: ledgerEntries.amountCredits,
      reason: ledgerEntries.reason,
      generationId: ledgerEntries.generationId,
      createdAt: ledgerEntries.createdAt,
    }).from(ledgerEntries).where(eq(ledgerEntries.userId, user.id)).orderBy(desc(ledgerEntries.createdAt)).limit(8),
    db.select().from(generations).where(eq(generations.ownerId, user.id)).orderBy(desc(generations.createdAt)).limit(6),
    listOwnedModelAssets(user.id, 6),
  ])

  const balance = wallet?.balanceCredits ?? 0
  const reserved = wallet?.reservedCredits ?? 0
  const mediaUsedBytes = Number(mediaUsage?.used ?? 0)
  const modelUsedBytes = Number(modelUsage?.used ?? 0)

  return {
    credits: {
      balance,
      reserved,
      available: balance - reserved,
      totalSpent: Number(creditStats?.totalSpent ?? 0),
      monthSpent: Number(creditStats?.monthSpent ?? 0),
    },
    storage: {
      mediaUsedBytes,
      modelUsedBytes,
      totalUsedBytes: mediaUsedBytes + modelUsedBytes,
      limitBytes: user.storageLimitBytes,
    },
    counts: {
      works: Number(workStats?.total ?? 0),
      activeWorks: Number(workStats?.active ?? 0),
      successfulWorks: Number(workStats?.successful ?? 0),
      models: Number(modelUsage?.count ?? 0),
    },
    recentLedger: recentLedger.map(entry => ({
      ...entry,
      reason: entry.reason || undefined,
      generationId: entry.generationId || undefined,
      createdAt: entry.createdAt.toISOString(),
    })),
    recentWorks: recentWorks.map(row => toPublicGenerationRecord(rowToGeneration(row))),
    recentModels,
  }
})

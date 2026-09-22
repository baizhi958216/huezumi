import { imageCredits } from '#shared/utils/image-pricing'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets, creativeProjects, ledgerEntries, pricingRules, quotes, runs, works } from '../../database/schema'
import { archiveRemoteOutput } from '../output-archive'
import { generateDashscopeImages, ImageProviderError } from '../providers/dashscope-image'
import { readConnectionVersion } from './connections'
import { resolveImageInputs } from './image-input'
import { runRequestSchema } from './schemas'
import { failRunJob } from './text-worker'

export async function runImageJob(id: string) {
  const db = useDatabase()
  const [row] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.kind, 'image')))
  if (!row || row.stage === 'complete' || row.settlementStatus === 'review')
    return
  if (row.stage === 'submitting') {
    await failRunJob(id)
    return
  }
  if (row.stage === 'queued') {
    const [claimed] = await db.update(runs).set({ status: 'RUNNING', stage: 'submitting', updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.stage, 'queued'), eq(runs.settlementStatus, 'reserved'))).returning()
    if (!claimed)
      return
    let dispatched = false
    try {
      const request = runRequestSchema.parse(row.request)
      if (request.kind !== 'image' || !row.connectionVersionId)
        throw new Error('Invalid image request')
      const { connection, version, secrets } = await readConnectionVersion(row.connectionVersionId)
      if (connection.kind !== 'image' || connection.provider !== 'dashscope' || !secrets.apiKey)
        throw new Error('Invalid image connection')
      const images = await resolveImageInputs(row.ownerId, request.input)
      const [price] = await db.select({ formula: pricingRules.formula }).from(quotes).innerJoin(pricingRules, eq(quotes.ruleId, pricingRules.id)).where(eq(quotes.id, row.quoteId!))
      if (!price)
        throw new Error('Missing image quote price')
      dispatched = true
      const urls = await generateDashscopeImages(version.settings, secrets.apiKey, request.model, request.input, images)
      await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(runs).where(eq(runs.id, id)).for('update')
        if (!locked || !['reserved', 'review'].includes(locked.settlementStatus))
          return
        for (const [index, url] of urls.entries()) {
          await tx.insert(works).values({ ownerId: row.ownerId, projectId: row.projectId, runId: id, kind: 'image', title: request.input.prompt.slice(0, 100), summary: request.input.prompt.slice(0, 500), sourceKey: `image:${id}:${index}`, sourceFile: { filename: `${id}-${index}.png`, type: 'output', url } }).onConflictDoNothing()
        }
        const charged = Math.min(row.reservedCredits, imageCredits(price.formula, urls.length))
        await tx.execute(sql`update wallets set balance_credits=balance_credits-${charged}, reserved_credits=reserved_credits-${row.reservedCredits}, updated_at=now() where user_id=${row.ownerId}`)
        await tx.insert(ledgerEntries).values({ userId: row.ownerId, runId: id, type: 'charge', amountCredits: -charged, idempotencyKey: `run:${id}:settle`, reason: `图片生成成功，共 ${urls.length} 张；释放剩余预留额度` })
        await tx.update(runs).set({ status: 'SUCCEEDED', stage: 'archiving', settlementStatus: 'settled', chargedCredits: charged, error: null, updatedAt: new Date() }).where(eq(runs.id, id))
        if (row.projectId)
          await tx.update(creativeProjects).set({ lastActiveStage: 'image', updatedAt: new Date() }).where(eq(creativeProjects.id, row.projectId))
      })
    }
    catch (error) {
      if (dispatched && !(error instanceof ImageProviderError && error.definite)) {
        await failRunJob(id)
        return
      }
      await db.transaction(async (tx) => {
        const [failed] = await tx.update(runs).set({ status: 'FAILED', stage: 'complete', settlementStatus: 'released', chargedCredits: 0, error: '图片生成失败，预留额度已释放。请检查模型连接及参考图后重试。', updatedAt: new Date() }).where(and(eq(runs.id, id), inArray(runs.settlementStatus, ['reserved', 'review']))).returning()
        if (!failed)
          return
        await tx.execute(sql`update wallets set reserved_credits=reserved_credits-${row.reservedCredits}, updated_at=now() where user_id=${row.ownerId}`)
        await tx.insert(ledgerEntries).values({ userId: row.ownerId, runId: id, type: 'release', amountCredits: row.reservedCredits, idempotencyKey: `run:${id}:settle`, reason: '图片生成明确失败' })
      })
      return
    }
  }
  // URLs are durable before downloads start. Queue/manual retries only archive, never generate again.
  const outputs = await db.select().from(works).where(eq(works.runId, id))
  let failed = false
  for (const work of outputs) {
    if (work.assetId)
      continue
    try {
      if (!work.sourceFile?.url)
        throw new Error('Missing image output')
      const archived = await archiveRemoteOutput(work.id, work.sourceFile.url, row.ownerId, 'image')
      await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(works).where(eq(works.id, work.id)).for('update')
        if (locked?.assetId)
          return
        const [asset] = await tx.insert(assets).values({ ownerId: row.ownerId, name: work.sourceFile!.filename, objectKey: archived.objectKey, size: archived.size, contentType: archived.contentType }).returning()
        await tx.update(works).set({ assetId: asset!.id, availability: 'available' }).where(eq(works.id, work.id))
      })
    }
    catch {
      failed = true
      await db.update(works).set({ availability: 'unavailable' }).where(and(eq(works.id, work.id), sql`${works.assetId} is null`))
    }
  }
  await db.update(runs).set({ stage: failed ? 'archiving' : 'complete', error: failed ? '图片已生成，但保存失败。可重试保存，不会重复生成或扣费。' : null, updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.settlementStatus, 'settled')))
  if (failed)
    throw new Error('Image output archive incomplete')
}

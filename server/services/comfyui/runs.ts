import { workflowInputSchema } from '#shared/utils/workflow'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { creativeProjects, outboxEvents, runs } from '../../database/schema'
import { requestHash } from '../../utils/request-hash'
import { publishOutbox } from '../generation-queue'
import { readConnectionVersion, readSettings } from '../platform/connections'
import { getRun } from '../platform/runs'
import { prepareWorkflow, workflowConnection } from './catalog'
import { comfyClient } from './client'

const schema = z.object({ input: workflowInputSchema, projectId: z.uuid().optional(), idempotencyKey: z.string().min(12).max(120) }).strict()

/** Workflow admission is independent of quotes, wallets and financial settlement. */
export async function submitWorkflow(ownerId: string, input: unknown) {
  const body = schema.parse(input)
  const hash = requestHash({ input: body.input, projectId: body.projectId })
  const db = useDatabase()
  const existingRun = async () => {
    const [existing] = await db.select().from(runs).where(and(eq(runs.ownerId, ownerId), eq(runs.idempotencyKey, body.idempotencyKey)))
    if (existing && (existing.kind !== 'workflow' || existing.requestHash !== hash))
      throw createError({ statusCode: 409, statusMessage: '同一幂等键不能用于不同请求' })
    return existing
  }
  const previous = await existingRun()
  if (previous)
    return getRun(ownerId, previous.id)
  const { connection, version, secrets } = await workflowConnection()
  await prepareWorkflow(ownerId, body.input, version.settings, connection.provider, secrets)
  const settings = await readSettings()
  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('platform:admission', 0))`)
    const existing = await existingRun()
    if (existing)
      return existing.id
    await readConnectionVersion(version.id)
    try {
      await comfyClient(version.settings, secrets).request('/system_stats')
    }
    catch {
      throw createError({ statusCode: 503, statusMessage: 'ComfyUI 尚未就绪，请启动服务后再提交' })
    }
    const active = await tx.execute<{ count: number }>(sql`select ((select count(*) from generations where owner_id=${ownerId} and status in ('PENDING','RUNNING')) + (select count(*) from runs where owner_id=${ownerId} and kind in ('text','image','workflow') and status in ('PENDING','RUNNING')))::int as count`)
    if ((active.rows[0]?.count || 0) >= settings.userMaxActiveGenerations)
      throw createError({ statusCode: 429, statusMessage: '进行中的任务已达上限' })
    let projectId = body.projectId
    if (projectId) {
      const [project] = await tx.select().from(creativeProjects).where(and(eq(creativeProjects.id, projectId), eq(creativeProjects.ownerId, ownerId)))
      if (!project)
        throw createError({ statusCode: 404, statusMessage: '项目不存在' })
    }
    else {
      const [project] = await tx.insert(creativeProjects).values({ ownerId, name: body.input.prompt.slice(0, 60) }).returning()
      projectId = project!.id
    }
    const [run] = await tx.insert(runs).values({ ownerId, kind: 'workflow', projectId, request: { kind: 'workflow', connectionId: connection.id, model: version.settings.defaultModel, input: body.input, projectId }, connectionVersionId: version.id, idempotencyKey: body.idempotencyKey, requestHash: hash, settlementStatus: 'not_required' }).returning()
    await tx.insert(outboxEvents).values({ topic: 'run.workflow', aggregateId: run!.id, payload: {} })
    return run!.id
  })
  publishOutbox().catch(() => console.error('Workflow outbox delivery deferred'))
  return getRun(ownerId, id)
}

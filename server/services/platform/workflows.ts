import { workflowGraphFromHistory } from '#shared/utils/comfy-history-workflow'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { comfyExecutions, creativeProjects, outboxEvents, runs } from '../../database/schema'
import { requestHash } from '../../utils/request-hash'
import { submitPrompt } from '../comfyui/client'
import { publishOutbox } from '../generation-queue'

export const workflowSubmitSchema = z.object({ prompt: z.record(z.string(), z.object({ class_type: z.string().min(1), inputs: z.record(z.string(), z.unknown()), _meta: z.object({ title: z.string() }).partial().optional() })), clientId: z.string().max(64).optional(), front: z.boolean().optional(), promptId: z.uuid().optional(), workflow: z.unknown().optional(), projectId: z.uuid().optional() })
export async function submitWorkflow(ownerId: string, body: z.infer<typeof workflowSubmitSchema>) {
  const promptId = body.promptId || crypto.randomUUID()
  const hash = requestHash(body)
  const db = useDatabase()
  const accepted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${promptId}, 0))`)
    const [existing] = await tx.select().from(runs).where(eq(runs.promptId, promptId))
    if (existing) {
      if (existing.ownerId !== ownerId || existing.requestHash !== hash)
        throw createError({ statusCode: 409, statusMessage: '执行 ID 已被使用' })
      return { id: existing.id, existing: true }
    }
    let projectId = body.projectId
    if (projectId) {
      const [project] = await tx.select().from(creativeProjects).where(and(eq(creativeProjects.id, projectId), eq(creativeProjects.ownerId, ownerId)))
      if (!project)
        throw createError({ statusCode: 404, statusMessage: '项目不存在' })
    }
    else {
      const [project] = await tx.insert(creativeProjects).values({ ownerId, name: '工作流创作' }).returning()
      projectId = project!.id
    }
    const [run] = await tx.insert(runs).values({ ownerId, kind: 'workflow', projectId, promptId, workflow: workflowGraphFromHistory({ prompt: [0, promptId, body.prompt, { extra_pnginfo: { workflow: body.workflow } }, []] }), stage: 'submitting', settlementStatus: 'exempt', requestHash: hash, idempotencyKey: `workflow:${promptId}` }).returning()
    await tx.insert(comfyExecutions).values({ ownerId, promptId })
    await tx.insert(outboxEvents).values({ topic: 'run.workflow', aggregateId: run!.id, payload: { runId: run!.id }, availableAt: new Date(Date.now() + 30000) })
    return { id: run!.id, existing: false }
  })
  const id = accepted.id
  if (accepted.existing)
    return { promptId, runId: id, number: 0, nodeErrors: {} }
  try {
    const response = await submitPrompt({ ...body, promptId })
    if (response.promptId !== promptId)
      throw new Error('Unexpected prompt identity')
    await db.update(runs).set({ status: 'RUNNING', stage: 'executing' }).where(eq(runs.id, id))
    return { ...response, runId: id }
  }
  catch (error) {
    const status = (error as {
      statusCode?: number
    }).statusCode
    await db.update(runs).set({ status: status === 422 ? 'FAILED' : 'UNKNOWN', stage: status === 422 ? 'complete' : 'review', error: status === 422 ? '工作流参数被执行端拒绝' : '提交结果待核对，不会自动重发。' }).where(eq(runs.id, id))
    throw createError({ statusCode: status === 422 ? 422 : 502, statusMessage: '工作流提交未完成，请在任务列表查看状态' })
  }
  finally {
    publishOutbox().catch(() => console.error('Workflow synchronization deferred'))
  }
}

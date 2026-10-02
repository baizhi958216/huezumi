import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../database/client'
import { auditLogs, runs } from '../../../database/schema'
import { comfyRuntimeStatus, startComfyRuntime, stopComfyRuntime } from '../../../services/comfyui/runtime'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { action } = z.object({ action: z.enum(['start', 'stop']) }).strict().parse(await readBody(event))
  return useDatabase().transaction(async (tx) => {
    // Shared with admission: do not stop between an active-task check and a submission.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('platform:admission', 0))`)
    if (action === 'stop') {
      const [active] = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.kind, 'workflow'), inArray(runs.status, ['PENDING', 'RUNNING', 'UNKNOWN']))).limit(1)
      if (active)
        throw createError({ statusCode: 409, statusMessage: '仍有执行中或待核对工作流，请处理后再停止服务' })
      const status = await comfyRuntimeStatus()
      if (!status.managed)
        throw createError({ statusCode: 409, statusMessage: '当前进程不拥有此服务，请在部署端管理' })
    }
    const result = action === 'start' ? await startComfyRuntime() : await stopComfyRuntime()
    await tx.insert(auditLogs).values({ actorUserId: user.id, action: `comfyui.${action}`, targetType: 'runtime', targetId: 'local', detail: { state: result.state } })
    return result
  })
})

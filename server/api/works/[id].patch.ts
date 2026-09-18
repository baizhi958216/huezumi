import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { creativeDocuments, creativeProjects, runs, works } from '../../database/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const body = z.object({ projectId: z.uuid() }).parse(await readBody(event))
  return await useDatabase().transaction(async (tx) => {
    const [project] = await tx.select().from(creativeProjects).where(and(eq(creativeProjects.id, body.projectId), eq(creativeProjects.ownerId, user.id)))
    const [work] = await tx.select().from(works).where(and(eq(works.id, id), eq(works.ownerId, user.id)))
    if (!project || !work)
      throw createError({ statusCode: 404, statusMessage: '作品或项目不存在' })
    await tx.update(works).set({ projectId: body.projectId }).where(eq(works.id, id))
    if (work.documentId)
      await tx.update(creativeDocuments).set({ projectId: body.projectId }).where(eq(creativeDocuments.id, work.documentId))
    if (work.runId)
      await tx.update(runs).set({ projectId: body.projectId }).where(eq(runs.id, work.runId))
    return { ok: true }
  })
})

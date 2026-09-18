import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { creativeProjects } from '../../database/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = z.object({ name: z.string().trim().min(1).max(160) }).parse(await readBody(event))
  const rows = await useDatabase().update(creativeProjects).set({ name: body.name, updatedAt: new Date() }).where(and(eq(creativeProjects.id, z.uuid().parse(getRouterParam(event, 'id'))), eq(creativeProjects.ownerId, user.id))).returning({ id: creativeProjects.id })
  if (!rows.length)
    throw createError({ statusCode: 404, statusMessage: '项目不存在' })
  return rows[0]
})

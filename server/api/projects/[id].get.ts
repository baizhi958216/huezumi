import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { creativeProjects } from '../../database/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const [row] = await useDatabase().select().from(creativeProjects).where(and(eq(creativeProjects.id, id), eq(creativeProjects.ownerId, user.id)))
  if (!row)
    throw createError({ statusCode: 404, statusMessage: '项目不存在' })
  return { id: row.id, name: row.name, status: row.status, updatedAt: row.updatedAt.toISOString() }
})

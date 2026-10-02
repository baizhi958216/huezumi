import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { workflows } from '../../database/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const deleted = await useDatabase().delete(workflows).where(and(eq(workflows.id, id), eq(workflows.ownerId, user.id))).returning({ id: workflows.id })
  if (!deleted.length)
    throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
  return { ok: true }
})

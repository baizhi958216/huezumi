import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { creativeProjects } from '../../database/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { name } = z.object({ name: z.string().trim().min(1).max(160) }).parse(await readBody(event))
  const [project] = await useDatabase().insert(creativeProjects).values({ ownerId: user.id, name }).returning()
  return { id: project!.id, name: project!.name, status: project!.status, updatedAt: project!.updatedAt.toISOString() }
})

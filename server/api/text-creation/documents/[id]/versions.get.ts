import { z } from 'zod'
import { listDocumentVersions } from '../../../../services/creative-documents'
import { requireUser } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success)
    throw createError({ statusCode: 404, statusMessage: '创作文档不存在' })
  return await listDocumentVersions(user.id, id.data)
})

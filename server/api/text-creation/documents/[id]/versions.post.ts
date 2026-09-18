import { z } from 'zod'
import { saveManualDocumentVersion } from '../../../../services/creative-documents'
import { textCreationContentSchema } from '../../../../services/text-creation'
import { requireUser } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success)
    throw createError({ statusCode: 404, statusMessage: '创作文档不存在' })
  const parsed = textCreationContentSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '文档内容无效' })
  return await saveManualDocumentVersion(user.id, id.data, parsed.data)
})

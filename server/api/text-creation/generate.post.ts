import type { TextCreationRequest } from '#shared/types/text-creation'
import { z } from 'zod'
import { saveGeneratedDocument } from '../../services/creative-documents'
import { generateTextContent } from '../../services/text-creation'
import { requireUser } from '../../utils/auth'

const schema = z.object({
  kind: z.enum(['story', 'script', 'copy']),
  brief: z.string().trim().min(5).max(12000),
  tone: z.string().trim().max(200).optional(),
  audience: z.string().trim().max(200).optional(),
  length: z.enum(['short', 'medium', 'long']),
  connectionId: z.string().trim().min(1).max(100).optional(),
  projectId: z.uuid().optional(),
  documentId: z.uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '创作要求无效，请检查内容和篇幅' })
  const request: TextCreationRequest = parsed.data
  const generated = await generateTextContent(request)
  return await saveGeneratedDocument(user.id, request, generated)
})

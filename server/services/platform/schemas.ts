import { z } from 'zod'
import { generationSchema } from '../../utils/generation-schema'

export { connectionSchema, connectionSettingsSchema, secretSchema, settingsSchema } from './config-schemas'

export const textRequestSchema = z.object({
  kind: z.enum(['story', 'script', 'copy']),
  brief: z.string().trim().min(5).max(12000),
  tone: z.string().trim().max(200).optional(),
  audience: z.string().trim().max(200).optional(),
  length: z.enum(['short', 'medium', 'long']),
  connectionId: z.string().max(100).optional(),
  projectId: z.uuid().optional(),
  documentId: z.uuid().optional(),
}).strict()
const context = { connectionId: z.uuid(), model: z.string().trim().min(1).max(120), projectId: z.uuid().optional(), sourceVersionId: z.uuid().optional(), sourceExcerpt: z.string().max(20000).optional(), baseVersionId: z.uuid().optional() }
export const runRequestSchema = z.discriminatedUnion('kind', [
  z.object({ ...context, kind: z.literal('video'), input: generationSchema }),
  z.object({ ...context, kind: z.literal('text'), input: textRequestSchema }),
])
export const submitRunSchema = z.object({ request: runRequestSchema, quoteId: z.uuid(), idempotencyKey: z.string().min(12).max(120) }).strict()

import { z } from 'zod'
import { useDatabase } from '../../../database/client'
import { auditLogs, pricingRules } from '../../../database/schema'
import { requireAdmin } from '../../../utils/auth'

const formula = z.object({
  fixedCredits: z.number().nonnegative().optional(),
  outputSecondCredits: z.number().nonnegative().optional(),
  inputVideoSecondCredits: z.number().nonnegative().optional(),
  referenceImageCredits: z.number().nonnegative().optional(),
  minimumCredits: z.number().nonnegative().optional(),
  durationTiers: z.record(z.string(), z.number().positive()).optional(),
}).refine(value => Object.keys(value).length > 0)
const schema = z.object({ provider: z.string().min(1).max(50), model: z.string().min(1).max(120), resolution: z.string().min(1).max(20).default('*'), formula, sourceLabel: z.string().min(1).max(160), sourceUrl: z.url().max(2048).optional(), version: z.number().int().positive() })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]?.message || '价格规则无效' })
  const [created] = await useDatabase().insert(pricingRules).values({ ...parsed.data, createdBy: admin.id }).returning()
  await useDatabase().insert(auditLogs).values({ actorUserId: admin.id, action: 'pricing.create', targetType: 'pricing_rule', targetId: created!.id, detail: { provider: created!.provider, model: created!.model, version: created!.version } })
  return created
})

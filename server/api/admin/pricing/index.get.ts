import { desc } from 'drizzle-orm'
import { useDatabase } from '../../../database/client'
import { pricingRules } from '../../../database/schema'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await useDatabase().select().from(pricingRules).orderBy(desc(pricingRules.createdAt))
})

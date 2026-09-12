import { resolveProviderMediaUrls } from '../../services/assets'
import { createQuote } from '../../services/billing'
import { assertRequestSupported } from '../../services/providers'
import { getCapability } from '../../services/providers/catalog'
import { requireUser } from '../../utils/auth'
import { generationSchema } from '../../utils/generation-schema'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = generationSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]?.message || '生成参数无效' })
  const capability = getCapability(parsed.data.provider)
  if (!capability)
    throw createError({ statusCode: 400, statusMessage: '供应商不存在' })
  const providerRequest = await resolveProviderMediaUrls(user.id, parsed.data)
  assertRequestSupported(capability, providerRequest)
  return await createQuote(user.id, parsed.data)
})

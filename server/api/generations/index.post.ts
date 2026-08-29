import type { GenerationRecord } from '#shared/types/generation'
import { assertRequestSupported, getVideoProvider } from '../../services/providers'
import { getCapability } from '../../services/providers/catalog'
import { generationSchema } from '../../utils/generation-schema'

export default defineEventHandler(async (event) => {
  const parsed = generationSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: parsed.error.issues[0]?.message || '生成参数无效',
      data: parsed.error.flatten(),
    })
  }

  const request = parsed.data
  const capability = getCapability(request.provider)
  if (!capability)
    throw createError({ statusCode: 400, statusMessage: `供应商 ${request.provider} 不存在` })
  assertRequestSupported(capability, request)

  const provider = getVideoProvider(request.provider)
  const result = await provider.submit(request)
  const now = new Date().toISOString()
  const record: GenerationRecord = {
    ...request,
    id: crypto.randomUUID(),
    providerTaskId: result.taskId,
    status: result.status,
    createdAt: now,
    updatedAt: now,
  }

  await useStorage('data').setItem(`generations:${record.id}`, record)
  return record
})

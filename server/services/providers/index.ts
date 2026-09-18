import type { GenerationRequest, ProviderCapability } from '#shared/types/generation'
import type { VideoProvider } from './base'
import { getMediaValidationIssue, resolveModelCapability } from '#shared/types/generation'
import { listConnections } from '../platform/connections'
import { providerCapabilities } from './catalog'
import { configuredVideoProvider } from './configured'

export { providerCapabilities }
export async function listProviderCatalog(): Promise<ProviderCapability[]> {
  const connections = await listConnections()
  return providerCapabilities.map(c => ({ ...c, enabled: connections.some(item => item.provider === c.id && item.enabled && !item.revoked) }))
}
export async function getVideoProvider(id: string): Promise<VideoProvider> {
  const connection = (await listConnections()).find(c => c.provider === id && c.enabled && !c.revoked)
  if (!connection)
    throw createError({ statusCode: 503, statusMessage: '供应商连接尚未配置' })
  return await configuredVideoProvider(connection.revisionId)
}
/**
 * 按供应商能力声明校验统一请求。
 * UI 由同一份能力驱动，正常情况下不会触发；此处是防绕过的最终闸门。
 */
export function assertRequestSupported(capability: ProviderCapability, request: GenerationRequest) {
  const fail = (message: string) => createError({ statusCode: 422, statusMessage: message })
  const selectedModel = request.model
    ? capability.models.find(model => model.id === request.model)
    : capability.models[0]
  if (request.model && !selectedModel)
    throw fail(`${capability.name} 不支持模型「${request.model}」`)
  const effectiveCapability = resolveModelCapability(capability, selectedModel?.id, request.resolution)
  const capabilityName = selectedModel ? `${capability.name} / ${selectedModel.name}` : capability.name
  if (!effectiveCapability.modes.includes(request.mode))
    throw fail(`${capabilityName} 不支持该生成模式`)
  if (!request.prompt.trim() && !effectiveCapability.supportsMediaOnly)
    throw fail(`${capabilityName} 要求填写提示词`)
  if (effectiveCapability.requiresHttpsMediaUrls) {
    for (const item of request.media) {
      try {
        if (new URL(item.url).protocol !== 'https:')
          throw new Error('not https')
      }
      catch {
        throw fail(`${capabilityName} 要求所有素材 URL 使用公网 HTTPS 地址`)
      }
    }
  }
  const mediaIssue = getMediaValidationIssue(effectiveCapability, request.media)
  if (mediaIssue?.kind === 'unsupported')
    throw fail(`${capabilityName} 不支持素材类型「${mediaIssue.type}」`)
  if (mediaIssue?.kind === 'count')
    throw fail(`「${mediaIssue.type}」最多允许 ${mediaIssue.max} 份`)
  if (mediaIssue?.kind === 'duration_required')
    throw fail(`「${mediaIssue.type}」必须提供素材自身时长（秒）`)
  if (mediaIssue?.kind === 'duration_range')
    throw fail(`「${mediaIssue.type}」素材时长需在 ${mediaIssue.min}–${mediaIssue.max} 秒之间`)
  if (mediaIssue?.kind === 'combination')
    throw fail(mediaIssue.limit.message)
  const types = request.media.map(item => item.type)
  if (types.includes('last_frame') && !types.includes('first_frame'))
    throw fail('使用尾帧时必须同时提供首帧')
  if (!effectiveCapability.resolutions.includes(request.resolution))
    throw fail(`${capabilityName} 不支持 ${request.resolution} 清晰度，可选：${effectiveCapability.resolutions.join(' / ')}`)
  if (effectiveCapability.ratios.length && !effectiveCapability.ratios.includes(request.ratio))
    throw fail(`${capabilityName} 不支持 ${request.ratio} 画幅，可选：${effectiveCapability.ratios.join(' / ')}`)
  if (request.duration === -1 && !effectiveCapability.duration.smart)
    throw fail(`${capabilityName} 不支持智能时长`)
  if (request.duration > 0) {
    if (effectiveCapability.duration.steps && !effectiveCapability.duration.steps.includes(request.duration))
      throw fail(`${capabilityName} 在 ${request.resolution} 下时长仅支持 ${effectiveCapability.duration.steps.join(' / ')} 秒`)
    if (!effectiveCapability.duration.steps && (request.duration < effectiveCapability.duration.min || request.duration > effectiveCapability.duration.max))
      throw fail(`${capabilityName} 时长需在 ${effectiveCapability.duration.min}–${effectiveCapability.duration.max} 秒之间`)
  }
  if (request.audio && !effectiveCapability.supportsAudio)
    throw fail(`${capabilityName} 暂不支持同步生成音频`)
  if (request.negativePrompt && !effectiveCapability.supportsNegativePrompt)
    throw fail(`${capabilityName} 不支持反向提示词`)
  if (request.seed !== undefined && !effectiveCapability.supportsSeed)
    throw fail(`${capabilityName} 不支持固定种子`)
  if (request.promptExtend && !effectiveCapability.supportsPromptExtend)
    throw fail(`${capabilityName} 不支持提示词智能改写`)
  if (request.watermark && !effectiveCapability.supportsWatermark)
    throw fail(`${capabilityName} 不支持水印参数`)
}

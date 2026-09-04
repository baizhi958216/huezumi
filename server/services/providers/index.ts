import type { GenerationRequest, ProviderCapability } from '#shared/types/generation'
import type { VideoProvider } from './base'
import { getMediaValidationIssue, resolveModelCapability } from '#shared/types/generation'
import { getCapability, providerCapabilities } from './catalog'
import { DashScopeProvider } from './dashscope'
import { KlingProvider } from './kling'
import { MiniMaxProvider } from './minimax'
import { SeedanceProvider } from './seedance'

export { providerCapabilities }

type RuntimeConfig = ReturnType<typeof useRuntimeConfig>

/** 检查某家供应商是否已配置凭据（决定作品台与首页显示"在线"还是"待接入"） */
export function hasCredentials(id: string, config: RuntimeConfig): boolean {
  switch (id) {
    case 'dashscope':
      return Boolean(config.dashscopeApiKey)
    case 'minimax':
      return Boolean(config.minimaxApiKey)
    case 'kling':
      return Boolean(config.klingAccessKey && config.klingSecretKey)
    case 'seedance':
      return Boolean(config.seedanceApiKey)
    default:
      return false
  }
}

/** 目录 + 运行时凭据探测，返回给前端的最终能力列表 */
export function listProviderCatalog(): ProviderCapability[] {
  const config = useRuntimeConfig()
  return providerCapabilities.map(capability => ({
    ...capability,
    enabled: hasCredentials(capability.id, config),
  }))
}

function resolveDashScopeBaseUrl(config: RuntimeConfig) {
  if (config.dashscopeBaseUrl)
    return String(config.dashscopeBaseUrl).replace(/\/$/, '')

  const workspaceId = String(config.dashscopeWorkspaceId)
  const region = String(config.dashscopeRegion || 'cn-beijing')
  if (!workspaceId)
    return 'https://dashscope.aliyuncs.com/api/v1'

  return `https://${workspaceId}.${region}.maas.aliyuncs.com/api/v1`
}

/** 新增供应商时：实现 VideoProvider → 在此注册工厂即可，其余链路零改动 */
function createProvider(id: string, config: RuntimeConfig): VideoProvider {
  switch (id) {
    case 'dashscope':
      return new DashScopeProvider({
        apiKey: String(config.dashscopeApiKey),
        baseUrl: resolveDashScopeBaseUrl(config),
        model: String(config.dashscopeModel || 'wan3.0-video-prime'),
      })
    case 'minimax':
      return new MiniMaxProvider({
        apiKey: String(config.minimaxApiKey),
        baseUrl: String(config.minimaxBaseUrl || 'https://api.minimaxi.com/v1').replace(/\/$/, ''),
        groupId: config.minimaxGroupId ? String(config.minimaxGroupId) : undefined,
      })
    case 'kling':
      return new KlingProvider({
        accessKey: String(config.klingAccessKey),
        secretKey: String(config.klingSecretKey),
        baseUrl: String(config.klingBaseUrl || 'https://api-beijing.klingai.com/v1').replace(/\/$/, ''),
      })
    case 'seedance':
      return new SeedanceProvider({
        apiKey: String(config.seedanceApiKey),
        baseUrl: String(config.seedanceBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
        model: String(config.seedanceModel || 'doubao-seedance-1-5-pro-251215'),
      })
    default:
      throw createError({ statusCode: 400, statusMessage: `供应商 ${id} 尚未接入` })
  }
}

export function getVideoProvider(id: string): VideoProvider {
  const config = useRuntimeConfig()
  if (!getCapability(id))
    throw createError({ statusCode: 400, statusMessage: `供应商 ${id} 不存在` })
  if (!hasCredentials(id, config))
    throw createError({ statusCode: 503, statusMessage: `供应商 ${id} 缺少 API 凭据，请先在服务端配置对应环境变量` })
  return createProvider(id, config)
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

  for (const item of request.media) {
    if (!effectiveCapability.media.includes(item.type))
      throw fail(`${capabilityName} 不支持素材类型「${item.type}」`)
    const max = effectiveCapability.mediaLimits[item.type]?.max
    const count = request.media.filter(media => media.type === item.type).length
    if (max !== undefined && count > max)
      throw fail(`「${item.type}」最多允许 ${max} 份`)
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
}

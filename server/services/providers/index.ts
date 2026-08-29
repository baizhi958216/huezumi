import type { GenerationRequest, ProviderCapability } from '#shared/types/generation'
import type { VideoProvider } from './base'
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

  if (!capability.modes.includes(request.mode))
    throw fail(`${capability.name} 不支持该生成模式`)

  for (const item of request.media) {
    if (!capability.media.includes(item.type))
      throw fail(`${capability.name} 不支持素材类型「${item.type}」`)
    const max = capability.mediaLimits[item.type]?.max
    const count = request.media.filter(media => media.type === item.type).length
    if (max !== undefined && count > max)
      throw fail(`「${item.type}」最多允许 ${max} 份`)
  }

  const types = request.media.map(item => item.type)
  if (types.includes('last_frame') && !types.includes('first_frame'))
    throw fail('使用尾帧时必须同时提供首帧')

  if (!capability.resolutions.includes(request.resolution))
    throw fail(`${capability.name} 不支持 ${request.resolution} 清晰度，可选：${capability.resolutions.join(' / ')}`)

  if (capability.ratios.length && !capability.ratios.includes(request.ratio))
    throw fail(`${capability.name} 不支持 ${request.ratio} 画幅，可选：${capability.ratios.join(' / ')}`)

  if (request.duration === -1 && !capability.duration.smart)
    throw fail(`${capability.name} 不支持智能时长`)
  if (request.duration > 0) {
    if (capability.duration.steps && !capability.duration.steps.includes(request.duration))
      throw fail(`${capability.name} 时长仅支持 ${capability.duration.steps.join(' / ')} 秒`)
    if (!capability.duration.steps && (request.duration < capability.duration.min || request.duration > capability.duration.max))
      throw fail(`${capability.name} 时长需在 ${capability.duration.min}–${capability.duration.max} 秒之间`)
  }

  if (request.audio && !capability.supportsAudio)
    throw fail(`${capability.name} 暂不支持同步生成音频`)
  if (request.negativePrompt && !capability.supportsNegativePrompt)
    throw fail(`${capability.name} 不支持反向提示词`)
  if (request.seed !== undefined && !capability.supportsSeed)
    throw fail(`${capability.name} 不支持固定种子`)
  if (request.promptExtend && !capability.supportsPromptExtend)
    throw fail(`${capability.name} 不支持提示词智能改写`)
}

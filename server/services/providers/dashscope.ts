import type { GenerationRequest, GenerationStatus, MediaType, ProviderTaskResult } from '#shared/types/generation'
import type { VideoProvider } from './base'

interface DashScopeConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface DashScopeResponse {
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
    video_url?: string
  }
}

function normalizeStatus(status?: string): GenerationStatus {
  if (status && ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(status))
    return status as GenerationStatus
  return 'UNKNOWN'
}

/**
 * 百炼 `video-synthesis` 异步端点被多个模型族共用，但请求体按模型族有差异（参数集与 media 组合各不相同，
 * 以 2026-09 官方 API 文档为准）。这里按模型 ID 分派构造器，只下发该模型文档声明过的字段；
 * 未声明的模型沿用供应商默认模型（wan3.0 All-in-One 协议）。
 */
type DashScopeFlavor
  = | 'wan3'
    | 'happyhorse-t2v'
    | 'happyhorse-i2v'
    | 'happyhorse-r2v'
    | 'wan27-t2v'
    | 'wan27-i2v'
    | 'wan27-r2v'
    | 'minimax-h3'
    | 'kling-v3'

function resolveFlavor(model: string): DashScopeFlavor {
  if (model.startsWith('wan3.0'))
    return 'wan3'
  if (model.startsWith('happyhorse-1.1-t2v') || model.startsWith('happyhorse-1.0-t2v'))
    return 'happyhorse-t2v'
  if (model.startsWith('happyhorse-1.1-i2v') || model.startsWith('happyhorse-1.0-i2v'))
    return 'happyhorse-i2v'
  if (model.startsWith('happyhorse-1.1-r2v') || model.startsWith('happyhorse-1.0-r2v'))
    return 'happyhorse-r2v'
  if (model.startsWith('wan2.7-t2v'))
    return 'wan27-t2v'
  if (model.startsWith('wan2.7-i2v'))
    return 'wan27-i2v'
  if (model.startsWith('wan2.7-r2v'))
    return 'wan27-r2v'
  if (model.startsWith('MiniMax/MiniMax-H3'))
    return 'minimax-h3'
  if (model.startsWith('kling/'))
    return 'kling-v3'
  return 'wan3'
}

/** wan3.0 全能参考：media 全类型透传，参数全集。 */
function buildWan3(request: GenerationRequest) {
  return {
    input: {
      prompt: request.prompt || undefined,
      negative_prompt: request.negativePrompt || undefined,
      media: request.media.length ? request.media.map(({ type, url }) => ({ type, url })) : undefined,
    },
    parameters: {
      resolution: request.resolution,
      ratio: request.ratio,
      duration: request.duration,
      audio: request.audio,
      prompt_extend: request.promptExtend,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/** HappyHorse 文生视频：仅 prompt；无反向提示词/改写/音频开关。 */
function buildHappyhorseT2V(request: GenerationRequest) {
  return {
    input: { prompt: request.prompt || undefined },
    parameters: {
      resolution: request.resolution,
      ratio: request.ratio,
      duration: request.duration,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/** HappyHorse 图生视频：必须有且仅有一张首帧；比例跟随首帧，不下发 ratio。 */
function buildHappyhorseI2V(request: GenerationRequest) {
  const firstFrame = request.media.find(item => item.type === 'first_frame')
  return {
    input: {
      prompt: request.prompt || undefined,
      media: firstFrame ? [{ type: 'first_frame', url: firstFrame.url }] : undefined,
    },
    parameters: {
      resolution: request.resolution,
      duration: request.duration,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/** HappyHorse 参考生视频：1–9 张参考图，prompt 用 [Image N] 指代。 */
function buildHappyhorseR2V(request: GenerationRequest) {
  return {
    input: {
      prompt: request.prompt || undefined,
      media: request.media
        .filter(item => item.type === 'reference_image')
        .map(({ type, url }) => ({ type, url })),
    },
    parameters: {
      resolution: request.resolution,
      ratio: request.ratio,
      duration: request.duration,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/** Wan2.7 文生视频：支持反向提示词；参考音频映射为 input.audio_url 驱动口型/卡点。 */
function buildWan27T2V(request: GenerationRequest) {
  const audioUrl = request.media.find(item => item.type === 'reference_audio')?.url
  return {
    input: {
      prompt: request.prompt || undefined,
      negative_prompt: request.negativePrompt || undefined,
      audio_url: audioUrl,
    },
    parameters: {
      resolution: request.resolution,
      ratio: request.ratio,
      duration: request.duration,
      prompt_extend: request.promptExtend,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/**
 * Wan2.7 图生视频（新版协议）：合法组合仅 first_frame(±last_frame ±driving_audio) 与
 * first_clip(±last_frame)。平台 reference_audio 映射为 driving_audio，reference_video 映射为
 * first_clip（视频续写）；比例跟随输入素材，不下发 ratio。
 */
function buildWan27I2V(request: GenerationRequest) {
  const typeMap: Partial<Record<MediaType, string>> = {
    first_frame: 'first_frame',
    last_frame: 'last_frame',
    reference_audio: 'driving_audio',
    reference_video: 'first_clip',
  }
  const media = request.media
    .filter(item => typeMap[item.type])
    .map(item => ({ type: typeMap[item.type], url: item.url }))
  return {
    input: {
      prompt: request.prompt || undefined,
      media: media.length ? media : undefined,
    },
    parameters: {
      resolution: request.resolution,
      duration: request.duration,
      prompt_extend: request.promptExtend,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/** Wan2.7 参考生视频：图/视频混合引用（合计 ≤5），可带首帧联合控制；逐素材音色参考暂不暴露。 */
function buildWan27R2V(request: GenerationRequest) {
  const allowed = new Set<MediaType>(['first_frame', 'reference_image', 'reference_video'])
  return {
    input: {
      prompt: request.prompt || undefined,
      negative_prompt: request.negativePrompt || undefined,
      media: request.media.filter(item => allowed.has(item.type)).map(({ type, url }) => ({ type, url })),
    },
    parameters: {
      resolution: request.resolution,
      ratio: request.ratio,
      duration: request.duration,
      prompt_extend: request.promptExtend,
      watermark: request.watermark,
      seed: request.seed,
    },
  }
}

/** MiniMax-H3（百炼统一接口）：原生立体声直出，无 audio/seed/改写/反向提示词；2K/768P、4–15 秒。 */
function buildMinimaxH3(request: GenerationRequest) {
  const allowed = new Set<MediaType>(['first_frame', 'last_frame', 'reference_image', 'reference_video', 'reference_audio'])
  return {
    input: {
      prompt: request.prompt || undefined,
      media: request.media.filter(item => allowed.has(item.type)).map(({ type, url }) => ({ type, url })),
    },
    parameters: {
      resolution: request.resolution,
      ratio: request.ratio,
      duration: request.duration,
      watermark: request.watermark,
    },
  }
}

/**
 * 可灵 V3 系列（百炼统一接口，仅北京地域）。
 * - 清晰度映射为 mode：720P→std、1080P→pro、4K→4k（turbo 不支持 4k）；
 * - 画幅映射为 aspect_ratio，仅文生/参考生场景必填，图生（含首帧）场景官方"无需设置"，故传首帧时省略；
 * - turbo 固定音画同出（audio 字段不生效），且不支持反向提示词；v3 / omni 支持 audio 开关与反向提示词；
 * - 平台 reference_image / reference_video 分别映射为 omni 的 refer / feature；视频编辑（base）、
 *   多镜头（multi_shot/multi_prompt）、主体列表（element_list）暂不暴露。
 */
function buildKlingV3(request: GenerationRequest) {
  const turbo = (request.model || '').includes('turbo')
  const modeMap: Partial<Record<GenerationRequest['resolution'], string>> = {
    '720P': 'std',
    '1080P': 'pro',
    '4K': '4k',
  }
  const typeMap: Partial<Record<MediaType, string>> = {
    first_frame: 'first_frame',
    last_frame: 'last_frame',
    reference_image: 'refer',
    reference_video: 'feature',
  }
  const media = request.media
    .filter(item => typeMap[item.type])
    .map(item => ({ type: typeMap[item.type], url: item.url }))
  return {
    input: {
      prompt: request.prompt || undefined,
      negative_prompt: turbo ? undefined : request.negativePrompt || undefined,
      media: media.length ? media : undefined,
    },
    parameters: {
      mode: modeMap[request.resolution],
      aspect_ratio: media.some(item => item.type === 'first_frame') ? undefined : request.ratio,
      duration: request.duration,
      audio: turbo ? undefined : request.audio,
      watermark: request.watermark,
    },
  }
}

const builders: Record<DashScopeFlavor, (request: GenerationRequest) => unknown> = {
  'wan3': buildWan3,
  'happyhorse-t2v': buildHappyhorseT2V,
  'happyhorse-i2v': buildHappyhorseI2V,
  'happyhorse-r2v': buildHappyhorseR2V,
  'wan27-t2v': buildWan27T2V,
  'wan27-i2v': buildWan27I2V,
  'wan27-r2v': buildWan27R2V,
  'minimax-h3': buildMinimaxH3,
  'kling-v3': buildKlingV3,
}

export class DashScopeProvider implements VideoProvider {
  readonly id = 'dashscope'

  constructor(private readonly config: DashScopeConfig) {}

  async submit(request: GenerationRequest) {
    const model = request.model || this.config.model
    const body = builders[resolveFlavor(model)](request)

    const response = await $fetch<DashScopeResponse>(`${this.config.baseUrl}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: { model, ...body as Record<string, unknown> },
    })

    const taskId = response.output?.task_id
    if (!taskId)
      throw new Error(response.message || response.code || 'DashScope 未返回任务 ID')

    return { taskId, status: normalizeStatus(response.output?.task_status || 'PENDING') }
  }

  async getTask(taskId: string): Promise<ProviderTaskResult> {
    const response = await $fetch<DashScopeResponse>(`${this.config.baseUrl}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    })

    return {
      status: normalizeStatus(response.output?.task_status),
      videoUrl: response.output?.video_url,
      error: response.output?.task_status === 'FAILED' ? (response.message || response.code || '生成失败') : undefined,
    }
  }
}

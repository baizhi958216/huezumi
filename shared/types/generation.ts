/**
 * 生成任务的统一数据契约。
 *
 * 设计原则：
 * 1. 平台侧只描述"要什么"（GenerationRequest），不关心任何供应商的请求结构。
 * 2. 供应商侧只负责把统一请求映射成自己的协议（VideoProvider）。
 * 3. 新增供应商 = 新增一个适配器 + 在 providerCatalog 中登记能力，前端零改动。
 */

export type ProviderId = 'dashscope' | 'minimax' | 'kling' | 'seedance' | 'rolldek' | 'runway' | (string & {})

/** 输入素材类型。与 DashScope 全能参考协议的 media.type 对齐，同时为其他供应商预留映射空间。 */
export type MediaType
  = | 'first_frame'
    | 'last_frame'
    | 'reference_image'
    | 'reference_video'
    | 'reference_audio'
    | 'file'
    | 'link'

/** 生成模式。UI 按模式组织素材输入，后端按模式校验组合合法性。 */
export type GenerationMode = 'text' | 'frames' | 'reference'

export type Resolution = '480P' | '768P' | '720P' | '1080P' | '2K' | '4K'

export type AspectRatio = 'adaptive' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'

/** 传给智能时长模式的哨兵值：模型根据提示词与素材自动决定时长。 */
export const SMART_DURATION = -1

export interface MediaInput {
  type: MediaType
  url: string
  name?: string
  /** 参考视频时长（秒）；供应商需要时用于计费或协议字段。 */
  duration?: number
}

export interface GenerationRequest {
  provider: ProviderId
  model?: string
  /** 生成模式，决定素材组合的语义（后端据此做映射与校验） */
  mode: GenerationMode
  prompt: string
  negativePrompt?: string
  media: MediaInput[]
  resolution: Resolution
  ratio: AspectRatio
  /** 2–30 的整数，或 SMART_DURATION(-1) 表示智能时长 */
  duration: number
  audio: boolean
  promptExtend: boolean
  watermark: boolean
  seed?: number
}

export type GenerationStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'

export type OutputArchiveStatus = 'not_started' | 'archived' | 'failed'
export type GenerationErrorCode
  = | 'OUTPUT_ARCHIVE_NOT_CONFIGURED'
    | 'OUTPUT_TRANSFER_FAILED'
    | 'OUTPUT_ARCHIVE_FAILED'
export interface OutputArchiveRecord {
  status: OutputArchiveStatus
  attemptedAt?: string
  completedAt?: string
  errorCode?: 'OUTPUT_ARCHIVE_NOT_CONFIGURED' | 'OUTPUT_TRANSFER_FAILED' | 'OUTPUT_ARCHIVE_FAILED'
  /** Internal OSS object key. API serializers must remove it. */
  objectKey?: string
}

export interface GenerationRecord extends GenerationRequest {
  id: string
  providerTaskId: string
  status: GenerationStatus
  videoUrl?: string
  /** 最终 videoUrl 已指向 OSS 归档，不再依赖供应商临时地址。 */
  videoArchived?: boolean
  outputArchive?: OutputArchiveRecord
  errorCode?: GenerationErrorCode
  error?: string
  /** 供应商返回的用量统计（分辨率、帧率、实际比例等） */
  usage?: {
    duration?: number
    inputVideoDuration?: number
    outputVideoDuration?: number
    fps?: number
    sr?: number
    ratio?: string
  }
  createdAt: string
  updatedAt: string
}

export interface ProviderSubmitResult {
  taskId: string
  status: GenerationStatus
}

export interface ProviderTaskResult {
  status: GenerationStatus
  videoUrl?: string
  errorCode?: GenerationErrorCode
  error?: string
  usage?: GenerationRecord['usage']
}

export interface ModelSpec {
  id: string
  name: string
  description: string
  /** 首页 / 创作台展示用的角标，如「高速」「标准」 */
  badge?: string
  /** 同一供应商下模型之间的能力差异；未填写的字段继承供应商能力。 */
  capabilities?: ModelCapabilityOverride
}

export interface ModelCapabilityOverride {
  modes?: GenerationMode[]
  media?: MediaType[]
  resolutions?: Resolution[]
  ratios?: AspectRatio[]
  duration?: DurationCapability
  supportsAudio?: boolean
  supportsNegativePrompt?: boolean
  supportsSeed?: boolean
  supportsPromptExtend?: boolean
  supportsWatermark?: boolean
  supportsMediaOnly?: boolean
  /** 指定分辨率下允许的离散时长，用于表达 1080P 仅支持 6 秒等组合限制。 */
  durationByResolution?: Partial<Record<Resolution, number[]>>
  /** 模型级素材限制；仅覆盖声明过的类型，其余类型继承供应商级限制。 */
  mediaLimits?: Partial<Record<MediaType, ProviderMediaLimit>>
  /** 模型级素材组合限制；用于表达跨类型的总数上限。 */
  mediaCombinationLimits?: MediaCombinationLimit[]
  notes?: string
}

/**
 * 跨素材类型的数量限制。
 *
 * `types` 统计参与限制的素材类型；当 `whenTypes` 存在时，仅在请求中同时出现
 * 这些触发类型后生效。例如可灵 Omni 带参考视频时，参考图上限收紧为 4 张。
 */
export interface MediaCombinationLimit {
  types: MediaType[]
  max: number
  whenTypes?: MediaType[]
  message: string
}

/** 某一种素材输入的能力与限制，用于驱动 UI 的上传控件与校验提示。 */
export interface MediaCapability {
  type: MediaType
  label: string
  hint: string
  icon: string
  /** 单个任务中允许的数量上限 */
  max: number
  /** input[type=file] 的 accept */
  accept: string
  /** 允许的文件扩展名，用于前端预校验 */
  extensions?: string[]
  /** 单个文件大小上限（字节） */
  maxBytes: number
  /** 素材自身的时长限制（秒），仅对音视频有效 */
  duration?: { min: number, max: number }
  /** 同类素材总时长上限（秒），仅对音视频有效 */
  totalDuration?: number
  /** 该类型是否可以与 reference_* 混用 */
  exclusiveGroup: 'frames' | 'reference'
}

/** 时长能力 */
export interface DurationCapability {
  min: number
  max: number
  /** 是否支持智能时长（-1） */
  smart: boolean
  /**
   * 是否有视频素材时，输出时长需满足：输入视频总时长 + 输出时长 <= max。
   * DashScope 有此约束（合计 30 秒）。
   */
  videoAware: boolean
  /** 离散档位（如 MiniMax 6/10s、Kling 5/10s）。提供时 UI 渲染为档位选择而非滑杆 */
  steps?: number[]
}

export type ProviderMediaLimit = Pick<MediaCapability, 'max' | 'accept' | 'extensions' | 'maxBytes' | 'duration' | 'totalDuration'> & {
  /** 覆盖该供应商下的通用素材提示。 */
  hint?: string
  /** 该素材是否必须携带自身时长（秒），例如 RollDek 参考视频按秒计费。 */
  requiresDuration?: boolean
}

/** 供应商能力声明。前端完全由这份声明驱动，不硬编码任何一家供应商的参数。 */
export interface ProviderCapability {
  id: ProviderId
  name: string
  vendor: string
  enabled: boolean
  comingSoon?: boolean
  models: ModelSpec[]
  modes: GenerationMode[]
  media: MediaType[]
  mediaLimits: Partial<Record<MediaType, ProviderMediaLimit>>
  mediaCombinationLimits?: MediaCombinationLimit[]
  resolutions: Resolution[]
  ratios: AspectRatio[]
  duration: DurationCapability
  supportsAudio: boolean
  supportsNegativePrompt: boolean
  supportsSeed: boolean
  supportsWatermark: boolean
  supportsPromptExtend: boolean
  /** 是否允许 prompt 与 media 同时为空（部分供应商要求必填提示词） */
  supportsMediaOnly: boolean
  /** 是否要求媒体 URL 使用绝对 HTTPS 地址；公网可访问性仍由供应商负责验证。 */
  requiresHttpsMediaUrls?: boolean
  notes?: string
  docsUrl?: string
}

export type PublicOutputArchiveRecord = Omit<OutputArchiveRecord, 'objectKey'>
export type PublicGenerationRecord = Omit<GenerationRecord, 'outputArchive'> & {
  outputArchive?: PublicOutputArchiveRecord
}

/** One explicit response boundary prevents storage-only fields from leaking. */
export function toPublicGenerationRecord(record: GenerationRecord): PublicGenerationRecord {
  const { outputArchive, ...publicRecord } = record
  const result: PublicGenerationRecord = { ...publicRecord }
  if (outputArchive) {
    const { objectKey: _objectKey, ...publicArchive } = outputArchive
    result.outputArchive = publicArchive
  }
  return result
}

/**
 * 把供应商能力与选中模型的覆盖项合并，供创作台和 API 校验共用。
 * resolution 传入后会进一步收敛该清晰度对应的离散时长。
 */
export function resolveModelCapability(
  provider: ProviderCapability,
  modelId?: string,
  resolution?: Resolution,
): ProviderCapability {
  const model = provider.models.find(item => item.id === modelId)
  const override = model?.capabilities
  if (!override)
    return provider

  const durationSteps = resolution ? override.durationByResolution?.[resolution] : undefined
  const duration = {
    ...(override.duration || provider.duration),
    ...(durationSteps ? { steps: durationSteps } : {}),
  }

  return {
    ...provider,
    modes: override.modes || provider.modes,
    media: override.media || provider.media,
    resolutions: override.resolutions || provider.resolutions,
    ratios: override.ratios || provider.ratios,
    duration,
    supportsAudio: override.supportsAudio ?? provider.supportsAudio,
    supportsNegativePrompt: override.supportsNegativePrompt ?? provider.supportsNegativePrompt,
    supportsSeed: override.supportsSeed ?? provider.supportsSeed,
    supportsPromptExtend: override.supportsPromptExtend ?? provider.supportsPromptExtend,
    supportsWatermark: override.supportsWatermark ?? provider.supportsWatermark,
    supportsMediaOnly: override.supportsMediaOnly ?? provider.supportsMediaOnly,
    mediaLimits: override.mediaLimits
      ? { ...provider.mediaLimits, ...override.mediaLimits }
      : provider.mediaLimits,
    mediaCombinationLimits: override.mediaCombinationLimits ?? provider.mediaCombinationLimits,
    notes: override.notes || provider.notes,
  }
}

export type MediaValidationIssue
  = | { kind: 'unsupported', type: MediaType }
    | { kind: 'count', type: MediaType, max: number }
    | { kind: 'duration_required', type: MediaType }
    | { kind: 'duration_range', type: MediaType, min: number, max: number }
    | { kind: 'combination', limit: MediaCombinationLimit }

/** 返回第一条素材数量、时长或组合校验错误，供前端提示和服务端 422 共用。 */
export function getMediaValidationIssue(
  capability: ProviderCapability,
  media: MediaInput[],
): MediaValidationIssue | undefined {
  const counts = new Map<MediaType, number>()
  for (const item of media) {
    if (!capability.media.includes(item.type))
      return { kind: 'unsupported', type: item.type }

    const count = (counts.get(item.type) || 0) + 1
    counts.set(item.type, count)
    const limit = capability.mediaLimits[item.type]
    const max = limit?.max
    if (max !== undefined && count > max)
      return { kind: 'count', type: item.type, max }
    if (limit?.requiresDuration && item.duration === undefined)
      return { kind: 'duration_required', type: item.type }
    if (item.duration !== undefined && limit?.duration
      && (item.duration < limit.duration.min || item.duration > limit.duration.max)) {
      return { kind: 'duration_range', type: item.type, min: limit.duration.min, max: limit.duration.max }
    }
  }

  for (const limit of capability.mediaCombinationLimits || []) {
    if (limit.whenTypes && !limit.whenTypes.every(type => counts.has(type)))
      continue
    const count = media.filter(item => limit.types.includes(item.type)).length
    if (count > limit.max)
      return { kind: 'combination', limit }
  }
}

/** 生成模式的展示元数据，与供应商能力无关，供 UI 复用。 */
export const MODE_META: Record<GenerationMode, { label: string, hint: string, icon: string }> = {
  text: { label: '文生视频', hint: '从文字描述直接生成画面', icon: 'i-lucide-type' },
  frames: { label: '首尾帧', hint: '首帧定位开场，尾帧锁定收尾', icon: 'i-lucide-panels-top-left' },
  reference: { label: '多模态参考', hint: '图片、视频、音频组合驱动', icon: 'i-lucide-layers-3' },
}

/** 素材类型的展示元数据（图标、文案、分组），与供应商能力无关，供 UI 复用。 */
export const MEDIA_META: Record<MediaType, Omit<MediaCapability, 'max' | 'maxBytes' | 'accept' | 'exclusiveGroup'> & { exclusiveGroup: MediaCapability['exclusiveGroup'] }> = {
  first_frame: { type: 'first_frame', label: '首帧', hint: '严格作为视频第一帧', icon: 'i-lucide-panel-top', exclusiveGroup: 'frames' },
  last_frame: { type: 'last_frame', label: '尾帧', hint: '严格作为视频最后一帧，需先提供首帧', icon: 'i-lucide-panel-bottom', exclusiveGroup: 'frames' },
  reference_image: { type: 'reference_image', label: '参考图', hint: '保持人物、商品、场景或构图一致', icon: 'i-lucide-image', exclusiveGroup: 'reference' },
  reference_video: { type: 'reference_video', label: '参考视频', hint: '视频续写、风格迁移、运动参考', icon: 'i-lucide-video', exclusiveGroup: 'reference' },
  reference_audio: { type: 'reference_audio', label: '参考音频', hint: '用对白、音乐或环境声驱动画面', icon: 'i-lucide-audio-lines', exclusiveGroup: 'reference' },
  file: { type: 'file', label: '文档', hint: '模型自动理解文档内容并生成视频', icon: 'i-lucide-file-text', exclusiveGroup: 'reference' },
  link: { type: 'link', label: '网页链接', hint: '解析公开网页内容生成视频', icon: 'i-lucide-link', exclusiveGroup: 'reference' },
}

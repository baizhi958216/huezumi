/**
 * 生成任务的统一数据契约。
 *
 * 设计原则：
 * 1. 平台侧只描述"要什么"（GenerationRequest），不关心任何供应商的请求结构。
 * 2. 供应商侧只负责把统一请求映射成自己的协议（VideoProvider）。
 * 3. 新增供应商 = 新增一个适配器 + 在 providerCatalog 中登记能力，前端零改动。
 */

export type ProviderId = 'dashscope' | 'minimax' | 'kling' | 'seedance' | (string & {})

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

export type Resolution = '480P' | '768P' | '720P' | '1080P'

export type AspectRatio = 'adaptive' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'

/** 传给智能时长模式的哨兵值：模型根据提示词与素材自动决定时长。 */
export const SMART_DURATION = -1

export interface MediaInput {
  type: MediaType
  url: string
  name?: string
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

export interface GenerationRecord extends GenerationRequest {
  id: string
  providerTaskId: string
  status: GenerationStatus
  videoUrl?: string
  /** 视频已转存到本地持久化目录，避免供应商链接 24 小时后失效 */
  videoArchived?: boolean
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
  error?: string
  usage?: GenerationRecord['usage']
}

export interface ModelSpec {
  id: string
  name: string
  description: string
  /** 首页 / 创作台展示用的角标，如「高速」「标准」 */
  badge?: string
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
  notes?: string
  docsUrl?: string
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

import type { AspectRatio, GenerationRequest, GenerationStatus, MediaInput, ProviderTaskResult, Resolution } from '#shared/types/generation'
import type { VideoProvider } from './base'

export interface RunwayConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface RunwayCreateResponse {
  id?: string
  estimatedCost?: { credits?: number }
}

interface RunwayTaskResponse {
  id?: string
  status?: string
  output?: string[]
  failure?: string
  failureCode?: string
}

type RunwayModel
  = | 'gen4.5'
    | 'wan3'
    | 'seedance2_5'
    | 'seedance2'
    | 'seedance2_fast'
    | 'seedance2_mini'
    | 'hailuo3'
    | 'gemini_omni_flash'

type RunwayEndpoint = 'text_to_video' | 'image_to_video' | 'video_to_video'

const runwayModels = new Set<RunwayModel>([
  'gen4.5',
  'wan3',
  'seedance2_5',
  'seedance2',
  'seedance2_fast',
  'seedance2_mini',
  'hailuo3',
  'gemini_omni_flash',
])

const runwayPromptMaxLength: Record<RunwayModel, number> = {
  'gen4.5': 1000,
  'wan3': 20000,
  'seedance2_5': 15000,
  'seedance2': 3500,
  'seedance2_fast': 3500,
  'seedance2_mini': 3500,
  'hailuo3': 6000,
  'gemini_omni_flash': 4000,
}

/** Runway 的 ratio 字段使用实际输出尺寸，而平台使用稳定的宽高比名称。 */
const runwayRatioByResolution: Partial<Record<RunwayModel, Partial<Record<Resolution, Partial<Record<AspectRatio, string>>>>>> = {
  'gen4.5': {
    '720P': {
      '16:9': '1280:720',
      '9:16': '720:1280',
      '4:3': '1104:832',
      '1:1': '960:960',
      '3:4': '832:1104',
      '21:9': '1584:672',
    },
  },
  'wan3': {
    '480P': {
      'adaptive': 'auto_480p',
      '16:9': '832:480',
      '4:3': '640:480',
      '1:1': '480:480',
      '3:4': '480:640',
      '9:16': '480:832',
    },
    '720P': {
      'adaptive': 'auto_720p',
      '16:9': '1280:720',
      '4:3': '960:720',
      '1:1': '720:720',
      '3:4': '720:960',
      '9:16': '720:1280',
    },
    '1080P': {
      'adaptive': 'auto_1080p',
      '16:9': '1920:1080',
      '4:3': '1440:1080',
      '1:1': '1080:1080',
      '3:4': '1080:1440',
      '9:16': '1080:1920',
    },
  },
  'seedance2_5': {
    '480P': {
      '21:9': '992:432',
      '16:9': '854:480',
      '4:3': '752:560',
      '1:1': '640:640',
      '3:4': '560:752',
      '9:16': '480:854',
    },
    '720P': {
      '21:9': '1470:630',
      '16:9': '1280:720',
      '4:3': '1112:834',
      '1:1': '960:960',
      '3:4': '834:1112',
      '9:16': '720:1280',
    },
    '1080P': {
      '21:9': '2206:946',
      '16:9': '1920:1080',
      '4:3': '1664:1248',
      '1:1': '1440:1440',
      '3:4': '1248:1664',
      '9:16': '1080:1920',
    },
  },
  'seedance2': {
    '480P': {
      '21:9': '992:432',
      '16:9': '864:496',
      '4:3': '752:560',
      '1:1': '640:640',
      '3:4': '560:752',
      '9:16': '496:864',
    },
    '720P': {
      '21:9': '1470:630',
      '16:9': '1280:720',
      '4:3': '1112:834',
      '1:1': '960:960',
      '3:4': '834:1112',
      '9:16': '720:1280',
    },
    '1080P': {
      '21:9': '2206:946',
      '16:9': '1920:1080',
      '4:3': '1664:1248',
      '1:1': '1440:1440',
      '3:4': '1248:1664',
      '9:16': '1080:1920',
    },
    '4K': {
      '21:9': '3840:1646',
      '16:9': '3840:2160',
      '4:3': '3840:2880',
      '1:1': '3840:3840',
      '3:4': '2880:3840',
      '9:16': '2160:3840',
    },
  },
  'seedance2_fast': {
    '480P': {
      '21:9': '992:432',
      '16:9': '864:496',
      '4:3': '752:560',
      '1:1': '640:640',
      '3:4': '560:752',
      '9:16': '496:864',
    },
    '720P': {
      '21:9': '1470:630',
      '16:9': '1280:720',
      '4:3': '1112:834',
      '1:1': '960:960',
      '3:4': '834:1112',
      '9:16': '720:1280',
    },
  },
  'seedance2_mini': {
    '480P': {
      '21:9': '992:432',
      '16:9': '864:496',
      '4:3': '752:560',
      '1:1': '640:640',
      '3:4': '560:752',
      '9:16': '496:864',
    },
    '720P': {
      '21:9': '1470:630',
      '16:9': '1280:720',
      '4:3': '1112:834',
      '1:1': '960:960',
      '3:4': '834:1112',
      '9:16': '720:1280',
    },
  },
  'hailuo3': {
    '768P': {
      '21:9': '21:9',
      '16:9': '16:9',
      '4:3': '4:3',
      '1:1': '1:1',
      '3:4': '3:4',
      '9:16': '9:16',
    },
    '2K': {
      '21:9': '21:9',
      '16:9': '16:9',
      '4:3': '4:3',
      '1:1': '1:1',
      '3:4': '3:4',
      '9:16': '9:16',
    },
  },
  'gemini_omni_flash': {
    '720P': {
      '16:9': '1280:720',
      '9:16': '720:1280',
    },
  },
}

const audioModels = new Set<RunwayModel>([
  'wan3',
  'seedance2_5',
  'seedance2',
  'seedance2_fast',
  'seedance2_mini',
])

const autoDurationModels = new Set<RunwayModel>([
  'seedance2_5',
  'seedance2',
  'seedance2_fast',
  'seedance2_mini',
])

const referenceVideoModels = new Set<RunwayModel>([
  'seedance2_5',
  'seedance2',
  'seedance2_fast',
  'seedance2_mini',
  'hailuo3',
  'gemini_omni_flash',
])

function asRunwayModel(model: string): RunwayModel {
  if (!runwayModels.has(model as RunwayModel))
    throw new Error(`Runway 不支持模型 ${model}`)
  return model as RunwayModel
}

export function normalizeRunwayStatus(status?: string): GenerationStatus {
  switch (status?.toUpperCase()) {
    case 'PENDING':
    case 'THROTTLED':
      return 'PENDING'
    case 'RUNNING':
      return 'RUNNING'
    case 'SUCCEEDED':
      return 'SUCCEEDED'
    case 'FAILED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

function getRunwayRatio(request: GenerationRequest, model: RunwayModel) {
  const ratio = runwayRatioByResolution[model]?.[request.resolution]?.[request.ratio]
  if (!ratio)
    throw new Error(`Runway ${model} 不支持 ${request.resolution} / ${request.ratio} 组合`)
  return ratio
}

function getRunwayEndpoint(request: GenerationRequest, model: RunwayModel): RunwayEndpoint {
  if (model === 'gen4.5')
    return 'image_to_video'
  if (model === 'wan3') {
    return request.media.some(item => ['first_frame', 'last_frame', 'reference_image'].includes(item.type))
      ? 'image_to_video'
      : 'text_to_video'
  }
  if (request.media.some(item => item.type === 'reference_video') && referenceVideoModels.has(model))
    return 'video_to_video'
  if (request.media.some(item => ['first_frame', 'last_frame', 'reference_image'].includes(item.type)))
    return 'image_to_video'
  return 'text_to_video'
}

function getPromptText(request: GenerationRequest, model: RunwayModel) {
  const promptText = request.prompt.trim()
  if (promptText.length > runwayPromptMaxLength[model])
    throw new Error(`Runway ${model} 提示词不能超过 ${runwayPromptMaxLength[model]} 个字符`)
  return promptText
}

function getImageInputs(media: MediaInput[]) {
  return media.filter(item => ['first_frame', 'last_frame', 'reference_image'].includes(item.type))
}

function getReferenceImages(media: MediaInput[]) {
  return media.filter(item => item.type === 'reference_image')
}

function getReferenceVideos(media: MediaInput[]) {
  return media.filter(item => item.type === 'reference_video')
}

function getReferenceAudio(media: MediaInput[]) {
  return media.filter(item => item.type === 'reference_audio')
}

function buildPromptImages(media: MediaInput[], model: RunwayModel) {
  return media.map((item) => {
    const position = model === 'gemini_omni_flash' || item.type === 'first_frame'
      ? 'first'
      : item.type === 'last_frame'
        ? 'last'
        : undefined
    return position ? { uri: item.url, position } : { uri: item.url }
  })
}

function addReferences(body: Record<string, unknown>, request: GenerationRequest, model: RunwayModel, endpoint: RunwayEndpoint) {
  const referenceImages = getReferenceImages(request.media)
  const referenceVideos = getReferenceVideos(request.media)
  const referenceAudio = getReferenceAudio(request.media)

  if (referenceImages.length && endpoint === 'video_to_video')
    body.references = referenceImages.map(item => ({ uri: item.url }))

  if (referenceAudio.length)
    body.referenceAudio = referenceAudio.map(item => ({ type: 'audio', uri: item.url }))

  const additionalVideos = endpoint === 'video_to_video' ? referenceVideos.slice(1) : referenceVideos
  if (additionalVideos.length && model !== 'gemini_omni_flash')
    body.referenceVideos = additionalVideos.map(item => ({ type: 'video', uri: item.url }))
}

function buildGen45Request(request: GenerationRequest) {
  const promptText = getPromptText(request, 'gen4.5')
  if (!promptText)
    throw new Error('Runway Gen-4.5 要求填写提示词')

  const firstFrame = request.media.find(item => item.type === 'first_frame')
  const body: Record<string, unknown> = {
    model: 'gen4.5',
    promptText,
    ratio: getRunwayRatio(request, 'gen4.5'),
    duration: request.duration,
  }

  if (firstFrame)
    body.promptImage = firstFrame.url
  if (request.seed !== undefined)
    body.seed = request.seed

  return body
}

function buildMultimodalRequest(request: GenerationRequest, model: RunwayModel): { endpoint: RunwayEndpoint, body: Record<string, unknown> } {
  const endpoint = getRunwayEndpoint(request, model)
  const promptText = getPromptText(request, model)
  const referenceVideos = getReferenceVideos(request.media)
  const body: Record<string, unknown> = { model }

  if (promptText)
    body.promptText = promptText
  if (audioModels.has(model))
    body.audio = request.audio
  if (request.seed !== undefined && model !== 'gemini_omni_flash')
    body.seed = request.seed
  if (autoDurationModels.has(model))
    body.duration = request.duration === -1 ? 'auto' : request.duration
  else if (model !== 'gemini_omni_flash' || endpoint !== 'video_to_video')
    body.duration = request.duration

  if (model === 'hailuo3')
    body.resolution = request.resolution
  if (model !== 'gemini_omni_flash' || endpoint !== 'video_to_video')
    body.ratio = getRunwayRatio(request, model)

  if (endpoint === 'image_to_video') {
    const images = getImageInputs(request.media)
    if (!images.length)
      throw new Error(`Runway ${model} 的 image_to_video 请求缺少图片素材`)
    body.promptImage = buildPromptImages(images, model)
  }

  if (endpoint === 'video_to_video') {
    const primaryVideo = referenceVideos[0]
    if (!primaryVideo)
      throw new Error(`Runway ${model} 的 video_to_video 请求缺少视频素材`)
    body[model === 'gemini_omni_flash' ? 'videoUri' : 'promptVideo'] = primaryVideo.url
    if (model === 'seedance2_5')
      body.mode = 'reference'
  }

  addReferences(body, request, model, endpoint)
  return { endpoint, body }
}

/** 构造 Runway 请求；保留该函数返回 body，便于无网络验证请求映射。 */
export function buildRunwayRequest(request: GenerationRequest, model = request.model || 'gen4.5') {
  const runwayModel = asRunwayModel(model)
  return runwayModel === 'gen4.5' ? buildGen45Request(request) : buildMultimodalRequest(request, runwayModel).body
}

function buildRunwaySubmission(request: GenerationRequest, model: RunwayModel) {
  if (model === 'gen4.5')
    return { endpoint: 'image_to_video' as const, body: buildGen45Request(request) }
  return buildMultimodalRequest(request, model)
}

function taskError(response: RunwayTaskResponse) {
  // Runway failure codes are diagnostic details, not user-facing messages.
  return response.failureCode || response.failure
    ? 'Runway 任务处理失败，请检查输入内容后重试。'
    : 'Runway 任务处理失败，请稍后重试。'
}

export class RunwayProvider implements VideoProvider {
  readonly id = 'runway'

  constructor(private readonly config: RunwayConfig) {}

  private headers() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    }
  }

  async submit(request: GenerationRequest) {
    const model = asRunwayModel(request.model || this.config.model)
    const submission = buildRunwaySubmission(request, model)
    const response = await $fetch<RunwayCreateResponse>(`${this.config.baseUrl}/v1/${submission.endpoint}`, {
      method: 'POST',
      headers: this.headers(),
      body: submission.body,
    })

    if (!response.id)
      throw new Error('Runway 未返回任务 ID')

    return { taskId: response.id, status: 'PENDING' as const }
  }

  async getTask(taskId: string): Promise<ProviderTaskResult> {
    const response = await $fetch<RunwayTaskResponse>(`${this.config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
      headers: this.headers(),
    })
    const status = normalizeRunwayStatus(response.status)

    return {
      status,
      videoUrl: status === 'SUCCEEDED' ? response.output?.[0] : undefined,
      error: status === 'FAILED' ? taskError(response) : undefined,
    }
  }
}

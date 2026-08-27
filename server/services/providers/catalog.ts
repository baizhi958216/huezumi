import type { ProviderCapability } from '#shared/types/generation'

/**
 * 供应商能力目录 —— 全平台唯一的"谁支持什么"声明源。
 *
 * 扩展新供应商的完整步骤：
 * 1. 在 shared/types/generation.ts 的 ProviderId 联合类型中加上新 id；
 * 2. 新建 adapters/<id>.ts 实现 VideoProvider（submit + getTask）；
 * 3. 在本文件追加一份 ProviderCapability 声明；
 * 4. 在 ./index.ts 的工厂函数中按 env 凭据注册。
 * 前端（创作台 / 首页能力矩阵）全部由 /api/providers 驱动，零改动。
 */

/** 首帧 / 尾帧素材的通用限制 */
const frameLimits = {
  accept: 'image/*',
  extensions: ['jpg', 'jpeg', 'png', 'webp'],
  maxBytes: 20 * 1024 * 1024,
  max: 1,
}

export const providerCapabilities: ProviderCapability[] = [
  {
    id: 'dashscope',
    name: '阿里云百炼',
    vendor: 'Alibaba Cloud',
    enabled: true,
    models: [
      { id: 'wan3.0-video-prime', name: 'Wan 3.0 Prime', description: '旗舰 · 全模态参考 · 有声', badge: '旗舰' },
      { id: 'wan3.0-video', name: 'Wan 3.0', description: '标准 · 全模态参考 · 有声' },
    ],
    modes: ['text', 'frames', 'reference'],
    media: ['first_frame', 'last_frame', 'reference_image', 'reference_video', 'reference_audio', 'file', 'link'],
    mediaLimits: {
      first_frame: frameLimits,
      last_frame: frameLimits,
      reference_image: { ...frameLimits, max: 4 },
      reference_video: { accept: 'video/*', extensions: ['mp4', 'mov'], maxBytes: 100 * 1024 * 1024, max: 1, duration: { min: 3, max: 30 } },
      reference_audio: { accept: 'audio/*', extensions: ['mp3', 'wav', 'm4a'], maxBytes: 20 * 1024 * 1024, max: 1, duration: { min: 3, max: 30 } },
    },
    resolutions: ['480P', '720P', '1080P'],
    ratios: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'],
    duration: { min: 2, max: 30, smart: true, videoAware: true },
    supportsAudio: true,
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsWatermark: true,
    supportsPromptExtend: true,
    supportsMediaOnly: true,
    notes: '参考模式下图片、视频、音频可自由组合；视频续写需把比例设为自适应。',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference',
  },
  {
    id: 'minimax',
    name: 'MiniMax 海螺',
    vendor: 'MiniMax',
    enabled: true,
    models: [
      { id: 'MiniMax-Hailuo-2.3', name: 'Hailuo 2.3', description: '新一代 · 运镜指令 · 细节更强', badge: '推荐' },
      { id: 'MiniMax-Hailuo-02', name: 'Hailuo 02', description: '上一代 · 支持 6/10 秒' },
    ],
    modes: ['text', 'frames', 'reference'],
    media: ['first_frame', 'last_frame', 'reference_image'],
    mediaLimits: {
      first_frame: frameLimits,
      last_frame: frameLimits,
      reference_image: { ...frameLimits, hint: '作为首帧驱动图生视频' },
    },
    resolutions: ['768P', '1080P'],
    ratios: [],
    duration: { min: 6, max: 10, smart: false, videoAware: false, steps: [6, 10] },
    supportsAudio: false,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsWatermark: true,
    supportsPromptExtend: true,
    supportsMediaOnly: true,
    notes: '画幅由首帧图片或模型自动决定；1080P 仅支持 6 秒；提示词支持 [Push in] 等运镜指令。',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/video-generation-t2v',
  },
  {
    id: 'kling',
    name: '可灵 Kling',
    vendor: '快手',
    enabled: true,
    models: [
      { id: 'kling-v2-6', name: 'Kling V2.6', description: '最新 · 支持同步声音', badge: '最新' },
      { id: 'kling-v2-5-turbo', name: 'Kling V2.5 Turbo', description: '高性价比 · 首尾帧' },
      { id: 'kling-v2-1-master', name: 'Kling V2.1 Master', description: '大师版 · 画面表现' },
    ],
    modes: ['text', 'frames', 'reference'],
    media: ['first_frame', 'last_frame', 'reference_image'],
    mediaLimits: {
      first_frame: frameLimits,
      last_frame: { ...frameLimits, hint: '需搭配首帧，且仅专家模式支持' },
      reference_image: { ...frameLimits, hint: '作为首帧驱动图生视频' },
    },
    resolutions: ['720P', '1080P'],
    ratios: ['16:9', '9:16', '1:1'],
    duration: { min: 5, max: 10, smart: false, videoAware: false, steps: [5, 10] },
    supportsAudio: true,
    supportsNegativePrompt: true,
    supportsSeed: false,
    supportsWatermark: true,
    supportsPromptExtend: false,
    supportsMediaOnly: false,
    notes: '720P 走标准模式、1080P 走专家模式；尾帧需搭配首帧并使用专家模式；声音仅 V2.6 支持。',
    docsUrl: 'https://app.klingai.com/cn/dev/document-api/apiReference/commonInfo',
  },
  {
    id: 'seedance',
    name: 'Seedance 即梦',
    vendor: '字节跳动 · 火山方舟',
    enabled: true,
    models: [
      { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro', description: '最新 · 支持同步音频', badge: '最新' },
      { id: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance 1.0 Pro Fast', description: '快速出片 · 高清' },
      { id: 'doubao-seedance-1-0-pro-250528', name: 'Seedance 1.0 Pro', description: '经典 Pro · 1080P' },
    ],
    modes: ['text', 'frames', 'reference'],
    media: ['first_frame', 'last_frame', 'reference_image'],
    mediaLimits: {
      first_frame: frameLimits,
      last_frame: frameLimits,
      reference_image: { ...frameLimits, max: 4, hint: '1080P 下不支持参考图' },
    },
    resolutions: ['480P', '720P', '1080P'],
    ratios: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    duration: { min: 2, max: 12, smart: true, videoAware: false },
    supportsAudio: true,
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsWatermark: true,
    supportsPromptExtend: false,
    supportsMediaOnly: true,
    notes: '同步音频仅 Seedance 1.5 Pro 支持；参考图场景不支持 1080P。',
    docsUrl: 'https://www.volcengine.com/docs/6492/2165104',
  },
]

const capabilityById = new Map(providerCapabilities.map(item => [item.id, item]))

export function getCapability(id: string) {
  return capabilityById.get(id)
}

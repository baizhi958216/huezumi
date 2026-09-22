export const IMAGE_SIZES = [
  { label: '1:1 · 方形', value: '1024*1024' },
  { label: '16:9 · 横屏', value: '1664*928' },
  { label: '9:16 · 竖屏', value: '928*1664' },
  { label: '4:3 · 横版', value: '1472*1104' },
  { label: '3:4 · 竖版', value: '1104*1472' },
  { label: '1:1 · 2K', value: '2048*2048' },
] as const

// Only expose models whose capabilities have been verified against the official API.
export const IMAGE_MODELS = ['qwen-image-2.0', 'qwen-image-2.0-pro'] as const
export function isSupportedImageModel(model: string) {
  return /^(?:qwen-image-2\.0|qwen-image-2\.0-pro)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)
}
export interface ImageGenerationRequest {
  mode: 'text' | 'edit'
  prompt: string
  negativePrompt?: string
  images: string[]
  size: string
  count: number
  promptExtend: boolean
  watermark: boolean
  seed?: number
}

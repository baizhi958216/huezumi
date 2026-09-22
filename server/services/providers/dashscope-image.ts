import type { ImageGenerationRequest } from '#shared/types/image-generation'
import type { ConnectionSettings } from '#shared/types/platform'
import { isSupportedImageModel } from '#shared/types/image-generation'

export function imageEndpoint(settings: ConnectionSettings) {
  const base = settings.baseUrl || (settings.workspaceId
    ? `https://${settings.workspaceId}.${settings.region || 'cn-beijing'}.maas.aliyuncs.com/api/v1`
    : settings.region === 'ap-southeast-1' ? 'https://dashscope-intl.aliyuncs.com/api/v1' : 'https://dashscope.aliyuncs.com/api/v1')
  return `${base.replace(/\/$/, '').replace(/\/compatible-mode\/v1$/, '/api/v1')}/services/aigc/multimodal-generation/generation`
}
export function imagePayload(model: string, input: ImageGenerationRequest, images: string[]) {
  if (!isSupportedImageModel(model))
    throw new Error('Unsupported image model')
  return {
    model,
    input: { messages: [{ role: 'user', content: [...images.map(image => ({ image })), { text: input.prompt }] }] },
    parameters: { size: input.size, n: input.count, negative_prompt: input.negativePrompt, prompt_extend: input.promptExtend, watermark: input.watermark, seed: input.seed },
  }
}
export class ImageProviderError extends Error {
  constructor(readonly definite: boolean) {
    super(definite ? '图片生成被供应商拒绝' : '图片生成结果不明')
  }
}
export async function generateDashscopeImages(settings: ConnectionSettings, apiKey: string, model: string, input: ImageGenerationRequest, images: string[]) {
  let response: Response
  try {
    response = await fetch(imageEndpoint(settings), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(imagePayload(model, input, images)),
      signal: AbortSignal.timeout((settings.timeoutSeconds || 300) * 1000),
    })
  }
  catch {
    throw new ImageProviderError(false)
  }
  // Never retry a generation POST; an ambiguous failure may already have incurred cost.
  if (!response.ok)
    throw new ImageProviderError(response.status >= 400 && response.status < 500 && response.status !== 408)
  let data: { code?: string, output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> } }
  try {
    data = await response.json()
  }
  catch { throw new ImageProviderError(false) }
  if (data.code)
    throw new ImageProviderError(true)
  const urls = data.output?.choices?.flatMap(choice => choice.message?.content?.flatMap(item => item.image ? [item.image] : []) || []) || []
  if (!urls.length || urls.length > input.count || urls.some(url => !url.startsWith('https://')))
    throw new ImageProviderError(false)
  return urls
}

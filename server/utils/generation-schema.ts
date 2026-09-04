import { SMART_DURATION } from '#shared/types/generation'
import { z } from 'zod'

const mediaType = z.enum(['first_frame', 'last_frame', 'reference_image', 'reference_video', 'reference_audio'])
const generationMode = z.enum(['text', 'frames', 'reference'])

export const generationSchema = z.object({
  provider: z.string().default('dashscope'),
  model: z.string().max(120).optional(),
  mode: generationMode.default('text'),
  prompt: z.string().max(20000).default(''),
  negativePrompt: z.string().max(1000).optional(),
  media: z.array(z.object({
    type: mediaType,
    url: z.string().min(1),
    name: z.string().optional(),
    duration: z.number().positive().max(30).optional(),
  // 2.5 supports 30 images + 10 videos + 10 audio files in one request.
  })).max(50).default([]),
  resolution: z.enum(['480P', '768P', '720P', '1080P', '2K', '4K']).default('1080P'),
  ratio: z.enum(['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9']).default('16:9'),
  /** SMART_DURATION(-1) 表示由模型智能决定时长 */
  duration: z.number().int().refine(value => value === SMART_DURATION || (value >= 2 && value <= 30), {
    message: `时长需为 2–30 的整数，或 ${SMART_DURATION}（智能时长）`,
  }).default(5),
  audio: z.boolean().default(true),
  promptExtend: z.boolean().default(true),
  watermark: z.boolean().default(false),
  seed: z.number().int().min(0).max(2147483647).optional(),
}).superRefine((value, ctx) => {
  if (!value.prompt.trim() && !value.media.length)
    ctx.addIssue({ code: 'custom', message: '提示词与参考素材至少填写一项' })

  const types = value.media.map(item => item.type)
  const hasFrames = types.some(type => type === 'first_frame' || type === 'last_frame')
  const hasReference = types.some(type => type.startsWith('reference_'))
  if (hasFrames && hasReference)
    ctx.addIssue({ code: 'custom', message: '首尾帧模式不可与参考素材模式同时使用' })

  if (value.mode === 'frames' && !hasFrames && !value.prompt.trim())
    ctx.addIssue({ code: 'custom', message: '首尾帧模式至少提供一张图片' })
})

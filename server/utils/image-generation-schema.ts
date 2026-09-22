import { IMAGE_SIZES } from '#shared/types/image-generation'
import { z } from 'zod'

export const imageGenerationSchema = z.object({
  mode: z.enum(['text', 'edit']),
  prompt: z.string().trim().min(1).max(4000),
  negativePrompt: z.string().trim().max(500).optional(),
  images: z.array(z.string().max(2048).refine(value => /^\/api\/(?:assets\/[0-9a-f-]{36}\/content|files\/[0-9a-f-]{36})$/i.test(value), '请上传属于当前账户的参考图片')).max(3).default([]),
  size: z.enum(IMAGE_SIZES.map(item => item.value)),
  count: z.number().int().min(1).max(6),
  promptExtend: z.boolean().default(true),
  watermark: z.boolean().default(false),
  seed: z.number().int().min(0).max(2147483647).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'edit' && !value.images.length)
    ctx.addIssue({ code: 'custom', path: ['images'], message: '参考图编辑至少需要一张图片' })
  if (value.mode === 'text' && value.images.length)
    ctx.addIssue({ code: 'custom', path: ['images'], message: '文生图模式不能包含参考图' })
})

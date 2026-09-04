import { z } from 'zod'
import { saveWorkflow } from '../../../services/comfyui/workflows'

const graphSchema = z.object({
  last_node_id: z.number().int().min(0),
  last_link_id: z.number().int().min(0),
  nodes: z.array(z.object({
    id: z.number().int(),
    type: z.string().min(1).max(255),
    pos: z.tuple([z.number(), z.number()]),
    size: z.tuple([z.number(), z.number()]),
    order: z.number().int(),
    mode: z.union([z.literal(0), z.literal(2), z.literal(4)]),
    inputs: z.array(z.object({
      name: z.string().max(255),
      type: z.string().max(255),
      link: z.number().int().nullable().optional(),
    })).optional(),
    outputs: z.array(z.object({
      name: z.string().max(255),
      type: z.string().max(255),
      links: z.array(z.number().int()).nullable().optional(),
    })).optional(),
    title: z.string().max(255).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    widgets_values: z.array(z.unknown()).optional(),
  })),
  links: z.array(z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int(), z.number().int(), z.string().max(255)])),
  version: z.number().int().optional(),
})

const bodySchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().min(1).max(120),
  graph: graphSchema,
})

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: parsed.error.issues[0]?.message || '工作流数据无效',
      data: parsed.error.flatten(),
    })
  }

  const body = parsed.data
  return await saveWorkflow({ id: body.id, name: body.name, graph: body.graph })
})

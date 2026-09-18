import type { TextCreationContent, TextCreationRequest, TextProviderOption } from '#shared/types/text-creation'
import { z } from 'zod'

const protocolSchema = z.enum(['auto', 'chat_completions', 'responses'])
const connectionSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  auth: z.enum(['bearer', 'none']).optional(),
  apiProtocol: protocolSchema.optional(),
  defaultModel: z.string().trim().min(1),
  timeoutSeconds: z.number().int().min(5).max(300).optional(),
})

type TextConnection = z.infer<typeof connectionSchema>

export const textCreationContentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1000),
  content: z.string().trim().min(1).max(100000),
  characters: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    profile: z.string().trim().min(1).max(1200),
  })).max(30).default([]),
  scenes: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    visual: z.string().trim().max(2000).default(''),
    action: z.string().trim().max(2000).default(''),
    dialogue: z.string().trim().max(4000).default(''),
  })).max(80).default([]),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
})

const outputJsonSchema = {
  name: 'creative_document',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'content', 'characters', 'scenes', 'keywords'],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      content: { type: 'string' },
      characters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'profile'],
          properties: { name: { type: 'string' }, profile: { type: 'string' } },
        },
      },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'visual', 'action', 'dialogue'],
          properties: {
            title: { type: 'string' },
            visual: { type: 'string' },
            action: { type: 'string' },
            dialogue: { type: 'string' },
          },
        },
      },
      keywords: { type: 'array', items: { type: 'string' } },
    },
  },
} as const

function parseConnections(raw: string): Record<string, TextConnection> {
  if (!raw.trim())
    return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: '文本大模型连接配置不是有效 JSON' })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw createError({ statusCode: 503, statusMessage: '文本大模型连接配置必须是对象' })

  const connections: Record<string, TextConnection> = {}
  for (const [id, value] of Object.entries(parsed)) {
    const result = connectionSchema.safeParse(value)
    if (!result.success || (!result.data.apiKey?.trim() && result.data.auth !== 'none'))
      continue
    connections[id] = result.data
  }
  return connections
}

function configuredConnections() {
  const config = useRuntimeConfig()
  const raw = String(config.textLlmConnectionsJson || config.comfyuiLlmConnectionsJson || '')
  return parseConnections(raw)
}

export function listTextProviders(): TextProviderOption[] {
  return Object.entries(configuredConnections()).map(([id, connection]) => ({
    id,
    label: connection.label || id,
    model: connection.defaultModel,
  }))
}

function normalizedBaseUrl(value: string) {
  return `${value.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`
}

function systemPrompt(kind: TextCreationRequest['kind']) {
  const format = kind === 'story'
    ? '完整故事正文，并提炼稳定的人物设定和可视化场景。'
    : kind === 'script'
      ? '可拍摄的竖屏短剧剧本，正文须包含分场、人物动作和对白；场景数组按拍摄顺序拆分。'
      : '可直接使用的营销文案；若不适用，characters 与 scenes 返回空数组。'
  return `你是中文创意写作与短剧策划专家。根据用户要求创作${format}\n输出必须是符合给定 schema 的 JSON。不要使用 Markdown 代码围栏。人物 profile 要包含外貌、性格、服装或身份等可供后续生图保持一致的信息；scene.visual 要能直接转化为画面提示词。不要声称查证过用户未提供的事实。`
}

function userPrompt(request: TextCreationRequest) {
  const length = { short: '精简，约 500–800 字', medium: '标准，约 1200–2000 字', long: '详细，约 2500–4000 字' }[request.length]
  return [
    `创作需求：${request.brief}`,
    `篇幅：${length}`,
    request.tone ? `风格与基调：${request.tone}` : '',
    request.audience ? `目标受众：${request.audience}` : '',
  ].filter(Boolean).join('\n')
}

function extractChatText(payload: unknown) {
  const value = payload as { choices?: Array<{ message?: { content?: unknown } }> }
  const text = value.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim())
    throw new Error('missing output')
  return text
}

function extractResponsesText(payload: unknown) {
  const value = payload as { output_text?: unknown, output?: Array<{ content?: Array<{ type?: string, text?: unknown }> }> }
  if (typeof value.output_text === 'string' && value.output_text.trim())
    return value.output_text
  const chunks = value.output?.flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
    .map(item => String(item.text)) || []
  if (!chunks.length)
    throw new Error('missing output')
  return chunks.join('')
}

async function postModel(connection: TextConnection, protocol: 'chat_completions' | 'responses', request: TextCreationRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), (connection.timeoutSeconds || 120) * 1000)
  const baseUrl = normalizedBaseUrl(connection.baseUrl)
  const body = protocol === 'chat_completions'
    ? {
        model: connection.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt(request.kind) },
          { role: 'user', content: userPrompt(request) },
        ],
        temperature: 0.7,
        response_format: { type: 'json_schema', json_schema: outputJsonSchema },
      }
    : {
        model: connection.defaultModel,
        instructions: systemPrompt(request.kind),
        input: [{ role: 'user', content: [{ type: 'input_text', text: userPrompt(request) }] }],
        store: false,
        text: { format: { type: 'json_schema', ...outputJsonSchema } },
      }
  try {
    const response = await fetch(`${baseUrl}/${protocol === 'responses' ? 'responses' : 'chat/completions'}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(connection.auth === 'none' ? {} : { authorization: `Bearer ${connection.apiKey}` }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status?: number }
      error.status = response.status
      throw error
    }
    const payload: unknown = await response.json()
    return protocol === 'responses' ? extractResponsesText(payload) : extractChatText(payload)
  }
  finally {
    clearTimeout(timeout)
  }
}

function parseGeneratedContent(raw: string): TextCreationContent {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return textCreationContentSchema.parse(JSON.parse(cleaned))
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: '大模型返回的创作内容格式无效，请重试' })
  }
}

export async function generateTextContent(request: TextCreationRequest) {
  const connections = configuredConnections()
  const connectionId = request.connectionId || Object.keys(connections)[0]
  const connection = connectionId ? connections[connectionId] : undefined
  if (!connection || !connectionId)
    throw createError({ statusCode: 503, statusMessage: '尚未配置可用的文本大模型连接' })

  const protocol = connection.apiProtocol || 'auto'
  try {
    let raw: string
    if (protocol === 'responses') {
      raw = await postModel(connection, 'responses', request)
    }
    else {
      try {
        raw = await postModel(connection, 'chat_completions', request)
      }
      catch (error) {
        const status = (error as Error & { status?: number }).status
        if (protocol !== 'auto' || ![404, 405].includes(status || 0))
          throw error
        raw = await postModel(connection, 'responses', request)
      }
    }
    return { connectionId, model: connection.defaultModel, content: parseGeneratedContent(raw) }
  }
  catch (error) {
    if (typeof error === 'object' && error && 'statusCode' in error)
      throw error
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403)
      throw createError({ statusCode: 502, statusMessage: '文本大模型鉴权失败或无权使用所选模型' })
    if (status === 429)
      throw createError({ statusCode: 429, statusMessage: '文本大模型额度不足或请求过于频繁，请稍后重试' })
    throw createError({ statusCode: 502, statusMessage: '文本大模型暂时不可用，请检查连接后重试' })
  }
}

// Exported only for deterministic contract tests.
export const textCreationInternals = { parseConnections, parseGeneratedContent }

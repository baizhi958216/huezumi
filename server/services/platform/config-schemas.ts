import { z } from 'zod'

export const secretSchema = z.object({ apiKey: z.string().min(1).optional(), accessKey: z.string().min(1).optional(), secretKey: z.string().min(1).optional() }).strict()
export const connectionSettingsSchema = z.object({
  baseUrl: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol) && !new URL(value).username && !new URL(value).password && !new URL(value).search && !new URL(value).hash, '连接地址无效').optional(),
  defaultModel: z.string().trim().min(1).max(120),
  models: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  workspaceId: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  groupId: z.string().max(100).optional(),
  auth: z.enum(['bearer', 'none']).optional(),
  apiProtocol: z.enum(['auto', 'chat_completions', 'responses']).optional(),
  timeoutSeconds: z.number().int().min(5).max(300).optional(),
  supportsVision: z.boolean().optional(),
  webSearch: z.boolean().optional(),
}).strict().refine(v => v.models.includes(v.defaultModel), '默认模型必须属于模型列表').refine(v => !v.webSearch || v.apiProtocol !== 'chat_completions', '联网搜索需要使用 Responses 或自动协议')
export const connectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['video', 'text', 'image']),
  provider: z.string().min(1).max(50),
  enabled: z.boolean().default(true),
  settings: connectionSettingsSchema,
  secrets: secretSchema.optional(),
}).strict()
export const settingsSchema = z.object({
  registrationMode: z.enum(['open', 'invite', 'disabled']).default('invite'),
  signupCredits: z.number().int().min(0).max(1000000).default(0),
  userMaxActiveGenerations: z.number().int().min(1).max(100).default(3),
  platformDailyCreditBudget: z.number().int().min(0).max(2000000000).default(100000),
  defaultVideoConnectionId: z.uuid().optional(),
  defaultTextConnectionId: z.uuid().optional(),
  workflowAgentConnectionId: z.uuid().optional(),
  defaultImageConnectionId: z.uuid().optional(),
  workflowVideoConnectionId: z.uuid().optional(),
}).strict()

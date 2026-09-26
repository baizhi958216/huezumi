import { z } from 'zod'

export const secretSchema = z.object({ apiKey: z.string().min(1).optional(), accessKey: z.string().min(1).optional(), secretKey: z.string().min(1).optional() }).strict()
export const connectionSettingsSchema = z.object({
  baseUrl: z.url().refine((value) => {
    const url = URL.parse(value)
    return !!url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  }, '连接地址无效').optional(),
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
}).strict().refine(v => v.models.includes(v.defaultModel), { message: '默认模型必须属于模型列表，请重新选择默认模型', path: ['defaultModel'] }).refine(v => !v.webSearch || v.apiProtocol !== 'chat_completions', '联网搜索需要使用 Responses 或自动协议')
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

// Null explicitly removes an assignment; omitted fields remain unchanged.
export const settingsPatchSchema = z.object({
  registrationMode: settingsSchema.shape.registrationMode.removeDefault().optional(),
  signupCredits: settingsSchema.shape.signupCredits.removeDefault().optional(),
  userMaxActiveGenerations: settingsSchema.shape.userMaxActiveGenerations.removeDefault().optional(),
  platformDailyCreditBudget: settingsSchema.shape.platformDailyCreditBudget.removeDefault().optional(),
  defaultVideoConnectionId: z.uuid().nullable().optional(),
  defaultTextConnectionId: z.uuid().nullable().optional(),
  workflowAgentConnectionId: z.uuid().nullable().optional(),
  defaultImageConnectionId: z.uuid().nullable().optional(),
  workflowVideoConnectionId: z.uuid().nullable().optional(),
}).strict()

export function mergeSettingsPatch(current: PlatformSettingsInput, input: unknown) {
  const patch = settingsPatchSchema.parse(input)
  return settingsSchema.parse({ ...current, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === null ? undefined : value])) })
}

type PlatformSettingsInput = z.infer<typeof settingsSchema>

/** Return only controlled messages; never include rejected values or credentials. */
export function connectionValidationMessage(error: z.ZodError): string {
  const labels: Record<string, string> = {
    'name': '连接名称',
    'kind': '连接类型',
    'provider': '模型供应商',
    'enabled': '启用状态',
    'settings.baseUrl': '连接基地址',
    'settings.defaultModel': '默认模型',
    'settings.models': '模型列表',
    'settings.workspaceId': '业务空间',
    'settings.region': '地域',
    'settings.groupId': 'Group ID',
    'settings.auth': '鉴权方式',
    'settings.apiProtocol': '协议格式',
    'settings.timeoutSeconds': '请求超时',
    'settings.supportsVision': '图片理解设置',
    'settings.webSearch': '联网搜索设置',
    'secrets': '连接凭据',
  }
  const issue = error.issues[0]
  if (!issue)
    return '连接参数无效，请检查输入'
  if (issue.code === 'custom')
    return issue.message
  const path = issue.path.filter(part => typeof part === 'string').join('.')
  const label = labels[path] || (path.startsWith('secrets.') ? labels.secrets : '连接配置')
  return `${label}无效，请检查输入`
}

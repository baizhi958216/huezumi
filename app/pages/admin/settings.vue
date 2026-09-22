<script setup lang="ts">
/* eslint-disable no-alert -- Explicit confirmation protects destructive configuration and rename actions. */
import type { ProviderCapability } from '#shared/types/generation'
import type { ConnectionSummary, PlatformSettings } from '#shared/types/platform'
import { IMAGE_MODELS } from '#shared/types/image-generation'

const { data: session } = await useFetch('/api/auth/session')
if (session.value?.user?.role !== 'admin')
  await navigateTo('/')
const { data: connections, refresh, status: connectionStatus, error: connectionLoadError } = await useFetch<ConnectionSummary[]>('/api/admin/connections')
const { data: catalog } = await useFetch<ProviderCapability[]>('/api/providers')
const { data: settings, refresh: refreshSettings, error: settingsLoadError } = await useFetch<PlatformSettings>('/api/admin/settings')
const { data: prices, refresh: refreshPrices, error: pricesLoadError } = await useFetch<Array<{
  id: string
  connectionId: string
  model: string
  length: string
  credits: number
  version: number
}>>('/api/admin/text-prices')
const { data: deployment, refresh: refreshDeployment, error: deploymentLoadError } = await useFetch<Record<string, boolean | number | string>>('/api/admin/deployment')
const { data: reviewRuns, refresh: refreshReviewRuns } = await useFetch<Array<{
  id: string
  ownerEmail: string
  kind: string
  reservedCredits: number
  error: string
}>>('/api/admin/runs')
const connectionOpen = ref(false)
const settingsOpen = ref(false)
const priceOpen = ref(false)
const revisionsOpen = ref(false)
const deploymentOpen = ref(false)
const settingsDraft = ref<PlatformSettings>()
const settingsBusy = ref(false)
const priceBusy = ref(false)
const connectionError = ref('')
const settingsError = ref('')
const priceError = ref('')
const revisionsError = ref('')
const revisionsBusy = ref(false)
const editing = ref<string>()
const name = ref('')
const kind = ref<'video' | 'text' | 'image'>('video')
const provider = ref('dashscope')
const baseUrl = ref('')
const models = ref('')
const defaultModel = ref('')
const workspaceId = ref('')
const region = ref('cn-beijing')
const groupId = ref('')
const auth = ref<'bearer' | 'none'>('bearer')
const protocol = ref<'auto' | 'chat_completions' | 'responses'>('auto')
const supportsVision = ref(false)
const webSearch = ref(false)
const timeoutSeconds = ref(120)
const enabled = ref(true)
const apiKey = ref('')
const accessKey = ref('')
const secretKey = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)
const agentBusy = ref(false)
const agentError = ref('')
const price = reactive({ connectionId: '', model: '', length: 'short', credits: 1 })
function reset() {
  editing.value = undefined
  kind.value = 'video'
  provider.value = 'dashscope'
  region.value = 'cn-beijing'
  auth.value = 'bearer'
  protocol.value = 'auto'
  supportsVision.value = false
  webSearch.value = false
  timeoutSeconds.value = 120
  connectionError.value = ''
  name.value = ''
  baseUrl.value = ''
  models.value = ''
  defaultModel.value = ''
  apiKey.value = ''
  accessKey.value = ''
  secretKey.value = ''
  workspaceId.value = ''
  groupId.value = ''
  enabled.value = true
}
watch(connectionOpen, (open) => {
  if (!open) {
    apiKey.value = ''
    accessKey.value = ''
    secretKey.value = ''
  }
})
function createConnection() {
  reset()
  connectionOpen.value = true
}
function openSettings() {
  if (!settings.value)
    return
  settingsDraft.value = { ...settings.value }
  settingsError.value = ''
  settingsOpen.value = true
}
function openPrice() {
  Object.assign(price, { connectionId: '', model: '', length: 'short', credits: 1 })
  priceError.value = ''
  priceOpen.value = true
}
watch(() => price.connectionId, () => {
  price.model = ''
})
function edit(c: ConnectionSummary) {
  reset()
  editing.value = c.id
  name.value = c.name
  kind.value = c.kind
  provider.value = c.provider
  enabled.value = c.enabled
  baseUrl.value = c.settings.baseUrl || ''
  models.value = c.settings.models.join('\n')
  defaultModel.value = c.settings.defaultModel
  workspaceId.value = c.settings.workspaceId || ''
  region.value = c.settings.region || 'cn-beijing'
  groupId.value = c.settings.groupId || ''
  auth.value = c.settings.auth || 'bearer'
  protocol.value = c.settings.apiProtocol || 'auto'
  supportsVision.value = Boolean(c.settings.supportsVision)
  webSearch.value = Boolean(c.settings.webSearch)
  timeoutSeconds.value = c.settings.timeoutSeconds || 120
  connectionOpen.value = true
}
async function save() {
  if (busy.value)
    return
  connectionError.value = ''
  message.value = ''
  busy.value = true
  try {
    const secrets = { ...(apiKey.value ? { apiKey: apiKey.value } : {}), ...(accessKey.value ? { accessKey: accessKey.value } : {}), ...(secretKey.value ? { secretKey: secretKey.value } : {}) }
    const body = { name: name.value, kind: kind.value, provider: kind.value === 'text' ? 'openai-compatible' : provider.value, enabled: enabled.value, settings: { baseUrl: baseUrl.value || undefined, defaultModel: defaultModel.value, models: models.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean), workspaceId: workspaceId.value || undefined, region: region.value || undefined, groupId: groupId.value || undefined, auth: auth.value, apiProtocol: protocol.value, ...(kind.value !== 'video' ? { supportsVision: supportsVision.value, webSearch: webSearch.value, timeoutSeconds: timeoutSeconds.value } : {}) }, ...(Object.keys(secrets).length ? { secrets } : {}) }
    if (editing.value)
      await $fetch(`/api/admin/connections/${editing.value}`, { method: 'PUT', body })
    else
      await $fetch('/api/admin/connections', { method: 'POST', body })
    connectionOpen.value = false
    reset()
    message.value = '连接版本已保存；后续报价和新提交的工作流使用新配置。'
    await refresh()
  }
  catch (e) {
    connectionError.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}
const workflowAgentConnection = computed(() => connections.value?.find(connection => connection.id === settings.value?.workflowAgentConnectionId))
const agentDraft = reactive({ baseUrl: '', apiKey: '', model: '', auth: 'bearer' as 'bearer' | 'none', apiProtocol: 'auto' as 'auto' | 'chat_completions' | 'responses', supportsVision: true, webSearch: false, timeoutSeconds: 120 })
// Keep a successfully created connection on assignment failure so retry never duplicates it.
const pendingAgentId = ref<string>()
const agentMessage = ref('')
const agentOpen = ref(false)
const agentAdvanced = ref(false)
function openAgentConfig() {
  const c = (connections.value?.find(item => item.id === pendingAgentId.value) || workflowAgentConnection.value)?.settings
  Object.assign(agentDraft, { baseUrl: c?.baseUrl || '', apiKey: '', model: c?.defaultModel || '', auth: c?.auth || 'bearer', apiProtocol: c?.apiProtocol || 'auto', supportsVision: c?.supportsVision ?? true, webSearch: c?.webSearch ?? false, timeoutSeconds: c?.timeoutSeconds || 120 })
  agentError.value = ''
  agentAdvanced.value = false
  agentOpen.value = true
}
watch(agentOpen, (open) => {
  if (!open)
    agentDraft.apiKey = ''
})
async function saveAgentConfig() {
  if (agentBusy.value || !settings.value)
    return
  agentBusy.value = true
  agentError.value = ''
  agentMessage.value = ''
  let connectionSaved = false
  try {
    const existing = connections.value?.find(c => c.id === pendingAgentId.value) || workflowAgentConnection.value
    const model = agentDraft.model.trim()
    const body = {
      name: existing?.name || '工作流 Agent',
      kind: 'text',
      provider: 'openai-compatible',
      enabled: true,
      settings: {
        ...existing?.settings,
        baseUrl: agentDraft.baseUrl.trim(),
        defaultModel: model,
        models: [...new Set([...(existing?.settings.models || []), model])],
        auth: agentDraft.auth,
        apiProtocol: agentDraft.apiProtocol,
        supportsVision: agentDraft.supportsVision,
        webSearch: agentDraft.webSearch,
        timeoutSeconds: agentDraft.timeoutSeconds,
      },
      ...(agentDraft.apiKey.trim() ? { secrets: { apiKey: agentDraft.apiKey.trim() } } : {}),
    }
    const id = pendingAgentId.value || existing?.id
    const saved = id
      ? await $fetch<ConnectionSummary>(`/api/admin/connections/${id}`, { method: 'PUT', body })
      : await $fetch<ConnectionSummary>('/api/admin/connections', { method: 'POST', body })
    pendingAgentId.value = saved.id
    connectionSaved = true
    agentDraft.apiKey = ''
    // Merge with the latest settings rather than overwriting unrelated administrator edits.
    const latest = await $fetch<PlatformSettings>('/api/admin/settings')
    const next = await $fetch<PlatformSettings>('/api/admin/settings', { method: 'PUT', body: { ...latest, workflowAgentConnectionId: saved.id } })
    settings.value = next
    pendingAgentId.value = undefined
    agentMessage.value = 'Agent API 已保存，新任务将使用此配置。'
    await refresh()
    agentOpen.value = false
  }
  catch (e) {
    agentError.value = `${connectionSaved ? '连接已保存，但用途分配或刷新失败；可以重试，Key 无需重复填写。' : ''}${apiError(e)}`
  }
  finally {
    agentBusy.value = false
  }
}
async function saveSettings() {
  if (settingsBusy.value || !settingsDraft.value)
    return
  settingsBusy.value = true
  settingsError.value = ''
  try {
    await $fetch('/api/admin/settings', { method: 'PUT', body: settingsDraft.value })
    settings.value = { ...settingsDraft.value }
    settingsOpen.value = false
    message.value = '平台设置已保存'
    await refreshSettings()
  }
  catch (e) { settingsError.value = apiError(e) }
  finally { settingsBusy.value = false }
}
async function savePrice() {
  if (priceBusy.value)
    return
  priceBusy.value = true
  priceError.value = ''
  try {
    await $fetch('/api/admin/text-prices', { method: 'POST', body: price })
    priceOpen.value = false
    message.value = '价格版本已发布'
    await refreshPrices()
  }
  catch (e) { priceError.value = apiError(e) }
  finally { priceBusy.value = false }
}
const revisionConnection = ref<ConnectionSummary>()
const revisions = ref<Array<{ id: string, version: number, revoked: boolean }>>([])
const revisionCursor = ref<string | null>(null)
async function revoke(c: ConnectionSummary, revisionId = c.revisionId) {
  if (!window.confirm('撤销该版本会影响使用它的未完成任务，确定继续吗？'))
    return
  try {
    await $fetch(`/api/admin/connections/${c.id}/revoke`, { method: 'POST', body: { revisionId } })
    await refresh()
    if (revisionsOpen.value && revisionConnection.value?.id === c.id)
      await showRevisions(c)
    await refreshReviewRuns()
  }
  catch (e) {
    if (revisionsOpen.value)
      revisionsError.value = apiError(e)
    else
      error.value = apiError(e)
  }
}
async function settle(id: string, action: 'release' | 'charge') {
  const reason = window.prompt('请输入核对依据（至少 3 个字）')
  if (!reason)
    return
  try {
    await $fetch(`/api/admin/runs/${id}/settle`, { method: 'POST', body: { action, reason } })
    await refreshReviewRuns()
  }
  catch (e) {
    error.value = apiError(e)
  }
}
async function showRevisions(c: ConnectionSummary, more = false) {
  if (revisionsBusy.value)
    return
  revisionConnection.value = c
  revisionsOpen.value = true
  revisionsError.value = ''
  revisionsBusy.value = true
  if (!more) {
    revisions.value = []
    revisionCursor.value = null
  }
  try {
    const page = await $fetch<{ items: typeof revisions.value, nextCursor: string | null }>(`/api/admin/connections/${c.id}/versions`, { query: more && revisionCursor.value ? { cursor: revisionCursor.value } : {} })
    revisionConnection.value = c
    revisions.value = more ? [...revisions.value, ...page.items] : page.items
    revisionCursor.value = page.nextCursor
  }
  catch (e) { revisionsError.value = apiError(e) }
  finally { revisionsBusy.value = false }
}
watch(kind, (value) => {
  if (editing.value)
    return
  provider.value = value === 'text' ? 'openai-compatible' : 'dashscope'
  if (value === 'image') {
    baseUrl.value = ''
    timeoutSeconds.value = 300
    useCatalog()
  }
})
function useCatalog() {
  if (kind.value === 'image') {
    if (provider.value === 'dashscope') {
      models.value = IMAGE_MODELS.join('\n')
      defaultModel.value = IMAGE_MODELS[0]
    }
    return
  }
  const c = catalog.value?.find(c => c.id === provider.value)
  if (c) {
    models.value = c.models.map(m => m.id).join('\n')
    defaultModel.value = c.models[0]?.id || ''
  }
}

const purposeAssignments = [
  { label: '文本创作', field: 'defaultTextConnectionId' },
  { label: '图片 API', field: 'defaultImageConnectionId' },
  { label: '视频创作', field: 'defaultVideoConnectionId' },
  { label: '工作流视频（百炼）', field: 'workflowVideoConnectionId' },
  { label: '工作流 Agent', field: 'workflowAgentConnectionId' },
] as const

const kindOptions = [
  { label: '视频模型', value: 'video' },
  { label: '文本大模型', value: 'text' },
  { label: '图片 API', value: 'image' },
]

const providerOptions = computed(() =>
  (catalog.value || []).map(c => ({ label: c.name, value: c.id })),
)

const protocolOptions = [
  { label: '自动识别', value: 'auto' },
  { label: 'Chat Completions', value: 'chat_completions' },
  { label: 'Responses', value: 'responses' },
]

const authOptions = [
  { label: 'API Key (Bearer)', value: 'bearer' },
  { label: '本地免鉴权 (None)', value: 'none' },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
    <UAlert v-if="message" color="success" variant="subtle" icon="i-lucide-circle-check" :description="message" />

    <!-- Model Connections Section -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-highlighted text-base">
            模型连接管理
          </h2>
          <p class="text-xs text-dimmed mt-0.5">
            在这里配置 API 地址、模型和 Key，再按用途分配连接，无需修改环境变量。凭据加密保存且不回显；已受理任务继续使用提交时的版本。
          </p>
        </div>
        <UButton icon="i-lucide-plus" @click="createConnection">
          新建连接
        </UButton>
      </div>
      <p v-if="connectionStatus === 'pending'" role="status" class="py-6 text-sm text-muted">
        正在加载连接…
      </p>
      <UAlert v-else-if="connectionLoadError" color="error" variant="subtle" title="连接加载失败">
        <template #actions>
          <UButton color="error" variant="soft" @click="refresh()">
            重试
          </UButton>
        </template>
      </UAlert>
      <div v-else-if="!connections?.length" class="rounded-xl border border-dashed border-default p-8 text-center">
        <p class="text-sm text-muted">
          还没有模型连接，添加连接后即可配置模型。
        </p>
        <UButton class="mt-3" variant="soft" icon="i-lucide-plus" @click="createConnection">
          新建连接
        </UButton>
      </div>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="c in connections"
          :key="c.id"
          class="flex flex-col justify-between rounded-xl border border-default bg-elevated p-4 shadow-soft transition hover:border-accented"
        >
          <div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="size-2 rounded-full" :class="c.enabled && !c.revoked ? 'bg-emerald-500' : 'bg-zinc-400'" />
                <h3 class="font-semibold text-highlighted text-sm">
                  {{ c.name }}
                </h3>
              </div>
              <UBadge size="xs" :color="c.kind === 'video' ? 'primary' : 'info'" variant="subtle">
                {{ c.kind === 'video' ? '视频模型' : c.kind === 'image' ? '图片 API' : '文本模型' }}
              </UBadge>
            </div>

            <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-dimmed">
              <UBadge size="xs" color="neutral" variant="outline">
                v{{ c.version }}
              </UBadge>
              <UBadge size="xs" :color="c.revoked ? 'error' : c.hasCredentials ? 'success' : 'neutral'" variant="subtle">
                {{ c.revoked ? '已撤销' : c.hasCredentials ? '已配置凭据' : '免鉴权' }}
              </UBadge>
              <span class="truncate text-toned">{{ c.settings.defaultModel }}</span>
            </div>

            <p v-if="c.settings.baseUrl" class="mt-1.5 truncate font-mono text-[11px] text-dimmed">
              {{ c.settings.baseUrl }}
            </p>
          </div>

          <div class="mt-4 flex items-center justify-end gap-1.5 border-t border-default/50 pt-3">
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-history" @click="showRevisions(c)">
              历史版本
            </UButton>
            <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-pencil" @click="edit(c)">
              编辑
            </UButton>
            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-ban" :disabled="c.revoked" @click="revoke(c)">
              撤销
            </UButton>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-default bg-default p-5 sm:p-6" aria-labelledby="agent-heading">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <UIcon name="i-lucide-sparkles" class="size-5" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h2 id="agent-heading" class="text-sm font-semibold text-highlighted">
                工作流 Agent
              </h2>
              <span class="text-xs" :class="workflowAgentConnection?.enabled && !workflowAgentConnection?.revoked ? 'text-success' : 'text-muted'">
                {{ !workflowAgentConnection ? '未配置' : workflowAgentConnection.enabled && !workflowAgentConnection.revoked ? '已启用' : '待更新' }}
              </span>
            </div>
            <p class="mt-1 text-xs text-muted">
              理解需求与参考图，为工作流生成提示词。
            </p>
          </div>
        </div>
        <UButton :color="workflowAgentConnection ? 'neutral' : 'primary'" :variant="workflowAgentConnection ? 'outline' : 'solid'" :icon="workflowAgentConnection ? 'i-lucide-sliders-horizontal' : 'i-lucide-plus'" :disabled="!settings || connectionStatus === 'pending' || !!connectionLoadError" @click="openAgentConfig">
          {{ workflowAgentConnection ? '管理配置' : '配置 API' }}
        </UButton>
      </div>
      <div v-if="workflowAgentConnection" class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-default pt-4 text-xs">
        <span class="font-medium text-toned">{{ workflowAgentConnection.settings.defaultModel }}</span>
        <span class="min-w-0 break-all text-muted">{{ workflowAgentConnection.settings.baseUrl }}</span>
        <span v-if="workflowAgentConnection.settings.supportsVision" class="text-muted">图片理解</span>
        <span v-if="workflowAgentConnection.settings.webSearch" class="text-muted">联网搜索</span>
      </div>
      <p v-if="agentMessage" role="status" class="mt-3 text-xs text-success">
        {{ agentMessage }}
      </p>
    </section>

    <UModal v-model:open="agentOpen" title="工作流 Agent" description="连接你的模型服务，保存后自动用于工作流。" :dismissible="!agentBusy" :close="!agentBusy" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <form id="agent-api-form" @submit.prevent="saveAgentConfig">
          <fieldset :disabled="agentBusy" class="space-y-5">
            <UFormField label="API 地址" required description="兼容接口的基础地址，通常以 /v1 结尾。">
              <UInput v-model="agentDraft.baseUrl" type="url" required size="lg" class="w-full" :ui="{ base: 'rounded-lg' }" placeholder="https://api.example.com/v1" />
            </UFormField>
            <UFormField label="API Key" :required="agentDraft.auth !== 'none' && !workflowAgentConnection?.hasCredentials && !pendingAgentId" :description="workflowAgentConnection?.hasCredentials || pendingAgentId ? '已加密保存，留空保留当前 Key。' : '密钥加密保存，不会显示在工作流中。'">
              <UInput v-model="agentDraft.apiKey" type="password" autocomplete="new-password" size="lg" class="w-full" :ui="{ base: 'rounded-lg' }" :required="agentDraft.auth !== 'none' && !workflowAgentConnection?.hasCredentials && !pendingAgentId" :placeholder="workflowAgentConnection?.hasCredentials || pendingAgentId ? '留空保留当前 Key' : '输入服务商提供的 Key'" />
            </UFormField>
            <UFormField label="模型" required>
              <UInput v-model="agentDraft.model" required size="lg" class="w-full" :ui="{ base: 'rounded-lg' }" placeholder="输入模型 ID" />
            </UFormField>
            <div class="divide-y divide-default rounded-xl border border-default px-4">
              <USwitch v-model="agentDraft.supportsVision" label="图片理解" description="允许 Agent 分析参考图片" class="py-3.5" />
              <USwitch v-model="agentDraft.webSearch" label="联网搜索" description="需要服务商支持 Responses 网页搜索" class="py-3.5" />
            </div>
            <div class="border-t border-default pt-3">
              <button type="button" class="flex w-full items-center justify-between py-2 text-sm text-muted transition-colors hover:text-highlighted" :aria-expanded="agentAdvanced" aria-controls="agent-advanced" @click="agentAdvanced = !agentAdvanced">
                高级设置
                <UIcon name="i-lucide-chevron-down" class="size-4 transition-transform" :class="agentAdvanced ? 'rotate-180' : ''" />
              </button>
              <div v-show="agentAdvanced" id="agent-advanced" class="grid gap-4 pt-3 sm:grid-cols-2">
                <UFormField label="协议">
                  <USelect v-model="agentDraft.apiProtocol" :items="protocolOptions" class="w-full" />
                </UFormField>
                <UFormField label="鉴权方式">
                  <USelect v-model="agentDraft.auth" :items="authOptions" class="w-full" />
                </UFormField>
                <UFormField label="超时（秒）">
                  <UInput v-model.number="agentDraft.timeoutSeconds" type="number" :min="5" :max="300" required class="w-full" />
                </UFormField>
              </div>
            </div>
            <UAlert v-if="agentError" color="error" variant="subtle" :description="agentError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-3">
          <span class="text-xs text-muted">保存后对新任务生效</span>
          <div class="flex gap-2">
            <UButton color="neutral" variant="ghost" :disabled="agentBusy" @click="agentOpen = false">
              取消
            </UButton>
            <UButton type="submit" form="agent-api-form" :loading="agentBusy">
              保存配置
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <div class="grid gap-4 md:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <strong>用途分配与运营设置</strong>
            <UButton variant="soft" color="neutral" size="sm" icon="i-lucide-sliders-horizontal" :disabled="!settings" @click="openSettings">
              用途分配与设置
            </UButton>
          </div>
        </template>
        <UAlert v-if="settingsLoadError" color="error" variant="subtle" title="运营设置加载失败">
          <template #actions>
            <UButton color="error" variant="soft" @click="refreshSettings()">
              重试
            </UButton>
          </template>
        </UAlert>
        <dl v-else-if="settings" class="grid grid-cols-2 gap-4 text-sm">
          <div v-for="purpose in purposeAssignments" :key="purpose.field" class="col-span-2 flex justify-between gap-3 border-b border-default pb-2">
            <dt class="text-muted">
              {{ purpose.label }}
            </dt>
            <dd>{{ connections?.find(c => c.id === settings?.[purpose.field])?.name || '未分配' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              注册方式
            </dt><dd class="mt-1 font-medium">
              {{ { invite: '邀请注册', open: '开放注册', disabled: '关闭注册' }[settings.registrationMode] }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              注册赠送
            </dt><dd class="mt-1 font-medium">
              {{ settings.signupCredits }} 额度
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              每用户活动任务上限
            </dt><dd class="mt-1 font-medium">
              {{ settings.userMaxActiveGenerations }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              平台每日预算
            </dt><dd class="mt-1 font-medium">
              {{ settings.platformDailyCreditBudget }} 额度
            </dd>
          </div>
        </dl>
        <p v-else role="status" class="text-sm text-muted">
          正在加载设置…
        </p>
      </UCard>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <strong>文本固定报价</strong>
            <UButton variant="soft" color="neutral" size="sm" icon="i-lucide-plus" @click="openPrice">
              发布价格
            </UButton>
          </div>
        </template>
        <UAlert v-if="pricesLoadError" color="error" variant="subtle" title="价格加载失败">
          <template #actions>
            <UButton color="error" variant="soft" @click="refreshPrices()">
              重试
            </UButton>
          </template>
        </UAlert>
        <div v-else-if="prices?.length" class="max-h-60 divide-y divide-default overflow-y-auto">
          <div v-for="p in prices" :key="p.id" class="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span class="break-all">{{ p.model }} · {{ { short: '短篇', medium: '中篇', long: '长篇' }[p.length] || p.length }}</span>
            <span class="text-muted">{{ p.credits }} 额度 · v{{ p.version }}</span>
          </div>
        </div>
        <p v-else class="text-sm text-muted">
          暂无文本价格，发布后对应模型与篇幅才可生成。
        </p>
      </UCard>
    </div>
    <AdminImagePricing :connections="connections || []" />
    <UCard>
      <template #header>
        待核对文本与图片任务
      </template>
      <div v-for="r in reviewRuns" :key="r.id" class="flex flex-wrap justify-between gap-3 py-2 text-sm">
        <span>{{ r.kind === 'image' ? '图片' : '文本' }} · {{ r.ownerEmail }} · {{ r.reservedCredits }} 预留 · {{ r.error }}</span>
        <div class="flex gap-2">
          <UButton size="xs" @click="settle(r.id, 'release')">
            释放额度
          </UButton>
          <UButton size="xs" color="warning" @click="settle(r.id, 'charge')">
            按报价结算
          </UButton>
        </div>
      </div>
      <p v-if="!reviewRuns?.length" class="text-sm text-muted">
        没有待核对任务
      </p>
    </UCard>
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default px-4 py-3">
      <div>
        <p class="text-sm font-medium">
          部署状态
        </p><p class="text-xs text-muted">
          查看基础设施与运行环境的只读信息。
        </p>
      </div>
      <UButton color="neutral" variant="ghost" icon="i-lucide-server" @click="deploymentOpen = true">
        查看状态
      </UButton>
    </div>

    <UModal v-model:open="connectionOpen" :title="editing ? '更新连接配置' : '新建模型连接'" :description="editing ? '保存后创建新版本；留空的密钥沿用原配置。' : '配置模型和连接凭据，保存后可按用途分配使用。'" :dismissible="!busy" :close="!busy" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form id="connection-form" @submit.prevent="save">
          <fieldset :disabled="busy" class="min-w-0 space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="连接名称" required>
                <UInput v-model="name" class="w-full" placeholder="例如：阿里云 DashScope 生产" />
              </UFormField>

              <UFormField label="连接类型" required>
                <USelect
                  v-model="kind"
                  :items="kindOptions"
                  :disabled="!!editing"
                  class="w-full"
                />
              </UFormField>

              <UFormField v-if="kind !== 'text'" label="模型供应商">
                <div class="flex gap-2">
                  <USelect
                    v-model="provider"
                    :items="kind === 'image' ? [{ label: '阿里云百炼 · 千问图片', value: 'dashscope' }, { label: 'OpenAI 兼容（工作流）', value: 'openai-compatible' }] : providerOptions"
                    :disabled="!!editing"
                    class="flex-1"
                    @change="useCatalog"
                  />
                  <UButton variant="soft" color="neutral" size="sm" @click="useCatalog">
                    自动填入
                  </UButton>
                </div>
              </UFormField>

              <UFormField label="连接基地址 (Base URL)">
                <UInput v-model="baseUrl" class="w-full" placeholder="兼容协议必填；百炼可留空使用对应地域地址" />
              </UFormField>

              <UFormField label="模型列表（每行一个）" class="sm:col-span-2">
                <UTextarea v-model="models" :rows="3" class="w-full font-mono text-xs" placeholder="输入模型标识符，每行一个…" />
              </UFormField>

              <UFormField label="默认模型">
                <UInput v-model="defaultModel" class="w-full font-mono text-xs" />
              </UFormField>

              <UFormField v-if="provider === 'dashscope' && kind !== 'text'" label="业务空间 (Workspace ID)">
                <UInput v-model="workspaceId" class="w-full" />
              </UFormField>

              <UFormField v-if="provider === 'dashscope' && kind !== 'text'" label="地域 (Region)">
                <UInput v-model="region" class="w-full" />
              </UFormField>

              <UFormField v-if="provider === 'minimax' && kind === 'video'" label="Group ID">
                <UInput v-model="groupId" class="w-full" />
              </UFormField>

              <UFormField v-if="kind === 'text'" label="协议格式">
                <USelect
                  v-model="protocol"
                  :items="protocolOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField v-if="kind !== 'video'" label="鉴权方式">
                <USelect
                  v-model="auth"
                  :items="authOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField v-if="kind !== 'video'" label="请求超时（秒）">
                <UInput v-model.number="timeoutSeconds" class="w-full" type="number" :min="5" :max="300" />
              </UFormField>

              <div v-if="kind === 'text'" class="sm:col-span-2 grid gap-3 rounded-lg border border-default/70 bg-muted/30 p-3 sm:grid-cols-2">
                <label class="flex cursor-pointer items-start gap-2 text-sm">
                  <input v-model="supportsVision" type="checkbox" class="mt-0.5 size-4 rounded text-primary focus:ring-primary">
                  <span><strong class="block text-highlighted">支持图片理解</strong><span class="text-xs text-muted">允许 Agent 读取工作流上传的参考图片</span></span>
                </label>
                <label class="flex cursor-pointer items-start gap-2 text-sm">
                  <input v-model="webSearch" type="checkbox" class="mt-0.5 size-4 rounded text-primary focus:ring-primary">
                  <span><strong class="block text-highlighted">允许联网搜索</strong><span class="text-xs text-muted">需要 Responses 协议及服务端 web_search 能力</span></span>
                </label>
              </div>

              <template v-if="kind === 'video' && provider === 'kling'">
                <UFormField label="Access Key（留空保持）">
                  <UInput v-model="accessKey" type="password" autocomplete="new-password" class="w-full" />
                </UFormField>
                <UFormField label="Secret Key（留空保持）">
                  <UInput v-model="secretKey" type="password" autocomplete="new-password" class="w-full" />
                </UFormField>
              </template>
              <UFormField v-else label="API Key 密钥（留空保持不变）" class="sm:col-span-2">
                <UInput v-model="apiKey" type="password" autocomplete="new-password" class="w-full" placeholder="sk-…" />
              </UFormField>

              <div class="sm:col-span-2 flex items-center gap-2 pt-1">
                <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-highlighted">
                  <input v-model="enabled" type="checkbox" class="size-4 rounded text-primary focus:ring-primary">
                  <span>启用此连接（新报价将可使用）</span>
                </label>
              </div>
            </div>

            <UAlert v-if="connectionError" class="mt-4" color="error" variant="subtle" :description="connectionError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="busy" @click="connectionOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="connection-form" :loading="busy">
            保存新版本
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="settingsOpen" title="用途分配与运营设置" description="为文本、图片、视频和工作流 Agent 分配连接，保存后新任务生效。" :dismissible="!settingsBusy" :close="!settingsBusy" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <form v-if="settingsDraft" id="settings-form" class="space-y-4" @submit.prevent="saveSettings">
          <fieldset :disabled="settingsBusy" class="min-w-0 space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="注册方式">
                <USelect v-model="settingsDraft.registrationMode" class="w-full" :items="[{ label: '邀请注册', value: 'invite' }, { label: '开放注册', value: 'open' }, { label: '关闭注册', value: 'disabled' }]" />
              </UFormField>
              <UFormField label="注册赠送额度">
                <UInput v-model.number="settingsDraft.signupCredits" class="w-full" type="number" />
              </UFormField>
              <UFormField label="每用户活动任务上限">
                <UInput v-model.number="settingsDraft.userMaxActiveGenerations" class="w-full" type="number" />
              </UFormField>
              <UFormField label="平台每日额度预算">
                <UInput v-model.number="settingsDraft.platformDailyCreditBudget" class="w-full" type="number" />
              </UFormField>
              <UFormField label="默认视频连接">
                <USelect v-model="settingsDraft.defaultVideoConnectionId" class="w-full" placeholder="选择连接" :items="(connections || []).filter(c => c.kind === 'video' && c.enabled && !c.revoked).map(c => ({ label: c.name, value: c.id }))" />
              </UFormField>
              <UFormField label="默认文本连接">
                <USelect v-model="settingsDraft.defaultTextConnectionId" class="w-full" placeholder="选择连接" :items="(connections || []).filter(c => c.kind === 'text' && c.enabled && !c.revoked).map(c => ({ label: c.name, value: c.id }))" />
              </UFormField>
              <UFormField label="图片 API 连接" hint="用于图片创作台和工作流图片 API 节点" class="sm:col-span-2">
                <USelect v-model="settingsDraft.defaultImageConnectionId" class="w-full" placeholder="选择图片连接" :items="(connections || []).filter(c => c.kind === 'image' && c.enabled && !c.revoked).map(c => ({ label: c.name, value: c.id }))" />
              </UFormField>
              <UFormField label="工作流视频连接" hint="当前 Wan 3.0 节点使用百炼连接" class="sm:col-span-2">
                <USelect v-model="settingsDraft.workflowVideoConnectionId" class="w-full" placeholder="选择百炼视频连接" :items="(connections || []).filter(c => c.kind === 'video' && c.provider === 'dashscope' && c.enabled && !c.revoked).map(c => ({ label: c.name, value: c.id }))" />
              </UFormField>
              <UFormField label="工作流 Agent 连接" class="sm:col-span-2">
                <USelect v-model="settingsDraft.workflowAgentConnectionId" class="w-full" placeholder="选择文本连接" :items="(connections || []).filter(c => c.kind === 'text' && c.enabled && !c.revoked).map(c => ({ label: `${c.name} · ${c.settings.defaultModel}`, value: c.id }))" />
              </UFormField>
            </div>
            <UAlert v-if="settingsError" color="error" variant="subtle" :description="settingsError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="settingsBusy" @click="settingsOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="settings-form" :loading="settingsBusy">
            保存设置
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="priceOpen" title="发布文本价格" description="每个模型与篇幅单独定价，发布后用于新的报价。" :dismissible="!priceBusy" :close="!priceBusy">
      <template #body>
        <form id="text-price-form" class="space-y-4" @submit.prevent="savePrice">
          <fieldset :disabled="priceBusy" class="min-w-0 space-y-4">
            <UFormField label="文本连接">
              <USelect v-model="price.connectionId" class="w-full" :items="(connections || []).filter(c => c.kind === 'text').map(c => ({ label: c.name, value: c.id }))" placeholder="选择连接" />
            </UFormField>
            <UFormField label="模型">
              <USelect v-model="price.model" class="w-full" :disabled="!price.connectionId" :items="connections?.find(c => c.id === price.connectionId)?.settings.models || []" placeholder="选择模型" />
            </UFormField>
            <UFormField label="篇幅">
              <USelect v-model="price.length" class="w-full" :items="[{ label: '短篇', value: 'short' }, { label: '中篇', value: 'medium' }, { label: '长篇', value: 'long' }]" />
            </UFormField>
            <UFormField label="固定额度">
              <UInput v-model.number="price.credits" class="w-full" type="number" />
            </UFormField>
            <UAlert v-if="priceError" color="error" variant="subtle" :description="priceError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="priceBusy" @click="priceOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="text-price-form" :loading="priceBusy" :disabled="!price.connectionId || !price.model">
            发布价格版本
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="revisionsOpen" :title="`${revisionConnection?.name || '连接'} · 历史版本`">
      <template #body>
        <p v-if="revisionsBusy" role="status" class="text-sm text-muted">
          正在加载版本…
        </p>
        <UAlert v-if="revisionsError" color="error" variant="subtle" :description="revisionsError">
          <template #actions>
            <UButton v-if="revisionConnection" color="error" variant="soft" @click="showRevisions(revisionConnection, !!revisions.length)">
              重试
            </UButton>
          </template>
        </UAlert>
        <div v-if="revisionConnection" class="divide-y divide-default">
          <div v-for="revision in revisions" :key="revision.id" class="flex items-center justify-between gap-3 py-3 text-sm">
            <span>版本 {{ revision.version }} · {{ revision.revoked ? '已撤销' : '可用于已受理任务' }}</span>
            <UButton size="xs" color="error" variant="ghost" :disabled="revision.revoked" @click="revoke(revisionConnection, revision.id)">
              撤销此版本
            </UButton>
          </div>
          <p v-if="!revisionsBusy && !revisionsError && !revisions.length" class="text-sm text-muted">
            暂无历史版本
          </p>
          <UButton v-if="revisionCursor" class="mt-3" variant="soft" color="neutral" :loading="revisionsBusy" @click="showRevisions(revisionConnection, true)">
            更早版本
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="deploymentOpen" title="部署状态" description="只读信息，部署配置由运行环境管理。">
      <template #body>
        <UAlert v-if="deploymentLoadError" color="error" variant="subtle" title="部署状态加载失败">
          <template #actions>
            <UButton color="error" variant="soft" @click="refreshDeployment()">
              重试
            </UButton>
          </template>
        </UAlert>
        <dl v-else class="divide-y divide-default text-sm">
          <div v-for="(value, key) in deployment" :key="key" class="flex flex-wrap justify-between gap-2 py-3">
            <dt class="break-all text-muted">
              {{ key }}
            </dt><dd class="break-all font-medium">
              {{ value }}
            </dd>
          </div>
        </dl>
      </template>
    </UModal>
  </div>
</template>

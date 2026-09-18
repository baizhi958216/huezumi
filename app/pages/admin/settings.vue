<script setup lang="ts">
/* eslint-disable no-alert -- Explicit confirmation protects destructive configuration and rename actions. */
import type { ProviderCapability } from '#shared/types/generation'
import type { ConnectionSummary, PlatformSettings } from '#shared/types/platform'

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
const kind = ref<'video' | 'text'>('video')
const provider = ref('dashscope')
const baseUrl = ref('')
const models = ref('')
const defaultModel = ref('')
const workspaceId = ref('')
const region = ref('cn-beijing')
const groupId = ref('')
const auth = ref<'bearer' | 'none'>('bearer')
const protocol = ref<'auto' | 'chat_completions' | 'responses'>('auto')
const enabled = ref(true)
const apiKey = ref('')
const accessKey = ref('')
const secretKey = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)
const price = reactive({ connectionId: '', model: '', length: 'short', credits: 1 })
function reset() {
  editing.value = undefined
  kind.value = 'video'
  provider.value = 'dashscope'
  region.value = 'cn-beijing'
  auth.value = 'bearer'
  protocol.value = 'auto'
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
    const body = { name: name.value, kind: kind.value, provider: kind.value === 'text' ? 'openai-compatible' : provider.value, enabled: enabled.value, settings: { baseUrl: baseUrl.value || undefined, defaultModel: defaultModel.value, models: models.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean), workspaceId: workspaceId.value || undefined, region: region.value || undefined, groupId: groupId.value || undefined, auth: auth.value, apiProtocol: protocol.value }, ...(Object.keys(secrets).length ? { secrets } : {}) }
    if (editing.value)
      await $fetch(`/api/admin/connections/${editing.value}`, { method: 'PUT', body })
    else
      await $fetch('/api/admin/connections', { method: 'POST', body })
    connectionOpen.value = false
    reset()
    message.value = '连接版本已保存；只影响后续报价。'
    await refresh()
  }
  catch (e) {
    connectionError.value = apiError(e)
  }
  finally {
    busy.value = false
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
function useCatalog() {
  const c = catalog.value?.find(c => c.id === provider.value)
  if (c) {
    models.value = c.models.map(m => m.id).join('\n')
    defaultModel.value = c.models[0]?.id || ''
  }
}

const kindOptions = [
  { label: '视频模型', value: 'video' },
  { label: '文本大模型', value: 'text' },
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
            保存的凭据采用环境密钥加密并不回显。修改连接自动创建新版本，已受理任务继续使用原版本。
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
                {{ c.kind === 'video' ? '视频模型' : '文本模型' }}
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

    <div class="grid gap-4 md:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <strong>运营设置</strong>
            <UButton variant="soft" color="neutral" size="sm" icon="i-lucide-sliders-horizontal" :disabled="!settings" @click="openSettings">
              编辑设置
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
    <UCard>
      <template #header>
        待核对文本任务
      </template>
      <div v-for="r in reviewRuns" :key="r.id" class="flex flex-wrap justify-between gap-3 py-2 text-sm">
        <span>{{ r.ownerEmail }} · {{ r.reservedCredits }} 预留 · {{ r.error }}</span>
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

    <UModal v-model:open="connectionOpen" :title="editing ? '更新连接配置' : '新建模型连接'" :description="editing ? '保存后创建新版本；留空的密钥沿用原配置。' : '配置模型和连接凭据，保存后即可用于报价。'" :dismissible="!busy" :close="!busy" :ui="{ content: 'sm:max-w-2xl' }">
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

              <UFormField v-if="kind === 'video'" label="视频供应商">
                <div class="flex gap-2">
                  <USelect
                    v-model="provider"
                    :items="providerOptions"
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
                <UInput v-model="baseUrl" class="w-full" placeholder="文本连接必填；视频可使用供应商默认地址" />
              </UFormField>

              <UFormField label="模型列表（每行一个）" class="sm:col-span-2">
                <UTextarea v-model="models" :rows="3" class="w-full font-mono text-xs" placeholder="输入模型标识符，每行一个…" />
              </UFormField>

              <UFormField label="默认模型">
                <UInput v-model="defaultModel" class="w-full font-mono text-xs" />
              </UFormField>

              <UFormField v-if="provider === 'dashscope' && kind === 'video'" label="业务空间 (Workspace ID)">
                <UInput v-model="workspaceId" class="w-full" />
              </UFormField>

              <UFormField v-if="provider === 'dashscope' && kind === 'video'" label="地域 (Region)">
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

              <UFormField v-if="kind === 'text'" label="鉴权方式">
                <USelect
                  v-model="auth"
                  :items="authOptions"
                  class="w-full"
                />
              </UFormField>

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
    <UModal v-model:open="settingsOpen" title="运营设置" description="调整注册、额度及默认模型连接，保存后生效。" :dismissible="!settingsBusy" :close="!settingsBusy" :ui="{ content: 'sm:max-w-xl' }">
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

<script setup lang="ts">
/* eslint-disable no-alert -- Revoking a version affects unfinished tasks. */
import type { ProviderCapability } from '#shared/types/generation'
import type { ConnectionSummary } from '#shared/types/platform'
import { IMAGE_MODELS } from '#shared/types/image-generation'

const { data: connections, refresh, status: connectionStatus, error: connectionLoadError } = await useFetch<ConnectionSummary[]>('/api/admin/connections')
const { data: catalog } = await useFetch<ProviderCapability[]>('/api/providers')
const connectionOpen = ref(false)
const revisionsOpen = ref(false)
const connectionError = ref('')
const revisionsError = ref('')
const revisionsBusy = ref(false)
const editing = ref<string>()
const name = ref('')
const kind = ref<'video' | 'text' | 'image'>('video')
const provider = ref('dashscope')
const baseUrl = ref('')
const models = ref('')
const defaultModel = ref('')
const modelOptions = computed(() => [...new Set(models.value.split(/[\n,]/).map(model => model.trim()).filter(Boolean))])
const defaultModelError = computed(() => defaultModel.value && !modelOptions.value.includes(defaultModel.value)
  ? '当前默认模型已不在模型列表中，请重新选择'
  : undefined)
const workspaceId = ref('')
const region = ref('cn-beijing')
const groupId = ref('')
const auth = ref<'bearer' | 'none'>('bearer')
const protocol = ref<'auto' | 'chat_completions' | 'responses'>('auto')
const timeoutSeconds = ref(120)
const enabled = ref(true)
const apiKey = ref('')
const accessKey = ref('')
const secretKey = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)
function reset() {
  editing.value = undefined
  kind.value = 'video'
  provider.value = 'dashscope'
  region.value = 'cn-beijing'
  auth.value = 'bearer'
  protocol.value = 'auto'
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
function edit(c: ConnectionSummary) {
  if (c.kind === 'workflow') {
    void navigateTo('/studio/workflow')
    return
  }
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
  timeoutSeconds.value = c.settings.timeoutSeconds || 120
  connectionOpen.value = true
}
async function save() {
  if (busy.value)
    return
  connectionError.value = ''
  message.value = ''
  if (!modelOptions.value.includes(defaultModel.value)) {
    connectionError.value = '请选择模型列表中的默认模型'
    return
  }
  busy.value = true
  try {
    const secrets = { ...(apiKey.value ? { apiKey: apiKey.value } : {}), ...(accessKey.value ? { accessKey: accessKey.value } : {}), ...(secretKey.value ? { secretKey: secretKey.value } : {}) }
    const body = { name: name.value, kind: kind.value, provider: kind.value === 'text' ? 'openai-compatible' : provider.value, enabled: enabled.value, settings: { baseUrl: baseUrl.value || undefined, defaultModel: defaultModel.value, models: modelOptions.value, workspaceId: workspaceId.value || undefined, region: region.value || undefined, groupId: groupId.value || undefined, auth: auth.value, apiProtocol: protocol.value, ...(kind.value !== 'video' ? { timeoutSeconds: timeoutSeconds.value } : {}) }, ...(Object.keys(secrets).length ? { secrets } : {}) }
    if (editing.value)
      await $fetch(`/api/admin/connections/${editing.value}`, { method: 'PUT', body })
    else
      await $fetch('/api/admin/connections', { method: 'POST', body })
    connectionOpen.value = false
    reset()
    message.value = '连接版本已保存；后续报价使用新配置。'
    await refresh()
  }
  catch (e) {
    connectionError.value = apiError(e)
  }
  finally {
    busy.value = false
  }
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
  }
  catch (e) {
    if (revisionsOpen.value)
      revisionsError.value = apiError(e)
    else
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
  <div class="space-y-5">
    <UAlert v-if="error" color="error" :description="error" />
    <UAlert v-if="message" color="success" :description="message" />
    <AdminAssignments :connections="connections || []" :unavailable="!!connectionLoadError" />
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
                {{ c.revoked ? '已撤销' : !c.enabled ? '已停用' : c.hasCredentials ? '已配置凭据' : c.settings.auth === 'none' ? '免鉴权' : '缺少凭据' }}
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
          </div>
        </div>
      </div>
    </section>

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
                    :items="kind === 'image' ? [{ label: '阿里云百炼 · 千问图片', value: 'dashscope' }] : providerOptions"
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

              <UFormField label="默认模型" required :error="defaultModelError">
                <USelect v-model="defaultModel" :items="modelOptions" :disabled="!modelOptions.length" placeholder="从模型列表中选择" class="w-full font-mono text-xs" />
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
  </div>
</template>

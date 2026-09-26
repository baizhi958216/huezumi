<script setup lang="ts">
import type { ConnectionSummary, ModelOption, PlatformSettings } from '#shared/types/platform'

const props = defineProps<{ connections: ConnectionSummary[], unavailable?: boolean }>()
const { data: settings, error, refresh } = await useFetch<PlatformSettings>('/api/admin/settings')
const { data: models, error: modelsError, refresh: refreshModels } = await useFetch<ModelOption[]>('/api/catalog/models')
watch(() => props.connections, () => {
  void refreshModels()
})
const purposes = [
  { field: 'defaultTextConnectionId', label: '文案创作', kind: 'text', description: '故事、剧本和文案' },
  { field: 'defaultImageConnectionId', label: '图片创作 / 图片工作流', kind: 'image', description: '图片创作台需要百炼；兼容接口仅供工作流' },
  { field: 'defaultVideoConnectionId', label: '视频创作', kind: 'video', description: '视频创作台' },
  { field: 'workflowAgentConnectionId', label: '工作流 Agent', kind: 'text', description: '提示词生成与参考图理解' },
  { field: 'workflowVideoConnectionId', label: '工作流视频', kind: 'video', description: '百炼视频节点' },
] as const
const active = ref<(typeof purposes)[number]>()
const selected = ref('none')
const busy = ref(false)
const saveError = ref('')
const open = ref(false)
const options = computed(() => [{ label: '不分配服务', value: 'none' }, ...props.connections.filter(c => c.kind === active.value?.kind && c.enabled && !c.revoked && (active.value?.field !== 'workflowVideoConnectionId' || c.provider === 'dashscope')).map(c => ({ label: `${c.name} · ${c.settings.defaultModel}`, value: c.id }))])
function connection(field: (typeof purposes)[number]['field']) {
  return props.connections.find(c => c.id === settings.value?.[field])
}
function availability(purpose: (typeof purposes)[number]) {
  if (purpose.field.startsWith('workflow'))
    return ''
  const c = connection(purpose.field)
  if (!c)
    return ''
  if (modelsError.value)
    return '报价配置状态加载失败'
  const model = models.value?.find(item => item.connectionId === c.id && item.model === c.settings.defaultModel)
  return model?.available ? '已有报价配置' : model?.reason || '该默认模型未进入创作台目录'
}
function edit(purpose: (typeof purposes)[number]) {
  active.value = purpose
  selected.value = settings.value?.[purpose.field] || 'none'
  saveError.value = ''
  open.value = true
}
async function save() {
  if (!active.value || busy.value)
    return
  busy.value = true
  saveError.value = ''
  try {
    settings.value = await $fetch<PlatformSettings>('/api/admin/settings', { method: 'PATCH', body: { [active.value.field]: selected.value === 'none' ? null : selected.value } })
    await refreshModels()
    open.value = false
  }
  catch (e) { saveError.value = apiError(e) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h2 class="font-semibold">
        用途分配
      </h2><UButton to="/admin/pricing" variant="ghost" color="neutral" trailing-icon="i-lucide-arrow-right">
        配置价格
      </UButton>
    </div>
    <UAlert v-if="error || unavailable" color="error" title="服务配置加载失败">
      <template #actions>
        <UButton @click="refresh()">
          重试设置
        </UButton>
      </template>
    </UAlert>
    <div v-else-if="settings" class="divide-y divide-default rounded-xl border border-default bg-default">
      <div v-for="purpose in purposes" :key="purpose.field" class="grid items-center gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <h3 class="text-sm font-medium">
            {{ purpose.label }}
          </h3><p class="mt-1 text-xs text-muted">
            {{ purpose.description }}
          </p>
        </div>
        <div class="text-sm">
          <p>{{ connection(purpose.field)?.name || '未分配' }}</p><p class="mt-1 break-all text-xs text-muted">
            {{ connection(purpose.field)?.settings.defaultModel }}
          </p><p v-if="availability(purpose)" class="mt-1 text-xs text-muted">
            {{ availability(purpose) }}
          </p><UBadge v-if="connection(purpose.field) && (!connection(purpose.field)?.enabled || connection(purpose.field)?.revoked)" color="warning" variant="subtle" size="xs">
            连接不可用，请重新分配
          </UBadge>
        </div>
        <UButton color="neutral" variant="outline" size="sm" @click="edit(purpose)">
          更换服务
        </UButton>
      </div>
    </div>
    <p v-else role="status" class="text-sm text-muted">
      正在加载用途分配…
    </p>
    <UModal v-model:open="open" :title="active?.label" description="生成使用所选连接的默认模型。移除分配后，该用途不再使用此连接。" :dismissible="!busy" :close="!busy">
      <template #body>
        <form id="assignment-form" class="space-y-4" @submit.prevent="save">
          <UFormField label="服务连接">
            <USelect v-model="selected" :items="options" class="w-full" :disabled="busy" />
          </UFormField><UAlert v-if="saveError" color="error" :description="saveError" />
        </form>
      </template>
      <template #footer>
        <UButton type="submit" form="assignment-form" :loading="busy" :disabled="!options.some(option => option.value === selected)">
          保存分配
        </UButton>
      </template>
    </UModal>
  </section>
</template>

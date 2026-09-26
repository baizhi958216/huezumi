<script setup lang="ts">
import type { ConnectionSummary } from '#shared/types/platform'
import { IMAGE_SIZES, isSupportedImageModel } from '#shared/types/image-generation'
import { latestPriceVersions } from '~/utils/admin-pricing'

defineProps<{ connections: ConnectionSummary[] }>()
const { data: rules, refresh, error: loadError } = await useFetch<Array<{ id: string, provider: string, model: string, resolution: string, formula: { fixedCredits?: number }, version: number, active: boolean }>>('/api/admin/pricing')
const imagePrices = computed(() => (rules.value || []).filter(rule => rule.provider === 'dashscope' && isSupportedImageModel(rule.model)))
const history = ref(false)
const visiblePrices = computed(() => history.value ? imagePrices.value : latestPriceVersions(imagePrices.value.filter(rule => rule.active), rule => JSON.stringify([rule.provider, rule.model, rule.resolution])))
const open = ref(false)
const busy = ref(false)
const error = ref('')
const draft = reactive({ model: '', size: '*', credits: 1 })
async function save() {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    const version = Math.max(0, ...imagePrices.value.filter(rule => rule.model === draft.model && rule.resolution === draft.size).map(rule => rule.version)) + 1
    await $fetch('/api/admin/pricing', { method: 'POST', body: { provider: 'dashscope', model: draft.model, resolution: draft.size, formula: { fixedCredits: draft.credits }, sourceLabel: '平台图片按张计费', version } })
    await refresh()
    open.value = false
  }
  catch (e) { error.value = apiError(e) }
  finally { busy.value = false }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <strong>图片按张报价</strong><UButton size="sm" variant="soft" icon="i-lucide-plus" @click="open = true">
          发布价格
        </UButton>
      </div>
    </template>
    <USwitch v-model="history" label="显示历史版本" class="mb-4" />
    <UAlert v-if="loadError" color="error" title="图片价格加载失败">
      <template #actions>
        <UButton @click="refresh()">
          重试
        </UButton>
      </template>
    </UAlert>
    <div v-else-if="visiblePrices.length" class="max-h-60 divide-y divide-default overflow-y-auto">
      <div v-for="rule in visiblePrices" :key="rule.id" class="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <span>{{ rule.model }} · {{ rule.resolution === '*' ? '全部画幅' : rule.resolution }}</span><span class="text-muted">{{ rule.formula.fixedCredits }} 额度 / 张 · v{{ rule.version }}</span>
      </div>
    </div>
    <p v-else class="text-sm text-muted">
      配置百炼图片连接并发布价格后，用户即可在图片创作台生成。
    </p>
    <UModal v-model:open="open" title="发布图片价格" description="按成功生成的张数计算额度，历史报价保持原价。" :dismissible="!busy" :close="!busy">
      <template #body>
        <form id="image-price-form" class="space-y-4" @submit.prevent="save">
          <fieldset :disabled="busy" class="space-y-4">
            <UFormField label="图片模型" required>
              <USelect v-model="draft.model" :items="[...new Set(connections.filter(c => c.kind === 'image' && c.provider === 'dashscope' && c.enabled && !c.revoked).flatMap(c => c.settings.models))]" placeholder="选择百炼图片模型" class="w-full" />
            </UFormField>
            <UFormField label="画幅">
              <USelect v-model="draft.size" :items="[{ label: '全部画幅', value: '*' }, ...IMAGE_SIZES]" class="w-full" />
            </UFormField>
            <UFormField label="每张额度" required>
              <UInput v-model.number="draft.credits" type="number" :min="1" :max="1000000" required class="w-full" />
            </UFormField>
            <UAlert v-if="error" color="error" variant="subtle" :description="error" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <UButton type="submit" form="image-price-form" :loading="busy" :disabled="!draft.model || draft.credits < 1">
          发布价格版本
        </UButton>
      </template>
    </UModal>
  </UCard>
</template>

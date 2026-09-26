<script setup lang="ts">
import type { ConnectionSummary } from '#shared/types/platform'
import { latestPriceVersions } from '~/utils/admin-pricing'

defineProps<{ connections: ConnectionSummary[] }>()
const { data: prices, refresh: refreshPrices, error: pricesLoadError } = await useFetch<Array<{
  id: string
  connectionId: string
  model: string
  length: string
  credits: number
  version: number
}>>('/api/admin/text-prices')
const history = ref(false)
const visiblePrices = computed(() => history.value ? prices.value || [] : latestPriceVersions(prices.value || [], p => JSON.stringify([p.connectionId, p.model, p.length])))
const priceOpen = ref(false)
const priceBusy = ref(false)
const priceError = ref('')
const message = ref('')
const price = reactive({ connectionId: '', model: '', length: 'short', credits: 1 })
function openPrice() {
  Object.assign(price, { connectionId: '', model: '', length: 'short', credits: 1 })
  priceError.value = ''
  priceOpen.value = true
}
watch(() => price.connectionId, () => {
  price.model = ''
})
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
</script>

<template>
  <div class="space-y-5">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <strong>文本固定报价</strong>
          <UButton variant="soft" color="neutral" size="sm" icon="i-lucide-plus" @click="openPrice">
            发布价格
          </UButton>
        </div>
      </template>
      <USwitch v-model="history" label="显示历史版本" class="mb-4" />
      <UAlert v-if="pricesLoadError" color="error" variant="subtle" title="价格加载失败">
        <template #actions>
          <UButton color="error" variant="soft" @click="refreshPrices()">
            重试
          </UButton>
        </template>
      </UAlert>
      <div v-else-if="prices?.length" class="max-h-60 divide-y divide-default overflow-y-auto">
        <div v-for="p in visiblePrices" :key="p.id" class="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <span class="break-all">{{ connections.find(c => c.id === p.connectionId)?.name || '已移除连接' }} · {{ p.model }} · {{ { short: '短篇', medium: '中篇', long: '长篇' }[p.length] || p.length }}</span>
          <span class="text-muted">{{ p.credits }} 额度 · v{{ p.version }}</span>
        </div>
      </div>
      <p v-else class="text-sm text-muted">
        暂无文本价格，发布后对应模型与篇幅才可生成。
      </p>
    </UCard>
    <UAlert v-if="message" color="success" :description="message" />
    <UModal v-model:open="priceOpen" title="发布文本价格" description="每个模型与篇幅单独定价，发布后用于新的报价。" :dismissible="!priceBusy" :close="!priceBusy">
      <template #body>
        <form id="text-price-form" class="space-y-4" @submit.prevent="savePrice">
          <fieldset :disabled="priceBusy" class="min-w-0 space-y-4">
            <UFormField label="文本连接">
              <USelect v-model="price.connectionId" class="w-full" :items="(connections || []).filter(c => c.kind === 'text' && c.enabled && !c.revoked).map(c => ({ label: c.name, value: c.id }))" placeholder="选择连接" />
            </UFormField>
            <UFormField label="模型">
              <USelect v-model="price.model" class="w-full" :disabled="!price.connectionId" :items="connections?.find(c => c.id === price.connectionId)?.settings.models || []" placeholder="选择模型" />
            </UFormField>
            <UFormField label="篇幅">
              <USelect v-model="price.length" class="w-full" :items="[{ label: '短篇', value: 'short' }, { label: '中篇', value: 'medium' }, { label: '长篇', value: 'long' }]" />
            </UFormField>
            <UFormField label="固定额度">
              <UInput v-model.number="price.credits" class="w-full" type="number" :min="1" :max="1000000" required />
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
  </div>
</template>

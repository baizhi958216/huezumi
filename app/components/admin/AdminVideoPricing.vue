<script setup lang="ts">
import type { ProviderCapability } from '#shared/types/generation'
import type { PriceFormula } from '#shared/utils/pricing'
import { isSupportedImageModel } from '#shared/types/image-generation'
import { latestPriceVersions } from '~/utils/admin-pricing'

interface PriceRule {
  id: string
  provider: string
  model: string
  resolution: string
  formula: PriceFormula
  sourceLabel: string
  version: number
  active: boolean
}
const { data: pricing, refresh: refreshPricing, error: pricingError } = await useFetch<PriceRule[]>('/api/admin/pricing')
const videoPrices = computed(() => (pricing.value || []).filter(rule => !isSupportedImageModel(rule.model)))
const { data: catalog } = await useFetch<ProviderCapability[]>('/api/providers')
const history = ref(false)
const visiblePrices = computed(() => history.value ? videoPrices.value : latestPriceVersions(videoPrices.value.filter(rule => rule.active), rule => JSON.stringify([rule.provider, rule.model, rule.resolution])))
const priceOpen = ref(false)
const priceBusy = ref(false)
const priceError = ref('')
const message = ref('')
const priceDefaults = { provider: 'runway', model: '*', resolution: '*', fixedCredits: 0, outputSecondCredits: 20, inputVideoSecondCredits: 0, referenceImageCredits: 0, minimumCredits: 1, sourceLabel: '管理员配置', sourceUrl: '' }
const priceForm = reactive({ ...priceDefaults })
const providerOptions = computed(() => (catalog.value || []).map(c => ({ label: c.name, value: c.id })))
const selectedProvider = computed(() => catalog.value?.find(c => c.id === priceForm.provider))
watch(() => priceForm.provider, () => {
  priceForm.model = '*'
  priceForm.resolution = '*'
})
const tiers = ref<Array<{ seconds: number, credits: number }>>([])
function openPrice() {
  Object.assign(priceForm, priceDefaults)
  priceError.value = ''
  tiers.value = []
  priceOpen.value = true
}
async function createPriceRule() {
  if (priceBusy.value)
    return
  priceBusy.value = true
  priceError.value = ''
  try {
    if (new Set(tiers.value.map(tier => tier.seconds)).size !== tiers.value.length) {
      priceError.value = '同一时长只能设置一个档位'
      return
    }
    const durationTiers = tiers.value.length ? Object.fromEntries(tiers.value.map(tier => [String(tier.seconds), tier.credits])) : undefined
    await $fetch('/api/admin/pricing', {
      method: 'POST',
      body: {
        provider: priceForm.provider,
        model: priceForm.model,
        resolution: priceForm.resolution,
        version: Math.max(0, ...(pricing.value || []).filter(rule => rule.provider === priceForm.provider && rule.model === priceForm.model && rule.resolution === priceForm.resolution).map(rule => rule.version)) + 1,
        sourceLabel: priceForm.sourceLabel,
        sourceUrl: priceForm.sourceUrl || undefined,
        formula: {
          fixedCredits: priceForm.fixedCredits,
          outputSecondCredits: priceForm.outputSecondCredits,
          inputVideoSecondCredits: priceForm.inputVideoSecondCredits,
          referenceImageCredits: priceForm.referenceImageCredits,
          minimumCredits: priceForm.minimumCredits,
          durationTiers,
        },
      },
    })
    priceOpen.value = false
    message.value = '视频价格版本已发布'
    await refreshPricing()
  }
  catch (error: unknown) {
    priceError.value = (error as {
      data?: {
        statusMessage?: string
      }
    }).data?.statusMessage || '价格规则保存失败'
  }
  finally { priceBusy.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
      <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            视频价格规则
          </h2>
          <p class="text-xs text-dimmed">
            供应商与模型计费公式
          </p>
        </div>
        <UButton size="xs" variant="soft" color="primary" icon="i-lucide-plus" @click="openPrice">
          发布价格
        </UButton>
      </div>
      <div class="p-4">
        <USwitch v-model="history" label="显示历史版本" class="mb-4" />
        <UAlert v-if="pricingError" color="error" variant="subtle" title="价格规则加载失败">
          <template #actions>
            <UButton color="error" variant="soft" @click="refreshPricing()">
              重试
            </UButton>
          </template>
        </UAlert>
        <div v-else class="max-h-80 divide-y divide-default/60 overflow-y-auto">
          <p v-if="!visiblePrices.length" class="py-6 text-center text-sm text-muted">
            暂无视频价格规则，点击「发布价格」添加。
          </p>
          <div v-for="rule in visiblePrices" :key="rule.id" class="py-3 text-sm">
            <div class="flex items-center justify-between">
              <strong class="text-highlighted">{{ rule.provider }} / {{ rule.model }}</strong>
              <UBadge size="xs" variant="subtle" color="neutral">
                v{{ rule.version }}
              </UBadge>
            </div>
            <p class="mt-1 text-xs text-dimmed">
              {{ rule.resolution }} · {{ rule.sourceLabel }} · 固定 {{ rule.formula.fixedCredits || 0 }} + 输出 {{ rule.formula.outputSecondCredits || 0 }}/秒 + 输入 {{ rule.formula.inputVideoSecondCredits || 0 }}/秒 + 参考图 {{ rule.formula.referenceImageCredits || 0 }}/张 · 最低 {{ rule.formula.minimumCredits || 0 }}
              <span v-if="rule.formula.durationTiers"> · 档位 {{ Object.entries(rule.formula.durationTiers).map(([seconds, credits]) => `${seconds}秒：${credits}额度`).join('，') }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
    <UAlert v-if="message" color="success" :description="message" />
    <UModal v-model:open="priceOpen" title="发布视频价格" description="发布新版本后用于后续报价，历史任务保持原价。" :dismissible="!priceBusy" :close="!priceBusy" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form id="video-price-form" @submit.prevent="createPriceRule">
          <fieldset :disabled="priceBusy" class="min-w-0 space-y-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="渠道">
                <USelect v-model="priceForm.provider" :items="providerOptions" class="w-full" />
              </UFormField><UFormField label="模型">
                <USelect v-model="priceForm.model" :items="[{ label: '所有模型（通用规则）', value: '*' }, ...(selectedProvider?.models || []).map(model => ({ label: model.id, value: model.id }))]" class="w-full" />
              </UFormField><UFormField label="分辨率">
                <USelect v-model="priceForm.resolution" :items="['*', ...(selectedProvider?.resolutions || [])]" class="w-full" />
              </UFormField><UFormField label="每次固定额度">
                <UInput v-model.number="priceForm.fixedCredits" class="w-full" type="number" />
              </UFormField><UFormField label="每输出秒额度">
                <UInput v-model.number="priceForm.outputSecondCredits" class="w-full" type="number" />
              </UFormField><UFormField label="每输入视频秒额度">
                <UInput v-model.number="priceForm.inputVideoSecondCredits" class="w-full" type="number" />
              </UFormField><UFormField label="每参考图额度">
                <UInput v-model.number="priceForm.referenceImageCredits" class="w-full" type="number" />
              </UFormField><UFormField label="最低额度">
                <UInput v-model.number="priceForm.minimumCredits" class="w-full" type="number" />
              </UFormField>
            </div>
            <div class="space-y-3">
              <p class="text-sm font-medium">
                时长档位（可选）
              </p>
              <div v-for="(tier, index) in tiers" :key="index" class="flex items-end gap-2">
                <UFormField label="秒数">
                  <UInput v-model.number="tier.seconds" type="number" :min="1" required />
                </UFormField>
                <UFormField label="额度">
                  <UInput v-model.number="tier.credits" type="number" :min="1" required />
                </UFormField>
                <UButton color="neutral" variant="ghost" @click="tiers.splice(index, 1)">
                  移除
                </UButton>
              </div>
              <UButton variant="soft" color="neutral" @click="tiers.push({ seconds: 5, credits: 1 })">
                添加档位
              </UButton>
            </div>
            <UFormField class="mt-3" label="来源说明">
              <UInput v-model="priceForm.sourceLabel" class="w-full" />
            </UFormField><UFormField class="mt-3" label="官方价格来源 URL（可选）">
              <UInput v-model="priceForm.sourceUrl" class="w-full" />
            </UFormField>
            <UAlert v-if="priceError" class="mt-4" color="error" variant="subtle" :description="priceError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="priceBusy" @click="priceOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="video-price-form" :loading="priceBusy">
            发布新版本
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

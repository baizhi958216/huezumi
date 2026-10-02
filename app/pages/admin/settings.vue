<script setup lang="ts">
import type { PlatformSettings } from '#shared/types/platform'

const { data: settings, error, refresh } = await useFetch<PlatformSettings>('/api/admin/settings')
const { data: deployment, error: deploymentError, refresh: refreshDeployment } = await useFetch('/api/admin/deployment')
const draft = reactive({ registrationMode: 'invite' as PlatformSettings['registrationMode'], signupCredits: 0, userMaxActiveGenerations: 3, platformDailyCreditBudget: 100000 })
const busy = ref(false)
const message = ref('')
const saveError = ref('')
function reset() {
  if (settings.value) {
    const { registrationMode, signupCredits, userMaxActiveGenerations, platformDailyCreditBudget } = settings.value
    Object.assign(draft, { registrationMode, signupCredits, userMaxActiveGenerations, platformDailyCreditBudget })
  }
}
watch(settings, reset, { immediate: true })
const dirty = computed(() => settings.value && Object.entries(draft).some(([key, value]) => settings.value?.[key as keyof PlatformSettings] !== value))
async function save() {
  if (busy.value)
    return
  busy.value = true
  saveError.value = ''
  message.value = ''
  try {
    settings.value = await $fetch<PlatformSettings>('/api/admin/settings', { method: 'PATCH', body: draft })
    message.value = '运营设置已保存'
  }
  catch (e) { saveError.value = apiError(e) }
  finally { busy.value = false }
}
const deploymentLabels: Record<string, string> = { databaseConfigured: '数据库配置', encryptionConfigured: '凭据加密配置', storageConfigured: '对象存储配置', workerEnabled: '当前进程 Worker 开关', workerConcurrency: 'Worker 并发数' }
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" title="运营设置加载失败">
      <template #actions>
        <UButton @click="refresh()">
          重试
        </UButton>
      </template>
    </UAlert>
    <form v-else-if="settings" class="space-y-6 rounded-xl border border-default bg-default p-5 sm:p-6" @submit.prevent="save">
      <fieldset :disabled="busy" class="grid gap-6 sm:grid-cols-2">
        <UFormField label="注册方式">
          <USelect v-model="draft.registrationMode" :items="[{ label: '邀请注册', value: 'invite' }, { label: '开放注册', value: 'open' }, { label: '关闭注册', value: 'disabled' }]" class="w-full" />
        </UFormField>
        <UFormField label="注册赠送额度">
          <UInput v-model.number="draft.signupCredits" type="number" :min="0" :max="1000000" required class="w-full" />
        </UFormField>
        <UFormField label="每用户活动任务上限">
          <UInput v-model.number="draft.userMaxActiveGenerations" type="number" :min="1" :max="100" required class="w-full" />
        </UFormField>
        <UFormField label="平台每日额度预算">
          <UInput v-model.number="draft.platformDailyCreditBudget" type="number" :min="0" :max="2000000000" required class="w-full" />
        </UFormField>
      </fieldset>
      <UAlert v-if="saveError" color="error" :description="saveError" /><UAlert v-if="message" color="success" :description="message" />
      <div class="flex justify-end gap-2 border-t border-default pt-4">
        <UButton color="neutral" variant="ghost" :disabled="busy || !dirty" @click="reset">
          撤销修改
        </UButton><UButton type="submit" :disabled="!dirty" :loading="busy">
          保存设置
        </UButton>
      </div>
    </form>
    <UCard>
      <template #header>
        <h2 class="font-semibold">
          部署配置
        </h2><p class="mt-1 text-xs text-muted">
          显示当前 Web 进程配置，不代表独立 Worker 或外部服务的健康状态。
        </p>
      </template>
      <UAlert v-if="deploymentError" color="error" title="部署配置加载失败">
        <template #actions>
          <UButton @click="refreshDeployment()">
            重试
          </UButton>
        </template>
      </UAlert>
      <dl v-else class="grid gap-5 text-sm sm:grid-cols-2">
        <div v-for="(value, key) in deployment" :key="key">
          <dt class="text-muted">
            {{ deploymentLabels[key] || key }}
          </dt><dd class="mt-1 font-medium">
            {{ typeof value === 'boolean' ? value ? '已开启 / 已配置' : '未开启 / 未配置' : value }}
          </dd>
        </div>
      </dl>
    </UCard>
  </div>
</template>

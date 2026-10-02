<script setup lang="ts">
import type { ConnectionSummary } from '#shared/types/platform'
import type { ComfyInstalledNode } from '#shared/types/workflow'
import { workflowPolicySchema } from '#shared/utils/workflow'

const emit = defineEmits<{ saved: [] }>()
const { data, refresh } = await useFetch<{ connection: ConnectionSummary | null, nodes: ComfyInstalledNode[], scanError?: string }>('/api/admin/comfyui')
const baseUrl = ref(data.value?.connection?.settings.baseUrl || 'http://127.0.0.1:8188')
const auth = ref(data.value?.connection?.settings.auth || 'none')
const apiKey = ref('')
const accessKey = ref('')
const secretKey = ref('')
const policy = ref(JSON.stringify(data.value?.connection?.settings.workflowPolicy || { maxNodes: 100, nodes: {} }, null, 2))
const busy = ref(false)
const toast = useToast()
const scanning = ref(false)
async function scan() {
  scanning.value = true
  try {
    await refresh()
  }
  finally {
    scanning.value = false
  }
}
async function save() {
  busy.value = true
  try {
    const workflowPolicy = workflowPolicySchema.parse(JSON.parse(policy.value))
    const secrets = Object.fromEntries(Object.entries({ apiKey: apiKey.value, accessKey: accessKey.value, secretKey: secretKey.value }).filter(([, val]) => val))
    await $fetch('/api/admin/comfyui', { method: 'PUT', body: { id: data.value?.connection?.id, connection: { name: 'ComfyUI 工作流', kind: 'workflow', provider: 'comfyui', enabled: true, settings: { baseUrl: baseUrl.value, auth: auth.value, models: ['workflow'], defaultModel: 'workflow', workflowPolicy }, ...(Object.keys(secrets).length ? { secrets } : {}) } } })
    apiKey.value = accessKey.value = secretKey.value = ''
    await refresh()
    emit('saved')
    toast.add({ title: '设置已保存', description: '连接和参数配置已保存，新任务将使用新版本。', color: 'success', close: true })
  }
  catch (error) {
    toast.add({ title: '设置保存失败', description: (error as { data?: { message?: string } }).data?.message || '请检查地址、凭据和节点参数 JSON。', color: 'error', duration: 10000, close: true })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted">
      自动读取 ComfyUI 已加载的全部节点，无需逐个启用。安装插件并重启 ComfyUI 后刷新即可使用，工作流暂不接入平台计费。
    </p>
    <UFormField label="ComfyUI 服务地址">
      <UInput v-model="baseUrl" class="w-full" />
    </UFormField>
    <UFormField label="服务鉴权">
      <USelect v-model="auth" :items="[{ label: '本地私有服务', value: 'none' }, { label: 'Bearer', value: 'bearer' }]" />
    </UFormField>
    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField v-for="label in ['apiKey', 'accessKey', 'secretKey']" :key="label" :label="label">
        <UInput v-if="label === 'apiKey'" v-model="apiKey" type="password" autocomplete="new-password" placeholder="留空保留" />
        <UInput v-else-if="label === 'accessKey'" v-model="accessKey" type="password" autocomplete="new-password" placeholder="留空保留" />
        <UInput v-else v-model="secretKey" type="password" autocomplete="new-password" placeholder="留空保留" />
      </UFormField>
    </div>
    <WorkflowNodePicker :nodes="data?.nodes || []" :scanning="scanning" :scan-error="data?.scanError" :connected="!!data?.connection" @scan="scan" />
    <details>
      <summary class="cursor-pointer text-sm font-medium">
        高级：节点参数与凭据 JSON
      </summary>
      <UFormField class="mt-3" label="节点参数配置" description="无需列出全部节点。上传字段自动识别；assetInputs 可补充自定义上传字段，secretInputs 映射服务端凭据，fixedInputs 设置固定参数。">
        <UTextarea v-model="policy" :rows="14" class="w-full font-mono" spellcheck="false" />
      </UFormField>
    </details>
    <UButton :loading="busy" @click="save">
      保存连接与参数
    </UButton>
  </div>
</template>

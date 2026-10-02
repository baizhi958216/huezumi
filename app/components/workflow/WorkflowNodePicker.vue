<script setup lang="ts">
import type { ComfyInstalledNode } from '#shared/types/workflow'

const props = defineProps<{ nodes: ComfyInstalledNode[], scanning: boolean, scanError?: string, connected: boolean }>()
const emit = defineEmits<{ scan: [] }>()
const search = ref('')
const limit = ref(80)
const filtered = computed(() => props.nodes.filter(node => `${node.name} ${node.displayName} ${node.category}`.toLowerCase().includes(search.value.toLowerCase())))
watch(search, () => limit.value = 80)
</script>

<template>
  <section class="rounded-xl border border-muted bg-elevated" aria-label="已安装节点目录">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-muted p-4">
      <div>
        <h3 class="text-sm font-semibold">
          ComfyUI 节点目录
        </h3>
        <p class="mt-1 text-xs text-muted">
          已加载 {{ nodes.length }} 个 · 自动可用
        </p>
      </div>
      <UButton icon="i-lucide-scan-search" variant="outline" color="neutral" :loading="scanning" :disabled="!connected" @click="emit('scan')">
        扫描已安装节点
      </UButton>
    </div>
    <div class="space-y-3 p-4">
      <p v-if="!connected" class="text-sm text-muted">
        先保存下方连接配置，即可扫描此 ComfyUI 中的全部节点。
      </p>
      <p v-if="scanError" role="alert" class="text-sm text-error">
        {{ scanError }}
      </p>
      <UInput v-model="search" icon="i-lucide-search" placeholder="搜索名称、类名或分类…" aria-label="搜索已安装节点" class="w-full" />
      <div class="flex items-center justify-between gap-2 text-xs text-muted">
        <span>匹配 {{ filtered.length }} 个</span>
      </div>
      <div class="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-muted">
        <div v-for="node in filtered.slice(0, limit)" :key="node.name" class="flex items-start gap-3 border-b border-muted p-3 last:border-b-0">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium break-words">
              {{ node.displayName }}
            </p>
            <p class="mt-0.5 text-xs text-dimmed break-all">
              {{ node.category }} · {{ node.name }}
            </p>
            <p v-if="node.credentialInputs.length" class="mt-1 text-xs text-muted">
              需要配置凭据映射：{{ node.credentialInputs.join('、') }}
            </p>
            <p v-if="node.assetInputs.length" class="mt-1 text-xs text-muted">
              自动识别上传字段：{{ node.assetInputs.join('、') }}
            </p>
          </div>
        </div>
        <p v-if="!filtered.length" class="p-5 text-center text-sm text-muted">
          {{ nodes.length ? '没有匹配的节点' : '服务启动后会自动读取节点目录' }}
        </p>
        <UButton v-if="filtered.length > limit" block color="neutral" variant="ghost" @click="limit += 80">
          显示更多（剩余 {{ filtered.length - limit }} 个）
        </UButton>
      </div>
      <p class="text-xs leading-relaxed text-muted">
        所有已加载节点都会出现在创作台。此目录用于查看节点信息，凭据映射与固定参数可在高级配置中设置。
      </p>
    </div>
  </section>
</template>

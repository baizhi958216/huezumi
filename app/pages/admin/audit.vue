<script setup lang="ts">
interface Entry { id: string, actorEmail?: string, action: string, targetType: string, targetId: string, detail: Record<string, unknown>, createdAt: string }
const { data, error, refresh } = await useFetch<Entry[]>('/api/admin/audit')
const search = ref('')
const entries = computed(() => (data.value || []).filter(entry => `${entry.actorEmail} ${entry.action} ${entry.targetId}`.toLowerCase().includes(search.value.trim().toLowerCase())))
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between gap-3">
      <UInput v-model="search" placeholder="搜索操作者、操作或目标 ID" aria-label="搜索操作记录" icon="i-lucide-search" /><UButton color="neutral" variant="outline" @click="refresh()">
        刷新
      </UButton>
    </div>
    <UAlert v-if="error" color="error" title="操作记录加载失败" />
    <div v-else class="divide-y divide-default rounded-xl border border-default bg-default">
      <p v-if="!entries.length" class="p-8 text-center text-sm text-muted">
        暂无匹配记录
      </p>
      <details v-for="entry in entries" :key="entry.id" class="p-4">
        <summary class="cursor-pointer text-sm">
          <span class="font-medium">{{ entry.actorEmail || '系统' }}</span> · {{ entry.action }}<time class="ml-3 text-xs text-muted">{{ new Date(entry.createdAt).toLocaleString('zh-CN') }}</time>
        </summary>
        <p class="mt-3 break-all text-xs text-muted">
          {{ entry.targetType }} / {{ entry.targetId }}
        </p><pre class="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{{ JSON.stringify(entry.detail, null, 2) }}</pre>
      </details>
    </div>
    <p class="text-xs text-muted">
      显示接口返回的最近操作记录。
    </p>
  </div>
</template>

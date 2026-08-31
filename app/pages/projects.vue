<script setup lang="ts">
import type { GenerationRecord } from '#shared/types/generation'

const { data: records, refresh, status } = await useFetch<GenerationRecord[]>('/api/generations')
const counts = computed(() => ({
  total: records.value?.length || 0,
  active: records.value?.filter(item => ['PENDING', 'RUNNING'].includes(item.status)).length || 0,
  succeeded: records.value?.filter(item => item.status === 'SUCCEEDED').length || 0,
}))
const statusText = { PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '已完成', FAILED: '失败', UNKNOWN: '未知' }
const statusColor = { PENDING: 'warning', RUNNING: 'info', SUCCEEDED: 'success', FAILED: 'error', UNKNOWN: 'neutral' } as const

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
</script>

<template>
  <div class="mx-auto max-w-[1440px] min-h-[calc(100svh-60px)] px-5 py-12 md:px-8 md:py-16">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div>
        <p class="type-kicker">
          GENERATIONS
        </p>
        <h1 class="type-page-title mt-2">
          作品库
        </h1>
        <p class="type-body mt-3 max-w-xl">
          查看任务进度、播放生成结果，所有成功任务会自动保存在这里。
        </p>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">
          刷新
        </UButton>
        <UButton to="/studio" color="primary" icon="i-lucide-plus">
          新建任务
        </UButton>
      </div>
    </div>

    <div class="mt-8 grid gap-3 sm:grid-cols-3">
      <UCard
        v-for="item in [
          { label: '全部任务', value: counts.total, icon: 'i-lucide-layers-3' },
          { label: '生成中', value: counts.active, icon: 'i-lucide-loader-circle' },
          { label: '已完成', value: counts.succeeded, icon: 'i-lucide-circle-check' },
        ]" :key="item.label" :ui="{ body: 'p-5 sm:p-5' }"
      >
        <div class="flex items-center justify-between">
          <span class="type-label">{{ item.label }}</span>
          <span :class="item.icon" class="text-base text-primary" />
        </div>
        <div class="mt-3 text-3xl font-650 tracking-[-0.04em] text-highlighted">
          {{ item.value }}
        </div>
      </UCard>
    </div>

    <div v-if="records?.length" class="mt-8 grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
      <UCard v-for="record in records" :key="record.id" class="group overflow-hidden" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="relative aspect-video overflow-hidden bg-zinc-950">
          <video v-if="record.videoUrl" :src="record.videoUrl" muted playsinline controls class="h-full w-full object-cover" />
          <div v-else class="film-grain surface-rule h-full flex items-center justify-center bg-zinc-950">
            <span :class="record.status === 'FAILED' ? 'i-lucide-circle-x text-red-400' : 'i-lucide-loader-circle animate-spin text-zinc-300'" class="text-3xl" />
          </div>
          <UBadge :color="statusColor[record.status]" variant="solid" size="md" class="absolute right-3 top-3">
            {{ statusText[record.status] }}
          </UBadge>
        </div>
        <div class="p-5">
          <p class="type-body line-clamp-2 min-h-12">
            {{ record.prompt || '参考素材生成' }}
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="subtle" size="md">
              {{ record.resolution }}
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="md">
              {{ record.ratio }}
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="md">
              {{ record.duration === -1 ? '智能' : `${record.duration} 秒` }}
            </UBadge>
            <span class="type-caption ml-auto">{{ formatDate(record.createdAt) }}</span>
          </div>
          <div v-if="record.videoUrl" class="mt-4 border-t border-muted pt-4">
            <UButton
              :to="record.videoUrl"
              target="_blank"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-download"
              class="px-0"
            >
              下载视频
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <UCard v-else class="mt-8" :ui="{ body: 'p-10 sm:p-16' }">
      <div class="mx-auto max-w-md text-center">
        <div class="mx-auto h-14 w-14 flex items-center justify-center rounded-xl bg-primary/8 text-primary">
          <span class="i-lucide-film text-2xl" />
        </div>
        <h2 class="type-card-title mt-5">
          还没有生成内容
        </h2>
        <p class="type-body mt-2">
          从文字开始，或者上传图片、视频、音频作为参考素材。
        </p>
        <UButton to="/studio" color="primary" icon="i-lucide-plus" class="mt-6">
          创建第一个任务
        </UButton>
      </div>
    </UCard>
  </div>
</template>

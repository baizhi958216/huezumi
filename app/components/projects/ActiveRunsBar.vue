<script setup lang="ts">
import type { RunSummary } from '#shared/types/platform'
import { runKindLabel, runStatusLabel, settlementLabel } from '~/utils/run-labels'

defineProps<{
  runs: RunSummary[]
  loading?: boolean
}>()

const emit = defineEmits<{
  command: [run: RunSummary]
}>()
</script>

<template>
  <div v-if="runs.length" class="space-y-2.5">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="relative flex size-2">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-signal-400 opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-signal-500" />
        </span>
        <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed">
          正在执行与待核对任务
        </h2>
        <UBadge color="primary" variant="subtle" size="xs">
          {{ runs.length }} 个进行中
        </UBadge>
      </div>
    </div>

    <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="run in runs"
        :key="run.id"
        class="relative flex flex-col justify-between overflow-hidden rounded-xl border border-default bg-elevated/80 p-3 shadow-soft backdrop-blur-md transition hover:border-primary/40"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <UBadge
              size="xs"
              :color="run.kind === 'video' ? 'primary' : run.kind === 'text' ? 'info' : 'neutral'"
              variant="subtle"
            >
              {{ runKindLabel[run.kind] }}
            </UBadge>
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-highlighted">
              <UIcon
                :name="run.status === 'RUNNING' ? 'i-lucide-loader-circle' : run.status === 'PENDING' ? 'i-lucide-clock' : 'i-lucide-circle-alert'"
                class="size-3.5 text-signal-500"
                :class="run.status === 'RUNNING' ? 'animate-spin' : ''"
              />
              {{ runStatusLabel[run.status] }}
            </span>
          </div>

          <span class="text-[11px] text-dimmed">
            {{ settlementLabel(run.billing.settlementStatus) }}
          </span>
        </div>

        <p v-if="run.error" class="mt-2 line-clamp-2 text-xs text-error">
          {{ run.error }}
        </p>
        <p v-else class="mt-2 text-xs text-muted">
          {{ run.stage || '任务正在云端计算中…' }}
        </p>

        <div class="mt-3 flex items-center justify-between border-t border-default/50 pt-2 text-xs">
          <span class="font-mono text-[10px] text-dimmed">
            ID: {{ run.id.slice(0, 8) }}
          </span>

          <div class="flex items-center gap-1.5">
            <UButton
              v-if="run.kind !== 'workflow'"
              size="xs"
              variant="ghost"
              color="primary"
              icon="i-lucide-external-link"
              :to="`${run.kind === 'text' ? '/studio' : run.kind === 'image' ? '/studio/image' : '/studio/video'}?run=${run.id}`"
            >
              打开
            </UButton>
            <UButton
              v-if="run.allowedActions.length"
              size="xs"
              variant="soft"
              color="neutral"
              icon="i-lucide-refresh-cw"
              @click="emit('command', run)"
            >
              更新
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

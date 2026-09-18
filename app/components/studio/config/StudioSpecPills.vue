<script setup lang="ts">
import type { AspectRatio, Resolution } from '#shared/types/generation'

defineProps<{
  selectedModelName: string
  resolution: Resolution
  ratio: AspectRatio
  duration: number
  smartDuration: boolean
  audio: boolean
  supportsAudio?: boolean
  hasAdvancedSettings?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  openSettings: [tab?: 'specs' | 'model' | 'advanced']
}>()
</script>

<template>
  <div class="rounded-xl border border-default/70 bg-elevated/40 p-2.5 transition-all">
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-dimmed uppercase">
        <UIcon name="i-lucide-sliders" class="size-3 text-primary" />
        <span>当前生成配置</span>
      </div>
      <UButton
        color="neutral"
        variant="subtle"
        size="xs"
        icon="i-lucide-settings-2"
        class="text-[11px] font-medium px-2 py-1 hover:border-primary/50"
        :disabled="disabled"
        @click="emit('openSettings')"
      >
        参数设置
      </UButton>
    </div>

    <!-- 可点击跳转到对应 Tab 的参数胶囊 -->
    <div class="flex flex-wrap items-center gap-1.5 text-xs">
      <!-- 模型胶囊 -->
      <button
        type="button"
        class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
        title="点击修改服务平台与模型"
        @click="emit('openSettings', 'model')"
      >
        <UIcon name="i-lucide-cpu" class="size-3.5 text-dimmed group-hover:text-primary transition-colors" />
        <span class="max-w-[120px] truncate font-medium text-[11px]">{{ selectedModelName }}</span>
      </button>

      <!-- 规格胶囊：分辨率 & 比例 -->
      <button
        type="button"
        class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
        title="点击修改清晰度与画幅比例"
        @click="emit('openSettings', 'specs')"
      >
        <UIcon name="i-lucide-monitor" class="size-3.5 text-dimmed group-hover:text-primary transition-colors" />
        <span class="font-medium text-[11px]">{{ resolution }} · {{ ratio === 'adaptive' ? '自适应' : ratio }}</span>
      </button>

      <!-- 时长胶囊 -->
      <button
        type="button"
        class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
        title="点击调节视频时长"
        @click="emit('openSettings', 'specs')"
      >
        <UIcon name="i-lucide-clock" class="size-3.5 text-dimmed group-hover:text-primary transition-colors" />
        <span class="font-medium text-[11px]">{{ smartDuration ? '智能时长' : `${duration}s` }}</span>
      </button>

      <!-- 音频伴生胶囊 -->
      <button
        v-if="supportsAudio"
        type="button"
        class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
        title="点击设置同步音频"
        @click="emit('openSettings', 'specs')"
      >
        <UIcon
          :name="audio ? 'i-lucide-volume-2' : 'i-lucide-volume-x'"
          class="size-3.5 transition-colors"
          :class="audio ? 'text-primary' : 'text-dimmed'"
        />
        <span class="font-medium text-[11px]" :class="audio ? 'text-highlighted' : 'text-dimmed'">
          {{ audio ? '伴生音频' : '静音' }}
        </span>
      </button>

      <!-- 高级参数定制指示 -->
      <button
        v-if="hasAdvancedSettings"
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-primary transition hover:bg-primary/10"
        title="已配置高级生成参数（如反向词或随机种子）"
        @click="emit('openSettings', 'advanced')"
      >
        <span class="size-1.5 rounded-full bg-primary animate-pulse" />
        <span class="text-[11px] font-medium">已定制高级参数</span>
      </button>
    </div>
  </div>
</template>

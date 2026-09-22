<script setup lang="ts">
defineProps<{
  sourceText?: string
}>()

const emit = defineEmits<{
  fillExcerptToPrompt: []
}>()

const prompt = defineModel<string>('prompt', { required: true })
const sourceVersionId = defineModel<string | undefined>('sourceVersionId')
const sourceExcerpt = defineModel<string | undefined>('sourceExcerpt')
const reusedFromId = defineModel<string | undefined>('reusedFromId')
</script>

<template>
  <div class="space-y-2.5">
    <!-- 历史任务回填提示 -->
    <div
      v-if="reusedFromId"
      class="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-all"
    >
      <span class="flex items-center gap-1.5 truncate">
        <UIcon name="i-lucide-history" class="size-3.5 shrink-0" />
        <span class="truncate">已回填任务 {{ reusedFromId.slice(0, 8) }} 的生成参数与素材</span>
      </span>
      <button
        type="button"
        class="ml-2 text-xs text-muted hover:text-highlighted shrink-0 transition"
        @click="reusedFromId = undefined"
      >
        关闭
      </button>
    </div>

    <!-- 关联剧本文档片段 -->
    <div
      v-if="sourceVersionId"
      class="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs transition-all"
    >
      <div class="flex items-center justify-between">
        <span class="flex items-center gap-1.5 font-medium text-primary">
          <UIcon name="i-lucide-book-open" class="size-3.5" />
          <span>已关联剧本文档片段</span>
        </span>
        <button
          type="button"
          class="text-xs text-muted hover:text-error transition"
          @click="sourceVersionId = undefined; sourceExcerpt = undefined"
        >
          解除关联
        </button>
      </div>
      <div class="mt-2 space-y-1.5">
        <UTextarea
          v-model="sourceExcerpt"
          :rows="2"
          autoresize
          :maxrows="4"
          maxlength="20000"
          size="xs"
          placeholder="引用的正文片段…"
          class="w-full text-xs"
        />
        <p v-if="sourceExcerpt && sourceText && !sourceText.includes(sourceExcerpt)" class="text-[11px] text-error">
          片段须来自所选版本；自由改写请编辑下方提示词。
        </p>
        <div class="flex justify-end">
          <UButton
            size="xs"
            variant="soft"
            color="primary"
            icon="i-lucide-corner-down-left"
            @click="emit('fillExcerptToPrompt')"
          >
            填入提示词
          </UButton>
        </div>
      </div>
    </div>

    <UFormField label="画面与镜头描述" :hint="`${prompt.length} / 20K`">
      <UTextarea
        v-model="prompt"
        :rows="4"
        autoresize
        :maxrows="10"
        :maxlength="20000"
        class="w-full"
        placeholder="描述主体、动作与镜头。例如：海边的白色灯塔，海鸥掠过镜头，缓慢推进，柔和的晨光…"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import type { ComfyOutputFile } from '#shared/types/comfyui'
import { buildViewUrl } from '~/utils/comfy-graph'

const props = defineProps<{
  file: ComfyOutputFile
}>()

type ImageState = 'loading' | 'loaded' | 'error'

const thumbnailState = ref<ImageState>('loading')
const previewState = ref<ImageState>('loading')
const thumbnail = ref<HTMLImageElement>()
const imageUrl = computed(() => buildViewUrl(props.file))

onMounted(() => {
  // A cached image can finish loading before hydration attaches the load handler.
  if (thumbnail.value?.complete)
    thumbnailState.value = thumbnail.value.naturalWidth > 0 ? 'loaded' : 'error'
})

function onPreviewOpen(open: boolean) {
  if (open)
    previewState.value = 'loading'
}
</script>

<template>
  <UModal
    title="图片预览"
    :description="file.filename"
    :ui="{
      content: 'w-[calc(100vw-2rem)] max-w-6xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)]',
      header: 'min-h-0 px-4 py-3 sm:px-5 sm:py-3',
      wrapper: 'min-w-0',
      description: 'truncate',
      body: 'min-h-0 p-3 sm:p-4',
    }"
    @update:open="onPreviewOpen"
  >
    <button
      type="button"
      class="comfy-outputs__item comfy-output-image"
      :class="{ 'comfy-output-image--pending': thumbnailState !== 'loaded' }"
      :aria-label="`预览图片 ${file.filename}`"
      title="点击预览大图"
    >
      <img
        v-if="thumbnailState !== 'error'"
        ref="thumbnail"
        :src="imageUrl"
        :alt="file.filename"
        loading="lazy"
        class="comfy-output-image__thumbnail"
        :class="{ invisible: thumbnailState === 'loading' }"
        @load="thumbnailState = 'loaded'"
        @error="thumbnailState = 'error'"
      >
      <span v-if="thumbnailState !== 'loaded'" class="comfy-output-image__status">
        {{ thumbnailState === 'error' ? '图片加载失败，点击重试' : '图片加载中…' }}
      </span>
    </button>

    <template #close="{ ui }">
      <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="关闭图片预览" :class="ui.close()" />
    </template>

    <template #body>
      <div class="comfy-output-preview" :aria-busy="previewState === 'loading'">
        <p v-if="previewState === 'loading'" role="status" class="comfy-output-preview__status">
          图片加载中…
        </p>
        <div v-else-if="previewState === 'error'" role="alert" class="comfy-output-preview__status">
          <p>图片加载失败，请关闭后重试。</p>
          <a :href="imageUrl" target="_blank" rel="noopener noreferrer" class="text-primary underline">
            在新窗口打开原图
          </a>
        </div>
        <img
          v-show="previewState === 'loaded'"
          :src="imageUrl"
          :alt="file.filename"
          class="comfy-output-preview__image"
          @load="previewState = 'loaded'"
          @error="previewState = 'error'"
        >
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.comfy-output-image {
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 0;
  aspect-ratio: auto;
  cursor: zoom-in;
}

.comfy-output-image:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.comfy-output-image--pending {
  min-height: 6rem;
}

.comfy-output-image__thumbnail {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
}

.comfy-output-image__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.comfy-output-preview {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
}

.comfy-output-preview__image {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100dvh - 10rem);
  object-fit: contain;
}

.comfy-output-preview__status {
  display: flex;
  min-height: 10rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}
</style>

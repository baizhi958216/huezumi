<script setup lang="ts">
import type { MediaInput } from '#shared/types/generation'
import { MEDIA_META } from '#shared/types/generation'

const props = defineProps<{
  item?: MediaInput
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const isImage = computed(() => {
  if (!props.item)
    return false
  return props.item.type.includes('frame') || props.item.type === 'reference_image'
})

const isVideo = computed(() => props.item?.type === 'reference_video')
const isAudio = computed(() => props.item?.type === 'reference_audio')

const meta = computed(() => props.item ? MEDIA_META[props.item.type] : undefined)

function close() {
  emit('update:open', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape')
    close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && item"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md dark:bg-black/85"
        @click.self="close"
      >
        <div class="relative max-h-[90vh] max-w-[90vw] flex flex-col items-center overflow-hidden rounded-2xl border border-default bg-elevated shadow-2xl dark:border-white/10 dark:bg-zinc-950">
          <!-- 头部标题栏 -->
          <div class="w-full flex items-center justify-between border-b border-default px-5 py-3 dark:border-white/10">
            <div class="flex min-w-0 items-center gap-2 text-sm text-highlighted dark:text-zinc-200">
              <span v-if="meta" :class="meta.icon" class="text-base text-primary" />
              <span class="font-medium">{{ meta?.label || '参考素材' }}</span>
              <span v-if="item.name" class="max-w-md truncate text-xs text-muted dark:text-zinc-400">
                · {{ item.name }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <a
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <UIcon name="i-lucide-external-link" class="size-3.5" />
                新窗口打开
              </a>
              <button
                type="button"
                class="rounded-lg p-1.5 text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                @click="close"
              >
                <UIcon name="i-lucide-x" class="size-5" />
              </button>
            </div>
          </div>

          <!-- 内容展区 -->
          <div class="flex flex-1 items-center justify-center p-4">
            <img
              v-if="isImage"
              :src="item.url"
              :alt="item.name || '参考图'"
              class="max-h-[75vh] max-w-[85vw] rounded-lg object-contain"
            >
            <video
              v-else-if="isVideo"
              :src="item.url"
              controls
              autoplay
              playsinline
              class="max-h-[75vh] max-w-[85vw] rounded-lg"
            />
            <div v-else-if="isAudio" class="w-80 flex flex-col items-center gap-4 py-8">
              <div class="h-16 w-16 flex items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-audio-lines" class="size-8" />
              </div>
              <p class="text-sm font-medium text-highlighted dark:text-zinc-200">
                {{ item.name || '参考音频' }}
              </p>
              <audio :src="item.url" controls class="w-full" />
            </div>
            <div v-else class="flex flex-col items-center gap-3 py-8 text-center">
              <UIcon name="i-lucide-file-text" class="size-10 text-muted dark:text-zinc-400" />
              <p class="text-sm text-toned dark:text-zinc-300">
                {{ item.name || item.url }}
              </p>
              <a
                :href="item.url"
                target="_blank"
                class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/90"
              >
                <UIcon name="i-lucide-download" class="size-3.5" />
                下载素材
              </a>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

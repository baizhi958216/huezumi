<script setup lang="ts">
import type { MediaType } from '#shared/types/generation'

const props = defineProps<{
  label: string
  hint: string
  icon: string
  type: MediaType
  value?: string
  accept?: string
  maxBytes?: number
}>()

const emit = defineEmits<{ change: [payload: { type: MediaType, url: string, name?: string } | null] }>()

const uploading = ref(false)
const errorMessage = ref('')
const input = ref<HTMLInputElement>()
const url = ref(props.value || '')
const fileName = ref('')

const defaultAccept = computed(() =>
  props.type.includes('audio') ? 'audio/*' : props.type.includes('video') ? 'video/*' : 'image/*',
)

const isImage = computed(() => props.type.includes('frame') || props.type === 'reference_image')

watch(() => props.value, (value) => {
  url.value = value || ''
  if (!value)
    fileName.value = ''
})

function commitUrl() {
  emit('change', url.value.trim() ? { type: props.type, url: url.value.trim() } : null)
}

async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  errorMessage.value = ''
  if (props.maxBytes && file.size > props.maxBytes) {
    errorMessage.value = `文件过大，上限 ${Math.round(props.maxBytes / 1024 / 1024)}MB`
    return
  }
  uploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const result = await $fetch<{ url: string, name: string }>('/api/files', { method: 'POST', body })
    url.value = result.url
    fileName.value = result.name
    emit('change', { type: props.type, url: result.url, name: result.name })
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '上传失败，请重试'
  }
  finally {
    uploading.value = false
    if (input.value)
      input.value.value = ''
  }
}

function clear() {
  url.value = ''
  fileName.value = ''
  errorMessage.value = ''
  if (input.value)
    input.value.value = ''
  emit('change', null)
}
</script>

<template>
  <UCard variant="subtle" :ui="{ body: 'p-3 sm:p-3' }">
    <div class="flex items-center gap-3">
      <div class="relative h-16 w-16 shrink-0">
        <UButton
          color="neutral"
          variant="outline"
          class="h-16 w-16 overflow-hidden p-0"
          :ui="{ base: 'justify-center' }"
          :aria-label="value ? `${label}已就绪` : `上传${label}`"
          @click="value ? undefined : input?.click()"
        >
          <img v-if="value && isImage" :src="value" :alt="label" class="h-full w-full object-cover">
          <span v-else :class="uploading ? 'i-lucide-loader-circle animate-spin' : icon" class="text-lg text-dimmed" />
        </UButton>
        <UButton
          v-if="value"
          color="neutral"
          variant="solid"
          icon="i-lucide-x"
          size="xs"
          class="absolute -right-1.5 -top-1.5 shadow-card"
          aria-label="移除素材"
          @click="clear"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="type-label">{{ label }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="uploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
            :disabled="uploading"
            @click="input?.click()"
          >
            {{ uploading ? '上传中' : '上传' }}
          </UButton>
        </div>
        <UInput
          v-model="url"
          :placeholder="fileName || hint"
          size="sm"
          class="w-full"
          icon="i-lucide-link"
          @change="commitUrl"
        />
        <p v-if="errorMessage" class="type-caption mt-1.5 text-error">
          {{ errorMessage }}
        </p>
      </div>
    </div>
    <input ref="input" type="file" class="hidden" :accept="accept || defaultAccept" @change="upload">
  </UCard>
</template>

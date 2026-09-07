<script setup lang="ts">
import type { MediaInput, MediaType } from '#shared/types/generation'

const props = defineProps<{
  label: string
  hint: string
  icon: string
  type: MediaType
  values: MediaInput[]
  accept?: string
  max?: number
  maxBytes?: number
  durationLimit?: { min: number, max: number }
  requiresDuration?: boolean
}>()

const emit = defineEmits<{ change: [payload: MediaInput[]] }>()

const uploading = ref(false)
const { requireLogin } = useAuth()
const uploadProgress = ref(0)
const uploadTotal = ref(0)
const errorMessage = ref('')
const input = ref<HTMLInputElement>()
const urlDraft = ref('')
const durationDraft = ref('')

const defaultAccept = computed(() =>
  props.type.includes('audio') ? 'audio/*' : props.type.includes('video') ? 'video/*' : 'image/*',
)

const isImage = computed(() => props.type.includes('frame') || props.type === 'reference_image')
const canAdd = computed(() => props.max === undefined || props.values.length < props.max)
const needsDuration = computed(() => props.requiresDuration && props.type === 'reference_video')

function commit(values: MediaInput[]) {
  emit('change', values)
}

function formatDuration(duration: number) {
  const value = Number.isInteger(duration) ? String(duration) : duration.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `${value} 秒`
}

function getDurationError(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0)
    return '请输入有效的参考视频时长（秒）'

  const limit = props.durationLimit
  if (limit && (duration < limit.min || duration > limit.max))
    return `参考视频时长需在 ${limit.min}–${limit.max} 秒之间`

  return ''
}

function readDurationDraft(): number | null | undefined {
  if (!needsDuration.value)
    return undefined

  const duration = Number(durationDraft.value)
  const durationError = getDurationError(duration)
  if (durationError) {
    errorMessage.value = durationError
    return null
  }
  return Math.round(duration * 1000) / 1000
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.onloadedmetadata = null
      video.onerror = null
    }

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = Math.round(video.duration * 1000) / 1000
      const durationError = getDurationError(duration)
      if (durationError) {
        cleanup()
        reject(new Error(`${file.name}：${durationError}`))
        return
      }
      cleanup()
      resolve(duration)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error(`${file.name}：无法读取视频时长，请确认文件可正常播放`))
    }
    video.src = objectUrl
    video.load()
  })
}

function getUploadErrorMessage(error: unknown) {
  if (typeof error !== 'object' || error === null)
    return '部分素材上传失败，请重试'

  const record = error as Record<string, unknown>
  const data = record.data
  if (typeof data === 'object' && data !== null) {
    const statusMessage = (data as Record<string, unknown>).statusMessage
    if (typeof statusMessage === 'string' && statusMessage)
      return statusMessage
  }
  if (typeof record.message === 'string' && record.message)
    return record.message
  return '部分素材上传失败，请重试'
}

function addUrl() {
  const url = urlDraft.value.trim()
  if (!url)
    return
  if (!canAdd.value) {
    errorMessage.value = `最多添加 ${props.max} 份${props.label}`
    return
  }
  const duration = readDurationDraft()
  if (duration === null)
    return

  const item: MediaInput = { type: props.type, url }
  if (duration !== undefined)
    item.duration = duration
  commit([...props.values, item])
  urlDraft.value = ''
  durationDraft.value = ''
  errorMessage.value = ''
}

function remove(index: number) {
  commit(props.values.filter((_, itemIndex) => itemIndex !== index))
  errorMessage.value = ''
}

async function upload(event: Event) {
  if (!requireLogin()) {
    if (input.value)
      input.value.value = ''
    return
  }
  const files = Array.from((event.target as HTMLInputElement).files || [])
  if (!files.length)
    return

  errorMessage.value = ''
  if (props.max !== undefined && props.values.length + files.length > props.max) {
    errorMessage.value = `最多上传 ${props.max} 份${props.label}`
    if (input.value)
      input.value.value = ''
    return
  }

  const oversized = files.find(file => props.maxBytes && file.size > props.maxBytes)
  if (oversized && props.maxBytes) {
    errorMessage.value = `${oversized.name} 过大，上限 ${Math.round(props.maxBytes / 1024 / 1024)}MB`
    if (input.value)
      input.value.value = ''
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  uploadTotal.value = files.length
  try {
    const uploaded: MediaInput[] = []
    for (const [index, file] of files.entries()) {
      const duration = needsDuration.value ? await readVideoDuration(file) : undefined
      const body = new FormData()
      body.append('file', file)
      const result = await $fetch<{ url: string, name: string }>('/api/files', { method: 'POST', body })
      const item: MediaInput = { type: props.type, url: result.url, name: result.name }
      if (duration !== undefined)
        item.duration = duration
      uploaded.push(item)
      uploadProgress.value = index + 1
    }
    commit([...props.values, ...uploaded])
  }
  catch (error: unknown) {
    errorMessage.value = getUploadErrorMessage(error)
  }
  finally {
    uploading.value = false
    if (input.value)
      input.value.value = ''
  }
}
</script>

<template>
  <UCard variant="subtle" :ui="{ body: 'p-2.5 sm:p-3' }">
    <div class="flex items-start gap-2.5">
      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="type-label text-xs font-semibold text-toned">{{ label }}</span>
            <UBadge color="neutral" variant="subtle" size="xs">
              {{ values.length }}<span v-if="max !== undefined"> / {{ max }}</span>
            </UBadge>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="text-xs"
            :icon="uploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
            :disabled="uploading || !canAdd"
            :loading="uploading"
            @click="input?.click()"
          >
            {{ uploading ? `上传中 ${uploadProgress}/${uploadTotal}` : '选择文件' }}
          </UButton>
        </div>

        <div v-if="values.length" class="mb-2 space-y-1">
          <div
            v-for="(item, index) in values"
            :key="`${item.url}-${index}`"
            class="flex min-w-0 items-center gap-2 rounded-md border border-default bg-default/50 px-2 py-1"
          >
            <img v-if="isImage" :src="item.url" :alt="item.name || `${label} ${index + 1}`" class="h-8 w-8 shrink-0 rounded object-cover">
            <span v-else :class="uploading ? 'i-lucide-loader-circle' : icon" class="shrink-0 text-sm text-dimmed" />
            <span class="min-w-0 flex-1 truncate text-xs" :title="item.name || item.url">
              {{ item.name || item.url }}
            </span>
            <span v-if="needsDuration && item.duration !== undefined" class="shrink-0 text-[11px] text-dimmed">
              {{ formatDuration(item.duration) }}
            </span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              :aria-label="`移除${label}${index + 1}`"
              @click="remove(index)"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5 sm:flex-row">
          <UInput
            v-model="urlDraft"
            :placeholder="values.length ? '继续粘贴公网 URL' : hint"
            size="xs"
            class="min-w-0 flex-1 text-xs"
            icon="i-lucide-link"
            :disabled="!canAdd"
            @keyup.enter="addUrl"
          />
          <UInput
            v-if="needsDuration"
            v-model="durationDraft"
            type="number"
            inputmode="decimal"
            :min="durationLimit?.min"
            :max="durationLimit?.max"
            step="0.001"
            size="xs"
            class="sm:w-28 text-xs"
            placeholder="时长（秒）"
            aria-label="参考视频时长（秒）"
            :disabled="!canAdd"
            @keyup.enter="addUrl"
          />
          <UButton
            color="neutral"
            variant="outline"
            size="xs"
            class="text-xs shrink-0"
            :disabled="!urlDraft.trim() || !canAdd"
            @click="addUrl"
          >
            添加
          </UButton>
        </div>
        <p class="type-caption mt-1 text-[11px] text-dimmed">
          {{ max !== undefined ? `最多 ${max} 份，可多选文件或逐个添加 URL` : '可多选文件或逐个添加 URL' }}
        </p>
        <p v-if="needsDuration" class="type-caption mt-1 text-[11px] text-dimmed">
          本地上传会自动读取视频时长；粘贴 URL 时请填写时长，RollDek 按该时长计费。
        </p>
        <p v-if="errorMessage" class="type-caption mt-1 text-[11px] text-error">
          {{ errorMessage }}
        </p>
      </div>
    </div>
    <input ref="input" type="file" class="hidden" :accept="accept || defaultAccept" :multiple="max === undefined || max > 1" @change="upload">
  </UCard>
</template>

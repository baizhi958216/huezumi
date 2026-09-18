<script setup lang="ts">
import type { GenerationMode, MediaInput, MediaType, ProviderCapability } from '#shared/types/generation'

defineProps<{
  mode: GenerationMode
  effectiveCapability?: ProviderCapability
  referenceSlots: MediaType[]
  mediaValues: (type: MediaType) => MediaInput[]
  mediaSlotMax: (type: MediaType) => number | undefined
}>()

const emit = defineEmits<{
  setMedia: [type: MediaType, values: MediaInput[]]
}>()
</script>

<template>
  <div v-if="mode === 'frames'" class="grid gap-2.5">
    <MediaSlot
      v-if="effectiveCapability?.media.includes('first_frame')"
      label="首帧"
      hint="上传或粘贴图片公网 URL"
      icon="i-lucide-panel-top"
      type="first_frame"
      :values="mediaValues('first_frame')"
      :max="mediaSlotMax('first_frame')"
      :accept="effectiveCapability?.mediaLimits.first_frame?.accept"
      :max-bytes="effectiveCapability?.mediaLimits.first_frame?.maxBytes"
      @change="emit('setMedia', 'first_frame', $event)"
    />
    <MediaSlot
      v-if="effectiveCapability?.media.includes('last_frame')"
      label="尾帧"
      hint="可选 · 需先提供首帧"
      icon="i-lucide-panel-bottom"
      type="last_frame"
      :values="mediaValues('last_frame')"
      :max="mediaSlotMax('last_frame')"
      :accept="effectiveCapability?.mediaLimits.last_frame?.accept"
      :max-bytes="effectiveCapability?.mediaLimits.last_frame?.maxBytes"
      @change="emit('setMedia', 'last_frame', $event)"
    />
  </div>

  <div v-else-if="mode === 'reference'" class="grid gap-2.5">
    <MediaSlot
      v-for="type in referenceSlots"
      :key="type"
      :label="type === 'reference_image' ? '参考图' : type === 'reference_video' ? '参考视频' : type === 'reference_audio' ? '参考音频' : '素材'"
      :hint="type === 'reference_image' ? '角色 / 场景 / 构图' : type === 'reference_video' ? '运动 / 风格 / 续写' : type === 'reference_audio' ? '节奏 / 语音 / 氛围' : '上传或粘贴公网 URL'"
      :icon="type === 'reference_image' ? 'i-lucide-image' : type === 'reference_video' ? 'i-lucide-video' : type === 'reference_audio' ? 'i-lucide-audio-lines' : 'i-lucide-paperclip'"
      :type="type"
      :values="mediaValues(type)"
      :max="mediaSlotMax(type)"
      :accept="effectiveCapability?.mediaLimits[type]?.accept"
      :max-bytes="effectiveCapability?.mediaLimits[type]?.maxBytes"
      :duration-limit="effectiveCapability?.mediaLimits[type]?.duration"
      :requires-duration="effectiveCapability?.mediaLimits[type]?.requiresDuration"
      @change="emit('setMedia', type, $event)"
    />
  </div>
</template>

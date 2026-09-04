<script setup lang="ts">
import type { ComfyOutputFile } from '#shared/types/comfyui'
import type { ComfyFlowEdge, ComfyFlowNode } from '~/utils/comfy-graph'
import { buildViewUrl, isVideoFile } from '~/utils/comfy-graph'

const props = defineProps<{
  running: boolean
  queueRemaining: number
  progress: { value: number, max: number } | null
  outputs: ComfyOutputFile[]
  error: string | null
  issues: string[]
  selectedNode: ComfyFlowNode | null
  selectedEdge?: ComfyFlowEdge | null
  nodeCount: number
  linkCount: number
}>()

const emit = defineEmits<{
  interrupt: []
  clearQueue: []
  freeMemory: []
  upload: [file: File]
  deleteNode: [id: string]
  deleteEdge: [id: string]
}>()

const fileInput = ref<HTMLInputElement>()

const progressPercent = computed(() => {
  if (!props.progress)
    return 0
  return Math.min(100, (props.progress.value / Math.max(1, props.progress.max)) * 100)
})

function onPickFile() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file)
    emit('upload', file)
  input.value = ''
}
</script>

<template>
  <aside class="comfy-panel comfy-panel--right">
    <div class="comfy-panel__header">
      <h2 class="comfy-panel__title">
        运行
      </h2>
      <p class="comfy-panel__meta">
        {{ nodeCount }} 节点 · {{ linkCount }} 连线 · 队列 {{ queueRemaining }}
      </p>
    </div>

    <div class="comfy-panel__body studio-scroll">
      <div v-if="running" class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          执行进度
          <span v-if="progress">{{ progress.value }} / {{ progress.max }}</span>
        </div>
        <UProgress :model-value="progressPercent" size="sm" />
      </div>

      <div class="comfy-inspector__row">
        <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-ban" :disabled="!running" @click="emit('interrupt')">
          中断
        </UButton>
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-eraser" @click="emit('clearQueue')">
          清空队列
        </UButton>
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-memory-stick" @click="emit('freeMemory')">
          释放显存
        </UButton>
      </div>

      <p v-if="error" class="comfy-inspector__error">
        {{ error }}
      </p>
      <ul v-if="issues.length" class="comfy-inspector__issues">
        <li v-for="issue in issues" :key="issue">
          {{ issue }}
        </li>
      </ul>

      <section class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          输入图片
        </div>
        <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-image-up" @click="onPickFile">
          上传到 ComfyUI
        </UButton>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange">
        <p class="comfy-inspector__hint">
          上传后刷新节点定义，LoadImage 等节点即可选择该图片
        </p>
      </section>

      <section v-if="selectedNode" class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          选中节点
        </div>
        <p class="comfy-inspector__value">
          {{ selectedNode.data?.title }}
          <span class="comfy-inspector__hint">{{ selectedNode.data?.type }}</span>
        </p>
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          @click="emit('deleteNode', selectedNode.id)"
        >
          删除节点
        </UButton>
      </section>

      <section v-else-if="selectedEdge" class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          选中连线
        </div>
        <p class="comfy-inspector__value">
          <span class="comfy-inspector__hint">
            {{ (selectedEdge.data as { type?: string })?.type ? `类型：${(selectedEdge.data as { type?: string }).type}` : '数据连线' }}
          </span>
        </p>
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          @click="emit('deleteEdge', selectedEdge.id)"
        >
          删除连线
        </UButton>
      </section>

      <section class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          输出
        </div>
        <p v-if="!outputs.length" class="comfy-inspector__hint">
          运行后这里会显示生成结果
        </p>
        <div v-else class="comfy-outputs">
          <a
            v-for="file in outputs"
            :key="`${file.type}-${file.subfolder}-${file.filename}`"
            :href="buildViewUrl(file)"
            target="_blank"
            rel="noopener"
            class="comfy-outputs__item"
          >
            <video
              v-if="isVideoFile(file)"
              :src="buildViewUrl(file)"
              muted
              loop
              playsinline
              class="comfy-outputs__media"
            />
            <img v-else :src="buildViewUrl(file)" :alt="file.filename" loading="lazy" class="comfy-outputs__media">
          </a>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ComfyOutputFile, ComfyUploadType, ComfyWidgetSpec } from '#shared/types/comfyui'
import type { ComfyFlowEdge, ComfyFlowNode, ComfyNodeData } from '~/utils/comfy-graph'
import { CONTROL_AFTER_GENERATE_OPTIONS } from '#shared/types/comfyui'
import { getUploadTargets } from '~/utils/comfy-controls'
import { buildInputViewUrl, buildViewUrl, isVideoFile } from '~/utils/comfy-graph'

const props = defineProps<{
  running: boolean
  queueRemaining: number
  progress: { value: number, max: number } | null
  executingNode?: ComfyFlowNode | null
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
  upload: [payload: { file: File, kind: ComfyUploadType, nodeId: string, widgetName: string }]
  updateNodeWidget: [payload: { nodeId: string, widgetName: string, value: unknown }]
  deleteNode: [id: string]
  deleteEdge: [id: string]
}>()

const fileInput = ref<HTMLInputElement>()
const controlAfterGenerateItems: string[] = [...CONTROL_AFTER_GENERATE_OPTIONS]

const selectedData = computed<ComfyNodeData | null>(() => props.selectedNode?.data ?? null)

const selectedWidgets = computed(() => selectedData.value?.widgetSpecs ?? [])
const selectedInputSlots = computed(() => {
  const data = selectedData.value
  if (!data)
    return []
  const isImageCollection = data.widgetSpecs.some(widget => widget.options.image_collection === true)
  return isImageCollection
    ? data.inputSlots.filter(slot => slot.name !== 'previous' && !/^image_\d+_input$/.test(slot.name))
    : data.inputSlots
})
const selectedUploadWidgets = computed(() => selectedWidgets.value.filter(widget => widget.uploadType))
const uploadTarget = ref('')
const uploadError = ref('')
watch(() => props.selectedNode?.id, () => {
  uploadTarget.value = ''
  uploadError.value = ''
})
const selectedUploadWidget = computed(() => selectedUploadWidgets.value.find(widget => widget.name === uploadTarget.value) ?? selectedUploadWidgets.value[0])
const uploadTargets = computed(() => selectedUploadWidgets.value.map(widget => ({ label: widget.name, value: widget.name })))
const canUploadMultiple = computed(() => selectedUploadWidgets.value.filter(widget => widget.uploadType === 'image').length > 1)
const uploadedImages = computed(() => selectedUploadWidgets.value.filter(widget => widget.uploadType === 'image'))

const panelTitle = computed(() => {
  if (props.selectedNode)
    return '节点参数'
  if (props.selectedEdge)
    return '连线'
  return '运行'
})

const panelMeta = computed(() => {
  if (props.selectedNode)
    return `${selectedData.value?.title ?? '节点'} · ${selectedData.value?.type ?? ''}`
  if (props.selectedEdge)
    return '点击画布中的节点可编辑参数'
  return `${props.nodeCount} 节点 · ${props.linkCount} 连线 · 队列 ${props.queueRemaining}`
})

const COMBO_EMPTY_VALUE = '__COMBO_EMPTY__'

interface ComboOption {
  label: string
  value: string
}

function normalizeComboItems(choices: string[] = []): ComboOption[] {
  const seen = new Set<string>()
  const items: ComboOption[] = []
  for (const choice of choices) {
    const str = String(choice ?? '')
    const isNone = str === '' || str === '[none]'
    const value = isNone ? COMBO_EMPTY_VALUE : str
    const label = isNone ? '（未选择 / 空）' : str
    if (!seen.has(value)) {
      seen.add(value)
      items.push({ label, value })
    }
  }
  return items
}

const comboItems = computed<Record<string, ComboOption[]>>(() => {
  const result: Record<string, ComboOption[]> = {}
  for (const widget of selectedWidgets.value) {
    if (widget.kind === 'COMBO')
      result[widget.name] = normalizeComboItems(widget.choices ?? [])
  }
  return result
})

function getComboModelValue(name: string, val: unknown): string {
  const str = String(val ?? '')
  if (str === '' || str === '[none]') {
    const items = comboItems.value[name] ?? []
    const hasEmptyItem = items.some(item => item.value === COMBO_EMPTY_VALUE)
    return hasEmptyItem ? COMBO_EMPTY_VALUE : ''
  }
  return str
}

function onComboChange(name: string, selectedValue: string) {
  const finalVal = selectedValue === COMBO_EMPTY_VALUE ? '' : selectedValue
  updateWidget(name, finalVal)
}

const uploadAccept = computed(() => {
  switch (selectedUploadWidget.value?.uploadType) {
    case 'image':
      return 'image/*'
    case 'audio':
      return 'audio/*,video/mp4,video/webm,video/quicktime'
    case 'video':
      return 'video/*'
    default:
      return ''
  }
})

const uploadLabel = computed(() => {
  switch (selectedUploadWidget.value?.uploadType) {
    case 'image':
      return '上传图片'
    case 'audio':
      return '上传音频'
    case 'video':
      return '上传视频'
    default:
      return '上传文件'
  }
})

const uploadHint = computed(() => {
  const widget = selectedUploadWidget.value
  if (!widget) {
    return props.selectedNode
      ? '当前节点没有文件上传参数；素材类输入请添加 Load Image、Load Audio 或 Load Video 节点后再连线。'
      : '请选择带上传控件的参考素材或 Load 节点后上传文件。'
  }
  return `文件会上传到 ComfyUI，并自动填入「${widget.name}」参数。`
})

const progressPercent = computed(() => {
  if (!props.progress)
    return 0
  return Math.min(100, (props.progress.value / Math.max(1, props.progress.max)) * 100)
})

function onPickFile() {
  fileInput.value?.click()
}

function hasMinMax(widget: ComfyWidgetSpec) {
  return widget.options.min !== undefined && widget.options.max !== undefined
}

function updateWidget(widgetName: string, value: unknown) {
  if (!props.selectedNode)
    return
  emit('updateNodeWidget', { nodeId: props.selectedNode.id, widgetName, value })
}

function onWidgetNumberChange(widgetName: string, value: unknown) {
  updateWidget(widgetName, Number(value))
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const widget = selectedUploadWidget.value
  uploadError.value = ''
  if (widget && props.selectedNode) {
    try {
      const nodeId = props.selectedNode.id
      const targets = getUploadTargets(selectedUploadWidgets.value, selectedData.value?.widgets ?? {}, widget.name, files.length)
      files.forEach((file, index) => {
        const target = targets[index]
        if (target?.uploadType)
          emit('upload', { file, kind: target.uploadType, nodeId, widgetName: target.name })
      })
    }
    catch (error) {
      uploadError.value = error instanceof Error ? error.message : '无法分配上传槽位'
    }
  }
  input.value = ''
}
</script>

<template>
  <aside class="comfy-panel comfy-panel--right">
    <div class="comfy-panel__header">
      <h2 class="comfy-panel__title">
        {{ panelTitle }}
      </h2>
      <p class="comfy-panel__meta">
        {{ panelMeta }}
      </p>
    </div>

    <div class="comfy-panel__body studio-scroll">
      <section v-if="selectedNode" class="comfy-inspector__block comfy-inspector__node-editor">
        <div class="comfy-inspector__label">
          <span>节点参数</span>
          <span class="comfy-inspector__hint">即时同步</span>
        </div>
        <p class="comfy-inspector__value">
          {{ selectedData?.title }}
          <span class="comfy-inspector__hint">{{ selectedData?.type }}</span>
        </p>

        <WorkflowTextOutput :node-id="selectedNode.id" />
        <div v-if="uploadedImages.length" class="comfy-inspector__slots-grid">
          <div v-for="widget in uploadedImages" :key="widget.name" class="comfy-inspector__slot-row">
            <span class="comfy-inspector__slot-num">{{ widget.name }}</span>
            <img v-if="selectedData?.widgets[widget.name]" :src="buildInputViewUrl(String(selectedData.widgets[widget.name]))" :alt="widget.name" class="comfy-inspector__slot-thumb">
            <span v-else class="text-xs text-muted">空</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-upload" :aria-label="`上传 ${widget.name}`" @click="uploadTarget = widget.name; onPickFile()" />
            <UButton v-if="selectedData?.widgets[widget.name]" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="`清空 ${widget.name}`" @click="updateWidget(widget.name, '')" />
          </div>
        </div>

        <p v-if="selectedData?.missing" class="comfy-inspector__hint">
          当前 ComfyUI 环境缺少这个节点类型，无法编辑参数。
        </p>
        <p v-else-if="selectedData?.widgetSpecs.length === 0" class="comfy-inspector__hint">
          这个节点没有可编辑的控件，请通过画布连线提供输入。
        </p>
        <div v-else class="comfy-inspector__widgets">
          <div v-for="widget in selectedWidgets" :key="widget.name" class="comfy-inspector__widget">
            <label class="comfy-inspector__widget-label" :for="`inspector-${selectedNode.id}-${widget.name}`">
              {{ widget.name }}
            </label>

            <USelect
              v-if="widget.kind === 'COMBO'"
              :id="`inspector-${selectedNode.id}-${widget.name}`"
              :model-value="getComboModelValue(widget.name, selectedData?.widgets[widget.name])"
              :items="comboItems[widget.name] ?? []"
              :disabled="!(comboItems[widget.name]?.length)"
              placeholder="请选择"
              size="sm"
              @update:model-value="onComboChange(widget.name, $event)"
            />

            <USwitch
              v-else-if="widget.kind === 'BOOLEAN'"
              :id="`inspector-${selectedNode.id}-${widget.name}`"
              :model-value="Boolean(selectedData?.widgets[widget.name])"
              size="sm"
              @update:model-value="updateWidget(widget.name, $event)"
            />

            <USelect
              v-else-if="widget.kind === 'CONTROL_AFTER_GENERATE'"
              :id="`inspector-${selectedNode.id}-${widget.name}`"
              :model-value="String(selectedData?.widgets[widget.name] ?? 'randomize')"
              :items="controlAfterGenerateItems"
              size="sm"
              @update:model-value="updateWidget(widget.name, $event)"
            />

            <UTextarea
              v-else-if="widget.kind === 'STRING' && (widget.options.multiline || widget.options.dynamic_prompts || widget.options.dynamicPrompts)"
              :id="`inspector-${selectedNode.id}-${widget.name}`"
              :model-value="String(selectedData?.widgets[widget.name] ?? '')"
              :rows="3"
              autoresize
              size="sm"
              @update:model-value="updateWidget(widget.name, $event)"
            />

            <UInput
              v-else-if="widget.kind === 'INT' || widget.kind === 'FLOAT'"
              :id="`inspector-${selectedNode.id}-${widget.name}`"
              :model-value="Number(selectedData?.widgets[widget.name] ?? 0)"
              type="number"
              :min="widget.options.min"
              :max="widget.options.max"
              :step="widget.options.step ?? (widget.kind === 'INT' ? 1 : 0.01)"
              size="sm"
              @update:model-value="onWidgetNumberChange(widget.name, $event)"
            />

            <UInput
              v-else
              :id="`inspector-${selectedNode.id}-${widget.name}`"
              :model-value="String(selectedData?.widgets[widget.name] ?? '')"
              size="sm"
              @update:model-value="updateWidget(widget.name, $event)"
            />

            <p v-if="widget.options.tooltip" class="comfy-inspector__hint">
              {{ widget.options.tooltip }}
            </p>
            <p v-if="hasMinMax(widget)" class="comfy-inspector__hint">
              {{ widget.options.min }} – {{ widget.options.max }}
            </p>
          </div>
        </div>

        <div v-if="selectedInputSlots.length" class="comfy-inspector__connections">
          <span class="comfy-inspector__widget-label">可连接输入</span>
          <div class="comfy-inspector__connection-list">
            <span v-for="slot in selectedInputSlots" :key="slot.name" class="comfy-inspector__connection">
              {{ slot.name }} · {{ slot.type }}
            </span>
          </div>
        </div>

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
          文件上传
          <span v-if="selectedUploadWidget" class="comfy-inspector__hint">{{ selectedUploadWidget.name }}</span>
        </div>
        <template v-if="selectedUploadWidget">
          <USelect v-if="selectedUploadWidgets.length > 1" :model-value="selectedUploadWidget.name" :items="uploadTargets" aria-label="上传目标槽位" size="sm" @update:model-value="uploadTarget = $event" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-upload" @click="onPickFile">
            {{ uploadLabel }}
          </UButton>
          <input ref="fileInput" type="file" :accept="uploadAccept" :multiple="canUploadMultiple" class="hidden" @change="onFileChange">
        </template>
        <p class="comfy-inspector__hint">
          {{ uploadHint }}
          <span v-if="canUploadMultiple">多选图片会从目标槽开始依次填入空槽，不覆盖已有图片；单选会替换目标槽。</span>
        </p>
      </section>

      <p v-if="uploadError" role="alert" class="text-sm text-error">
        {{ uploadError }}
      </p>

      <div v-if="error" class="comfy-inspector__error-box">
        <div class="comfy-inspector__error-title">
          <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0 text-error-500" />
          <span>执行失败</span>
        </div>
        <p class="comfy-inspector__error-text">
          {{ error }}
        </p>
      </div>
      <ul v-if="issues.length" class="comfy-inspector__issues">
        <li v-for="issue in issues" :key="issue">
          {{ issue }}
        </li>
      </ul>

      <section class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          <span>运行控制</span>
          <span>{{ nodeCount }} 节点 · {{ linkCount }} 连线 · 队列 {{ queueRemaining }}</span>
        </div>
        <div v-if="running" class="comfy-inspector__running-card">
          <div class="comfy-inspector__running-header">
            <span class="flex items-center gap-1.5 font-medium text-xs text-signal-600 dark:text-signal-400">
              <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
              正在执行
            </span>
            <span v-if="executingNode" class="text-[11px] text-neutral-400">#{{ executingNode.id }}</span>
          </div>

          <div v-if="executingNode" class="text-xs font-semibold text-neutral-800 dark:text-neutral-100 mt-1">
            {{ executingNode.data?.title || executingNode.data?.type }}
          </div>
          <div v-else class="text-xs text-neutral-400 mt-1">
            准备中 / 正在建立连接...
          </div>

          <div v-if="progress && progress.max > 0" class="mt-2 space-y-1">
            <div class="flex items-center justify-between text-[11px] text-neutral-400">
              <span>采样步骤</span>
              <span>{{ progress.value }} / {{ progress.max }} 步 ({{ Math.round(progressPercent) }}%)</span>
            </div>
            <UProgress :model-value="progressPercent" size="xs" />
          </div>
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
      </section>

      <section class="comfy-inspector__block">
        <div class="comfy-inspector__label">
          输出
        </div>
        <p v-if="!outputs.length" class="comfy-inspector__hint">
          运行后这里会显示生成结果
        </p>
        <div v-else class="comfy-outputs">
          <template
            v-for="file in outputs"
            :key="`${file.type}-${file.subfolder}-${file.filename}`"
          >
            <div
              v-if="isVideoFile(file)"
              class="comfy-outputs__item comfy-outputs__item--video"
            >
              <video
                :src="buildViewUrl(file)"
                controls
                playsinline
                preload="metadata"
                class="comfy-outputs__media"
              >浏览器无法播放该视频。</video>
              <a :href="buildViewUrl(file)" target="_blank" rel="noopener" class="comfy-outputs__open">
                打开原视频
              </a>
            </div>
            <WorkflowOutputImage v-else :file="file" />
          </template>
        </div>
      </section>
    </div>
  </aside>
</template>

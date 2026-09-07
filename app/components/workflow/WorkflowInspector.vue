<script setup lang="ts">
import type { ComfyOutputFile, ComfyUploadType, ComfyWidgetSpec } from '#shared/types/comfyui'
import type { ComfyFlowEdge, ComfyFlowNode, ComfyNodeData } from '~/utils/comfy-graph'
import { CONTROL_AFTER_GENERATE_OPTIONS } from '#shared/types/comfyui'
import { useComfyEvents } from '~/composables/useComfyServer'
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

const { llmPromptOutputs } = useComfyEvents()

const selectedData = computed<ComfyNodeData | null>(() => props.selectedNode?.data ?? null)
const isPromptNode = computed(() => selectedData.value?.type === 'ForkVdoPrompt')
const isImageCollection = computed(() => selectedData.value?.type === 'ForkVdoImageCollection')

const promptOutput = computed(() => props.selectedNode ? (llmPromptOutputs.value[props.selectedNode.id] ?? null) : null)

function regeneratePrompt() {
  if (!props.selectedNode)
    return
  const current = Number(selectedData.value?.widgets.refresh_token) || 0
  updateWidget('refresh_token', current + 1)
}

const copiedField = ref<'pos' | 'neg' | null>(null)
async function copyPrompt(text: string, field: 'pos' | 'neg') {
  if (!text)
    return
  await navigator.clipboard.writeText(text)
  copiedField.value = field
  setTimeout(() => {
    copiedField.value = null
  }, 2000)
}

const selectedWidgets = computed(() => selectedData.value?.widgetSpecs ?? [])
const selectedInputSlots = computed(() => selectedData.value?.inputSlots ?? [])
const selectedUploadWidgets = computed(() => selectedWidgets.value.filter(widget => widget.uploadType))
const selectedUploadWidget = computed(() => selectedUploadWidgets.value[0])

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
      : '请选择 Load Image、Load Audio 或 Load Video 节点后上传文件。'
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
  const file = input.files?.[0]
  const widget = selectedUploadWidget.value
  if (file && widget && props.selectedNode) {
    emit('upload', {
      file,
      kind: widget.uploadType as ComfyUploadType,
      nodeId: props.selectedNode.id,
      widgetName: widget.name,
    })
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

        <!-- 大模型提示词专属状态与生成面板 -->
        <div v-if="isPromptNode" class="comfy-inspector__prompt-box">
          <div class="comfy-inspector__prompt-header">
            <span class="comfy-inspector__prompt-title">大模型提示词状态</span>
            <span
              v-if="promptOutput"
              class="comfy-node__status-badge"
              :class="{
                'comfy-node__status-badge--fresh': promptOutput.status === 'fresh',
                'comfy-node__status-badge--cached': promptOutput.status === 'cached',
                'comfy-node__status-badge--error': promptOutput.status === 'error',
              }"
            >
              {{ promptOutput.status === 'fresh' ? '本次新生成' : promptOutput.status === 'cached' ? '复用成功提示词' : '生成失败' }}
            </span>
            <span v-else class="text-xs text-neutral-400">待执行</span>
          </div>

          <div class="flex items-center justify-between gap-2 pt-1 border-t border-neutral-700/50">
            <span class="text-xs text-neutral-400">刷新序号：{{ selectedData?.widgets.refresh_token ?? 0 }}</span>
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              icon="i-lucide-refresh-cw"
              @click="regeneratePrompt"
            >
              重新生成提示词
            </UButton>
          </div>
          <p class="text-[11px] text-neutral-400 mt-0.5 leading-tight">
            下游生图失败重试时，ComfyUI 会自动复用已生成的提示词；若需让大模型重新理解需求，请点击上方按钮。
          </p>

          <div v-if="promptOutput && (promptOutput.positivePrompt || promptOutput.negativePrompt)" class="space-y-2 mt-2">
            <div v-if="promptOutput.positivePrompt">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-semibold text-emerald-400">正向提示词</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="copiedField === 'pos' ? 'i-lucide-check' : 'i-lucide-copy'"
                  @click="copyPrompt(promptOutput.positivePrompt, 'pos')"
                >
                  {{ copiedField === 'pos' ? '已复制' : '复制' }}
                </UButton>
              </div>
              <div class="comfy-inspector__prompt-content">
                {{ promptOutput.positivePrompt }}
              </div>
            </div>

            <div v-if="promptOutput.negativePrompt">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-semibold text-neutral-400">反向提示词</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="copiedField === 'neg' ? 'i-lucide-check' : 'i-lucide-copy'"
                  @click="copyPrompt(promptOutput.negativePrompt, 'neg')"
                >
                  {{ copiedField === 'neg' ? '已复制' : '复制' }}
                </UButton>
              </div>
              <div class="comfy-inspector__prompt-content text-neutral-400">
                {{ promptOutput.negativePrompt }}
              </div>
            </div>
          </div>
        </div>

        <!-- 图片集合：有序参考素材插槽一览 -->
        <div v-if="isImageCollection" class="comfy-inspector__prompt-box">
          <div class="comfy-inspector__prompt-header">
            <span class="comfy-inspector__prompt-title">有序参考图片（图1 ~ 图8）</span>
            <span class="text-xs text-neutral-400">大模型严格按此顺序理解</span>
          </div>

          <div class="comfy-inspector__slots-grid mt-1">
            <div
              v-for="i in 8"
              :key="i"
              class="comfy-inspector__slot-row"
            >
              <span class="comfy-inspector__slot-num">图{{ i }}</span>
              <img
                v-if="selectedData?.widgets[`image_${i}`]"
                :src="buildInputViewUrl(String(selectedData?.widgets[`image_${i}`]))"
                :alt="`图${i}`"
                class="comfy-inspector__slot-thumb"
              >
              <div v-else class="w-7 h-7 rounded bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs flex-shrink-0">
                空
              </div>
              <span class="text-xs text-neutral-300 truncate flex-1">
                {{ selectedData?.widgets[`image_${i}`] || '未选择图片' }}
              </span>
              <UButton
                v-if="selectedData?.widgets[`image_${i}`]"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                title="清空此插槽"
                @click="updateWidget(`image_${i}`, '')"
              />
            </div>
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
              v-else-if="widget.kind === 'STRING' && (widget.options.multiline || widget.options.dynamic_prompts)"
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
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-upload" @click="onPickFile">
            {{ uploadLabel }}
          </UButton>
          <input ref="fileInput" type="file" :accept="uploadAccept" class="hidden" @change="onFileChange">
        </template>
        <p class="comfy-inspector__hint">
          {{ uploadHint }}
        </p>
      </section>

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

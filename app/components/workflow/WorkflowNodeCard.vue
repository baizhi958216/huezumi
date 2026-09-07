<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { ComfyNodeData } from '~/utils/comfy-graph'
import { CONTROL_AFTER_GENERATE_OPTIONS } from '#shared/types/comfyui'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useComfyEvents } from '~/composables/useComfyServer'
import { buildInputViewUrl } from '~/utils/comfy-graph'

const props = defineProps<NodeProps<ComfyNodeData>>()

const { edges, updateNodeInternals } = useVueFlow()
const { executingNodeId, progress, cachedNodeIds, lastErrorNodeId, llmPromptOutputs } = useComfyEvents()

const isExecuting = computed(() => executingNodeId.value === props.id || Boolean(props.data.executing))
const isCached = computed(() => cachedNodeIds.value.includes(props.id))
const isFailed = computed(() => lastErrorNodeId.value === props.id)
const currentProgress = computed(() => isExecuting.value ? (progress.value ?? props.data.progress ?? null) : null)

const data = computed(() => props.data)

const isImageCollection = computed(() => data.value.type === 'ForkVdoImageCollection')
const isPromptNode = computed(() => data.value.type === 'ForkVdoPrompt')

const promptOutput = computed(() => llmPromptOutputs.value[props.id] ?? null)

function isSlotConnected(slotName: string): boolean {
  return edges.value.some(e => e.target === props.id && e.targetHandle === slotName)
}

function regeneratePrompt() {
  const currentToken = Number(data.value.widgets.refresh_token) || 0
  data.value.widgets.refresh_token = currentToken + 1
  nextTick(() => updateNodeInternals([props.id]))
}

const activeCollectionImages = computed(() => {
  if (!isImageCollection.value)
    return []
  const result: Array<{ slot: number, label: string, filename: string, isTensor: boolean }> = []
  for (let i = 1; i <= 8; i++) {
    const isLinked = isSlotConnected(`image_${i}_input`)
    const file = String(data.value.widgets[`image_${i}`] ?? '').trim()
    if (isLinked) {
      result.push({ slot: i, label: `图${i}`, filename: '', isTensor: true })
    }
    else if (file) {
      result.push({ slot: i, label: `图${i}`, filename: file, isTensor: false })
    }
  }
  return result
})

const hasPreviousCollection = computed(() => isImageCollection.value && isSlotConnected('previous'))

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
  for (const widget of data.value.widgetSpecs) {
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
  onValueChange(name, finalVal)
}

/** 用显式 string[] 规避 Nuxt UI 从 readonly 元组推断出窄化的 model-value 类型。 */
const controlAfterGenerateItems: string[] = [...CONTROL_AFTER_GENERATE_OPTIONS]

function hasMinMax(widget: { options: { min?: number, max?: number } }) {
  return widget.options.min !== undefined && widget.options.max !== undefined
}

/** 用类型名生成稳定的插槽颜色，避免为上百种类型维护一张映射表。 */
function slotColor(type: string) {
  let hash = 0
  for (let i = 0; i < type.length; i += 1)
    hash = (hash * 31 + type.charCodeAt(i)) % 360
  return `hsl(${hash} 62% 52%)`
}

function setMode(mode: 0 | 2 | 4) {
  data.value.mode = data.value.mode === mode ? 0 : mode
}

const isCollapsed = computed({
  get: () => Boolean(data.value.collapsed),
  set: (val: boolean) => {
    data.value.collapsed = val
    nextTick(() => updateNodeInternals([props.id]))
  },
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

const filterKeyword = ref('')
const showAllWidgets = ref(false)

const hasManyWidgets = computed(() => data.value.widgetSpecs.length > 8)

const filteredWidgets = computed(() => {
  const all = data.value.widgetSpecs
  const kw = filterKeyword.value.trim().toLowerCase()
  if (!kw) {
    if (hasManyWidgets.value && !showAllWidgets.value)
      return all.slice(0, 6)
    return all
  }
  return all.filter(w => w.name.toLowerCase().includes(kw))
})

const hiddenWidgetsCount = computed(() => {
  if (filterKeyword.value.trim() || !hasManyWidgets.value || showAllWidgets.value)
    return 0
  return data.value.widgetSpecs.length - 6
})

function toggleShowAll() {
  showAllWidgets.value = !showAllWidgets.value
  nextTick(() => updateNodeInternals([props.id]))
}

function onValueChange(name: string, value: unknown) {
  data.value.widgets[name] = value
  // 多行文本与下拉展开会改变节点高度，必须让 vue-flow 重新测量锚点位置
  nextTick(() => updateNodeInternals([props.id]))
}

watch(() => [data.value.inputSlots.length, data.value.outputSlots.length, data.value.mode, isCollapsed.value], () => {
  nextTick(() => updateNodeInternals([props.id]))
})

onMounted(() => {
  nextTick(() => updateNodeInternals([props.id]))
})
</script>

<template>
  <div
    class="comfy-node"
    :class="{
      'comfy-node--muted': data.mode === 2,
      'comfy-node--bypass': data.mode === 4,
      'comfy-node--missing': data.missing,
      'comfy-node--selected': props.selected,
      'comfy-node--executing': isExecuting,
      'comfy-node--cached': isCached,
      'comfy-node--error': isFailed,
      'comfy-node--collapsed': isCollapsed,
    }"
  >
    <header class="comfy-node__header" @dblclick.stop="toggleCollapse">
      <span class="comfy-node__title" :title="`${data.title} (${data.type})`">{{ data.title }}</span>

      <!-- 实时执行/失败状态徽章 -->
      <span v-if="isExecuting" class="comfy-node__status-badge comfy-node__status-badge--executing">
        <UIcon name="i-lucide-loader-circle" class="size-3 animate-spin mr-1 text-signal-500" />
        执行中
      </span>
      <span v-else-if="isFailed" class="comfy-node__status-badge comfy-node__status-badge--error">
        <UIcon name="i-lucide-triangle-alert" class="size-3 mr-1 text-error-400" />
        失败
      </span>
      <span v-else-if="isCached" class="comfy-node__status-badge comfy-node__status-badge--cached">
        已复用
      </span>

      <!-- 提示词节点状态徽章 -->
      <template v-if="isPromptNode && promptOutput && !isExecuting && !isFailed">
        <span
          class="comfy-node__status-badge"
          :class="{
            'comfy-node__status-badge--fresh': promptOutput.status === 'fresh',
            'comfy-node__status-badge--cached': promptOutput.status === 'cached',
            'comfy-node__status-badge--error': promptOutput.status === 'error',
          }"
        >
          {{ promptOutput.status === 'fresh' ? '本次生成' : promptOutput.status === 'cached' ? '复用缓存' : '生成失败' }}
        </span>
      </template>

      <div class="comfy-node__actions nodrag">
        <!-- 提示词节点：一键重新生成提示词 -->
        <UTooltip v-if="isPromptNode" text="重新生成提示词（使本次 ComfyUI 缓存失效）">
          <button
            type="button"
            class="comfy-node__action nodrag"
            aria-label="重新生成提示词"
            @click.stop="regeneratePrompt"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-3.5 text-signal-500" aria-hidden="true" />
          </button>
        </UTooltip>

        <UTooltip :text="isCollapsed ? '展开节点参数（也可双击标题）' : '折叠节点参数（也可双击标题）'">
          <button
            type="button"
            class="comfy-node__action nodrag"
            :class="{ 'is-active': isCollapsed }"
            :aria-label="isCollapsed ? '展开节点参数' : '折叠节点参数'"
            :aria-pressed="isCollapsed"
            @click.stop="toggleCollapse"
          >
            <UIcon :name="isCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-3.5" aria-hidden="true" />
          </button>
        </UTooltip>
        <UTooltip :text="data.mode === 2 ? '取消静音节点' : '静音节点（不参与执行）'">
          <button
            type="button"
            class="comfy-node__action nodrag"
            :class="{ 'is-active': data.mode === 2 }"
            :aria-label="data.mode === 2 ? '取消静音节点' : '静音节点'"
            :aria-pressed="data.mode === 2"
            @click.stop="setMode(2)"
          >
            <UIcon :name="data.mode === 2 ? 'i-lucide-volume-2' : 'i-lucide-volume-off'" class="size-3.5" aria-hidden="true" />
          </button>
        </UTooltip>
        <UTooltip :text="data.mode === 4 ? '取消绕过节点' : '绕过节点（保留在工作流中但跳过执行）'">
          <button
            type="button"
            class="comfy-node__action nodrag"
            :class="{ 'is-active': data.mode === 4 }"
            :aria-label="data.mode === 4 ? '取消绕过节点' : '绕过节点'"
            :aria-pressed="data.mode === 4"
            @click.stop="setMode(4)"
          >
            <UIcon name="i-lucide-circle-slash" class="size-3.5" aria-hidden="true" />
          </button>
        </UTooltip>
      </div>
    </header>

    <p v-if="data.missing" class="comfy-node__missing">
      当前 ComfyUI 环境缺少节点类型「{{ data.type }}」
    </p>
    <p v-else-if="data.executing" class="comfy-node__running">
      执行中<template v-if="data.progress">
        · {{ data.progress.value }}/{{ data.progress.max }}
      </template>
    </p>

    <div class="comfy-node__slots">
      <div class="comfy-node__col">
        <div v-for="slot in data.inputSlots" :key="slot.name" class="comfy-slot" :class="{ 'comfy-slot--connected': isSlotConnected(slot.name) }" :title="`输入: ${slot.type}`">
          <Handle
            :id="slot.name"
            type="target"
            :position="Position.Left"
            class="comfy-handle"
            :style="{ background: slotColor(slot.type) }"
            :title="slot.type"
          />
          <span class="comfy-slot__name">{{ slot.name }}</span>
          <UIcon v-if="isSlotConnected(slot.name)" name="i-lucide-check" class="size-2.5 text-signal-500 ml-auto" />
        </div>
      </div>
      <div class="comfy-node__col comfy-node__col--right">
        <div v-for="(slot, index) in data.outputSlots" :key="`${slot.name}-${index}`" class="comfy-slot comfy-slot--out" :title="`输出: ${slot.type}`">
          <span class="comfy-slot__name">{{ slot.name }}</span>
          <Handle
            :id="String(index)"
            type="source"
            :position="Position.Right"
            class="comfy-handle"
            :style="{ background: slotColor(slot.type) }"
            :title="slot.type"
          />
        </div>
      </div>
    </div>

    <!-- 图片集合节点：有序缩略图画廊 -->
    <div v-if="!isCollapsed && isImageCollection && (activeCollectionImages.length || hasPreviousCollection)" class="comfy-node__gallery nodrag">
      <div v-if="hasPreviousCollection" class="comfy-node__gallery-badge">
        <UIcon name="i-lucide-arrow-left-right" class="size-3 mr-1" /> 已串联前序图片集合
      </div>
      <div v-for="img in activeCollectionImages" :key="img.slot" class="comfy-node__gallery-item">
        <span class="comfy-node__gallery-label">{{ img.label }}</span>
        <div v-if="img.isTensor" class="comfy-node__gallery-tensor" title="连线图片张量">
          <UIcon name="i-lucide-image" class="size-4" />
        </div>
        <img v-else :src="buildInputViewUrl(img.filename)" :alt="img.filename" class="comfy-node__gallery-thumb" loading="lazy">
      </div>
    </div>

    <div v-if="!isCollapsed && data.widgetSpecs.length" class="comfy-node__widgets nodrag nowheel">
      <!-- 超多参数快速搜索过滤 -->
      <div v-if="hasManyWidgets" class="comfy-widget-search nodrag">
        <UIcon name="i-lucide-search" class="comfy-widget-search__icon size-3 text-muted" />
        <input
          v-model="filterKeyword"
          type="text"
          placeholder="查找参数..."
          class="comfy-widget-search__input nodrag"
          @click.stop
        >
        <button
          v-if="filterKeyword"
          type="button"
          class="comfy-widget-search__clear"
          title="清空"
          @click.stop="filterKeyword = ''"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </div>

      <div
        v-for="widget in filteredWidgets"
        :key="widget.name"
        class="comfy-widget nodrag"
        :class="{ 'comfy-widget--inline': (widget.kind === 'INT' || widget.kind === 'FLOAT') && !hasMinMax(widget) }"
      >
        <label class="comfy-widget__label" :for="`${props.id}-${widget.name}`" :title="widget.name">
          {{ widget.name }}
        </label>

        <USelect
          v-if="widget.kind === 'COMBO'"
          :id="`${props.id}-${widget.name}`"
          :model-value="getComboModelValue(widget.name, data.widgets[widget.name])"
          :items="comboItems[widget.name] ?? []"
          placeholder="请选择"
          size="xs"
          class="comfy-widget__control nodrag"
          @update:model-value="onComboChange(widget.name, $event)"
          @click.stop
        />

        <USwitch
          v-else-if="widget.kind === 'BOOLEAN'"
          :id="`${props.id}-${widget.name}`"
          :model-value="Boolean(data.widgets[widget.name])"
          size="xs"
          class="nodrag"
          @update:model-value="onValueChange(widget.name, $event)"
          @click.stop
        />

        <USelect
          v-else-if="widget.kind === 'CONTROL_AFTER_GENERATE'"
          :id="`${props.id}-${widget.name}`"
          :model-value="(data.widgets[widget.name] as string | undefined) ?? 'randomize'"
          :items="controlAfterGenerateItems"
          size="xs"
          class="comfy-widget__control nodrag"
          @update:model-value="onValueChange(widget.name, $event)"
          @click.stop
        />

        <div v-if="isSlotConnected(widget.name)" class="comfy-slot__wired nodrag">
          <UIcon name="i-lucide-link" class="size-3 mr-1" />
          <span>已接入连线输入（优先由连线提供数据）</span>
        </div>

        <UTextarea
          v-if="widget.kind === 'STRING' && (widget.options.multiline || widget.options.dynamic_prompts)"
          :id="`${props.id}-${widget.name}`"
          :model-value="String(data.widgets[widget.name] ?? '')"
          :rows="2"
          autoresize
          size="xs"
          class="comfy-widget__control nodrag nowheel"
          @update:model-value="onValueChange(widget.name, $event)"
          @click.stop
        />

        <UInput
          v-else-if="widget.kind === 'INT' || widget.kind === 'FLOAT'"
          :id="`${props.id}-${widget.name}`"
          :model-value="Number(data.widgets[widget.name] ?? 0)"
          type="number"
          :min="widget.options.min"
          :max="widget.options.max"
          :step="widget.options.step ?? (widget.kind === 'INT' ? 1 : 0.01)"
          size="xs"
          class="comfy-widget__control nodrag"
          @update:model-value="onValueChange(widget.name, Number($event))"
          @click.stop
        />

        <UInput
          v-else
          :id="`${props.id}-${widget.name}`"
          :model-value="String(data.widgets[widget.name] ?? '')"
          size="xs"
          class="comfy-widget__control nodrag"
          @update:model-value="onValueChange(widget.name, $event)"
          @click.stop
        />

        <p v-if="hasMinMax(widget)" class="comfy-widget__hint">
          {{ widget.options.min }} – {{ widget.options.max }}
        </p>
      </div>

      <!-- 大模型提示词输出预览 -->
      <div v-if="isPromptNode && promptOutput && (promptOutput.positivePrompt || promptOutput.negativePrompt)" class="comfy-node__prompt-preview nodrag">
        <div class="comfy-node__prompt-section">
          <div class="comfy-node__prompt-label">
            <span>正向提示词</span>
            <span v-if="promptOutput.status === 'fresh'" class="text-emerald-500 font-normal">本次新生成</span>
            <span v-else-if="promptOutput.status === 'cached'" class="text-sky-500 font-normal">复用上次结果</span>
          </div>
          <p class="comfy-node__prompt-text">
            {{ promptOutput.positivePrompt }}
          </p>
        </div>
        <div v-if="promptOutput.negativePrompt" class="comfy-node__prompt-section">
          <div class="comfy-node__prompt-label">
            <span>反向提示词</span>
          </div>
          <p class="comfy-node__prompt-text text-neutral-400">
            {{ promptOutput.negativePrompt }}
          </p>
        </div>
      </div>

      <!-- 展开/收起参数按钮 -->
      <button
        v-if="hasManyWidgets && !filterKeyword"
        type="button"
        class="comfy-widget-expand-btn nodrag"
        @click.stop="toggleShowAll"
      >
        <span>{{ showAllWidgets ? '收起次要参数' : `展开剩余 ${hiddenWidgetsCount} 项参数` }}</span>
        <UIcon :name="showAllWidgets ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5" />
      </button>

      <p v-if="filterKeyword && !filteredWidgets.length" class="comfy-widget-empty">
        未找到匹配的参数
      </p>
    </div>

    <div v-if="currentProgress && currentProgress.max > 0" class="comfy-node__progress-container nodrag">
      <div class="comfy-node__progress-info">
        <span>采样进度</span>
        <span>{{ currentProgress.value }} / {{ currentProgress.max }} ({{ Math.round((currentProgress.value / currentProgress.max) * 100) }}%)</span>
      </div>
      <div class="comfy-node__progress">
        <div class="comfy-node__progress-bar" :style="{ width: `${Math.min(100, (currentProgress.value / Math.max(1, currentProgress.max)) * 100)}%` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComfyUploadType } from '#shared/types/comfyui'
import type { NodeProps } from '@vue-flow/core'
import type { ComfyNodeData } from '~/utils/comfy-graph'
import { CONTROL_AFTER_GENERATE_OPTIONS } from '#shared/types/comfyui'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useComfyEvents } from '~/composables/useComfyServer'
import { getUploadTargets } from '~/utils/comfy-controls'
import { buildInputViewUrl } from '~/utils/comfy-graph'

const props = defineProps<NodeProps<ComfyNodeData>>()
const emit = defineEmits<{
  upload: [payload: { file: File, kind: ComfyUploadType, nodeId: string, widgetName: string }]
}>()

const { edges, updateNodeInternals } = useVueFlow()
const { executingNodeId, progress, cachedNodeIds, lastErrorNodeId } = useComfyEvents()

const isExecuting = computed(() => executingNodeId.value === props.id || Boolean(props.data.executing))
const isCached = computed(() => cachedNodeIds.value.includes(props.id))
const isFailed = computed(() => lastErrorNodeId.value === props.id)
const currentProgress = computed(() => isExecuting.value ? (progress.value ?? props.data.progress ?? null) : null)

const data = computed(() => props.data)

function isSlotConnected(slotName: string): boolean {
  return edges.value.some(e => e.target === props.id && e.targetHandle === slotName)
}

const collectionImageWidgets = computed(() => data.value.widgetSpecs
  .filter(widget => widget.uploadType === 'image' && widget.options.image_collection === true))

/**
 * ComfyUI 的 AUTOGROW 输入会一次声明许多候选插槽。画布只显示已经接线的插槽，
 * 再多留一个空插槽供继续扩展，避免多图节点被十几个未使用端口撑得过长。
 */
const visibleInputSlots = computed(() => {
  const slots = collectionImageWidgets.value.length
    ? data.value.inputSlots.filter(slot => slot.name !== 'previous' && !/^image_\d+_input$/.test(slot.name))
    : data.value.inputSlots
  const dynamicGroups = new Map<string, Array<{ slot: typeof slots[number], index: number }>>()

  for (const slot of slots) {
    const match = slot.name.match(/^(.+)\.([^.]*(?:_|-))(\d+)$/)
    if (!match)
      continue
    const prefix = `${match[1]}.${match[2]}`
    const group = dynamicGroups.get(prefix) ?? []
    group.push({ slot, index: Number(match[3]) })
    dynamicGroups.set(prefix, group)
  }

  const visible = new Set(slots.map(slot => slot.name))
  for (const group of dynamicGroups.values()) {
    group.sort((a, b) => a.index - b.index)
    const connectedIndexes = group
      .filter(item => isSlotConnected(item.slot.name))
      .map(item => item.index)
    const lastConnected = connectedIndexes.length ? Math.max(...connectedIndexes) : 0
    const lastVisible = Math.min(group.at(-1)?.index ?? 1, lastConnected + 1)
    for (const item of group) {
      if (item.index > lastVisible)
        visible.delete(item.slot.name)
    }
  }

  return slots.filter(slot => visible.has(slot.name))
})

const collectionWidgetNames = computed(() => new Set(collectionImageWidgets.value.map(widget => widget.name)))
const collectionImages = computed(() => collectionImageWidgets.value
  .filter(widget => data.value.widgets[widget.name])
  .map(widget => ({ name: widget.name, filename: String(data.value.widgets[widget.name]) })))
const collectionMax = computed(() => Number(collectionImageWidgets.value[0]?.options.image_collection_max ?? collectionImageWidgets.value.length))
const regularWidgetSpecs = computed(() => data.value.widgetSpecs.filter(widget => !collectionWidgetNames.value.has(widget.name)))
const uploadedImages = computed(() => regularWidgetSpecs.value
  .filter(widget => widget.uploadType === 'image' && data.value.widgets[widget.name])
  .map(widget => ({ name: widget.name, filename: String(data.value.widgets[widget.name]) })))

const collectionFileInput = ref<HTMLInputElement>()
const collectionUploadError = ref('')

function pickCollectionImages() {
  collectionFileInput.value?.click()
}

function onCollectionFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  collectionUploadError.value = ''
  try {
    const firstEmpty = collectionImageWidgets.value.find(widget => !data.value.widgets[widget.name])
    if (!firstEmpty)
      throw new Error(`最多添加 ${collectionMax.value} 张图片`)
    const targets = getUploadTargets(collectionImageWidgets.value, data.value.widgets, firstEmpty.name, files.length)
    files.forEach((file, index) => {
      const target = targets[index]
      if (target?.uploadType)
        emit('upload', { file, kind: target.uploadType, nodeId: props.id, widgetName: target.name })
    })
  }
  catch (error) {
    collectionUploadError.value = error instanceof Error ? error.message : '无法添加图片'
  }
  input.value = ''
}

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

const hasManyWidgets = computed(() => regularWidgetSpecs.value.length > 8)

const filteredWidgets = computed(() => {
  const all = regularWidgetSpecs.value
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
  return regularWidgetSpecs.value.length - 6
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

watch(() => visibleInputSlots.value.map(slot => slot.name).join('|'), () => {
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

      <div class="comfy-node__actions nodrag">
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
        <div v-for="slot in visibleInputSlots" :key="slot.name" class="comfy-slot" :class="{ 'comfy-slot--connected': isSlotConnected(slot.name) }" :title="`输入: ${slot.type}`">
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

    <div v-if="!isCollapsed && collectionImageWidgets.length" class="comfy-node__collection nodrag nowheel">
      <div class="comfy-node__collection-head">
        <span>参考图片</span>
        <span>{{ collectionImages.length }} / {{ collectionMax }}</span>
      </div>
      <div v-if="collectionImages.length" class="comfy-node__collection-grid">
        <div v-for="img in collectionImages" :key="img.name" class="comfy-node__collection-item">
          <img :src="buildInputViewUrl(img.filename)" :alt="img.name" loading="lazy">
          <button type="button" :aria-label="`移除 ${img.name}`" title="移除图片" @click.stop="onValueChange(img.name, '')">
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </div>
      <button
        type="button"
        class="comfy-node__collection-add"
        :disabled="collectionImages.length >= collectionMax"
        @click.stop="pickCollectionImages"
      >
        <UIcon name="i-lucide-images" class="size-3.5" />
        添加图片
      </button>
      <input ref="collectionFileInput" type="file" accept="image/*" multiple class="hidden" @change="onCollectionFiles">
      <p v-if="collectionUploadError" class="comfy-widget__hint text-error-500">
        {{ collectionUploadError }}
      </p>
    </div>

    <div v-if="!isCollapsed && uploadedImages.length" class="comfy-node__gallery nodrag">
      <div v-for="img in uploadedImages" :key="img.name" class="comfy-node__gallery-item">
        <span class="comfy-node__gallery-label">{{ img.name }}</span>
        <img :src="buildInputViewUrl(img.filename)" :alt="img.name" class="comfy-node__gallery-thumb" loading="lazy">
      </div>
    </div>

    <div v-if="!isCollapsed && regularWidgetSpecs.length" class="comfy-node__widgets nodrag nowheel">
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

        <UTextarea
          v-else-if="widget.kind === 'STRING' && !widget.options.secret && (widget.options.multiline || widget.options.dynamic_prompts || widget.options.dynamicPrompts)"
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
          :type="widget.options.secret ? 'password' : 'text'"
          size="xs"
          class="comfy-widget__control nodrag"
          @update:model-value="onValueChange(widget.name, $event)"
          @click.stop
        />

        <div v-if="isSlotConnected(widget.name)" class="comfy-slot__wired nodrag">
          <UIcon name="i-lucide-link" class="size-3 mr-1" />
          <span>已接入连线输入（优先由连线提供数据）</span>
        </div>

        <p v-if="widget.options.tooltip" class="comfy-widget__hint">
          {{ widget.options.tooltip }}
        </p>

        <p v-if="hasMinMax(widget)" class="comfy-widget__hint">
          {{ widget.options.min }} – {{ widget.options.max }}
        </p>
      </div>

      <WorkflowTextOutput :node-id="props.id" />

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

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { ComfyNodeData } from '~/utils/comfy-graph'
import { CONTROL_AFTER_GENERATE_OPTIONS } from '#shared/types/comfyui'
import { Handle, Position, useVueFlow } from '@vue-flow/core'

const props = defineProps<NodeProps<ComfyNodeData>>()

const { updateNodeInternals } = useVueFlow()

const data = computed(() => props.data)

const comboItems = computed(() => {
  const result: Record<string, string[]> = {}
  for (const widget of data.value.widgetSpecs) {
    if (widget.kind === 'COMBO')
      result[widget.name] = widget.choices ?? []
  }
  return result
})

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
      'comfy-node--executing': props.data.executing,
      'comfy-node--collapsed': isCollapsed,
    }"
  >
    <header class="comfy-node__header" @dblclick.stop="toggleCollapse">
      <span class="comfy-node__title" :title="`${data.title} (${data.type})`">{{ data.title }}</span>
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
        <div v-for="slot in data.inputSlots" :key="slot.name" class="comfy-slot" :title="`输入: ${slot.type}`">
          <Handle
            :id="slot.name"
            type="target"
            :position="Position.Left"
            class="comfy-handle"
            :style="{ background: slotColor(slot.type) }"
            :title="slot.type"
          />
          <span class="comfy-slot__name">{{ slot.name }}</span>
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

    <div v-if="!isCollapsed && data.widgetSpecs.length" class="comfy-node__widgets nodrag nowheel">
      <!-- 超多参数快速搜索过滤 -->
      <div v-if="hasManyWidgets" class="comfy-widget-search nodrag">
        <span class="i-lucide-search comfy-widget-search__icon" />
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
          <span class="i-lucide-x" />
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
          :model-value="String(data.widgets[widget.name] ?? '')"
          :items="comboItems[widget.name] ?? []"
          size="xs"
          class="comfy-widget__control nodrag"
          @update:model-value="onValueChange(widget.name, $event)"
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
          v-else-if="widget.kind === 'STRING' && (widget.options.multiline || widget.options.dynamic_prompts)"
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

      <!-- 展开/收起参数按钮 -->
      <button
        v-if="hasManyWidgets && !filterKeyword"
        type="button"
        class="comfy-widget-expand-btn nodrag"
        @click.stop="toggleShowAll"
      >
        <span>{{ showAllWidgets ? '收起次要参数' : `展开剩余 ${hiddenWidgetsCount} 项参数` }}</span>
        <span :class="showAllWidgets ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
      </button>

      <p v-if="filterKeyword && !filteredWidgets.length" class="comfy-widget-empty">
        未找到匹配的参数
      </p>
    </div>

    <div v-if="data.progress" class="comfy-node__progress">
      <div class="comfy-node__progress-bar" :style="{ width: `${Math.min(100, (data.progress.value / Math.max(1, data.progress.max)) * 100)}%` }" />
    </div>
  </div>
</template>

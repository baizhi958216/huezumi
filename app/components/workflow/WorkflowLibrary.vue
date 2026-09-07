<script setup lang="ts">
import type { ComfyNodeTypeInfo, ComfyWorkflowSummary } from '#shared/types/comfyui'

type LibraryMode = 'workflows' | 'nodes'

const props = defineProps<{
  types: ComfyNodeTypeInfo[]
  workflows: ComfyWorkflowSummary[]
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  add: [type: string]
  load: [id: string]
}>()

const mode = defineModel<LibraryMode>('mode', { required: true })

const keyword = ref('')
const expanded = ref<string[]>([])
type WorkflowScopeFilter = 'mine' | 'public'

const workflowScope = ref<WorkflowScopeFilter>('mine')
const limit = 60

const filteredTypes = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key)
    return props.types
  return props.types.filter(item =>
    item.displayName.toLowerCase().includes(key)
    || item.name.toLowerCase().includes(key)
    || item.category.toLowerCase().includes(key),
  )
})

const groups = computed(() => {
  const map = new Map<string, ComfyNodeTypeInfo[]>()
  for (const info of filteredTypes.value) {
    const key = info.category.split('/')[0] || 'uncategorized'
    const bucket = map.get(key)
    if (bucket)
      bucket.push(info)
    else
      map.set(key, [info])
  }
  return [...map.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
})

/** 搜索时自动展开命中分组，避免用户还要手动点开。 */
watch(keyword, (value) => {
  if (value.trim())
    expanded.value = groups.value.map(group => group.category)
})

const visibleGroups = computed(() => groups.value.map((group) => {
  const isOpen = expanded.value.includes(group.category)
  return { ...group, isOpen, items: isOpen ? group.items : group.items.slice(0, limit) }
}))

const workflowItems = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  return props.workflows
    .filter(item => workflowScope.value === 'mine' ? item.scope === 'mine' : item.visibility === 'public')
    .filter((item) => {
      if (!key)
        return true
      return item.name.toLowerCase().includes(key)
    })
})

const workflowCount = computed(() => ({
  mine: props.workflows.filter(item => item.scope === 'mine').length,
  public: props.workflows.filter(item => item.visibility === 'public').length,
}))

function formatTime(isoStr: string) {
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  catch {
    return isoStr
  }
}

watch(mode, () => {
  keyword.value = ''
})

function toggle(category: string) {
  expanded.value = expanded.value.includes(category)
    ? expanded.value.filter(item => item !== category)
    : [...expanded.value, category]
}

function onDragStart(event: DragEvent, type: string) {
  if (props.disabled)
    return
  event.dataTransfer?.setData('application/comfy-node', type)
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <aside class="comfy-panel">
    <div class="comfy-panel__header">
      <div class="comfy-library__mode-switch" role="tablist" aria-label="资源类型">
        <button
          type="button"
          class="comfy-library__mode-btn"
          :class="{ 'is-active': mode === 'workflows' }"
          role="tab"
          :aria-selected="mode === 'workflows'"
          @click="mode = 'workflows'"
        >
          <span class="i-lucide-workflow" aria-hidden="true" />
          <span>工作流</span>
        </button>
        <button
          type="button"
          class="comfy-library__mode-btn"
          :class="{ 'is-active': mode === 'nodes' }"
          role="tab"
          :aria-selected="mode === 'nodes'"
          @click="mode = 'nodes'"
        >
          <span class="i-lucide-boxes" aria-hidden="true" />
          <span>节点</span>
        </button>
      </div>

      <template v-if="mode === 'workflows'">
        <UInput
          v-model="keyword"
          icon="i-lucide-search"
          placeholder="搜索工作流名称..."
          size="sm"
          class="w-full"
        />
        <div class="comfy-library__scope-switch" role="tablist" aria-label="工作流范围">
          <button
            type="button"
            class="comfy-library__scope-btn"
            :class="{ 'is-active': workflowScope === 'mine' }"
            role="tab"
            :aria-selected="workflowScope === 'mine'"
            @click="workflowScope = 'mine'"
          >
            我的工作流
            <span>{{ workflowCount.mine }}</span>
          </button>
          <button
            type="button"
            class="comfy-library__scope-btn"
            :class="{ 'is-active': workflowScope === 'public' }"
            role="tab"
            :aria-selected="workflowScope === 'public'"
            @click="workflowScope = 'public'"
          >
            公开工作流
            <span>{{ workflowCount.public }}</span>
          </button>
        </div>
        <p class="comfy-panel__meta">
          点击工作流载入画布，可继续编辑后另存为自己的版本
        </p>
      </template>

      <template v-else>
        <UInput
          v-model="keyword"
          icon="i-lucide-search"
          placeholder="搜索节点（名称 / 分类）"
          size="sm"
          class="w-full"
        />
        <p class="comfy-panel__meta">
          共 {{ filteredTypes.length }} 个节点 · 点击或拖拽添加到画布
        </p>
      </template>
    </div>

    <div class="comfy-panel__body studio-scroll">
      <template v-if="mode === 'workflows'">
        <div v-if="loading" class="comfy-panel__empty">
          <span class="i-lucide-loader-circle animate-spin" aria-hidden="true" />
          <span>正在加载工作流...</span>
        </div>
        <p v-else-if="!workflowItems.length" class="comfy-panel__empty">
          <span class="i-lucide-folder-open" aria-hidden="true" />
          <span>{{ keyword ? '没有匹配的工作流' : workflowScope === 'mine' ? '还没有保存工作流' : '暂时没有公开工作流' }}</span>
        </p>
        <div v-else class="comfy-workflow-list">
          <button
            v-for="item in workflowItems"
            :key="item.id"
            type="button"
            class="comfy-workflow-card"
            :title="`载入工作流：${item.name}`"
            @click="emit('load', item.id)"
          >
            <span class="comfy-workflow-card__icon">
              <span class="i-lucide-workflow" aria-hidden="true" />
            </span>
            <span class="comfy-workflow-card__body">
              <span class="comfy-workflow-card__name">{{ item.name }}</span>
              <span class="comfy-workflow-card__meta">
                <span>{{ item.nodeCount }} 个节点</span>
                <span>·</span>
                <span>{{ formatTime(item.updatedAt) }}</span>
              </span>
            </span>
            <span class="comfy-workflow-card__arrow i-lucide-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </template>

      <template v-else>
        <p v-if="!groups.length" class="comfy-panel__empty">
          {{
            disabled ? 'ComfyUI 未连接，无法获取节点列表' : '没有匹配的节点'
          }}
        </p>

        <section v-for="group in visibleGroups" :key="group.category" class="comfy-group">
          <button type="button" class="comfy-group__title" @click="toggle(group.category)">
            <span class="i-lucide-chevron-right comfy-group__chevron" :class="{ 'is-open': group.isOpen }" />
            <span class="truncate">{{ group.category }}</span>
            <span class="comfy-group__count">{{ group.items.length }}</span>
          </button>

          <ul v-if="group.isOpen" class="comfy-group__list">
            <li v-for="item in group.items" :key="item.name">
              <button
                type="button"
                class="comfy-group__item"
                :draggable="!disabled"
                :disabled="disabled"
                :title="item.description || item.name"
                @click="emit('add', item.name)"
                @dragstart="onDragStart($event, item.name)"
              >
                <span class="comfy-group__item-name">{{ item.displayName }}</span>
                <span v-if="item.outputNode" class="comfy-group__badge">输出</span>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </aside>
</template>

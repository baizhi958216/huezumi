<script setup lang="ts">
import type { ComfyNodeTypeInfo } from '#shared/types/comfyui'

const props = defineProps<{
  types: ComfyNodeTypeInfo[]
  disabled?: boolean
}>()

const emit = defineEmits<{ add: [type: string] }>()

const keyword = ref('')
const expanded = ref<string[]>([])
const limit = 60

const filtered = computed(() => {
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
  for (const info of filtered.value) {
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
      <UInput
        v-model="keyword"
        icon="i-lucide-search"
        placeholder="搜索节点（名称 / 分类）"
        size="sm"
        class="w-full"
      />
      <p class="comfy-panel__meta">
        共 {{ filtered.length }} 个节点 · 点击或拖拽添加到画布
      </p>
    </div>

    <div class="comfy-panel__body studio-scroll">
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
    </div>
  </aside>
</template>

<script setup lang="ts">
const props = defineProps<{
  projectOptions?: Array<{ id: string, name: string }>
  projectCursor?: string | null
}>()

const emit = defineEmits<{
  moreProjects: []
}>()

const projectId = defineModel<string>('projectId', { default: '' })
// SelectItem reserves the empty string for clearing the selection.
const selectedProject = computed({
  get: () => projectId.value || '__auto__',
  set: (value: string) => {
    projectId.value = value === '__auto__' ? '' : value
  },
})

const projectItems = computed(() => [
  { label: '自动创建项目', value: '__auto__' },
  ...((props.projectOptions || []).map(p => ({ label: p.name, value: p.id }))),
])
</script>

<template>
  <div class="space-y-3">
    <div v-if="projectOptions?.length" class="flex items-end gap-2">
      <UFormField label="归属项目" size="sm" class="flex-1">
        <USelect
          v-model="selectedProject"
          :items="projectItems"
          size="sm"
          class="w-full text-xs"
          icon="i-lucide-folder"
        />
      </UFormField>
      <UButton
        v-if="projectCursor"
        size="xs"
        variant="ghost"
        color="neutral"
        class="mb-0.5 text-xs text-muted hover:text-highlighted"
        @click="emit('moreProjects')"
      >
        更多
      </UButton>
    </div>
  </div>
</template>

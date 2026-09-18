<script setup lang="ts">
import type { ModelSpec, ProviderCapability } from '#shared/types/generation'

const props = defineProps<{
  capability?: ProviderCapability
  selectedModel?: ModelSpec
  effectiveCapability?: ProviderCapability
  providerItems: Array<{ label: string, value: string, disabled: boolean }>
  modelItems: Array<{ label: string, value: string }>
  projectOptions?: Array<{ id: string, name: string }>
  projectCursor?: string | null
}>()

const emit = defineEmits<{
  moreProjects: []
}>()

const projectId = defineModel<string>('projectId', { default: '' })
const providerId = defineModel<string | undefined>('providerId')
const model = defineModel<string>('model', { required: true })

const projectItems = computed(() => [
  { label: '自动创建项目', value: '' },
  ...((props.projectOptions || []).map(p => ({ label: p.name, value: p.id }))),
])
</script>

<template>
  <div class="space-y-3">
    <div v-if="projectOptions?.length" class="flex items-end gap-2">
      <UFormField label="归属项目" size="sm" class="flex-1">
        <USelect
          v-model="projectId"
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

    <div class="grid grid-cols-2 gap-2.5">
      <UFormField label="服务平台" size="sm">
        <USelect
          v-model="providerId"
          :items="providerItems"
          size="sm"
          class="w-full text-xs"
          placeholder="选择平台"
          icon="i-lucide-server"
        />
      </UFormField>
      <UFormField label="生成模型" size="sm">
        <USelect
          v-model="model"
          :items="modelItems"
          size="sm"
          class="w-full text-xs"
          placeholder="选择模型"
          :disabled="!modelItems.length"
          icon="i-lucide-cpu"
        />
      </UFormField>
    </div>

    <div v-if="selectedModel" class="rounded-lg bg-muted/40 px-3 py-2 text-xs text-dimmed leading-relaxed border border-default/40">
      <div class="flex items-center gap-1.5 font-medium text-toned mb-0.5">
        <UIcon name="i-lucide-info" class="size-3.5 text-primary shrink-0" />
        <span>{{ selectedModel.name }}</span>
        <UBadge v-if="selectedModel.badge" variant="subtle" size="xs" color="neutral" class="ml-1">
          {{ selectedModel.badge }}
        </UBadge>
      </div>
      <p class="text-[11px] leading-relaxed">
        {{ selectedModel.description }}
        <template v-if="effectiveCapability?.notes">
          · {{ effectiveCapability.notes }}
        </template>
      </p>
    </div>
  </div>
</template>

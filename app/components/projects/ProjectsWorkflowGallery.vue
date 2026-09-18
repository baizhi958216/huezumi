<script setup lang="ts">
import type { WorkflowProjectRecord } from '#shared/types/workflow-project'
import type { ViewMode } from '~/types/projects'
import ProjectsWorkflowCard from './ProjectsWorkflowCard.vue'

defineProps<{ records: WorkflowProjectRecord[], view: ViewMode }>()
</script>

<template>
  <section class="pb-6 pt-4 sm:pt-5" aria-label="工作流视频">
    <div class="mb-3 flex items-center justify-between text-xs text-dimmed">
      <h2 class="font-semibold text-highlighted">
        工作流视频（{{ records.length }}）
      </h2>
      <span>由工作流生成</span>
    </div>
    <div
      :class="view === 'list'
        ? 'grid gap-3'
        : view === 'masonry'
          ? 'columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6'
          : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-3.5'"
    >
      <ProjectsWorkflowCard
        v-for="record in records"
        :key="record.id"
        :record="record"
        :view="view"
      />
    </div>
  </section>
</template>

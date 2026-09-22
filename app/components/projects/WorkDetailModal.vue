<script setup lang="ts">
import type { ProjectSummary, WorkSummary } from '#shared/types/platform'
import { useClipboard } from '@vueuse/core'
import { runKindLabel } from '~/utils/run-labels'

const props = defineProps<{
  work?: WorkSummary
  open: boolean
  projects?: ProjectSummary[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'prev': []
  'next': []
}>()

const { copy } = useClipboard()
const copied = ref(false)

function copyUrl() {
  if (!props.work?.url)
    return
  copy(props.work.url)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

const projectName = computed(() => {
  if (!props.work?.projectId)
    return '未归入项目'
  return props.projects?.find(p => p.id === props.work?.projectId)?.name || '项目作品'
})

function formatDate(value?: string) {
  if (!value)
    return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-4xl max-w-[94vw]' }"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="flex items-center justify-between gap-3 w-full">
        <div class="flex items-center gap-2 min-w-0">
          <UBadge
            v-if="work"
            size="xs"
            :color="work.kind === 'video' ? 'primary' : work.kind === 'text' ? 'info' : 'neutral'"
            variant="subtle"
          >
            {{ runKindLabel[work.kind] }}
          </UBadge>
          <h2 class="truncate text-base font-semibold text-highlighted">
            {{ work?.title || '作品详情' }}
          </h2>
        </div>
      </div>
    </template>

    <template #body>
      <div v-if="work" class="grid gap-6 lg:grid-cols-[1fr_280px]">
        <!-- Media Theater Preview -->
        <div class="flex flex-col items-center justify-center overflow-hidden rounded-xl bg-black">
          <template v-if="work.kind === 'video' && work.url">
            <video
              :src="work.url"
              controls
              autoplay
              playsinline
              class="max-h-[65vh] w-full object-contain"
            />
          </template>

          <template v-else-if="work.kind === 'image' && work.url">
            <img
              :src="work.url"
              :alt="work.title"
              class="max-h-[65vh] w-full object-contain"
            >
          </template>

          <template v-else-if="work.kind === 'text'">
            <div class="w-full bg-elevated p-6 text-left max-h-[65vh] overflow-y-auto">
              <div class="flex items-center gap-2 text-xs text-dimmed mb-3">
                <UIcon name="i-lucide-file-text" class="size-4 text-info" />
                <span>剧本文档内容摘要</span>
              </div>
              <h3 class="text-lg font-bold text-highlighted mb-3">
                {{ work.title }}
              </h3>
              <p class="text-sm leading-relaxed text-toned whitespace-pre-wrap">
                {{ work.summary }}
              </p>
            </div>
          </template>

          <div v-else class="py-16 text-center text-dimmed">
            <UIcon name="i-lucide-file-warning" class="size-10 mx-auto mb-2 text-warning" />
            <p class="text-sm">
              该作品媒体文件暂不可在线预览
            </p>
          </div>
        </div>

        <!-- Metadata & Actions Sidebar -->
        <div class="flex flex-col justify-between space-y-4">
          <div class="space-y-4">
            <div>
              <p class="text-[11px] uppercase tracking-wider text-dimmed">
                所属项目
              </p>
              <p class="mt-0.5 text-sm font-medium text-highlighted">
                {{ projectName }}
              </p>
            </div>

            <div>
              <p class="text-[11px] uppercase tracking-wider text-dimmed">
                创建时间
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ formatDate(work.createdAt) }}
              </p>
            </div>

            <div v-if="work.summary && work.kind !== 'text'">
              <p class="text-[11px] uppercase tracking-wider text-dimmed">
                描述 / 提示词
              </p>
              <p class="mt-1 text-xs text-toned leading-relaxed line-clamp-6">
                {{ work.summary }}
              </p>
            </div>

            <div v-if="work.runId">
              <p class="text-[11px] uppercase tracking-wider text-dimmed">
                任务标识
              </p>
              <p class="mt-0.5 font-mono text-[11px] text-dimmed">
                {{ work.runId }}
              </p>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="space-y-2 pt-4 border-t border-default">
            <UButton v-if="work.kind === 'image' && work.runId && !work.promptId" block color="primary" icon="i-lucide-image-plus" :to="`/studio/image?run=${work.runId}`">
              返回图片创作台
            </UButton>
            <UButton
              v-if="work.kind === 'video' && work.runId && !work.promptId"
              block
              color="primary"
              icon="i-lucide-sparkles"
              :to="`/studio/video?from=${work.runId}`"
            >
              基于此生成继续创作
            </UButton>

            <UButton
              v-if="work.documentId"
              block
              color="primary"
              variant="soft"
              icon="i-lucide-file-text"
              :to="`/studio?document=${work.documentId}`"
            >
              在编辑器中打开文档
            </UButton>

            <UButton
              v-if="work.documentId && work.versionId"
              block
              color="primary"
              icon="i-lucide-film"
              :to="`/studio/video?document=${work.documentId}&sourceVersion=${work.versionId}`"
            >
              使用此版本生成视频
            </UButton>

            <UButton
              v-if="work.promptId"
              block
              color="neutral"
              variant="soft"
              icon="i-lucide-workflow"
              :to="`/studio/workflow?sourcePromptId=${work.promptId}`"
            >
              打开原始 ComfyUI 工作流
            </UButton>

            <div v-if="work.url" class="flex gap-2 pt-1">
              <UButton
                class="flex-1"
                variant="outline"
                color="neutral"
                size="sm"
                :icon="copied ? 'i-lucide-check' : 'i-lucide-link'"
                @click="copyUrl"
              >
                {{ copied ? '已复制链接' : '复制链接' }}
              </UButton>
              <UButton
                class="flex-1"
                variant="outline"
                color="neutral"
                size="sm"
                icon="i-lucide-download"
                :href="work.url"
                target="_blank"
                download
              >
                下载文件
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

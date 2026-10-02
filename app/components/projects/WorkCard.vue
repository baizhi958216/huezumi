<script setup lang="ts">
import type { ProjectSummary, WorkSummary } from '#shared/types/platform'
import { runKindLabel } from '~/utils/run-labels'

const props = withDefaults(defineProps<{
  work: WorkSummary
  mode?: 'grid' | 'masonry' | 'list'
  projects?: ProjectSummary[]
}>(), {
  mode: 'grid',
  projects: () => [],
})

const emit = defineEmits<{
  select: [work: WorkSummary]
  move: [work: WorkSummary, projectId: string]
  retryArchive: [work: WorkSummary]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const isHovering = ref(false)
const shouldLoadVideo = ref(false)

const projectName = computed(() => {
  if (!props.work.projectId)
    return '未归入项目'
  return props.projects.find(p => p.id === props.work.projectId)?.name || '项目作品'
})

const projectMenuItems = computed(() => {
  return [
    [
      {
        label: '移至未归入项目',
        icon: 'i-lucide-folder-minus',
        disabled: !props.work.projectId,
        onSelect: () => emit('move', props.work, ''),
      },
    ],
    props.projects.map(p => ({
      label: p.name,
      icon: 'i-lucide-folder',
      disabled: props.work.projectId === p.id,
      onSelect: () => emit('move', props.work, p.id),
    })),
  ]
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function onMouseEnter() {
  isHovering.value = true
  if (props.work.kind !== 'video' || !props.work.url)
    return
  shouldLoadVideo.value = true
  await nextTick()
  if (videoRef.value) {
    videoRef.value.currentTime = 0
    videoRef.value.play().catch(() => undefined)
  }
}

function onMouseLeave() {
  isHovering.value = false
  if (videoRef.value) {
    videoRef.value.pause()
  }
}
</script>

<template>
  <!-- List Mode Row -->
  <div
    v-if="mode === 'list'"
    class="group grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-default bg-elevated p-3 transition hover:bg-muted/40 sm:grid-cols-[72px_1fr_120px_140px_auto]"
  >
    <button
      type="button"
      class="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-950 text-white/70 focus:outline-none"
      :aria-label="`预览 ${work.title}`"
      @click="emit('select', work)"
    >
      <video
        v-if="work.kind === 'video' && work.url && work.availability === 'available'"
        :src="work.url"
        muted
        playsinline
        preload="metadata"
        class="size-full object-cover"
      />
      <img
        v-else-if="work.kind === 'image' && work.url && work.availability === 'available'"
        :src="work.url"
        :alt="work.title"
        class="size-full object-cover"
      >
      <div v-else class="flex size-full items-center justify-center bg-muted/60 text-dimmed">
        <UIcon
          :name="work.kind === 'text' ? 'i-lucide-file-text' : work.kind === 'video' ? 'i-lucide-film' : 'i-lucide-image'"
          class="size-5"
        />
      </div>
    </button>

    <div class="min-w-0 cursor-pointer" @click="emit('select', work)">
      <div class="flex items-center gap-2">
        <UBadge
          size="xs"
          variant="subtle"
          :color="work.kind === 'video' ? 'primary' : work.kind === 'text' ? 'info' : 'neutral'"
        >
          {{ runKindLabel[work.kind] }}
        </UBadge>
        <span class="truncate text-xs font-semibold text-highlighted sm:text-sm">
          {{ work.title }}
        </span>
      </div>
      <p class="mt-0.5 line-clamp-1 text-xs text-dimmed">
        {{ work.summary || '无摘要内容' }}
      </p>
    </div>

    <div class="hidden text-xs text-muted sm:block">
      <span class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-folder" class="size-3 text-dimmed" />
        <span class="truncate max-w-[100px]">{{ projectName }}</span>
      </span>
    </div>

    <div class="hidden text-xs text-dimmed sm:block">
      {{ formatDate(work.createdAt) }}
    </div>

    <div class="flex items-center gap-1.5">
      <UButton
        v-if="work.kind === 'video' && work.runId"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-sparkles"
        :to="`/studio/video?from=${work.runId}`"
        title="继续以此创作"
      />
      <UButton
        v-if="work.documentId"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-file-edit"
        :to="`/studio?document=${work.documentId}`"
        title="打开文档"
      />
      <UButton
        v-if="work.documentId && work.versionId"
        size="xs"
        variant="ghost"
        color="primary"
        icon="i-lucide-film"
        :to="`/studio/video?document=${work.documentId}&sourceVersion=${work.versionId}`"
        title="生成视频"
      />
      <UDropdownMenu :items="projectMenuItems" :content="{ align: 'end' }">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-folder-input"
          title="移动到项目"
        />
      </UDropdownMenu>
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        icon="i-lucide-expand"
        @click="emit('select', work)"
      />
    </div>
  </div>

  <!-- Grid or Masonry Card -->
  <article
    v-else
    class="group relative flex flex-col overflow-hidden rounded-xl border border-default bg-elevated transition-all duration-200 hover:-translate-y-0.5 hover:border-accented hover:shadow-card"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- Card Media Preview Area (Video or Image) -->
    <div
      v-if="work.kind !== 'text'"
      class="relative aspect-video w-full overflow-hidden bg-zinc-950 cursor-pointer"
      @click="emit('select', work)"
    >
      <!-- Media Content -->
      <template v-if="work.url && work.availability === 'available'">
        <template v-if="work.kind === 'video'">
          <video
            ref="videoRef"
            :src="shouldLoadVideo ? work.url : undefined"
            muted
            loop
            playsinline
            preload="none"
            class="size-full object-cover transition duration-300 group-hover:scale-105"
          />
          <!-- Poster overlay / play prompt -->
          <div
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-transparent"
          >
            <div
              class="flex size-10 items-center justify-center rounded-full bg-black/50 text-white shadow-soft backdrop-blur-sm transition duration-200 group-hover:scale-110 group-hover:bg-primary"
            >
              <UIcon name="i-lucide-play" class="ml-0.5 size-5" />
            </div>
          </div>
        </template>

        <img
          v-else
          :src="work.url"
          :alt="work.title"
          class="size-full object-cover transition duration-300 group-hover:scale-105"
        >
      </template>

      <!-- Unavailable State -->
      <div v-else class="flex size-full flex-col items-center justify-center p-4 text-center text-dimmed">
        <UIcon name="i-lucide-cloud-alert" class="size-8 text-warning" />
        <span class="mt-2 text-xs text-warning">文件暂不可用</span>
        <UButton
          v-if="work.runId"
          size="xs"
          variant="soft"
          color="warning"
          class="mt-2"
          @click.stop="emit('retryArchive', work)"
        >
          重试归档
        </UButton>
      </div>

      <!-- Top Overlay Badges -->
      <div class="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5">
        <UBadge
          size="xs"
          :color="work.kind === 'video' ? 'primary' : 'neutral'"
          variant="solid"
          class="backdrop-blur-md shadow-xs"
        >
          {{ runKindLabel[work.kind] }}
        </UBadge>
      </div>

      <div class="pointer-events-none absolute right-2.5 top-2.5">
        <span class="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md">
          {{ projectName }}
        </span>
      </div>
    </div>

    <!-- Card for Text Document -->
    <div
      v-else
      class="relative flex flex-col justify-between border-b border-default bg-gradient-to-br from-muted/30 to-elevated p-4 cursor-pointer min-h-[140px]"
      @click="emit('select', work)"
    >
      <div>
        <div class="flex items-center justify-between gap-2">
          <UBadge size="xs" color="info" variant="subtle" class="font-normal">
            <UIcon name="i-lucide-book-open" class="mr-1 size-3" />
            剧本文档
          </UBadge>
          <span class="text-[11px] text-dimmed">
            {{ projectName }}
          </span>
        </div>
        <h3 class="mt-2.5 line-clamp-2 text-sm font-semibold text-highlighted group-hover:text-primary transition">
          {{ work.title }}
        </h3>
        <p class="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted">
          {{ work.summary }}
        </p>
      </div>
    </div>

    <!-- Card Footer / Details & Action Strip -->
    <div class="flex flex-1 flex-col justify-between p-3.5">
      <div v-if="work.kind !== 'text'">
        <h3
          class="line-clamp-1 text-xs font-semibold text-highlighted cursor-pointer transition hover:text-primary sm:text-sm"
          @click="emit('select', work)"
        >
          {{ work.title }}
        </h3>
        <p class="mt-1 line-clamp-2 text-xs text-muted">
          {{ work.summary || '无描述' }}
        </p>
      </div>

      <!-- Action Buttons Row -->
      <div class="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-default/60">
        <span class="text-[11px] text-dimmed">
          {{ formatDate(work.createdAt) }}
        </span>

        <div class="flex items-center gap-1">
          <!-- Text Work Actions -->
          <template v-if="work.kind === 'text'">
            <UButton
              v-if="work.documentId"
              size="xs"
              variant="soft"
              color="neutral"
              icon="i-lucide-file-text"
              :to="`/studio?document=${work.documentId}`"
            >
              打开
            </UButton>
            <UButton
              v-if="work.documentId && work.versionId"
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-film"
              :to="`/studio/video?document=${work.documentId}&sourceVersion=${work.versionId}`"
            >
              生视频
            </UButton>
          </template>

          <!-- Video Work Actions -->
          <template v-else-if="work.kind === 'video'">
            <UButton
              v-if="work.runId"
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-sparkles"
              :to="`/studio/video?from=${work.runId}`"
            >
              衍生
            </UButton>
          </template>

          <!-- Move to Project Menu -->
          <UDropdownMenu :items="projectMenuItems" :content="{ align: 'end' }">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-folder-symlink"
              title="移动至项目"
            />
          </UDropdownMenu>

          <!-- Full View Details Modal Trigger -->
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-maximize-2"
            title="查看详情"
            @click="emit('select', work)"
          />
        </div>
      </div>
    </div>
  </article>
</template>

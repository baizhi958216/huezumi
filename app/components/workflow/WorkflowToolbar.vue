<script setup lang="ts">
import type { ComfyUIStatus, ComfyWorkflowSummary, ComfyWorkflowVisibility } from '#shared/types/comfyui'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ComfyFlowNode } from '~/utils/comfy-graph'

const props = defineProps<{
  status: ComfyUIStatus | null
  busy: boolean
  stopping?: boolean
  onStop: () => void | Promise<void>
  serviceAction?: 'starting' | 'stopping' | 'refreshing' | 'installing' | null
  serviceFeedback?: string | null
  running: boolean
  queueRemaining: number
  connected: boolean
  workflows: ComfyWorkflowSummary[]
  canRun: boolean
  executingNode?: ComfyFlowNode | null
  progress?: { value: number, max: number } | null
}>()

const emit = defineEmits<{
  refresh: []
  start: []
  install: []
  run: []
  interrupt: []
  save: []
  load: [id: string]
  remove: [id: string]
  create: []
  importJson: []
  exportJson: []
}>()

const name = defineModel<string>('name', { required: true })
const visibility = defineModel<ComfyWorkflowVisibility>('visibility', { required: true })

const moreActions: DropdownMenuItem[] = [
  { label: '新建工作流', icon: 'i-lucide-file-plus-2', onSelect: () => emit('create') },
  { label: '导入 JSON', icon: 'i-lucide-upload', onSelect: () => emit('importJson') },
  { label: '导出 JSON', icon: 'i-lucide-download', onSelect: () => emit('exportJson') },
]

const stateMeta = computed(() => {
  if (props.serviceAction === 'starting')
    return { label: '启动中', color: 'warning' as const, icon: 'i-lucide-loader-circle' }
  if (props.serviceAction === 'stopping' || props.stopping)
    return { label: '停止中', color: 'warning' as const, icon: 'i-lucide-loader-circle' }
  if (props.serviceAction === 'refreshing')
    return { label: '刷新中', color: 'warning' as const, icon: 'i-lucide-loader-circle' }
  if (props.serviceAction === 'installing')
    return { label: '安装中', color: 'warning' as const, icon: 'i-lucide-loader-circle' }
  const state = props.status?.state
  if (state === 'running')
    return { label: '运行中', color: 'success' as const, icon: 'i-lucide-circle-check' }
  if (state === 'starting')
    return { label: '启动中', color: 'warning' as const, icon: 'i-lucide-loader-circle' }
  if (state === 'not_installed')
    return { label: '未安装', color: 'neutral' as const, icon: 'i-lucide-package-x' }
  if (state === 'error')
    return { label: '异常', color: 'error' as const, icon: 'i-lucide-triangle-alert' }
  return { label: '已停止', color: 'neutral' as const, icon: 'i-lucide-circle-pause' }
})

const deviceLabel = computed(() => {
  const device = props.status?.systemStats?.devices?.[0]
  if (!device)
    return ''
  const vram = device.vram_total ? `${Math.round(device.vram_total / 1024 ** 3)}GB` : ''
  return [device.name || device.type, vram].filter(Boolean).join(' · ')
})

const installing = computed(() => props.status?.install.phase === 'running')

const canStop = computed(() => props.status?.mode === 'local' && props.status?.state !== 'stopped')
const canStart = computed(() =>
  props.status?.mode === 'local'
  && props.status?.installed
  && !props.serviceAction
  && !['running', 'starting'].includes(props.status.state),
)

const showManager = ref(false)
const searchWorkflow = ref('')
const filteredWorkflows = computed(() => {
  const query = searchWorkflow.value.trim().toLowerCase()
  if (!query)
    return props.workflows
  return props.workflows.filter(item => item.name.toLowerCase().includes(query))
})

function formatTime(isoStr: string) {
  try {
    const d = new Date(isoStr)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  catch {
    return isoStr
  }
}
</script>

<template>
  <header class="comfy-toolbar">
    <!-- 左侧只标识当前工具；全站导航由布局头部统一提供。 -->
    <div class="comfy-toolbar__left">
      <span class="comfy-toolbar__page-label">
        <UIcon name="i-lucide-workflow" class="size-3.5" />
        工作流编辑器
      </span>
    </div>

    <!-- 中间：工作流名称与 ComfyUI 状态药丸 -->
    <div class="comfy-toolbar__center">
      <UInput
        v-model="name"
        size="xs"
        placeholder="未命名工作流"
        class="comfy-toolbar__name"
      />

      <div class="comfy-toolbar__status-pill" aria-live="polite">
        <span
          class="comfy-toolbar__status-dot"
          :class="{
            'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]': stateMeta.color === 'success',
            'bg-amber-500 animate-pulse': stateMeta.color === 'warning',
            'bg-rose-500': stateMeta.color === 'error',
            'bg-neutral-400': stateMeta.color === 'neutral',
          }"
        />
        <span class="comfy-toolbar__status-label">{{ stateMeta.label }}</span>
        <span v-if="serviceFeedback" class="comfy-toolbar__status-feedback">{{ serviceFeedback }}</span>
        <span v-if="deviceLabel" class="comfy-toolbar__status-device" :title="status?.dir || status?.baseUrl">
          {{ deviceLabel }}
        </span>
        <span v-if="connected" class="comfy-toolbar__status-live" title="已连接 ComfyUI 实时事件流">
          实时
        </span>

        <div class="comfy-toolbar__status-controls">
          <button
            v-if="status?.mode === 'local' && !status.installed"
            type="button"
            class="comfy-toolbar__status-btn comfy-toolbar__status-btn--primary"
            :disabled="installing || busy"
            :title="serviceAction === 'installing' ? '正在安装 ComfyUI' : '安装 ComfyUI'"
            @click="emit('install')"
          >
            <UIcon :name="serviceAction === 'installing' ? 'i-lucide-loader-circle' : 'i-lucide-download'" class="size-3" :class="{ 'animate-spin': serviceAction === 'installing' }" />
            <span>{{ serviceAction === 'installing' ? '安装中' : '安装' }}</span>
          </button>
          <button
            v-if="canStart"
            type="button"
            class="comfy-toolbar__status-btn"
            :title="serviceAction === 'starting' ? '正在启动 ComfyUI' : '启动 ComfyUI'"
            aria-label="启动 ComfyUI"
            :disabled="busy"
            @click="emit('start')"
          >
            <UIcon :name="serviceAction === 'starting' ? 'i-lucide-loader-circle' : 'i-lucide-play'" class="size-3" :class="{ 'animate-spin': serviceAction === 'starting' }" />
          </button>
          <button
            v-if="canStop"
            type="button"
            class="comfy-toolbar__status-btn"
            :title="serviceAction === 'stopping' ? '正在停止 ComfyUI' : '停止 ComfyUI'"
            aria-label="停止 ComfyUI"
            :disabled="busy || stopping"
            @click="onStop()"
          >
            <UIcon :name="serviceAction === 'stopping' || stopping ? 'i-lucide-loader-circle' : 'i-lucide-square'" class="size-3" :class="{ 'animate-spin': serviceAction === 'stopping' || stopping }" />
          </button>
          <button
            type="button"
            class="comfy-toolbar__status-btn"
            :title="serviceAction === 'refreshing' ? '正在刷新服务状态' : '刷新服务状态'"
            aria-label="刷新 ComfyUI 状态"
            :disabled="busy || stopping"
            @click="emit('refresh')"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-3" :class="{ 'animate-spin': busy || serviceAction === 'refreshing' }" />
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧：工作流操作与运行 -->
    <div class="comfy-toolbar__right">
      <div class="comfy-toolbar__actions">
        <UButton
          size="xs"
          :color="visibility === 'public' ? 'primary' : 'neutral'"
          :variant="visibility === 'public' ? 'soft' : 'ghost'"
          :icon="visibility === 'public' ? 'i-lucide-globe-2' : 'i-lucide-lock-keyhole'"
          :title="visibility === 'public' ? '当前保存为公开工作流，点击改为私有' : '当前保存为私有工作流，点击改为公开'"
          @click="visibility = visibility === 'public' ? 'private' : 'public'"
        >
          {{ visibility === 'public' ? '公开' : '私有' }}
        </UButton>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-save" @click="emit('save')">
          保存
        </UButton>

        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-folder-open"
          @click="showManager = true"
        >
          打开
          <span
            v-if="workflows.length"
            class="ml-1 rounded-full bg-neutral-200 px-1 py-0.1 text-[9px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            {{ workflows.length }}
          </span>
        </UButton>

        <UDropdownMenu :items="moreActions" :content="{ align: 'end' }" :ui="{ content: 'w-44' }">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis" aria-label="更多工作流操作" />
        </UDropdownMenu>
      </div>

      <span class="comfy-toolbar__divider" aria-hidden="true" />

      <!-- 运行中状态胶囊（实时提示节点与进度，参考 ComfyUI） -->
      <div v-if="running" class="comfy-toolbar__running-pill">
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin text-signal-500 shrink-0" />
        <span class="comfy-toolbar__running-node" :title="executingNode ? `${executingNode.data?.title ?? ''} (#${executingNode.id})` : '执行中'">
          <template v-if="executingNode">
            <span class="font-medium text-neutral-800 dark:text-neutral-100">{{ executingNode.data?.title || executingNode.data?.type }}</span>
            <span class="comfy-toolbar__running-id">#{{ executingNode.id }}</span>
          </template>
          <template v-else>
            <span>排队处理中...</span>
          </template>
        </span>

        <span v-if="progress && progress.max > 0" class="comfy-toolbar__running-progress">
          {{ progress.value }}/{{ progress.max }}步 ({{ Math.round((progress.value / progress.max) * 100) }}%)
        </span>

        <button
          type="button"
          class="comfy-toolbar__running-interrupt"
          title="中断当前执行"
          @click="emit('interrupt')"
        >
          <UIcon name="i-lucide-ban" class="size-3 text-error-400" />
          <span>中断</span>
        </button>
      </div>

      <UButton
        v-else
        size="xs"
        color="primary"
        icon="i-lucide-sparkles"
        :disabled="!canRun"
        class="comfy-toolbar__run-btn"
        @click="emit('run')"
      >
        运行<template v-if="queueRemaining > 0">
          ({{ queueRemaining }})
        </template>
      </UButton>
    </div>

    <!-- 安装日志浮层 -->
    <div v-if="installing" class="comfy-toolbar__install-banner">
      <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
      <span>{{ status?.install.step || '准备中' }}</span>
      <span v-if="status?.install.log.length" class="comfy-toolbar__install-log">
        {{ status.install.log.at(-1) }}
      </span>
    </div>
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="showManager"
          class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          @click.self="showManager = false"
        >
          <div class="w-full max-w-lg overflow-hidden rounded-2xl border border-default bg-elevated shadow-2xl dark:border-white/10 dark:bg-zinc-900">
            <div class="flex items-center justify-between border-b border-default px-5 py-3.5 dark:border-white/10">
              <div class="flex items-center gap-2 text-sm font-semibold text-highlighted">
                <UIcon name="i-lucide-folder-open" class="size-4 text-primary" />
                工作流库
                <span class="text-xs text-muted font-normal">({{ workflows.length }} 个可用)</span>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                aria-label="关闭"
                @click="showManager = false"
              />
            </div>

            <div class="p-4">
              <UInput
                v-if="workflows.length > 3"
                v-model="searchWorkflow"
                size="sm"
                icon="i-lucide-search"
                placeholder="搜索工作流名称..."
                class="mb-3 w-full"
              />

              <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <div
                  v-for="item in filteredWorkflows"
                  :key="item.id"
                  class="flex items-center justify-between rounded-xl border border-default/60 bg-muted/30 p-3 transition hover:border-primary/40 dark:border-white/5 dark:bg-white/5"
                >
                  <div class="min-w-0 flex-1 pr-3">
                    <div class="flex items-center gap-2">
                      <span class="truncate font-medium text-sm text-highlighted">{{ item.name }}</span>
                      <span class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        {{ item.nodeCount }} 节点
                      </span>
                      <span v-if="item.scope === 'public'" class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                        公开
                      </span>
                    </div>
                    <p class="text-xs text-muted">
                      更新于 {{ formatTime(item.updatedAt) }}
                    </p>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <UButton
                      v-if="item.scope === 'mine'"
                      size="xs"
                      color="primary"
                      variant="soft"
                      icon="i-lucide-folder-input"
                      @click="emit('load', item.id); showManager = false"
                    >
                      载入
                    </UButton>
                    <UButton
                      size="xs"
                      color="error"
                      variant="ghost"
                      icon="i-lucide-trash-2"
                      title="删除工作流"
                      @click="emit('remove', item.id)"
                    />
                  </div>
                </div>

                <p v-if="!workflows.length" class="py-8 text-center text-sm text-muted">
                  暂无已保存的工作流，点击「保存」按钮可保存当前工作流
                </p>
                <p v-else-if="!filteredWorkflows.length" class="py-8 text-center text-sm text-muted">
                  没有匹配的工作流
                </p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </header>
</template>

<style scoped>
@media (max-width: 1100px) {
  .comfy-toolbar {
    height: auto;
    flex-wrap: wrap;
    padding-block: 0.5rem;
  }

  .comfy-toolbar__center,
  .comfy-toolbar__right {
    flex: 1 1 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
    min-width: 0;
  }

  .comfy-toolbar__actions {
    flex-wrap: wrap;
  }

  .comfy-toolbar__status-pill {
    flex-wrap: wrap;
  }

  .comfy-toolbar__running-pill {
    max-width: 100%;
  }
}
</style>

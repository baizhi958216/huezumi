<script setup lang="ts">
import type { ComfyUIStatus, ComfyWorkflowSummary, ComfyWorkflowVisibility } from '#shared/types/comfyui'

const props = defineProps<{
  status: ComfyUIStatus | null
  busy: boolean
  running: boolean
  queueRemaining: number
  connected: boolean
  workflows: ComfyWorkflowSummary[]
  canRun: boolean
}>()

const emit = defineEmits<{
  refresh: []
  start: []
  stop: []
  install: []
  run: []
  save: []
  load: [id: string]
  remove: [id: string]
  create: []
  importJson: []
  exportJson: []
}>()

const name = defineModel<string>('name', { required: true })
const visibility = defineModel<ComfyWorkflowVisibility>('visibility', { required: true })

const stateMeta = computed(() => {
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

const { isDark, toggleTheme } = useThemeTransition()
</script>

<template>
  <header class="comfy-toolbar">
    <!-- 左侧：品牌与全局页面导航 -->
    <div class="comfy-toolbar__left">
      <NuxtLink to="/" class="comfy-toolbar__brand focus-ring" title="返回首页">
        <BrandLogo compact />
      </NuxtLink>
      <span class="comfy-toolbar__divider" aria-hidden="true" />
      <nav class="comfy-toolbar__nav" aria-label="页面切换">
        <NuxtLink to="/studio" class="comfy-toolbar__nav-link" title="前往创作台">
          <span class="i-lucide-clapperboard" />
          <span>创作台</span>
        </NuxtLink>
        <NuxtLink to="/projects" class="comfy-toolbar__nav-link" title="前往作品库">
          <span class="i-lucide-library" />
          <span>作品库</span>
        </NuxtLink>
        <div class="comfy-toolbar__nav-link is-active" title="当前位于工作流">
          <span class="i-lucide-workflow" />
          <span>工作流</span>
        </div>
      </nav>
    </div>

    <!-- 中间：工作流名称与 ComfyUI 状态药丸 -->
    <div class="comfy-toolbar__center">
      <UInput
        v-model="name"
        size="xs"
        placeholder="未命名工作流"
        class="comfy-toolbar__name"
      />

      <div class="comfy-toolbar__status-pill">
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
            :disabled="installing"
            title="安装 ComfyUI"
            @click="emit('install')"
          >
            <span class="i-lucide-download" />
            <span>安装</span>
          </button>
          <button
            v-if="canStart"
            type="button"
            class="comfy-toolbar__status-btn"
            title="启动 ComfyUI"
            :disabled="busy"
            @click="emit('start')"
          >
            <span class="i-lucide-play" />
          </button>
          <button
            v-if="canStop"
            type="button"
            class="comfy-toolbar__status-btn"
            title="停止 ComfyUI"
            :disabled="busy"
            @click="emit('stop')"
          >
            <span class="i-lucide-square" />
          </button>
          <button
            type="button"
            class="comfy-toolbar__status-btn"
            title="刷新服务状态"
            :disabled="busy"
            @click="emit('refresh')"
          >
            <span class="i-lucide-refresh-cw" :class="{ 'animate-spin': busy }" />
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

        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-file-plus-2" @click="emit('create')">
          新建
        </UButton>

        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-upload" @click="emit('importJson')">
          导入
        </UButton>

        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-download" @click="emit('exportJson')">
          导出
        </UButton>
      </div>

      <span class="comfy-toolbar__divider" aria-hidden="true" />

      <ClientOnly>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
          :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
          class="comfy-toolbar__icon-btn"
          @click="toggleTheme"
        />
      </ClientOnly>

      <UButton
        size="xs"
        color="primary"
        icon="i-lucide-sparkles"
        :loading="running"
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
      <span class="i-lucide-loader-circle animate-spin" />
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
                <span class="i-lucide-folder-open text-primary" />
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

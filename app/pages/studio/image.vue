<script setup lang="ts">
import type { MediaInput } from '#shared/types/generation'
import type { ImageGenerationRequest } from '#shared/types/image-generation'
import type { ModelOption, RunSummary } from '#shared/types/platform'
import type { PlatformQuote } from '~/composables/usePlatformApi'
import { IMAGE_SIZES } from '#shared/types/image-generation'
import { useIntervalFn } from '@vueuse/core'
import { runStatusLabel, settlementLabel } from '~/utils/run-labels'

const route = useRoute()
const platform = usePlatformApi()
const { user, authDialogOpen } = useAuth()
const { data: catalog, refresh: refreshModels, error: catalogError } = await useFetch<ModelOption[]>('/api/catalog/models')
const models = computed(() => (catalog.value || []).filter(item => item.kind === 'image'))
const selectedId = ref('')
const selected = computed(() => models.value.find(item => item.id === selectedId.value))
const modelItems = computed(() => models.value.map(item => ({ label: `${item.label}${item.reason ? ` · ${item.reason}` : ''}`, value: item.id, disabled: !item.available })))
watch(models, (items) => {
  if (!items.some(item => item.id === selectedId.value))
    selectedId.value = items.find(item => item.available)?.id || items[0]?.id || ''
}, { immediate: true })
const { items: projects, cursor: projectCursor, loadMore: moreProjects, refresh: refreshProjects } = await useProjectOptions()
const projectId = ref('')
const selectedProject = computed({
  get: () => projectId.value || '__auto__',
  set: (value: string) => {
    projectId.value = value === '__auto__' ? '' : value
  },
})
const projectItems = computed(() => [{ label: '自动创建项目', value: '__auto__' }, ...projects.value.map(item => ({ label: item.name, value: item.id }))])
const mode = ref<'text' | 'edit'>('text')
const prompt = ref('')
const negativePrompt = ref('')
const media = ref<MediaInput[]>([])
const size = ref<(typeof IMAGE_SIZES)[number]['value']>('1024*1024')
const count = ref(1)
const promptExtend = ref(true)
const watermark = ref(false)
const seed = ref<number>()
const settingsOpen = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const run = ref<RunSummary>()
const quote = ref<PlatformQuote>()
const idempotencyKey = ref('')
const preview = ref<string>()
const active = computed(() => !!run.value && ['PENDING', 'RUNNING'].includes(run.value.status))
const saving = computed(() => run.value?.stage === 'archiving')
const outputs = computed(() => run.value?.outputs.filter(item => item.kind === 'image' && item.url) || [])
const input = computed<ImageGenerationRequest>(() => ({ mode: mode.value, prompt: prompt.value, negativePrompt: negativePrompt.value || undefined, images: mode.value === 'edit' ? media.value.map(item => item.url) : [], size: size.value, count: count.value, promptExtend: promptExtend.value, watermark: watermark.value, seed: typeof seed.value === 'number' ? seed.value : undefined }))
watch([input, selectedId, projectId], () => {
  quote.value = undefined
}, { deep: true })
watch(user, async (value) => {
  run.value = undefined
  quote.value = undefined
  media.value = []
  if (value) {
    await refreshModels()
    await refreshProjects()
    await restoreRun()
  }
})
const polling = useIntervalFn(refreshRun, 4000, { immediate: false })
async function refreshRun() {
  if (!run.value)
    return
  try {
    run.value = await platform.run(run.value.id)
    if (!active.value && !saving.value)
      polling.pause()
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
}
async function generate() {
  if (submitting.value || active.value)
    return
  if (!user.value) {
    authDialogOpen.value = true
    return
  }
  errorMessage.value = ''
  if (!selected.value?.available || !prompt.value.trim()) {
    errorMessage.value = '请选择可用模型并填写画面描述'
    return
  }
  if (mode.value === 'edit' && !media.value.length) {
    errorMessage.value = '请先上传至少一张参考图片'
    return
  }
  submitting.value = true
  try {
    if (!quote.value || Date.parse(quote.value.expiresAt) <= Date.now()) {
      const snapshot = JSON.stringify({ input: input.value, selectedId: selectedId.value, projectId: projectId.value })
      const result = await platform.quote({ kind: 'image', connectionId: selected.value.connectionId, model: selected.value.model, input: input.value, projectId: projectId.value || undefined })
      if (snapshot !== JSON.stringify({ input: input.value, selectedId: selectedId.value, projectId: projectId.value }))
        return
      quote.value = result
      idempotencyKey.value = crypto.randomUUID()
      return
    }
    run.value = await platform.submit(quote.value, idempotencyKey.value)
    quote.value = undefined
    await navigateTo({ query: { run: run.value.id } }, { replace: true })
    polling.resume()
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
  finally {
    submitting.value = false
  }
}
async function restoreRun() {
  if (!user.value || typeof route.query.run !== 'string')
    return
  try {
    const result = await platform.run(route.query.run)
    if (result.kind !== 'image') {
      errorMessage.value = '此任务不是图片生成任务'
      return
    }
    run.value = result
    projectId.value = result.projectId || ''
    if (result.imageRequest) {
      const request = result.imageRequest
      selectedId.value = `${request.connectionId}:${request.model}`
      mode.value = request.input.mode
      prompt.value = request.input.prompt
      negativePrompt.value = request.input.negativePrompt || ''
      size.value = IMAGE_SIZES.find(item => item.value === request.input.size)?.value || '1024*1024'
      count.value = request.input.count
      promptExtend.value = request.input.promptExtend
      watermark.value = request.input.watermark
      seed.value = request.input.seed
      media.value = request.input.images.map(url => ({ type: 'reference_image', url }))
    }
    if (active.value || saving.value)
      polling.resume()
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
}
async function retryArchive() {
  if (!run.value || submitting.value)
    return
  submitting.value = true
  try {
    await platform.command(run.value.id, 'archive')
    await refreshRun()
    polling.resume()
  }
  catch (error) { errorMessage.value = apiError(error) }
  finally { submitting.value = false }
}
onMounted(restoreRun)
onBeforeUnmount(polling.pause)
</script>

<template>
  <main class="min-h-[calc(100svh-var(--app-header-offset))] bg-muted/35 py-3 md:py-4">
    <div class="creation-content grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="border-b border-default px-5 py-4">
          <p class="text-[11px] font-semibold tracking-wider text-dimmed">
            图片生成
          </p>
          <h1 class="mt-1 text-lg font-semibold text-highlighted">
            让想象，有一张自己的画面
          </h1>
          <p class="mt-1 text-xs leading-relaxed text-muted">
            描述心中的场景，或用参考图片继续创作。
          </p>
        </div>
        <div class="space-y-5 p-5">
          <div class="grid grid-cols-2 gap-2" aria-label="图片生成模式">
            <UButton :variant="mode === 'text' ? 'soft' : 'ghost'" :color="mode === 'text' ? 'primary' : 'neutral'" icon="i-lucide-sparkles" class="justify-center" @click="mode = 'text'">
              文生图
            </UButton>
            <UButton :variant="mode === 'edit' ? 'soft' : 'ghost'" :color="mode === 'edit' ? 'primary' : 'neutral'" icon="i-lucide-image-plus" class="justify-center" @click="mode = 'edit'">
              参考图编辑
            </UButton>
          </div>
          <UFormField label="图片模型">
            <USelect v-model="selectedId" :items="modelItems" placeholder="选择图片模型" class="w-full" />
          </UFormField>
          <UAlert v-if="user && (!models.length || catalogError)" color="warning" variant="subtle" description="暂无可用图片模型，请联系管理员配置百炼图片连接和按张价格。">
            <template #actions>
              <UButton size="xs" variant="soft" @click="refreshModels()">
                重新加载
              </UButton>
            </template>
          </UAlert>
          <MediaSlot v-if="mode === 'edit'" label="参考图片" hint="上传 1–3 张图片，描述你希望保留或修改的内容" icon="i-lucide-image-plus" type="reference_image" accept="image/png,image/jpeg,image/webp" :allow-url="false" :max="3" :max-bytes="10 * 1024 * 1024" :values="media" @change="media = $event" />
          <UFormField :label="mode === 'edit' ? '编辑描述' : '画面描述'" :hint="`${prompt.length} / 4000`">
            <UTextarea v-model="prompt" :rows="8" autoresize :maxrows="14" :maxlength="4000" class="w-full" :placeholder="mode === 'edit' ? '保留参考图中的人物，将背景改为傍晚的海边，暖色光线，胶片质感…' : '一间漂浮在云海中的小书店，窗边的橘猫正在打盹，柔和的午后阳光，温暖的手绘插画风格…'" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="画幅">
              <USelect v-model="size" :items="[...IMAGE_SIZES]" class="w-full" />
            </UFormField>
            <UFormField label="生成张数">
              <USelect v-model="count" :items="[1, 2, 3, 4, 5, 6].map(value => ({ label: `${value} 张`, value }))" class="w-full" />
            </UFormField>
          </div>
          <UButton color="neutral" variant="subtle" icon="i-lucide-settings-2" block @click="settingsOpen = true">
            参数与项目设置
          </UButton>
          <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
          <div class="border-t border-default pt-4">
            <p v-if="quote" class="mb-3 text-xs text-primary">
              预估 {{ quote.estimatedCredits }} 额度 · 价格版本 {{ quote.priceVersion }}
            </p>
            <UButton block size="lg" icon="i-lucide-sparkles" :loading="submitting" :disabled="active || (!!user && (!selected?.available || !prompt.trim()))" @click="generate">
              {{ quote ? `确认生成 · ${quote.estimatedCredits} 额度` : '获取生成报价' }}
            </UButton>
            <p class="mt-2 text-center text-[11px] text-dimmed">
              生成后自动保存到作品库，可离开页面等待完成。
            </p>
          </div>
        </div>
      </UCard>
      <UCard :ui="{ body: 'p-5 sm:p-6' }">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            <UIcon name="i-lucide-images" class="size-4" />画面预览
          </h2>
          <UButton to="/projects?kind=image" variant="ghost" color="neutral" size="xs" trailing-icon="i-lucide-arrow-up-right">
            图片作品库
          </UButton>
        </div>
        <div v-if="run" class="mb-5 space-y-2 rounded-xl border border-default bg-muted/40 p-4">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="flex items-center gap-2"><UIcon :name="active || saving ? 'i-lucide-loader-circle' : run.status === 'SUCCEEDED' ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'" :class="{ 'animate-spin': active || saving }" />{{ saving ? '正在保存图片' : runStatusLabel[run.status] }}</span>
            <span class="text-xs text-muted">{{ settlementLabel(run.billing.settlementStatus) }}</span>
          </div>
          <p v-if="run.error" class="text-xs text-warning">
            {{ run.error }}
          </p>
          <UButton v-if="run.allowedActions.includes('archive') && run.error" size="xs" variant="soft" :loading="submitting" @click="retryArchive">
            重试保存图片
          </UButton>
        </div>
        <div v-if="outputs.length" class="grid gap-5" :class="outputs.length > 1 ? 'sm:grid-cols-2' : ''">
          <figure v-for="(output, index) in outputs" :key="output.id" class="overflow-hidden rounded-xl border border-default bg-muted/20">
            <button class="block w-full cursor-zoom-in" :aria-label="`查看第 ${index + 1} 张图片`" @click="preview = output.url">
              <img :src="output.url" :alt="`生成图片 ${index + 1}`" class="max-h-[65vh] w-full object-contain">
            </button>
            <figcaption class="flex items-center justify-between p-3 text-xs text-muted">
              <span>图片 {{ index + 1 }}</span><UButton :to="`${output.url}?download=1`" external download color="neutral" variant="ghost" size="xs" icon="i-lucide-download">
                下载图片
              </UButton>
            </figcaption>
          </figure>
        </div>
        <div v-else class="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-default bg-muted/20 px-8 text-center lg:min-h-[580px]">
          <div class="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/8 text-primary">
            <UIcon :name="active ? 'i-lucide-loader-circle' : 'i-lucide-image'" class="size-7" :class="{ 'animate-spin': active }" />
          </div>
          <h3 class="text-base font-medium text-highlighted">
            {{ active ? '你的画面正在生成' : saving ? '画面正在保存' : '下一张作品，从一个想法开始' }}
          </h3>
          <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {{ active || saving ? '完成后会在这里展示，也可以前往作品库查看。' : '写下主体、风格与光线，或者上传参考图，让细节更贴近你的想象。' }}
          </p>
        </div>
      </UCard>
    </div>
    <UModal v-model:open="settingsOpen" title="图片参数与项目" description="设置生成偏好，并选择作品所属项目。">
      <template #body>
        <div class="space-y-5">
          <UFormField label="所属项目">
            <USelect v-model="selectedProject" :items="projectItems" class="w-full" /><UButton v-if="projectCursor" size="xs" variant="ghost" @click="moreProjects().catch(e => errorMessage = apiError(e))">
              加载更多项目
            </UButton>
          </UFormField>
          <UFormField label="不希望出现的内容">
            <UTextarea v-model="negativePrompt" :maxlength="500" :rows="3" class="w-full" placeholder="模糊、文字变形、杂乱背景…" />
          </UFormField>
          <UFormField label="随机种子" hint="留空随机">
            <UInput v-model.number="seed" type="number" :min="0" :max="2147483647" class="w-full" />
          </UFormField>
          <USwitch v-model="promptExtend" label="智能优化提示词" />
          <USwitch v-model="watermark" label="添加 Qwen-Image 水印" />
        </div>
      </template>
    </UModal>
    <UModal :open="!!preview" title="图片预览" :ui="{ content: 'sm:max-w-5xl' }" @update:open="value => { if (!value) preview = undefined }">
      <template #body>
        <img v-if="preview" :src="preview" alt="生成图片预览" class="max-h-[80vh] w-full object-contain">
      </template>
    </UModal>
  </main>
</template>

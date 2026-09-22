<script setup lang="ts">
import type { TextCreationLength } from '#shared/types/text-creation'

defineProps<{
  projectItems: Array<{ label: string, value: string }>
  providerItems: Array<{ label: string, value: string }>
  lengthItems: Array<{ label: string, value: string }>
  projectCursor?: string | null
  disabledProject?: boolean
}>()

const emit = defineEmits<{
  moreProjects: []
}>()

const open = defineModel<boolean>('open', { default: false })
const projectId = defineModel<string>('projectId', { default: '' })
const connectionId = defineModel<string | undefined>('connectionId')
const length = defineModel<TextCreationLength>('length', { required: true })
const tone = defineModel<string>('tone', { required: true })
const audience = defineModel<string>('audience', { required: true })

const commonTones = [
  '电影感、克制、有悬念',
  '快节奏、反转、高能爽感',
  '温情治愈、细腻、生活流',
  '幽默风趣、接地气、口语化',
  '专业严谨、逻辑清晰、权威感',
]

function selectTonePreset(preset: string) {
  tone.value = preset
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="文案设置"
    description="调整篇幅、风格、受众与所属项目。"
    :ui="{ content: 'sm:max-w-lg max-w-[94vw] overflow-hidden' }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2.5">
          <div class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-sliders" class="size-4.5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-highlighted leading-tight">
              文本创作参数设置
            </h2>
            <p class="text-xs text-dimmed mt-0.5">
              配置篇幅长短、基调受众、生成模型与归属项目
            </p>
          </div>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-x"
          aria-label="关闭"
          @click="open = false"
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- 篇幅选择 -->
        <UFormField label="目标篇幅" size="sm" description="根据剧本或故事容量自动分配各场次与正文字数">
          <USelect
            v-model="length"
            :items="lengthItems"
            class="w-full"
            size="sm"
            icon="i-lucide-align-left"
          />
        </UFormField>

        <!-- 文本模型 -->
        <UFormField label="文本大模型" size="sm" description="用于故事策划、剧本分场与文案撰写">
          <USelect
            v-model="connectionId"
            :items="providerItems"
            class="w-full"
            size="sm"
            placeholder="选择私有连接或模型"
            :disabled="!providerItems.length"
            icon="i-lucide-cpu"
          />
        </UFormField>

        <!-- 归属项目 -->
        <div class="flex items-end gap-2">
          <UFormField label="归属项目" size="sm" class="flex-1">
            <USelect
              v-model="projectId"
              :items="projectItems"
              :disabled="disabledProject"
              size="sm"
              class="w-full"
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
            更多项目
          </UButton>
        </div>

        <div class="border-t border-default/50 pt-3 space-y-3">
          <!-- 风格与基调 -->
          <UFormField label="风格与基调" size="sm">
            <UInput
              v-model="tone"
              class="w-full text-xs"
              size="sm"
              placeholder="例如：电影感、克制、有悬念"
              icon="i-lucide-palette"
            />
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="preset in commonTones"
                :key="preset"
                type="button"
                class="rounded-md border border-default/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted hover:text-highlighted hover:border-primary/50 transition-colors"
                @click="selectTonePreset(preset)"
              >
                {{ preset }}
              </button>
            </div>
          </UFormField>

          <!-- 目标受众 -->
          <UFormField label="目标受众" hint="可选" size="sm">
            <UInput
              v-model="audience"
              class="w-full text-xs"
              size="sm"
              placeholder="例如：泛大众悬疑爱好者、短视频年轻用户"
              icon="i-lucide-users"
            />
          </UFormField>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end w-full">
        <UButton
          color="primary"
          size="sm"
          @click="open = false"
        >
          完成设置
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const modes = [
  { icon: 'i-lucide-type', code: 'TEXT → VIDEO', title: '文生视频', description: '仅需文本描述，模型自动解析场景、构图、光影与相机运动。', tags: ['多语言提示词', '镜头运镜', '智能扩写'] },
  { icon: 'i-lucide-panels-top-left', code: 'FRAMES → VIDEO', title: '首尾帧运镜', description: '锁定起始与结束画面，让模型补全中间运动与自然转场。', tags: ['首帧约束', '尾帧可选', '画幅跟随'] },
  { icon: 'i-lucide-layers-3', code: 'REFERENCE → VIDEO', title: '多模态参考', description: '组合图片、视频与音频，统一驱动角色、风格、运动和节奏。', tags: ['参考图', '参考视频', '参考音频'] },
]
</script>

<template>
  <section class="border-y border-default/60 bg-elevated/40">
    <div class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p class="type-kicker">
            INPUT MODES
          </p><h2 class="type-section-title mt-2">
            一套任务结构，覆盖三种生成方式
          </h2>
        </div><p class="type-body max-w-md">
          平台根据供应商能力自动收敛素材类型与可用参数。
        </p>
      </div>
      <div class="mt-8 grid gap-5 md:grid-cols-3">
        <UCard v-for="mode in modes" :key="mode.title" class="transition duration-300 hover:-translate-y-1 hover:shadow-lift">
          <div class="flex items-center justify-between">
            <span class="grid size-11 place-items-center rounded-xl bg-signal-50 text-signal-600 dark:bg-signal-950/30"><UIcon :name="mode.icon" class="size-5" /></span><code class="text-[10px] font-semibold tracking-wider text-dimmed">{{ mode.code }}</code>
          </div>
          <h3 class="mt-5 text-lg font-650 text-highlighted">
            {{ mode.title }}
          </h3><p class="mt-2 text-sm leading-7 text-muted">
            {{ mode.description }}
          </p>
          <div class="mt-5 flex flex-wrap gap-2 border-t border-default pt-4">
            <span v-for="tag in mode.tags" :key="tag" class="rounded-full bg-muted px-2.5 py-1 text-[11px] text-toned">{{ tag }}</span>
          </div>
        </UCard>
      </div>
    </div>
  </section>
</template>

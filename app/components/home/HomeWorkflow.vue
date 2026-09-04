<script setup lang="ts">
const steps = [
  { number: '01', title: '选择生成方式', description: '根据素材选择文生、首尾帧或多模态参考。' },
  { number: '02', title: '设置输出参数', description: '调整模型、清晰度、画幅、时长与音频。' },
  { number: '03', title: '提交并追踪任务', description: '异步生成并持续更新，成功后自动归档。' },
]
</script>

<template>
  <section id="workflow" class="border-y border-default/60 bg-elevated/40">
    <div class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
      <p class="type-kicker">
        WORKFLOW
      </p><h2 class="type-section-title mt-2">
        三步完成一次生成
      </h2><div class="mt-8 grid overflow-hidden rounded-2xl border border-default bg-elevated md:grid-cols-3">
        <article v-for="step in steps" :key="step.number" class="border-b border-default p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <span class="text-sm font-650 text-signal-500">{{ step.number }}</span><h3 class="mt-8 text-lg font-650 text-highlighted">
            {{ step.title }}
          </h3><p class="mt-2 text-sm leading-7 text-muted">
            {{ step.description }}
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

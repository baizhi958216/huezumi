<script setup lang="ts">
import AnimatedContent from '~/components/vuebits/AnimatedContent.vue'

defineProps<{ modelCount: number, providerCount: number }>()
</script>

<template>
  <section class="relative overflow-hidden border-b border-default/60 bg-[radial-gradient(circle_at_50%_15%,rgba(255,77,53,0.12),transparent_35%)]">
    <div class="mx-auto max-w-[1200px] px-5 pb-16 pt-28 md:px-8 md:pb-20 md:pt-36">
      <AnimatedContent :distance="24" :duration="0.7" class-name="mx-auto max-w-4xl text-center">
        <NuxtLink to="#capabilities" class="inline-flex items-center gap-2 rounded-full border border-default bg-elevated/80 px-3 py-1.5 text-xs font-semibold text-toned shadow-soft backdrop-blur">
          <span class="size-1.5 rounded-full bg-signal-500 shadow-[0_0_0_4px_rgba(255,77,53,0.12)]" />
          {{ modelCount }} 个视频模型 · {{ providerCount }} 家主流平台
          <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
        </NuxtLink>
        <h1 class="mt-6 text-[clamp(3rem,8vw,6.5rem)] font-650 leading-[0.98] tracking-[-0.055em] text-highlighted">
          把想象，
          <span class="block text-signal-500">直接变成镜头。</span>
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted md:text-lg">
          从一句文字到完整画面，也可以带上图片、视频与声音。forkvdo 将不同模型放进同一个清晰、可靠的创作流程。
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <UButton to="/studio" size="xl" color="primary" trailing-icon="i-lucide-arrow-up-right" class="px-7">
            开始创作
          </UButton>
          <UButton to="/projects" size="xl" color="neutral" variant="outline" class="px-7">
            查看作品
          </UButton>
        </div>
      </AnimatedContent>

      <AnimatedContent :distance="28" :duration="0.8" :delay="0.1" class-name="mt-12 overflow-hidden rounded-3xl border border-default bg-elevated shadow-cinema">
        <div class="flex items-center justify-between border-b border-default px-4 py-3 text-[11px] font-semibold tracking-[0.08em] text-dimmed md:px-5">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-4 text-signal-500" /> FORKVDO STUDIO
          </div>
          <div class="flex items-center gap-2">
            <span class="size-1.5 animate-pulse rounded-full bg-green-500" /> 渲染管线就绪
          </div>
        </div>
        <div class="grid lg:grid-cols-[0.82fr_1.18fr]">
          <div class="flex flex-col justify-between gap-6 border-b border-default p-5 text-left md:p-7 lg:border-b-0 lg:border-r">
            <div>
              <div class="flex items-center justify-between">
                <span class="type-kicker">DIRECTOR CONSOLE</span><UBadge color="primary" variant="subtle">
                  CINEMATIC
                </UBadge>
              </div>
              <div class="mt-4 rounded-xl border border-default bg-muted/50 p-4 text-sm leading-7 text-toned">
                <strong class="text-signal-500">[主体]</strong> 暴雨后的辽阔荒原，一扇悬浮的光门缓缓开启。<strong class="text-sky-500">[运镜]</strong> 低机位平滑推进，焦点汇聚门内光芒。
              </div>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div v-for="meter in [{ label: '运镜幅度', value: '85%', width: 'w-[85%]', color: 'bg-signal-500' }, { label: '提示词关联', value: '7.5', width: 'w-3/4', color: 'bg-sky-500' }]" :key="meter.label" class="rounded-xl border border-default p-3">
                  <span class="type-caption">{{ meter.label }}</span><strong class="mt-1 block text-highlighted">{{ meter.value }}</strong><div class="mt-2 h-1 rounded-full bg-muted">
                    <span class="block h-full rounded-full" :class="[meter.width, meter.color]" />
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-3 border-t border-default pt-4 text-xs text-muted">
              <span class="flex items-center gap-1.5"><UIcon name="i-lucide-circle-check" class="size-4 text-green-500" />1080P · 8s · 原生有声</span><UButton to="/studio" size="sm" trailing-icon="i-lucide-arrow-up-right">
                打开创作台
              </UButton>
            </div>
          </div>
          <div class="relative min-h-64 overflow-hidden bg-zinc-950 md:min-h-96">
            <img src="/images/hero-cinematic.png" alt="AI 生成的电影感荒原光门画面" class="absolute inset-0 size-full object-cover">
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
            <div class="absolute left-4 right-4 top-4 flex justify-between text-[10px] font-semibold tracking-wider text-white/85 md:left-6 md:right-6">
              <span class="flex items-center gap-2"><i class="size-2 rounded-full bg-red-500" /> REC · 00:08</span><span>4K DCI · 24 FPS</span>
            </div>
            <div class="absolute bottom-5 left-5 right-5">
              <div class="flex justify-between text-[10px] font-semibold text-white">
                <span>WAN 3.0 CINEMA RENDER</span><span>MASTER</span>
              </div><div class="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
                <span class="block h-full w-2/3 rounded-full bg-signal-500" />
              </div>
            </div>
          </div>
        </div>
      </AnimatedContent>

      <div class="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-default bg-elevated shadow-soft md:grid-cols-4">
        <div v-for="metric in [{ value: modelCount, label: '已适配模型' }, { value: providerCount, label: '主流供应商' }, { value: '4K', label: '最高清晰度' }, { value: '30s', label: '最长片段' }]" :key="metric.label" class="border-b border-r border-default p-4 text-center last:border-r-0 md:border-b-0 md:p-5">
          <strong class="block text-2xl font-650 text-highlighted">{{ metric.value }}</strong><span class="mt-1 block text-xs text-dimmed">{{ metric.label }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

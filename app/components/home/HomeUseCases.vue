<script setup lang="ts">
const cases = [
  { image: '/images/usecase-anime.webp', tag: '二次元', title: '角色与场景连续生成', description: '设定图锁定外观，生成剧情片段与战斗镜头。' },
  { image: '/images/usecase-scifi.webp', tag: '科幻短剧', title: '低成本完成高概念镜头', description: '剧本生成太空、未来城市与外星生物画面。' },
  { image: '/images/usecase-ecommerce-v2.webp', tag: '电商素材', title: '批量测试商品卖点视频', description: '锁定商品外观，高质量产出多平台展示素材。' },
  { image: '/images/usecase-knowledge-v2.webp', tag: '知识科普', title: '把抽象概念做成动态画面', description: '将科学与历史转化为生动镜头，配合旁白成片。' },
]
</script>

<template>
  <section class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p class="type-kicker">
          USE CASES
        </p><h2 class="type-section-title mt-2">
          从灵感到可发布内容
        </h2>
      </div><UButton to="/studio" color="neutral" variant="link" trailing-icon="i-lucide-arrow-right">
        开始你的项目
      </UButton>
    </div>
    <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <article v-for="item in cases" :key="item.title" class="group overflow-hidden rounded-2xl border border-default bg-elevated shadow-soft">
        <div class="aspect-[4/3] overflow-hidden bg-muted">
          <img :src="item.image" :alt="item.title" class="size-full object-cover transition duration-500 group-hover:scale-105">
        </div>
        <div class="p-4">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-signal-500">{{ item.tag }}</span><h3 class="mt-2 font-650 text-highlighted">
            {{ item.title }}
          </h3><p class="mt-2 text-xs leading-6 text-muted">
            {{ item.description }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

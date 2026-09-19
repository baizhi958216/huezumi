<script setup lang="ts">
const { user } = useAuth()
const pillars = computed(() => [
  {
    icon: 'i-lucide-file-text',
    code: '故事本',
    title: '写一个故事',
    description: '冒险从哪一天开始？写下故事开头，整理大纲、对白与分镜，慢慢写出你想讲的那一篇。',
    tags: ['故事大纲', '分镜脚本', '对白与运镜'],
    link: '/studio',
    actionText: '进入剧本工作台',
  },
  {
    icon: 'i-lucide-user-check',
    code: '角色簿',
    title: '认识一个角色',
    description: '喜欢什么、害怕什么、有什么小习惯？把外貌和性格写进人物设定，让故事里的主角更鲜明。',
    tags: ['外貌设定', '性格与愿望', '世界观设定'],
    link: '/studio',
    actionText: '规划角色档案',
  },
  {
    icon: 'i-lucide-palette',
    code: '画面集',
    title: '想象一幅画面',
    description: '收藏脑海里的颜色和风景，整理画面提示词。图片生成与节点工作流目前仅向管理员开放。',
    tags: ['风格探索', '画面提示词', '管理员工作流'],
    link: user.value?.role === 'admin' ? '/studio/workflow' : '/studio',
    actionText: user.value?.role === 'admin' ? '打开高级工作流' : '构思视觉灵感',
  },
  {
    icon: 'i-lucide-clapperboard',
    code: '放映室',
    title: '留下一段视频',
    description: '让角色转身，让云朵飘过屋顶。用文字或参考图生成视频，可用的画幅、时长和输入方式随模型而异。',
    tags: ['文生视频', '首尾帧连贯', '多种模型'],
    link: '/studio/video',
    actionText: '进入视频生成台',
  },
])
</script>

<template>
  <section class="home-section pillars-section" aria-labelledby="creation-heading">
    <div class="home-section-header">
      <div>
        <span class="section-kicker">✦ 小宇宙创作指南</span>
        <h2 id="creation-heading" class="section-title">
          你的小宇宙，<br>
          想从哪一页开始？
        </h2>
      </div>
      <p class="section-lead">
        不必一次想好整个世界。先写一段故事，或试一个镜头，下一页可以慢慢来。
      </p>
    </div>

    <!-- 四种创作方向共用淡彩手帐页 -->
    <div class="editorial-pillars">
      <article
        v-for="(pillar, index) in pillars"
        :key="pillar.title"
        class="editorial-pillar"
      >
        <div class="editorial-pillar__meta">
          <span class="editorial-pillar__index">0{{ index + 1 }}</span>
          <span class="editorial-pillar__icon"><UIcon :name="pillar.icon" class="size-5" /></span>
        </div>

        <span class="editorial-pillar__code">{{ pillar.code }}</span>
        <h3 class="editorial-pillar__title">
          {{ pillar.title }}
        </h3>
        <p class="editorial-pillar__description">
          {{ pillar.description }}
        </p>

        <div class="editorial-pillar__tags">
          <span v-for="tag in pillar.tags" :key="tag" class="editorial-pillar__tag">
            {{ tag }}
          </span>
        </div>

        <NuxtLink :to="pillar.link" class="editorial-pillar__link focus-ring">
          <span>{{ pillar.actionText }}</span>
          <UIcon name="i-lucide-arrow-up-right" class="size-4" />
        </NuxtLink>
      </article>
    </div>
  </section>
</template>

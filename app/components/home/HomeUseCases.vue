<script setup lang="ts">
const cases = [
  {
    image: '/images/huixiaozhou-tech.webp',
    tag: '科幻概念',
    pipeline: '深空场景 · 慢速推近',
    title: '住在星际温室的小机器人',
    description: '小机器人每天给花浇水，也偷偷观察窗外的星球。今天，它发现了一颗从没见过的新芽。',
    alt: '暖色三维风格的小机器人在太空温室照料植物，窗外是一颗杏色星球',
    badge: '3D CINEMATIC',
  },
  {
    image: '/images/huixiaozhou-daily.webp',
    tag: '治愈日常',
    pipeline: '生活短剧 · 暖光中景',
    title: '今天的面包，闻起来像晴天',
    description: '面粉落在围裙上，小狗守着刚出炉的面包。把普通的一天，画成想要收藏的日常。',
    alt: '水粉插画：卷发女子在阳光厨房里闭眼大笑着揉面，一只腊肠犬在旁等待',
    badge: 'ANIME GOUACHE',
  },
  {
    image: '/images/huixiaozhou-anime.webp',
    tag: '奇幻番剧',
    pipeline: '角色高光 · 浅景深特写',
    title: '在树洞图书馆，遇见你',
    description: '地图上没有标注这间图书馆。直到一只金色飞蛾落在鼻尖，冒险才悄悄翻开下一页。',
    alt: '二次元狐耳青年在树洞图书馆里惊讶地看着落在鼻尖的金色飞蛾，手中拿着地图',
    badge: 'FANTASY ANIME',
  },
  {
    image: '/images/huixiaozhou-real.webp',
    tag: '纪实质感',
    pipeline: '电影写实 · 慢动作微距',
    title: '午后陶艺室',
    description: '阳光一点点挪过窗台，手中的泥土慢慢变成一只碗。有些故事，就藏在安静的时刻里。',
    alt: 'AI 写实概念图：银发陶艺师神情专注地制作陶碗，午后阳光照进朴素工作室',
    badge: 'ULTRA REALISTIC',
  },
]
</script>

<template>
  <section class="home-section gallery-section" aria-labelledby="gallery-heading">
    <div class="home-section-header">
      <div>
        <span class="section-kicker">✦ 灵感漫游</span>
        <h2 id="gallery-heading" class="section-title">
          下一站，<br>
          去你想象中的世界。
        </h2>
      </div>
      <div>
        <p class="section-lead">
          喜欢二次元，也可以喜欢生活本来的样子。下面是 AI 创意示意图，给你的故事一些画面灵感。
        </p>
        <NuxtLink to="/studio" class="section-action-link focus-ring">
          <span>构思我的世界</span>
          <UIcon name="i-lucide-arrow-up-right" class="size-4" />
        </NuxtLink>
      </div>
    </div>

    <!-- 开放式艺术展陈画廊 (无外层卡片框体，沉浸大画幅图注) -->
    <div class="gallery-exhibition">
      <figure v-for="(item, index) in cases" :key="item.title" class="gallery-piece">
        <div class="gallery-piece__motion">
          <div class="gallery-piece__viewport">
            <img
              :src="item.image"
              :alt="item.alt"
              width="1448"
              height="1086"
              loading="lazy"
              decoding="async"
              class="gallery-piece__img"
            >
            <div class="gallery-piece__tags">
              <span class="gallery-tag gallery-tag--type">{{ item.tag }}</span>
            </div>
          </div>

          <figcaption class="gallery-piece__caption">
            <div class="gallery-piece__header">
              <span class="gallery-piece__index">0{{ index + 1 }}</span>
              <h3 class="gallery-piece__title">
                {{ item.title }}
              </h3>
            </div>
            <p class="gallery-piece__description">
              {{ item.description }}
            </p>
          </figcaption>
        </div>
      </figure>
    </div>
  </section>
</template>

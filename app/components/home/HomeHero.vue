<script setup lang="ts">
const inspirations = [
  {
    label: '故事',
    icon: 'i-lucide-file-text',
    category: '写下故事的开头',
    title: '《星球邮局》· 今天有一封寄给月亮的信',
    text: '小邮差第一次独自出发，收件地址却是一颗会移动的月亮。从这个开头继续写，补上旅伴、对白和沿途的奇遇。',
    to: '/studio',
    action: '进入剧本创作',
    badge: 'STORY SCRIPT',
  },
  {
    label: '角色',
    icon: 'i-lucide-user-check',
    category: '认识你的主角',
    title: '艾兰，一位有点迷糊的狐耳制图师',
    text: '铜色头发、珊瑚围巾，记得每颗星星的名字，却总忘记钥匙放在哪里。写下外貌、性格和愿望，让角色有自己的故事。',
    to: '/studio',
    action: '建立角色人设',
    badge: 'CHARACTER PROFILE',
  },
  {
    label: '画面',
    icon: 'i-lucide-palette',
    category: '描绘喜欢的风景',
    title: '想开一家，云朵上的面包店',
    text: '杏色屋顶、奶油云朵，窗边趴着一只等面包的小猫。先记录颜色、光线与场景细节，整理成下一次创作的画面提示词。',
    to: '/studio',
    action: '构思画面',
    badge: 'VISUAL CONCEPT',
  },
  {
    label: '视频',
    icon: 'i-lucide-video',
    category: '让这一刻动起来',
    title: '风吹过，她回头向你挥了挥手',
    text: '围巾轻轻飘起，午后的阳光落在发梢。用文字描述动作，或带上一张参考图，选择模型后试着生成这段短镜头。',
    to: '/studio/video',
    action: '试着生成视频',
    badge: 'VIDEO GENERATION',
  },
]
const selected = ref(0)
const inspiration = computed(() => inspirations[selected.value]!)
</script>

<template>
  <section class="hero-section">
    <div class="hero-container">
      <div class="hero-content">
        <div class="hero-badge">
          <span aria-hidden="true">✦</span>
          <span>每个小小的灵感，都值得被看见</span>
        </div>

        <h1 class="hero-title">
          创作属于自己的<br>
          <span class="hero-title__highlight">小宇宙</span><span class="hero-title__star" aria-hidden="true">✧</span>
        </h1>

        <p class="hero-description">
          写一个故事，遇见一个角色。<br>
          让脑海里的画面，变成会动的奇妙世界。<br>
          这里是绘小宙，你的 AI 灵感游乐园。
        </p>

        <div class="hero-actions">
          <UButton
            to="/studio"
            size="xl"
            trailing-icon="i-lucide-sparkles"
            class="px-7 py-3 font-semibold shadow-md transition-transform hover:-translate-y-0.5"
          >
            开启我的小宇宙
          </UButton>
          <UButton
            to="#inspiration"
            size="xl"
            color="neutral"
            variant="outline"
            class="px-6 py-3 font-semibold transition-transform hover:-translate-y-0.5"
          >
            找一点灵感
          </UButton>
        </div>

        <p class="hero-meta">
          从一句「我想……」开始，就很好。
        </p>
      </div>

      <HomeArtDeck />
    </div>

    <!-- 开放式灵感探索导演台 (无卡片外壳，纯净排版) -->
    <div id="inspiration" class="hero-cue-strip">
      <div class="hero-cue-strip__header">
        <div class="hero-cue-strip__title-wrap">
          <span class="section-kicker">灵感手帐 / 从哪里开始</span>
          <h2 class="hero-cue-strip__title">
            今天，想创造什么？
          </h2>
        </div>
        <div class="hero-cue-tabs" role="group" aria-label="选择创作方向">
          <button
            v-for="(item, index) in inspirations"
            :key="item.label"
            type="button"
            :aria-pressed="selected === index"
            :class="{ 'is-active': selected === index }"
            class="hero-cue-tab focus-ring"
            @click="selected = index"
          >
            <UIcon :name="item.icon" class="size-4" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>

      <div class="hero-cue-display" aria-live="polite">
        <div class="hero-cue-display__body">
          <div class="hero-cue-display__meta">
            <span class="hero-cue-display__badge">{{ inspiration.badge }}</span>
            <span class="hero-cue-display__category">{{ inspiration.category }}</span>
          </div>
          <h3 class="hero-cue-display__title">
            {{ inspiration.title }}
          </h3>
          <p class="hero-cue-display__text">
            {{ inspiration.text }}
          </p>
        </div>

        <div class="hero-cue-display__action">
          <UButton
            :to="inspiration.to"
            color="primary"
            variant="soft"
            trailing-icon="i-lucide-arrow-right"
            class="font-semibold px-6 py-2.5 hover:shadow-sm"
          >
            {{ inspiration.action }}
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>

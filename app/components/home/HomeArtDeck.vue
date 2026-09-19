<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { gsap } from 'gsap'

const artworks = [
  { id: 'pink', label: '樱色幻想', src: '/images/hero-pink.webp', alt: '白发高马尾、粉色蝴蝶结的少女，穿白粉外套站在樱花浮空城中', sticker: '把星光，放进掌心 ✧', title: '你的角色，有了自己的世界' },
  { id: 'ocean', label: '蓝色星海', src: '/images/hero-ocean.webp', alt: '小宇航员乘透明蓝色蝠鲼探索海洋观测站', sticker: '下一站，深蓝宇宙', title: '潜入一场蓝色的梦' },
  { id: 'forest', label: '翠绿绘本', src: '/images/hero-forest.webp', alt: '小熊猫植物学家背着玻璃花园，探索翠绿蕨类森林', sticker: '森林里，有新朋友 ✿', title: '在绿意里，发现另一种日常' },
  { id: 'anime', label: '暖色二次元', src: '/images/huixiaozhou-universe.png', alt: '少女和小猫坐在花朵覆盖的小星球上', sticker: '今日份灵感 +1 ✦', title: '小小的脑洞，大大的世界' },
  { id: 'clay', label: '毛毡微缩', src: '/images/hero-clay.webp', alt: '毛毡小兔邮差和桃色飞船', sticker: '有一封来自星星的信', title: '把奇遇，寄给明天的你' },
  { id: 'watercolor', label: '水彩花园', src: '/images/hero-watercolor.webp', alt: '卷发旅人与水豚在浮岛茶园照料花朵', sticker: '慢一点，花会开 ✿', title: '在云端，种一座小花园' },
  { id: 'paper', label: '立体纸雕', src: '/images/hero-paper.webp', alt: '纸雕狐狸乘纸船驶向云端城堡', sticker: '带一颗星星出发 ✧', title: '折一只船，去故事里旅行' },
]
const selected = ref(0)
const artwork = computed(() => artworks[selected.value]!)
const root = useTemplateRef('root')
const motion = usePreferredReducedMotion()
const loaded = ref<boolean[]>(artworks.map(() => false))
const failed = ref<boolean[]>(artworks.map(() => false))
const attempts = ref<number[]>(artworks.map(() => 0))
let timeline: gsap.core.Timeline | undefined

function pose(index: number, active: number) {
  let offset = (index - active + artworks.length) % artworks.length
  if (offset > artworks.length / 2)
    offset -= artworks.length
  const distance = Math.abs(offset)
  return {
    x: 0,
    y: 0,
    xPercent: offset === 0 ? 0 : Math.sign(offset) * (14 + (distance - 1) * 6),
    yPercent: distance * -3,
    rotation: offset * 3,
    scale: 1 - distance * 0.055,
    zIndex: artworks.length - distance,
  }
}
// Vue owns only immutable CSS variables; GSAP exclusively owns live transforms.
const initialStyles = artworks.map((_, index) => {
  const p = pose(index, 0)
  return { '--start-x': `${p.xPercent}%`, '--start-y': `${p.yPercent}%`, '--start-angle': `${p.rotation}deg`, '--start-scale': p.scale, '--start-layer': p.zIndex }
})
function arrange() {
  timeline?.kill()
  root.value?.querySelectorAll<HTMLElement>('.art-deck__card').forEach((card, index) => gsap.set(card, pose(index, selected.value)))
  if (root.value)
    gsap.set(root.value.querySelectorAll('.art-deck__note'), { clearProps: 'opacity,visibility,transform' })
}
function selectCard(index: number, direction = 1) {
  const next = (index + artworks.length) % artworks.length
  if (next === selected.value || !root.value)
    return
  timeline?.kill()
  selected.value = next
  if (motion.value === 'reduce') {
    arrange()
    return
  }
  const cards = Array.from(root.value.querySelectorAll<HTMLElement>('.art-deck__card'))
  const incoming = cards[next]
  timeline = gsap.timeline()
  // Lift the chosen card clear of the stack before bringing it to the front.
  if (incoming) {
    timeline.to(incoming, { xPercent: direction * 38, yPercent: -12, rotation: direction * 14, scale: 0.97, duration: 0.24, ease: 'power2.out' }, 0)
    timeline.set(incoming, { zIndex: artworks.length + 1 }, 0.24)
  }
  cards.forEach((card, i) => {
    const { zIndex, ...target } = pose(i, next)
    if (i !== next)
      timeline?.set(card, { zIndex }, 0.24)
    timeline?.to(card, { ...target, duration: 0.52, ease: 'back.out(1.15)' }, i === next ? 0.24 : 0.12)
  })
  timeline.fromTo(root.value.querySelectorAll('.art-deck__note'), { y: 10, autoAlpha: 0, rotation: -3 }, { y: 0, autoAlpha: 1, rotation: 0, duration: 0.4, stagger: 0.06, ease: 'back.out(1.4)' }, 0.28)
}
function retry() {
  failed.value[selected.value] = false
  loaded.value[selected.value] = false
  attempts.value[selected.value] = (attempts.value[selected.value] ?? 0) + 1
}
onMounted(() => {
  arrange()
  // Cached images may finish before hydration attaches their load listeners.
  root.value?.querySelectorAll<HTMLButtonElement>('.art-deck__card').forEach((card, index) => {
    const image = card.querySelector('img')
    if (image?.complete) {
      loaded.value[index] = image.naturalWidth > 0
      failed.value[index] = image.naturalWidth === 0
    }
  })
})
watch(motion, arrange)
onBeforeUnmount(() => {
  timeline?.kill()
  if (root.value)
    gsap.killTweensOf(root.value.querySelectorAll('.art-deck__card, .art-deck__note'))
})
</script>

<template>
  <div ref="root" class="art-deck" aria-label="小宇宙插画卡片">
    <div class="art-deck__pile" role="group" aria-label="点击卡片带到前面">
      <button
        v-for="(item, index) in artworks"
        :key="item.id"
        class="art-deck__card focus-ring"
        :class="{ 'is-selected': selected === index }"
        :style="initialStyles[index]"
        type="button"
        :aria-label="`查看${item.label}卡片`"
        :aria-pressed="selected === index"
        @click="selectCard(index, pose(index, selected).xPercent < 0 ? -1 : 1)"
      >
        <img
          v-if="!failed[index]"
          :key="attempts[index]"
          :src="item.src"
          :alt="item.alt"
          width="1254"
          height="1254"
          :fetchpriority="index === 0 ? 'high' : 'low'"
          @load="loaded[index] = true"
          @error="failed[index] = true"
        >
        <span v-if="!loaded[index] || failed[index]" class="art-deck__image-status">{{ failed[index] ? '图片暂不可用' : '正在展开画面…' }}</span>
        <span class="art-deck__card-label">{{ item.label }}</span>
      </button>
    </div>
    <div class="art-deck__notes" :class="{ 'is-reversed': selected % 2 === 1 }">
      <span class="art-deck__note art-deck__sticker" aria-hidden="true">{{ artwork.sticker }}</span>
      <div class="art-deck__note art-deck__caption" aria-live="polite" aria-atomic="true">
        <strong>{{ artwork.title }}</strong>
        <span>{{ artwork.label }} · AI 概念插画</span>
      </div>
    </div>
    <div class="art-deck__controls">
      <button class="art-deck__arrow art-deck__arrow--left focus-ring" type="button" aria-label="上一张插画" @click="selectCard(selected - 1, -1)">
        <img src="/images/deck-arrow-left-v2.png" alt="" width="96" height="96">
      </button>
      <div class="art-deck__hint">
        <span>{{ String(selected + 1).padStart(2, '0') }} / {{ String(artworks.length).padStart(2, '0') }}</span>
        <span>点一张卡片，换一个世界</span>
        <UButton v-if="failed[selected]" size="xs" variant="soft" @click="retry">
          重新加载图片
        </UButton>
      </div>
      <button class="art-deck__arrow art-deck__arrow--right focus-ring" type="button" aria-label="下一张插画" @click="selectCard(selected + 1)">
        <img src="/images/deck-arrow-right-v2.png" alt="" width="96" height="96">
      </button>
    </div>
  </div>
</template>

<style scoped>
.art-deck {
  position: relative;
  min-width: 0;
  padding-top: 3rem;
}
.art-deck__pile {
  position: relative;
  aspect-ratio: 1 / 1.04;
  isolation: isolate;
}
.art-deck__card {
  position: absolute;
  left: 22%;
  top: 7%;
  width: 56%;
  height: 78%;
  padding: 0.6rem;
  border: 1px solid var(--ui-border);
  border-radius: 48% 52% 23% 19% / 35% 43% 19% 24%;
  background: var(--ui-bg-elevated);
  box-shadow: var(--shadow-lift);
  transform: translate(var(--start-x), var(--start-y)) rotate(var(--start-angle)) scale(var(--start-scale));
  z-index: var(--start-layer);
  transform-origin: 50% 80%;
  cursor: pointer;
  overflow: hidden;
}
.art-deck__card:nth-child(3n + 2) {
  border-radius: 42% 58% 38% 25% / 47% 34% 27% 24%;
}
.art-deck__card:nth-child(3n) {
  border-radius: 58% 42% 25% 38% / 37% 48% 22% 30%;
}
.art-deck__card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  background: #f3eefe;
}
.art-deck__card-label {
  position: absolute;
  bottom: 1.2rem;
  left: 50%;
  translate: -50% 0;
  white-space: nowrap;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
  font-size: 0.7rem;
}
.art-deck__card:focus-visible {
  outline: 3px solid var(--ui-primary);
  outline-offset: 3px;
}
.art-deck__image-status {
  position: absolute;
  inset: 25% 10%;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
}
.art-deck__notes {
  position: absolute;
  inset: 3rem 0 7rem;
  pointer-events: none;
  z-index: 10;
}
.art-deck__note {
  position: absolute;
  padding: 0.8rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 1.25rem;
  background: var(--ui-bg-elevated);
  box-shadow: var(--shadow-card);
}
.art-deck__sticker {
  top: 6%;
  right: 2%;
  color: var(--ui-primary);
  font-size: 0.85rem;
  rotate: 7deg;
}
.art-deck__caption {
  left: 3%;
  bottom: 0;
  display: grid;
  gap: 0.3rem;
  rotate: -5deg;
  max-width: 85%;
}
.art-deck__caption strong {
  font-size: 1rem;
  color: var(--ui-text-highlighted);
}
.art-deck__caption span {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}
.is-reversed .art-deck__sticker {
  left: 2%;
  right: auto;
  rotate: -7deg;
}
.is-reversed .art-deck__caption {
  right: 3%;
  left: auto;
  rotate: 5deg;
}
.art-deck__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.25rem;
  z-index: 11;
}
.art-deck__arrow {
  position: absolute;
  top: 49%;
  z-index: 11;
  translate: 0 -50%;
  flex: none;
  width: 4.5rem;
  height: 4.5rem;
  border: 0;
  border-radius: 1rem;
  background: transparent;
  cursor: pointer;
  transition: transform 180ms ease;
}
.art-deck__arrow--left {
  left: -1%;
}
.art-deck__arrow--right {
  right: -1%;
}
.art-deck__arrow:hover {
  transform: translateY(-3px) rotate(-6deg);
}
.art-deck__arrow:active {
  transform: scale(0.9);
}
.art-deck__arrow img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.art-deck__hint {
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}
.art-deck__hint > span:first-child {
  color: var(--ui-primary);
  letter-spacing: 0.15em;
}
@media (max-width: 640px) {
  .art-deck {
    padding-top: 1.5rem;
  }
  .art-deck__card {
    padding: 0.35rem;
  }
  .art-deck__notes {
    top: 1.5rem;
    bottom: 6rem;
  }
  .art-deck__note {
    padding: 0.55rem 0.75rem;
  }
  .art-deck__sticker {
    font-size: 0.7rem;
    top: 0;
  }
  .art-deck__caption strong {
    font-size: 0.8rem;
  }
  .art-deck__caption span {
    font-size: 0.65rem;
  }
  .art-deck__arrow {
    width: 3.75rem;
    height: 3.75rem;
  }
  .art-deck__card-label {
    bottom: 0.8rem;
    font-size: 0.6rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .art-deck__arrow {
    transition: none;
  }
}
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'

interface ScrollVelocityProps {
  /** 循环滚动的词条 */
  items: string[]
  /** 基础速度（像素/秒），正负号决定方向 */
  baseVelocity?: number
  /** 滚动速度对条带速度的增益 */
  scrollBoost?: number
  className?: string
}

const props = withDefaults(defineProps<ScrollVelocityProps>(), {
  baseVelocity: 42,
  scrollBoost: 5,
  className: '',
})

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const contentRef = useTemplateRef<HTMLDivElement>('contentRef')
const offset = ref(0)

let rafId = 0
let lastTime = 0
let lastScrollY = 0
let scrollVelocity = 0
let loopedWidth = 0
let reduceMotion = false

function measure() {
  if (!contentRef.value || !containerRef.value)
    return
  // 内容重复 3 份，取 1/3 宽度作为循环周期
  loopedWidth = contentRef.value.scrollWidth / 3
  containerRef.value.style.width = '100%'
}

function tick(time: number) {
  if (!lastTime)
    lastTime = time
  const dt = Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  scrollVelocity *= 0.92
  const speed = props.baseVelocity * (1 + Math.min(Math.abs(scrollVelocity) * props.scrollBoost / 100, 6))
  const direction = props.baseVelocity >= 0 ? 1 : -1
  offset.value -= speed * dt * direction

  if (loopedWidth > 0) {
    if (offset.value <= -loopedWidth)
      offset.value += loopedWidth
    if (offset.value > 0)
      offset.value -= loopedWidth
  }

  if (contentRef.value)
    contentRef.value.style.transform = `translate3d(${offset.value}px, 0, 0)`

  rafId = requestAnimationFrame(tick)
}

function onScroll() {
  const y = window.scrollY
  scrollVelocity = scrollVelocity + (y - lastScrollY)
  lastScrollY = y
}

onMounted(() => {
  measure()
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', onScroll, { passive: true })
  lastScrollY = window.scrollY
  if (!reduceMotion)
    rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div ref="containerRef" class="overflow-hidden whitespace-nowrap" :class="props.className" aria-hidden="true">
    <div ref="contentRef" class="inline-flex items-center will-change-transform">
      <template v-for="copy in 3" :key="copy">
        <span
          v-for="(item, index) in props.items"
          :key="`${copy}-${index}`"
          class="inline-flex items-center"
        >
          <span class="px-5">{{ item }}</span>
          <span class="inline-block h-1 w-1 rounded-full bg-current opacity-30" />
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<SplitTextProps>(), {
  className: '',
  delay: 0,
  duration: 0.7,
  stagger: 0.022,
  ease: 'power3.out',
  distance: 26,
  threshold: 0.12,
})

gsap.registerPlugin(ScrollTrigger)

interface SplitTextProps {
  /** 要展示的文字，按字符切分（适配中文） */
  text: string
  className?: string
  delay?: number
  duration?: number
  stagger?: number
  ease?: string
  /** 每个字符的初始位移（像素） */
  distance?: number
  threshold?: number
}

const containerRef = useTemplateRef<HTMLSpanElement>('containerRef')
const chars = computed(() => Array.from(props.text))
let mediaContext: ReturnType<typeof gsap.matchMedia> | null = null

onMounted(() => {
  const el = containerRef.value
  if (!el)
    return
  const targets = el.querySelectorAll('[data-char]')
  if (!targets.length)
    return

  mediaContext = gsap.matchMedia()
  mediaContext.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
    if (context.conditions?.reduceMotion) {
      gsap.set(targets, { yPercent: 0, rotateX: 0, autoAlpha: 1 })
      return
    }
    gsap.fromTo(targets, { yPercent: props.distance, rotateX: -35, autoAlpha: 0 }, {
      yPercent: 0,
      rotateX: 0,
      autoAlpha: 1,
      duration: props.duration,
      ease: props.ease,
      stagger: props.stagger,
      delay: props.delay,
      scrollTrigger: { trigger: el, start: `top ${(1 - props.threshold) * 100}%`, once: true },
    })
  }, el)
})

onUnmounted(() => {
  mediaContext?.revert()
  mediaContext = null
})
</script>

<template>
  <span
    ref="containerRef"
    class="inline-block" :class="props.className"
    :aria-label="props.text"
    role="text"
  >
    <span
      v-for="(char, index) in chars"
      :key="`${index}-${char}`"
      data-char
      class="inline-block will-change-transform"
      aria-hidden="true"
    >{{ char === ' ' ? '\u00A0' : char }}</span>
  </span>
</template>

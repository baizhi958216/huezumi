<script setup lang="ts">
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<AnimatedContentProps>(), {
  distance: 100,
  direction: 'vertical',
  reverse: false,
  duration: 0.8,
  ease: 'power3.out',
  initialOpacity: 0,
  animateOpacity: true,
  scale: 1,
  threshold: 0.1,
  delay: 0,
  className: '',
})

const emit = defineEmits<{
  complete: []
}>()

gsap.registerPlugin(ScrollTrigger)

interface AnimatedContentProps {
  distance?: number
  direction?: 'vertical' | 'horizontal'
  reverse?: boolean
  duration?: number
  ease?: string | ((progress: number) => number)
  initialOpacity?: number
  animateOpacity?: boolean
  scale?: number
  threshold?: number
  delay?: number
  className?: string
}

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
let mediaContext: ReturnType<typeof gsap.matchMedia> | null = null

onMounted(() => {
  const el = containerRef.value
  if (!el)
    return

  const axis = props.direction === 'horizontal' ? 'x' : 'y'
  const offset = props.reverse ? -props.distance : props.distance
  const startPct = (1 - props.threshold) * 100

  mediaContext = gsap.matchMedia()
  mediaContext.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
    if (context.conditions?.reduceMotion) {
      gsap.set(el, { x: 0, y: 0, scale: 1, autoAlpha: 1 })
      emit('complete')
      return
    }
    gsap.fromTo(el, {
      [axis]: offset,
      scale: props.scale,
      autoAlpha: props.animateOpacity ? props.initialOpacity : 1,
    }, {
      [axis]: 0,
      scale: 1,
      autoAlpha: 1,
      duration: props.duration,
      ease: props.ease,
      delay: props.delay,
      onComplete: () => emit('complete'),
      scrollTrigger: { trigger: el, start: `top ${startPct}%`, once: true },
    })
  }, el)
})

onUnmounted(() => {
  mediaContext?.revert()
  mediaContext = null
})
</script>

<template>
  <div ref="containerRef" class="animated-content" :class="props.className">
    <slot />
  </div>
</template>

<style scoped>
/* GSAP will handle all transforms and opacity */
</style>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

interface Position {
  x: number
  y: number
}

interface SpotlightCardProps {
  className?: string
  spotlightColor?: string
}

const { className = '', spotlightColor = 'rgba(255, 255, 255, 0.25)' } = defineProps<SpotlightCardProps>()

const divRef = useTemplateRef<HTMLDivElement>('divRef')
const isFocused = ref<boolean>(false)
const position = ref<Position>({ x: 0, y: 0 })
const opacity = ref<number>(0)

function handleMouseMove(e: MouseEvent) {
  if (!divRef.value || isFocused.value)
    return

  const rect = divRef.value.getBoundingClientRect()
  position.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function handleFocus() {
  isFocused.value = true
  opacity.value = 0.6
}

function handleBlur() {
  isFocused.value = false
  opacity.value = 0
}

function handleMouseEnter() {
  opacity.value = 0.6
}

function handleMouseLeave() {
  opacity.value = 0
}
</script>

<template>
  <div
    ref="divRef"
    class="relative overflow-hidden border rounded-lg p-6" :class="[className]"
    @mousemove="handleMouseMove"
    @focus="handleFocus"
    @blur="handleBlur"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out"
      :style="{
        opacity,
        background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
      }"
    />

    <slot />
  </div>
</template>

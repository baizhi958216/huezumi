<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'

interface DotGridProps {
  /** 点阵间距（像素） */
  gap?: number
  /** 基础点半径 */
  dotSize?: number
  /** 光标影响半径 */
  radius?: number
  /** 点的静态颜色 */
  color?: string
  /** 光标附近点的强调颜色 */
  activeColor?: string
  className?: string
}

const props = withDefaults(defineProps<DotGridProps>(), {
  gap: 26,
  dotSize: 1.2,
  radius: 150,
  color: '#d9dce1',
  activeColor: '#ff4d35',
  className: '',
})

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')

let ctx: CanvasRenderingContext2D | null = null
let width = 0
let height = 0
let dpr = 1
const mouse = { x: -9999, y: -9999 }

function resize() {
  const canvas = canvasRef.value
  if (!canvas || !canvas.parentElement)
    return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = canvas.parentElement.clientWidth
  height = canvas.parentElement.clientHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas || !ctx)
    return
  ctx.clearRect(0, 0, width, height)

  const { gap, dotSize, radius } = props
  for (let x = gap / 2; x < width; x += gap) {
    for (let y = gap / 2; y < height; y += gap) {
      const dx = x - mouse.x
      const dy = y - mouse.y
      const distance = Math.hypot(dx, dy)
      const influence = Math.max(0, 1 - distance / radius)
      const eased = influence * influence * (3 - 2 * influence)

      const size = dotSize + eased * 1.6
      ctx.globalAlpha = 0.55 + eased * 0.45
      ctx.fillStyle = eased > 0.02 ? props.activeColor : props.color
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function onPointerMove(event: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas)
    return
  const rect = canvas.getBoundingClientRect()
  mouse.x = event.clientX - rect.left
  mouse.y = event.clientY - rect.top
  draw()
}

function onPointerLeave() {
  mouse.x = -9999
  mouse.y = -9999
  draw()
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas)
    return
  ctx = canvas.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
  canvas.parentElement?.addEventListener('pointermove', onPointerMove)
  canvas.parentElement?.addEventListener('pointerleave', onPointerLeave)
  draw()
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  canvasRef.value?.parentElement?.removeEventListener('pointermove', onPointerMove)
  canvasRef.value?.parentElement?.removeEventListener('pointerleave', onPointerLeave)
})
</script>

<template>
  <canvas ref="canvasRef" class="pointer-events-none absolute inset-0" :class="props.className" aria-hidden="true" />
</template>

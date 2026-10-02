<script setup lang="ts">
import { getRectOfNodes, useVueFlow } from '@vue-flow/core'

const { getNodesInitialized, viewport, dimensions, setViewport, fitView } = useVueFlow('workflow')
const width = 140
const height = 95
const visibleNodes = computed(() => getNodesInitialized.value.filter(node => !node.hidden))
// Bounds depend only on nodes: panning must never resize the map beneath the pointer.
const bounds = computed(() => {
  const rect = getRectOfNodes(visibleNodes.value)
  const scale = Math.max((rect.width + 160) / width, (rect.height + 160) / height, 1)
  return { x: rect.x + rect.width / 2 - width * scale / 2, y: rect.y + rect.height / 2 - height * scale / 2, width: width * scale, height: height * scale }
})
const view = computed(() => ({ x: -viewport.value.x / viewport.value.zoom, y: -viewport.value.y / viewport.value.zoom, width: dimensions.value.width / viewport.value.zoom, height: dimensions.value.height / viewport.value.zoom }))
const dragging = ref(false)
let gesture: { pointerId: number, x: number, y: number, originX: number, originY: number, zoom: number, scaleX: number, scaleY: number } | undefined
function start(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary)
    return
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const scaleX = bounds.value.width / rect.width
  const scaleY = bounds.value.height / rect.height
  const x = bounds.value.x + (event.clientX - rect.left) * scaleX
  const y = bounds.value.y + (event.clientY - rect.top) * scaleY
  const inside = x >= view.value.x && x <= view.value.x + view.value.width && y >= view.value.y && y <= view.value.y + view.value.height
  const originX = inside ? viewport.value.x : dimensions.value.width / 2 - x * viewport.value.zoom
  const originY = inside ? viewport.value.y : dimensions.value.height / 2 - y * viewport.value.zoom
  gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX, originY, zoom: viewport.value.zoom, scaleX, scaleY }
  svg.setPointerCapture(event.pointerId)
  dragging.value = true
  void setViewport({ x: originX, y: originY, zoom: gesture.zoom })
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId)
    return
  void setViewport({ x: gesture.originX - (event.clientX - gesture.x) * gesture.scaleX * gesture.zoom, y: gesture.originY - (event.clientY - gesture.y) * gesture.scaleY * gesture.zoom, zoom: gesture.zoom })
}
function stop() {
  gesture = undefined
  dragging.value = false
}
function keyboard(event: KeyboardEvent) {
  const delta = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] }[event.key]
  if (delta) {
    event.preventDefault()
    void setViewport({ ...viewport.value, x: viewport.value.x - delta[0]!, y: viewport.value.y - delta[1]! })
  }
  else if (event.key === 'Home') {
    event.preventDefault()
    void fitView({ padding: 0.2, maxZoom: 1 })
  }
}
</script>

<template>
  <div class="workflow-minimap vue-flow__panel bottom right nopan nowheel" :class="{ dragging }">
    <svg :width="width" :height="height" :viewBox="`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`" tabindex="0" role="group" aria-label="工作流小地图，可拖动视野或使用方向键平移" @pointerdown.stop.prevent="start" @pointermove.stop="move" @pointerup="stop" @pointercancel="stop" @lostpointercapture="stop" @wheel.stop.prevent @dblclick.stop.prevent @keydown="keyboard">
      <rect v-for="node in visibleNodes" :key="node.id" class="workflow-minimap-node" :x="node.computedPosition.x" :y="node.computedPosition.y" :width="node.dimensions.width" :height="node.dimensions.height" rx="5" />
      <rect class="workflow-minimap-viewport" :x="view.x" :y="view.y" :width="view.width" :height="view.height" vector-effect="non-scaling-stroke" />
    </svg>
  </div>
</template>

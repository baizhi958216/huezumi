<script setup lang="ts">
interface Props {
  blur?: number
  saturation?: number
}

const props = withDefaults(defineProps<Props>(), {
  blur: 18,
  saturation: 1.22,
})

const surfaceStyle = computed(() => ({
  '--glass-blur': `${props.blur}px`,
  '--glass-saturation': props.saturation,
}))
</script>

<template>
  <div class="glass-surface" :style="surfaceStyle">
    <span class="glass-surface__lens" aria-hidden="true" />
    <slot />
  </div>
</template>

<style scoped>
.glass-surface {
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
}

.glass-surface__lens {
  position: absolute;
  z-index: -1;
  inset: 1px;
  border-radius: inherit;
  background:
    radial-gradient(80% 120% at 12% -35%, rgb(255 255 255 / 38%), transparent 58%),
    radial-gradient(55% 110% at 96% 135%, rgb(255 255 255 / 17%), transparent 64%);
  box-shadow:
    inset 0 0 0 0.5px rgb(255 255 255 / 30%),
    inset 8px 0 14px -16px rgb(255 255 255 / 85%),
    inset -8px 0 14px -16px rgb(255 255 255 / 60%);
  pointer-events: none;
}
</style>

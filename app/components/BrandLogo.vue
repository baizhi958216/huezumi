<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <span class="brand-logo" aria-label="绘小宙">
    <img src="/favicon.svg" alt="" width="36" height="36" class="brand-logo__mark" aria-hidden="true">
    <span v-if="!compact" class="brand-logo__name">绘小宙<span class="brand-logo__star" aria-hidden="true">✦</span></span>
  </span>
</template>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}
.brand-logo__mark {
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
}
.brand-logo__name {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ui-text-highlighted);
}
.brand-logo__star {
  margin-left: 0.25rem;
  color: var(--color-signal-500);
  font-size: 0.8rem;
  vertical-align: top;
}
</style>

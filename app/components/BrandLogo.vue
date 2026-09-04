<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <span class="brand-logo">
    <img
      v-if="compact"
      src="/favicon.svg"
      alt=""
      width="32"
      height="32"
      class="brand-logo__mark"
      aria-hidden="true"
    >
    <img
      v-else
      src="/images/forkvdo-logo-nav.png"
      alt="forkvdo"
      width="2029"
      height="530"
      class="brand-logo__wordmark"
    >
  </span>
</template>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
}

.brand-logo__mark {
  width: 2rem;
  height: 2rem;
  flex: none;
}

.brand-logo__wordmark {
  width: auto;
  height: 1.9rem;
  transition: filter 180ms ease;
}

:global(.dark) .brand-logo__wordmark {
  filter: invert(1) hue-rotate(180deg) brightness(1.1);
}
</style>

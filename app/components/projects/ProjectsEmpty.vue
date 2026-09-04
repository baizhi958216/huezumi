<script setup lang="ts">
defineProps<{ filtered: boolean }>()
const emit = defineEmits<{ reset: [] }>()
</script>

<template>
  <section class="my-12 flex flex-col items-center rounded-3xl border border-dashed border-default bg-elevated/60 px-6 py-20 text-center">
    <span class="grid size-14 place-items-center rounded-2xl bg-muted text-muted"><UIcon :name="filtered ? 'i-lucide-search-x' : 'i-lucide-film'" class="size-6" /></span>
    <h2 class="mt-5 text-xl font-650 text-highlighted">
      {{ filtered ? '没有匹配的作品' : '你的第一部作品，正在等你开始' }}
    </h2><p class="mt-2 max-w-lg text-sm leading-7 text-muted">
      {{ filtered ? '换个关键词，或清除筛选条件试试看。' : '从一段文字、一个画面或一份参考素材开始，让灵感变成可以播放的故事。' }}
    </p>
    <UButton v-if="filtered" class="mt-6" color="neutral" variant="outline" @click="emit('reset')">
      清除筛选
    </UButton><UButton v-else class="mt-6" to="/studio" icon="i-lucide-plus">
      进入创作台
    </UButton>
  </section>
</template>

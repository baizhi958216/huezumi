<script setup lang="ts">
import { getStudioNavigation } from '~/utils/app-navigation'

const route = useRoute()
const { user } = useAuth()
const navigation = computed(() => getStudioNavigation(user.value?.role))
</script>

<template>
  <div class="studio-workspace">
    <div class="creation-content">
      <header class="studio-workspace__header">
        <div>
          <h1 class="studio-workspace__title">
            创作台
          </h1>
          <p class="mt-1 text-sm text-muted">
            从一个想法，到一件作品。
          </p>
        </div>
        <nav class="studio-navigation" aria-label="创作类型">
          <NuxtLink v-for="item in navigation" :key="item.to" :to="item.to" class="studio-navigation__item" :class="{ 'is-active': route.path === item.to }" :aria-current="route.path === item.to ? 'page' : undefined">
            <UIcon :name="item.icon" class="size-4 shrink-0" />
            {{ item.label }}
          </NuxtLink>
        </nav>
      </header>
      <div class="studio-workspace__grid">
        <section class="studio-workspace__input" aria-label="创作设置">
          <slot name="composer" />
        </section>
        <section class="studio-workspace__output" aria-label="创作结果">
          <slot />
        </section>
      </div>
    </div>
    <slot name="dialogs" />
  </div>
</template>

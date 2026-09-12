<template>
  <div class="min-h-screen bg-default text-highlighted">
    <a href="#main-content" class="skip-link">跳到主要内容</a>
    <AppHeader />

    <main id="main-content" class="app-main" tabindex="-1">
      <slot />
    </main>
  </div>
</template>

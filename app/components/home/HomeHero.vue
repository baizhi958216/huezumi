<script setup lang="ts"></script>

<template>
  <section class="hero-section">
    <div class="hero-container">
      <div class="hero-content">
        <div class="hero-badge">
          <span aria-hidden="true">✦</span>
          <span>每个小小的灵感，都值得被看见</span>
        </div>

        <h1 class="hero-title">
          创作属于自己的<br>
          <span class="hero-title__highlight">小宇宙</span><span class="hero-title__star" aria-hidden="true">✧</span>
        </h1>

        <p class="hero-description">
          写一个故事，遇见一个角色。<br>
          让脑海里的画面，变成会动的奇妙世界。<br>
          这里是绘小宙，你的 AI 灵感游乐园。
        </p>

        <div class="hero-actions">
          <UButton
            to="/studio"
            size="xl"
            trailing-icon="i-lucide-sparkles"
            class="px-7 py-3 font-semibold shadow-md transition-transform hover:-translate-y-0.5"
          >
            开启我的小宇宙
          </UButton>
          <UButton
            to="#inspiration"
            size="xl"
            color="neutral"
            variant="outline"
            class="px-6 py-3 font-semibold transition-transform hover:-translate-y-0.5"
          >
            找一点灵感
          </UButton>
        </div>

        <p class="hero-meta">
          从一句「我想……」开始，就很好。
        </p>
      </div>

      <HomeArtDeck />
    </div>
  </section>
</template>

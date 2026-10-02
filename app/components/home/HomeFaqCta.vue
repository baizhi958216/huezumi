<script setup lang="ts">
const items = [
  {
    label: '如何快速上手使用绘小宙？',
    content: '你可以从「剧本工作台」开始，梳理故事脉络、分镜大纲与角色人设；也可以直接进入「视频生成」，挑选心仪的模型，输入文字或参考图生成动态镜头。保存的文本与生成的视频可以在作品库中查看。',
  },
  {
    label: '支持哪些生成模式？是否支持首尾帧与参考图？',
    content: '平台支持纯文字提示词生成、首帧引导生成、首尾双关键帧过渡运动，以及多参考图/参考素材生成。具体支持的输入类型因所选模型而异，在模型目录和创作台中有明确能力标识。',
  },
  {
    label: '哪些用户可以使用图片生成？',
    content: '登录后可在创作台使用图片生成，输入画面描述或上传参考图即可创作。',
  },
  {
    label: '生成任务的计费规则与额度是如何结算的？',
    content: '每次提交生成前，系统会根据所选模型、清晰度与生成时长调用报价引擎，给出透明报价。用户确认后预留相应额度；若生成失败将自动释放额度，账目清晰可审计。',
  },
  {
    label: '我的作品存在哪里？可以下载吗？',
    content: '生成的视频会保存到你的作品库。归档完成后，可以回来播放、查看生成参数和下载文件；如果归档未完成，页面会显示对应状态。',
  },
]
</script>

<template>
  <section class="home-section faq-section" aria-labelledby="faq-heading">
    <div class="faq-container">
      <div class="faq-layout">
        <div class="faq-intro">
          <span class="section-kicker">✦ 出发前的小问答</span>
          <h2 id="faq-heading" class="section-title">
            第一次来？<br>
            这几件事可以先了解。
          </h2>
          <p class="section-lead">
            从哪里开始、生成怎么收费、作品去哪里找，都在这里。
          </p>
          <div class="faq-intro__tips">
            <UIcon name="i-lucide-help-circle" class="size-4 text-primary shrink-0" />
            <span>生成前可随时查看实时报价与可用模型状态</span>
          </div>
        </div>

        <div class="faq-content">
          <UAccordion
            :items="items"
            default-value="0"
            class="faq-accordion"
            :ui="{
              item: 'faq-accordion-item',
              trigger: 'faq-accordion-trigger',
              label: 'faq-accordion-label',
              body: 'faq-accordion-body',
            }"
          >
            <template #leading="{ index, open }">
              <span class="faq-step-num" :class="{ 'is-open': open }" aria-hidden="true">0{{ index + 1 }}</span>
            </template>
            <template #trailing="{ open }">
              <span class="faq-toggle-icon" :class="{ 'is-open': open }" aria-hidden="true">
                <UIcon :name="open ? 'i-lucide-minus' : 'i-lucide-plus'" class="size-4" />
              </span>
            </template>
          </UAccordion>
        </div>
      </div>

      <!-- 开放式全宽沉浸终局 (无浮动卡片框，自然呼吸与纯净排版) -->
      <div class="page-finale">
        <div class="page-finale__inner">
          <img src="/images/huixiaozhou-anime.webp" alt="" width="1448" height="1086" loading="lazy" class="page-finale__art" aria-hidden="true">
          <div class="page-finale__badge">
            <UIcon name="i-lucide-sparkles" class="size-3.5" />
            <span>你的故事，未完待续</span>
          </div>

          <h3 class="page-finale__title">
            你的小宇宙，今天开始连载。
          </h3>
          <p class="page-finale__subtitle">
            一个角色，一页故事，一段想留下的画面。先从你最想创作的开始。
          </p>

          <div class="page-finale__actions">
            <UButton
              to="/studio"
              size="xl"
              trailing-icon="i-lucide-arrow-up-right"
              class="px-8 py-3 font-semibold shadow-md transition-transform hover:-translate-y-0.5"
            >
              进入创作工作台
            </UButton>
            <UButton
              to="/projects"
              size="xl"
              color="neutral"
              variant="outline"
              leading-icon="i-lucide-folder"
              class="px-7 py-3 font-semibold transition-transform hover:-translate-y-0.5"
            >
              查看我的作品库
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

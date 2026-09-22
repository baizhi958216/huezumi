<script setup lang="ts">
const steps = [
  {
    number: '01',
    phase: '第一站 · 故事发芽',
    title: '先写下想讲的故事',
    description: '写下故事发生在哪里、谁遇到了什么事，再补上对白与场景。生成的文字可以继续编辑。',
    icon: 'i-lucide-file-text',
    io: '输入剧情想法 → 输出结构化分镜',
  },
  {
    number: '02',
    phase: '第二站 · 认识主角',
    title: '补上人物和风景',
    description: '保存人物外貌、服装与场景设定，选择正文片段作为视频创作的起点。',
    icon: 'i-lucide-user-check',
    io: '补全人物与场景 → 选择故事片段',
  },
  {
    number: '03',
    phase: '第三站 · 准备开拍',
    title: '挑选模型，确认花费',
    description: '根据分镜需要自由配置视频模型、清晰度、比例与首尾帧。生成前系统提供透明报价与预留确认。',
    icon: 'i-lucide-sliders-horizontal',
    io: '选择模型与帧控制 → 实时预算核对',
  },
  {
    number: '04',
    phase: '第四站 · 收藏成果',
    title: '去作品库看看成果',
    description: '视频任务受理后会在后台生成，你可以离开页面，稍后回到作品库查看进度与结果。',
    icon: 'i-lucide-film',
    io: '后台生成 → 回作品库查看',
  },
]
</script>

<template>
  <section id="workflow" class="pipeline-section">
    <div class="home-section pipeline-layout">
      <div class="pipeline-intro">
        <span class="section-kicker">✦ 创作旅行路线</span>
        <h2 class="section-title">
          从故事的第一页，<br>
          走到会动的画面。
        </h2>
        <p class="section-lead">
          故事可以反复修改，人物可以慢慢补全。准备好了，就选一个片段，试着让它动起来。
        </p>
        <div class="pipeline-postcard" aria-hidden="true">
          <UIcon name="i-lucide-orbit" class="pipeline-postcard__icon" />
          <span>下一站，你的想象</span>
          <span class="pipeline-postcard__stars">✧ · ✦ · ✧</span>
        </div>
        <div class="pipeline-features">
          <div class="pipeline-feature-item">
            <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
            <span>透明计费与生成前报价确认</span>
          </div>
          <div class="pipeline-feature-item">
            <UIcon name="i-lucide-history" class="size-4 text-primary" />
            <span>离开页面后，也能回来查看进度</span>
          </div>
          <div class="pipeline-feature-item">
            <UIcon name="i-lucide-hard-drive" class="size-4 text-primary" />
            <span>在自己的作品库中浏览与下载</span>
          </div>
        </div>
      </div>

      <ol class="pipeline-steps">
        <li v-for="step in steps" :key="step.number" class="pipeline-step-item">
          <div class="pipeline-step-item__indicator">
            <span class="pipeline-step-item__num">{{ step.number }}</span>
            <div class="pipeline-step-item__line" aria-hidden="true" />
          </div>

          <div class="pipeline-step-item__content">
            <div class="pipeline-step-item__meta">
              <span class="pipeline-step-item__phase">{{ step.phase }}</span>
              <UIcon :name="step.icon" class="size-4 text-primary" />
            </div>
            <h3 class="pipeline-step-item__title">
              {{ step.title }}
            </h3>
            <p class="pipeline-step-item__description">
              {{ step.description }}
            </p>
            <div class="pipeline-step-item__io">
              <UIcon name="i-lucide-arrow-right-left" class="size-3 text-muted shrink-0" />
              <span>{{ step.io }}</span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

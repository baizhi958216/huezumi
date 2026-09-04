<script setup lang="ts">
const items = [
  { label: '平台接入了哪些模型供应商？', content: '已接入阿里云百炼、MiniMax 海螺、可灵、Seedance、RollDek 与 Runway。配置相应凭据后即可启用。' },
  { label: '不同平台的能力差异怎么处理？', content: '每家供应商都有结构化能力声明，创作台据此渲染表单，服务端再次执行最终校验。' },
  { label: '首尾帧模式和参考模式可以混用吗？', content: '不能在同一任务中混用。首尾帧定义视频边界，多模态参考用于组合图片、视频和音频。' },
  { label: '生成结果会过期吗？', content: '供应商临时链接可能过期；完整配置 OSS 后，成功结果会自动归档并保存长期地址。' },
  { label: '如何接入新的第三方平台？', content: '实现统一供应商适配器、声明能力并在工厂注册，页面、校验、轮询和作品库无需重复实现。' },
]
</script>

<template>
  <section class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
    <div class="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
      <div>
        <p class="type-kicker">
          FAQ
        </p><h2 class="type-section-title mt-2">
          常见问题
        </h2><p class="type-body mt-3">
          关于模型能力、素材模式与结果存储。
        </p>
      </div><UAccordion :items="items" />
    </div>
    <div class="mt-16 overflow-hidden rounded-3xl bg-zinc-950 p-7 text-white shadow-cinema md:p-10">
      <div class="flex flex-col justify-between gap-8 md:flex-row md:items-center">
        <div>
          <p class="text-xs font-semibold tracking-[0.12em] text-signal-400">
            READY TO CREATE
          </p><h2 class="mt-3 text-3xl font-650 tracking-tight md:text-4xl">
            下一段镜头，从这里开始。
          </h2><p class="mt-3 max-w-xl text-sm leading-7 text-zinc-400">
            选择合适的模型，带上你的素材，让统一生成流程处理剩下的事情。
          </p>
        </div><UButton to="/studio" size="xl" color="primary" trailing-icon="i-lucide-arrow-up-right" class="shrink-0">
          进入创作台
        </UButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
useHead({ title: '工作流创作台 · 绘小宙' })
const { user, requireLogin } = useAuth()
</script>

<template>
  <div>
    <WorkflowEditor v-if="user" :key="user.id" />
    <div v-else class="mx-auto max-w-lg px-6 py-24 text-center">
      <UIcon name="i-lucide-workflow" class="mb-4 size-12 text-primary" />
      <h1 class="text-2xl font-bold">
        用节点连接每一个灵感
      </h1>
      <p class="my-4 text-muted">
        创建文本、图片与视频工作流，组合本地模型与在线模型。
      </p>
      <UButton @click="requireLogin">
        登录并开始创作
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthSessionResponse, PublicUser } from '#shared/types/auth'

const { user, refreshSession } = useAuth()
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')
if (!session.value?.user)
  await navigateTo('/')
else
  user.value = session.value.user

const { data: ledger } = await useFetch<Array<{ id: string, type: string, amountCredits: number, reason?: string, createdAt: string }>>('/api/billing/ledger')
const displayName = ref(user.value?.displayName || '')
const avatarUrl = ref(user.value?.avatarUrl || '')
const saving = ref(false)
const message = ref('')

async function save() {
  saving.value = true
  message.value = ''
  try {
    user.value = await $fetch<PublicUser>('/api/auth/profile', { method: 'PATCH', body: { displayName: displayName.value, avatarUrl: avatarUrl.value } })
    await refreshSession()
    message.value = '个人资料已保存'
  }
  catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string } }
    message.value = candidate.data?.statusMessage || '保存失败'
  }
  finally {
    saving.value = false
  }
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <main v-if="user" class="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
    <div class="mb-6">
      <p class="type-label text-xs text-primary">
        ACCOUNT
      </p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">
        帐号与额度
      </h1>
    </div>
    <div class="grid gap-5 md:grid-cols-[320px_1fr]">
      <div class="space-y-5">
        <UCard>
          <template #header>
            <strong>个人资料</strong>
          </template>
          <div class="space-y-4">
            <UFormField label="昵称">
              <UInput v-model="displayName" class="w-full" />
            </UFormField>
            <UFormField label="头像 URL" hint="可留空使用昵称首字">
              <UInput v-model="avatarUrl" class="w-full" placeholder="https://…" />
            </UFormField>
            <p class="text-xs text-dimmed">
              {{ user.email }}
            </p>
            <UButton block :loading="saving" @click="save">
              保存资料
            </UButton>
            <p v-if="message" class="text-xs text-muted">
              {{ message }}
            </p>
          </div>
        </UCard>
        <UCard>
          <template #header>
            <strong>资源概览</strong>
          </template>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted">
                可用额度
              </dt><dd class="font-semibold">
                {{ user.availableCredits }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">
                预留额度
              </dt><dd>{{ user.reservedCredits }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">
                存储用量
              </dt><dd>{{ formatBytes(user.storageUsedBytes) }} / {{ formatBytes(user.storageLimitBytes) }}</dd>
            </div>
          </dl>
        </UCard>
      </div>
      <UCard>
        <template #header>
          <strong>额度流水</strong>
        </template>
        <div v-if="ledger?.length" class="divide-y divide-default">
          <div v-for="entry in ledger" :key="entry.id" class="flex items-center justify-between gap-4 py-3 text-sm">
            <div>
              <p class="font-medium">
                {{ entry.reason || entry.type }}
              </p><p class="text-xs text-dimmed">
                {{ new Date(entry.createdAt).toLocaleString('zh-CN') }}
              </p>
            </div>
            <span :class="entry.amountCredits >= 0 ? 'text-emerald-600' : 'text-red-500'">{{ entry.amountCredits >= 0 ? '+' : '' }}{{ entry.amountCredits }}</span>
          </div>
        </div>
        <p v-else class="py-10 text-center text-sm text-muted">
          暂无额度记录
        </p>
      </UCard>
    </div>
  </main>
</template>

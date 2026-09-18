<script setup lang="ts">
import type { AuthSessionResponse, PublicUser } from '#shared/types/auth'

const { user, refreshSession } = useAuth()
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')
if (!session.value?.user)
  await navigateTo('/')
else
  user.value = session.value.user
const { data: ledger, error: ledgerError, status: ledgerStatus, refresh: refreshLedger } = await useFetch<{
  items: Array<{
    id: string
    type: string
    amountCredits: number
    reason?: string
    createdAt: string
  }>
}>('/api/billing/ledger')
const displayName = ref(user.value?.displayName || '')
const avatarUrl = ref(user.value?.avatarUrl || '')
const avatarChanged = ref(false)
const avatarUploading = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarMessage = ref('')
const avatarError = ref(false)
const profileModalOpen = ref(false)
const profileError = ref('')
const saving = ref(false)
const message = ref('')
const passwordModalOpen = ref(false)
const changingPassword = ref(false)
const passwordMessage = ref('')
const passwordError = ref(false)
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
function getErrorMessage(error: unknown, fallback: string) {
  return (error as {
    data?: {
      statusMessage?: string
    }
  }).data?.statusMessage || fallback
}
function openProfileModal() {
  displayName.value = user.value?.displayName || ''
  avatarUrl.value = user.value?.avatarUrl || ''
  avatarChanged.value = false
  avatarMessage.value = ''
  avatarError.value = false
  profileError.value = ''
  profileModalOpen.value = true
}
function chooseAvatar() {
  avatarInput.value?.click()
}
async function onAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return
  avatarMessage.value = ''
  avatarError.value = false
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
    avatarMessage.value = '请选择 JPG、PNG、GIF 或 WebP 图片'
    avatarError.value = true
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    avatarMessage.value = '头像图片不能超过 5 MB'
    avatarError.value = true
    return
  }
  avatarUploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const uploaded = await $fetch<{
      url: string
    }>('/api/assets', { method: 'POST', body })
    avatarUrl.value = uploaded.url
    avatarChanged.value = true
    avatarMessage.value = '头像已上传，请保存资料后生效'
  }
  catch (error: unknown) {
    avatarMessage.value = getErrorMessage(error, '头像上传失败，请重试')
    avatarError.value = true
  }
  finally {
    avatarUploading.value = false
  }
}
function clearAvatar() {
  avatarUrl.value = ''
  avatarChanged.value = true
  avatarMessage.value = '头像将在保存资料后移除'
  avatarError.value = false
}
function openPasswordModal() {
  passwordForm.currentPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordMessage.value = ''
  passwordError.value = false
  passwordModalOpen.value = true
}
async function save() {
  if (saving.value || avatarUploading.value)
    return
  profileError.value = ''
  saving.value = true
  message.value = ''
  try {
    const body: {
      displayName: string
      avatarUrl?: string
    } = { displayName: displayName.value }
    if (avatarChanged.value)
      body.avatarUrl = avatarUrl.value
    user.value = await $fetch<PublicUser>('/api/auth/profile', { method: 'PATCH', body })
    avatarUrl.value = user.value.avatarUrl || ''
    avatarChanged.value = false
    profileModalOpen.value = false
    message.value = '个人资料已保存'
    await refreshSession()
  }
  catch (error: unknown) {
    profileError.value = getErrorMessage(error, '保存失败')
  }
  finally {
    saving.value = false
  }
}
async function changePassword() {
  passwordMessage.value = ''
  passwordError.value = false
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordMessage.value = '两次输入的新密码不一致'
    passwordError.value = true
    return
  }
  changingPassword.value = true
  try {
    user.value = await $fetch<PublicUser>('/api/auth/password', { method: 'POST', body: { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword } })
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    await refreshSession()
    passwordMessage.value = '密码已更新，其他设备已退出登录'
  }
  catch (error: unknown) {
    passwordMessage.value = getErrorMessage(error, '密码修改失败')
    passwordError.value = true
  }
  finally {
    changingPassword.value = false
  }
}
function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div v-if="user" class="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
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
          <div class="flex items-center gap-3">
            <UAvatar :src="user.avatarUrl || undefined" :alt="user.displayName" size="xl" />
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ user.displayName }}
              </p>
              <p class="break-all text-xs text-dimmed">
                {{ user.email }}
              </p>
            </div>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <UButton variant="soft" icon="i-lucide-pencil" @click="openProfileModal">
              编辑资料
            </UButton>
            <UButton color="neutral" variant="ghost" icon="i-lucide-key-round" @click="openPasswordModal">
              修改密码
            </UButton>
          </div>
          <p v-if="message" role="status" class="mt-3 text-xs text-success">
            {{ message }}
          </p>
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
        <p v-if="ledgerStatus === 'pending'" role="status" class="py-10 text-center text-sm text-muted">
          正在加载额度流水…
        </p>
        <UAlert v-else-if="ledgerError" color="error" variant="subtle" title="额度流水加载失败">
          <template #actions>
            <UButton color="error" variant="soft" @click="refreshLedger()">
              重试
            </UButton>
          </template>
        </UAlert>
        <div v-else-if="ledger?.items.length" class="divide-y divide-default">
          <div v-for="entry in ledger?.items" :key="entry.id" class="flex items-center justify-between gap-4 py-3 text-sm">
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
  </div>
  <UModal v-model:open="profileModalOpen" title="编辑个人资料" description="更新昵称与头像，保存后生效。" :dismissible="!saving && !avatarUploading" :close="!saving && !avatarUploading">
    <template #body>
      <form id="profile-form" class="space-y-4" @submit.prevent="save">
        <fieldset :disabled="saving || avatarUploading" class="min-w-0 space-y-4">
          <div class="flex items-center gap-3">
            <UAvatar :src="avatarUrl || undefined" :alt="displayName" size="xl" :text="displayName.trim().slice(0, 1).toUpperCase() || 'U'" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                头像
              </p>
              <p class="mt-1 text-xs text-dimmed">
                支持 JPG、PNG、GIF、WebP，最大 5 MB
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <input ref="avatarInput" type="file" class="sr-only" accept="image/jpeg,image/png,image/gif,image/webp" @change="onAvatarSelected">
                <UButton type="button" size="sm" variant="soft" icon="i-lucide-upload" :loading="avatarUploading" @click="chooseAvatar">
                  {{ avatarUploading ? '上传中' : '上传图片' }}
                </UButton>
                <UButton v-if="avatarUrl" type="button" size="sm" color="neutral" variant="ghost" :disabled="avatarUploading" @click="clearAvatar">
                  移除
                </UButton>
              </div>
            </div>
          </div>
          <UFormField label="昵称">
            <UInput v-model="displayName" class="w-full" />
          </UFormField>
          <p v-if="avatarMessage" aria-live="polite" :class="avatarError ? 'text-red-500' : 'text-dimmed'" class="text-xs">
            {{ avatarMessage }}
          </p>
          <UAlert v-if="profileError" color="error" variant="subtle" :description="profileError" />
        </fieldset>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="saving || avatarUploading" @click="profileModalOpen = false">
          取消
        </UButton>
        <UButton type="submit" form="profile-form" :loading="saving" :disabled="avatarUploading">
          保存资料
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="passwordModalOpen" title="修改密码" :ui="{ content: 'sm:max-w-[420px] w-full' }">
    <template #content="{ close }">
      <div class="space-y-5 p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              修改密码
            </h2>
            <p class="mt-1 text-sm text-muted">
              修改成功后，其他设备需要重新登录。
            </p>
          </div>
          <button type="button" class="-mr-2 -mt-2 flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-muted hover:text-highlighted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="关闭" @click="close">
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>
        <form class="space-y-4" @submit.prevent="changePassword">
          <UFormField label="当前密码" required>
            <UInput v-model="passwordForm.currentPassword" class="w-full" type="password" autocomplete="current-password" />
          </UFormField>
          <UFormField label="新密码" hint="至少 10 个字符" required>
            <UInput v-model="passwordForm.newPassword" class="w-full" type="password" autocomplete="new-password" />
          </UFormField>
          <UFormField label="确认新密码" required>
            <UInput v-model="passwordForm.confirmPassword" class="w-full" type="password" autocomplete="new-password" />
          </UFormField>
          <UButton type="submit" block :loading="changingPassword">
            更新密码
          </UButton>
          <p v-if="passwordMessage" aria-live="polite" :class="passwordError ? 'text-red-500' : 'text-muted'" class="text-xs">
            {{ passwordMessage }}
          </p>
        </form>
      </div>
    </template>
  </UModal>
</template>

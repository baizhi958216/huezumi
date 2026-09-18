<script setup lang="ts">
import type { AdminInvitationItem, AdminInvitationsResponse } from '~~/server/api/admin/invitations.get'

const { data: session } = await useFetch('/api/auth/session')
if (session.value?.user?.role !== 'admin') {
  await navigateTo('/')
}

const filterStatus = ref<'all' | 'active' | 'used' | 'expired'>('all')
const search = ref('')

const queryParams = computed(() => {
  const params: Record<string, string> = {}
  if (filterStatus.value !== 'all') {
    params.status = filterStatus.value
  }
  if (search.value.trim()) {
    params.q = search.value.trim()
  }
  return params
})

const { data, refresh, status: loadStatus, error: loadError } = await useFetch<AdminInvitationsResponse>('/api/admin/invitations', {
  query: queryParams,
})

const message = ref('')
const errorMessage = ref('')
let messageTimer: ReturnType<typeof setTimeout> | null = null

function showSuccess(text: string) {
  message.value = text
  errorMessage.value = ''
  if (messageTimer)
    clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = ''
  }, 4000)
}

function showError(text: string) {
  errorMessage.value = text
  message.value = ''
  if (messageTimer)
    clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    errorMessage.value = ''
  }, 6000)
}

// 复制工具函数
const copiedCode = ref<string | null>(null)
async function copyToClipboard(text: string, label: string = '邀请码') {
  try {
    await navigator.clipboard.writeText(text)
    copiedCode.value = text
    showSuccess(`${label}已复制到剪贴板`)
    setTimeout(() => {
      if (copiedCode.value === text) {
        copiedCode.value = null
      }
    }, 2000)
  }
  catch {
    showError('复制失败，请手动复制')
  }
}

function copyInviteLink(code: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/?invite=${encodeURIComponent(code)}`
  copyToClipboard(link, '注册链接')
}

// 模态框与创建状态
const createModalOpen = ref(false)
const createMode = ref<'random' | 'custom'>('random')
const createForm = ref({
  count: 1,
  expiresInDays: 14,
  customCode: '',
  note: '',
})
const creating = ref(false)
const createdResults = ref<{ code: string, note?: string | null, expiresAt: string }[]>([])

function openCreateModal() {
  createMode.value = 'random'
  createForm.value = {
    count: 1,
    expiresInDays: 14,
    customCode: '',
    note: '',
  }
  createdResults.value = []
  createModalOpen.value = true
}

async function handleCreate() {
  creating.value = true
  try {
    const payload: {
      expiresInDays: number
      count?: number
      customCode?: string
      note?: string
    } = {
      expiresInDays: Number(createForm.value.expiresInDays),
      note: createForm.value.note.trim() || undefined,
    }

    if (createMode.value === 'custom') {
      if (!createForm.value.customCode.trim()) {
        showError('请输入自定义邀请码')
        creating.value = false
        return
      }
      payload.customCode = createForm.value.customCode.trim()
      payload.count = 1
    }
    else {
      payload.count = Number(createForm.value.count)
    }

    const res = await $fetch<{ code: string, expiresAt: string, items?: { id: string, code: string, note?: string | null, expiresAt: string }[] }>('/api/admin/invitations', {
      method: 'POST',
      body: payload,
    })

    if (res.items && res.items.length > 0) {
      createdResults.value = res.items
    }
    else {
      createdResults.value = [{
        code: res.code,
        expiresAt: res.expiresAt,
        note: createForm.value.note,
      }]
    }

    showSuccess(`成功生成 ${createdResults.value.length} 个邀请码`)
    await refresh()
  }
  catch (err: any) {
    showError(err?.data?.statusMessage || err?.message || '生成邀请码失败')
  }
  finally {
    creating.value = false
  }
}

function copyAllCreated() {
  const text = createdResults.value.map(r => r.code).join('\n')
  copyToClipboard(text, '全部邀请码')
}

// 删除作废
const deleteModalOpen = ref(false)
const itemToDelete = ref<AdminInvitationItem | null>(null)
const deleting = ref(false)

function openDeleteModal(item: AdminInvitationItem) {
  itemToDelete.value = item
  deleteModalOpen.value = true
}

async function confirmDelete() {
  if (!itemToDelete.value)
    return
  deleting.value = true
  try {
    await $fetch(`/api/admin/invitations/${itemToDelete.value.id}`, {
      method: 'DELETE',
    })
    showSuccess('邀请码已作废删除')
    deleteModalOpen.value = false
    itemToDelete.value = null
    await refresh()
  }
  catch (err: any) {
    showError(err?.data?.statusMessage || err?.message || '作废失败')
  }
  finally {
    deleting.value = false
  }
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso)
    return '—'
  const date = new Date(iso)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getExpiresText(expiresAt: string | null, status: string) {
  if (!expiresAt)
    return '永久有效'
  if (status === 'used')
    return formatDateTime(expiresAt)
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0)
    return '已过期'
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 1) {
    const hours = Math.ceil(diff / (1000 * 60 * 60))
    return `剩余 ${hours} 小时`
  }
  return `剩余 ${days} 天`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Action Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-dimmed">
        生成与管理注册邀请凭证，追踪发放与兑换状态，支持按备注及状态即时筛选。
      </p>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="loadStatus === 'pending'"
          @click="() => refresh()"
        >
          刷新
        </UButton>
        <UButton icon="i-lucide-plus" color="primary" size="sm" @click="openCreateModal">
          生成邀请码
        </UButton>
      </div>
    </div>

    <!-- Global Alert Feedback -->
    <UAlert v-if="message" color="success" variant="subtle" icon="i-lucide-circle-check" :description="message" />
    <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" />
    <UAlert v-if="loadError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="loadError.message" />

    <!-- Metrics Strip -->
    <div class="grid grid-cols-2 divide-y divide-default/70 rounded-xl border border-default/70 bg-elevated/50 backdrop-blur-xs sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
      <div class="p-4 sm:p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-dimmed">
            全部邀请码
          </span>
          <UIcon name="i-lucide-ticket" class="size-4 text-primary" />
        </div>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-highlighted">
          {{ data?.stats?.total ?? 0 }}
        </p>
      </div>

      <div class="p-4 sm:p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-dimmed">
            可用有效
          </span>
          <UIcon name="i-lucide-badge-check" class="size-4 text-emerald-500" />
        </div>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-highlighted">
          {{ data?.stats?.active ?? 0 }}
        </p>
      </div>

      <div class="p-4 sm:p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-dimmed">
            已被使用
          </span>
          <UIcon name="i-lucide-user-check" class="size-4 text-indigo-500" />
        </div>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-highlighted">
          {{ data?.stats?.used ?? 0 }}
        </p>
      </div>

      <div class="p-4 sm:p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-dimmed">
            已过期 / 失效
          </span>
          <UIcon name="i-lucide-clock-alert" class="size-4 text-amber-500" />
        </div>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-highlighted">
          {{ data?.stats?.expired ?? 0 }}
        </p>
      </div>
    </div>

    <!-- Filter & Action Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default bg-muted/40 p-2.5">
      <div class="flex items-center gap-1">
        <UButton
          size="xs"
          :variant="filterStatus === 'all' ? 'solid' : 'ghost'"
          :color="filterStatus === 'all' ? 'primary' : 'neutral'"
          @click="filterStatus = 'all'"
        >
          全部 ({{ data?.stats?.total ?? 0 }})
        </UButton>
        <UButton
          size="xs"
          :variant="filterStatus === 'active' ? 'solid' : 'ghost'"
          :color="filterStatus === 'active' ? 'primary' : 'neutral'"
          @click="filterStatus = 'active'"
        >
          可用 ({{ data?.stats?.active ?? 0 }})
        </UButton>
        <UButton
          size="xs"
          :variant="filterStatus === 'used' ? 'solid' : 'ghost'"
          :color="filterStatus === 'used' ? 'primary' : 'neutral'"
          @click="filterStatus = 'used'"
        >
          已使用 ({{ data?.stats?.used ?? 0 }})
        </UButton>
        <UButton
          size="xs"
          :variant="filterStatus === 'expired' ? 'solid' : 'ghost'"
          :color="filterStatus === 'expired' ? 'primary' : 'neutral'"
          @click="filterStatus = 'expired'"
        >
          已过期 ({{ data?.stats?.expired ?? 0 }})
        </UButton>
      </div>

      <div class="w-full sm:w-72">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="按邀请码、备注或使用者筛选..."
          size="sm"
          class="w-full"
        />
      </div>
    </div>

    <!-- Invitations Table Card -->
    <UCard class="shadow-soft">
      <div v-if="loadStatus === 'pending' && !data?.items" class="py-12 text-center text-sm text-dimmed">
        <UIcon name="i-lucide-loader-2" class="mx-auto mb-2 size-6 animate-spin text-primary" />
        加载中...
      </div>

      <div v-else-if="!data?.items?.length" class="py-12 text-center">
        <UIcon name="i-lucide-ticket" class="mx-auto mb-3 size-10 text-dimmed/40" />
        <h3 class="text-sm font-semibold text-highlighted">
          暂无符合条件的邀请码
        </h3>
        <p class="mt-1 text-xs text-dimmed">
          点击右上角“生成邀请码”即可创建新的注册凭证
        </p>
        <UButton class="mt-4" size="sm" icon="i-lucide-plus" @click="openCreateModal">
          立即生成
        </UButton>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-default text-xs font-semibold text-dimmed uppercase">
            <tr>
              <th class="pb-3 pl-2">
                邀请码
              </th>
              <th class="pb-3">
                状态
              </th>
              <th class="pb-3">
                备注 / 用途
              </th>
              <th class="pb-3">
                有效期限
              </th>
              <th class="pb-3">
                使用者
              </th>
              <th class="pb-3">
                创建时间
              </th>
              <th class="pb-3 pr-2 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="item in data.items"
              :key="item.id"
              class="group transition-colors hover:bg-muted/30"
            >
              <!-- 邀请码 -->
              <td class="py-3.5 pl-2">
                <div class="flex items-center gap-2">
                  <span
                    v-if="item.code"
                    class="font-mono text-sm font-semibold tracking-wider text-highlighted"
                  >
                    {{ item.code }}
                  </span>
                  <span
                    v-else
                    class="font-mono text-xs text-dimmed"
                    title="历史创建的邀请码未留存明文"
                  >
                    {{ item.codeHashPrefix || '明文未留存' }}
                  </span>
                  <UButton
                    v-if="item.code"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :icon="copiedCode === item.code ? 'i-lucide-check' : 'i-lucide-copy'"
                    :title="copiedCode === item.code ? '已复制' : '复制邀请码'"
                    @click="copyToClipboard(item.code, '邀请码')"
                  />
                </div>
              </td>

              <!-- 状态 Badge -->
              <td class="py-3.5">
                <UBadge
                  v-if="item.status === 'active'"
                  color="success"
                  variant="subtle"
                  size="sm"
                  class="font-medium"
                >
                  可用有效
                </UBadge>
                <UBadge
                  v-else-if="item.status === 'used'"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="font-medium"
                >
                  已使用
                </UBadge>
                <UBadge
                  v-else
                  color="warning"
                  variant="subtle"
                  size="sm"
                  class="font-medium"
                >
                  已过期
                </UBadge>
              </td>

              <!-- 备注 -->
              <td class="py-3.5 max-w-[160px] truncate text-xs text-muted" :title="item.note || '无备注'">
                <span v-if="item.note" class="rounded bg-muted px-1.5 py-0.5 font-medium text-toned">
                  {{ item.note }}
                </span>
                <span v-else class="text-dimmed/60">—</span>
              </td>

              <!-- 有效期 -->
              <td class="py-3.5 text-xs">
                <div class="flex flex-col">
                  <span :class="item.status === 'expired' ? 'text-amber-500 font-medium' : 'text-toned'">
                    {{ getExpiresText(item.expiresAt, item.status) }}
                  </span>
                  <span v-if="item.expiresAt" class="text-[11px] text-dimmed">
                    {{ formatDateTime(item.expiresAt) }}
                  </span>
                </div>
              </td>

              <!-- 使用者 -->
              <td class="py-3.5 text-xs">
                <div v-if="item.usedBy" class="flex flex-col">
                  <span class="font-medium text-highlighted">
                    {{ item.usedBy.displayName || item.usedBy.email }}
                  </span>
                  <span class="text-[11px] text-dimmed">
                    {{ formatDateTime(item.usedAt) }}
                  </span>
                </div>
                <span v-else class="text-dimmed/60">—</span>
              </td>

              <!-- 创建时间 -->
              <td class="py-3.5 text-xs text-dimmed">
                <div class="flex flex-col">
                  <span>{{ formatDateTime(item.createdAt) }}</span>
                  <span v-if="item.creator" class="text-[11px] text-dimmed/80">
                    by {{ item.creator.displayName || item.creator.email }}
                  </span>
                </div>
              </td>

              <!-- 操作 -->
              <td class="py-3.5 pr-2 text-right">
                <div class="flex items-center justify-end gap-1">
                  <UButton
                    v-if="item.code && item.status === 'active'"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-link"
                    title="复制快速注册链接"
                    @click="copyInviteLink(item.code)"
                  >
                    链接
                  </UButton>

                  <UButton
                    v-if="item.code"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-copy"
                    title="复制邀请码"
                    @click="copyToClipboard(item.code, '邀请码')"
                  >
                    复制
                  </UButton>

                  <UButton
                    v-if="item.status !== 'used'"
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    title="作废删除此邀请码"
                    @click="openDeleteModal(item)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Create Invitation Modal -->
    <UModal
      v-model:open="createModalOpen"
      title="生成注册邀请码"
      description="为新用户或特定渠道创建注册凭据"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <!-- If results exist, display created codes -->
        <div v-if="createdResults.length > 0" class="space-y-4">
          <UAlert
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="`成功生成 ${createdResults.length} 个邀请码`"
            description="您可以一键复制以下邀请码并分发给新用户。"
          />

          <div class="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-default bg-muted/30 p-3">
            <div
              v-for="(res, idx) in createdResults"
              :key="idx"
              class="flex items-center justify-between rounded border border-default/70 bg-elevated px-3 py-2 text-sm shadow-xs"
            >
              <div class="flex flex-col">
                <span class="font-mono font-bold tracking-wider text-highlighted">{{ res.code }}</span>
                <span class="text-[11px] text-dimmed">有效至 {{ formatDateTime(res.expiresAt) }}</span>
              </div>
              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-link"
                  @click="copyInviteLink(res.code)"
                >
                  链接
                </UButton>
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="copyToClipboard(res.code, '邀请码')"
                >
                  复制
                </UButton>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2">
            <UButton
              v-if="createdResults.length > 1"
              icon="i-lucide-copy-check"
              color="primary"
              variant="outline"
              @click="copyAllCreated"
            >
              批量复制全部代码
            </UButton>
            <div class="ml-auto">
              <UButton color="neutral" @click="createModalOpen = false">
                完成关闭
              </UButton>
            </div>
          </div>
        </div>

        <!-- Form for creating codes -->
        <form v-else class="space-y-4" @submit.prevent="handleCreate">
          <!-- Generation Mode -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-toned">生成方式</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all"
                :class="createMode === 'random' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-default bg-muted/40 text-muted hover:bg-muted'"
                @click="createMode = 'random'"
              >
                <UIcon name="i-lucide-shuffle" class="size-4" />
                系统随机生成
              </button>
              <button
                type="button"
                class="flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all"
                :class="createMode === 'custom' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-default bg-muted/40 text-muted hover:bg-muted'"
                @click="createMode = 'custom'"
              >
                <UIcon name="i-lucide-edit-3" class="size-4" />
                自定义代码
              </button>
            </div>
          </div>

          <!-- Custom Code Input -->
          <div v-if="createMode === 'custom'" class="space-y-1.5">
            <label class="text-xs font-semibold text-toned">指定邀请码</label>
            <UInput
              v-model="createForm.customCode"
              placeholder="例如: VIP-2026 或 FORKVDO-BETA"
              class="font-mono uppercase w-full"
            />
            <p class="text-[11px] text-dimmed">
              仅支持字母、数字、短横线与下划线，区分大小写
            </p>
          </div>

          <!-- Random Count -->
          <div v-else class="space-y-1.5">
            <label class="text-xs font-semibold text-toned">生成数量</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="num in [1, 5, 10, 20]"
                :key="num"
                type="button"
                class="rounded-lg border py-2 text-xs font-medium transition-all"
                :class="createForm.count === num ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-default bg-muted/40 text-muted hover:bg-muted'"
                @click="createForm.count = num"
              >
                {{ num }} 个
              </button>
            </div>
          </div>

          <!-- Expiration Days -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-toned">有效期限</label>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <button
                v-for="preset in [
                  { label: '3天', days: 3 },
                  { label: '7天', days: 7 },
                  { label: '14天', days: 14 },
                  { label: '30天', days: 30 },
                  { label: '90天', days: 90 },
                  { label: '1年', days: 365 },
                ]"
                :key="preset.days"
                type="button"
                class="rounded-lg border py-2 text-xs font-medium transition-all text-center"
                :class="createForm.expiresInDays === preset.days ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-default bg-muted/40 text-muted hover:bg-muted'"
                @click="createForm.expiresInDays = preset.days"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <!-- Note / Purpose -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-toned">备注 / 发放说明 (选填)</label>
            <UInput
              v-model="createForm.note"
              placeholder="例如: 创作者内测第一批、B站UP专享..."
              maxlength="100"
              class="w-full"
            />
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-default">
            <UButton color="neutral" variant="ghost" @click="createModalOpen = false">
              取消
            </UButton>
            <UButton type="submit" color="primary" :loading="creating">
              立即生成
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal
      v-model:open="deleteModalOpen"
      title="确认作废邀请码"
      description="作废后该邀请码将无法再次使用注册，此操作不可撤销。"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <template #body>
        <div v-if="itemToDelete" class="space-y-3">
          <div class="rounded-lg border border-default bg-muted/40 p-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-xs text-dimmed">邀请码</span>
              <span class="font-mono font-bold text-highlighted">{{ itemToDelete.code || itemToDelete.codeHashPrefix }}</span>
            </div>
            <div v-if="itemToDelete.note" class="mt-1 flex items-center justify-between">
              <span class="text-xs text-dimmed">备注</span>
              <span class="text-xs text-toned">{{ itemToDelete.note }}</span>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" :disabled="deleting" @click="deleteModalOpen = false">
              取消
            </UButton>
            <UButton color="error" :loading="deleting" @click="confirmDelete">
              确认作废
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

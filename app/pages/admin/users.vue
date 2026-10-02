<script setup lang="ts">
interface AdminUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  status: string
  balanceCredits: number
  reservedCredits: number
  storageLimitBytes: number
  storageUsedBytes: number
  generationCount: number
}
const { user } = useAuth()
const search = ref('')
const page = ref(1)
watch(search, () => {
  page.value = 1
})
const query = computed(() => ({ q: search.value, page: page.value }))
const { data: users, refresh: refreshUsers, error: loadError, status: loadStatus } = await useFetch<AdminUser[]>('/api/admin/users', { query })
const creditTarget = ref<AdminUser>()
const creditOpen = ref(false)
const creditAmount = ref(0)
const creditBusy = ref(false)
const creditError = ref('')
const message = ref('')
const errorMessage = ref('')
const creditReason = ref('')
const userBusy = ref('')
const filteredUsers = computed(() => (users.value || []).slice(0, 30))
const accountOpen = ref(false)
const accountTarget = ref<AdminUser>()
const accountError = ref('')
const accountDraft = reactive({ role: 'user' as 'user' | 'admin', storageLimitMiB: 0 })
function editAccount(target: AdminUser) {
  accountTarget.value = target
  accountDraft.role = target.role
  accountDraft.storageLimitMiB = target.storageLimitBytes / 1024 / 1024
  accountError.value = ''
  accountOpen.value = true
}
async function saveAccount() {
  if (!accountTarget.value || userBusy.value)
    return
  userBusy.value = accountTarget.value.id
  accountError.value = ''
  try {
    await $fetch(`/api/admin/users/${accountTarget.value.id}`, { method: 'PATCH', body: { role: accountDraft.role, storageLimitBytes: Math.round(accountDraft.storageLimitMiB * 1024 * 1024) } })
    accountOpen.value = false
    message.value = '账户权限与存储限额已更新'
    await refreshUsers()
  }
  catch (e) { accountError.value = apiError(e) }
  finally { userBusy.value = '' }
}

function openCredits(target: AdminUser) {
  creditTarget.value = target
  creditReason.value = ''
  creditAmount.value = 0
  creditError.value = ''
  creditOpen.value = true
}
async function adjustCredits() {
  if (!creditTarget.value || !creditAmount.value || creditBusy.value)
    return
  creditBusy.value = true
  creditError.value = ''
  try {
    await $fetch(`/api/admin/users/${creditTarget.value.id}/credits`, { method: 'POST', body: { amount: creditAmount.value, reason: creditReason.value.trim() } })
    creditOpen.value = false
    message.value = '用户额度已调整'
    await refreshUsers()
  }
  catch (error) { creditError.value = apiError(error) }
  finally { creditBusy.value = false }
}
async function toggleUser(target: AdminUser) {
  if (userBusy.value)
    return
  userBusy.value = target.id
  errorMessage.value = ''
  try {
    await $fetch(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { status: target.status === 'active' ? 'disabled' : 'active' } })
    await refreshUsers()
  }
  catch (error) { errorMessage.value = apiError(error) }
  finally { userBusy.value = '' }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap justify-between gap-3">
      <UInput v-model="search" aria-label="搜索用户" placeholder="搜索姓名或邮箱" icon="i-lucide-search" /><UButton to="/admin/invitations" variant="soft">
        管理邀请码
      </UButton>
    </div>
    <UAlert v-if="loadError" color="error" title="用户加载失败">
      <template #actions>
        <UButton @click="refreshUsers()">
          重试
        </UButton>
      </template>
    </UAlert>
    <p v-else-if="loadStatus === 'pending'" role="status">
      正在加载用户…
    </p>
    <UAlert v-if="message" color="success" :description="message" /><UAlert v-if="errorMessage" color="error" :description="errorMessage" />
    <!-- Users and Credits -->
    <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
      <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            用户与额度
          </h2>
          <p class="text-xs text-dimmed">
            管理注册用户账户状态及额度分配
          </p>
        </div>
        <span class="text-xs text-dimmed">本页 {{ filteredUsers.length }} 位用户</span>
      </div>
      <div class="overflow-x-auto p-2">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-dimmed">
            <tr>
              <th class="pb-3 pl-3">
                用户
              </th>
              <th>状态</th>
              <th>额度</th>
              <th>存储</th>
              <th class="pr-3 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default/60">
            <tr v-if="!filteredUsers.length && !loadError && loadStatus !== 'pending'">
              <td colspan="5" class="p-6 text-center text-muted">
                没有匹配的用户
              </td>
            </tr>
            <tr v-for="item in filteredUsers" :key="item.id" class="transition hover:bg-muted/30">
              <td class="py-3 pl-3 pr-3">
                <div class="font-medium text-highlighted">
                  {{ item.displayName }} <span class="text-xs text-muted">{{ item.role === 'admin' ? '管理员' : '用户' }}</span>
                </div>
                <span class="block text-xs text-dimmed">{{ item.email }}</span>
              </td>
              <td>
                <UBadge :color="item.status === 'active' ? 'success' : 'neutral'" variant="subtle" size="xs">
                  {{ item.status === 'active' ? '正常' : '已停用' }}
                </UBadge>
              </td>
              <td>
                <span class="font-mono text-xs">{{ (item.balanceCredits || 0) - (item.reservedCredits || 0) }} 可用</span>
                <span class="text-xs text-dimmed"> ({{ item.reservedCredits }} 预留)</span>
              </td>
              <td class="font-mono text-xs">
                {{ (Number(item.storageUsedBytes) / 1024 / 1024).toFixed(1) }} / {{ (item.storageLimitBytes / 1024 / 1024).toFixed(0) }} MB
              </td>
              <td class="pr-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <UButton size="xs" variant="ghost" color="neutral" @click="editAccount(item)">
                    账户设置
                  </UButton>
                  <UButton size="xs" variant="soft" color="neutral" @click="openCredits(item)">
                    调整额度
                  </UButton>
                  <UButton v-if="item.id !== user?.id" size="xs" color="neutral" variant="ghost" :disabled="!!userBusy" :loading="userBusy === item.id" @click="toggleUser(item)">
                    {{ item.status === 'active' ? '停用' : '启用' }}
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="flex items-center justify-end gap-3">
      <UButton color="neutral" variant="outline" :disabled="page <= 1 || loadStatus === 'pending'" @click="page--">
        上一页
      </UButton><span class="text-sm">第 {{ page }} 页</span><UButton color="neutral" variant="outline" :disabled="(users?.length || 0) <= 30 || loadStatus === 'pending'" @click="page++">
        下一页
      </UButton>
    </div>
    <UModal v-model:open="accountOpen" title="账户设置" :description="accountTarget?.email" :dismissible="!userBusy" :close="!userBusy">
      <template #body>
        <form id="account-form" class="space-y-4" @submit.prevent="saveAccount">
          <fieldset :disabled="!!userBusy" class="space-y-4">
            <UFormField label="账户角色" description="管理员可管理全站用户、额度、服务凭据。">
              <USelect v-model="accountDraft.role" :disabled="accountTarget?.id === user?.id" :items="[{ label: '普通用户', value: 'user' }, { label: '管理员', value: 'admin' }]" class="w-full" />
            </UFormField><UFormField label="存储上限（MiB）" description="1024 MiB = 1 GiB。调整上限不会删除已有素材。">
              <UInput v-model.number="accountDraft.storageLimitMiB" type="number" step="any" :min="0" required class="w-full" />
            </UFormField><UAlert v-if="accountError" color="error" :description="accountError" />
          </fieldset>
        </form>
      </template><template #footer>
        <UButton type="submit" form="account-form" :loading="!!userBusy">
          保存账户设置
        </UButton>
      </template>
    </UModal>
    <UModal v-model:open="creditOpen" title="调整用户额度" :description="creditTarget ? `${creditTarget.displayName} · ${creditTarget.email}` : ''" :dismissible="!creditBusy" :close="!creditBusy">
      <template #body>
        <form id="credit-form" class="space-y-4" @submit.prevent="adjustCredits">
          <fieldset :disabled="creditBusy" class="min-w-0 space-y-4">
            <p class="text-sm text-muted">
              当前余额 {{ creditTarget?.balanceCredits }}，其中 {{ creditTarget?.reservedCredits }} 已预留。
            </p>
            <UFormField label="调整额度" description="正数增加，负数扣减。" required>
              <UInput v-model.number="creditAmount" class="w-full" type="number" />
            </UFormField>
            <UFormField label="调整原因" required>
              <UInput v-model="creditReason" class="w-full" :minlength="3" :maxlength="240" required />
            </UFormField>
            <UAlert v-if="creditError" color="error" variant="subtle" :description="creditError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="creditBusy" @click="creditOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="credit-form" :loading="creditBusy" :disabled="!creditAmount || creditReason.trim().length < 3">
            确认调整
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

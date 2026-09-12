<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/types/auth'

interface AdminUser { id: string, email: string, displayName: string, role: 'user' | 'admin', status: string, balanceCredits: number, reservedCredits: number, storageUsedBytes: number, generationCount: number }
interface PriceRule { id: string, provider: string, model: string, resolution: string, formula: Record<string, number>, sourceLabel: string, version: number, active: boolean }
interface AdminGeneration { id: string, provider: string, model?: string, status: string, prompt: string, createdAt: string, billing?: { estimatedCredits: number, chargedCredits?: number, settlementStatus: string }, owner: { email: string, displayName: string } }
interface AuditEntry { id: string, action: string, targetType: string, targetId: string, detail: Record<string, unknown>, createdAt: string, actorEmail?: string }

const { user } = useAuth()
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')
if (session.value?.user?.role !== 'admin')
  await navigateTo('/')
else
  user.value = session.value.user

const { data: overview, refresh: refreshOverview } = await useFetch<Record<string, number>>('/api/admin/overview')
const { data: users, refresh: refreshUsers } = await useFetch<AdminUser[]>('/api/admin/users')
const { data: pricing, refresh: refreshPricing } = await useFetch<PriceRule[]>('/api/admin/pricing')
const { data: generations, refresh: refreshGenerations } = await useFetch<AdminGeneration[]>('/api/admin/generations')
const { data: audit, refresh: refreshAudit } = await useFetch<AuditEntry[]>('/api/admin/audit')
const creditAmount = ref<Record<string, number>>({})
const invitation = ref<{ code: string, expiresAt: string }>()
const priceForm = reactive({ provider: 'runway', model: '*', resolution: '*', fixedCredits: 0, outputSecondCredits: 20, inputVideoSecondCredits: 0, referenceImageCredits: 0, minimumCredits: 1, durationTiers: '', version: 2, sourceLabel: '管理员配置', sourceUrl: '' })
const errorMessage = ref('')

async function adjustCredits(target: AdminUser) {
  const amount = creditAmount.value[target.id]
  if (!amount)
    return
  await $fetch(`/api/admin/users/${target.id}/credits`, { method: 'POST', body: { amount, reason: '管理员控制面板调整' } })
  creditAmount.value[target.id] = 0
  await Promise.all([refreshUsers(), refreshOverview()])
}

async function toggleUser(target: AdminUser) {
  await $fetch(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { status: target.status === 'active' ? 'disabled' : 'active' } })
  await refreshUsers()
}

async function createInvitation() {
  invitation.value = await $fetch('/api/admin/invitations', { method: 'POST', body: { expiresInDays: 14 } })
}

async function createPriceRule() {
  errorMessage.value = ''
  try {
    const durationTiers = priceForm.durationTiers.trim() ? JSON.parse(priceForm.durationTiers) as Record<string, number> : undefined
    await $fetch('/api/admin/pricing', {
      method: 'POST',
      body: {
        provider: priceForm.provider,
        model: priceForm.model,
        resolution: priceForm.resolution,
        version: priceForm.version,
        sourceLabel: priceForm.sourceLabel,
        sourceUrl: priceForm.sourceUrl || undefined,
        formula: {
          fixedCredits: priceForm.fixedCredits,
          outputSecondCredits: priceForm.outputSecondCredits,
          inputVideoSecondCredits: priceForm.inputVideoSecondCredits,
          referenceImageCredits: priceForm.referenceImageCredits,
          minimumCredits: priceForm.minimumCredits,
          durationTiers,
        },
      },
    })
    await refreshPricing()
  }
  catch (error: unknown) {
    errorMessage.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage || '价格规则保存失败'
  }
}

async function handleGeneration(target: AdminGeneration, action: 'refresh' | 'release') {
  errorMessage.value = ''
  try {
    await $fetch(`/api/admin/generations/${target.id}/action`, {
      method: 'POST',
      body: action === 'release'
        ? { action, reason: '管理员确认供应商未受理或任务无需继续扣费' }
        : { action },
    })
    await Promise.all([refreshGenerations(), refreshUsers(), refreshOverview(), refreshAudit()])
  }
  catch (error: unknown) {
    errorMessage.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage || '任务操作失败'
  }
}
</script>

<template>
  <div v-if="user?.role === 'admin'" class="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="type-label text-xs text-primary">
          ADMIN
        </p><h1 class="mt-2 text-3xl font-semibold tracking-tight">
          控制面板
        </h1>
      </div>
      <UButton icon="i-lucide-ticket-plus" @click="createInvitation">
        生成邀请码
      </UButton>
    </div>
    <UAlert v-if="invitation" class="mb-5" color="success" title="邀请码已生成" :description="`${invitation.code} · 有效至 ${new Date(invitation.expiresAt).toLocaleString('zh-CN')}`" />
    <div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
      <UCard v-for="(value, key) in overview" :key="key">
        <p class="text-xs uppercase text-dimmed">
          {{ key }}
        </p><p class="mt-2 text-2xl font-semibold">
          {{ key === 'assetBytes' ? `${(value / 1024 / 1024).toFixed(1)} MB` : value }}
        </p>
      </UCard>
    </div>
    <div class="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <UCard>
        <template #header>
          <strong>用户与额度</strong>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-dimmed">
              <tr>
                <th class="pb-3">
                  用户
                </th><th>状态</th><th>额度</th><th>任务</th><th>操作</th>
              </tr>
            </thead><tbody class="divide-y divide-default">
              <tr v-for="item in users" :key="item.id">
                <td class="py-3 pr-3">
                  <strong>{{ item.displayName }}</strong><span class="block text-xs text-dimmed">{{ item.email }}</span>
                </td><td>
                  <UBadge :color="item.status === 'active' ? 'success' : 'neutral'" variant="subtle">
                    {{ item.status }}
                  </UBadge>
                </td><td>{{ item.balanceCredits }} <span class="text-xs text-dimmed">({{ item.reservedCredits }} 预留)</span></td><td>{{ item.generationCount }}</td><td>
                  <div class="flex gap-2">
                    <UInput v-model.number="creditAmount[item.id]" type="number" class="w-24" size="xs" placeholder="±额度" /><UButton size="xs" variant="soft" @click="adjustCredits(item)">
                      调整
                    </UButton><UButton v-if="item.id !== user.id" size="xs" color="neutral" variant="ghost" @click="toggleUser(item)">
                      {{ item.status === 'active' ? '停用' : '启用' }}
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <div class="space-y-6">
        <UCard>
          <template #header>
            <strong>发布价格版本</strong>
          </template>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="渠道">
              <UInput v-model="priceForm.provider" />
            </UFormField><UFormField label="模型">
              <UInput v-model="priceForm.model" />
            </UFormField><UFormField label="分辨率">
              <UInput v-model="priceForm.resolution" />
            </UFormField><UFormField label="版本">
              <UInput v-model.number="priceForm.version" type="number" />
            </UFormField><UFormField label="每次固定额度">
              <UInput v-model.number="priceForm.fixedCredits" type="number" />
            </UFormField><UFormField label="每输出秒额度">
              <UInput v-model.number="priceForm.outputSecondCredits" type="number" />
            </UFormField><UFormField label="每输入视频秒额度">
              <UInput v-model.number="priceForm.inputVideoSecondCredits" type="number" />
            </UFormField><UFormField label="每参考图额度">
              <UInput v-model.number="priceForm.referenceImageCredits" type="number" />
            </UFormField><UFormField label="最低额度">
              <UInput v-model.number="priceForm.minimumCredits" type="number" />
            </UFormField>
          </div>
          <UFormField class="mt-3" label="时长档位（JSON，可选）">
            <UInput v-model="priceForm.durationTiers" class="w-full" placeholder="{&quot;6&quot;: 20, &quot;10&quot;: 35}" />
          </UFormField>
          <UFormField class="mt-3" label="来源说明">
            <UInput v-model="priceForm.sourceLabel" class="w-full" />
          </UFormField><UFormField class="mt-3" label="官方价格来源 URL（可选）">
            <UInput v-model="priceForm.sourceUrl" class="w-full" />
          </UFormField>
          <p v-if="errorMessage" class="mt-2 text-xs text-red-500">
            {{ errorMessage }}
          </p><UButton class="mt-4" block @click="createPriceRule">
            发布新版本
          </UButton>
        </UCard>
        <UCard>
          <template #header>
            <strong>当前价格规则</strong>
          </template><div class="max-h-80 divide-y divide-default overflow-y-auto">
            <div v-for="rule in pricing" :key="rule.id" class="py-3 text-sm">
              <div class="flex justify-between">
                <strong>{{ rule.provider }} / {{ rule.model }}</strong><span>v{{ rule.version }}</span>
              </div><p class="mt-1 text-xs text-dimmed">
                {{ rule.resolution }} · {{ rule.sourceLabel }} · {{ JSON.stringify(rule.formula) }}
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
    <UCard class="mt-6">
      <template #header>
        <strong>全部生成任务</strong>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-dimmed">
            <tr>
              <th class="pb-3">
                用户
              </th><th>任务</th><th>渠道 / 模型</th><th>状态</th><th>额度</th><th>创建时间</th><th>操作</th>
            </tr>
          </thead><tbody class="divide-y divide-default">
            <tr v-for="item in generations" :key="item.id">
              <td class="py-3 pr-4">
                {{ item.owner.displayName }}<span class="block text-xs text-dimmed">{{ item.owner.email }}</span>
              </td><td class="max-w-80 truncate pr-4" :title="item.prompt">
                {{ item.prompt || '参考素材生成' }}
              </td><td>{{ item.provider }} / {{ item.model || '默认' }}</td><td>
                <UBadge color="neutral" variant="subtle">
                  {{ item.status }}
                </UBadge>
              </td><td>{{ item.billing?.chargedCredits ?? item.billing?.estimatedCredits ?? 0 }} · {{ item.billing?.settlementStatus }}</td><td class="text-xs text-dimmed">
                {{ new Date(item.createdAt).toLocaleString('zh-CN') }}
              </td><td>
                <div v-if="item.billing?.settlementStatus === 'review'" class="flex gap-2">
                  <UButton size="xs" variant="soft" @click="handleGeneration(item, 'refresh')">
                    核对
                  </UButton><UButton size="xs" color="neutral" variant="ghost" @click="handleGeneration(item, 'release')">
                    释放额度
                  </UButton>
                </div><span v-else class="text-xs text-dimmed">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
    <UCard class="mt-6">
      <template #header>
        <strong>管理员审计记录</strong>
      </template>
      <div class="max-h-96 divide-y divide-default overflow-y-auto">
        <div v-for="entry in audit" :key="entry.id" class="grid gap-1 py-3 text-sm md:grid-cols-[12rem_12rem_1fr_12rem]">
          <span>{{ entry.actorEmail || '系统' }}</span><strong>{{ entry.action }}</strong><span class="truncate text-dimmed" :title="JSON.stringify(entry.detail)">{{ entry.targetType }} / {{ entry.targetId }} · {{ JSON.stringify(entry.detail) }}</span><time class="text-xs text-dimmed">{{ new Date(entry.createdAt).toLocaleString('zh-CN') }}</time>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/types/auth'

interface AdminUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  status: string
  balanceCredits: number
  reservedCredits: number
  storageUsedBytes: number
  generationCount: number
}
interface PriceRule {
  id: string
  provider: string
  model: string
  resolution: string
  formula: Record<string, number>
  sourceLabel: string
  version: number
  active: boolean
}
interface AdminGeneration {
  id: string
  provider: string
  model?: string
  status: string
  prompt: string
  createdAt: string
  billing?: {
    estimatedCredits: number
    chargedCredits?: number
    settlementStatus: string
  }
  owner: {
    email: string
    displayName: string
  }
}
interface AuditEntry {
  id: string
  action: string
  targetType: string
  targetId: string
  detail: Record<string, unknown>
  createdAt: string
  actorEmail?: string
}
const { user } = useAuth()
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')
if (session.value?.user?.role !== 'admin')
  await navigateTo('/')
else
  user.value = session.value.user
const { data: overview, refresh: refreshOverview } = await useFetch<Record<string, number>>('/api/admin/overview')
const { data: users, refresh: refreshUsers } = await useFetch<AdminUser[]>('/api/admin/users')
const { data: pricing, refresh: refreshPricing, error: pricingError } = await useFetch<PriceRule[]>('/api/admin/pricing')
const { data: generations, refresh: refreshGenerations } = await useFetch<AdminGeneration[]>('/api/admin/generations')
const { data: audit, refresh: refreshAudit } = await useFetch<AuditEntry[]>('/api/admin/audit')
const creditTarget = ref<AdminUser>()
const creditOpen = ref(false)
const creditAmount = ref(0)
const creditBusy = ref(false)
const creditError = ref('')
const priceOpen = ref(false)
const priceBusy = ref(false)
const priceError = ref('')
const message = ref('')
const priceDefaults = { provider: 'runway', model: '*', resolution: '*', fixedCredits: 0, outputSecondCredits: 20, inputVideoSecondCredits: 0, referenceImageCredits: 0, minimumCredits: 1, durationTiers: '', version: 2, sourceLabel: '管理员配置', sourceUrl: '' }
const priceForm = reactive({ ...priceDefaults })
const errorMessage = ref('')
function openPrice() {
  Object.assign(priceForm, priceDefaults)
  priceError.value = ''
  priceOpen.value = true
}
function openCredits(target: AdminUser) {
  creditTarget.value = target
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
    await $fetch(`/api/admin/users/${creditTarget.value.id}/credits`, { method: 'POST', body: { amount: creditAmount.value, reason: '管理员控制面板调整' } })
    creditOpen.value = false
    message.value = '用户额度已调整'
    await Promise.all([refreshUsers(), refreshOverview()])
  }
  catch (error) { creditError.value = apiError(error) }
  finally { creditBusy.value = false }
}
async function toggleUser(target: AdminUser) {
  await $fetch(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { status: target.status === 'active' ? 'disabled' : 'active' } })
  await refreshUsers()
}
async function createPriceRule() {
  if (priceBusy.value)
    return
  priceBusy.value = true
  priceError.value = ''
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
    priceOpen.value = false
    message.value = '视频价格版本已发布'
    await refreshPricing()
  }
  catch (error: unknown) {
    priceError.value = (error as {
      data?: {
        statusMessage?: string
      }
    }).data?.statusMessage || '价格规则保存失败'
  }
  finally { priceBusy.value = false }
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
    errorMessage.value = (error as {
      data?: {
        statusMessage?: string
      }
    }).data?.statusMessage || '任务操作失败'
  }
}

const overviewMeta: Record<string, { label: string, icon: string, color: string }> = {
  users: { label: '注册用户', icon: 'i-lucide-users', color: 'text-primary' },
  generations: { label: '视频任务', icon: 'i-lucide-film', color: 'text-primary' },
  activeGenerations: { label: '进行中任务', icon: 'i-lucide-loader-circle', color: 'text-amber-500' },
  assetBytes: { label: '存储资产', icon: 'i-lucide-hard-drive', color: 'text-success' },
  connections: { label: '可用连接', icon: 'i-lucide-network', color: 'text-emerald-500' },
  runs: { label: '总执行数', icon: 'i-lucide-activity', color: 'text-warning' },
}
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="message" color="success" variant="subtle" :description="message" />
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />

    <!-- Sleek segmented metrics strip without heavy cards & shadows -->
    <div class="grid grid-cols-2 divide-y divide-default/70 rounded-xl border border-default/70 bg-elevated/50 backdrop-blur-xs sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6">
      <div v-for="(value, key) in overview" :key="key" class="p-4 transition hover:bg-elevated/80 sm:p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-dimmed">
            {{ overviewMeta[key]?.label || key }}
          </span>
          <UIcon :name="overviewMeta[key]?.icon || 'i-lucide-bar-chart'" class="size-4" :class="overviewMeta[key]?.color || 'text-dimmed'" />
        </div>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-highlighted">
          {{ key === 'assetBytes' ? `${(value / 1024 / 1024).toFixed(1)} MB` : value }}
        </p>
      </div>
    </div>

    <!-- Main Data Grid: Users and Pricing -->
    <div class="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
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
          <span class="text-xs text-dimmed">共 {{ users?.length || 0 }} 位用户</span>
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
                <th>任务</th>
                <th class="pr-3 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default/60">
              <tr v-for="item in users" :key="item.id" class="transition hover:bg-muted/30">
                <td class="py-3 pl-3 pr-3">
                  <div class="font-medium text-highlighted">
                    {{ item.displayName }}
                  </div>
                  <span class="block text-xs text-dimmed">{{ item.email }}</span>
                </td>
                <td>
                  <UBadge :color="item.status === 'active' ? 'success' : 'neutral'" variant="subtle" size="xs">
                    {{ item.status }}
                  </UBadge>
                </td>
                <td>
                  <span class="font-mono text-xs">{{ item.balanceCredits }}</span>
                  <span class="text-xs text-dimmed"> ({{ item.reservedCredits }} 预留)</span>
                </td>
                <td class="font-mono text-xs">
                  {{ item.generationCount }}
                </td>
                <td class="pr-3 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <UButton size="xs" variant="soft" color="neutral" @click="openCredits(item)">
                      调整额度
                    </UButton>
                    <UButton v-if="item.id !== user?.id" size="xs" color="neutral" variant="ghost" @click="toggleUser(item)">
                      {{ item.status === 'active' ? '停用' : '启用' }}
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pricing Rules -->
      <div class="space-y-6">
        <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
          <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">
                视频价格规则
              </h2>
              <p class="text-xs text-dimmed">
                供应商与模型计费公式
              </p>
            </div>
            <UButton size="xs" variant="soft" color="primary" icon="i-lucide-plus" @click="openPrice">
              发布价格
            </UButton>
          </div>
          <div class="p-4">
            <UAlert v-if="pricingError" color="error" variant="subtle" title="价格规则加载失败">
              <template #actions>
                <UButton color="error" variant="soft" @click="refreshPricing()">
                  重试
                </UButton>
              </template>
            </UAlert>
            <div v-else class="max-h-80 divide-y divide-default/60 overflow-y-auto">
              <p v-if="!pricing?.length" class="py-6 text-center text-sm text-muted">
                暂无视频价格规则，点击「发布价格」添加。
              </p>
              <div v-for="rule in pricing" :key="rule.id" class="py-3 text-sm">
                <div class="flex items-center justify-between">
                  <strong class="text-highlighted">{{ rule.provider }} / {{ rule.model }}</strong>
                  <UBadge size="xs" variant="subtle" color="neutral">
                    v{{ rule.version }}
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-dimmed">
                  {{ rule.resolution }} · {{ rule.sourceLabel }} · {{ JSON.stringify(rule.formula) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- All Generations Table -->
    <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
      <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            全部生成任务
          </h2>
          <p class="text-xs text-dimmed">
            全站视频与图像生成流水记录
          </p>
        </div>
        <span class="text-xs text-dimmed">共 {{ generations?.length || 0 }} 条任务</span>
      </div>
      <div class="overflow-x-auto p-2">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-dimmed">
            <tr>
              <th class="pb-3 pl-3">
                用户
              </th>
              <th>任务描述</th>
              <th>渠道 / 模型</th>
              <th>状态</th>
              <th>额度</th>
              <th>创建时间</th>
              <th class="pr-3 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default/60">
            <tr v-for="item in generations" :key="item.id" class="transition hover:bg-muted/30">
              <td class="py-3 pl-3 pr-4">
                <div class="font-medium text-highlighted">
                  {{ item.owner.displayName }}
                </div>
                <span class="block text-xs text-dimmed">{{ item.owner.email }}</span>
              </td>
              <td class="max-w-80 truncate pr-4 text-xs text-muted" :title="item.prompt">
                {{ item.prompt || '参考素材生成' }}
              </td>
              <td class="text-xs font-mono">
                {{ item.provider }} / {{ item.model || '默认' }}
              </td>
              <td>
                <UBadge color="neutral" variant="subtle" size="xs">
                  {{ item.status }}
                </UBadge>
              </td>
              <td class="font-mono text-xs">
                {{ item.billing?.chargedCredits ?? item.billing?.estimatedCredits ?? 0 }}
                <span class="text-dimmed">· {{ item.billing?.settlementStatus }}</span>
              </td>
              <td class="text-xs text-dimmed whitespace-nowrap">
                {{ new Date(item.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) }}
              </td>
              <td class="pr-3 text-right">
                <div v-if="item.billing?.settlementStatus === 'review'" class="flex items-center justify-end gap-1.5">
                  <UButton size="xs" variant="soft" @click="handleGeneration(item, 'refresh')">
                    核对
                  </UButton>
                  <UButton size="xs" color="neutral" variant="ghost" @click="handleGeneration(item, 'release')">
                    释放额度
                  </UButton>
                </div>
                <span v-else class="text-xs text-dimmed">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Audit Log -->
    <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
      <div class="border-b border-default/70 px-5 py-4">
        <h2 class="text-sm font-semibold text-highlighted">
          管理员审计记录
        </h2>
        <p class="text-xs text-dimmed">
          系统关键操作与配置变更追踪
        </p>
      </div>
      <div class="max-h-80 divide-y divide-default/60 overflow-y-auto px-5 py-2">
        <div v-for="entry in audit" :key="entry.id" class="grid items-center gap-2 py-3 text-xs md:grid-cols-[10rem_10rem_1fr_10rem]">
          <span class="font-medium text-highlighted">{{ entry.actorEmail || '系统' }}</span>
          <UBadge size="xs" variant="subtle" color="neutral" class="w-fit">
            {{ entry.action }}
          </UBadge>
          <span class="truncate text-dimmed" :title="JSON.stringify(entry.detail)">
            {{ entry.targetType }} / {{ entry.targetId }} · {{ JSON.stringify(entry.detail) }}
          </span>
          <time class="text-right text-dimmed">
            {{ new Date(entry.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) }}
          </time>
        </div>
      </div>
    </div>
    <UModal v-model:open="priceOpen" title="发布视频价格" description="发布新版本后用于后续报价，历史任务保持原价。" :dismissible="!priceBusy" :close="!priceBusy" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form id="video-price-form" @submit.prevent="createPriceRule">
          <fieldset :disabled="priceBusy" class="min-w-0 space-y-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="渠道">
                <UInput v-model="priceForm.provider" class="w-full" />
              </UFormField><UFormField label="模型">
                <UInput v-model="priceForm.model" class="w-full" />
              </UFormField><UFormField label="分辨率">
                <UInput v-model="priceForm.resolution" class="w-full" />
              </UFormField><UFormField label="版本">
                <UInput v-model.number="priceForm.version" class="w-full" type="number" />
              </UFormField><UFormField label="每次固定额度">
                <UInput v-model.number="priceForm.fixedCredits" class="w-full" type="number" />
              </UFormField><UFormField label="每输出秒额度">
                <UInput v-model.number="priceForm.outputSecondCredits" class="w-full" type="number" />
              </UFormField><UFormField label="每输入视频秒额度">
                <UInput v-model.number="priceForm.inputVideoSecondCredits" class="w-full" type="number" />
              </UFormField><UFormField label="每参考图额度">
                <UInput v-model.number="priceForm.referenceImageCredits" class="w-full" type="number" />
              </UFormField><UFormField label="最低额度">
                <UInput v-model.number="priceForm.minimumCredits" class="w-full" type="number" />
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
            <UAlert v-if="priceError" class="mt-4" color="error" variant="subtle" :description="priceError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="priceBusy" @click="priceOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="video-price-form" :loading="priceBusy">
            发布新版本
          </UButton>
        </div>
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
            <UAlert v-if="creditError" color="error" variant="subtle" :description="creditError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="creditBusy" @click="creditOpen = false">
            取消
          </UButton>
          <UButton type="submit" form="credit-form" :loading="creditBusy" :disabled="!creditAmount">
            确认调整
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

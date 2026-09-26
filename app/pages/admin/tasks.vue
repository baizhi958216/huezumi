<script setup lang="ts">
import type { AdminTask } from '#shared/types/admin'

const filter = ref('review')
const search = ref('')
const kind = ref('all')
const page = ref(1)
watch([filter, search, kind], () => {
  page.value = 1
})
const query = computed(() => ({ scope: filter.value, q: search.value, kind: kind.value, page: page.value }))
const { data, error: loadError, status: loadStatus, refresh } = await useFetch<{ items: AdminTask[], hasMore: boolean }>('/api/admin/tasks', { query })
const kindLabels: Record<string, string> = { text: '文案', image: '图片', video: '视频', workflow: '工作流' }
const busy = ref(false)
const open = ref(false)
const target = ref<AdminTask>()
const action = ref<'release' | 'charge'>('release')
const amount = ref(0)
const reason = ref('')
const error = ref('')
const message = ref('')
const actionError = ref('')
const filtered = computed(() => data.value?.items || [])
const statusLabels: Record<string, string> = { PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '生成成功', FAILED: '生成失败', UNKNOWN: '结果待核对' }
const stageLabels: Record<string, string> = { queued: '等待执行', submitting: '正在提交', executing: '执行中', review: '待核对', complete: '处理完成', archived: '已归档', archiving: '归档中', failed: '归档失败', not_started: '尚未归档' }
const settlementLabels: Record<string, string> = { reserved: '已预留', review: '待核对', settled: '已结算', released: '已释放', exempt: '免计费' }
function select(task: AdminTask, next: 'release' | 'charge') {
  target.value = task
  action.value = next
  amount.value = task.credits
  reason.value = ''
  actionError.value = ''
  open.value = true
}
async function sync(task: AdminTask) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    await $fetch(`/api/admin/generations/${task.id}/action`, { method: 'POST', body: { action: 'refresh' } })
    message.value = '已安排同步供应商状态，请稍后刷新查看结果'
    await refresh()
  }
  catch (e) { error.value = apiError(e) }
  finally { busy.value = false }
}
async function settle() {
  if (!target.value || busy.value || reason.value.trim().length < 3)
    return
  busy.value = true
  actionError.value = ''
  message.value = ''
  try {
    const task = target.value
    if (task.source === 'run')
      await $fetch(`/api/admin/runs/${task.id}/settle`, { method: 'POST', body: { action: action.value, reason: reason.value.trim() } })
    else
      await $fetch(`/api/admin/generations/${task.id}/action`, { method: 'POST', body: { action: action.value, ...(action.value === 'charge' ? { amount: amount.value } : {}), reason: reason.value.trim() } })
    open.value = false
    message.value = action.value === 'release' ? '预留额度已释放' : '人工结算已完成'
    await refresh()
  }
  catch (e) { actionError.value = apiError(e) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UTabs v-model="filter" :items="[{ label: '待核对 · 全类型', value: 'review' }, { label: '全部任务', value: 'all' }]" :content="false" /><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" :disabled="busy" @click="refresh()">
        刷新
      </UButton>
    </div>
    <UInput v-model="search" icon="i-lucide-search" placeholder="搜索任务 ID、用户或描述" aria-label="搜索任务" class="w-full sm:max-w-sm" />
    <UAlert v-if="loadError" color="error" title="任务加载失败，请重试" />
    <UAlert v-if="error" color="error" :description="error" /><UAlert v-if="message" color="success" :description="message" />
    <p class="text-xs text-muted">
      执行状态、结算与归档分别显示。状态同步不会重新生成。
    </p>
    <USelect v-model="kind" aria-label="任务类型" :items="[{ label: '全部类型', value: 'all' }, ...Object.entries(kindLabels).map(([value, label]) => ({ value, label }))]" />
    <p v-if="loadStatus === 'pending'" role="status" class="text-sm text-muted">
      正在加载任务…
    </p>
    <div class="divide-y divide-default rounded-xl border border-default bg-default">
      <p v-if="!filtered.length && !loadError && loadStatus !== 'pending'" class="p-10 text-center text-sm text-muted">
        {{ search ? '没有匹配的任务' : '当前列表没有任务' }}
      </p>
      <article v-for="task in filtered" :key="`${task.source}:${task.id}`" class="space-y-3 p-5">
        <div class="flex flex-wrap justify-between gap-3">
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle">
              {{ kindLabels[task.kind] }}
            </UBadge><span class="text-sm font-medium">{{ task.owner }}</span>
          </div><span class="text-xs text-muted">{{ new Date(task.createdAt).toLocaleString('zh-CN') }}</span>
        </div>
        <p class="break-all text-xs text-muted">
          {{ task.id }}
        </p><p class="line-clamp-2 text-sm">
          {{ task.detail }}
        </p>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-muted">
            {{ statusLabels[task.status] || task.status }} · {{ settlementLabels[task.settlement] || task.settlement }} · 预留 {{ task.credits }} · 已扣 {{ task.chargedCredits ?? '—' }} 额度 · {{ stageLabels[task.stage] || task.stage }}
          </p>
          <div v-if="task.settlement === 'review' && task.kind !== 'workflow'" class="flex flex-wrap gap-2">
            <UButton v-if="task.source === 'video' && task.providerTaskId" size="sm" variant="soft" :disabled="busy" @click="sync(task)">
              同步状态
            </UButton><UButton size="sm" variant="outline" color="neutral" :disabled="busy" @click="select(task, 'release')">
              释放预留
            </UButton><UButton size="sm" variant="soft" color="warning" :disabled="busy || task.credits <= 0" @click="select(task, 'charge')">
              人工结算
            </UButton>
          </div>
        </div>
      </article>
    </div>
    <div class="flex items-center justify-end gap-3">
      <UButton color="neutral" variant="outline" :disabled="page <= 1 || loadStatus === 'pending'" @click="page--">
        上一页
      </UButton><span class="text-sm">第 {{ page }} 页</span><UButton color="neutral" variant="outline" :disabled="!data?.hasMore || loadStatus === 'pending'" @click="page++">
        下一页
      </UButton>
    </div>
    <UModal v-model:open="open" :title="action === 'release' ? '确认释放预留额度' : '确认人工结算'" :dismissible="!busy" :close="!busy">
      <template #body>
        <form id="settle-form" class="space-y-4" @submit.prevent="settle">
          <fieldset :disabled="busy" class="space-y-4">
            <p class="break-all text-sm">
              {{ kindLabels[target?.kind || ''] }} · {{ target?.owner }}<br>{{ target?.id }}
            </p><p class="text-sm text-muted">
              {{ action === 'release' ? '确认供应商未受理或无需扣费后，将预留额度退回可用额度。' : '确认供应商实际产生费用后结算；操作会扣减账户余额。' }}
            </p>
            <UFormField v-if="action === 'charge' && target?.source === 'video'" label="扣费额度">
              <UInput v-model.number="amount" type="number" :min="1" :max="target.credits" required />
            </UFormField><p v-else class="text-sm">
              本次{{ action === 'release' ? '释放' : '按报价扣费' }}：{{ target?.credits }} 额度
            </p>
            <UFormField label="核对依据" required>
              <UTextarea v-model="reason" placeholder="填写供应商查询结果或人工核对依据" :minlength="3" :maxlength="240" required class="w-full" />
            </UFormField><UAlert v-if="actionError" color="error" :description="actionError" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :disabled="busy" @click="open = false">
          取消
        </UButton><UButton type="submit" form="settle-form" :color="action === 'charge' ? 'warning' : 'primary'" :loading="busy" :disabled="reason.trim().length < 3">
          确认{{ action === 'release' ? '释放' : '结算' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>

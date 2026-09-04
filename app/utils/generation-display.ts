import type { GenerationRecord, GenerationStatus } from '#shared/types/generation'

export function formatGenerationDate(value?: string, withYear = false) {
  if (!value)
    return '尚未同步'
  return new Intl.DateTimeFormat('zh-CN', { ...(withYear ? { year: 'numeric' as const } : {}), month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function generationRatioStyle(record?: GenerationRecord) {
  const ratio = record?.usage?.ratio || record?.ratio || '16:9'
  return ratio === 'adaptive' ? '16 / 9' : ratio.replace(':', ' / ')
}

export function generationRatioLabel(record: GenerationRecord) {
  const ratio = record.usage?.ratio || record.ratio
  if (ratio === '9:16' || ratio === '3:4')
    return '竖屏'
  if (ratio === '1:1')
    return '方形'
  return '横屏'
}

export function generationStatusLabel(status: GenerationStatus) {
  return ({ PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '已完成', FAILED: '生成失败', UNKNOWN: '状态未知' } satisfies Record<GenerationStatus, string>)[status]
}

export function generationStatusClasses(status: GenerationStatus) {
  if (status === 'SUCCEEDED')
    return 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
  if (status === 'FAILED')
    return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
  return 'bg-signal-50 text-signal-700 dark:bg-signal-950/40 dark:text-signal-300'
}

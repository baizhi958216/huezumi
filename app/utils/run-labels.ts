export const runKindLabel = { text: '文本', video: '视频', image: '图片' }
export const runStatusLabel = { PENDING: '等待执行', RUNNING: '正在生成', SUCCEEDED: '已完成', FAILED: '未完成', UNKNOWN: '待核对' }
export function settlementLabel(value: string) {
  return ({ reserved: '额度已预留', settled: '已结算', released: '额度已释放', review: '待核对费用', exempt: '不扣平台额度' } as Record<string, string>)[value] || '等待确认'
}

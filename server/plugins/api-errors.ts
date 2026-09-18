export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (error, { event }) => {
    if (!event?.path.startsWith('/api/'))
      return
    event.context.requestId ||= crypto.randomUUID()
    setHeader(event, 'x-request-id', event.context.requestId)
    const e = error as Error & {
      statusCode?: number
      statusMessage?: string
      data?: Record<string, unknown>
      cause?: Error
      unhandled?: boolean
      fatal?: boolean
    }
    if (e.name === 'ZodError' || e.cause?.name === 'ZodError') {
      e.statusCode = 422
      e.statusMessage = '请求参数无效，请检查输入'
    }
    const status = e.statusCode || 500
    if (status === 500) {
      e.statusMessage = '服务暂时不可用，请稍后重试'
      e.message = e.statusMessage
    }
    // Only the sanitized error reaches Nitro serialization and request logs.
    e.message = e.statusMessage || '请求失败'
    e.cause = undefined
    e.stack = undefined
    e.unhandled = false
    e.fatal = false
    e.data = { code: typeof e.data?.code === 'string' ? e.data.code : `HTTP_${status}`, message: e.statusMessage || '请求失败', requestId: event.context.requestId }
  })
})

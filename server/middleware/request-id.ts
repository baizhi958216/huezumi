export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/'))
    return
  event.context.requestId = crypto.randomUUID()
  setHeader(event, 'x-request-id', event.context.requestId)
})

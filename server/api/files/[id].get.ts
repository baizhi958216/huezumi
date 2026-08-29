interface UploadMeta {
  name: string
  type: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const storage = useStorage('data')
  const meta = await storage.getItem<UploadMeta>(`uploads:${id}:meta`)
  const data = await storage.getItemRaw<Uint8Array>(`uploads:${id}:data`)
  if (!meta || !data)
    throw createError({ statusCode: 404, statusMessage: '素材不存在或已过期' })

  setHeader(event, 'Content-Type', meta.type)
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return data
})

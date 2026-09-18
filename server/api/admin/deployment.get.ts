import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const c = useRuntimeConfig()
  return { databaseConfigured: Boolean(c.databaseUrl), encryptionConfigured: Boolean(c.connectionEncryptionKey), storageConfigured: Boolean(c.ossBucket && c.ossAccessKeyId && c.ossAccessKeySecret), workerEnabled: Boolean(c.workerEnabled), workerConcurrency: Number(c.workerConcurrency), comfyuiMode: String(c.comfyuiMode) }
})

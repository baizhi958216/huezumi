import type { RunRequest } from '#shared/types/platform'
import { and, desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { creativeDocuments, creativeDocumentVersions, creativeProjects, quotes, textPrices } from '../../database/schema'
import { requestHash } from '../../utils/request-hash'
import { resolveProviderMediaUrls } from '../assets'
import { createQuote } from '../billing'
import { assertRequestSupported } from '../providers'
import { getCapability } from '../providers/catalog'
import { currentConnection } from './connections'
import { runRequestSchema } from './schemas'

export async function validateRunContext(ownerId: string, request: RunRequest) {
  if (request.projectId) {
    const [project] = await useDatabase().select({ id: creativeProjects.id }).from(creativeProjects).where(and(eq(creativeProjects.id, request.projectId), eq(creativeProjects.ownerId, ownerId)))
    if (!project)
      throw createError({ statusCode: 404, statusMessage: '项目不存在' })
  }
  if (request.sourceVersionId) {
    const [version] = await useDatabase().select({ content: creativeDocumentVersions.content }).from(creativeDocumentVersions).innerJoin(creativeDocuments, eq(creativeDocuments.id, creativeDocumentVersions.documentId)).where(and(eq(creativeDocumentVersions.id, request.sourceVersionId), eq(creativeDocuments.ownerId, ownerId)))
    if (!version)
      throw createError({ statusCode: 404, statusMessage: '来源版本不存在' })
    if (request.sourceExcerpt && !version.content.content.includes(request.sourceExcerpt))
      throw createError({ statusCode: 422, statusMessage: '选取片段不属于来源版本' })
  }
  if (request.kind === 'text' && 'documentId' in request.input && request.input.documentId) {
    const [doc] = await useDatabase().select().from(creativeDocuments).where(and(eq(creativeDocuments.id, request.input.documentId), eq(creativeDocuments.ownerId, ownerId)))
    if (!doc || (request.projectId && request.projectId !== doc.projectId))
      throw createError({ statusCode: 404, statusMessage: '文档或项目不存在' })
    if ('kind' in request.input && doc.kind !== request.input.kind)
      throw createError({ statusCode: 422, statusMessage: '不能改变已有文档类型' })
    if (request.baseVersionId !== doc.currentVersionId)
      throw createError({ statusCode: 409, statusMessage: '文档版本已更新' })
    request.projectId = doc.projectId
  }
}
export async function quoteRun(ownerId: string, input: unknown) {
  const request = runRequestSchema.parse(input)
  if (request.kind === 'text') {
    request.projectId ||= request.input.projectId
    delete request.input.projectId
    delete request.input.connectionId
  }
  await validateRunContext(ownerId, request)
  const { connection, version } = await currentConnection(request.connectionId)
  if (connection.kind !== request.kind || !version.settings.models.includes(request.model))
    throw createError({ statusCode: 422, statusMessage: '连接或模型无效' })
  let id: string
  if (request.kind === 'video') {
    request.input.provider = connection.provider
    request.input.model = request.model
    const capability = getCapability(connection.provider)
    if (!capability)
      throw createError({ statusCode: 422, statusMessage: '供应商能力不存在' })
    assertRequestSupported(capability, await resolveProviderMediaUrls(ownerId, request.input))
    id = (await createQuote(ownerId, request.input)).id
    await useDatabase().update(quotes).set({ platformRequest: request, requestHash: requestHash(request), connectionVersionId: version.id }).where(eq(quotes.id, id))
  }
  else {
    const [price] = await useDatabase().select().from(textPrices).where(and(eq(textPrices.connectionId, connection.id), eq(textPrices.model, request.model), eq(textPrices.length, request.input.length))).orderBy(desc(textPrices.version)).limit(1)
    if (!price)
      throw createError({ statusCode: 422, statusMessage: '此模型和篇幅尚未配置价格' })
    const [quote] = await useDatabase().insert(quotes).values({ kind: 'text', userId: ownerId, request: request.input, platformRequest: request, requestHash: requestHash(request), connectionVersionId: version.id, priceVersion: price.version, estimatedCredits: price.credits, expiresAt: new Date(Date.now() + 600000) }).returning()
    id = quote!.id
  }
  const [quote] = await useDatabase().select().from(quotes).where(eq(quotes.id, id))
  return { id, request, estimatedCredits: quote!.estimatedCredits, priceVersion: quote!.priceVersion, expiresAt: quote!.expiresAt.toISOString() }
}

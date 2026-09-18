import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { invitationCodes } from '../../database/schema'
import { hashToken, requireAdmin } from '../../utils/auth'

const schema = z.object({
  expiresInDays: z.number().int().min(1).max(365).default(14),
  count: z.number().int().min(1).max(50).default(1),
  customCode: z.string().trim().min(3).max(64).regex(/^[\w-]+$/, '自定义邀请码仅支持字母、数字、下划线及短横线').optional(),
  note: z.string().trim().max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({ statusCode: 422, statusMessage: issue?.message || '请求参数无效' })
  }

  const { expiresInDays, count, customCode, note } = parsed.data
  if (customCode && count > 1) {
    throw createError({ statusCode: 422, statusMessage: '指定自定义邀请码时数量必须为 1' })
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 86400000)
  const db = useDatabase()

  if (customCode) {
    const codeHash = hashToken(customCode)
    const [existing] = await db.select({ id: invitationCodes.id }).from(invitationCodes).where(eq(invitationCodes.codeHash, codeHash)).limit(1)
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: '该自定义邀请码已存在' })
    }
    const [created] = await db.insert(invitationCodes).values({
      codeHash,
      code: customCode,
      note: note || null,
      createdBy: admin.id,
      expiresAt,
    }).returning({
      id: invitationCodes.id,
      code: invitationCodes.code,
      note: invitationCodes.note,
      expiresAt: invitationCodes.expiresAt,
      createdAt: invitationCodes.createdAt,
    })

    if (!created) {
      throw createError({ statusCode: 500, statusMessage: '创建自定义邀请码失败' })
    }

    return {
      code: customCode,
      expiresAt: expiresAt.toISOString(),
      items: [{
        id: created.id,
        code: customCode,
        note: created.note,
        expiresAt: expiresAt.toISOString(),
        createdAt: created.createdAt.toISOString(),
      }],
    }
  }

  const valuesToInsert: {
    codeHash: string
    code: string
    note: string | null
    createdBy: string
    expiresAt: Date
  }[] = []

  const generatedCodes: string[] = []
  for (let i = 0; i < count; i++) {
    // 采用更易阅读且安全的随机串
    const random = randomBytes(9).toString('base64url').replace(/[-_]/g, 'X')
    const code = `VDO-${random.toUpperCase()}`
    const codeHash = hashToken(code)
    generatedCodes.push(code)
    valuesToInsert.push({
      codeHash,
      code,
      note: note || null,
      createdBy: admin.id,
      expiresAt,
    })
  }

  const createdRows = await db.insert(invitationCodes).values(valuesToInsert).returning({
    id: invitationCodes.id,
    code: invitationCodes.code,
    note: invitationCodes.note,
    expiresAt: invitationCodes.expiresAt,
    createdAt: invitationCodes.createdAt,
  })

  const items = createdRows.map(row => ({
    id: row.id,
    code: row.code || '',
    note: row.note,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    code: items[0]?.code || '',
    expiresAt: expiresAt.toISOString(),
    items,
  }
})

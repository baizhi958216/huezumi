import { aliasedTable, desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { invitationCodes, users } from '../../database/schema'
import { requireAdmin } from '../../utils/auth'

export interface AdminInvitationItem {
  id: string
  code: string | null
  codeHashPrefix: string
  note: string | null
  status: 'active' | 'used' | 'expired'
  createdAt: string
  expiresAt: string | null
  usedAt: string | null
  creator: {
    id: string
    email: string
    displayName: string | null
  } | null
  usedBy: {
    id: string
    email: string
    displayName: string | null
  } | null
}

export interface AdminInvitationsResponse {
  items: AdminInvitationItem[]
  stats: {
    total: number
    active: number
    used: number
    expired: number
  }
}

export default defineEventHandler(async (event): Promise<AdminInvitationsResponse> => {
  await requireAdmin(event)
  const query = getQuery(event)
  const statusFilter = typeof query.status === 'string' ? query.status : 'all'
  const search = typeof query.q === 'string' ? query.q.trim().toLowerCase() : ''
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit || '200'), 10) || 200, 1), 500)

  const db = useDatabase()
  const creators = aliasedTable(users, 'creators')
  const redeemers = aliasedTable(users, 'redeemers')

  const rows = await db
    .select({
      id: invitationCodes.id,
      code: invitationCodes.code,
      codeHash: invitationCodes.codeHash,
      note: invitationCodes.note,
      createdAt: invitationCodes.createdAt,
      expiresAt: invitationCodes.expiresAt,
      usedAt: invitationCodes.usedAt,
      creatorId: creators.id,
      creatorEmail: creators.email,
      creatorName: creators.displayName,
      usedById: redeemers.id,
      usedByEmail: redeemers.email,
      usedByName: redeemers.displayName,
    })
    .from(invitationCodes)
    .leftJoin(creators, eq(creators.id, invitationCodes.createdBy))
    .leftJoin(redeemers, eq(redeemers.id, invitationCodes.usedBy))
    .orderBy(desc(invitationCodes.createdAt))
    .limit(limit)

  const now = new Date()
  let total = 0
  let active = 0
  let used = 0
  let expired = 0

  const allItems: AdminInvitationItem[] = rows.map((row) => {
    let status: 'active' | 'used' | 'expired' = 'active'
    if (row.usedAt) {
      status = 'used'
    }
    else if (row.expiresAt && new Date(row.expiresAt) < now) {
      status = 'expired'
    }

    total++
    if (status === 'active')
      active++
    else if (status === 'used')
      used++
    else if (status === 'expired')
      expired++

    return {
      id: row.id,
      code: row.code,
      codeHashPrefix: row.codeHash ? `${row.codeHash.slice(0, 8)}...` : '',
      note: row.note,
      status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      usedAt: row.usedAt ? row.usedAt.toISOString() : null,
      creator: row.creatorId
        ? {
            id: row.creatorId,
            email: row.creatorEmail || '',
            displayName: row.creatorName,
          }
        : null,
      usedBy: row.usedById
        ? {
            id: row.usedById,
            email: row.usedByEmail || '',
            displayName: row.usedByName,
          }
        : null,
    }
  })

  // 过滤
  let filtered = allItems
  if (statusFilter && statusFilter !== 'all') {
    filtered = filtered.filter(item => item.status === statusFilter)
  }

  if (search) {
    filtered = filtered.filter((item) => {
      const codeMatch = item.code?.toLowerCase().includes(search)
      const noteMatch = item.note?.toLowerCase().includes(search)
      const userMatch = item.usedBy?.email?.toLowerCase().includes(search) || item.usedBy?.displayName?.toLowerCase().includes(search)
      const creatorMatch = item.creator?.email?.toLowerCase().includes(search) || item.creator?.displayName?.toLowerCase().includes(search)
      return Boolean(codeMatch || noteMatch || userMatch || creatorMatch)
    })
  }

  return {
    items: filtered,
    stats: {
      total,
      active,
      used,
      expired,
    },
  }
})

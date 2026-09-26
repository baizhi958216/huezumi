import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../database/client'
import { assets, generations, users, wallets } from '../../../database/schema'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = z.object({ q: z.string().trim().max(200).default(''), page: z.coerce.number().int().min(1).max(100000).optional() }).parse(getQuery(event))
  return await useDatabase().select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    role: users.role,
    status: users.status,
    balanceCredits: wallets.balanceCredits,
    reservedCredits: wallets.reservedCredits,
    storageLimitBytes: users.storageLimitBytes,
    storageUsedBytes: sql<number>`coalesce((select sum(${assets.size}) from ${assets} where ${assets.ownerId} = ${users.id} and ${assets.deletedAt} is null), 0)::bigint`,
    generationCount: sql<number>`(select count(*) from ${generations} where ${generations.ownerId} = ${users.id})::int`,
    createdAt: users.createdAt,
  }).from(users).leftJoin(wallets, eq(wallets.userId, users.id)).where(sql`(${query.q} = '' or strpos(lower(${users.email} || ' ' || ${users.displayName}), lower(${query.q})) > 0)`).orderBy(desc(users.createdAt), desc(users.id)).limit(query.page ? 31 : 200).offset(query.page ? (query.page - 1) * 30 : 0)
})

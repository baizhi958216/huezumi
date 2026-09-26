import type { AdminTask } from '#shared/types/admin'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { requireAdmin } from '../../utils/auth'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  scope: z.enum(['review', 'all']).default('review'),
  kind: z.enum(['all', 'text', 'image', 'video', 'workflow']).default('all'),
  q: z.string().trim().max(200).default(''),
})
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = querySchema.parse(getQuery(event))
  const size = 30
  const rows = await useDatabase().execute<AdminTask & Record<string, unknown>>(sql`
    with tasks as (
      select r.id, 'run' as source, r.kind, u.email as owner, r.status,
        r.settlement_status as settlement, r.reserved_credits as credits,
        r.charged_credits as "chargedCredits", coalesce(r.error, r.request->'input'->>'prompt', r.request->'input'->>'brief', '') as detail,
        r.created_at as "createdAt", null::text as "providerTaskId", r.stage
      from runs r join users u on u.id = r.owner_id where r.kind <> 'video'
      union all
      select g.id, 'video', 'video', u.email, g.status, g.settlement_status::text,
        g.reserved_credits, g.charged_credits, coalesce(g.error, g.request->>'prompt', ''),
        g.created_at, g.provider_task_id, g.output_archive->>'status'
      from generations g join users u on u.id = g.owner_id
    )
    select * from tasks
    where (${query.scope} = 'all' or settlement = 'review')
      and (${query.kind} = 'all' or kind = ${query.kind})
      and (${query.q} = '' or strpos(lower(id::text || ' ' || owner || ' ' || detail), lower(${query.q})) > 0)
    order by "createdAt" desc, id desc
    limit ${size + 1} offset ${(query.page - 1) * size}
  `)
  return { items: rows.rows.slice(0, size), hasMore: rows.rows.length > size }
})

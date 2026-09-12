import type { Pool } from 'pg'

export async function incrementRateLimit(pool: Pool, key: string, windowSeconds: number) {
  const { rows } = await pool.query<{ count: number }>(`
    insert into rate_limit_buckets (key, count, expires_at)
    values ($1, 1, now() + $2 * interval '1 second')
    on conflict (key) do update set
      count = case when rate_limit_buckets.expires_at <= now() then 1 else rate_limit_buckets.count + 1 end,
      expires_at = case when rate_limit_buckets.expires_at <= now()
        then now() + $2 * interval '1 second' else rate_limit_buckets.expires_at end
    returning count
  `, [key, windowSeconds])
  if (!rows[0])
    throw new Error('Rate limit counter was not returned')
  return rows[0].count
}

export async function pruneRateLimits(pool: Pool) {
  await pool.query(`
    delete from rate_limit_buckets where key in (
      select key from rate_limit_buckets where expires_at <= now()
      order by expires_at limit 1000 for update skip locked
    )
  `)
}

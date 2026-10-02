import process from 'node:process'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.NUXT_DATABASE_URL, connectionTimeoutMillis: 5000 })
const client = await pool.connect()
try {
  await client.query('begin')
  await client.query('insert into runs(owner_id,kind,generation_id,idempotency_key,request_hash,quote_id,connection_version_id,created_at,updated_at) select owner_id,\'video\',id,\'legacy:\'||id,request_hash,quote_id,connection_version_id,created_at,updated_at from generations on conflict do nothing')
  await client.query('insert into works(owner_id,kind,title,summary,run_id,generation_id,source_key,availability,created_at) select g.owner_id,\'video\',left(coalesce(nullif(g.request->>\'prompt\',\'\'),\'视频作品\'),100),left(coalesce(g.request->>\'prompt\',\'\'),500),r.id,g.id,\'generation:\'||g.id,case when g.video_archived then \'available\' else \'unavailable\' end,g.created_at from generations g join runs r on r.generation_id=g.id where g.status=\'SUCCEEDED\' on conflict(source_key) do nothing')
  await client.query('insert into works(owner_id,kind,title,summary,project_id,document_id,version_id,source_key,availability,created_at) select d.owner_id,\'text\',d.title,v.content->>\'summary\',d.project_id,d.id,v.id,\'document:\'||d.id,\'available\',d.created_at from creative_documents d join creative_document_versions v on v.id=d.current_version_id on conflict(source_key) do nothing')
  await client.query('update ledger_entries l set run_id=r.id from runs r where l.generation_id=r.generation_id and l.run_id is null')
  await client.query('commit')
  console.log('Platform identities and work summaries backfilled; historical billing unchanged.')
}
catch {
  await client.query('rollback')
  console.error('Backfill failed; transaction rolled back.')
  process.exitCode = 1
}
finally {
  client.release()
  await pool.end()
}

// Weekly backup of the portal's data (Jose, 22 Oct 2026). Every Sunday the
// database schedule calls this; it copies every business table into one
// compressed file in the PRIVATE storage bucket "backups":
//   backups/db/2026-10-25.json.gz   { made_at, tables: { jobs: [...], ... } }
// and copies any uploaded file not copied before into backups/files/<same path>.
// The 12 newest database copies are kept. Secrets (ULIP token, bot schedule
// password) are never copied. Only the schedule may run it.
import { adminClient, json } from '../_shared/ulip.ts'

// business data; left out: ulip_token (a live secret), bot_state (holds the
// schedule password), ulip_inflight (empty working table)
const TABLES = [
  'jobs', 'activity_log', 'container_tracking', 'customs_status', 'documents', 'be_drafts', 'job_extractions',
  'client_master', 'profiles', 'ulip_results', 'ulip_calls', 'vessel_positions', 'ship_directory', 'bot_inbox', 'bot_sent',
]
const BUCKET = 'backups'
const KEEP = 12
const PAGE = 1000

Deno.serve(async (req) => {
  const admin = adminClient()
  // only the database schedule (bot_state.cron_token, never shown to anyone)
  const secret = req.headers.get('x-bot-secret')
  const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
  const ok = [Deno.env.get('BOT_CRON_SECRET') || '', String(st?.cron_token || '')].map((s) => s.trim()).filter((s) => s.length >= 20)
  if (!secret || !ok.includes(secret.trim())) return json({ success: false, error: 'Not allowed' }, 403)

  // 1. every table, read in pages
  const tables: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  const problems: string[] = []
  for (const t of TABLES) {
    const rows: unknown[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.from(t).select('*').range(from, from + PAGE - 1)
      if (error) { problems.push(`${t}: ${error.message}`); break }
      rows.push(...(data || []))
      if (!data || data.length < PAGE) break
    }
    tables[t] = rows
    counts[t] = rows.length
  }
  // a backup missing the jobs is no backup: stop instead of saving it
  if (problems.some((p) => p.startsWith('jobs:'))) return json({ success: false, error: problems.join('; ') }, 500)

  // 2. one compressed file for the week
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const body = new TextEncoder().encode(JSON.stringify({ made_at: new Date().toISOString(), counts, problems, tables }))
  const gz = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  const path = `db/${day}.json.gz`
  const up = await admin.storage.from(BUCKET).upload(path, gz, { contentType: 'application/gzip', upsert: true })
  if (up.error) return json({ success: false, error: `Could not save the backup: ${up.error.message}` }, 500)

  // 3. keep the newest copies only
  const { data: old } = await admin.storage.from(BUCKET).list('db', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
  const extra = (old || []).map((f) => f.name).filter((n) => n.endsWith('.json.gz')).slice(KEEP)
  if (extra.length) await admin.storage.from(BUCKET).remove(extra.map((n) => `db/${n}`))

  // 4. every uploaded file (job documents, OCR uploads): copy the ones not backed
  // up yet (files never change once uploaded)
  let filesCopied = 0
  const listAll = async (bucket: string, prefix: string, out: string[]): Promise<string[]> => {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
      for (const f of data || []) {
        const p = prefix ? `${prefix}/${f.name}` : f.name
        if (f.id) out.push(p)
        else await listAll(bucket, p, out) // a folder
      }
      if (!data || data.length < 1000) return out
    }
  }
  const have = new Set(await listAll(BUCKET, 'files', []))
  for (const src of await listAll('job-documents', '', [])) {
    if (have.has(`files/${src}`)) continue
    const { data: blob, error } = await admin.storage.from('job-documents').download(src)
    if (error || !blob) { problems.push(`file ${src}: ${error?.message || 'not found'}`); continue }
    const res = await admin.storage.from(BUCKET).upload(`files/${src}`, blob, { contentType: blob.type || 'application/octet-stream', upsert: false })
    if (res.error) problems.push(`file ${src}: ${res.error.message}`)
    else filesCopied++
  }

  console.log(`[weekly-backup] ${path} ${gz.byteLength} bytes; rows ${JSON.stringify(counts)}; files copied ${filesCopied}; problems ${problems.length}`)
  return json({ success: true, file: path, bytes: gz.byteLength, counts, filesCopied, removedOld: extra.length, problems })
})

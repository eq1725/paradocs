/**
 * Cron: /api/cron/embed-reports — V11.21.3
 *
 * Keeps the semantic-search corpus at ~100% coverage so newly-ingested
 * reports are searchable in the onboarding reveal (and the Lab RADAR).
 * The daemon + mass-ingest scripts insert reports but don't embed them;
 * this cron embeds any of the NEWEST approved reports that lack a
 * vector_chunks embedding.
 *
 * Why newest-first: new reports land at the recent end of created_at, so
 * we scan the most-recent window and embed whatever's missing. (A full
 * historical backfill is a one-time job — scripts/backfill-report-
 * embeddings-fast.ts — not this cron.)
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) or x-admin-key header.
 * Schedule: every 2 hours (vercel.json). maxDuration 300s, cost-capped.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { embedReport } from '@/lib/services/embedding.service'

export const config = { api: { responseLimit: false }, maxDuration: 300 }

var SCAN_WINDOW = 2500   // newest approved reports to check per run
var MAX_EMBED = 1200     // cap embeds per run (cost + time guard)
var DEADLINE_MS = 250000 // leave headroom under the 300s function limit

async function authed(req: NextApiRequest): Promise<boolean> {
  var cronSecret = process.env.CRON_SECRET
  var auth = req.headers.authorization || ''
  if (cronSecret && auth === 'Bearer ' + cronSecret) return true
  var adminKey = req.headers['x-admin-key']
  if (typeof adminKey === 'string' && adminKey === process.env.ADMIN_API_KEY) return true
  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await authed(req))) return res.status(401).json({ error: 'Unauthorized' })
  if (!process.env.OPENAI_API_KEY) return res.status(200).json({ ok: true, embedded: 0, skipped_reason: 'no_openai_key' })

  var start = Date.now()
  var supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Newest approved report ids.
  var { data: recent, error: recErr } = await supabase
    .from('reports').select('id').eq('status', 'approved')
    .order('created_at', { ascending: false }).limit(SCAN_WINDOW)
  if (recErr || !recent) return res.status(500).json({ error: 'fetch recent failed: ' + (recErr?.message || 'unknown') })
  var ids = recent.map(function (r: any) { return r.id })

  // 2. Which of those already have an embedding (embedding_sync), in chunks.
  var embeddedSet = new Set<string>()
  for (var i = 0; i < ids.length; i += 500) {
    var slice = ids.slice(i, i + 500)
    var { data: syncRows } = await supabase
      .from('embedding_sync').select('source_id')
      .eq('source_table', 'report').in('source_id', slice)
    for (var sr of (syncRows || []) as any[]) embeddedSet.add(sr.source_id)
  }
  var missing = ids.filter(function (id: string) { return !embeddedSet.has(id) })

  // 3. Embed the missing ones (capped + time-boxed).
  var embedded = 0, errors = 0, n = 0
  for (var id of missing) {
    if (embedded >= MAX_EMBED || Date.now() - start > DEADLINE_MS) break
    try {
      var r = await embedReport(id)
      if (!r.skipped) embedded++
    } catch (e: any) {
      errors++
    }
    if (++n % 20 === 0) await new Promise(function (resolve) { setTimeout(resolve, 800) }) // gentle on the OpenAI rate limit
  }

  return res.status(200).json({
    ok: true,
    scanned: ids.length,
    missing: missing.length,
    embedded: embedded,
    errors: errors,
    remaining: Math.max(0, missing.length - embedded - errors),
    elapsed_ms: Date.now() - start,
  })
}

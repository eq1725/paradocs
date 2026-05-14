/**
 * /api/admin/ingest-audit — V10.8.D
 *
 * Admin endpoint backing /admin/ingest-audit. Reads from the
 * ingestion_audit table populated by the engine's
 * validateReportBeforeInsert hook.
 *
 * GET — list audit rows + aggregate stats. Query params:
 *   severity   — 'warning' | 'error' (optional)
 *   code       — validation code, e.g. DATE_SENTINEL_EXACT (optional)
 *   adapter    — adapter type, e.g. 'oberf' (optional)
 *   since_days — restrict to last N days (default 7, max 90)
 *   limit      — page size (default 100, max 500)
 *   offset     — pagination offset
 *
 * Auth: admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Admin auth — mirrors /api/admin/ai-audit
  var authHeader = req.headers.authorization || ''
  var token = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  var { data: profile } = await (admin.from('profiles') as any)
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!profile || (profile as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var severity = req.query.severity as string | undefined
  var code = req.query.code as string | undefined
  var adapter = req.query.adapter as string | undefined
  var sinceDays = Math.min(parseInt((req.query.since_days as string) || '7') || 7, 90)
  var limit = Math.min(parseInt((req.query.limit as string) || '100') || 100, 500)
  var offset = parseInt((req.query.offset as string) || '0') || 0

  var since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  // Rows query
  var q = (admin.from('ingestion_audit') as any)
    .select('*', { count: 'exact' })
    .gte('created_at', since)
  if (severity) q = q.eq('severity', severity)
  if (code) q = q.eq('code', code)
  if (adapter) q = q.eq('adapter', adapter)

  var { data: rows, count, error } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })

  // Aggregate buckets for the dashboard headline.
  //
  // We compute top-codes (last 7d), top-adapters (last 7d), and
  // severity totals (last 7d) client-side here so the page renders
  // with one round trip. The numbers should never be huge — we
  // only emit 1-2 audit rows per ingested report at most.
  var { data: aggRaw } = await (admin.from('ingestion_audit') as any)
    .select('severity, code, adapter, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  var byCode: Record<string, number> = {}
  var byAdapter: Record<string, number> = {}
  var bySeverity: Record<string, number> = { warning: 0, error: 0 }

  for (var row of (aggRaw || [])) {
    byCode[(row as any).code] = (byCode[(row as any).code] || 0) + 1
    byAdapter[(row as any).adapter] = (byAdapter[(row as any).adapter] || 0) + 1
    var sev = (row as any).severity as string
    bySeverity[sev] = (bySeverity[sev] || 0) + 1
  }

  var topCodes = Object.entries(byCode)
    .sort(function(a, b) { return b[1] - a[1] })
    .slice(0, 5)
    .map(function(e) { return { code: e[0], count: e[1] } })

  var topAdapters = Object.entries(byAdapter)
    .sort(function(a, b) { return b[1] - a[1] })
    .slice(0, 5)
    .map(function(e) { return { adapter: e[0], count: e[1] } })

  // Distinct values for filter dropdowns (so the page doesn't have to
  // hard-code them — the set grows as we add adapters and codes).
  var distinctCodes = Array.from(new Set((aggRaw || []).map(function(r: any) { return r.code as string }))).sort()
  var distinctAdapters = Array.from(new Set((aggRaw || []).map(function(r: any) { return r.adapter as string }))).sort()

  // Quarantine counter — separate query against `reports`.
  var { count: quarantineCount } = await (admin.from('reports') as any)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'quarantine')

  return res.status(200).json({
    rows: rows || [],
    total: count || 0,
    stats: {
      window_days: 7,
      total_last_7d: (aggRaw || []).length,
      warnings_last_7d: bySeverity.warning || 0,
      errors_last_7d: bySeverity.error || 0,
      top_codes: topCodes,
      top_adapters: topAdapters,
      quarantine_rows: quarantineCount || 0,
    },
    filter_options: {
      codes: distinctCodes,
      adapters: distinctAdapters,
    },
  })
}

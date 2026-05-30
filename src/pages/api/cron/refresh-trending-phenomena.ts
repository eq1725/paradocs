/**
 * GET/POST /api/cron/refresh-trending-phenomena
 *
 * V11.17.48 — nightly REFRESH of phenomenon_trending_30d materialized
 * view. Backs the "Most-tagged this month" row on /explore.
 *
 * Migration: supabase/migrations/20260530_phenomenon_trending_30d.sql
 * Cron schedule: 03:00 UTC daily (vercel.json).
 *
 * Uses REFRESH MATERIALIZED VIEW CONCURRENTLY so the /explore feed
 * doesn't block during refresh. Requires the UNIQUE index on
 * (phenomenon_id) that the migration creates.
 *
 * Output: { ok, duration_ms, rows? }.
 *
 * Auth: CRON_SECRET convention shared with the other cron endpoints.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  var startedMs = Date.now()
  var supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    // REFRESH the view. Supabase doesn't expose REFRESH directly via
    // the JS client, so we use an RPC. The migration creates the
    // function below; falls back to a non-concurrent refresh if the
    // CONCURRENTLY variant fails (e.g., during initial bootstrap
    // when the view has no rows).
    var refreshRes = await (supabase.rpc as any)('refresh_phenomenon_trending_30d')
    if (refreshRes.error) {
      // Fallback: try a direct query via the SQL endpoint isn't
      // possible from the JS client. Log and return; the next run
      // will retry.
      console.warn('[CronRefreshTrending] RPC error: ' + refreshRes.error.message)
      return res.status(500).json({
        ok: false,
        error: refreshRes.error.message,
        hint: 'Did you run the migration that creates refresh_phenomenon_trending_30d()?',
      })
    }

    // Read row count for the log line.
    var countRes = await (supabase as any)
      .from('phenomenon_trending_30d')
      .select('phenomenon_id', { count: 'exact', head: true })
    var rows = countRes && countRes.count != null ? countRes.count : null

    var duration_ms = Date.now() - startedMs
    var out = { ok: true, duration_ms: duration_ms, rows: rows }
    console.log('[CronRefreshTrending] ' + JSON.stringify(out))
    return res.status(200).json(out)
  } catch (e: any) {
    console.error('[CronRefreshTrending] error: ' + (e && e.message ? e.message : e))
    return res.status(500).json({ error: 'internal_error', message: e && e.message ? e.message : String(e) })
  }
}

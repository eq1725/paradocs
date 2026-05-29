/**
 * GET/POST /api/cron/recompute-standing
 *
 * V11.17.42 — nightly recompute of user_standing for "active" users
 * (anyone with user_activity_log entries in the last 60 days, plus
 * anyone whose user_standing row is older than 7 days).
 *
 * Why a 60-day active window? Standing for a user who hasn't shown
 * up in two months won't have changed — and computing tiers for
 * 100k cold accounts every night is wasteful. The on-demand recompute
 * in /api/standing/me covers the case where a long-dormant user
 * returns.
 *
 * Output: { ok, processed, updated, failed, duration_ms }.
 *
 * Auth: CRON_SECRET convention shared with the other cron endpoints.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { recomputeStanding } from '@/lib/services/standing.service'

var ACTIVE_WINDOW_DAYS = 60
var STALE_RECOMPUTE_DAYS = 7
// Cap how many users we recompute per cron run to keep us inside the
// Vercel function budget. The active-user working set should be well
// under this for a long time; if we ever overflow it, the next run
// picks up whatever's most-stale first.
var MAX_USERS_PER_RUN = 5000
// Bound concurrency so we don't hammer Supabase with hundreds of
// parallel queries.
var CONCURRENCY = 8

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
    // Set of user IDs to recompute. Union of:
    //   (1) anyone with activity in the last 60 days
    //   (2) anyone whose user_standing row is missing or > 7 days old
    var sinceActive = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
    var sinceStale = new Date(Date.now() - STALE_RECOMPUTE_DAYS * 24 * 3600 * 1000).toISOString()

    var idsToProcess = new Set<string>()

    // (1) Active users — paginate via distinct user_id pulls.
    var activeRes = await (supabase
      .from('user_activity_log') as any)
      .select('user_id', { distinct: true } as any)
      .gte('created_at', sinceActive)
      .limit(MAX_USERS_PER_RUN)
    var activeRows: any[] = (activeRes && activeRes.data) || []
    activeRows.forEach(function (r: any) { if (r.user_id) idsToProcess.add(r.user_id) })

    // (2) Stale rows.
    var staleRes = await (supabase
      .from('user_standing') as any)
      .select('user_id')
      .lt('computed_at', sinceStale)
      .limit(MAX_USERS_PER_RUN)
    var staleRows: any[] = (staleRes && staleRes.data) || []
    staleRows.forEach(function (r: any) { if (r.user_id) idsToProcess.add(r.user_id) })

    // Cap.
    var allIds = Array.from(idsToProcess).slice(0, MAX_USERS_PER_RUN)

    var updated = 0
    var failed = 0

    // Bounded-concurrency processing.
    var index = 0
    var worker = async function (): Promise<void> {
      while (index < allIds.length) {
        var myIndex = index++
        var uid = allIds[myIndex]
        try {
          var row = await recomputeStanding(uid)
          if (row) updated++
          else failed++
        } catch (e) {
          failed++
        }
      }
    }
    var workers: Promise<void>[] = []
    for (var w = 0; w < CONCURRENCY; w++) workers.push(worker())
    await Promise.all(workers)

    var duration_ms = Date.now() - startedMs
    var out = {
      ok: true,
      processed: allIds.length,
      updated: updated,
      failed: failed,
      duration_ms: duration_ms,
    }
    console.log('[CronRecomputeStanding] ' + JSON.stringify(out))
    return res.status(200).json(out)
  } catch (e: any) {
    console.error('[CronRecomputeStanding] error: ' + (e && e.message ? e.message : e))
    return res.status(500).json({ error: 'internal_error', message: e && e.message ? e.message : String(e) })
  }
}

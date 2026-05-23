/**
 * GET/POST /api/cron/reconcile-phenomena-counts
 *
 * T1.1 — Nightly safety-net cron that recomputes phenomena.report_count
 * from the report_phenomena junction table, filtered to approved reports.
 *
 * Why this exists:
 *   - The INSERT/DELETE trigger on report_phenomena (defined in
 *     012_phenomena_encyclopedia.sql) maintains a live count of all
 *     report_phenomena rows for each phenomenon. That count does NOT
 *     filter by report.status, so it drifts whenever:
 *       - a report transitions status (pending → approved → deleted)
 *       - a report is hard-deleted leaving orphaned report_phenomena rows
 *       - bulk-import bypassed the trigger (Session 10 cleanup left
 *         Shadow Person showing 9,675 when actual was 0)
 *   - Display surfaces (/explore drill-down, /phenomena/[slug], Today
 *     feed Spotlight) need the count to reflect APPROVED-only reports.
 *
 * What this cron does:
 *   1. Fetch all approved report IDs (status='approved').
 *   2. Fetch all report_phenomena rows.
 *   3. Recompute per-phenomenon counts (only counting links to
 *      approved reports).
 *   4. UPDATE phenomena.report_count where the cached value differs
 *      from the recomputed value.
 *
 * Cadence: daily at 03:00 UTC via Vercel cron (vercel.json). Manual
 * trigger via x-admin-key header for ad-hoc reconciliation.
 *
 * Auth (matches signal-alerts.ts pattern):
 *   - Bearer ${CRON_SECRET} (Vercel cron)
 *   - x-admin-key header (manual / one-off)
 *
 * Returns: { checked, updated, total_links_seen, total_approved_seen,
 *            errors, top_drift }
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export var config = {
  maxDuration: 60,
}

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
var CRON_SECRET = process.env.CRON_SECRET || ''
var ADMIN_KEY = process.env.ADMIN_API_KEY || ''

function isAuthorized(req: NextApiRequest): boolean {
  var bearer = req.headers.authorization
  if (bearer && CRON_SECRET && bearer === 'Bearer ' + CRON_SECRET) return true
  var adminKey = req.headers['x-admin-key']
  if (adminKey && ADMIN_KEY && adminKey === ADMIN_KEY) return true
  return false
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' })
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  var startedAt = Date.now()
  var topDrift: Array<{ id: string; name: string; before: number; after: number }> = []

  try {
    // 1. Fetch approved report IDs (paginated — Supabase REST caps single
    // queries at ~1000 rows server-side regardless of .limit(N), so the
    // old `.limit(100000)` was silently truncating to 1000 and the
    // reconcile was nuking real counts to 0. V11.15.3.2 fix.
    var approvedSet = new Set<string>()
    var offset = 0
    while (true) {
      var pageRes: { data: Array<{ id: string }> | null; error: any } =
        await svc.from('reports').select('id').eq('status', 'approved').range(offset, offset + 999)
      if (pageRes.error) throw pageRes.error
      var batch = pageRes.data || []
      for (var i = 0; i < batch.length; i++) approvedSet.add(batch[i].id)
      if (batch.length < 1000) break
      offset += 1000
      if (offset > 500000) break // safety cap
    }

    // 2. Fetch all report_phenomena rows (paginated for same reason).
    var rpRows: Array<{ phenomenon_id: string; report_id: string }> = []
    var rpOffset = 0
    while (true) {
      var rpPage: { data: Array<{ phenomenon_id: string; report_id: string }> | null; error: any } =
        await svc.from('report_phenomena').select('phenomenon_id, report_id').range(rpOffset, rpOffset + 999)
      if (rpPage.error) throw rpPage.error
      var rpBatch = rpPage.data || []
      for (var b = 0; b < rpBatch.length; b++) rpRows.push(rpBatch[b])
      if (rpBatch.length < 1000) break
      rpOffset += 1000
      if (rpOffset > 5000000) break // safety cap
    }

    // 3. Compute real counts (approved-only)
    var realCounts: Record<string, number> = {}
    for (var j = 0; j < rpRows.length; j++) {
      var row = rpRows[j]
      if (approvedSet.has(row.report_id)) {
        realCounts[row.phenomenon_id] = (realCounts[row.phenomenon_id] || 0) + 1
      }
    }

    // 4. Fetch all active phenomena with current count (paginated).
    var phenRows: Array<{ id: string; name: string; report_count: number }> = []
    var phenOffset = 0
    while (true) {
      var phenPage: { data: Array<{ id: string; name: string; report_count: number }> | null; error: any } =
        await svc.from('phenomena').select('id, name, report_count').eq('status', 'active').range(phenOffset, phenOffset + 999)
      if (phenPage.error) throw phenPage.error
      var phenBatch = phenPage.data || []
      for (var pp = 0; pp < phenBatch.length; pp++) phenRows.push(phenBatch[pp])
      if (phenBatch.length < 1000) break
      phenOffset += 1000
      if (phenOffset > 100000) break
    }

    var checked = phenRows.length
    var updated = 0
    var errors = 0

    // 5. Apply updates where drift exists
    for (var k = 0; k < phenRows.length; k++) {
      var p = phenRows[k]
      var realCount = realCounts[p.id] || 0
      if (p.report_count === realCount) continue

      var diff = Math.abs(p.report_count - realCount)
      if (topDrift.length < 10 || diff > Math.min.apply(Math, topDrift.map(function (d) {
        return Math.abs(d.before - d.after)
      }))) {
        topDrift.push({ id: p.id, name: p.name, before: p.report_count, after: realCount })
        topDrift.sort(function (a, b) { return Math.abs(b.before - b.after) - Math.abs(a.before - a.after) })
        if (topDrift.length > 10) topDrift = topDrift.slice(0, 10)
      }

      var updateResult = await svc.from('phenomena')
        .update({ report_count: realCount })
        .eq('id', p.id)
      if (updateResult.error) {
        errors++
        if (errors < 5) {
          console.error('[reconcile] update err for', p.name, updateResult.error.message)
        }
      } else {
        updated++
      }
    }

    var durationMs = Date.now() - startedAt
    return res.status(200).json({
      ok: true,
      checked: checked,
      updated: updated,
      total_links_seen: rpRows.length,
      total_approved_seen: approvedSet.size,
      errors: errors,
      top_drift: topDrift,
      duration_ms: durationMs,
    })
  } catch (err) {
    console.error('[reconcile-phenomena-counts] fatal:', err)
    return res.status(500).json({
      error: 'Reconciliation failed',
      details: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * POST /api/reports/[slug]/delete
 *
 * V10.13 Phase A — user-facing soft-delete for own submissions.
 *
 * Behavior:
 *   - Verifies the caller is authenticated.
 *   - Loads the report by slug, confirms submitted_by = auth.user.id.
 *     If not, 403.
 *   - Sets status='deleted' (soft-delete). All public queries filter
 *     on status='approved' so the row disappears from RADAR, MY MAP,
 *     SIGNAL, the explore feed, etc. immediately.
 *   - Stamps deleted_at = NOW() so we have an audit trail for the
 *     two-week recovery window described in the user-facing copy.
 *   - Best-effort cache cleanup: clears the row's your_signal_insights
 *     cache so the next /api/lab/your-signal call doesn't return
 *     fingerprint/cluster data tied to a deleted report.
 *
 * Why soft-delete instead of hard-delete:
 *   - Recovers from accidental clicks (user calls support, we flip
 *     status back to 'approved').
 *   - Preserves audit/forensics if a deleted report later turns out
 *     to have been part of a brigaded mass-deletion campaign.
 *   - Keeps foreign-key references (votes, comments, peer-connection
 *     requests) valid; cascading hard-delete is brittle.
 *
 * Returns: { ok: true, deleted_at: ISO } | { error: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var slug = String(req.query.slug || '').trim()
  if (!slug) return res.status(400).json({ error: 'Missing slug' })

  // Auth — bearer token (matches our other /api/lab/* convention)
  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load + ownership check
  var reportResult = await svc.from('reports')
    .select('id, slug, submitted_by, status, title')
    .eq('slug', slug)
    .maybeSingle()
  if (reportResult.error) return res.status(500).json({ error: reportResult.error.message })
  var report = reportResult.data
  if (!report) return res.status(404).json({ error: 'Report not found' })
  if (report.submitted_by !== user.id) {
    return res.status(403).json({ error: 'You can only delete reports you submitted.' })
  }
  if (report.status === 'deleted') {
    return res.status(200).json({ ok: true, already_deleted: true })
  }

  // Soft-delete
  var nowIso = new Date().toISOString()
  var update: any = {
    status: 'deleted',
    deleted_at: nowIso,
    updated_at: nowIso,
  }
  var updateResult = await (svc.from('reports') as any).update(update).eq('id', report.id)
  if (updateResult.error) {
    // If deleted_at column doesn't exist yet, retry without it. The
    // status flip alone is enough to hide the row from public queries.
    if (/deleted_at/i.test(updateResult.error.message || '')) {
      var retry = await svc.from('reports').update({
        status: 'deleted',
        updated_at: nowIso,
      }).eq('id', report.id)
      if (retry.error) return res.status(500).json({ error: retry.error.message })
    } else {
      return res.status(500).json({ error: updateResult.error.message })
    }
  }

  // Best-effort: clear cached signal insights tied to this report so
  // SIGNAL doesn't keep showing data for a deleted submission.
  try {
    await svc.from('your_signal_insights').delete().eq('report_id', report.id)
  } catch (_e) { /* ignore */ }

  // Best-effort: clear the user's last-contribution cache so the
  // notification-detection logic doesn't see stale state.
  try {
    await svc.from('signal_user_visits').update({
      last_contribution_payload: null,
      contribution_callout_pending_at: null,
      updated_at: nowIso,
    }).eq('user_id', user.id)
  } catch (_e) { /* ignore */ }

  return res.status(200).json({ ok: true, deleted_at: nowIso })
}

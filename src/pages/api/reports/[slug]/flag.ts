/**
 * POST /api/reports/[slug]/flag
 *
 * V11.41 — UGC trust floor (APP_EXPERIENCE_PANEL_REVIEW.md P0-2).
 * Lets a signed-in user flag a report as objectionable. Apple
 * Guideline 1.2 requires this affordance on every piece of UGC.
 *
 * Body: { reason: 'inaccurate'|'offensive'|'personal_info'|'spam'|'harmful'|'other',
 *         details?: string }
 *
 * Idempotent per (report, user): re-flagging updates the reason and
 * returns ok rather than erroring. Flags land in content_flags with
 * status='pending' and surface in /admin/flags.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var VALID_REASONS = ['inaccurate', 'offensive', 'personal_info', 'spam', 'harmful', 'other']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var slug = String(req.query.slug || '').trim()
  if (!slug) return res.status(400).json({ error: 'Missing slug' })

  var reason = String(req.body?.reason || '').trim()
  if (VALID_REASONS.indexOf(reason) === -1) {
    return res.status(400).json({ error: 'Invalid reason' })
  }
  var details = String(req.body?.details || '').slice(0, 2000)

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  var u = await svc.auth.getUser(token)
  var userId = u.data.user ? u.data.user.id : null
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  var r = await svc.from('reports').select('id').eq('slug', slug).limit(1).single()
  var reportId = (r && r.data && (r.data as any).id) || null
  if (!reportId) return res.status(404).json({ error: 'Report not found' })

  // Idempotent: unique (report_id, flagged_by). If the user already
  // flagged this report, update the reason/details and reset to
  // pending so the queue sees the latest signal.
  var existing = await svc.from('content_flags')
    .select('id')
    .eq('report_id', reportId)
    .eq('flagged_by', userId)
    .limit(1)
    .maybeSingle()

  if (existing && existing.data) {
    var upd = await svc.from('content_flags')
      .update({ reason: reason, details: details || null, status: 'pending' })
      .eq('id', (existing.data as any).id)
    if (upd.error) {
      console.error('[flag] update error:', upd.error.message)
      return res.status(500).json({ error: 'Could not record flag' })
    }
    return res.status(200).json({ ok: true, updated: true })
  }

  var ins = await svc.from('content_flags').insert({
    report_id: reportId,
    flagged_by: userId,
    reason: reason,
    details: details || null,
  })
  if (ins.error) {
    console.error('[flag] insert error:', ins.error.message)
    return res.status(500).json({ error: 'Could not record flag' })
  }
  return res.status(200).json({ ok: true })
}

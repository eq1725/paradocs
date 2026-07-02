/**
 * /api/admin/flags — moderation queue over content_flags.
 *
 * V11.41 — UGC trust floor (APP_EXPERIENCE_PANEL_REVIEW.md P0-2).
 *
 * GET   ?status=pending (default) → { flags: [...] } with report
 *       title/slug/status joined for review context.
 * PATCH { flag_id, action: 'dismiss' | 'archive_report' }
 *       dismiss        → flag.status='dismissed'
 *       archive_report → reports.status='archived' (reversible) +
 *                        flag.status='actioned'
 *
 * Auth: admin role required (same pattern as /api/admin/avatar-decision).
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  var { data: adminProfile } = await (admin.from('profiles') as any)
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!adminProfile || (adminProfile as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  if (req.method === 'GET') {
    var status = String(req.query.status || 'pending')
    var q = await admin.from('content_flags')
      .select('id, report_id, comment_id, flagged_by, reason, details, status, created_at, reports ( id, title, slug, status, source_type, submitted_by )')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(200)
    if (q.error) return res.status(500).json({ error: q.error.message })
    return res.status(200).json({ flags: q.data || [] })
  }

  if (req.method === 'PATCH') {
    var flagId = String(req.body?.flag_id || '').trim()
    var action = String(req.body?.action || '').trim()
    if (!flagId || (action !== 'dismiss' && action !== 'archive_report')) {
      return res.status(400).json({ error: 'Missing flag_id or invalid action' })
    }

    var f = await admin.from('content_flags')
      .select('id, report_id')
      .eq('id', flagId)
      .single()
    if (f.error || !f.data) return res.status(404).json({ error: 'Flag not found' })

    if (action === 'archive_report' && (f.data as any).report_id) {
      // Reversible archive — status change only, no deletion.
      var arch = await admin.from('reports')
        .update({ status: 'archived' })
        .eq('id', (f.data as any).report_id)
      if (arch.error) return res.status(500).json({ error: arch.error.message })
    }

    var upd = await admin.from('content_flags')
      .update({
        status: action === 'dismiss' ? 'dismissed' : 'actioned',
        reviewed_at: new Date().toISOString(),
        reviewed_by: userData.user.id,
      })
      .eq('id', flagId)
    if (upd.error) return res.status(500).json({ error: upd.error.message })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

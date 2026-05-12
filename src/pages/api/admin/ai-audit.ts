/**
 * /api/admin/ai-audit — V10.4 Phase 1.5
 *
 * Admin endpoint for the AI rewrite audit log review queue.
 *
 * GET — list audit rows. Query params:
 *   status     — filter by status (pending|passed|approved|rejected|bypassed). Default pending.
 *   field      — filter by output_field (e.g. 'reports.feed_hook'). Optional.
 *   model      — filter by model. Optional.
 *   prompt_v   — filter by prompt_version. Optional.
 *   limit      — page size (default 50, max 200).
 *   offset     — pagination offset.
 *
 * PATCH — admin approve/reject decision. Body:
 *   { audit_id, decision: 'approved' | 'rejected', notes? }
 *
 * Auth: admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Admin auth
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

  if (req.method === 'GET') {
    var status = (req.query.status as string) || 'pending'
    var field = req.query.field as string | undefined
    var model = req.query.model as string | undefined
    var promptV = req.query.prompt_v as string | undefined
    var limit = Math.min(parseInt((req.query.limit as string) || '50') || 50, 200)
    var offset = parseInt((req.query.offset as string) || '0') || 0

    var q = (admin.from('ai_rewrite_audit') as any)
      .select('*', { count: 'exact' })
      .eq('status', status)
    if (field) q = q.eq('output_field', field)
    if (model) q = q.eq('model', model)
    if (promptV) q = q.eq('prompt_version', promptV)

    var { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return res.status(500).json({ error: error.message })

    // Aggregate stats for the dashboard headline.
    var { data: statusCounts } = await (admin.from('ai_rewrite_audit') as any)
      .select('status, claim_check_passed')
    var stats = { pending: 0, passed: 0, approved: 0, rejected: 0, bypassed: 0, total: 0 }
    for (var row of (statusCounts || [])) {
      stats.total++
      ;(stats as any)[row.status] = ((stats as any)[row.status] || 0) + 1
    }

    return res.status(200).json({
      rows: data || [],
      total: count || 0,
      stats,
    })
  }

  if (req.method === 'PATCH') {
    var body = req.body || {}
    if (!body.audit_id || !body.decision) {
      return res.status(400).json({ error: 'audit_id and decision required' })
    }
    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      return res.status(400).json({ error: 'decision must be approved or rejected' })
    }

    var update: Record<string, any> = {
      status: body.decision,
      admin_reviewed_by: userData.user.id,
      admin_reviewed_at: new Date().toISOString(),
    }
    if (body.notes) update.admin_review_notes = String(body.notes).slice(0, 2000)

    // If admin REJECTED, null out the corresponding column on the
    // owning row so the rejected text never ships.
    if (body.decision === 'rejected') {
      var { data: row } = await (admin.from('ai_rewrite_audit') as any)
        .select('output_field, report_id, artifact_id')
        .eq('id', body.audit_id)
        .single()
      if (row && row.report_id && row.output_field) {
        var col = (row.output_field || '').replace(/^reports\./, '')
        // Only allow simple top-level column nulling here (not JSONB paths).
        var ALLOWED: Record<string, boolean> = {
          feed_hook: true,
          paradocs_narrative: true,
          answer_line: true,
        }
        if (ALLOWED[col]) {
          await (admin.from('reports') as any)
            .update({ [col]: null })
            .eq('id', row.report_id)
        }
      }
    }

    var { error: updateErr } = await (admin.from('ai_rewrite_audit') as any)
      .update(update)
      .eq('id', body.audit_id)

    if (updateErr) return res.status(500).json({ error: updateErr.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

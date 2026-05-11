/**
 * GET  /api/reports/[slug]/resonate
 * POST /api/reports/[slug]/resonate
 *
 * V10 Phase 4.A — Resonance ("this happened to me too").
 *
 * GET (public-readable):
 *   Returns { count, resonated } for the given report. `count` is
 *   the public aggregate. `resonated` is whether the signed-in
 *   caller has already tapped (or false if anon).
 *
 * POST (auth required):
 *   Toggles the caller's resonance on the report. Idempotent —
 *   first tap inserts, second tap deletes. Returns the same
 *   { count, resonated } shape.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function resolveReportId(svc: any, slug: string): Promise<string | null> {
  var r = await svc.from('reports').select('id').eq('slug', slug).limit(1).single()
  return (r && r.data && (r.data as any).id) || null
}

async function getCount(svc: any, reportId: string): Promise<number> {
  var c = await svc.from('report_resonance')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId)
  return (c && c.count) || 0
}

async function userHasResonated(svc: any, reportId: string, userId: string): Promise<boolean> {
  var r = await svc.from('report_resonance')
    .select('id')
    .eq('report_id', reportId)
    .eq('user_id', userId)
    .limit(1)
    .single()
  return !!(r && r.data)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var slug = String(req.query.slug || '').trim()
  if (!slug) return res.status(400).json({ error: 'Missing slug' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var reportId = await resolveReportId(svc, slug)
  if (!reportId) return res.status(404).json({ error: 'Report not found' })

  // Resolve signed-in user (optional for GET).
  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  var userId: string | null = null
  if (token) {
    try {
      var ac = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: 'Bearer ' + token } },
      })
      var u = await ac.auth.getUser(token)
      userId = u.data.user ? u.data.user.id : null
    } catch (_) { /* anon */ }
  }

  if (req.method === 'GET') {
    var count = await getCount(svc, reportId)
    var resonated = userId ? await userHasResonated(svc, reportId, userId) : false
    return res.status(200).json({ count: count, resonated: resonated })
  }

  if (req.method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' })

    // Toggle: if a row exists, delete; otherwise insert.
    var existing = await svc.from('report_resonance')
      .select('id')
      .eq('report_id', reportId)
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (existing && existing.data) {
      var delResult = await (svc.from('report_resonance') as any)
        .delete()
        .eq('id', (existing.data as any).id)
      if (delResult.error) {
        console.error('resonate delete error:', delResult.error)
        return res.status(500).json({ error: 'Failed to update' })
      }
    } else {
      var insResult = await (svc.from('report_resonance') as any).insert({
        user_id: userId,
        report_id: reportId,
      })
      if (insResult.error) {
        // Unique violation = race; treat as success.
        if ((insResult.error.message || '').indexOf('duplicate') === -1) {
          console.error('resonate insert error:', insResult.error)
          return res.status(500).json({ error: 'Failed to update' })
        }
      }
    }

    var newCount = await getCount(svc, reportId)
    var newResonated = await userHasResonated(svc, reportId, userId)
    return res.status(200).json({ count: newCount, resonated: newResonated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

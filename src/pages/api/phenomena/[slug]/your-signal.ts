/**
 * GET /api/phenomena/[slug]/your-signal
 *
 * V10 Phase 4.D — when a signed-in user browses a phenomenon
 * detail page, surface whether their own reports share this
 * phenomenon's fingerprint.
 *
 * Auth: Bearer token (optional — returns empty payload for anon).
 *
 * Returns:
 *   { matched: boolean, count: number, reports: [{ id, slug, title, created_at }] }
 *
 * Matching strategy:
 *   1. Resolve the phenomenon by slug → get phenomenon.id and name
 *   2. Look up user's reports linked via report_phenomena (primary
 *      path — encyclopedia ↔ report linkage)
 *   3. Fall back to phenomenon_types name fuzzy match if no
 *      direct link rows (covers reports tagged with a phenomenon
 *      TYPE that has the same display name)
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  var slug = String(req.query.slug || '').trim()
  if (!slug) return res.status(400).json({ error: 'Missing slug' })

  // Auth — optional. Anon callers get { matched: false }.
  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(200).json({ matched: false, count: 0, reports: [] })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(200).json({ matched: false, count: 0, reports: [] })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1) Resolve phenomenon
  var pResult = await svc.from('phenomena').select('id, name').eq('slug', slug).limit(1).single()
  var phen: any = pResult && pResult.data
  if (!phen) return res.status(404).json({ error: 'Phenomenon not found' })

  var matchedReportIds: string[] = []

  // 2) Primary path: report_phenomena link table
  try {
    var linkResult = await svc.from('report_phenomena')
      .select('report_id, reports!inner(id, submitted_by, status)')
      .eq('phenomenon_id', phen.id)
      .eq('reports.submitted_by', user.id)
      .eq('reports.status', 'approved')
      .limit(50)
    var linkRows: any[] = (linkResult && linkResult.data) || []
    linkRows.forEach(function (r: any) { if (r.report_id) matchedReportIds.push(r.report_id) })
  } catch (_) { /* fall through to fuzzy fallback */ }

  // 3) Fallback: phenomenon_types name fuzzy match — covers users
  //    tagged with a phenomenon TYPE that shares the same display
  //    name as the phenomenon encyclopedia entry.
  if (matchedReportIds.length === 0) {
    try {
      var typeResult = await svc.from('phenomenon_types')
        .select('id')
        .ilike('name', phen.name)
        .limit(5)
      var typeIds: string[] = ((typeResult && typeResult.data) || []).map(function (t: any) { return t.id })
      if (typeIds.length > 0) {
        var reportsByType = await svc.from('reports')
          .select('id')
          .eq('submitted_by', user.id)
          .eq('status', 'approved')
          .in('phenomenon_type_id', typeIds)
          .limit(50)
        ;((reportsByType && reportsByType.data) || []).forEach(function (r: any) {
          if (r.id && matchedReportIds.indexOf(r.id) === -1) matchedReportIds.push(r.id)
        })
      }
    } catch (_) { /* ignore */ }
  }

  if (matchedReportIds.length === 0) {
    return res.status(200).json({ matched: false, count: 0, reports: [] })
  }

  // Resolve report previews.
  var rResult = await svc.from('reports')
    .select('id, slug, title, created_at')
    .in('id', matchedReportIds)
    .order('created_at', { ascending: false })
    .limit(5)
  var reports: any[] = (rResult && rResult.data) || []

  return res.status(200).json({
    matched: true,
    count: matchedReportIds.length,
    reports: reports.map(function (r: any) {
      return { id: r.id, slug: r.slug, title: r.title || '(untitled)', created_at: r.created_at }
    }),
  })
}

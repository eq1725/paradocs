// V11.17.72 - Custom Watchlists
//
// GET  /api/lab/watchlists      — list the authed user's watchlists
// POST /api/lab/watchlists      — create a new watchlist
//
// Auth: Pro tier required (per PRO_TIER_VALIDATION_V3.md §4).

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveWatchlistContext } from '@/lib/lab/watchlists/watchlist-auth'
import { validateCriteria } from '@/lib/lab/watchlists/criteria-schema'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var ctx = await resolveWatchlistContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  if (req.method === 'GET') {
    var listResp = await ctx.authed
      .from('lab_watchlists')
      .select('id, name, criteria, status, notify_push, notify_email_weekly, match_confidence_threshold, last_evaluated_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (listResp.error) {
      return res.status(500).json({ error: 'list_failed', detail: listResp.error.message })
    }
    var rows: any[] = (listResp.data as any[]) || []

    // Per-row recent-match count (last 30d, undismissed). One small
    // service-role query batched by IN — keeps client-side renders fast.
    var ids = rows.map(function (r) { return r.id })
    var counts: Record<string, number> = {}
    if (ids.length > 0) {
      try {
        var since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        var cResp = await ctx.svc
          .from('lab_watchlist_matches')
          .select('watchlist_id')
          .in('watchlist_id', ids)
          .gte('matched_at', since)
          .eq('dismissed', false)
          .limit(5000)
        var crows: any[] = (cResp.data as any[]) || []
        crows.forEach(function (cr) {
          counts[cr.watchlist_id] = (counts[cr.watchlist_id] || 0) + 1
        })
      } catch (_e) {
        /* non-fatal */
      }
    }
    rows.forEach(function (r) { r.recent_match_count = counts[r.id] || 0 })

    return res.status(200).json({ ok: true, watchlists: rows })
  }

  if (req.method === 'POST') {
    var body = req.body || {}
    var name = (body.name || '').toString().trim()
    if (!name || name.length > 200) {
      return res.status(400).json({ error: 'name_required', detail: 'name must be 1-200 chars' })
    }
    var validation = validateCriteria(body.criteria)
    if (!validation.ok) {
      return res.status(400).json({ error: 'invalid_criteria', detail: validation.errors })
    }
    var notifyPush = body.notify_push === undefined ? true : !!body.notify_push
    var notifyEmail = body.notify_email_weekly === undefined ? true : !!body.notify_email_weekly
    var thresholdRaw = body.match_confidence_threshold
    var threshold = typeof thresholdRaw === 'number' && thresholdRaw >= 0 && thresholdRaw <= 1
      ? thresholdRaw
      : 0.85

    var insertResp = await ctx.authed
      .from('lab_watchlists')
      .insert({
        user_id: ctx.user.id,
        name: name,
        criteria: body.criteria,
        status: 'active',
        notify_push: notifyPush,
        notify_email_weekly: notifyEmail,
        match_confidence_threshold: threshold,
      } as any)
      .select()
      .single()
    if (insertResp.error) {
      return res.status(500).json({ error: 'insert_failed', detail: insertResp.error.message })
    }
    return res.status(200).json({ ok: true, watchlist: insertResp.data })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'method_not_allowed' })
}

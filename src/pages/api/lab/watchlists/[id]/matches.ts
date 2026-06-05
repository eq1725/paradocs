// V11.17.72 - Custom Watchlists
//
// GET /api/lab/watchlists/[id]/matches?since=ISO&limit=N
//
// Returns matches for the watchlist, ordered matched_at DESC.
// Joins to reports to surface enough fields for the WatchlistMatchCard.

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveWatchlistContext } from '@/lib/lab/watchlists/watchlist-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  var ctx = await resolveWatchlistContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var id = (req.query.id as string) || ''
  if (!id) return res.status(400).json({ error: 'missing_id' })

  // Confirm the watchlist belongs to this user — the authed select is
  // RLS-bound but we want a clean 404 instead of an empty payload.
  var wlResp = await ctx.authed
    .from('lab_watchlists')
    .select('id, name, criteria, match_confidence_threshold')
    .eq('id', id)
    .maybeSingle()
  if (wlResp.error || !wlResp.data) {
    return res.status(404).json({ error: 'watchlist_not_found' })
  }
  var watchlist = wlResp.data as any

  var since = (req.query.since as string) || ''
  var limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10) || 25))

  var q = ctx.authed
    .from('lab_watchlist_matches')
    .select('id, watchlist_id, report_id, matched_at, match_confidence, dismissed, notified_push, notified_email')
    .eq('watchlist_id', id)
    .order('matched_at', { ascending: false })
    .limit(limit)
  if (since) q = q.gte('matched_at', since)

  var mResp = await q
  if (mResp.error) {
    return res.status(500).json({ error: 'list_failed', detail: mResp.error.message })
  }
  var matches: any[] = (mResp.data as any[]) || []
  if (matches.length === 0) {
    return res.status(200).json({ ok: true, watchlist: watchlist, matches: [] })
  }

  // Hydrate report payloads via service role (reports table has its own
  // public-read RLS for approved rows, so the authed client would also
  // work — but the service-role read keeps us insulated from any future
  // RLS tightening on `reports`).
  var reportIds = matches.map(function (m: any) { return m.report_id })
  var reportsResp = await ctx.svc
    .from('reports')
    .select('id, slug, title, summary, category, city, state_province, country, event_date, ingested_at')
    .in('id', reportIds)
  var byId: Record<string, any> = {}
  ;((reportsResp.data as any[]) || []).forEach(function (r: any) { byId[r.id] = r })

  var hydrated = matches.map(function (m: any) {
    return Object.assign({}, m, { report: byId[m.report_id] || null })
  })

  return res.status(200).json({ ok: true, watchlist: watchlist, matches: hydrated })
}

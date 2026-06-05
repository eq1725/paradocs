// V11.17.72 - Custom Watchlists
//
// POST /api/lab/watchlists/matches/[match_id]/dismiss
//
// Marks the match dismissed = TRUE. RLS ensures only the owning user
// can update (policy joins to lab_watchlists.user_id).

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveWatchlistContext } from '@/lib/lab/watchlists/watchlist-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  var ctx = await resolveWatchlistContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var matchIdRaw = (req.query.match_id as string) || ''
  var matchId = parseInt(matchIdRaw, 10)
  if (!matchId || isNaN(matchId)) return res.status(400).json({ error: 'invalid_match_id' })

  var resp = await ctx.authed
    .from('lab_watchlist_matches')
    .update({ dismissed: true } as any)
    .eq('id', matchId)
    .select('id, dismissed')
    .single()
  if (resp.error) {
    return res.status(500).json({ error: 'update_failed', detail: resp.error.message })
  }
  return res.status(200).json({ ok: true, match: resp.data })
}

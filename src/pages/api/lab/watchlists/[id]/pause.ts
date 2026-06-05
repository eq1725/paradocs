// V11.17.72 - Custom Watchlists
//
// POST /api/lab/watchlists/[id]/pause
//
// Body: { paused: boolean }
//   true  → set status = 'paused'
//   false → set status = 'active'

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveWatchlistContext } from '@/lib/lab/watchlists/watchlist-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  var ctx = await resolveWatchlistContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var id = (req.query.id as string) || ''
  if (!id) return res.status(400).json({ error: 'missing_id' })

  var body = req.body || {}
  var paused = !!body.paused
  var nextStatus = paused ? 'paused' : 'active'

  var resp = await ctx.authed
    .from('lab_watchlists')
    .update({ status: nextStatus } as any)
    .eq('id', id)
    .select()
    .single()
  if (resp.error) {
    return res.status(500).json({ error: 'update_failed', detail: resp.error.message })
  }
  return res.status(200).json({ ok: true, status: nextStatus })
}

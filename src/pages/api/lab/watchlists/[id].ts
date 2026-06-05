// V11.17.72 - Custom Watchlists
//
// PUT    /api/lab/watchlists/[id]   — edit (rename, change criteria, prefs)
// DELETE /api/lab/watchlists/[id]   — delete (cascades to matches)

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveWatchlistContext } from '@/lib/lab/watchlists/watchlist-auth'
import { validateCriteria } from '@/lib/lab/watchlists/criteria-schema'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var ctx = await resolveWatchlistContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var id = (req.query.id as string) || ''
  if (!id) return res.status(400).json({ error: 'missing_id' })

  if (req.method === 'PUT') {
    var body = req.body || {}
    var patch: any = {}
    if (typeof body.name === 'string') {
      var name = body.name.trim()
      if (!name || name.length > 200) {
        return res.status(400).json({ error: 'invalid_name' })
      }
      patch.name = name
    }
    if (body.criteria !== undefined) {
      var v = validateCriteria(body.criteria)
      if (!v.ok) return res.status(400).json({ error: 'invalid_criteria', detail: v.errors })
      patch.criteria = body.criteria
      // When criteria change, clear last_evaluated_at so the next cron
      // run re-scans the full Archive against the new criteria.
      patch.last_evaluated_at = null
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'paused' && body.status !== 'archived') {
        return res.status(400).json({ error: 'invalid_status' })
      }
      patch.status = body.status
    }
    if (typeof body.notify_push === 'boolean') patch.notify_push = body.notify_push
    if (typeof body.notify_email_weekly === 'boolean') patch.notify_email_weekly = body.notify_email_weekly
    if (typeof body.match_confidence_threshold === 'number'
        && body.match_confidence_threshold >= 0
        && body.match_confidence_threshold <= 1) {
      patch.match_confidence_threshold = body.match_confidence_threshold
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'nothing_to_update' })
    }

    var upResp = await ctx.authed
      .from('lab_watchlists')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (upResp.error) {
      return res.status(500).json({ error: 'update_failed', detail: upResp.error.message })
    }
    return res.status(200).json({ ok: true, watchlist: upResp.data })
  }

  if (req.method === 'DELETE') {
    var delResp = await ctx.authed
      .from('lab_watchlists')
      .delete()
      .eq('id', id)
    if (delResp.error) {
      return res.status(500).json({ error: 'delete_failed', detail: delResp.error.message })
    }
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'PUT, DELETE')
  return res.status(405).json({ error: 'method_not_allowed' })
}

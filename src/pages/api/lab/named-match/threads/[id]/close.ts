// V11.17.73 — Named-Match + DM
//
// POST /api/lab/named-match/threads/[id]/close
//   - Either party may close the thread at any time.
//   - Sets state='closed', closed_at, closed_by.
//   - Adds a 90-day suppression entry so the matcher does not re-pair
//     the two users.

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveNamedMatchContext, isBasicOrAbove, canonicalPair } from '@/lib/lab/named-match/named-match-auth'
import { SUPPRESSION_DAYS } from '@/lib/lab/named-match/match-engine'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveNamedMatchContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (!isBasicOrAbove(ctx.tier)) {
    return res.status(403).json({ error: 'basic_tier_required', tier: ctx.tier })
  }

  var threadId = (req.query.id as string) || ''
  if (!threadId) return res.status(400).json({ error: 'missing_id' })

  var tResp = await ctx.svc
    .from('lab_dm_threads')
    .select('id, user_a_id, user_b_id, state')
    .eq('id', threadId)
    .maybeSingle()
  if (tResp.error) return res.status(500).json({ error: 'fetch_failed', detail: tResp.error.message })
  var thread: any = tResp.data
  if (!thread) return res.status(404).json({ error: 'thread_not_found' })
  if (thread.user_a_id !== ctx.user.id && thread.user_b_id !== ctx.user.id) {
    return res.status(403).json({ error: 'not_a_party' })
  }
  if (thread.state === 'closed') {
    return res.status(200).json({ ok: true, state: 'closed', already: true })
  }

  var now = new Date().toISOString()
  var upResp = await ctx.svc
    .from('lab_dm_threads')
    .update({ state: 'closed', closed_at: now, closed_by: ctx.user.id } as any)
    .eq('id', threadId)
  if (upResp.error) return res.status(500).json({ error: 'update_failed', detail: upResp.error.message })

  // Suppress the pair for SUPPRESSION_DAYS.
  var canon = canonicalPair(thread.user_a_id, thread.user_b_id)
  var until = new Date(Date.now() + SUPPRESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await ctx.svc
    .from('lab_match_suppressions')
    .upsert({
      user_a_id: canon.a,
      user_b_id: canon.b,
      suppressed_until: until,
      reason: 'dm_thread_closed',
    } as any, { onConflict: 'user_a_id,user_b_id' })

  return res.status(200).json({ ok: true, state: 'closed' })
}

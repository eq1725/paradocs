// V11.17.73 — Named-Match + DM
//
// GET /api/lab/named-match/threads/[id]
//   - Fetch a single thread + recent messages (most recent first, cap 200).
//   - Auth: only parties on the thread.

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveNamedMatchContext, isBasicOrAbove } from '@/lib/lab/named-match/named-match-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
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
    .select('id, user_a_id, user_b_id, match_offer_id, state, created_at, last_message_at, closed_at, closed_by')
    .eq('id', threadId)
    .maybeSingle()
  if (tResp.error) return res.status(500).json({ error: 'fetch_failed', detail: tResp.error.message })
  var thread: any = tResp.data
  if (!thread) return res.status(404).json({ error: 'thread_not_found' })
  if (thread.user_a_id !== ctx.user.id && thread.user_b_id !== ctx.user.id) {
    return res.status(403).json({ error: 'not_a_party' })
  }

  var otherId = thread.user_a_id === ctx.user.id ? thread.user_b_id : thread.user_a_id

  // Counterparty profile.
  var pResp = await ctx.svc
    .from('profiles')
    .select('display_name')
    .eq('id', otherId)
    .maybeSingle()
  var counterpartyName = (pResp.data && (pResp.data as any).display_name) || 'Another contributor'

  // Messages, most recent first (UI flips for chronological render).
  var mResp = await ctx.svc
    .from('lab_dm_messages')
    .select('id, sender_user_id, body, sent_at, read_at')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
    .limit(200)
  var messages = (mResp.data as any[]) || []

  return res.status(200).json({
    ok: true,
    thread: {
      id: thread.id,
      state: thread.state,
      created_at: thread.created_at,
      last_message_at: thread.last_message_at,
      closed_at: thread.closed_at,
      closed_by: thread.closed_by,
      counterparty: {
        user_id: otherId,
        display_name: counterpartyName,
      },
      your_user_id: ctx.user.id,
    },
    messages: messages,
  })
}

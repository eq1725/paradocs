// V11.17.73 — Named-Match + DM
//
// POST /api/lab/named-match/threads/[id]/messages/read
//   - Marks all unread messages in the thread sent by the COUNTERPARTY
//     as read (sets read_at = now()).
//   - Auth: Basic+; caller must be a party to the thread.

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveNamedMatchContext, isBasicOrAbove } from '@/lib/lab/named-match/named-match-auth'

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

  // Verify membership.
  var tResp = await ctx.svc
    .from('lab_dm_threads')
    .select('id, user_a_id, user_b_id')
    .eq('id', threadId)
    .maybeSingle()
  if (tResp.error) return res.status(500).json({ error: 'fetch_failed', detail: tResp.error.message })
  var thread: any = tResp.data
  if (!thread) return res.status(404).json({ error: 'thread_not_found' })
  if (thread.user_a_id !== ctx.user.id && thread.user_b_id !== ctx.user.id) {
    return res.status(403).json({ error: 'not_a_party' })
  }

  var now = new Date().toISOString()
  var upResp = await ctx.svc
    .from('lab_dm_messages')
    .update({ read_at: now } as any)
    .eq('thread_id', threadId)
    .neq('sender_user_id', ctx.user.id)
    .is('read_at', null)
    .select('id')
  if (upResp.error) return res.status(500).json({ error: 'update_failed', detail: upResp.error.message })

  return res.status(200).json({ ok: true, marked: ((upResp.data as any[]) || []).length })
}

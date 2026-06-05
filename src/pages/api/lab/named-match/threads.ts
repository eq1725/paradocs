// V11.17.73 — Named-Match + DM
//
// GET /api/lab/named-match/threads
//   - List the authed user's DM threads (open + closed).
//   - For each thread, hydrate the OTHER party's display_name (only
//     visible once the underlying offer is accepted — which is the
//     precondition for the thread existing in the first place).
//   - Adds last-message preview + unread count.

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

  var resp = await ctx.svc
    .from('lab_dm_threads')
    .select('id, user_a_id, user_b_id, match_offer_id, state, created_at, last_message_at, closed_at')
    .or('user_a_id.eq.' + ctx.user.id + ',user_b_id.eq.' + ctx.user.id)
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (resp.error) return res.status(500).json({ error: 'fetch_failed', detail: resp.error.message })
  var threads = (resp.data as any[]) || []
  if (threads.length === 0) return res.status(200).json({ ok: true, threads: [] })

  // Counterparty user ids → display_name + tier_badge (best effort).
  var counterpartyIds: string[] = threads.map(function (t: any) {
    return t.user_a_id === ctx!.user.id ? t.user_b_id : t.user_a_id
  })
  var uniqueIds = Array.from(new Set(counterpartyIds))
  var profMap: Record<string, { display_name: string | null }> = {}
  if (uniqueIds.length > 0) {
    var pResp = await ctx.svc
      .from('profiles')
      .select('id, display_name')
      .in('id', uniqueIds)
    ;((pResp.data as any[]) || []).forEach(function (p: any) {
      profMap[p.id] = { display_name: p.display_name || null }
    })
  }

  // Last message + unread count per thread.
  var threadIds = threads.map(function (t: any) { return t.id })
  var lastMessageByThread: Record<string, { body: string; sent_at: string; sender_user_id: string } | null> = {}
  var unreadByThread: Record<string, number> = {}

  if (threadIds.length > 0) {
    // Fetch the most recent message per thread — one pass, server-side
    // sort, cap so we don't pull thousands of rows.
    var mResp = await ctx.svc
      .from('lab_dm_messages')
      .select('thread_id, body, sent_at, sender_user_id, read_at')
      .in('thread_id', threadIds)
      .order('sent_at', { ascending: false })
      .limit(500)
    var msgs = (mResp.data as any[]) || []
    msgs.forEach(function (m: any) {
      if (!lastMessageByThread[m.thread_id]) {
        lastMessageByThread[m.thread_id] = {
          body: String(m.body || '').slice(0, 140),
          sent_at: m.sent_at,
          sender_user_id: m.sender_user_id,
        }
      }
      if (!m.read_at && m.sender_user_id !== ctx!.user.id) {
        unreadByThread[m.thread_id] = (unreadByThread[m.thread_id] || 0) + 1
      }
    })
  }

  var hydrated = threads.map(function (t: any) {
    var otherId = t.user_a_id === ctx!.user.id ? t.user_b_id : t.user_a_id
    var prof = profMap[otherId] || { display_name: null }
    return {
      id: t.id,
      state: t.state,
      created_at: t.created_at,
      last_message_at: t.last_message_at,
      closed_at: t.closed_at,
      counterparty: {
        user_id: otherId,
        display_name: prof.display_name || 'Another contributor',
      },
      last_message: lastMessageByThread[t.id] || null,
      unread_count: unreadByThread[t.id] || 0,
    }
  })

  return res.status(200).json({ ok: true, threads: hydrated })
}

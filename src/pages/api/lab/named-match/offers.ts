// V11.17.73 — Named-Match + DM
//
// GET /api/lab/named-match/offers
//   - Returns the authed user's pending named-match offers.
//   - Pre-mutual-acceptance: response carries ONLY the anonymous_payload
//     (phen_family, decade, signal_overlap_count, distance_bucket) +
//     the user's perspective ('your_role' = 'initiator'|'recipient').
//     NO counterparty name. NO photo. NO precise location. NO verbatim
//     account text. This is the privacy floor.
//   - Auth: Basic+ required.

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

  // Pull all non-terminal offers touching this user. We surface offers
  // in three states:
  //   - 'pending': the initiator hasn't acted (only visible when
  //     auth.uid() is the initiator — they decide first).
  //   - 'initiator_accepted': now the recipient sees it.
  //   - 'accepted': for completeness; the DM thread is open elsewhere.
  // We INTENTIONALLY include 'accepted' so the rail shows the user
  // their recently-converted offers; the UI can split into rails.
  var nowIso = new Date().toISOString()
  var resp = await ctx.svc
    .from('lab_named_match_offers')
    .select('id, initiator_user_id, initiator_report_id, recipient_user_id, recipient_report_id, signal_overlap_count, match_confidence, anonymous_payload, state, initiator_responded_at, recipient_responded_at, created_at, expires_at')
    .or('initiator_user_id.eq.' + ctx.user.id + ',recipient_user_id.eq.' + ctx.user.id)
    .in('state', ['pending', 'initiator_accepted', 'accepted'])
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(50)
  if (resp.error) {
    return res.status(500).json({ error: 'fetch_failed', detail: resp.error.message })
  }

  var rows = (resp.data as any[]) || []

  // Per-row perspective + visibility filter.
  // - 'pending' offers should only surface to the initiator (they
  //   decide first; the recipient sees nothing until the initiator
  //   says yes).
  var visible = rows.filter(function (r: any) {
    if (r.state === 'pending') return r.initiator_user_id === ctx!.user.id
    return true
  })

  // Map to the documentary-safe response shape. Strip the raw user
  // ids of the OTHER party (we keep your own user id for client-side
  // perspective only).
  var offers = visible.map(function (r: any) {
    var isInitiator = r.initiator_user_id === ctx!.user.id
    return {
      id: r.id,
      your_role: isInitiator ? 'initiator' : 'recipient',
      state: r.state,
      signal_overlap_count: r.signal_overlap_count,
      match_confidence: r.match_confidence,
      anonymous_payload: r.anonymous_payload,
      your_report_id: isInitiator ? r.initiator_report_id : r.recipient_report_id,
      created_at: r.created_at,
      expires_at: r.expires_at,
      // Awaiting-you flag for sorting: true when it's our turn to act.
      awaiting_you:
        (r.state === 'pending' && isInitiator) ||
        (r.state === 'initiator_accepted' && !isInitiator),
    }
  })

  return res.status(200).json({ ok: true, offers: offers })
}

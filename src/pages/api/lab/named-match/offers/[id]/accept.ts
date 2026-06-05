// V11.17.73 — Named-Match + DM
//
// POST /api/lab/named-match/offers/[id]/accept
//
// Behavior:
//   - If state='pending' AND caller is the initiator → advance to
//     'initiator_accepted'. The recipient now sees the offer.
//   - If state='initiator_accepted' AND caller is the recipient →
//     advance to 'accepted'. We open the lab_dm_threads row (idempotent
//     via UNIQUE on match_offer_id). Identifying detail unlocks for
//     BOTH sides via /threads/[id]/messages.
//
// Auth: Basic+ required.

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveNamedMatchContext, isBasicOrAbove, canonicalPair } from '@/lib/lab/named-match/named-match-auth'

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

  var offerId = (req.query.id as string) || ''
  if (!offerId) return res.status(400).json({ error: 'missing_id' })

  // Fetch the offer via service role so we can verify state + parties
  // without RLS round-tripping. We re-check membership before mutating.
  var oResp = await ctx.svc
    .from('lab_named_match_offers')
    .select('id, initiator_user_id, recipient_user_id, state, expires_at, match_offer_id:id')
    .eq('id', offerId)
    .maybeSingle()
  if (oResp.error) return res.status(500).json({ error: 'fetch_failed', detail: oResp.error.message })
  var offer: any = oResp.data
  if (!offer) return res.status(404).json({ error: 'offer_not_found' })

  // Expiry gate.
  if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
    await ctx.svc
      .from('lab_named_match_offers')
      .update({ state: 'expired' } as any)
      .eq('id', offerId)
    return res.status(410).json({ error: 'offer_expired' })
  }

  var isInitiator = offer.initiator_user_id === ctx.user.id
  var isRecipient = offer.recipient_user_id === ctx.user.id
  if (!isInitiator && !isRecipient) return res.status(403).json({ error: 'not_a_party' })

  if (offer.state === 'pending') {
    if (!isInitiator) {
      return res.status(403).json({ error: 'initiator_must_decide_first' })
    }
    var upResp = await ctx.svc
      .from('lab_named_match_offers')
      .update({
        state: 'initiator_accepted',
        initiator_responded_at: new Date().toISOString(),
      } as any)
      .eq('id', offerId)
    if (upResp.error) return res.status(500).json({ error: 'update_failed', detail: upResp.error.message })
    return res.status(200).json({ ok: true, state: 'initiator_accepted' })
  }

  if (offer.state === 'initiator_accepted') {
    if (!isRecipient) {
      return res.status(403).json({ error: 'awaiting_recipient' })
    }
    var canon = canonicalPair(offer.initiator_user_id, offer.recipient_user_id)
    var advance = await ctx.svc
      .from('lab_named_match_offers')
      .update({
        state: 'accepted',
        recipient_responded_at: new Date().toISOString(),
      } as any)
      .eq('id', offerId)
    if (advance.error) return res.status(500).json({ error: 'update_failed', detail: advance.error.message })

    // Open the DM thread — idempotent via UNIQUE(match_offer_id).
    var threadResp = await ctx.svc
      .from('lab_dm_threads')
      .insert({
        user_a_id: canon.a,
        user_b_id: canon.b,
        match_offer_id: offerId,
        state: 'open',
      } as any)
      .select()
      .single()
    var threadId: string | null = null
    if (threadResp.error) {
      // Most likely cause: duplicate-key on match_offer_id → already opened.
      var existing = await ctx.svc
        .from('lab_dm_threads')
        .select('id')
        .eq('match_offer_id', offerId)
        .maybeSingle()
      if (existing.data) threadId = (existing.data as any).id
    } else {
      threadId = (threadResp.data as any).id
    }

    // Seed the documentary-tone system message (best-effort).
    if (threadId) {
      try {
        await ctx.svc.from('lab_dm_messages').insert({
          thread_id: threadId,
          sender_user_id: canon.a,            // we use the canonical-a id as the system speaker proxy
          body: 'You both reported similar experiences. This thread is private to you two. Either of you can close it at any time.',
        } as any)
      } catch (_e) { /* best effort */ }
    }

    return res.status(200).json({ ok: true, state: 'accepted', thread_id: threadId })
  }

  if (offer.state === 'accepted') {
    return res.status(200).json({ ok: true, state: 'accepted', already: true })
  }
  return res.status(409).json({ error: 'invalid_state', state: offer.state })
}

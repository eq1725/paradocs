// V11.17.73 — Named-Match + DM
//
// POST /api/lab/named-match/offers/[id]/decline
//
// Either party may decline at any time before the offer is 'accepted'.
// Declining:
//   1. Sets state='declined' on the offer row.
//   2. Adds a 90-day suppression entry between the two users so the
//      matcher does not re-propose the same pair.

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

  var offerId = (req.query.id as string) || ''
  if (!offerId) return res.status(400).json({ error: 'missing_id' })

  var oResp = await ctx.svc
    .from('lab_named_match_offers')
    .select('id, initiator_user_id, recipient_user_id, state')
    .eq('id', offerId)
    .maybeSingle()
  if (oResp.error) return res.status(500).json({ error: 'fetch_failed', detail: oResp.error.message })
  var offer: any = oResp.data
  if (!offer) return res.status(404).json({ error: 'offer_not_found' })

  var isInitiator = offer.initiator_user_id === ctx.user.id
  var isRecipient = offer.recipient_user_id === ctx.user.id
  if (!isInitiator && !isRecipient) return res.status(403).json({ error: 'not_a_party' })
  if (offer.state === 'accepted' || offer.state === 'declined' || offer.state === 'expired') {
    return res.status(409).json({ error: 'invalid_state', state: offer.state })
  }

  var patch: any = { state: 'declined' }
  if (isInitiator) patch.initiator_responded_at = new Date().toISOString()
  if (isRecipient) patch.recipient_responded_at = new Date().toISOString()

  var upResp = await ctx.svc
    .from('lab_named_match_offers')
    .update(patch)
    .eq('id', offerId)
  if (upResp.error) return res.status(500).json({ error: 'update_failed', detail: upResp.error.message })

  // Suppress this pair for SUPPRESSION_DAYS.
  var canon = canonicalPair(offer.initiator_user_id, offer.recipient_user_id)
  var until = new Date(Date.now() + SUPPRESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await ctx.svc
    .from('lab_match_suppressions')
    .upsert({
      user_a_id: canon.a,
      user_b_id: canon.b,
      suppressed_until: until,
      reason: 'offer_declined',
    } as any, { onConflict: 'user_a_id,user_b_id' })

  return res.status(200).json({ ok: true, state: 'declined' })
}

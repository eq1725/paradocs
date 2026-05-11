/**
 * POST /api/lab/your-signal/feedback
 *
 * V9.12 Phase 2.A — record / toggle a thumbs rating on a Your Signal
 * insight card. Body:
 *
 *   { report_id: UUID, card_type: 'fingerprint'|'cluster'|'did_you_know'|'context', rating: 'up'|'down'|null }
 *
 * Behavior:
 *   - rating='up' or 'down' → upsert on (user_id, report_id, card_type)
 *   - rating=null            → delete the row (un-rate)
 *
 * Returns the resulting state: { rating: 'up'|'down'|null }.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

var ALLOWED_CARD_TYPES = ['fingerprint', 'cluster', 'did_you_know', 'context']
var ALLOWED_RATINGS = ['up', 'down']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var body = req.body || {}
  var reportId = String(body.report_id || '').trim()
  var cardType = String(body.card_type || '').trim()
  var rating = body.rating === null ? null : String(body.rating || '').trim()

  if (!reportId) return res.status(400).json({ error: 'Missing report_id' })
  if (ALLOWED_CARD_TYPES.indexOf(cardType) === -1) return res.status(400).json({ error: 'Invalid card_type' })
  if (rating !== null && ALLOWED_RATINGS.indexOf(rating) === -1) return res.status(400).json({ error: 'Invalid rating' })

  var client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await client.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  if (rating === null) {
    // Un-rate: delete any existing row.
    var delResult = await (client.from('your_signal_feedback') as any)
      .delete()
      .eq('user_id', user.id)
      .eq('report_id', reportId)
      .eq('card_type', cardType)
    if (delResult.error) {
      console.error('your-signal/feedback delete error:', delResult.error)
      return res.status(500).json({ error: 'Failed to clear rating' })
    }
    return res.status(200).json({ rating: null })
  }

  var upsertResult = await (client.from('your_signal_feedback') as any)
    .upsert({
      user_id: user.id,
      report_id: reportId,
      card_type: cardType,
      rating: rating,
    }, { onConflict: 'user_id,report_id,card_type' })
  if (upsertResult.error) {
    console.error('your-signal/feedback upsert error:', upsertResult.error)
    return res.status(500).json({ error: 'Failed to save rating' })
  }

  return res.status(200).json({ rating: rating })
}

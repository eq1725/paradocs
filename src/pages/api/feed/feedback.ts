/**
 * POST /api/feed/feedback
 *
 * Panel-feedback (May 2026 — 4th round, Tier 2 personalization).
 * Records thumbs up / thumbs down feedback from feed cards. The
 * signal flows into the per-user category weights computed at
 * feed-v2 query time, gradually personalizing the feed without
 * needing a separate ML pipeline.
 *
 * Body:
 *   {
 *     report_id: string,                     // required
 *     sentiment: 'positive' | 'negative',    // required
 *     phenomenon_category?: string | null,   // optional, denormalized for analytics
 *   }
 *
 * Auth: Bearer JWT. Unauthed feedback is rejected — we want the
 * signal tied to a user.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface FeedbackBody {
  report_id?: string
  sentiment?: 'positive' | 'negative'
  phenomenon_category?: string | null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  var userId = userData.user.id

  var body = (req.body || {}) as FeedbackBody
  var reportId = (body.report_id || '').toString()
  var sentiment = (body.sentiment || '').toString()
  if (!reportId) return res.status(400).json({ error: 'Missing report_id' })
  if (sentiment !== 'positive' && sentiment !== 'negative') {
    return res.status(400).json({ error: 'Invalid sentiment (must be positive or negative)' })
  }

  // Look up the report's category for analytics (also lets us reject
  // feedback against non-existent reports cleanly).
  var category = body.phenomenon_category || null
  if (!category) {
    var { data: report } = await admin
      .from('reports')
      .select('category')
      .eq('id', reportId)
      .maybeSingle()
    if (report) category = (report as any).category || null
  }

  // Generate a session_id from user_id + day so we can dedupe within
  // a session. session_id is NOT NULL on feed_events; we use a stable
  // value rather than tracking per-tab.
  var dayStamp = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  var sessionId = 'fb:' + userId.slice(0, 8) + ':' + dayStamp

  var eventType = sentiment === 'positive' ? 'thumbs_up' : 'thumbs_down'

  // Idempotent-ish: replace any prior thumbs event from this user on
  // this report so the user can flip their vote. We don't UPSERT
  // because feed_events doesn't have a unique constraint we'd want
  // to add — instead delete prior, then insert fresh.
  try {
    await (admin.from('feed_events') as any)
      .delete()
      .eq('user_id', userId)
      .eq('card_id', reportId)
      .in('event_type', ['thumbs_up', 'thumbs_down'])
  } catch { /* non-fatal */ }

  var { error: insertErr } = await (admin.from('feed_events') as any).insert({
    user_id: userId,
    session_id: sessionId,
    card_id: reportId,
    card_type: 'report',
    phenomenon_category: category,
    event_type: eventType,
    metadata: { source: 'feed_card_thumbs' },
  })

  if (insertErr) {
    console.error('[feed/feedback] insert failed:', insertErr.message)
    return res.status(500).json({ error: 'Could not record feedback' })
  }

  return res.status(200).json({ ok: true, sentiment: sentiment, event_type: eventType })
}

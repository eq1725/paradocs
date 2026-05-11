/**
 * POST /api/connections/request
 *
 * V9.13 Phase 3.C — send a connection request to another user.
 *
 * Body: { to_user_id: UUID, about_report?: UUID, intro_message: string }
 *
 * Preconditions:
 *   - Recipient must have effective_allow_peer = TRUE (per the
 *     report_peer_visibility view or profiles.allow_peer_connection
 *     fallback). We don't reveal opt-in status if false — just
 *     return a friendly "not available" so we don't leak who has
 *     opted out.
 *   - Cannot request your own account.
 *   - Cannot send a new request to the same recipient within 30
 *     days of a previous pending/declined request (DB unique
 *     index enforces).
 *   - intro_message goes through moderateText('comment'); if
 *     rejected, request is persisted as 'rejected_moderation' and
 *     the user gets a friendly explanation — never delivered.
 *
 * Returns: { id, status }.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { moderateText } from '@/lib/services/text-moderation.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var MAX_INTRO = 1000
var MIN_INTRO = 10

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  var toUserId = String((req.body && req.body.to_user_id) || '').trim()
  var aboutReport = req.body && req.body.about_report ? String(req.body.about_report) : null
  var introMessage = String((req.body && req.body.intro_message) || '').trim()

  if (!toUserId) return res.status(400).json({ error: 'Missing recipient' })
  if (toUserId === user.id) return res.status(400).json({ error: 'You cannot connect with yourself.' })
  if (introMessage.length < MIN_INTRO) return res.status(400).json({ error: 'Intro message is too short (' + MIN_INTRO + '+ chars).' })
  if (introMessage.length > MAX_INTRO) return res.status(400).json({ error: 'Intro message is too long (max ' + MAX_INTRO + ' chars).' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Verify recipient has opted in. We resolve via the
  // report_peer_visibility view if about_report is supplied
  // (per-report override > profile default); otherwise fall
  // back to the profile default.
  var optedIn = false
  if (aboutReport) {
    var v = await svc.from('report_peer_visibility')
      .select('effective_allow_peer')
      .eq('report_id', aboutReport)
      .eq('user_id', toUserId)
      .single()
    if (v && v.data) optedIn = !!(v.data as any).effective_allow_peer
  }
  if (!optedIn) {
    var p = await svc.from('profiles').select('allow_peer_connection').eq('id', toUserId).single()
    if (p && p.data) optedIn = !!(p.data as any).allow_peer_connection
  }
  if (!optedIn) {
    // Don't leak opt-out state; vague friendly response.
    return res.status(404).json({ error: 'This person isn’t available to connect right now.' })
  }

  // Moderation on intro.
  var moderation = await moderateText(introMessage, 'comment')
  var status = 'pending'
  if (moderation.decision === 'rejected') status = 'rejected_moderation'

  // Insert. DB unique index prevents duplicate pending/declined
  // pairs (30-day cooldown enforced at app layer too).
  var insertResult = await (authClient.from('connection_requests') as any)
    .insert({
      from_user: user.id,
      to_user: toUserId,
      about_report: aboutReport,
      intro_message: introMessage,
      status: status,
    })
    .select('id, status')
    .single()

  if (insertResult.error) {
    var msg = insertResult.error.message || ''
    if (msg.indexOf('uq_conn_requests_pair_active') !== -1 || msg.indexOf('duplicate') !== -1) {
      return res.status(409).json({ error: 'You already have a pending request with this person. Wait a few days before sending another.' })
    }
    console.error('connections/request insert error:', insertResult.error)
    return res.status(500).json({ error: 'Failed to send request' })
  }

  if (status === 'rejected_moderation') {
    return res.status(200).json({
      id: insertResult.data.id,
      status: 'rejected_moderation',
      reason: moderation.reason || 'Your intro didn\'t pass community guidelines. Edit and try again.',
    })
  }

  return res.status(201).json({ id: insertResult.data.id, status: 'pending' })
}

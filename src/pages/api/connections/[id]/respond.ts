/**
 * POST /api/connections/[id]/respond
 *
 * V9.13 Phase 3.C — accept or decline a pending connection request.
 *
 * Body: { action: 'accept' | 'decline' }
 *
 * Only the recipient (to_user) may accept. Either party may
 * decline (recipient declines an incoming; sender cancels their
 * outgoing) — both shapes land as status='declined'.
 *
 * On accept:
 *   1. Mark request status='accepted'
 *   2. Create a connections row (user_a < user_b)
 *   3. Copy intro_message into connection_messages as the first
 *      thread entry (status='approved')
 *   4. Return the new connection id
 *
 * On decline:
 *   1. Mark request status='declined'
 *   2. No connection row; no notification to the sender (avoid
 *      shame per panel)
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var requestId = String(req.query.id || '').trim()
  if (!requestId) return res.status(400).json({ error: 'Missing request id' })

  var action = String((req.body && req.body.action) || '').trim()
  if (action !== 'accept' && action !== 'decline') {
    return res.status(400).json({ error: 'action must be accept or decline' })
  }

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load the request and confirm authorization.
  var reqResult = await svc.from('connection_requests')
    .select('id, from_user, to_user, intro_message, status, about_report')
    .eq('id', requestId)
    .single()
  var crow: any = reqResult && reqResult.data
  if (!crow) return res.status(404).json({ error: 'Request not found' })
  if (crow.status !== 'pending') return res.status(409).json({ error: 'Request is no longer pending' })

  var isRecipient = crow.to_user === user.id
  var isSender = crow.from_user === user.id

  if (action === 'accept') {
    if (!isRecipient) return res.status(403).json({ error: 'Only the recipient can accept' })

    // Determine canonical user_a < user_b ordering.
    var ua = crow.from_user < crow.to_user ? crow.from_user : crow.to_user
    var ub = crow.from_user < crow.to_user ? crow.to_user : crow.from_user

    // Create the connection (upsert in case it somehow already
    // exists from a prior race).
    var connResult = await (svc.from('connections') as any)
      .upsert({
        user_a: ua,
        user_b: ub,
        is_active: true,
        origin_request_id: crow.id,
      }, { onConflict: 'user_a,user_b' })
      .select('id')
      .single()
    if (connResult.error || !connResult.data) {
      console.error('connections accept upsert error:', connResult.error)
      return res.status(500).json({ error: 'Failed to create connection' })
    }
    var connectionId = connResult.data.id

    // Seed the thread with the intro message.
    await (svc.from('connection_messages') as any).insert({
      connection_id: connectionId,
      sender_id: crow.from_user,
      body: crow.intro_message,
      status: 'approved',
    })

    // Mark the request accepted.
    await (svc.from('connection_requests') as any)
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', crow.id)

    return res.status(200).json({ status: 'accepted', connection_id: connectionId })
  }

  // Decline — recipient OR sender may decline (sender = cancel).
  if (!isRecipient && !isSender) return res.status(403).json({ error: 'Not your request' })
  await (svc.from('connection_requests') as any)
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', crow.id)

  return res.status(200).json({ status: 'declined' })
}

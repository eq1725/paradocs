/**
 * GET  /api/connections/[id]/messages
 * POST /api/connections/[id]/messages
 *
 * V9.13 Phase 3.C — thread read + post inside an established
 * connection. Auth required; sender must be one of the two
 * parties in the connection AND the connection must be active.
 *
 * POST runs the message body through moderateText('comment'):
 *   - approved → delivered immediately
 *   - rejected → stored with status='rejected' visible only to
 *                the sender so they see why
 *   - pending  → stored as approved (fail-open, matches the
 *                rest of the codebase's moderation contract)
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { moderateText } from '@/lib/services/text-moderation.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var MAX_BODY = 2000
var MIN_BODY = 1

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var connectionId = String(req.query.id || '').trim()
  if (!connectionId) return res.status(400).json({ error: 'Missing connection id' })

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

  // Verify membership + active state.
  var connResult = await svc.from('connections')
    .select('id, user_a, user_b, is_active')
    .eq('id', connectionId)
    .single()
  var conn: any = connResult && connResult.data
  if (!conn) return res.status(404).json({ error: 'Connection not found' })
  if (conn.user_a !== user!.id && conn.user_b !== user!.id) {
    return res.status(403).json({ error: 'Not a party to this connection' })
  }

  if (req.method === 'GET') {
    var msgsResult = await svc.from('connection_messages')
      .select('id, sender_id, body, status, moderation_reason, read_at, created_at')
      .eq('connection_id', connectionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500)
    var rows: any[] = (msgsResult && msgsResult.data) || []
    // Filter: approved messages visible to both; rejected/pending
    // visible only to their sender.
    var messages = rows.filter(function (m: any) {
      return m.status === 'approved' || m.sender_id === user!.id
    })

    // Best-effort mark-as-read for messages the viewer received.
    var unreadIds = messages
      .filter(function (m: any) { return m.sender_id !== user!.id && !m.read_at && m.status === 'approved' })
      .map(function (m: any) { return m.id })
    if (unreadIds.length > 0) {
      try {
        await (svc.from('connection_messages') as any)
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds)
      } catch (_) { /* non-fatal */ }
    }

    return res.status(200).json({ messages: messages, connection_active: !!conn.is_active })
  }

  if (req.method === 'POST') {
    if (!conn.is_active) return res.status(409).json({ error: 'This connection is no longer active.' })

    var body = String((req.body && req.body.body) || '').trim()
    if (body.length < MIN_BODY) return res.status(400).json({ error: 'Message cannot be empty' })
    if (body.length > MAX_BODY) return res.status(400).json({ error: 'Message too long (max ' + MAX_BODY + ' chars)' })

    var moderation = await moderateText(body, 'comment')
    var status = 'approved'
    var moderationReason: string | null = null
    if (moderation.decision === 'rejected') {
      status = 'rejected'
      moderationReason = moderation.reason || 'Did not pass community guidelines.'
    }

    var insertResult = await (svc.from('connection_messages') as any)
      .insert({
        connection_id: connectionId,
        sender_id: user.id,
        body: body,
        status: status,
        moderation_reason: moderationReason,
      })
      .select('id, sender_id, body, status, moderation_reason, created_at')
      .single()

    if (insertResult.error) {
      console.error('messages insert error:', insertResult.error)
      return res.status(500).json({ error: 'Failed to send message' })
    }

    return res.status(201).json({ message: insertResult.data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

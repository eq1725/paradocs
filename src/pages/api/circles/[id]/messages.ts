/**
 * GET  /api/circles/[id]/messages
 * POST /api/circles/[id]/messages
 *
 * V10 Phase 4.B — circle message thread. Members read; members
 * post (moderated). last_active_at on the member row is updated
 * on send (drives the "active member" count for curation).
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
  var id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'Missing id' })

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

  // Membership check.
  var memResult = await svc.from('match_circle_members')
    .select('id')
    .eq('circle_id', id)
    .eq('user_id', user.id)
    .is('left_at', null)
    .limit(1)
    .single()
  if (!memResult.data) return res.status(403).json({ error: 'Not a member of this circle' })

  if (req.method === 'GET') {
    var msgs = await svc.from('match_circle_messages')
      .select('id, sender_id, body, status, moderation_reason, created_at')
      .eq('circle_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500)
    var rows: any[] = (msgs && msgs.data) || []
    var filtered = rows.filter(function (m: any) { return m.status === 'approved' || m.sender_id === user!.id })

    // Touch last_active_at — read = light activity.
    try {
      await (svc.from('match_circle_members') as any)
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', (memResult.data as any).id)
    } catch (_) { /* non-fatal */ }

    // Hydrate sender profiles.
    var senderIds = Array.from(new Set(filtered.map(function (m: any) { return m.sender_id })))
    var profMap: Record<string, any> = {}
    if (senderIds.length > 0) {
      var profs = await svc.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds)
      ;((profs && profs.data) || []).forEach(function (p: any) { profMap[p.id] = p })
    }
    var messages = filtered.map(function (m: any) {
      var p = profMap[m.sender_id] || {}
      return {
        id: m.id,
        sender_id: m.sender_id,
        body: m.body,
        status: m.status,
        moderation_reason: m.moderation_reason,
        created_at: m.created_at,
        author: {
          username: p.username || null,
          display_name: p.display_name || null,
          avatar_url: p.avatar_url || null,
        },
      }
    })
    return res.status(200).json({ messages: messages })
  }

  if (req.method === 'POST') {
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

    var insertResult = await (svc.from('match_circle_messages') as any)
      .insert({
        circle_id: id,
        sender_id: user.id,
        body: body,
        status: status,
        moderation_reason: moderationReason,
      })
      .select('id, sender_id, body, status, moderation_reason, created_at')
      .single()

    if (insertResult.error) {
      console.error('circle message insert error:', insertResult.error)
      return res.status(500).json({ error: 'Failed to send message' })
    }

    // Touch member last_active_at + circle last_message_at on
    // approved messages (so curation can find the active members
    // and the list sort puts hot circles first).
    if (status === 'approved') {
      try {
        await (svc.from('match_circle_members') as any)
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', (memResult.data as any).id)
        await (svc.from('match_circles') as any)
          .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', id)
      } catch (_) { /* non-fatal */ }
    }

    return res.status(201).json({ message: insertResult.data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

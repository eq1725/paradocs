/**
 * GET /api/circles/[id]
 *
 * V10 Phase 4.B — circle details + member roster. Only visible
 * to current members (RLS-scoped).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
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

  // Confirm membership via service role (more reliable than RLS
  // here because we also want to know if it's archived).
  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var mem = await svc.from('match_circle_members')
    .select('id, role, muted_until')
    .eq('circle_id', id)
    .eq('user_id', user.id)
    .is('left_at', null)
    .limit(1)
    .single()
  if (!mem.data) return res.status(403).json({ error: 'Not a member of this circle' })

  var circleResult = await svc.from('match_circles')
    .select('id, name, phenomenon_type_id, region_label, status, member_count, active_count, last_message_at, created_at')
    .eq('id', id)
    .single()
  var circle: any = circleResult && circleResult.data
  if (!circle) return res.status(404).json({ error: 'Circle not found' })

  // Roster — other active members + their profiles.
  var membersResult = await svc.from('match_circle_members')
    .select('user_id, role, joined_at, last_active_at')
    .eq('circle_id', id)
    .is('left_at', null)
    .order('joined_at', { ascending: true })
    .limit(20)
  var rosterRows: any[] = (membersResult && membersResult.data) || []
  var userIds = rosterRows.map(function (r: any) { return r.user_id })
  var profileMap: Record<string, any> = {}
  if (userIds.length > 0) {
    var prof = await svc.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
    ;((prof && prof.data) || []).forEach(function (p: any) { profileMap[p.id] = p })
  }
  var members = rosterRows.map(function (r: any) {
    var p = profileMap[r.user_id] || {}
    return {
      user_id: r.user_id,
      role: r.role,
      joined_at: r.joined_at,
      last_active_at: r.last_active_at,
      is_me: r.user_id === user!.id,
      username: p.username || null,
      display_name: p.display_name || null,
      avatar_url: p.avatar_url || null,
    }
  })

  return res.status(200).json({
    circle: circle,
    members: members,
    me: { role: (mem.data as any).role, muted_until: (mem.data as any).muted_until },
  })
}

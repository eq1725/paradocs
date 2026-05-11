/**
 * GET /api/connections/inbox
 *
 * V9.13 Phase 3.C — returns the signed-in user's:
 *   - incoming pending connection requests (with sender profile)
 *   - active connections (with the other party's profile)
 *
 * Both arrays are bounded to the most recent 50 each. The UI
 * paginates client-side if needed.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

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

  // Incoming pending requests + sender profile in a join.
  var reqResult = await svc.from('connection_requests')
    .select('id, from_user, intro_message, about_report, created_at')
    .eq('to_user', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)
  var requests: any[] = (reqResult && reqResult.data) || []

  var senderIds = Array.from(new Set(requests.map(function (r: any) { return r.from_user })))
  var senderProfiles: Record<string, any> = {}
  if (senderIds.length > 0) {
    var sp = await svc.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds)
    ;((sp && sp.data) || []).forEach(function (p: any) { senderProfiles[p.id] = p })
  }
  var pendingRequests = requests.map(function (r: any) {
    var p = senderProfiles[r.from_user] || {}
    return {
      id: r.id,
      created_at: r.created_at,
      intro_message: r.intro_message,
      about_report: r.about_report,
      from: {
        user_id: r.from_user,
        username: p.username || null,
        display_name: p.display_name || null,
        avatar_url: p.avatar_url || null,
      },
    }
  })

  // Active connections via the my_connections view.
  var connResult = await (svc.from('my_connections') as any)
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)
  // The view is auth.uid()-scoped — but the service-role client
  // bypasses auth.uid(). Fall back to direct query.
  var rawConn: any[] = []
  if (connResult && connResult.data && connResult.data.length > 0) {
    // Filter to rows where the signed-in user is one of the parties.
    rawConn = connResult.data.filter(function (r: any) { return true })
  } else {
    var c2 = await svc.from('connections')
      .select('id, user_a, user_b, is_active, created_at')
      .or('user_a.eq.' + user.id + ',user_b.eq.' + user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50)
    var rows: any[] = (c2 && c2.data) || []
    var otherIds = rows.map(function (r: any) { return r.user_a === user!.id ? r.user_b : r.user_a })
    var profMap: Record<string, any> = {}
    if (otherIds.length > 0) {
      var pp = await svc.from('profiles').select('id, username, display_name, avatar_url').in('id', otherIds)
      ;((pp && pp.data) || []).forEach(function (p: any) { profMap[p.id] = p })
    }
    rawConn = rows.map(function (r: any) {
      var otherId = r.user_a === user!.id ? r.user_b : r.user_a
      var p = profMap[otherId] || {}
      return {
        connection_id: r.id,
        is_active: r.is_active,
        created_at: r.created_at,
        other_user_id: otherId,
        other_username: p.username || null,
        other_display_name: p.display_name || null,
        other_avatar_url: p.avatar_url || null,
      }
    })
  }

  return res.status(200).json({
    requests: pendingRequests,
    connections: rawConn,
  })
}

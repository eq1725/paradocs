/**
 * GET /api/circles
 *
 * V10 Phase 4.B — list the signed-in user's active Match Circles.
 * Uses the my_match_circles view (auth.uid()-scoped). Returns:
 *
 *   { circles: [{ circle_id, name, member_count, active_count,
 *     last_message_at, joined_at, ... }] }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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

  // Read via the auth.uid()-scoped view so RLS enforces visibility.
  var result = await (authClient.from('my_match_circles') as any)
    .select('*')
    .eq('status', 'active')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50)
  var rows: any[] = (result && result.data) || []
  return res.status(200).json({ circles: rows })
}

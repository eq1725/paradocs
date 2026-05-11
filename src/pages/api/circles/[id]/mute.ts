/**
 * POST /api/circles/[id]/mute
 *
 * V10 Phase 4.B — toggle mute notifications for a Match Circle.
 * Body: { days?: number } — defaults to 30; pass 0 to un-mute.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
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

  var days = Number((req.body && req.body.days) || 30)
  if (!Number.isFinite(days) || days < 0 || days > 3650) days = 30
  var mutedUntil: string | null = days === 0 ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  var result = await (authClient.from('match_circle_members') as any)
    .update({ muted_until: mutedUntil })
    .eq('circle_id', id)
    .eq('user_id', user.id)
    .is('left_at', null)
    .select('id')
    .single()

  if (result.error || !result.data) {
    return res.status(404).json({ error: 'Membership not found' })
  }

  return res.status(200).json({ muted_until: mutedUntil })
}

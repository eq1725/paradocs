/**
 * POST /api/circles/[id]/leave
 *
 * V10 Phase 4.B — leave a Match Circle. Sets left_at + a 30-day
 * cooldown_until so the curation cron won't re-add the same
 * user to the same circle for a month (prevents drama loops).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

var COOLDOWN_DAYS = 30

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

  var nowIso = new Date().toISOString()
  var cooldownIso = new Date(Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()

  var result = await (authClient.from('match_circle_members') as any)
    .update({ left_at: nowIso, cooldown_until: cooldownIso })
    .eq('circle_id', id)
    .eq('user_id', user.id)
    .is('left_at', null)
    .select('id')
    .single()

  if (result.error || !result.data) {
    return res.status(404).json({ error: 'Membership not found' })
  }

  return res.status(200).json({ left: true, cooldown_until: cooldownIso })
}

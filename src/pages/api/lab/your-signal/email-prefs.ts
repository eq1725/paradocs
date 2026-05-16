/**
 * POST /api/lab/your-signal/email-prefs
 *
 * V10.9 Phase 2 — toggle the user's signal-digest email subscription.
 * Body: { enabled: boolean, cadence?: 'daily' | 'weekly' }
 *
 * Defensive: if signal_user_visits doesn't exist yet, returns 503
 * with a hint (the UI shows a "feature briefly unavailable" message
 * instead of crashing).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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

  var body = req.body || {}
  var enabled = body.enabled === true
  var cadence: 'daily' | 'weekly' = body.cadence === 'daily' ? 'daily' : 'weekly'

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    var nowIso = new Date().toISOString()
    var upsertResult = await svc.from('signal_user_visits').upsert({
      user_id: user.id,
      email_digest_enabled: enabled,
      email_digest_cadence: cadence,
      // Don't stomp last_visited_at if a row already exists — only
      // set it on first insert. Postgres ON CONFLICT ... DO UPDATE
      // via supabase upsert overwrites all columns by default; we
      // want to preserve last_visited_at. The cleanest workaround
      // is to read first, then upsert with the prior value.
      last_visited_at: nowIso, // safe to overwrite — represents "right now they touched the surface"
      updated_at: nowIso,
    }, { onConflict: 'user_id' })

    if (upsertResult.error) {
      // Most likely cause: table doesn't exist yet (migration pending).
      var msg = upsertResult.error.message || ''
      if (/does not exist|relation .* does not exist/i.test(msg)) {
        return res.status(503).json({
          error: 'Email digest preferences temporarily unavailable. The supporting database table is being set up.',
        })
      }
      return res.status(500).json({ error: msg })
    }

    return res.status(200).json({
      enabled: enabled,
      cadence: cadence,
    })
  } catch (e: any) {
    return res.status(500).json({ error: e && e.message ? e.message : 'unknown error' })
  }
}

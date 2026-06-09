// V11.18.x — POST /api/lab/hints/[id]/resolve
//
// Per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions. The HintsRail now
// offers Accept / Save / Not mine actions on each card. This endpoint
// persists the user's terminal resolution per (user_id, hint_id) so
// the renderer can filter resolved hints out of the rail on subsequent
// fetches.
//
// Body:
//   {
//     resolution: 'accept' | 'save' | 'dismiss'
//   }
//
// Idempotent: a second resolution for the same (user, hint) UPDATEs
// the existing row rather than inserting a duplicate (the schema
// enforces UNIQUE(user_id, hint_id)).
//
// Auth: Bearer token in Authorization header — same convention used
// by /api/lab/hints and /api/lab/hints/impression.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var ALLOWED_RESOLUTIONS = ['accept', 'save', 'dismiss']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var authHeader = req.headers.authorization || ''
    var token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Not authenticated' })

    var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + token } },
    })
    var userResult = await authClient.auth.getUser(token)
    var user = userResult.data.user
    if (!user) return res.status(401).json({ error: 'Invalid session' })

    var hintId = String(req.query.id || '').trim()
    if (!hintId) return res.status(400).json({ error: 'Missing hint id' })

    var body = req.body || {}
    var resolution = String(body.resolution || '').trim()
    if (ALLOWED_RESOLUTIONS.indexOf(resolution) === -1) {
      return res.status(400).json({ error: 'Invalid resolution' })
    }

    var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Upsert on the natural key (user_id, hint_id).
    var upsertRes = await svc
      .from('lab_hint_resolutions')
      .upsert(
        {
          user_id: user.id,
          hint_id: hintId,
          resolution: resolution,
          resolved_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,hint_id' },
      )
    if (upsertRes.error) {
      console.warn('[api/lab/hints/[id]/resolve] upsert failed:', upsertRes.error.message)
      return res.status(500).json({ error: 'persist_failed' })
    }
    return res.status(200).json({ ok: true, resolution: resolution })
  } catch (e: any) {
    console.warn('[api/lab/hints/[id]/resolve] failed:', e && e.message)
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}

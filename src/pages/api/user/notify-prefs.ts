/**
 * GET / PATCH /api/user/notify-prefs
 *
 * V11.17.34 PR-4-c — User-level notification preferences. Currently
 * supports `notify_new_matches` (default TRUE) for the Lab page
 * "New-match alerts" card. Per-account, not per-experience (panel
 * verdict: one global setting until users explicitly ask for finer
 * granularity).
 *
 * Storage: `signal_user_visits.notify_new_matches BOOLEAN`. Reuses
 * the existing table that already holds `email_digest_enabled` so
 * we don't proliferate user-settings tables. If the column doesn't
 * exist yet (migration pending), endpoint returns 503 gracefully
 * and the UI falls back to localStorage-only persistence (no user-
 * visible error).
 *
 * Migration to run in Supabase SQL editor when ready:
 *   ALTER TABLE signal_user_visits
 *     ADD COLUMN IF NOT EXISTS notify_new_matches BOOLEAN DEFAULT TRUE;
 *
 * Auth: bearer token via Supabase JS auth (same pattern as
 * /api/lab/your-signal/email-prefs).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
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

  // GET: return current preferences. Default notify_new_matches=true
  // for users with no row yet (matches DB default once migration runs).
  if (req.method === 'GET') {
    try {
      var r = await svc.from('signal_user_visits')
        .select('notify_new_matches')
        .eq('user_id', user.id)
        .maybeSingle()
      if (r.error) {
        var m = r.error.message || ''
        if (/does not exist|relation .* does not exist|column .* does not exist/i.test(m)) {
          // Migration pending — return the default so UI renders correctly
          return res.status(200).json({ notify_new_matches: true, _fallback: true })
        }
        return res.status(500).json({ error: m })
      }
      var val = r.data && typeof (r.data as any).notify_new_matches === 'boolean'
        ? (r.data as any).notify_new_matches
        : true
      return res.status(200).json({ notify_new_matches: val })
    } catch (e: any) {
      return res.status(500).json({ error: e && e.message ? e.message : 'unknown error' })
    }
  }

  // PATCH / POST: upsert the preference.
  var body = req.body || {}
  if (typeof body.notify_new_matches !== 'boolean') {
    return res.status(400).json({ error: 'Body must include { notify_new_matches: boolean }' })
  }
  var enabled = body.notify_new_matches

  try {
    var nowIso = new Date().toISOString()
    var upsertResult = await svc.from('signal_user_visits').upsert({
      user_id: user.id,
      notify_new_matches: enabled,
      // Stamp last_visited_at so the row stays warm (matches email-prefs
      // pattern — represents the user actively touched a surface)
      last_visited_at: nowIso,
      updated_at: nowIso,
    } as any, { onConflict: 'user_id' })

    if (upsertResult.error) {
      var msg = upsertResult.error.message || ''
      if (/does not exist|relation .* does not exist|column .* does not exist/i.test(msg)) {
        return res.status(503).json({
          error: 'Notification preferences temporarily unavailable. The supporting database column is being set up.',
          _migration_pending: true,
        })
      }
      return res.status(500).json({ error: msg })
    }
    return res.status(200).json({ notify_new_matches: enabled })
  } catch (e: any) {
    return res.status(500).json({ error: e && e.message ? e.message : 'unknown error' })
  }
}

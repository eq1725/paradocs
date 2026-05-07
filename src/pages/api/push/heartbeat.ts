/**
 * POST /api/push/heartbeat
 *
 * V9.4.10 — bumps last_active_at on the caller's push_subscriptions
 * row(s). Called once per /discover mount so the daily push send
 * can skip users who opened the app recently.
 *
 * Body: { anon_client_id?: string } — anonymous identifier from
 *   localStorage; ignored when a signed-in user is detected.
 *
 * Idempotent — safe to call multiple times per session.
 *
 * No auth required (just a session check). Anonymous heartbeats
 * are accepted using the anon_client_id key. If neither a session
 * nor an anon_client_id is supplied, the request returns 200 with
 * `noop: true` rather than failing — the call site is fire-and-forget.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var userClient = createServerSupabaseClient({ req, res })
  var { data: sessionData } = await userClient.auth.getSession()
  var userId: string | null = sessionData?.session?.user?.id || null
  var anonClientId: string | null = req.body?.anon_client_id || null

  if (!userId && !anonClientId) {
    return res.status(200).json({ noop: true })
  }

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  var nowIso = new Date().toISOString()
  var update = admin
    .from('push_subscriptions')
    .update({ last_active_at: nowIso })
    .eq('is_active', true)

  if (userId) {
    update = update.eq('user_id', userId)
  } else {
    update = update.eq('anon_client_id', anonClientId).is('user_id', null)
  }

  var { data: bumped, error } = await update.select('id')
  if (error) {
    console.error('[PushHeartbeat] Update error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ bumped: (bumped || []).length })
}

/**
 * POST /api/push/subscribe
 *
 * V9.4 — register a Web Push subscription for the current user
 * (or anonymously). Called by the client after the user clicks
 * "Enable notifications" and the browser returns a PushSubscription.
 *
 * Body:
 *   {
 *     subscription: PushSubscription.toJSON() shape:
 *       { endpoint, keys: { p256dh, auth }, expirationTime? }
 *     anon_client_id?: string  // localStorage-generated UUID for
 *                              // anonymous users
 *     topics?: string[]        // default ['daily_lead']
 *   }
 *
 * Idempotent on (endpoint) — re-subscribing updates the row in place.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var sub = req.body && req.body.subscription
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription payload' })
  }

  // Auth — get user if signed in, else anonymous
  var userClient = createServerSupabaseClient({ req, res })
  var { data: sessionData } = await userClient.auth.getSession()
  var userId: string | null = sessionData?.session?.user?.id || null

  var anonClientId: string | null = req.body?.anon_client_id || null
  if (!userId && !anonClientId) {
    return res.status(400).json({ error: 'Either signed-in user or anon_client_id required' })
  }

  var topics: string[] = Array.isArray(req.body?.topics) ? req.body.topics : ['daily_lead']

  // Use service-role client for the upsert (RLS on push_subscriptions
  // would otherwise block anonymous inserts)
  var adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  var admin = createClient(adminUrl, serviceKey)

  var payload = {
    user_id: userId,
    anon_client_id: userId ? null : anonClientId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth_secret: sub.keys.auth,
    user_agent: (req.headers['user-agent'] as string) || null,
    topics: topics,
    is_active: true,
    consecutive_failures: 0,
    last_failure_at: null,
    updated_at: new Date().toISOString(),
  }

  var { error } = await admin
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' })

  if (error) {
    console.error('[PushSubscribe] Upsert error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ subscribed: true, user_id: userId, anon_client_id: anonClientId })
}

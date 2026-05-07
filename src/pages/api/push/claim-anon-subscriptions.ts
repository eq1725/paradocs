/**
 * POST /api/push/claim-anon-subscriptions
 *
 * V9.4.9 — closes the V9.4 anonymous-subscription loop. When a user
 * who subscribed to push notifications anonymously (anon_client_id
 * tracked in localStorage) signs in, this endpoint attributes their
 * existing push_subscriptions rows to their user_id.
 *
 * Body:
 *   { anon_client_id: string }
 *
 * Behavior:
 *   - UPDATE push_subscriptions SET user_id = $signed_in, anon_client_id = NULL
 *     WHERE anon_client_id = $body AND user_id IS NULL.
 *   - Returns the count of rows claimed.
 *   - Idempotent: if the user has already signed in once and claimed
 *     their subscriptions, the WHERE clause matches 0 rows next time.
 *
 * Auth:
 *   - Requires a signed-in user via session cookie. Anonymous calls
 *     are rejected — no point claiming for an anonymous user.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = createServerSupabaseClient({ req, res })
  var { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  var anonClientId = req.body?.anon_client_id
  if (!anonClientId || typeof anonClientId !== 'string') {
    return res.status(400).json({ error: 'Missing anon_client_id' })
  }

  // Use service-role client for the update — RLS would block a
  // user-scoped client from touching anonymous rows otherwise.
  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  var { data: claimed, error } = await admin
    .from('push_subscriptions')
    .update({
      user_id: session.user.id,
      anon_client_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('anon_client_id', anonClientId)
    .is('user_id', null)
    .select('id')

  if (error) {
    console.error('[ClaimAnonSubs] Update error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({
    claimed: (claimed || []).length,
    anon_client_id: anonClientId,
  })
}

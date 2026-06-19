// V11.17.72 - Custom Watchlists
//
// Shared auth + tier-gate helper for the Watchlist API routes. Per
// PRO_TIER_VALIDATION_V3.md §4 the Watchlists surface is Pro-only.
// Mirrors the dossier-auth helper one-for-one — kept as its own file
// because the Tier 3A spec forbids touching dossier-auth.

import type { NextApiRequest } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export interface AuthedWatchlistContext {
  user: { id: string; email?: string | null }
  tier: 'free' | 'basic' | 'pro'
  /** Service-role client — for cross-RLS reads when the endpoint
   *  needs to JOIN against tables the user shouldn't see directly. */
  svc: SupabaseClient
  /** Authed client (anon key + user's Bearer) — RLS-bound; use this
   *  for INSERT/UPDATE/DELETE on lab_watchlists so the policies bind. */
  authed: SupabaseClient
}

export async function resolveWatchlistContext(req: NextApiRequest): Promise<AuthedWatchlistContext | null> {
  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return null

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  var tier: 'free' | 'basic' | 'pro' = 'free'
  try {
    var tierResult = await (svc.from('user_subscriptions') as any)
      .select('tier:subscription_tiers(name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    var tierRow = tierResult && tierResult.data && (tierResult.data as any).tier
    var tName = tierRow && tierRow.name ? String(tierRow.name).toLowerCase() : ''
    // V11.19 — single membership: any paid tier resolves to full access
    // ('pro'). Members are kept on the 'basic' plan slug but get the full
    // working tools (Watchlists included).
    if (tName === 'basic' || tName === 'pro' || tName === 'enterprise' || tName === 'member') tier = 'pro'
  } catch (_e) {
    /* default to free */
  }

  return {
    user: { id: user.id, email: user.email || null },
    tier: tier,
    svc: svc,
    authed: authClient,
  }
}

/** Service-only context for the cron handlers. */
export function serviceContext(): { svc: SupabaseClient } {
  return { svc: createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) }
}

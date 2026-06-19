// V11.17.73 — Named-Match + Peer DM auth/tier gate
//
// Shared auth + tier-gate helper for the Named-Match + DM API routes.
// Per LAB_PANEL_REVIEW_V3 §2 the named-match introductions surface is
// BASIC-tier minimum (Pro inherits it). Free users never reach these
// endpoints — they see LabPaywallSurface in the slots that would hold
// the offer rail and the DM threads list.
//
// Mirrors watchlist-auth.ts so cross-team refactors don't ripple.

import type { NextApiRequest } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export interface AuthedNamedMatchContext {
  user: { id: string; email: string | null }
  tier: 'free' | 'basic' | 'pro'
  /** Service-role client — for cross-RLS reads + counterparty payloads. */
  svc: SupabaseClient
  /** Authed client (anon key + user's Bearer) — RLS-bound; use this for
   *  user-scoped mutations that should bind to the user's auth.uid(). */
  authed: SupabaseClient
}

export async function resolveNamedMatchContext(req: NextApiRequest): Promise<AuthedNamedMatchContext | null> {
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
    // ('pro'). Members (on the 'basic' plan slug) get the full named-match
    // layer, not a reduced one.
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

/** True when the user may use the named-match + DM features. */
export function isBasicOrAbove(tier: 'free' | 'basic' | 'pro'): boolean {
  return tier === 'basic' || tier === 'pro'
}

/** Service-only context for the cron + matcher. */
export function serviceContext(): { svc: SupabaseClient } {
  return { svc: createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) }
}

/** Canonical pair ordering for suppression + DM thread rows. */
export function canonicalPair(userA: string, userB: string): { a: string; b: string } {
  if (userA < userB) return { a: userA, b: userB }
  return { a: userB, b: userA }
}

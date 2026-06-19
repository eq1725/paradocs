// V11.17.71 - Pro Dossier
//
// Shared auth + tier-gate helper for the Pro Dossier API routes. Per
// PRO_TIER_VALIDATION_V3.md §3 the Dossier surface is Pro-only.
// Free / Basic users must be denied with 403 and routed to the
// existing LabPaywallSurface upsell.

import type { NextApiRequest } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export interface AuthedDossierContext {
  user: { id: string; email?: string | null }
  tier: 'free' | 'basic' | 'pro'
  svc: SupabaseClient
}

/**
 * Resolve the authed user + their tier. Returns null when the bearer
 * token is missing/invalid; the endpoint should respond 401. Returns
 * { tier: 'free' | 'basic' } when authed but not Pro; the endpoint
 * should respond 403 with an upgrade hint.
 */
export async function resolveDossierContext(req: NextApiRequest): Promise<AuthedDossierContext | null> {
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

  // Tier resolution mirrors the pattern in /api/lab/hints + your-signal.
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
    // ('pro'). The former Basic/Pro split is collapsed into one Member
    // tier (kept on the 'basic' plan slug), so a paid member now passes
    // every `ctx.tier !== 'pro'` gate (Dossier, Watchlists, etc.).
    if (tName === 'basic' || tName === 'pro' || tName === 'enterprise' || tName === 'member') tier = 'pro'
  } catch (_e) {
    /* default to free */
  }

  return { user: { id: user.id, email: user.email || null }, tier: tier, svc: svc }
}

/**
 * Service-only context (no auth check) — used by the public share
 * viewer + the cron recompute.
 */
export function serviceContext(): { svc: SupabaseClient } {
  return { svc: createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) }
}

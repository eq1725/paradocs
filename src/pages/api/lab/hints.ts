// V11.17.65 — GET /api/lab/hints
//
// Returns RenderedHint[] for the authenticated user. The renderer walks
// SEED_HINTS, evaluates eligibility, executes data queries, binds
// tokens, applies cadence, and caps the result at 6 cards.
//
// Auth: bearer-token in Authorization header (matches the convention
// used by other /api/lab/* routes — see your-signal/index.ts).
//
// Defensive: returns an empty array on auth failure or any runtime
// error — the Hints rail degrades silently to "no Hints right now"
// rather than crashing the Lab.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { renderHintsForUser } from '@/lib/lab/hints/hint-renderer'
import type { HintTierVisibility } from '@/lib/lab/hints/hint-schema'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

    var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Resolve tier — same pattern your-signal uses.
    var tier: HintTierVisibility = 'free'
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
      // V11.19 — single membership: any paid tier resolves to full ('pro').
      if (tName === 'basic' || tName === 'pro' || tName === 'enterprise' || tName === 'member') tier = 'pro'
    } catch (_e) {
      /* default to free */
    }

    var hints = await renderHintsForUser(user.id, svc, tier)
    return res.status(200).json({ hints: hints, tier: tier })
  } catch (e: any) {
    console.warn('[api/lab/hints] render failed:', e && e.message)
    return res.status(200).json({ hints: [], tier: 'free', error: true })
  }
}

/**
 * GET /api/user/researcher-overlap
 *
 * V10.3 (QA #6) — Returns other researchers whose save library
 * meaningfully overlaps with the signed-in user's. Powers the
 * Researcher Overlap sheet in the Research Pulse box.
 *
 * Scoring + filtering live in src/lib/researcher-overlap.ts —
 * this handler is auth, query-param parsing, caching, and shape.
 *
 * Cache: 1-hour TTL keyed by user_id, stored in-memory. Overlap
 * lists change slowly relative to the page; refreshing every
 * navigation is wasteful. ?fresh=1 bypasses for admin/debug.
 *
 * Privacy:
 *   - Bearer-token auth required.
 *   - Honors profiles.researcher_overlap_visible (mutual gate).
 *   - Service-role client used only to AGGREGATE — no raw
 *     per-user save lists leak to the response.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  computeResearcherOverlap,
  DEFAULT_THRESHOLDS,
  type OverlapMatch,
  type OverlapThresholds,
} from '@/lib/researcher-overlap'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// In-memory cache. Lambda warm-instance lifetime is short
// enough that this won't grow unbounded; OK for V1.
var CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
type CacheEntry = { expiresAt: number; payload: ResponsePayload }
var cache = new Map<string, CacheEntry>()

interface ResponsePayload {
  matches: OverlapMatch[]
  total_visible: number
  thresholds: OverlapThresholds
  computed_at: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

  var fresh = req.query.fresh === '1' || req.query.fresh === 'true'
  var cached = cache.get(user.id)
  if (!fresh && cached && cached.expiresAt > Date.now()) {
    return res.status(200).json(cached.payload)
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    var result = await computeResearcherOverlap(svc, user.id, DEFAULT_THRESHOLDS, {
      limit: 12,
      resolveDisplay: true,
    })

    var payload: ResponsePayload = {
      matches: result.matches,
      total_visible: result.meta.passedCount,
      thresholds: DEFAULT_THRESHOLDS,
      computed_at: new Date().toISOString(),
    }

    cache.set(user.id, { expiresAt: Date.now() + CACHE_TTL_MS, payload })
    return res.status(200).json(payload)
  } catch (err: any) {
    console.error('researcher-overlap error', err)
    return res.status(500).json({ error: 'Failed to compute overlap', detail: err?.message || String(err) })
  }
}

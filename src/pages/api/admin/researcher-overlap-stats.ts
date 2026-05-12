/**
 * GET /api/admin/researcher-overlap-stats
 *
 * V10.3 (QA #6d) — Admin monitoring + tuning surface for the
 * Researcher Overlap social feature. Lets Chase verify the
 * scoring is producing meaningful matches at the current
 * thresholds, and A/B-test alternate threshold values without
 * a redeploy.
 *
 * Two modes (controlled by ?mode=):
 *
 *   mode=sample (default) — Run the overlap scoring for a
 *       randomly-sampled set of users (or specific user_ids
 *       via ?user_ids=a,b,c) using either DEFAULT_THRESHOLDS
 *       or a custom set provided as query params. Returns
 *       per-user overlap counts + a global histogram of scores.
 *
 *   mode=top — Returns the top N overlapping pairs in the
 *       system right now (computed for a sample of seed users).
 *
 * Query params:
 *   sample_size  — How many seed users to compute overlaps for. Default 25, max 100.
 *   user_ids     — Comma-separated list of seed user_ids to compute for. Overrides sample.
 *   score_floor  — Override the score floor threshold.
 *   min_items    — Override the min-shared-items threshold.
 *   min_external — Override the min-external threshold.
 *   min_internal — Override the min-internal threshold.
 *   strong_tier  — Override the strong-tier cutoff.
 *
 * Response includes both the post-filter matches AND the raw
 * debug rows (every scored candidate, including rejected) so
 * the admin can see the full distribution before threshold
 * filtering kicks in.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  computeResearcherOverlap,
  DEFAULT_THRESHOLDS,
  type OverlapThresholds,
  type OverlapComputeResult,
} from '@/lib/researcher-overlap'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Admin auth — same pattern as queue-counts.ts.
  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })

  var { data: profile } = await (admin.from('profiles') as any)
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!profile || (profile as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  // ── Parse threshold overrides ────────────────────────────
  var thresholds: OverlapThresholds = {
    scoreFloor: numParam(req.query.score_floor, DEFAULT_THRESHOLDS.scoreFloor),
    minItems: numParam(req.query.min_items, DEFAULT_THRESHOLDS.minItems),
    minExternal: numParam(req.query.min_external, DEFAULT_THRESHOLDS.minExternal),
    minInternal: numParam(req.query.min_internal, DEFAULT_THRESHOLDS.minInternal),
    strongTier: numParam(req.query.strong_tier, DEFAULT_THRESHOLDS.strongTier),
    perItemFanoutCap: numParam(req.query.fanout_cap, DEFAULT_THRESHOLDS.perItemFanoutCap),
  }

  var mode = (req.query.mode as string) || 'sample'

  // ── Pick the seed users to compute for ───────────────────
  var seedUserIds: string[] = []
  if (typeof req.query.user_ids === 'string' && req.query.user_ids.length > 0) {
    seedUserIds = (req.query.user_ids as string).split(',').map(s => s.trim()).filter(Boolean)
  } else {
    var sampleSize = Math.min(numParam(req.query.sample_size, 25), 100)
    // Pick users who actually have saves — otherwise we'd waste
    // compute on empty libraries. Take the most-recently-active
    // researchers (last 90d created saves).
    var ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    var { data: recentSavers } = await (admin.from('saved_reports') as any)
      .select('user_id, created_at')
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(sampleSize * 4)
    var seen: Record<string, boolean> = {}
    for (var row of (recentSavers || [])) {
      if (!seen[row.user_id]) {
        seen[row.user_id] = true
        seedUserIds.push(row.user_id)
        if (seedUserIds.length >= sampleSize) break
      }
    }
  }

  if (seedUserIds.length === 0) {
    return res.status(200).json({
      mode,
      thresholds,
      seeded_users: 0,
      results: [],
      histogram: emptyHistogram(),
      tier_counts: { strong: 0, notable: 0 },
      pair_stats: { total_passed: 0, total_rejected: 0, avg_passed_per_seed: 0 },
      top_pairs: [],
      computed_at: new Date().toISOString(),
    })
  }

  // ── Run scoring for each seed user (in parallel, but capped) ──
  // Bound concurrency so we don't hammer Supabase.
  var CONCURRENCY = 5
  var results: Array<{ seed_user_id: string; result: OverlapComputeResult }> = []
  for (var i = 0; i < seedUserIds.length; i += CONCURRENCY) {
    var batch = seedUserIds.slice(i, i + CONCURRENCY)
    var batchResults = await Promise.all(
      batch.map(uid =>
        computeResearcherOverlap(admin, uid, thresholds, { limit: 50, resolveDisplay: false })
          .then(r => ({ seed_user_id: uid, result: r }))
          .catch(err => ({
            seed_user_id: uid,
            result: {
              matches: [],
              debug: [],
              meta: {
                candidateCount: 0, passedCount: 0, strongCount: 0, notableCount: 0,
                rejectedByScore: 0, rejectedByItems: 0, rejectedByDiversity: 0,
                rejectedByVisibility: 0, durationMs: 0, error: err?.message,
              } as any,
            } as OverlapComputeResult,
          })),
      ),
    )
    results.push(...batchResults)
  }

  // ── Aggregate ────────────────────────────────────────────
  var totalPassed = 0
  var totalRejected = 0
  var strongCount = 0
  var notableCount = 0
  var rejectedReasons = { score: 0, items: 0, diversity: 0, visibility: 0 }
  var histogram = emptyHistogram()
  var allPairs: Array<{ a: string; b: string; score: number }> = []

  for (var { seed_user_id, result } of results) {
    totalPassed += result.meta.passedCount
    totalRejected += result.meta.candidateCount - result.meta.passedCount
    strongCount += result.meta.strongCount
    notableCount += result.meta.notableCount
    rejectedReasons.score += result.meta.rejectedByScore
    rejectedReasons.items += result.meta.rejectedByItems
    rejectedReasons.diversity += result.meta.rejectedByDiversity
    rejectedReasons.visibility += result.meta.rejectedByVisibility

    for (var d of result.debug) {
      bumpBucket(histogram, d.score, d.passed)
    }
    for (var m of result.matches) {
      // De-dup pairs (smaller id first) so we don't double-count
      // when both ends of the pair appear in our sample.
      var a = seed_user_id < m.userId ? seed_user_id : m.userId
      var b = seed_user_id < m.userId ? m.userId : seed_user_id
      allPairs.push({ a, b, score: m.score })
    }
  }

  // Dedup top pairs.
  var pairMap = new Map<string, { a: string; b: string; score: number }>()
  for (var p of allPairs) {
    var key = p.a + '|' + p.b
    var existing = pairMap.get(key)
    if (!existing || p.score > existing.score) pairMap.set(key, p)
  }
  var topPairs = Array.from(pairMap.values()).sort((x, y) => y.score - x.score).slice(0, 25)

  var perSeedResults = results.map(({ seed_user_id, result }) => ({
    seed_user_id,
    candidates: result.meta.candidateCount,
    passed: result.meta.passedCount,
    strong: result.meta.strongCount,
    notable: result.meta.notableCount,
    rejected_score: result.meta.rejectedByScore,
    rejected_items: result.meta.rejectedByItems,
    rejected_diversity: result.meta.rejectedByDiversity,
    rejected_visibility: result.meta.rejectedByVisibility,
    duration_ms: result.meta.durationMs,
  }))

  return res.status(200).json({
    mode,
    thresholds,
    seeded_users: seedUserIds.length,
    results: perSeedResults,
    histogram,
    tier_counts: { strong: strongCount, notable: notableCount },
    pair_stats: {
      total_passed: totalPassed,
      total_rejected: totalRejected,
      total_rejected_by: rejectedReasons,
      avg_passed_per_seed: seedUserIds.length === 0 ? 0 : round3(totalPassed / seedUserIds.length),
    },
    top_pairs: topPairs,
    computed_at: new Date().toISOString(),
  })
}

// ── Helpers ──────────────────────────────────────────────────

function numParam(raw: any, fallback: number): number {
  var n = typeof raw === 'string' ? parseFloat(raw) : NaN
  return isNaN(n) ? fallback : n
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }

interface ScoreBucket { lo: number; hi: number; label: string; passed: number; rejected: number }
function emptyHistogram(): ScoreBucket[] {
  return [
    { lo: 0,   hi: 0.5, label: '0 – 0.5',   passed: 0, rejected: 0 },
    { lo: 0.5, hi: 1.0, label: '0.5 – 1.0', passed: 0, rejected: 0 },
    { lo: 1.0, hi: 1.5, label: '1.0 – 1.5', passed: 0, rejected: 0 },
    { lo: 1.5, hi: 2.0, label: '1.5 – 2.0', passed: 0, rejected: 0 },
    { lo: 2.0, hi: 3.0, label: '2.0 – 3.0', passed: 0, rejected: 0 },
    { lo: 3.0, hi: 5.0, label: '3.0 – 5.0', passed: 0, rejected: 0 },
    { lo: 5.0, hi: Infinity, label: '5.0+',  passed: 0, rejected: 0 },
  ]
}
function bumpBucket(h: ScoreBucket[], score: number, passed: boolean) {
  for (var b of h) {
    if (score >= b.lo && score < b.hi) {
      if (passed) b.passed++
      else b.rejected++
      return
    }
  }
}

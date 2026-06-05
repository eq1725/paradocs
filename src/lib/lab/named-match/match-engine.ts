// V11.17.73 — Named-Match match engine.
//
// Given the corpus of all reports where discoverable = TRUE AND the
// report owner is Basic+ tier, this engine finds pairs whose
// fingerprint score crosses the strong-match threshold (0.85), filters
// against the suppression list + cadence cap (max 1 NEW offer per user
// per 7 days), and emits offer rows ready for INSERT into
// lab_named_match_offers.
//
// This module is pure-ish — it accepts a Supabase service client for
// the DB lookups (discoverable reports, existing offers, suppressions)
// but performs no writes. The cron handler /api/cron/detect-named-matches
// owns the persistence.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  scoreFingerprintPair,
  CONFIDENCE_STRONG,
  buildAnonymousPayload,
  type FingerprintReport,
  type FingerprintScore,
  type AnonymousOfferPayload,
} from './fingerprint'
import { canonicalPair } from './named-match-auth'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface DiscoverableReportRow extends FingerprintReport {
  submitted_by: string
}

export interface CandidateOffer {
  initiator_user_id: string
  initiator_report_id: string
  recipient_user_id: string
  recipient_report_id: string
  match_confidence: number
  signal_overlap_count: number
  anonymous_payload: AnonymousOfferPayload
}

/** Per-run guardrail counters returned for cron logging. */
export interface DetectionStats {
  candidate_pairs_scored: number
  strong_pairs: number
  offers_emitted: number
  suppressed_pairs: number
  cadence_capped: number
  duplicate_existing_offers: number
}

/** Cadence cap: max 1 NEW offer surfaced per user per 7 days. */
export var PER_USER_OFFER_COOLDOWN_DAYS = 7

/** Suppression duration after decline / thread closure / withdrawal. */
export var SUPPRESSION_DAYS = 90

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function nowIso(): string {
  return new Date().toISOString()
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Pull all reports with discoverable = TRUE whose owners are eligible
 * (Basic+ tier). Tier filter is delegated to the cron handler which
 * may pre-resolve eligible user ids; we accept an optional list and
 * filter in SQL if provided.
 */
export async function loadDiscoverableReports(
  svc: SupabaseClient,
  eligibleUserIds: string[] | null,
  limit = 5000,
): Promise<DiscoverableReportRow[]> {
  var q = svc
    .from('reports')
    .select('id, submitted_by, category, latitude, longitude, event_date, event_time, tags, paradocs_assessment, description, summary, title')
    .eq('discoverable', true)
    .eq('source_type', 'user_submission')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (eligibleUserIds && eligibleUserIds.length > 0) {
    q = q.in('submitted_by', eligibleUserIds)
  }
  var resp = await q
  if (resp.error) return []
  var rows = (resp.data as any[]) || []
  return rows.map(function (r): DiscoverableReportRow {
    return {
      id: r.id,
      submitted_by: r.submitted_by,
      category: r.category || null,
      subfamily: null,
      latitude: r.latitude,
      longitude: r.longitude,
      event_date: r.event_date,
      event_time: r.event_time,
      tags: r.tags || [],
      paradocs_assessment: r.paradocs_assessment || null,
      description: r.description || null,
      summary: r.summary || null,
      title: r.title || null,
    }
  })
}

/**
 * Group discoverable reports by phen_family for cheap pair generation.
 * Pairs are only meaningful within the same phen_family (signal #1 is
 * load-bearing), so we never cross families.
 */
export function groupByPhenFamily(rows: DiscoverableReportRow[]): Record<string, DiscoverableReportRow[]> {
  var out: Record<string, DiscoverableReportRow[]> = {}
  rows.forEach(function (r) {
    var fam = r.category || '_uncategorized'
    if (!out[fam]) out[fam] = []
    out[fam].push(r)
  })
  return out
}

/**
 * Score every (a, b) pair within each phen_family, return the strong
 * matches sorted by descending confidence. Pairs where both reports
 * belong to the same user are skipped.
 */
export function scoreAllPairs(rows: DiscoverableReportRow[]): Array<{
  a: DiscoverableReportRow
  b: DiscoverableReportRow
  score: FingerprintScore
}> {
  var groups = groupByPhenFamily(rows)
  var out: Array<{ a: DiscoverableReportRow; b: DiscoverableReportRow; score: FingerprintScore }> = []
  var fams = Object.keys(groups)
  for (var f = 0; f < fams.length; f++) {
    var arr = groups[fams[f]]
    for (var i = 0; i < arr.length; i++) {
      for (var j = i + 1; j < arr.length; j++) {
        if (arr[i].submitted_by === arr[j].submitted_by) continue
        var score = scoreFingerprintPair(arr[i], arr[j])
        if (score.confidence >= CONFIDENCE_STRONG) {
          out.push({ a: arr[i], b: arr[j], score: score })
        }
      }
    }
  }
  out.sort(function (x, y) { return y.score.confidence - x.score.confidence })
  return out
}

/**
 * Load active suppressions and existing offers to filter pair candidates.
 * Returns lookup sets keyed by 'reportA|reportB' (canonical alphabetical
 * order on report ids) and 'userA|userB' (canonical user-id order).
 */
export async function loadSuppressionsAndOffers(
  svc: SupabaseClient,
): Promise<{
  suppressedPairs: Set<string>
  existingOfferReportPairs: Set<string>
  recentOfferCountByUser: Record<string, number>
}> {
  var suppressed = new Set<string>()
  var offerPairs = new Set<string>()
  var recentByUser: Record<string, number> = {}

  // Suppressions still in effect (suppressed_until > now).
  var sResp = await svc
    .from('lab_match_suppressions')
    .select('user_a_id, user_b_id, suppressed_until')
    .gt('suppressed_until', nowIso())
    .limit(20000)
  ;((sResp.data as any[]) || []).forEach(function (row: any) {
    suppressed.add(row.user_a_id + '|' + row.user_b_id)
  })

  // Existing offers (any state) — we never duplicate an offer for the
  // same (initiator_report, recipient_report) pair. Use canonical
  // report-id ordering so we catch (A,B) and (B,A) as the same pair.
  var oResp = await svc
    .from('lab_named_match_offers')
    .select('initiator_report_id, recipient_report_id, initiator_user_id, recipient_user_id, created_at, state')
    .limit(20000)
  ;((oResp.data as any[]) || []).forEach(function (row: any) {
    var p = [row.initiator_report_id, row.recipient_report_id].sort()
    offerPairs.add(p[0] + '|' + p[1])
  })

  // Cadence cap: count NEW offers per user in the last 7 days. We count
  // an offer toward BOTH parties' caps so neither side gets spammed.
  var cutoff = daysAgoIso(PER_USER_OFFER_COOLDOWN_DAYS)
  var rResp = await svc
    .from('lab_named_match_offers')
    .select('initiator_user_id, recipient_user_id, created_at')
    .gte('created_at', cutoff)
    .limit(20000)
  ;((rResp.data as any[]) || []).forEach(function (row: any) {
    recentByUser[row.initiator_user_id] = (recentByUser[row.initiator_user_id] || 0) + 1
    recentByUser[row.recipient_user_id] = (recentByUser[row.recipient_user_id] || 0) + 1
  })

  return {
    suppressedPairs: suppressed,
    existingOfferReportPairs: offerPairs,
    recentOfferCountByUser: recentByUser,
  }
}

/**
 * Apply the suppression list + cadence cap to a sorted list of strong
 * pairs and produce the emit-ready offer set.
 *
 * Cadence: we ONLY emit if BOTH parties are under the 7-day cap.
 * Tie-breaking is by confidence (already sorted by caller).
 */
export function selectOffersWithGuardrails(
  strongPairs: Array<{ a: DiscoverableReportRow; b: DiscoverableReportRow; score: FingerprintScore }>,
  guardrails: {
    suppressedPairs: Set<string>
    existingOfferReportPairs: Set<string>
    recentOfferCountByUser: Record<string, number>
  },
  stats: DetectionStats,
): CandidateOffer[] {
  var offers: CandidateOffer[] = []
  // Mutable copy — we increment as we accept offers so we keep within
  // the cap inside a single run too.
  var perUser = Object.assign({}, guardrails.recentOfferCountByUser)

  for (var i = 0; i < strongPairs.length; i++) {
    var pair = strongPairs[i]
    var a = pair.a
    var b = pair.b

    var canonReports = [a.id, b.id].sort()
    var reportPairKey = canonReports[0] + '|' + canonReports[1]
    if (guardrails.existingOfferReportPairs.has(reportPairKey)) {
      stats.duplicate_existing_offers++
      continue
    }

    var canonUsers = canonicalPair(a.submitted_by, b.submitted_by)
    var userPairKey = canonUsers.a + '|' + canonUsers.b
    if (guardrails.suppressedPairs.has(userPairKey)) {
      stats.suppressed_pairs++
      continue
    }

    var capA = perUser[a.submitted_by] || 0
    var capB = perUser[b.submitted_by] || 0
    if (capA >= 1 || capB >= 1) {
      stats.cadence_capped++
      continue
    }

    // Initiator = owner of `a` (arbitrary canonical pick — we use the
    // user whose id sorts first so the same pair always assigns the
    // same initiator deterministically). Recipient sees the offer first.
    var initiator = a
    var recipient = b
    if (a.submitted_by > b.submitted_by) {
      initiator = b
      recipient = a
    }

    offers.push({
      initiator_user_id: initiator.submitted_by,
      initiator_report_id: initiator.id,
      recipient_user_id: recipient.submitted_by,
      recipient_report_id: recipient.id,
      match_confidence: pair.score.confidence,
      signal_overlap_count: pair.score.signal_overlap_count,
      anonymous_payload: buildAnonymousPayload(initiator, recipient, pair.score),
    })

    perUser[initiator.submitted_by] = capA + 1
    perUser[recipient.submitted_by] = capB + 1
    stats.offers_emitted++

    // Memoize the new pair to suppress further offers between the same
    // two reports in this run.
    guardrails.existingOfferReportPairs.add(reportPairKey)
  }

  return offers
}

/**
 * Resolve the user_ids that are currently Basic+ tier (eligible owners
 * for named-match offers). Returns at most `limit` user ids; the cron
 * handler caps this so the discoverable-reports query stays bounded.
 *
 * The query pivots on user_subscriptions + subscription_tiers; we keep
 * it simple and small. If the user has no active row they're Free →
 * filtered out.
 */
export async function loadBasicOrAboveUserIds(
  svc: SupabaseClient,
  limit = 10000,
): Promise<string[]> {
  var resp = await (svc.from('user_subscriptions') as any)
    .select('user_id, status, tier:subscription_tiers(name)')
    .eq('status', 'active')
    .limit(limit)
  if (resp.error) return []
  var rows = (resp.data as any[]) || []
  var out: string[] = []
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i].tier && rows[i].tier.name ? String(rows[i].tier.name).toLowerCase() : ''
    if (t === 'basic' || t === 'pro' || t === 'enterprise') out.push(rows[i].user_id)
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Public entry point — used by the cron + smoke test                          */
/* -------------------------------------------------------------------------- */

export async function detectNamedMatches(
  svc: SupabaseClient,
  opts?: { eligibleUserIds?: string[] | null; reportLimit?: number; gateOnTier?: boolean },
): Promise<{ offers: CandidateOffer[]; stats: DetectionStats }> {
  var stats: DetectionStats = {
    candidate_pairs_scored: 0,
    strong_pairs: 0,
    offers_emitted: 0,
    suppressed_pairs: 0,
    cadence_capped: 0,
    duplicate_existing_offers: 0,
  }

  var eligibleUserIds: string[] | null = (opts && opts.eligibleUserIds) || null
  // Default to gating by tier unless the caller explicitly opts out (smoke).
  var gate = opts && opts.gateOnTier !== undefined ? !!opts.gateOnTier : true
  if (gate && !eligibleUserIds) {
    eligibleUserIds = await loadBasicOrAboveUserIds(svc)
    // No eligible users → nothing to do.
    if (eligibleUserIds.length === 0) return { offers: [], stats: stats }
  }

  var rows = await loadDiscoverableReports(svc, eligibleUserIds, (opts && opts.reportLimit) || 5000)
  if (rows.length < 2) return { offers: [], stats: stats }

  var strong = scoreAllPairs(rows)
  stats.strong_pairs = strong.length
  // candidate_pairs_scored is approximated via the same-family pair
  // count; we recompute it here so the stats are useful even when
  // no strong pairs surface.
  var groups = groupByPhenFamily(rows)
  var famKeys = Object.keys(groups)
  for (var f = 0; f < famKeys.length; f++) {
    var n = groups[famKeys[f]].length
    stats.candidate_pairs_scored += (n * (n - 1)) / 2
  }

  var guardrails = await loadSuppressionsAndOffers(svc)

  var offers = selectOffersWithGuardrails(strong, guardrails, stats)
  return { offers: offers, stats: stats }
}

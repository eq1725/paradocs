// V11.17.65 — Hints renderer (cadence + token binding + fallback chain).
//
// Public entry-point: renderHintsForUser(userId, supabase, tier).
//
// Pipeline per V3 Section 4 cadence rules:
//   1. Load user context (their submitted reports + tier).
//   2. Walk SEED_HINTS, evaluate eligibility for each.
//   3. For eligible Hints, execute every data_query in parallel,
//      bind the resulting tokens.
//   4. Apply min_data_threshold suppression — drop the Hint if any
//      query's denominator falls below threshold.
//   5. Apply cadence:
//        a. Drop Hints the user has seen in the last 7 days
//           (lab_hint_impressions lookup).
//        b. Cap named-match Hints at 1 per session.
//        c. Cap any single category at 2 per session for diversity.
//        d. Fall back to fallback_eligible Hints (deterministic by
//           userId hash) when fewer than 3 data-driven Hints qualify.
//   6. Cap output at 6 RenderedHints for UI density.
//
// Stateless where possible. The lab_hint_impressions table read is the
// only non-pure piece. Failures everywhere fall through to safe defaults.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hint, HintCategory, HintCta, HintTierVisibility } from './hint-schema'
import { SEED_HINTS } from './seed-hints'
import type { HintToken } from './data-query-types'
import { executeQuery, type QueryBinding, type UserContext, type UserReport } from './data-query-executor'
import { isHintEligible, type EligibilitySignals } from './eligibility'

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export interface RenderedHint {
  id: string
  category: HintCategory
  hint_type: Hint['hint_type']
  title: string
  body: string
  cta: HintCta
  tier_visibility: HintTierVisibility
  freshness_policy: Hint['freshness_policy']
  cross_category: boolean
  /** Bindings actually used at render time — useful for the impression log. */
  bound_tokens: Partial<Record<HintToken, number | string>>
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

var MAX_HINTS_PER_SESSION = 6
var MAX_PER_CATEGORY_PER_SESSION = 2
var MAX_NAMED_MATCH_PER_SESSION = 1
var IMPRESSION_DEDUPE_DAYS = 7
var MIN_DATA_DRIVEN_BEFORE_FALLBACK = 3

/* -------------------------------------------------------------------------- */
/* Public entry-point                                                          */
/* -------------------------------------------------------------------------- */

export async function renderHintsForUser(
  userId: string,
  svc: SupabaseClient,
  tier: HintTierVisibility,
): Promise<RenderedHint[]> {
  var ctx = await loadUserContext(userId, svc)
  return renderHintsForContext(ctx, svc, tier)
}

/**
 * Identical to renderHintsForUser but takes a pre-built UserContext.
 * Exported for the smoke-test path so we can render against a synthetic
 * context without going through Supabase.
 */
export async function renderHintsForContext(
  ctx: UserContext,
  svc: SupabaseClient,
  tier: HintTierVisibility,
): Promise<RenderedHint[]> {
  var now = new Date()

  // Pre-compute geographic proximity once for the user's primary
  // report (the eligibility checker can reuse it for any radius).
  var nearbyByRadius = await precomputeNearbyCounts(ctx, svc)

  // Pull the user's recent impressions for the dedupe window.
  var recentlyShown = await loadRecentImpressions(ctx.user_id, svc)

  // V11.18.x — also pull terminal resolutions (Accept / Save / Not mine)
  // per UI_SHIPPING_ROADMAP_V2 Sprint 1A. Any resolved hint is hidden
  // from the rail going forward, independent of the impression-dedupe
  // window.
  var resolvedHints = await loadResolvedHints(ctx.user_id, svc)

  // Evaluate each Hint in two passes — first eligibility (cheap), then
  // data_queries (expensive). Run data_queries in parallel across the
  // surviving Hints to keep wall-clock low.
  var eligible: Hint[] = []
  for (var i = 0; i < SEED_HINTS.length; i++) {
    var h = SEED_HINTS[i]
    if (recentlyShown[h.id]) continue
    if (resolvedHints[h.id]) continue
    var sig: EligibilitySignals = {
      nearby_count_within_miles:
        h.trigger_conditions.within_miles !== undefined
          ? nearbyByRadius[h.trigger_conditions.within_miles] || 0
          : undefined,
    }
    if (isHintEligible(h, ctx, tier, sig, now)) {
      eligible.push(h)
    }
  }

  // Bind tokens — run data queries in parallel, suppress on min_data_threshold.
  var bindResults = await Promise.all(
    eligible.map(function (h) { return bindHint(h, ctx, svc) }),
  )

  var dataDriven: RenderedHint[] = []
  var fallbackPool: RenderedHint[] = []
  for (var b = 0; b < bindResults.length; b++) {
    var res = bindResults[b]
    if (!res) continue
    if (eligible[b].trigger_conditions.fallback_eligible && eligible[b].data_queries.length === 0) {
      fallbackPool.push(res)
    } else {
      dataDriven.push(res)
    }
  }

  // Sort data-driven by category-first then by hint_type for variety.
  dataDriven.sort(function (a, b) {
    if (a.category < b.category) return -1
    if (a.category > b.category) return 1
    return 0
  })

  // Apply cadence rules.
  var chosen = applyCadence(dataDriven, ctx.user_id)

  // Fallback if we don't have enough data-driven Hints.
  if (chosen.length < MIN_DATA_DRIVEN_BEFORE_FALLBACK && fallbackPool.length > 0) {
    var rotatedFallbacks = rotateFallbackPool(fallbackPool, ctx.user_id)
    for (var f = 0; f < rotatedFallbacks.length && chosen.length < MAX_HINTS_PER_SESSION; f++) {
      // Don't double-add a Hint already chosen.
      var already = false
      for (var c = 0; c < chosen.length; c++) {
        if (chosen[c].id === rotatedFallbacks[f].id) { already = true; break }
      }
      if (!already) chosen.push(rotatedFallbacks[f])
    }
  }

  return chosen.slice(0, MAX_HINTS_PER_SESSION)
}

/* -------------------------------------------------------------------------- */
/* User context loading                                                        */
/* -------------------------------------------------------------------------- */

async function loadUserContext(userId: string, svc: SupabaseClient): Promise<UserContext> {
  try {
    var result = await svc
      .from('reports')
      .select(
        'id, category, phenomenon_type_id, latitude, longitude, state_province, country, event_date, witness_state_at_event, tags, paradocs_assessment, description, summary, title, created_at',
      )
      .eq('submitted_by', userId)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(50)
    var rows: any[] = (result.data as any[]) || []
    var typed: UserReport[] = rows.map(function (r) {
      return {
        id: r.id,
        category: r.category,
        phenomenon_type_id: r.phenomenon_type_id,
        latitude: r.latitude,
        longitude: r.longitude,
        state_province: r.state_province,
        country: r.country,
        event_date: r.event_date,
        witness_state_at_event: r.witness_state_at_event,
        tags: r.tags,
        paradocs_assessment: r.paradocs_assessment,
        description: r.description,
        summary: r.summary,
        title: r.title,
        created_at: r.created_at,
      }
    })
    return {
      user_id: userId,
      primary_report: typed.length > 0 ? typed[0] : null,
      all_reports: typed,
    }
  } catch (_e) {
    return { user_id: userId, primary_report: null, all_reports: [] }
  }
}

/* -------------------------------------------------------------------------- */
/* Pre-computed signals                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pre-compute one count per distinct `within_miles` radius the Hint
 * pool uses. The data_query executor would re-do these counts per
 * query, but for the eligibility pass we only need a single number
 * per radius to decide whether the Hint should be considered at all.
 */
async function precomputeNearbyCounts(
  ctx: UserContext,
  svc: SupabaseClient,
): Promise<Record<number, number>> {
  var out: Record<number, number> = {}
  var pr = ctx.primary_report
  if (!pr || typeof pr.latitude !== 'number' || typeof pr.longitude !== 'number') {
    return out
  }
  // Gather distinct radii referenced by trigger_conditions in SEED_HINTS.
  var radii: number[] = []
  for (var i = 0; i < SEED_HINTS.length; i++) {
    var w = SEED_HINTS[i].trigger_conditions.within_miles
    if (typeof w === 'number' && radii.indexOf(w) === -1) radii.push(w)
  }
  for (var r = 0; r < radii.length; r++) {
    var radius = radii[r]
    try {
      var latDelta = radius / 69
      var lngDelta = radius / (69 * Math.cos((pr.latitude * Math.PI) / 180) || 1)
      var res = await svc
        .from('reports')
        .select('id, latitude, longitude')
        .eq('status', 'approved')
        .neq('id', pr.id)
        .gte('latitude', pr.latitude - latDelta)
        .lte('latitude', pr.latitude + latDelta)
        .gte('longitude', pr.longitude - lngDelta)
        .lte('longitude', pr.longitude + lngDelta)
        .limit(2000)
      var rows: any[] = (res.data as any[]) || []
      var match = 0
      for (var x = 0; x < rows.length; x++) {
        var rr = rows[x]
        if (typeof rr.latitude !== 'number' || typeof rr.longitude !== 'number') continue
        if (haversineMi(pr.latitude, pr.longitude, rr.latitude, rr.longitude) <= radius) match++
      }
      out[radius] = match
    } catch (_e) {
      out[radius] = 0
    }
  }
  return out
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = ((lat2 - lat1) * Math.PI) / 180
  var dLng = ((lng2 - lng1) * Math.PI) / 180
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* -------------------------------------------------------------------------- */
/* Impressions dedupe                                                          */
/* -------------------------------------------------------------------------- */

async function loadRecentImpressions(
  userId: string,
  svc: SupabaseClient,
): Promise<Record<string, boolean>> {
  try {
    var since = new Date(
      Date.now() - IMPRESSION_DEDUPE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    var res = await svc
      .from('lab_hint_impressions')
      .select('hint_id')
      .eq('user_id', userId)
      .gte('shown_at', since)
      .limit(500)
    var rows: any[] = (res.data as any[]) || []
    var out: Record<string, boolean> = {}
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].hint_id) out[rows[i].hint_id] = true
    }
    return out
  } catch (_e) {
    return {}
  }
}

/**
 * V11.18.x — load the terminal resolutions for the user from
 * lab_hint_resolutions. ANY resolution (accept / save / dismiss)
 * hides the hint from the rail going forward. Best-effort: any read
 * failure returns the empty map so the rail degrades gracefully.
 */
async function loadResolvedHints(
  userId: string,
  svc: SupabaseClient,
): Promise<Record<string, boolean>> {
  try {
    var res = await svc
      .from('lab_hint_resolutions')
      .select('hint_id')
      .eq('user_id', userId)
      .limit(2000)
    var rows: any[] = (res.data as any[]) || []
    var out: Record<string, boolean> = {}
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].hint_id) out[rows[i].hint_id] = true
    }
    return out
  } catch (_e) {
    return {}
  }
}

/* -------------------------------------------------------------------------- */
/* Token binding                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Run every data_query for a Hint, check min_data_threshold, then
 * substitute the bound tokens into the title and body. Returns null
 * to indicate the Hint should be suppressed.
 */
async function bindHint(
  hint: Hint,
  ctx: UserContext,
  svc: SupabaseClient,
): Promise<RenderedHint | null> {
  var tokenMap: Partial<Record<HintToken, number | string>> = {}

  // Editorial Hints with no data_queries — just render the template.
  if (!hint.data_queries || hint.data_queries.length === 0) {
    // Auto-bind event_decade from user's report if the template
    // references it (some seasonal Hints lean on it).
    var udec = userDecade(ctx)
    if (udec !== null) tokenMap['event_decade' as HintToken] = udec
    return buildRendered(hint, tokenMap)
  }

  var bindings = await Promise.all(
    hint.data_queries.map(function (q) { return executeQuery(q, ctx, svc) }),
  )

  var smallestDenom = Infinity
  for (var i = 0; i < bindings.length; i++) {
    var b = bindings[i]
    if (b.value === null && (!b.bindings || Object.keys(b.bindings).length === 0)) {
      // Hard suppression — a required query returned null.
      return null
    }
    if (b.denominator < smallestDenom) smallestDenom = b.denominator
    if (b.token && b.value !== null) tokenMap[b.token] = b.value
    if (b.bindings) {
      var keys = Object.keys(b.bindings) as HintToken[]
      for (var k = 0; k < keys.length; k++) {
        var v = b.bindings[keys[k]]
        if (v !== undefined) tokenMap[keys[k]] = v
      }
    }
  }

  // min_data_threshold suppression.
  if (hint.min_data_threshold !== undefined && smallestDenom < hint.min_data_threshold) {
    return null
  }

  // Also bind user-decade if the template references it.
  if (tokenMap['event_decade' as HintToken] === undefined) {
    var udec2 = userDecade(ctx)
    if (udec2 !== null) tokenMap['event_decade' as HintToken] = udec2
  }

  return buildRendered(hint, tokenMap)
}

function userDecade(ctx: UserContext): number | null {
  var pr = ctx.primary_report
  if (!pr || !pr.event_date) return null
  var d = new Date(pr.event_date)
  if (isNaN(d.getTime())) return null
  var y = d.getUTCFullYear()
  if (y < 1700 || y > 2100) return null
  return Math.floor(y / 10) * 10
}

function buildRendered(
  hint: Hint,
  tokens: Partial<Record<HintToken, number | string>>,
): RenderedHint {
  return {
    id: hint.id,
    category: hint.category,
    hint_type: hint.hint_type,
    title: substituteTokens(hint.title_template, tokens),
    body: substituteTokens(hint.body_template, tokens),
    cta: hint.cta,
    tier_visibility: hint.tier_visibility,
    freshness_policy: hint.freshness_policy,
    cross_category: hint.cross_category,
    bound_tokens: tokens,
  }
}

/**
 * Mustache-style {{token}} substitution. Missing tokens render as
 * empty strings (defensive — never throw, never leak `{{tokens}}` to
 * the UI). A subsequent post-pass collapses any double-spaces left
 * behind by missing tokens.
 */
export function substituteTokens(
  template: string,
  tokens: Partial<Record<HintToken, number | string>>,
): string {
  var out = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (_, name) {
    var key = name as HintToken
    var v = tokens[key]
    return v === undefined || v === null ? '' : String(v)
  })
  return out.replace(/\s{2,}/g, ' ').trim()
}

/* -------------------------------------------------------------------------- */
/* Cadence                                                                     */
/* -------------------------------------------------------------------------- */

function applyCadence(hints: RenderedHint[], userId: string): RenderedHint[] {
  var perCategory: Record<string, number> = {}
  var namedMatchUsed = 0
  var rotated = rotateByUserHash(hints, userId)
  var out: RenderedHint[] = []
  for (var i = 0; i < rotated.length; i++) {
    var h = rotated[i]
    if (out.length >= MAX_HINTS_PER_SESSION) break

    var isNamedMatch =
      h.cta.target.kind === 'mutual_match_invite'
    if (isNamedMatch && namedMatchUsed >= MAX_NAMED_MATCH_PER_SESSION) continue

    var cat = h.category
    var seenInCat = perCategory[cat] || 0
    if (seenInCat >= MAX_PER_CATEGORY_PER_SESSION) continue

    perCategory[cat] = seenInCat + 1
    if (isNamedMatch) namedMatchUsed++
    out.push(h)
  }
  return out
}

/**
 * Deterministic rotation of the eligible Hint list by user ID hash so
 * the same user gets the same starting point on each visit, but
 * different users get different surfaces. Keeps the variety stable
 * over a session without needing extra state.
 */
function rotateByUserHash<T>(arr: T[], userId: string): T[] {
  if (arr.length <= 1) return arr.slice()
  var h = 0
  for (var i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0
  }
  var offset = h % arr.length
  return arr.slice(offset).concat(arr.slice(0, offset))
}

function rotateFallbackPool(pool: RenderedHint[], userId: string): RenderedHint[] {
  // Day-of-year wedge so the fallback pool rotates daily — keeps the
  // pool feeling fresh without writing per-day state.
  var dayOfYear = Math.floor((Date.now() / (1000 * 60 * 60 * 24)))
  var combined = (userId + ':' + dayOfYear)
  return rotateByUserHash(pool, combined)
}

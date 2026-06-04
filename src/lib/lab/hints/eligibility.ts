// V11.17.65 — Hint eligibility checker.
//
// Pure function that maps a Hint's trigger_conditions object to a
// boolean for a specific user-context. Cheap, deterministic, no DB
// hits except for the geographic-proximity pre-filter (a single
// count query) — which the renderer can opt into by passing a
// pre-computed proximity count via `extraSignals`.
//
// The schema contract (from hint-schema.ts):
//   - Empty trigger_conditions + fallback_eligible:true  → always eligible
//   - phen_family[]                                       → user's primary report category must overlap
//   - subfamily                                           → user's tags or assessment must mention it
//   - required_descriptors[]                              → user's report text matches at least min_match_signals
//   - event_month_range                                   → user's event_date month falls in window
//   - event_decade                                        → user's event_date decade matches
//   - within_miles + min_nearby_reports                   → pre-computed proximity count meets floor
//   - min_experience_count                                → user.all_reports.length >= N
//   - seasonal_window                                     → today's date in the Hint's window (per current year)
//   - tier_visibility                                     → user tier >= floor
//   - named_match_requirements                            → checked by cadence layer, not here

import type { Hint, HintTierVisibility, SeasonalWindow } from './hint-schema'
import type { UserContext, UserReport } from './data-query-executor'

var TIER_ORDER: Record<HintTierVisibility, number> = {
  free: 0,
  basic: 1,
  pro: 2,
}

/**
 * Extra context the renderer can pre-compute and hand to the eligibility
 * checker so it doesn't have to re-query (kept lean — only geographic
 * proximity, which the trigger_conditions can gate on).
 */
export interface EligibilitySignals {
  /** Count of approved reports within trigger's within_miles of the user. */
  nearby_count_within_miles?: number
}

/**
 * Top-level eligibility decision. Returns true iff the Hint qualifies
 * for the user according to its trigger_conditions, tier, and seasonal
 * window. The named_match_requirements check is deferred to the
 * renderer's cadence pass.
 */
export function isHintEligible(
  hint: Hint,
  ctx: UserContext,
  userTier: HintTierVisibility,
  signals: EligibilitySignals,
  now: Date,
): boolean {
  // Tier gate first — cheapest and short-circuits.
  if (TIER_ORDER[userTier] < TIER_ORDER[hint.tier_visibility]) return false

  // Seasonal window gate.
  if (hint.seasonal_window && !isWithinSeasonalWindow(hint.seasonal_window, now)) {
    return false
  }

  var tc = hint.trigger_conditions || {}
  var primary = ctx.primary_report

  // min_experience_count gate (default 1).
  var minXp = tc.min_experience_count === undefined ? 1 : tc.min_experience_count
  if ((ctx.all_reports || []).length < minXp) return false

  // Fallback-eligible Hints with no other constraints sail past.
  // (We still respected tier/season above.)
  var hasAnyTrigger =
    !!(tc.phen_family && tc.phen_family.length) ||
    !!tc.subfamily ||
    !!(tc.required_descriptors && tc.required_descriptors.length) ||
    !!tc.event_month_range ||
    !!tc.event_decade ||
    !!tc.within_miles
  if (!hasAnyTrigger && tc.fallback_eligible) return true

  // Need a primary report to evaluate user-anchored triggers.
  if (!primary) return !!tc.fallback_eligible

  // phen_family overlap.
  if (tc.phen_family && tc.phen_family.length > 0) {
    var cat = (primary.category || '').toString()
    if (cat && tc.phen_family.indexOf(cat as any) === -1) return false
  }

  // subfamily — check tags + assessment.
  if (tc.subfamily) {
    var subTokens = collectSubfamilyTokens(primary)
    if (subTokens.indexOf(tc.subfamily.toLowerCase()) === -1) {
      // Loose secondary check: substring against title/summary.
      var hay = ((primary.title || '') + ' ' + (primary.summary || '')).toLowerCase()
      if (hay.indexOf(tc.subfamily.toLowerCase()) === -1) return false
    }
  }

  // required_descriptors — count matches, compare to min_match_signals.
  if (tc.required_descriptors && tc.required_descriptors.length > 0) {
    var need = tc.min_match_signals === undefined ? 1 : tc.min_match_signals
    var hay2 =
      ((primary.title || '') + ' ' +
        (primary.summary || '') + ' ' +
        (primary.description || '')).toLowerCase()
    var hits = 0
    for (var i = 0; i < tc.required_descriptors.length; i++) {
      var d = tc.required_descriptors[i].toLowerCase()
      if (hay2.indexOf(d) !== -1) hits++
    }
    // Also count tags hits.
    var tagSet = (primary.tags || []).map(function (t) { return String(t).toLowerCase() })
    for (var j = 0; j < tc.required_descriptors.length; j++) {
      var dd = tc.required_descriptors[j].toLowerCase()
      for (var k = 0; k < tagSet.length; k++) {
        if (tagSet[k].indexOf(dd) !== -1) { hits++; break }
      }
    }
    if (hits < need) return false
  }

  // event_month_range.
  if (tc.event_month_range && primary.event_date) {
    var evDate = new Date(primary.event_date)
    if (!isNaN(evDate.getTime())) {
      var m = evDate.getUTCMonth() + 1
      var s = tc.event_month_range.start_month
      var e = tc.event_month_range.end_month
      var ok = s <= e ? m >= s && m <= e : m >= s || m <= e
      if (!ok) return false
    }
  }

  // event_decade.
  if (tc.event_decade !== undefined && primary.event_date) {
    var dd2 = new Date(primary.event_date)
    if (!isNaN(dd2.getTime())) {
      var dec = Math.floor(dd2.getUTCFullYear() / 10) * 10
      if (dec !== tc.event_decade) return false
    }
  }

  // Geographic proximity — use pre-computed signal if present.
  if (tc.within_miles && tc.min_nearby_reports !== undefined) {
    var near = signals.nearby_count_within_miles
    if (near === undefined) {
      // The renderer didn't pre-compute it — be conservative and
      // suppress rather than fire spurious nearby Hints.
      return false
    }
    if (near < tc.min_nearby_reports) return false
  }

  return true
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function collectSubfamilyTokens(r: UserReport): string[] {
  var out: string[] = []
  try {
    if (Array.isArray(r.tags)) {
      for (var i = 0; i < r.tags.length; i++) {
        if (r.tags[i]) out.push(String(r.tags[i]).toLowerCase())
      }
    }
    var a = r.paradocs_assessment
    if (a && typeof a === 'object') {
      if (a.subpattern) out.push(String(a.subpattern).toLowerCase())
      if (Array.isArray(a.subpatterns)) {
        for (var k = 0; k < a.subpatterns.length; k++) {
          out.push(String(a.subpatterns[k]).toLowerCase())
        }
      }
    }
  } catch (_e) { /* defensive */ }
  return out
}

/**
 * True if the supplied date falls inside the Hint's seasonal_window
 * (wraps year boundaries — Nov 20 → Feb 14 is supported).
 */
export function isWithinSeasonalWindow(window: SeasonalWindow, now: Date): boolean {
  var m = now.getUTCMonth() + 1
  var d = now.getUTCDate()
  var here = m * 100 + d
  var lo = window.start_month * 100 + (window.start_day || 1)
  var hi = window.end_month * 100 + (window.end_day || 31)
  if (lo <= hi) return here >= lo && here <= hi
  return here >= lo || here <= hi
}

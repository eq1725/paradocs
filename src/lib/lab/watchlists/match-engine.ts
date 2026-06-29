// V11.17.72 — Custom Watchlists match engine.
//
// Given a Watchlist (criteria + threshold) and a candidate report,
// computes a match confidence in [0, 1] and decides whether the
// report qualifies as a match.
//
// Scoring (MVP — tunable later):
//   - Start at 1.0.
//   - HARD criteria — phen_family, state_or_country, event year range,
//     witness_count_min, has_photo_video, time-of-day window — multiply
//     by 0.0 on a fail (immediate disqualification), 1.0 on a pass.
//   - SOFT criteria — descriptor partial overlap, subfamily token
//     match — multiply by 0.5 on a partial-match-fail, 1.0 on a pass.
//   - Geo proximity uses a smooth decay: 1.0 inside 50% of radius,
//     decays linearly to 0.7 at the radius edge, 0.0 beyond. This is
//     intentionally generous inside the radius so a watchlist that
//     asks for "within 100mi" doesn't get pessimistic confidence
//     just because a report is at 90mi.
//
// The final confidence is the product of all per-criterion factors.
// Reports below watchlist.match_confidence_threshold are NOT matches.
//
// V1 scoring is intentionally simple — every numerical weight here is
// a comment-marked tuning knob. Founder + Smoke results will tell us
// where to push (precision-favouring → tighten soft penalties; recall-
// favouring → relax hard fails to soft fails).

import type { WatchlistCriteria } from './criteria-schema'
import type { SupabaseClient } from '@supabase/supabase-js'

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export interface CandidateReport {
  id: string
  category: string | null
  latitude: number | null
  longitude: number | null
  state_province: string | null
  country: string | null
  event_date: string | null
  event_time: string | null
  tags: string[] | null
  paradocs_assessment: any
  title: string | null
  summary: string | null
  description: string | null
  status: string | null
  ingested_at: string | null
  approved_at?: string | null
  created_at?: string | null
}

export interface ScoreResult {
  /** Final confidence in [0, 1]. */
  confidence: number
  /** Per-criterion breakdown, useful for smoke debugging. */
  breakdown: Record<string, number>
  /** True if confidence >= threshold AND all hard criteria passed. */
  match: boolean
  /** When `match === false`, why. */
  reason?: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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

function geoDecay(distMi: number, radiusMi: number): number {
  // 1.0 inside half-radius; linearly decays to 0.7 at the edge; 0.0
  // beyond. Tuneable; current values trade some recall (the 0.7 floor
  // at the boundary keeps boundary-hugging matches alive even if
  // multiple soft criteria stack on top of geo).
  if (distMi < 0 || radiusMi <= 0) return 0
  if (distMi > radiusMi) return 0
  var halfR = radiusMi * 0.5
  if (distMi <= halfR) return 1
  var frac = (distMi - halfR) / (radiusMi - halfR)
  return 1 - frac * 0.3
}

function tokensForReport(r: CandidateReport): string[] {
  var out: string[] = []
  if (Array.isArray(r.tags)) {
    r.tags.forEach(function (t) { if (t) out.push(String(t).toLowerCase()) })
  }
  var assess = r.paradocs_assessment
  if (assess && typeof assess === 'object') {
    var descs = assess.descriptors
    if (Array.isArray(descs)) {
      descs.forEach(function (d: any) { if (d) out.push(String(d).toLowerCase()) })
    }
  }
  // Belt-and-braces text scan — same approach the Hint executor uses.
  var text = ((r.title || '') + ' ' + (r.summary || '') + ' ' + (r.description || '')).toLowerCase()
  if (text.trim().length > 0) out.push('__text__:' + text)
  return out
}

/**
 * Keyword vocabulary per descriptor family — mirrored from the Hint
 * executor (DESCRIPTOR_KEYWORDS). Keeping it inlined here rather than
 * importing the private map keeps the Hint changes from rippling into
 * Watchlist scoring unintentionally. Lockstep updates are a deliberate
 * choice per touch.
 */
var DESCRIPTOR_KEYWORDS: Record<string, string[]> = {
  static_electricity: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
  low_hum: ['low hum', 'throbbing', 'vibration', 'drone'],
  whoop_vocalization: ['whoop', 'howl', 'call', 'vocalization'],
  shadow_figure: ['shadow', 'figure', 'presence', 'standing'],
  tunnel_imagery: ['tunnel', 'corridor', 'passage'],
  being_of_light: ['light', 'luminous', 'radiant'],
  time_distortion: ['time slowed', 'time stopped', 'missing time'],
  metallic_taste: ['metal taste', 'copper tongue', 'metallic'],
  odor_sulphur: ['sulphur', 'sulfur', 'rotten eggs', 'burning smell'],
  paralysis_onset: ["can't move", 'frozen', 'locked', 'paralyzed'],
  observed_from_above: ['looking down', 'above body', 'ceiling view', 'from above'],
  electromagnetic_disturbance: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
  animal_reaction: ['dog barking', 'horse spooked', 'cat hiding', 'animal'],
  three_note_pattern: ['three-tone', 'triadic', 'groups-of-three'],
  craft_shape_triangle: ['triangle', 'v-formation', 'boomerang'],
  craft_shape_disc: ['disc', 'saucer', 'plate'],
  craft_shape_orb: ['orb', 'sphere', 'ball-of-light'],
  witness_drowsy: ['hypnagogic', 'half-asleep', 'falling-asleep', 'drowsy'],
  witness_paired_or_more: ['shared event', 'family-witnessed', 'two of us', 'we both', 'my wife', 'my husband', 'my friend', 'we all'],
  apparition_residential: ['home', 'house', 'bedroom'],
  recurring_location: ['happens again', 'same place', 'same room'],
}

function tokensContainDescriptor(tokens: string[], family: string): boolean {
  var keywords = DESCRIPTOR_KEYWORDS[family] || []
  for (var i = 0; i < tokens.length; i++) {
    for (var j = 0; j < keywords.length; j++) {
      if (tokens[i].indexOf(keywords[j].toLowerCase()) !== -1) return true
    }
  }
  return false
}

function resolveYear(r: CandidateReport): number | null {
  if (!r.event_date) return null
  var d = new Date(r.event_date)
  if (isNaN(d.getTime())) return null
  var y = d.getUTCFullYear()
  if (y < 1700 || y > 2100) return null
  return y
}

function resolveHour(r: CandidateReport): number | null {
  if (r.event_time && /^\d{1,2}:\d{2}/.test(r.event_time)) {
    return parseInt(r.event_time.split(':')[0], 10)
  }
  // event_date with time component → hour.
  if (r.event_date && r.event_date.length > 10) {
    var d = new Date(r.event_date)
    if (!isNaN(d.getTime())) return d.getUTCHours()
  }
  return null
}

function inHourWindow(hour: number, start: number, end: number): boolean {
  if (start <= end) return hour >= start && hour <= end
  // wrap-around (e.g., 22 → 4)
  return hour >= start || hour <= end
}

function reportHasMedia(r: CandidateReport): boolean {
  // We don't have a reliable `media_count` column populated everywhere;
  // we use tag heuristics + an assessment flag if present. Conservative.
  if (Array.isArray(r.tags)) {
    for (var i = 0; i < r.tags.length; i++) {
      var t = String(r.tags[i]).toLowerCase()
      if (t === 'has_photo' || t === 'has_video' || t === 'has_media'
          || t === 'photo' || t === 'video') return true
    }
  }
  var assess = r.paradocs_assessment
  if (assess && typeof assess === 'object') {
    if (assess.has_media === true || assess.has_photo === true || assess.has_video === true) return true
    if (typeof assess.media_count === 'number' && assess.media_count > 0) return true
  }
  return false
}

function reportWitnessCountAtLeast(r: CandidateReport, minN: number): boolean {
  // Prefer assessment.witness_count when extracted; fall back to the
  // 'witness_paired_or_more' descriptor for the "≥2" common case.
  var assess = r.paradocs_assessment
  if (assess && typeof assess === 'object' && typeof assess.witness_count === 'number') {
    return assess.witness_count >= minN
  }
  if (minN <= 2) {
    var tokens = tokensForReport(r)
    return tokensContainDescriptor(tokens, 'witness_paired_or_more')
  }
  return false
}

/* -------------------------------------------------------------------------- */
/* The scorer                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Score one candidate report against one watchlist's criteria. Pure
 * function — no DB. The candidate-fetching loop in the cron handler
 * pre-filters the cheap criteria via SQL where possible (phen_family,
 * date range, country/state) before calling here, but the scorer is
 * defensive and re-checks every criterion.
 */
export function scoreReport(
  criteria: WatchlistCriteria,
  report: CandidateReport,
  threshold: number,
): ScoreResult {
  var breakdown: Record<string, number> = {}
  var confidence = 1.0

  // ── HARD: phen_family ───────────────────────────────────────────────
  if (criteria.phen_family && criteria.phen_family.length > 0) {
    var fOk = !!(report.category && criteria.phen_family.indexOf(report.category as any) >= 0)
    breakdown.phen_family = fOk ? 1 : 0
    if (!fOk) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'phen_family_mismatch' }
    }
  }

  // ── HARD: state_or_country ─────────────────────────────────────────
  // Schema reality (probed 2026-06-04): reports.state_province stores
  // FULL NAMES ("Texas", "California", "Queensland") not 2-letter codes;
  // reports.country also stores long form ("United States", "Australia").
  // We translate ISO codes via stateAlias() / ctryAlias() so users can
  // write "US-TX" and we match it against "Texas" + "United States".
  if (criteria.state_or_country) {
    var sc = criteria.state_or_country
    var ok = false
    var m = sc.match(/^([A-Z]{2})-([A-Z0-9]{2,3})$/)
    if (m) {
      var ctry = m[1]
      var st = m[2]
      var stFull = stateAlias(ctry, st)
      var ctryFull = ctryAlias(ctry)
      ok = (report.country === ctry || report.country === ctryFull)
        && (report.state_province === st || (stFull !== null && report.state_province === stFull))
    } else if (/^[A-Z]{2}$/.test(sc)) {
      // Plain country code.
      ok = report.country === sc || report.country === ctryAlias(sc)
    } else {
      // Free-text — try both fields with a case-insensitive equality.
      var lc = sc.toLowerCase()
      ok = (typeof report.country === 'string' && report.country.toLowerCase() === lc)
        || (typeof report.state_province === 'string' && report.state_province.toLowerCase() === lc)
    }
    breakdown.state_or_country = ok ? 1 : 0
    if (!ok) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'state_or_country_mismatch' }
    }
  }

  // ── HARD: event year range ──────────────────────────────────────────
  if (criteria.event_year_from !== undefined || criteria.event_year_to !== undefined) {
    var year = resolveYear(report)
    var yOk = true
    if (year === null) yOk = false
    else {
      if (criteria.event_year_from !== undefined && year < criteria.event_year_from) yOk = false
      if (criteria.event_year_to !== undefined && year > criteria.event_year_to) yOk = false
    }
    breakdown.event_year = yOk ? 1 : 0
    if (!yOk) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'event_year_out_of_range' }
    }
  }

  // ── HARD: time-of-day window ────────────────────────────────────────
  if (criteria.time_of_day_window) {
    var hour = resolveHour(report)
    var hOk = hour !== null && inHourWindow(hour, criteria.time_of_day_window.start_hour, criteria.time_of_day_window.end_hour)
    breakdown.time_of_day = hOk ? 1 : 0
    if (!hOk) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'time_of_day_mismatch' }
    }
  }

  // ── HARD: witness count ─────────────────────────────────────────────
  if (criteria.witness_count_min && criteria.witness_count_min > 1) {
    var wOk = reportWitnessCountAtLeast(report, criteria.witness_count_min)
    breakdown.witness_count = wOk ? 1 : 0
    if (!wOk) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'witness_count_below_min' }
    }
  }

  // ── HARD: has_photo_video ───────────────────────────────────────────
  if (criteria.has_photo_video) {
    var mOk = reportHasMedia(report)
    breakdown.has_photo_video = mOk ? 1 : 0
    if (!mOk) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'no_media' }
    }
  }

  // ── GEO: smooth decay ───────────────────────────────────────────────
  if (criteria.geo) {
    if (typeof report.latitude !== 'number' || typeof report.longitude !== 'number') {
      // No location on the report → hard fail when geo is requested.
      breakdown.geo = 0
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'no_location_on_report' }
    }
    var dist = haversineMi(criteria.geo.lat, criteria.geo.lng, report.latitude, report.longitude)
    var gFactor = geoDecay(dist, criteria.geo.radius_miles)
    breakdown.geo = gFactor
    if (gFactor === 0) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'outside_radius' }
    }
    confidence *= gFactor
  }

  // Compute tokens once for the soft-match checks below.
  var reportTokens: string[] | null = null
  function tokens(): string[] {
    if (reportTokens === null) reportTokens = tokensForReport(report)
    return reportTokens
  }

  // ── SOFT: subfamily (substring against tokens + text) ───────────────
  if (criteria.subfamily) {
    var sub = criteria.subfamily.toLowerCase()
    var subOk = false
    var toks = tokens()
    for (var ti = 0; ti < toks.length; ti++) {
      if (toks[ti].indexOf(sub) !== -1) { subOk = true; break }
    }
    breakdown.subfamily = subOk ? 1 : 0.5
    if (!subOk) confidence *= 0.5
  }

  // ── SOFT-ISH: descriptors_any (any-of match) ────────────────────────
  // A complete miss on ANY of the requested descriptors is treated as
  // a hard fail (factor 0.0) because the user explicitly asked for
  // descriptor signal — surfacing reports that share no descriptor
  // produces obvious false positives at the threshold floor. A future
  // refinement could weight by descriptor-family rarity.
  if (criteria.descriptors_any && criteria.descriptors_any.length > 0) {
    var anyHit = false
    var toks2 = tokens()
    for (var di = 0; di < criteria.descriptors_any.length; di++) {
      if (tokensContainDescriptor(toks2, criteria.descriptors_any[di])) { anyHit = true; break }
    }
    breakdown.descriptors_any = anyHit ? 1 : 0
    if (!anyHit) {
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'descriptors_any_no_match' }
    }
  }

  // ── HARD-ISH: descriptors_all (every-of match) ──────────────────────
  // The user requested every named descriptor; if 0 of N hit we hard-
  // fail. If at least one hits but not all, we apply a partial penalty
  // — this lets the soft scoring still produce a match when the user's
  // threshold is permissive (e.g., 0.5) and the criteria are broad.
  if (criteria.descriptors_all && criteria.descriptors_all.length > 0) {
    var allHit = true
    var hits = 0
    var toks3 = tokens()
    for (var dj = 0; dj < criteria.descriptors_all.length; dj++) {
      if (tokensContainDescriptor(toks3, criteria.descriptors_all[dj])) hits++
      else allHit = false
    }
    if (hits === 0) {
      breakdown.descriptors_all = 0
      return { confidence: 0, breakdown: breakdown, match: false, reason: 'descriptors_all_no_match' }
    }
    if (allHit) {
      breakdown.descriptors_all = 1
    } else {
      // Partial credit proportional to hit rate, capped at 0.5.
      var frac = hits / criteria.descriptors_all.length
      var partial = Math.min(0.5, 0.2 + 0.6 * frac)
      breakdown.descriptors_all = partial
      confidence *= partial
    }
  }

  var match = confidence >= threshold
  return {
    confidence: confidence,
    breakdown: breakdown,
    match: match,
    reason: match ? undefined : 'below_threshold',
  }
}

function ctryAlias(code: string): string {
  // Archive reality (probed 2026-06-04): country is stored as the FULL
  // long form in most rows ("United States", "United Kingdom"). Cheap
  // alias keeps the user-facing ISO-code experience working.
  if (code === 'US') return 'United States'
  if (code === 'UK' || code === 'GB') return 'United Kingdom'
  if (code === 'CA') return 'Canada'
  if (code === 'AU') return 'Australia'
  if (code === 'NZ') return 'New Zealand'
  if (code === 'IE') return 'Ireland'
  if (code === 'BR') return 'Brazil'
  if (code === 'MX') return 'Mexico'
  return code
}

// V11.17.72 — Map US state abbreviations to full names so a watchlist
// criterion `state_or_country: 'US-TX'` matches rows whose
// state_province is stored as `'Texas'`. Only the US 50 + DC are
// covered here; for other countries we currently fall through (rare
// in the Archive). Add a per-country lookup if/when it becomes
// load-bearing.
var US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
}

function stateAlias(country: string, stateCode: string): string | null {
  if (country === 'US') return US_STATE_NAMES[stateCode] || null
  return null
}

/* -------------------------------------------------------------------------- */
/* Candidate-fetching: run the SQL pre-filter that derives a small               */
/* candidate set per watchlist, then score each candidate in-process.            */
/* -------------------------------------------------------------------------- */

export interface EvaluateOpts {
  /** Lower bound on report.ingested_at (or fallback approved_at/created_at).
   *  Null = evaluate everything ever approved, which is fine for first runs
   *  but expensive afterwards. The cron uses watchlist.last_evaluated_at. */
  since: string | null
  /** Hard cap on candidates pulled per watchlist per run. Keeps the cron
   *  under the 300s budget; matches that miss the cap surface on the next
   *  run because we update last_evaluated_at AFTER the loop. */
  maxCandidates?: number
}

/**
 * Pull a candidate report set from the DB and score each against the
 * watchlist. Returns the matches that crossed the threshold.
 *
 * SQL pre-filter strategy (cheap, additive AND-clauses):
 *   - status = 'approved'
 *   - ingested_at > since (when set)
 *   - category in (criteria.phen_family) — when set
 *   - state_province / country — when state_or_country set
 *   - event_date year range — when set (uses event_date >= / <)
 *   - geo bounding box — when set (lat/lng deltas), then exact haversine
 *     inside the scorer
 */
export async function evaluateWatchlistAgainstReports(
  svc: SupabaseClient,
  watchlistId: string,
  criteria: WatchlistCriteria,
  threshold: number,
  opts: EvaluateOpts,
): Promise<Array<{ report_id: string; confidence: number; breakdown: Record<string, number> }>> {
  var maxCandidates = opts.maxCandidates || 2000

  // Build the SQL pre-filter. We deliberately keep this as cheap as
  // possible — the scorer is the source of truth, the SQL just narrows
  // the candidate set.
  var q = svc
    .from('reports')
    .select('id, category, latitude, longitude, state_province, country, event_date, event_time, tags, paradocs_assessment, title, summary, description, status, ingested_at')
    .eq('status', 'approved')
    .order('ingested_at', { ascending: false })
    .limit(maxCandidates)

  if (opts.since) q = q.gte('ingested_at', opts.since)

  if (criteria.phen_family && criteria.phen_family.length > 0) {
    q = q.in('category', criteria.phen_family as any)
  }

  if (criteria.state_or_country) {
    var sc = criteria.state_or_country
    var m = sc.match(/^([A-Z]{2})-([A-Z0-9]{2,3})$/)
    if (m) {
      // Translate ISO code → DB representation; the schema stores full
      // names ("United States", "Texas") with high prevalence.
      var ctryFull = ctryAlias(m[1])
      var stFull = stateAlias(m[1], m[2])
      // Prefer the full names for the SQL hit set — the post-score
      // accepts both forms anyway, so we err on the side of recall.
      q = q.in('country', [m[1], ctryFull]).in('state_province', stFull ? [m[2], stFull] : [m[2]])
    } else if (/^[A-Z]{2}$/.test(sc)) {
      q = q.in('country', [sc, ctryAlias(sc)])
    }
  }

  if (criteria.event_year_from !== undefined) {
    q = q.gte('event_date', criteria.event_year_from + '-01-01')
  }
  if (criteria.event_year_to !== undefined) {
    q = q.lt('event_date', (criteria.event_year_to + 1) + '-01-01')
  }

  if (criteria.geo) {
    var latDelta = criteria.geo.radius_miles / 69
    var lngDelta = criteria.geo.radius_miles / (69 * Math.cos((criteria.geo.lat * Math.PI) / 180) || 1)
    q = q
      .gte('latitude', criteria.geo.lat - latDelta)
      .lte('latitude', criteria.geo.lat + latDelta)
      .gte('longitude', criteria.geo.lng - lngDelta)
      .lte('longitude', criteria.geo.lng + lngDelta)
  }

  var resp = await q
  var rows: CandidateReport[] = ((resp && resp.data) || []) as any

  var hits: Array<{ report_id: string; confidence: number; breakdown: Record<string, number> }> = []
  for (var i = 0; i < rows.length; i++) {
    var scored = scoreReport(criteria, rows[i], threshold)
    if (scored.match) {
      hits.push({ report_id: rows[i].id, confidence: scored.confidence, breakdown: scored.breakdown })
    }
  }

  // Suppress the unused-warning lint for the watchlistId param — keeping
  // it in the signature so callers can log/instrument per watchlist.
  void watchlistId

  return hits
}

// V11.17.73 — Named-Match 8-signal fingerprint scorer.
//
// Given two reports (the "asking" one and a candidate Archive one),
// computes an 8-dimensional fingerprint overlap and rolls it up into
// a single confidence score in [0, 1].
//
// The 8 signals, per the panel spec (LAB_PANEL_REVIEW_V3 §4 + §6 +
// the Tier 3C build brief):
//
//   1. phen_family (exact match)                — heaviest weight
//   2. subfamily / sub-pattern (exact match)     — second-heaviest
//   3. descriptor overlap (Jaccard %)            — controlled vocab
//   4. time-of-day window (±2 hour bucket)
//   5. geographic proximity (Haversine, smooth)  — 1.0 ≤25mi → 0.5 @100 → 0 @500
//   6. decade match (exact decade of event_date)
//   7. multi-witness flag (both have witness_count >= 2)
//   8. media flag (both have has_photo_video)
//
// Weights settled on (sum to 1.0 so confidence is a true [0,1]):
//
//     phen_family       0.30
//     subfamily         0.25
//     descriptors       0.15
//     geo               0.13
//     decade            0.07
//     time_of_day       0.05
//     multi_witness     0.025
//     media             0.025
//
// Hard floor (per the brief):
//   - phen_family AND subfamily must BOTH match for confidence ≥ 0.6.
//     Otherwise we clamp confidence to min(raw, 0.59).
//
// Bands:
//   - confidence ≥ 0.85 → strong match, eligible for named-match offer.
//   - 0.70 ≤ confidence < 0.85 → aggregate-only (Hints surface).
//   - confidence < 0.70 → noise floor.
//
// signal_overlap_count is the integer count of the 8 signals that
// scored ≥0.5 — surfaced in the anonymous offer card ("shares X of 8
// signals with your account").
//
// Pure function. No DB. Defensive on every field.

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export interface FingerprintReport {
  id: string
  category: string | null
  /** Sub-pattern slug — derived from paradocs_assessment.subfamily or
   *  the user's phenomenon_type if present. May be null. */
  subfamily: string | null
  latitude: number | null
  longitude: number | null
  event_date: string | null
  event_time: string | null
  tags: string[] | null
  paradocs_assessment: any
  description: string | null
  summary: string | null
  title: string | null
}

export interface FingerprintScore {
  confidence: number
  signal_overlap_count: number
  breakdown: {
    phen_family: number
    subfamily: number
    descriptors: number
    geo: number
    decade: number
    time_of_day: number
    multi_witness: number
    media: number
  }
  band: 'strong' | 'aggregate' | 'noise'
}

/* -------------------------------------------------------------------------- */
/* Weights — sum to 1.0                                                        */
/* -------------------------------------------------------------------------- */

export var SIGNAL_WEIGHTS = {
  phen_family: 0.30,
  subfamily: 0.25,
  descriptors: 0.15,
  geo: 0.13,
  decade: 0.07,
  time_of_day: 0.05,
  multi_witness: 0.025,
  media: 0.025,
}

export var CONFIDENCE_STRONG = 0.85
export var CONFIDENCE_AGGREGATE = 0.70
export var SIGNAL_HIT_THRESHOLD = 0.5  // a signal "counts" toward overlap when ≥ this

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

/** Smooth geo decay per the brief:
 *    1.0 inside 25mi, 0.5 at 100mi, 0 at 500mi.
 *  Piecewise linear so the math is legible end-to-end:
 *    0..25  → 1.0
 *    25..100 → linear 1.0 → 0.5
 *    100..500 → linear 0.5 → 0.0
 *    500+   → 0
 */
function geoDecay(distMi: number): number {
  if (distMi < 0) return 0
  if (distMi <= 25) return 1
  if (distMi <= 100) {
    var t = (distMi - 25) / 75
    return 1 - 0.5 * t
  }
  if (distMi <= 500) {
    var t2 = (distMi - 100) / 400
    return 0.5 - 0.5 * t2
  }
  return 0
}

function resolveYear(r: FingerprintReport): number | null {
  if (!r.event_date) return null
  var d = new Date(r.event_date)
  if (isNaN(d.getTime())) return null
  var y = d.getUTCFullYear()
  if (y < 1700 || y > 2100) return null
  return y
}

function resolveDecade(r: FingerprintReport): number | null {
  var y = resolveYear(r)
  if (y === null) return null
  return Math.floor(y / 10) * 10
}

function resolveHour(r: FingerprintReport): number | null {
  if (r.event_time && /^\d{1,2}:\d{2}/.test(r.event_time)) {
    var h = parseInt(r.event_time.split(':')[0], 10)
    if (!isNaN(h) && h >= 0 && h <= 23) return h
  }
  if (r.event_date && r.event_date.length > 10) {
    var d = new Date(r.event_date)
    if (!isNaN(d.getTime())) return d.getUTCHours()
  }
  return null
}

/**
 * Build a controlled-vocabulary descriptor set for a report. Mirrors
 * the Hints DESCRIPTOR_KEYWORDS map so descriptor overlap stays
 * lockstep with what the Hints rail tells the user.
 */
var DESCRIPTOR_KEYWORDS: Record<string, string[]> = {
  static_electricity: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
  low_hum: ['low hum', 'throbbing', 'vibration', 'drone'],
  whoop_vocalization: ['whoop', 'howl', 'call', 'vocalization'],
  shadow_figure: ['shadow', 'figure', 'presence', 'standing'],
  tunnel_imagery: ['tunnel', 'corridor', 'passage'],
  being_of_light: ['being of light', 'luminous figure', 'radiant figure'],
  time_distortion: ['time slowed', 'time stopped', 'missing time'],
  metallic_taste: ['metal taste', 'copper tongue', 'metallic taste'],
  odor_sulphur: ['sulphur', 'sulfur', 'rotten eggs', 'burning smell'],
  paralysis_onset: ["can't move", 'frozen', 'locked', 'paralyzed'],
  observed_from_above: ['looking down', 'above body', 'ceiling view', 'from above'],
  electromagnetic_disturbance: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
  animal_reaction: ['dog barking', 'horse spooked', 'cat hiding', 'animal reaction'],
  three_note_pattern: ['three-tone', 'triadic', 'groups-of-three'],
  craft_shape_triangle: ['triangle', 'v-formation', 'boomerang'],
  craft_shape_disc: ['disc', 'saucer', 'plate'],
  craft_shape_orb: ['orb', 'sphere', 'ball-of-light'],
  witness_drowsy: ['hypnagogic', 'half-asleep', 'falling-asleep', 'drowsy'],
  witness_paired_or_more: ['shared event', 'family-witnessed', 'two of us', 'we both', 'my wife', 'my husband', 'my friend', 'we all'],
  apparition_residential: ['home', 'house', 'bedroom'],
  recurring_location: ['happens again', 'same place', 'same room'],
}

function descriptorSet(r: FingerprintReport): Set<string> {
  var out = new Set<string>()
  var text = ((r.title || '') + ' ' + (r.summary || '') + ' ' + (r.description || '')).toLowerCase()
  if (Array.isArray(r.tags)) {
    r.tags.forEach(function (t) { if (t) text += ' ' + String(t).toLowerCase() })
  }
  var assess = r.paradocs_assessment
  if (assess && typeof assess === 'object') {
    if (Array.isArray(assess.descriptors)) {
      assess.descriptors.forEach(function (d: any) { if (d) text += ' ' + String(d).toLowerCase() })
    }
  }
  var keys = Object.keys(DESCRIPTOR_KEYWORDS)
  for (var i = 0; i < keys.length; i++) {
    var family = keys[i]
    var kws = DESCRIPTOR_KEYWORDS[family]
    for (var j = 0; j < kws.length; j++) {
      if (text.indexOf(kws[j].toLowerCase()) !== -1) {
        out.add(family)
        break
      }
    }
  }
  return out
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  var intersection = 0
  a.forEach(function (x) { if (b.has(x)) intersection++ })
  var union = a.size + b.size - intersection
  if (union <= 0) return 0
  return intersection / union
}

function reportWitnessCountAtLeast2(r: FingerprintReport): boolean {
  var assess = r.paradocs_assessment
  if (assess && typeof assess === 'object' && typeof assess.witness_count === 'number') {
    return assess.witness_count >= 2
  }
  var descSet = descriptorSet(r)
  return descSet.has('witness_paired_or_more')
}

function reportHasMedia(r: FingerprintReport): boolean {
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

function resolveSubfamily(r: FingerprintReport): string | null {
  // Priority: explicit subfamily field on the input → assessment.subfamily
  // → assessment.sub_pattern → first descriptor that's a shape family
  // (craft_shape_*), which is the de-facto subfamily inside ufos_aliens.
  if (r.subfamily) return r.subfamily.toLowerCase()
  var assess = r.paradocs_assessment
  if (assess && typeof assess === 'object') {
    var sub = assess.subfamily || assess.sub_pattern || assess.sub_family || null
    if (typeof sub === 'string' && sub.length > 0) return sub.toLowerCase()
  }
  var descs = descriptorSet(r)
  var shapeFamilies = ['craft_shape_triangle', 'craft_shape_disc', 'craft_shape_orb']
  for (var i = 0; i < shapeFamilies.length; i++) {
    if (descs.has(shapeFamilies[i])) return shapeFamilies[i]
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Scorer                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Score one candidate report against the asking user's report. Both
 * reports are treated symmetrically; the function does not "favor" the
 * asking side.
 */
export function scoreFingerprintPair(a: FingerprintReport, b: FingerprintReport): FingerprintScore {
  var breakdown = {
    phen_family: 0,
    subfamily: 0,
    descriptors: 0,
    geo: 0,
    decade: 0,
    time_of_day: 0,
    multi_witness: 0,
    media: 0,
  }

  // 1. phen_family — exact match
  var famMatch = !!(a.category && b.category && a.category === b.category)
  breakdown.phen_family = famMatch ? 1 : 0

  // 2. subfamily — exact match (after best-effort derivation)
  var subA = resolveSubfamily(a)
  var subB = resolveSubfamily(b)
  var subMatch = !!(subA && subB && subA === subB)
  breakdown.subfamily = subMatch ? 1 : 0

  // 3. descriptor overlap — Jaccard on the controlled vocab
  var dA = descriptorSet(a)
  var dB = descriptorSet(b)
  breakdown.descriptors = jaccardOverlap(dA, dB)

  // 4. time-of-day window — ±2 hour bucket match
  var hA = resolveHour(a)
  var hB = resolveHour(b)
  if (hA !== null && hB !== null) {
    var diff = Math.abs(hA - hB)
    if (diff > 12) diff = 24 - diff   // wrap around midnight
    if (diff <= 2) {
      // 1.0 within 1h, 0.5 within 2h, else handled above
      breakdown.time_of_day = diff <= 1 ? 1 : 0.5
    }
  }

  // 5. geographic proximity
  if (typeof a.latitude === 'number' && typeof a.longitude === 'number'
      && typeof b.latitude === 'number' && typeof b.longitude === 'number') {
    var dist = haversineMi(a.latitude, a.longitude, b.latitude, b.longitude)
    breakdown.geo = geoDecay(dist)
  }

  // 6. decade match — exact decade of event_date
  var decA = resolveDecade(a)
  var decB = resolveDecade(b)
  if (decA !== null && decB !== null && decA === decB) {
    breakdown.decade = 1
  }

  // 7. multi-witness flag — both have witness_count >= 2
  var mwA = reportWitnessCountAtLeast2(a)
  var mwB = reportWitnessCountAtLeast2(b)
  if (mwA && mwB) breakdown.multi_witness = 1

  // 8. media flag — both have_photo_video
  var medA = reportHasMedia(a)
  var medB = reportHasMedia(b)
  if (medA && medB) breakdown.media = 1

  // ── Weighted sum ─────────────────────────────────────────────────────
  var confidence =
    breakdown.phen_family   * SIGNAL_WEIGHTS.phen_family
  + breakdown.subfamily     * SIGNAL_WEIGHTS.subfamily
  + breakdown.descriptors   * SIGNAL_WEIGHTS.descriptors
  + breakdown.geo           * SIGNAL_WEIGHTS.geo
  + breakdown.decade        * SIGNAL_WEIGHTS.decade
  + breakdown.time_of_day   * SIGNAL_WEIGHTS.time_of_day
  + breakdown.multi_witness * SIGNAL_WEIGHTS.multi_witness
  + breakdown.media         * SIGNAL_WEIGHTS.media

  // ── Hard floor: phen_family + subfamily must BOTH match for ≥ 0.6 ──
  if (!(famMatch && subMatch)) {
    if (confidence > 0.59) confidence = 0.59
  }

  // signal_overlap_count: number of the 8 signals that scored ≥ threshold
  var overlap = 0
  if (breakdown.phen_family   >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.subfamily     >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.descriptors   >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.geo           >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.decade        >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.time_of_day   >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.multi_witness >= SIGNAL_HIT_THRESHOLD) overlap++
  if (breakdown.media         >= SIGNAL_HIT_THRESHOLD) overlap++

  var band: 'strong' | 'aggregate' | 'noise' = 'noise'
  if (confidence >= CONFIDENCE_STRONG) band = 'strong'
  else if (confidence >= CONFIDENCE_AGGREGATE) band = 'aggregate'

  return {
    confidence: confidence,
    signal_overlap_count: overlap,
    breakdown: breakdown,
    band: band,
  }
}

/* -------------------------------------------------------------------------- */
/* Distance bucket — pre-opt-in safe label                                     */
/* -------------------------------------------------------------------------- */

export type DistanceBucket = 'within_25mi' | '25_100mi' | '100_500mi' | 'over_500mi' | 'unknown'

export function distanceBucket(a: FingerprintReport, b: FingerprintReport): DistanceBucket {
  if (typeof a.latitude !== 'number' || typeof a.longitude !== 'number'
      || typeof b.latitude !== 'number' || typeof b.longitude !== 'number') {
    return 'unknown'
  }
  var d = haversineMi(a.latitude, a.longitude, b.latitude, b.longitude)
  if (d <= 25) return 'within_25mi'
  if (d <= 100) return '25_100mi'
  if (d <= 500) return '100_500mi'
  return 'over_500mi'
}

export function distanceBucketLabel(b: DistanceBucket): string {
  switch (b) {
    case 'within_25mi': return 'within 25 miles'
    case '25_100mi': return 'between 25 and 100 miles'
    case '100_500mi': return 'between 100 and 500 miles'
    case 'over_500mi': return 'more than 500 miles'
    case 'unknown': return 'distance unrecorded'
  }
}

/* -------------------------------------------------------------------------- */
/* Anonymous offer payload — what either side sees BEFORE acceptance.          */
/* HARD: no name, no exact location, no photo, no verbatim text.               */
/* -------------------------------------------------------------------------- */

export interface AnonymousOfferPayload {
  phen_family: string | null
  decade: number | null
  signal_overlap_count: number
  distance_bucket: DistanceBucket
}

export function buildAnonymousPayload(
  asking: FingerprintReport,
  counterparty: FingerprintReport,
  score: FingerprintScore,
): AnonymousOfferPayload {
  return {
    phen_family: counterparty.category,
    decade: resolveDecade(counterparty),
    signal_overlap_count: score.signal_overlap_count,
    distance_bucket: distanceBucket(asking, counterparty),
  }
}

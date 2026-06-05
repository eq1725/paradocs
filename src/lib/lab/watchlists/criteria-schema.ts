// V11.17.72 — Custom Watchlists
//
// Criteria schema + validation. The criteria object lives in
// lab_watchlists.criteria (JSONB). All fields are optional; at least
// one must be set. The match engine evaluates each set criterion in
// AND with the others (see match-engine.ts).
//
// Vocabulary intentionally aligns with the descriptor families the
// Hints pipeline already extracts (data-query-types.ts) so a future
// "watchlist suggestion from your dossier" affordance can prepopulate
// the criteria from the same token vocabulary.

import type { HintCategory } from '@/lib/lab/hints/hint-schema'
import type { DescriptorFamily } from '@/lib/lab/hints/data-query-types'

export interface WatchlistGeo {
  lat: number
  lng: number
  radius_miles: number
}

export interface WatchlistTimeOfDayWindow {
  /** Inclusive start hour, 0-23. */
  start_hour: number
  /** Inclusive end hour, 0-23. */
  end_hour: number
}

export type WatchlistCredibility = 'low' | 'medium' | 'high'

export interface WatchlistCriteria {
  /** Match if report.category is in this list. */
  phen_family?: HintCategory[]
  /** Match if a descriptor / vocabulary token matches this subfamily
   *  label (e.g. 'triangle_class', 'bigfoot_class'). Loose substring
   *  match against report tags + paradocs_assessment.descriptors. */
  subfamily?: string
  /** Match if the report contains ANY of these descriptors. */
  descriptors_any?: DescriptorFamily[]
  /** Match if the report contains ALL of these descriptors. */
  descriptors_all?: DescriptorFamily[]
  /** Geographic radius around (lat, lng). */
  geo?: WatchlistGeo
  /** Match if state_or_country equals this code, e.g. 'US-TX' or 'CA'.
   *  Two-letter country codes match against reports.country; the
   *  'US-XX' variant matches reports.state_province (XX) within US. */
  state_or_country?: string
  /** Earliest event_date year (inclusive). */
  event_year_from?: number
  /** Latest event_date year (inclusive). */
  event_year_to?: number
  /** Match if the event hour falls in [start_hour, end_hour] inclusive.
   *  Supports wrap-around (e.g., {start: 22, end: 4}). */
  time_of_day_window?: WatchlistTimeOfDayWindow
  /** Match if the report describes 2+ witnesses. We approximate this
   *  with the `witness_paired_or_more` descriptor + assessment hints. */
  witness_count_min?: number
  /** Require any attached media (photo or video). Matches reports
   *  whose paradocs_assessment indicates media or whose
   *  reports.media_count > 0 (proxy: tags include 'has_photo'/'has_video'). */
  has_photo_video?: boolean
  /** Minimum credibility tier — uses paradocs_assessment.credibility
   *  (when present). 'low' is the loosest gate; 'high' the strictest. */
  min_credibility?: WatchlistCredibility
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

/**
 * Validate a criteria object. The router-level POST/PUT handlers must
 * run this and reject with 400 + the error array on `!ok`.
 *
 * Validation rules from PRO_TIER_VALIDATION_V3.md §4:
 *   - At least ONE criterion must be set
 *   - geo without radius_miles is rejected
 *   - event_year_from > event_year_to is rejected
 */
export function validateCriteria(c: any): ValidationResult {
  var errors: string[] = []
  if (!c || typeof c !== 'object') {
    return { ok: false, errors: ['criteria must be an object'] }
  }

  // At-least-one-set check.
  var anySet = false
  var settableKeys: (keyof WatchlistCriteria)[] = [
    'phen_family', 'subfamily', 'descriptors_any', 'descriptors_all',
    'geo', 'state_or_country', 'event_year_from', 'event_year_to',
    'time_of_day_window', 'witness_count_min', 'has_photo_video',
    'min_credibility',
  ]
  for (var i = 0; i < settableKeys.length; i++) {
    var k = settableKeys[i]
    if (c[k] !== undefined && c[k] !== null && c[k] !== '') {
      if (Array.isArray(c[k]) && (c[k] as any[]).length === 0) continue
      anySet = true
      break
    }
  }
  if (!anySet) errors.push('at least one criterion must be set')

  // phen_family must be array of strings.
  if (c.phen_family !== undefined) {
    if (!Array.isArray(c.phen_family) || c.phen_family.some(function (v: any) { return typeof v !== 'string' })) {
      errors.push('phen_family must be an array of strings')
    }
  }

  // descriptor arrays must be arrays of strings.
  if (c.descriptors_any !== undefined) {
    if (!Array.isArray(c.descriptors_any) || c.descriptors_any.some(function (v: any) { return typeof v !== 'string' })) {
      errors.push('descriptors_any must be an array of strings')
    }
  }
  if (c.descriptors_all !== undefined) {
    if (!Array.isArray(c.descriptors_all) || c.descriptors_all.some(function (v: any) { return typeof v !== 'string' })) {
      errors.push('descriptors_all must be an array of strings')
    }
  }

  // geo: lat/lng numbers + radius_miles > 0.
  if (c.geo !== undefined && c.geo !== null) {
    if (typeof c.geo !== 'object') {
      errors.push('geo must be an object')
    } else {
      if (typeof c.geo.lat !== 'number' || typeof c.geo.lng !== 'number') {
        errors.push('geo.lat and geo.lng must be numbers')
      }
      if (typeof c.geo.radius_miles !== 'number' || c.geo.radius_miles <= 0) {
        errors.push('geo.radius_miles must be a positive number')
      }
    }
  }

  // state_or_country must be a string.
  if (c.state_or_country !== undefined && typeof c.state_or_country !== 'string') {
    errors.push('state_or_country must be a string')
  }

  // event_year_from / event_year_to must be ints; from <= to.
  var yf = c.event_year_from
  var yt = c.event_year_to
  if (yf !== undefined && (typeof yf !== 'number' || !isFinite(yf))) {
    errors.push('event_year_from must be a number')
  }
  if (yt !== undefined && (typeof yt !== 'number' || !isFinite(yt))) {
    errors.push('event_year_to must be a number')
  }
  if (typeof yf === 'number' && typeof yt === 'number' && yf > yt) {
    errors.push('event_year_from must be <= event_year_to')
  }

  // time_of_day_window — hours in [0, 23].
  if (c.time_of_day_window !== undefined && c.time_of_day_window !== null) {
    var w = c.time_of_day_window
    if (typeof w !== 'object'
        || typeof w.start_hour !== 'number'
        || typeof w.end_hour !== 'number'
        || w.start_hour < 0 || w.start_hour > 23
        || w.end_hour < 0 || w.end_hour > 23) {
      errors.push('time_of_day_window.{start_hour,end_hour} must be 0-23')
    }
  }

  // witness_count_min — positive int.
  if (c.witness_count_min !== undefined) {
    if (typeof c.witness_count_min !== 'number' || c.witness_count_min < 1) {
      errors.push('witness_count_min must be >= 1')
    }
  }

  // has_photo_video — boolean.
  if (c.has_photo_video !== undefined && typeof c.has_photo_video !== 'boolean') {
    errors.push('has_photo_video must be a boolean')
  }

  // min_credibility — enum.
  if (c.min_credibility !== undefined
      && c.min_credibility !== 'low'
      && c.min_credibility !== 'medium'
      && c.min_credibility !== 'high') {
    errors.push("min_credibility must be 'low' | 'medium' | 'high'")
  }

  return { ok: errors.length === 0, errors: errors }
}

/**
 * Render a one-line human summary of the criteria — used in the
 * WatchlistsRail UI as the card subtitle ("triangle UFO within 100mi
 * of Saratoga TX, 1990-present").
 */
export function summarizeCriteria(c: WatchlistCriteria): string {
  var parts: string[] = []

  if (c.subfamily) parts.push(c.subfamily.replace(/_/g, ' '))
  if (c.phen_family && c.phen_family.length > 0) {
    parts.push(c.phen_family.map(humanizeFamily).join(' / '))
  }

  if (c.descriptors_any && c.descriptors_any.length > 0) {
    parts.push('any of: ' + c.descriptors_any.slice(0, 3).map(humanizeDescriptor).join(', '))
  }
  if (c.descriptors_all && c.descriptors_all.length > 0) {
    parts.push('all of: ' + c.descriptors_all.slice(0, 3).map(humanizeDescriptor).join(', '))
  }

  if (c.geo) {
    parts.push('within ' + Math.round(c.geo.radius_miles) + 'mi of ('
      + c.geo.lat.toFixed(2) + ', ' + c.geo.lng.toFixed(2) + ')')
  }
  if (c.state_or_country) parts.push('in ' + c.state_or_country)

  if (c.event_year_from && c.event_year_to) {
    parts.push(c.event_year_from + '-' + c.event_year_to)
  } else if (c.event_year_from) {
    parts.push('from ' + c.event_year_from)
  } else if (c.event_year_to) {
    parts.push('through ' + c.event_year_to)
  }

  if (c.time_of_day_window) {
    parts.push(c.time_of_day_window.start_hour + ':00-' + c.time_of_day_window.end_hour + ':00')
  }

  if (c.witness_count_min && c.witness_count_min > 1) {
    parts.push(c.witness_count_min + '+ witnesses')
  }
  if (c.has_photo_video) parts.push('with media')
  if (c.min_credibility) parts.push(c.min_credibility + '+ credibility')

  return parts.length > 0 ? parts.join(', ') : 'no criteria set'
}

function humanizeFamily(f: string): string {
  switch (f) {
    case 'ufos_aliens': return 'UFO'
    case 'cryptids': return 'cryptid'
    case 'ghosts_hauntings': return 'haunting'
    case 'psychic_phenomena': return 'psychic'
    case 'consciousness_practices': return 'consciousness'
    case 'esoteric_practices': return 'esoteric'
    case 'perception_sensory': return 'perception'
    case 'psychological_experiences': return 'psychological'
    case 'religion_mythology': return 'religion/mythology'
    default: return f.replace(/_/g, ' ')
  }
}

function humanizeDescriptor(d: string): string {
  return d.replace(/_/g, ' ')
}

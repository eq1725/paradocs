// V11.17.71 - Pro Dossier
//
// Compute engine for the Pro Dossier per PRO_TIER_VALIDATION_V3.md §3.
//
// Every section is built from real DB queries against the 250k-report
// Archive. NEVER fabricate. If data is insufficient to support a claim,
// the section sets data_sparse: true and the viewer renders "data
// sparse" rather than a guessed number.
//
// Section weights for the closest-reports composite (matches the
// founder's spec):
//   composite = 0.50 * descriptor_overlap
//             + 0.30 * geo_proximity
//             + 0.20 * temporal_proximity
//
// SWC convention: var + function() form. Named export per repo style.

import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import {
  getMoonPhase,
  getActiveMeteorShowers,
} from '@/lib/services/astronomical.service'
import type {
  ClosestReport,
  ClosestReportsSection,
  DescriptorMatch,
  DescriptorMatchesSection,
  DossierSections,
  GeoNeighborBucket,
  GeographicNeighborsSection,
  LineageInheritance,
  PhenFamily,
  PhenLineageSection,
  RarityPercentileSection,
  TemporalNeighborsSection,
  TimeMachineSection,
} from './dossier-types'

/* -------------------------------------------------------------------- */
/* Constants                                                            */
/* -------------------------------------------------------------------- */

/**
 * Default geographic radius per phen-family. Per the spec:
 * 50mi for cryptids/UFOs (sparse + travel-prone),
 * 5mi for ghost-hauntings (location-bound).
 */
var RADIUS_BY_FAMILY: Record<string, number> = {
  cryptids: 50,
  ufos_aliens: 50,
  ghosts_hauntings: 5,
  psychic_phenomena: 25,
  esoteric_practices: 25,
  consciousness_practices: 25,
  perception_sensory: 25,
  psychological_experiences: 25,
  religion_mythology: 25,
  general: 50,
  cross_category: 50,
}

/** Cap on Archive sample scans — keeps queries under p95 budget. */
var SAMPLE_CAP = 5000

/** Stop-words list mirrored from constellation/match. */
var STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'were', 'are', 'been', 'be',
  'have', 'had', 'has', 'do', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'it', 'its', 'my', 'me', 'i', 'we', 'they',
  'them', 'he', 'she', 'him', 'her', 'his', 'this', 'that', 'these',
  'those', 'what', 'which', 'who', 'when', 'where', 'how', 'not', 'no',
  'just', 'like', 'very', 'so', 'than', 'then', 'there', 'here', 'about',
])

/**
 * Descriptor families — mirrors src/lib/lab/hints/data-query-executor
 * vocabulary. Each entry is keyword list + display label. The engine
 * uses these to (a) extract user descriptors from their report text
 * and (b) compute per-descriptor % across the phen-family corpus
 * (Section 5).
 */
var DESCRIPTOR_VOCAB: Array<{
  family: string
  label: string
  keywords: string[]
}> = [
  { family: 'static_electricity',         label: 'static-electricity sensation', keywords: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'] },
  { family: 'low_hum',                    label: 'low hum or drone',              keywords: ['low hum', 'throbbing', 'vibration', 'drone'] },
  { family: 'whoop_vocalization',         label: 'whoop or howl',                 keywords: ['whoop', 'howl', 'vocalization'] },
  { family: 'shadow_figure',              label: 'shadow figure',                 keywords: ['shadow figure', 'standing presence', 'shadow person'] },
  { family: 'tunnel_imagery',             label: 'tunnel or corridor imagery',    keywords: ['tunnel', 'corridor', 'passage'] },
  { family: 'being_of_light',             label: 'being of light',                keywords: ['being of light', 'luminous figure', 'radiant figure'] },
  { family: 'time_distortion',            label: 'time distortion',               keywords: ['time slowed', 'time stopped', 'missing time'] },
  { family: 'metallic_taste',             label: 'metallic taste',                keywords: ['metal taste', 'copper tongue', 'metallic taste'] },
  { family: 'odor_sulphur',               label: 'sulphur or burning odor',       keywords: ['sulphur', 'sulfur', 'rotten eggs', 'burning smell'] },
  { family: 'paralysis_onset',            label: 'paralysis onset',               keywords: ["can't move", 'frozen in place', 'paralyzed', 'locked in place'] },
  { family: 'observed_from_above',        label: 'observed-from-above',           keywords: ['looking down', 'above body', 'ceiling view', 'from above'] },
  { family: 'electromagnetic_disturbance', label: 'electromagnetic disturbance',  keywords: ['flicker', 'stopped watch', 'electronics', 'watch stopped'] },
  { family: 'animal_reaction',            label: 'animal reaction',               keywords: ['dog barking', 'horse spooked', 'cat hiding'] },
  { family: 'three_note_pattern',         label: 'three-tone pattern',            keywords: ['three-tone', 'triadic', 'groups-of-three'] },
  { family: 'craft_shape_triangle',       label: 'triangle craft',                keywords: ['triangle', 'v-formation', 'boomerang'] },
  { family: 'craft_shape_disc',           label: 'disc craft',                    keywords: ['disc', 'saucer'] },
  { family: 'craft_shape_orb',            label: 'orb craft',                     keywords: ['orb', 'sphere', 'ball-of-light'] },
  { family: 'witness_drowsy',             label: 'drowsy / hypnagogic state',     keywords: ['hypnagogic', 'half-asleep', 'falling-asleep', 'drowsy'] },
  { family: 'witness_paired_or_more',     label: 'shared / multi-witness event',  keywords: ['shared event', 'family-witnessed', 'we both saw'] },
  { family: 'apparition_residential',     label: 'residential haunt-locus',       keywords: ['in our house', 'bedroom', 'in the home'] },
  { family: 'recurring_location',         label: 'recurring at same location',    keywords: ['happens again', 'same place', 'same room'] },
]

/**
 * Hand-authored sub-pattern catalogue (Section 2). Each sub-pattern
 * declares a parent family, a set of signals (descriptor families
 * the report must reference), and a stable id.
 *
 * Adding a sub-pattern: append, never reorder. The founder owns this
 * vocabulary — it's the editorial layer the engine inherits from.
 */
var SUB_PATTERN_CATALOGUE: Array<{
  id: string
  label: string
  family: PhenFamily
  signals: string[]
}> = [
  // cryptids
  { id: 'bigfoot-whoop',           label: 'bigfoot-whoop',             family: 'cryptids',    signals: ['whoop_vocalization', 'animal_reaction', 'odor_sulphur', 'witness_paired_or_more'] },
  { id: 'forest-clearing-encounter', label: 'forest-clearing-encounter', family: 'cryptids',  signals: ['shadow_figure', 'animal_reaction', 'low_hum'] },
  // ufos
  { id: 'triangle-craft-low-altitude', label: 'triangle craft, low-altitude', family: 'ufos_aliens', signals: ['craft_shape_triangle', 'low_hum', 'electromagnetic_disturbance'] },
  { id: 'disc-with-paralysis',         label: 'disc with paralysis onset',    family: 'ufos_aliens', signals: ['craft_shape_disc', 'paralysis_onset', 'time_distortion'] },
  { id: 'orb-cluster',                 label: 'orb cluster',                  family: 'ufos_aliens', signals: ['craft_shape_orb', 'electromagnetic_disturbance'] },
  // ghosts
  { id: 'residential-apparition',      label: 'residential apparition',       family: 'ghosts_hauntings', signals: ['apparition_residential', 'recurring_location', 'shadow_figure'] },
  { id: 'haunting-with-animal-cue',    label: 'haunting with animal cue',     family: 'ghosts_hauntings', signals: ['animal_reaction', 'recurring_location'] },
  // psychic / consciousness
  { id: 'sleep-paralysis-classic',     label: 'sleep-paralysis classic',      family: 'psychic_phenomena', signals: ['paralysis_onset', 'witness_drowsy', 'shadow_figure'] },
  { id: 'oobe-from-above',             label: 'OOBE / observed-from-above',   family: 'consciousness_practices', signals: ['observed_from_above', 'tunnel_imagery', 'being_of_light'] },
]

/* -------------------------------------------------------------------- */
/* Helpers                                                              */
/* -------------------------------------------------------------------- */

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

function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set()
  var out = new Set<string>()
  var raw = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
  for (var i = 0; i < raw.length; i++) {
    if (raw[i].length > 2 && !STOP_WORDS.has(raw[i])) out.add(raw[i])
  }
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  var inter = 0
  a.forEach(function (w) { if (b.has(w)) inter++ })
  var union = a.size + b.size - inter
  return union > 0 ? inter / union : 0
}

function extractReportText(row: any): string {
  return [row.title, row.summary, row.description].filter(Boolean).join(' ')
}

function readDescriptorTokens(row: any): string[] {
  var out: string[] = []
  if (Array.isArray(row.tags)) {
    for (var i = 0; i < row.tags.length; i++) {
      if (row.tags[i]) out.push(String(row.tags[i]).toLowerCase())
    }
  }
  var assess = row.paradocs_assessment
  if (assess && typeof assess === 'object') {
    var descs = (assess as any).descriptors
    if (Array.isArray(descs)) {
      for (var j = 0; j < descs.length; j++) {
        if (descs[j]) out.push(String(descs[j]).toLowerCase())
      }
    }
  }
  out.push('__text__:' + extractReportText(row).toLowerCase())
  return out
}

function rowHasDescriptor(row: any, descriptorFamily: string): boolean {
  var vocab = DESCRIPTOR_VOCAB.find(function (d) { return d.family === descriptorFamily })
  if (!vocab) return false
  var tokens = readDescriptorTokens(row)
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i]
    for (var j = 0; j < vocab.keywords.length; j++) {
      if (tok.indexOf(vocab.keywords[j].toLowerCase()) !== -1) return true
    }
  }
  return false
}

function extractUserDescriptors(row: any): string[] {
  var matched: string[] = []
  for (var i = 0; i < DESCRIPTOR_VOCAB.length; i++) {
    if (rowHasDescriptor(row, DESCRIPTOR_VOCAB[i].family)) {
      matched.push(DESCRIPTOR_VOCAB[i].family)
    }
  }
  return matched
}

function resolveYear(row: any): number | null {
  if (row.event_date) {
    var y = new Date(row.event_date).getUTCFullYear()
    if (!isNaN(y) && y > 1800 && y < 2200) return y
  }
  if (row.event_date_raw) {
    var m = String(row.event_date_raw).match(/(\d{4})/)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function resolveDecade(y: number | null): number | null {
  if (y === null) return null
  return Math.floor(y / 10) * 10
}

function locationLabel(row: any): string {
  var parts = [row.city, row.state_province].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (row.location_description) return String(row.location_description)
  return row.country || 'unknown location'
}

function buildSnippet(row: any): string {
  var src = (row.summary || row.description || row.title || '').toString().trim()
  if (!src) return ''
  src = src.replace(/\s+/g, ' ')
  if (src.length > 140) return src.substring(0, 137).trim() + '…'
  return src
}

function monthName(idx: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'][idx]
}

function hourWindowLabel(hour: number): string {
  if (hour >= 0 && hour < 3) return '12–3 AM'
  if (hour >= 3 && hour < 6) return '3–6 AM'
  if (hour >= 6 && hour < 9) return '6–9 AM'
  if (hour >= 9 && hour < 12) return '9 AM–noon'
  if (hour >= 12 && hour < 15) return 'noon–3 PM'
  if (hour >= 15 && hour < 18) return '3–6 PM'
  if (hour >= 18 && hour < 21) return '6–9 PM'
  return '9 PM–midnight'
}

function resolveHour(row: any): number | null {
  if (row.event_time && /^\d{1,2}:\d{2}/.test(row.event_time)) {
    return parseInt(String(row.event_time).split(':')[0], 10)
  }
  return null
}

/** Compute input-signal checksum used for cache-invalidation. */
export function computeChecksum(userReport: any, archiveSize: number): string {
  var sig = [
    userReport.id,
    userReport.category || '',
    String(userReport.latitude || ''),
    String(userReport.longitude || ''),
    String(resolveYear(userReport) || ''),
    (userReport.description || userReport.summary || userReport.title || '').toString().slice(0, 4000),
    // Archive size bucketed to nearest 5000 — so we recompute when the
    // corpus grows materially, but not on every report ingest.
    String(Math.floor(archiveSize / 5000)),
  ].join('|')
  return crypto.createHash('md5').update(sig).digest('hex')
}

/** Get current Archive size (cached on the engine-call level by the caller). */
export async function getArchiveSize(svc: SupabaseClient): Promise<number> {
  try {
    var r = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
    return (r && (r as any).count) || 0
  } catch (_e) {
    return 0
  }
}

/* -------------------------------------------------------------------- */
/* Section 1 — Closest reports                                          */
/* -------------------------------------------------------------------- */

async function buildClosestReports(
  svc: SupabaseClient,
  userReport: any,
  candidatePool: any[],
): Promise<ClosestReportsSection> {
  var userTokens = tokenize(extractReportText(userReport))
  var userYear = resolveYear(userReport)
  var userLat = typeof userReport.latitude === 'number' ? userReport.latitude : null
  var userLng = typeof userReport.longitude === 'number' ? userReport.longitude : null

  // The maximum geo distance we treat as "in range" for normalization
  // purposes. Beyond this, proximity score = 0.
  var MAX_GEO_MI = 500
  // Maximum temporal gap (years) we treat as "in range" for the
  // temporal-proximity normalization.
  var MAX_TEMPORAL_YEARS = 50

  var scored: ClosestReport[] = []
  for (var i = 0; i < candidatePool.length; i++) {
    var r = candidatePool[i]
    if (r.id === userReport.id) continue

    // descriptor_overlap — Jaccard on tokenized text. Cheap and stable.
    var descOverlap = jaccard(userTokens, tokenize(extractReportText(r)))

    // geo_proximity — 1 at 0 mi, 0 at MAX_GEO_MI.
    var geoProx = 0
    var distMi: number | null = null
    if (userLat !== null && userLng !== null &&
        typeof r.latitude === 'number' && typeof r.longitude === 'number') {
      distMi = haversineMi(userLat, userLng, r.latitude, r.longitude)
      geoProx = Math.max(0, 1 - distMi / MAX_GEO_MI)
    }

    // temporal_proximity — 1 at same year, 0 at MAX_TEMPORAL_YEARS gap.
    var temporalProx = 0
    var rYear = resolveYear(r)
    if (userYear !== null && rYear !== null) {
      var gap = Math.abs(userYear - rYear)
      temporalProx = Math.max(0, 1 - gap / MAX_TEMPORAL_YEARS)
    }

    var composite = 0.5 * descOverlap + 0.3 * geoProx + 0.2 * temporalProx
    if (composite <= 0) continue

    scored.push({
      id: r.id,
      slug: r.slug || null,
      title: r.title || '(untitled)',
      year: rYear,
      location_label: locationLabel(r),
      sub_pattern_tag: r.category || 'general',
      snippet: buildSnippet(r),
      composite_score: Math.round(composite * 100),
      signals: {
        descriptor_overlap: Math.round(descOverlap * 100) / 100,
        geo_proximity: Math.round(geoProx * 100) / 100,
        temporal_proximity: Math.round(temporalProx * 100) / 100,
      },
      distance_mi: distMi !== null ? Math.round(distMi) : null,
    })
  }

  scored.sort(function (a, b) { return b.composite_score - a.composite_score })
  var top5 = scored.slice(0, 5)

  var dataSparse = top5.length < 3
  var caption = dataSparse
    ? 'Closest matches are sparse in the Archive for this fingerprint.'
    : 'The five Archive accounts that overlap most across descriptor, place, and time.'

  return {
    kind: 'closest_reports',
    caption: caption,
    reports: top5,
    data_sparse: dataSparse,
    pool_size: scored.length,
  }
}

/* -------------------------------------------------------------------- */
/* Section 2 — Phen lineage                                             */
/* -------------------------------------------------------------------- */

function buildPhenLineage(
  userReport: any,
  userDescriptors: string[],
): PhenLineageSection {
  var family = (userReport.category || 'general') as PhenFamily
  var inheritances: LineageInheritance[] = []

  for (var i = 0; i < SUB_PATTERN_CATALOGUE.length; i++) {
    var sp = SUB_PATTERN_CATALOGUE[i]
    // Restrict to same family + adjacent (cross-category fallback).
    if (sp.family !== family && family !== 'cross_category' && family !== 'general') continue
    var matched: string[] = []
    for (var j = 0; j < sp.signals.length; j++) {
      if (userDescriptors.indexOf(sp.signals[j]) !== -1) matched.push(sp.signals[j])
    }
    if (matched.length === 0) continue
    var confidence = matched.length / sp.signals.length
    // Surface only inheritances with at least 50% signal match.
    if (confidence < 0.5) continue
    inheritances.push({
      sub_pattern_id: sp.id,
      label: sp.label,
      matched_signals: matched.length,
      total_signals: sp.signals.length,
      confidence: Math.round(confidence * 100) / 100,
      signal_cites: matched.map(function (m) {
        var v = DESCRIPTOR_VOCAB.find(function (d) { return d.family === m })
        return v ? v.label : m
      }),
    })
  }

  // Sort by confidence then matched-count.
  inheritances.sort(function (a, b) {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.matched_signals - a.matched_signals
  })
  // Cap at 3 — the spec says 1-3.
  inheritances = inheritances.slice(0, 3)

  var dataSparse = inheritances.length === 0
  var caption = dataSparse
    ? 'No sub-pattern signals matched at the 50% threshold.'
    : 'Sub-patterns this account inherits from, with the descriptor signals that match.'

  return {
    kind: 'phen_lineage',
    caption: caption,
    inheritances: inheritances,
    data_sparse: dataSparse,
  }
}

/* -------------------------------------------------------------------- */
/* Section 3 — Geographic neighbors                                     */
/* -------------------------------------------------------------------- */

async function buildGeographicNeighbors(
  svc: SupabaseClient,
  userReport: any,
): Promise<GeographicNeighborsSection> {
  var family = userReport.category || 'general'
  var radius = RADIUS_BY_FAMILY[family] || 50

  var userLat = typeof userReport.latitude === 'number' ? userReport.latitude : null
  var userLng = typeof userReport.longitude === 'number' ? userReport.longitude : null

  if (userLat === null || userLng === null) {
    return {
      kind: 'geographic_neighbors',
      caption: 'No coordinates on this account — geographic neighbors cannot be surfaced.',
      radius_mi: radius,
      total_count: 0,
      buckets: [],
      center_lat: null,
      center_lng: null,
      data_sparse: true,
    }
  }

  // Bounding-box pre-filter then haversine-confirm. Mirrors the pattern
  // used in your-signal / data-query-executor.
  var latDelta = radius / 69
  var lngDelta = radius / (69 * Math.cos((userLat * Math.PI) / 180) || 1)
  try {
    var qres = await svc
      .from('reports')
      .select('id, category, latitude, longitude, phenomenon_type:phenomenon_types(name)')
      .eq('status', 'approved')
      .neq('id', userReport.id)
      .gte('latitude', userLat - latDelta)
      .lte('latitude', userLat + latDelta)
      .gte('longitude', userLng - lngDelta)
      .lte('longitude', userLng + lngDelta)
      .limit(2000)
    var rows: any[] = (qres && (qres as any).data) || []

    var bucketMap: Record<string, number> = {}
    var total = 0
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
      if (haversineMi(userLat, userLng, r.latitude, r.longitude) > radius) continue
      total++
      var tag = (r.phenomenon_type && (r.phenomenon_type as any).name) || r.category || 'general'
      bucketMap[tag] = (bucketMap[tag] || 0) + 1
    }

    var buckets: GeoNeighborBucket[] = Object.keys(bucketMap).map(function (k) {
      return { sub_pattern_tag: k, count: bucketMap[k] }
    }).sort(function (a, b) { return b.count - a.count }).slice(0, 8)

    var dataSparse = total < 1
    var caption = dataSparse
      ? 'No Archive reports within ' + radius + ' miles.'
      : total + ' Archive ' + (total === 1 ? 'report sits' : 'reports sit') + ' within ' + radius + ' miles of your account.'

    return {
      kind: 'geographic_neighbors',
      caption: caption,
      radius_mi: radius,
      total_count: total,
      buckets: buckets,
      center_lat: userLat,
      center_lng: userLng,
      data_sparse: dataSparse,
    }
  } catch (_e) {
    return {
      kind: 'geographic_neighbors',
      caption: 'Geographic neighbor query failed — surfacing as data-sparse.',
      radius_mi: radius,
      total_count: 0,
      buckets: [],
      center_lat: userLat,
      center_lng: userLng,
      data_sparse: true,
    }
  }
}

/* -------------------------------------------------------------------- */
/* Section 4 — Temporal neighbors                                       */
/* -------------------------------------------------------------------- */

async function buildTemporalNeighbors(
  svc: SupabaseClient,
  userReport: any,
  candidatePool: any[],
): Promise<TemporalNeighborsSection> {
  var family = userReport.category
  var userYear = resolveYear(userReport)
  var userDecade = resolveDecade(userYear)
  var userMonth: number | null = null
  if (userReport.event_date) {
    var ud = new Date(userReport.event_date)
    if (!isNaN(ud.getTime())) userMonth = ud.getUTCMonth()
  }
  var userHour = resolveHour(userReport)

  var hourLabel: string | null = userHour !== null ? hourWindowLabel(userHour) : null

  // We compute decade_count by querying the corpus directly (cheap
  // count). Month/hour counts piggyback on the candidate pool that
  // the engine already pulled — saves a roundtrip.
  var decadeCount = 0
  if (userDecade !== null && family) {
    try {
      var sIso = userDecade + '-01-01'
      var eIso = (userDecade + 10) + '-01-01'
      var dRes = await svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', family)
        .gte('event_date', sIso)
        .lt('event_date', eIso)
        .neq('id', userReport.id)
      decadeCount = (dRes && (dRes as any).count) || 0
    } catch (_e) { decadeCount = 0 }
  }

  // Month + hour windows — compute from the candidate pool we already
  // have. (Pool is same-family by construction.)
  var monthCount = 0
  var hourCount = 0
  for (var i = 0; i < candidatePool.length; i++) {
    var r = candidatePool[i]
    if (r.id === userReport.id) continue
    if (userMonth !== null && r.event_date) {
      var dd = new Date(r.event_date)
      if (!isNaN(dd.getTime()) && dd.getUTCMonth() === userMonth) monthCount++
    }
    if (userHour !== null && r.event_time && /^\d{1,2}:\d{2}/.test(r.event_time)) {
      var rh = parseInt(String(r.event_time).split(':')[0], 10)
      if (hourWindowLabel(rh) === hourLabel) hourCount++
    }
  }

  var dataSparse = decadeCount === 0 && monthCount === 0 && hourCount === 0
  var caption = dataSparse
    ? 'Temporal neighbor data is sparse for this account.'
    : decadeCount + ' reports in your decade · ' + monthCount + ' in your month · ' + hourCount + ' in your hour window.'

  return {
    kind: 'temporal_neighbors',
    caption: caption,
    decade_label: userDecade !== null ? userDecade + 's' : null,
    decade_count: decadeCount,
    month_label: userMonth !== null ? monthName(userMonth) : null,
    month_count: monthCount,
    hour_window_label: hourLabel,
    hour_window_count: hourCount,
    data_sparse: dataSparse,
  }
}

/* -------------------------------------------------------------------- */
/* Section 5 — Descriptor matches                                       */
/* -------------------------------------------------------------------- */

async function buildDescriptorMatches(
  svc: SupabaseClient,
  userReport: any,
  userDescriptors: string[],
  candidatePool: any[],
): Promise<DescriptorMatchesSection> {
  if (userDescriptors.length === 0) {
    return {
      kind: 'descriptor_matches',
      caption: 'No major descriptors detected in your account — section suppressed.',
      matches: [],
      data_sparse: true,
    }
  }

  // candidatePool is same-family. Use it as the denominator.
  var denom = candidatePool.length
  if (denom < 20) {
    return {
      kind: 'descriptor_matches',
      caption: 'Phen-family corpus too small (<20 reports) for a stable descriptor share.',
      matches: [],
      data_sparse: true,
    }
  }

  var matches: DescriptorMatch[] = []
  for (var i = 0; i < userDescriptors.length; i++) {
    var df = userDescriptors[i]
    var vocab = DESCRIPTOR_VOCAB.find(function (d) { return d.family === df })
    if (!vocab) continue
    var num = 0
    for (var j = 0; j < candidatePool.length; j++) {
      if (rowHasDescriptor(candidatePool[j], df)) num++
    }
    var pct = denom > 0 ? Math.round((num / denom) * 100) : 0
    matches.push({
      family: df,
      label: vocab.label,
      pct: pct,
      denominator: denom,
      numerator: num,
    })
  }

  matches.sort(function (a, b) { return b.pct - a.pct })

  return {
    kind: 'descriptor_matches',
    caption: 'How often each descriptor in your account appears across the same-family corpus.',
    matches: matches,
    data_sparse: matches.length === 0,
  }
}

/* -------------------------------------------------------------------- */
/* Section 6 — Rarity percentile                                        */
/* -------------------------------------------------------------------- */

function buildRarityPercentile(
  userReport: any,
  userDescriptors: string[],
  candidatePool: any[],
): RarityPercentileSection {
  var family = userReport.category || 'general'
  if (userDescriptors.length < 2 || candidatePool.length < 30) {
    return {
      kind: 'rarity_percentile',
      caption: 'Not enough descriptors or corpus to compute a stable rarity score.',
      percentile: 0,
      method: 'Need ≥2 descriptors and ≥30 same-family reports.',
      family_label: family,
      descriptor_count: userDescriptors.length,
      corpus_size: candidatePool.length,
      data_sparse: true,
    }
  }

  // Method (mirrors spec): count reports that match ≥80% of the user's
  // descriptor set, divide by total, invert. Higher = more unusual.
  var threshold = Math.max(1, Math.ceil(userDescriptors.length * 0.8))
  var matchingCount = 0
  for (var i = 0; i < candidatePool.length; i++) {
    var r = candidatePool[i]
    if (r.id === userReport.id) continue
    var hits = 0
    for (var j = 0; j < userDescriptors.length; j++) {
      if (rowHasDescriptor(r, userDescriptors[j])) hits++
    }
    if (hits >= threshold) matchingCount++
  }

  var share = matchingCount / candidatePool.length // 0..1
  // Invert so rare combinations land high.
  var percentile = Math.round((1 - share) * 100)

  return {
    kind: 'rarity_percentile',
    caption: 'This account scores in the ' + percentile + 'th percentile for unusual feature combinations within the ' + family + ' corpus.',
    percentile: percentile,
    method: 'Reports matching ≥80% of your descriptor set divided by corpus, inverted.',
    family_label: family,
    descriptor_count: userDescriptors.length,
    corpus_size: candidatePool.length,
    data_sparse: false,
  }
}

/* -------------------------------------------------------------------- */
/* Section 7 — Time-machine                                             */
/* -------------------------------------------------------------------- */

async function buildTimeMachine(
  svc: SupabaseClient,
  userReport: any,
): Promise<TimeMachineSection> {
  var notes: string[] = []
  var eventIso = userReport.event_date || null
  var dateObj: Date | null = null
  if (eventIso) {
    var d = new Date(eventIso)
    if (!isNaN(d.getTime())) dateObj = d
  }

  var moon: { phase: string; illumination_pct: number } | null = null
  var meteor: { name: string; rate_per_hour: number } | null = null
  if (dateObj) {
    try {
      var m = getMoonPhase(dateObj)
      moon = { phase: m.phase, illumination_pct: m.illumination }
    } catch (_e) { /* defensive */ }
    try {
      var showers = getActiveMeteorShowers(dateObj)
      var active = showers.find(function (s) { return s.isActive })
      if (active) meteor = { name: active.name, rate_per_hour: active.rate }
      else notes.push('No notable meteor shower active in this window.')
    } catch (_e) {
      notes.push('Meteor-shower data unavailable for this date.')
    }
  } else {
    notes.push('Event date unknown — astronomical context cannot be computed.')
  }

  // Contemporaneous reports — 7 days + 100mi window around the event.
  var contemporaneous: TimeMachineSection['contemporaneous_reports'] = []
  if (dateObj && typeof userReport.latitude === 'number' && typeof userReport.longitude === 'number') {
    try {
      var lo = new Date(dateObj.getTime() - 7 * 24 * 3600 * 1000).toISOString()
      var hi = new Date(dateObj.getTime() + 7 * 24 * 3600 * 1000).toISOString()
      var latDelta = 100 / 69
      var lngDelta = 100 / (69 * Math.cos((userReport.latitude * Math.PI) / 180) || 1)
      var cres = await svc
        .from('reports')
        .select('id, slug, title, event_date, latitude, longitude, city, state_province, country')
        .eq('status', 'approved')
        .neq('id', userReport.id)
        .gte('event_date', lo)
        .lte('event_date', hi)
        .gte('latitude', userReport.latitude - latDelta)
        .lte('latitude', userReport.latitude + latDelta)
        .gte('longitude', userReport.longitude - lngDelta)
        .lte('longitude', userReport.longitude + lngDelta)
        .limit(20)
      var rows: any[] = (cres && (cres as any).data) || []
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i]
        if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
        var dist = haversineMi(userReport.latitude, userReport.longitude, r.latitude, r.longitude)
        if (dist > 100) continue
        contemporaneous.push({
          id: r.id,
          slug: r.slug || null,
          title: r.title || '(untitled)',
          event_date: r.event_date || null,
          distance_mi: Math.round(dist),
          location_label: locationLabel(r),
        })
      }
      if (contemporaneous.length === 0) {
        notes.push('No other Archive reports within 7 days + 100 mi of this event.')
      }
    } catch (_e) {
      notes.push('Contemporaneous-report query failed.')
    }
  } else if (!dateObj) {
    notes.push('Cannot search for contemporaneous reports — event date missing.')
  } else {
    notes.push('Cannot search for contemporaneous reports — location missing.')
  }

  notes.push('Notable news context: data not yet wired (Time-Machine TODO).')
  notes.push('Weather context: data not yet wired (Time-Machine TODO).')

  var dataSparse = !dateObj && contemporaneous.length === 0
  var caption = dataSparse
    ? 'Time-machine context is sparse — event date or location missing.'
    : 'What else the Archive captured around your event date and place.'

  return {
    kind: 'time_machine',
    caption: caption,
    event_date_iso: eventIso,
    moon_phase: moon,
    meteor_shower: meteor,
    contemporaneous_reports: contemporaneous,
    notes: notes,
    data_sparse: dataSparse,
  }
}

/* -------------------------------------------------------------------- */
/* Top-level compute                                                    */
/* -------------------------------------------------------------------- */

/**
 * Fetch the same-family candidate pool used by Sections 1/4/5/6. Cap
 * at SAMPLE_CAP rows (most-recent first) so the engine stays cheap.
 */
async function fetchCandidatePool(svc: SupabaseClient, userReport: any): Promise<any[]> {
  if (!userReport.category) return []
  try {
    var qres = await svc
      .from('reports')
      .select(`
        id, slug, title, summary, description, category, tags, paradocs_assessment,
        latitude, longitude, city, state_province, country, location_description,
        event_date, event_date_raw, event_time
      `)
      .eq('status', 'approved')
      .eq('category', userReport.category)
      .neq('id', userReport.id)
      .order('created_at', { ascending: false })
      .limit(SAMPLE_CAP)
    return (qres && (qres as any).data) || []
  } catch (_e) {
    return []
  }
}

/**
 * Compute the full Dossier for one experience. Returns the 7 sections
 * plus the meta block. Caller is responsible for persisting the row.
 */
export async function computeDossier(
  svc: SupabaseClient,
  userReport: any,
): Promise<DossierSections> {
  var archiveSize = await getArchiveSize(svc)
  var checksum = computeChecksum(userReport, archiveSize)
  var userDescriptors = extractUserDescriptors(userReport)
  var candidatePool = await fetchCandidatePool(svc, userReport)

  // Sections that depend on candidatePool are computed in parallel where
  // safe; geo + time-machine hit independent queries so they run in
  // parallel with the pool-using sections.
  var [
    closest,
    geo,
    temporal,
    descriptors,
    timeMachine,
  ] = await Promise.all([
    buildClosestReports(svc, userReport, candidatePool),
    buildGeographicNeighbors(svc, userReport),
    buildTemporalNeighbors(svc, userReport, candidatePool),
    buildDescriptorMatches(svc, userReport, userDescriptors, candidatePool),
    buildTimeMachine(svc, userReport),
  ])
  var lineage = buildPhenLineage(userReport, userDescriptors)
  var rarity = buildRarityPercentile(userReport, userDescriptors, candidatePool)

  var family = (userReport.category || 'general') as PhenFamily
  var sections: DossierSections = {
    closest_reports: closest,
    phen_lineage: lineage,
    geographic_neighbors: geo,
    temporal_neighbors: temporal,
    descriptor_matches: descriptors,
    rarity_percentile: rarity,
    time_machine: timeMachine,
    meta: {
      user_id: userReport.submitted_by || '',
      experience_report_id: userReport.id,
      experience_title: userReport.title || 'Your experience',
      experience_location_label: locationLabel(userReport),
      experience_year: resolveYear(userReport),
      phen_family: family,
      sub_pattern_tag: lineage.inheritances[0]?.label || family,
      computed_at_iso: new Date().toISOString(),
      checksum: checksum,
      archive_size_at_compute: archiveSize,
    },
  }
  return sections
}

/**
 * Decide whether a cached Dossier row needs recomputation given the
 * current source-of-truth signals. Returns the reason string when
 * stale, null when fresh.
 */
export function dossierStaleReason(
  cachedRow: { computed_at: string; checksum: string; sections_json: any } | null,
  userReport: { updated_at?: string | null; created_at?: string | null },
  currentChecksum: string,
  currentArchiveSize: number,
): string | null {
  if (!cachedRow) return 'no_cache'
  if (cachedRow.checksum !== currentChecksum) return 'checksum_mismatch'
  var computed = new Date(cachedRow.computed_at).getTime()
  if (isNaN(computed)) return 'invalid_cache'

  // Report edited after the last compute?
  var reportUpdated = userReport.updated_at ? new Date(userReport.updated_at).getTime() : 0
  if (!isNaN(reportUpdated) && reportUpdated > computed) return 'report_edited'

  // > 7 days since last compute?
  if (Date.now() - computed > 7 * 24 * 3600 * 1000) return 'stale_7d'

  // Archive grew by >1% since the cached snapshot?
  var cachedSize =
    (cachedRow.sections_json && cachedRow.sections_json.meta && cachedRow.sections_json.meta.archive_size_at_compute) ||
    0
  if (cachedSize > 0 && currentArchiveSize > 0) {
    var growth = (currentArchiveSize - cachedSize) / cachedSize
    if (growth > 0.01) return 'archive_growth_1pct'
  }
  return null
}

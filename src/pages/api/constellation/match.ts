/**
 * GET /api/constellation/match
 *
 * Phenomenological matching engine for the Constellation V2 reveal.
 *
 * Given a report ID (or raw experience attributes), finds similar reports
 * in the database based on:
 *   - Phenomenon type / category match
 *   - Location proximity (haversine distance)
 *   - Temporal proximity (event_date)
 *   - Content similarity (keyword overlap in description)
 *   - Sensory/evidence overlap
 *
 * Returns up to 30 matched reports with:
 *   - Overall match_score (0–1)
 *   - match_dimensions: individual similarity breakdowns
 *   - Source attribution
 *   - locked flag (true for gated content beyond free tier)
 *
 * Auth: optional. Unauthenticated users get fewer unlocked results.
 *
 * Query params:
 *   report_id  — match against a specific report
 *   category   — phenomenon category
 *   type_name  — phenomenon type name (more specific)
 *   lat, lng   — user location
 *   description — free text experience description
 *   limit      — max results (default 30)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var FREE_UNLOCKED = 5   // Free tier sees 5 full reports
var MAX_RESULTS = 30

// ── Haversine distance (km) ───────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 6371
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Token-based text similarity (Jaccard) ─────────────────────────────────

var STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'were', 'are', 'been', 'be',
  'have', 'had', 'has', 'do', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'it', 'its', 'my', 'me', 'i', 'we', 'they',
  'them', 'he', 'she', 'him', 'her', 'his', 'this', 'that', 'these',
  'those', 'what', 'which', 'who', 'when', 'where', 'how', 'not', 'no',
  'just', 'like', 'very', 'so', 'than', 'then', 'there', 'here', 'about',
])

function tokenize(text: string): Set<string> {
  if (!text) return new Set()
  var words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(function(w) { return w.length > 2 && !STOP_WORDS.has(w) })
  return new Set(words)
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  var intersection = 0
  a.forEach(function(w) { if (b.has(w)) intersection++ })
  var union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}

// ── Sensory keyword extraction ────────────────────────────────────────────

// Per-label config. `keywords` are the indicator terms. `category`
// (optional) restricts the label to a subset of phenomenon categories
// — e.g. 'Shadow figure' is a ghost/cryptid pattern, so we don't
// surface it as a top dimension on a UAP report just because the
// description happened to mention 'dark' or 'tall'. `minHits` is the
// minimum number of distinct indicator terms required for the label
// to activate (defaults to 2 — single-word matches were producing
// embarrassing false positives like 'Shadow figure: 91%' on triangle
// UFO reports that used the word 'dark').
//
// May 2026 — Chase saw a Triangle UFO test report match Kansas at
// 91% 'Shadow figure' because both descriptions contained the word
// 'shadow' or 'dark'. The fix has two parts: (1) require ≥2 distinct
// keyword hits before a sensory label activates, and (2) gate the
// most cross-category-prone labels (Shadow figure, Craft / Vehicle,
// Bedroom) to the categories they actually describe.
interface SensoryLabelConfig {
  keywords: string[]
  /** Categories where this label is allowed to surface. Empty = all. */
  categories?: string[]
  /** Min distinct keyword hits required to activate. Default 2. */
  minHits?: number
}

var SENSORY_LABELS: Record<string, SensoryLabelConfig> = {
  'Shadow figure':        { keywords: ['shadow figure', 'shadow person', 'shadow man', 'shadow people', 'silhouette', 'humanoid figure', 'figure standing', 'figure in the doorway'], minHits: 1, categories: ['ghosts_hauntings', 'cryptids', 'perception_sensory'] },
  'Paralysis':            { keywords: ['paralyzed', 'paralysis', "couldn't move", 'couldnt move', 'frozen in place', 'pinned to the bed', 'unable to move'], minHits: 1 },
  'Dread / Fear':         { keywords: ['dread', 'terror', 'terrified', 'panicked', 'overwhelming fear', 'sense of evil'], minHits: 1 },
  'Nighttime':            { keywords: ['night', '3am', '2am', '4am', 'midnight', 'bedtime', 'asleep', 'after dark', 'late at night'], minHits: 2 },
  'Bedroom':              { keywords: ['bedroom', 'in bed', 'sleeping', 'woke up', 'doorway of the bedroom', 'foot of the bed'], minHits: 1, categories: ['ghosts_hauntings', 'perception_sensory', 'consciousness_practices', 'psychological_experiences'] },
  'Sound':                { keywords: ['voice', 'whisper', 'footsteps', 'banging', 'knocking', 'humming sound', 'strange noise'], minHits: 1 },
  'Light':                { keywords: ['bright light', 'glowing', 'orb', 'illuminated', 'beam of light', 'flash of light'], minHits: 1 },
  'Duration short':       { keywords: ['few seconds', 'a second', 'momentary', 'instantly', 'lasted seconds'], minHits: 1 },
  'Duration medium':      { keywords: ['few minutes', 'several minutes', 'lasted minutes', '10 minutes', '15 minutes'], minHits: 1 },
  'Multiple witnesses':   { keywords: ['both saw', 'we all saw', 'everyone saw', 'others saw', 'my friend saw', 'we watched together'], minHits: 1 },
  'Physical evidence':    { keywords: ['burn marks', 'footprint', 'physical evidence', 'photograph', 'recorded it', 'video proof', 'scorch'], minHits: 1 },
  'Recurring':            { keywords: ['happened again', 'recurring', 'multiple times', 'keeps happening', 'happens often', 'second time'], minHits: 1 },
  'Entity aware':         { keywords: ['stared at me', 'looked at me', 'watched me', 'aware of me', 'turned toward', 'made eye contact'], minHits: 1 },
  'Temperature':          { keywords: ['freezing', 'sudden cold', 'icy', 'temperature dropped', 'heat wave', 'unusually warm'], minHits: 1 },
  'Electromagnetic':      { keywords: ['static electricity', 'hair stood', 'tingling', 'interference', 'battery drained', 'electronics failed'], minHits: 1 },
  'Out of body':          { keywords: ['out of body', 'looking down at myself', 'floating above', 'detached from', 'hovering above my body'], minHits: 1, categories: ['consciousness_practices', 'psychological_experiences'] },
  // V11.17.32 PR-2.1 — Shape-specific UFO labels. Replaced single
  // generic 'Craft / Vehicle' with shape-discriminating labels so
  // a triangle UFO matches other triangles, not just "any craft."
  // User feedback (Bug #88): all 11 strong matches for a triangle
  // UFO came back as 'Craft / Vehicle' with no specific shape match.
  // Now: jaccard intersects only on shape-aligned labels, so cross-
  // shape matches lose their sensory contribution (~0.137) — which
  // is correct: a disc UFO and a triangle UFO aren't the same thing.
  'Triangle / Chevron UFO': { keywords: ['triangle craft', 'triangular ufo', 'triangle ufo', 'inverted triangle', 'flying triangle', 'black triangle', 'chevron', 'chevron-shaped', 'v-shaped craft', 'v formation', 'arrowhead'], minHits: 1, categories: ['ufos_aliens'] },
  'Disc / Saucer UFO':      { keywords: ['disc-shaped', 'disc shaped', 'saucer', 'saucer-shaped', 'flying saucer', 'flying disc', 'disk-shaped', 'dish-shaped', 'plate-shaped', 'classic ufo'], minHits: 1, categories: ['ufos_aliens'] },
  'Sphere / Orb UFO':       { keywords: ['sphere', 'spherical craft', 'orb', 'glowing orb', 'ball of light', 'ball-shaped', 'round craft', 'plasma orb', 'red orb', 'white orb', 'glowing sphere'], minHits: 1, categories: ['ufos_aliens'] },
  'Cigar / Cylinder UFO':   { keywords: ['cigar-shaped', 'cigar shaped', 'cylinder', 'cylindrical craft', 'cigar ufo', 'tube-shaped', 'tubular craft'], minHits: 1, categories: ['ufos_aliens'] },
  'Tic Tac UFO':            { keywords: ['tic tac', 'tic-tac', 'tictac', 'pill-shaped', 'pill shaped', 'lozenge'], minHits: 1, categories: ['ufos_aliens'] },
  'Diamond / Boomerang UFO': { keywords: ['diamond formation', 'diamond-shaped', 'boomerang', 'boomerang-shaped'], minHits: 1, categories: ['ufos_aliens'] },
  // Generic motion/behavior — applies across shapes and is still
  // useful for matching "silent hovering UFOs of any shape" → kept
  // as a lower-priority companion label.
  'Silent hover':           { keywords: ['silent craft', 'hovering craft', 'hovered silently', 'object hovered', 'hovered in place', 'completely silent', 'no sound', 'made no noise'], minHits: 1, categories: ['ufos_aliens'] },
  'Light formation':        { keywords: ['formation of lights', 'lights at each corner', 'lights at the corners', 'light at each corner', 'lights at the points', 'lights at the tips'], minHits: 1, categories: ['ufos_aliens'] },
}

// Back-compat alias — preserved so any older import sites keep working.
var SENSORY_KEYWORDS: Record<string, string[]> = Object.keys(SENSORY_LABELS).reduce(function (acc, k) {
  acc[k] = SENSORY_LABELS[k].keywords
  return acc
}, {} as Record<string, string[]>)

function countDistinctHits(lower: string, keywords: string[]): number {
  var hits = 0
  for (var i = 0; i < keywords.length; i++) {
    if (lower.indexOf(keywords[i]) !== -1) hits++
  }
  return hits
}

function extractSensoryProfile(text: string, category?: string | null): Set<string> {
  if (!text) return new Set()
  var lower = text.toLowerCase()
  var matched = new Set<string>()
  Object.keys(SENSORY_LABELS).forEach(function(label) {
    var cfg = SENSORY_LABELS[label]
    if (cfg.categories && category && cfg.categories.indexOf(category) === -1) return
    var minHits = typeof cfg.minHits === 'number' ? cfg.minHits : 2
    var hits = countDistinctHits(lower, cfg.keywords)
    if (hits >= minHits) matched.add(label)
  })
  return matched
}

// ── Match dimension computation ───────────────────────────────────────────

interface MatchDimResult {
  label: string
  score: number
}

function computeMatchDimensions(
  source: {
    category: string
    type_name: string | null
    lat: number | null
    lng: number | null
    event_date: string | null
    description: string
    sensory: Set<string>
    tokens: Set<string>
  },
  target: {
    category: string
    type_name: string | null
    lat: number | null
    lng: number | null
    event_date: string | null
    description: string | null
  }
): { overall: number; dimensions: MatchDimResult[] } {
  var dims: MatchDimResult[] = []

  // 1. Category match (weight: 0.25)
  //
  // V11.17.31 PR-2 — raised no-type-match score from 0.7 to 0.85.
  // Bug #88 panel review: most user reports don't get a specific
  // phenomenon_type set at onboarding (the picker is optional), and
  // most archive reports don't either, so the category-only path was
  // hit constantly while permanently capped at 0.7 × 0.25 = 0.175.
  // Since we ALREADY pre-filter the candidate query by category,
  // a category match is itself a strong signal — bumping to 0.85
  // moves the typical user's top matches above the 0.4 Strong-match
  // threshold without inflating cross-category noise (which can't
  // happen — non-matching categories still score 0).
  var catScore = 0
  if (source.category === target.category) {
    catScore = 0.85
    if (source.type_name && target.type_name && source.type_name === target.type_name) {
      catScore = 1.0
    }
  }
  dims.push({ label: 'Phenomenon type', score: catScore })

  // 2. Location proximity (weight: 0.15)
  var locScore = 0
  if (source.lat && source.lng && target.lat && target.lng) {
    var dist = haversine(source.lat, source.lng, target.lat, target.lng)
    if (dist < 10) locScore = 1.0
    else if (dist < 50) locScore = 0.85
    else if (dist < 150) locScore = 0.65
    else if (dist < 500) locScore = 0.4
    else if (dist < 1500) locScore = 0.2
    else locScore = 0.05
  }
  dims.push({ label: 'Location proximity', score: locScore })

  // 3. Temporal proximity (weight: 0.1)
  var timeScore = 0
  if (source.event_date && target.event_date) {
    var d1 = new Date(source.event_date).getTime()
    var d2 = new Date(target.event_date).getTime()
    var daysDiff = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)
    if (daysDiff < 7) timeScore = 1.0
    else if (daysDiff < 30) timeScore = 0.8
    else if (daysDiff < 180) timeScore = 0.5
    else if (daysDiff < 365) timeScore = 0.3
    else if (daysDiff < 1825) timeScore = 0.15
    else timeScore = 0.05
  }
  dims.push({ label: 'Time period', score: timeScore })

  // 4. Content / description similarity (weight: 0.25)
  var targetTokens = tokenize(target.description || '')
  var contentScore = jaccardSimilarity(source.tokens, targetTokens)
  // V11.17.31 PR-2 — boost raised 2.5x → 3.5x. Short user reports
  // (~200-400 chars) compared against typical archive reports
  // (~600-2000 chars) get punished by the union denominator in
  // jaccard; the bigger boost compensates so a meaningful overlap
  // (~10-15% raw jaccard) lands as a real ~0.4 contribution.
  contentScore = Math.min(contentScore * 3.5, 1.0)
  dims.push({ label: 'Description similarity', score: contentScore })

  // 5. Sensory overlap (weight: 0.25)
  var targetSensory = extractSensoryProfile(target.description || '', target.category)
  var sensoryScore = jaccardSimilarity(source.sensory, targetSensory)
  // V11.17.31 PR-2 — boost raised 2.0x → 2.5x. Sensory profile
  // extraction is conservative (minHits=1 or 2 with narrow keyword
  // lists), so true overlap is small even when reports describe
  // identical sensory events. The bigger boost rewards genuine
  // overlap without inflating unrelated matches (which still produce
  // empty intersections and score 0).
  sensoryScore = Math.min(sensoryScore * 2.5, 1.0)

  // Build specific sensory dimension labels
  var sharedSensory: string[] = []
  source.sensory.forEach(function(s) { if (targetSensory.has(s)) sharedSensory.push(s) })
  if (sharedSensory.length > 0) {
    sharedSensory.slice(0, 3).forEach(function(s) {
      dims.push({ label: s, score: sensoryScore })
    })
  } else {
    dims.push({ label: 'Sensory overlap', score: sensoryScore })
  }

  // V11.17.31 PR-2 — Weighted overall score with null-event-date
  // redistribution. When the source report has no event_date set
  // (the picker is optional during onboarding), the temporal axis
  // can never contribute and silently caps total score at 0.90.
  // We redistribute its 0.10 weight proportionally to the other
  // four axes so users without an event date aren't penalized for
  // a missing field. Same redistribution when target has no event
  // date — symmetric.
  var weightCat = 0.25, weightLoc = 0.15, weightTime = 0.10, weightContent = 0.25, weightSensory = 0.25
  if (!source.event_date || !target.event_date) {
    // 0.10 / 4 = 0.025 redistributed to each of the other axes
    var bonus = weightTime / 4
    weightCat += bonus
    weightLoc += bonus
    weightContent += bonus
    weightSensory += bonus
    weightTime = 0
  }
  var overall = catScore * weightCat + locScore * weightLoc + timeScore * weightTime +
    contentScore * weightContent + sensoryScore * weightSensory

  // V11.17.34 PR-4-a — Corroborated boolean (Bug #91 panel review).
  // Replaces the Strong-matches chip with an inline glyph. A match
  // is "corroborated" when AT LEAST 2 NON-CATEGORY dimensions score
  // ≥ 0.5 AND the overall score is ≥ 0.45. Category alone doesn't
  // count toward corroboration because candidates are already
  // pre-filtered by category in the query — category match is table
  // stakes, not a signal of true similarity. This prevents the
  // "Houston UFO scoring 0.45 from category-plus-noise" false-
  // positive that the old 0.4-threshold chip surfaced.
  var nonCatStrongDims = 0
  if (locScore >= 0.5) nonCatStrongDims++
  if (timeScore >= 0.5) nonCatStrongDims++
  if (contentScore >= 0.5) nonCatStrongDims++
  if (sensoryScore >= 0.5) nonCatStrongDims++
  var corroborated = nonCatStrongDims >= 2 && overall >= 0.45

  // Only return the top 4 dimensions for the UI
  dims.sort(function(a, b) { return b.score - a.score })
  var topDims = dims.slice(0, 4)

  return { overall: overall, dimensions: topDims, corroborated: corroborated } as any
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Optional auth — determines how many results are unlocked
  var token = (req.headers.authorization || '').replace('Bearer ', '')
  var userId: string | null = null
  var isPro = false
  if (token) {
    var { data: userData } = await supabase.auth.getUser(token)
    if (userData?.user) {
      userId = userData.user.id
      // QA #1 (V10.2) — Actually check tier + admin role so paid /
      // admin users aren't paywalled at FREE_UNLOCKED. Previously
      // this was a TODO and admins saw locked matches in /lab RADAR.
      try {
        var profResp = await supabase
          .from('profiles')
          .select('role, subscription_tier')
          .eq('id', userId)
          .single()
        var prof = profResp && (profResp.data as any)
        if (prof) {
          var role = prof.role
          var tier = prof.subscription_tier
          // V10.2 — enterprise tier deprecated (kept admin role only).
          if (role === 'admin' || tier === 'basic' || tier === 'pro') {
            isPro = true
          }
        }
      } catch (_) { /* leave isPro=false if profile lookup fails */ }
    }
  }

  var reportId = req.query.report_id as string | undefined
  var category = req.query.category as string | undefined
  var typeName = req.query.type_name as string | undefined
  var lat = req.query.lat ? parseFloat(req.query.lat as string) : null
  var lng = req.query.lng ? parseFloat(req.query.lng as string) : null
  var description = req.query.description as string | undefined
  var limit = Math.min(parseInt(req.query.limit as string) || MAX_RESULTS, MAX_RESULTS)

  // If report_id provided, fetch that report's attributes
  var sourceReport: any = null
  if (reportId) {
    var { data: rpt } = await supabase
      .from('reports')
      .select('*, phenomenon_type:phenomenon_types(name, category)')
      .eq('id', reportId)
      .single()

    if (rpt) {
      sourceReport = rpt
      category = category || rpt.category
      typeName = typeName || rpt.phenomenon_type?.name
      lat = lat || rpt.latitude
      lng = lng || rpt.longitude
      description = description || rpt.description || rpt.summary || ''
    }
  }

  if (!category && !description) {
    return res.status(400).json({ error: 'Provide report_id, category, or description' })
  }

  // Build source profile for matching
  var sourceProfile = {
    category: category || '',
    type_name: typeName || null,
    lat: lat,
    lng: lng,
    event_date: sourceReport?.event_date || null,
    description: description || '',
    sensory: extractSensoryProfile(description || '', category || null),
    tokens: tokenize(description || ''),
  }

  // Query candidates — get more than needed, we'll score and sort
  var query = supabase
    .from('reports')
    .select(`
      id, title, slug, category, summary, description,
      location_description, city, state_province, country,
      latitude, longitude, event_date, event_time,
      witness_count, has_physical_evidence, has_photo_video,
      source_type, source_url, source_reference,
      credibility,
      phenomenon_type:phenomenon_types(name)
    `)
    .eq('status', 'approved')
    .limit(200)

  // Prioritize same category but also fetch nearby categories
  if (category) {
    query = query.eq('category', category)
  }

  // Exclude the source report itself
  if (reportId) {
    query = query.neq('id', reportId)
  }

  var { data: candidates, error } = await query

  if (error) {
    console.error('Match query error:', error)
    return res.status(500).json({ error: 'Failed to query candidates' })
  }

  if (!candidates || candidates.length === 0) {
    // Try broader search without category filter
    var { data: broadCandidates } = await supabase
      .from('reports')
      .select(`
        id, title, slug, category, summary, description,
        location_description, city, state_province, country,
        latitude, longitude, event_date, event_time,
        witness_count, has_physical_evidence, has_photo_video,
        source_type, source_url, source_reference,
        credibility,
        phenomenon_type:phenomenon_types(name)
      `)
      .eq('status', 'approved')
      .limit(100)

    if (reportId && broadCandidates) {
      broadCandidates = broadCandidates.filter(function(c) { return c.id !== reportId })
    }
    candidates = broadCandidates || []
  }

  // Score each candidate
  var scored = candidates.map(function(c) {
    var result = computeMatchDimensions(sourceProfile, {
      category: c.category,
      type_name: c.phenomenon_type?.name || null,
      lat: c.latitude,
      lng: c.longitude,
      event_date: c.event_date,
      description: c.description || c.summary || '',
    })

    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      category: c.category,
      type_name: c.phenomenon_type?.name || c.category,
      location_description: c.location_description,
      city: c.city,
      state_province: c.state_province,
      country: c.country,
      latitude: c.latitude,
      longitude: c.longitude,
      event_date: c.event_date,
      event_time: c.event_time,
      summary: c.summary,
      description: c.description,
      witness_count: c.witness_count,
      has_physical_evidence: c.has_physical_evidence,
      has_photo_video: c.has_photo_video,
      source_type: c.source_type,
      source_url: c.source_url,
      source_reference: c.source_reference,
      credibility: c.credibility,
      match_score: result.overall,
      match_dimensions: result.dimensions,
      // V11.17.34 PR-4-a — corroborated boolean (Bug #91). True when
      // at least 2 non-category dimensions scored ≥0.5 AND overall
      // ≥0.45. UI uses this to render an inline "* Strong match"
      // glyph in place of the removed Strong filter chip.
      corroborated: (result as any).corroborated || false,
      locked: false,  // will be set below
    }
  })

  // Sort by match score descending
  scored.sort(function(a, b) { return b.match_score - a.match_score })

  // Take top N
  var topMatches = scored.slice(0, limit)

  // Apply locking — first FREE_UNLOCKED are unlocked, rest are locked
  var unlockLimit = isPro ? limit : FREE_UNLOCKED
  topMatches.forEach(function(m, i) {
    m.locked = i >= unlockLimit
  })

  // Summary stats
  var matchCount = topMatches.filter(function(m) { return m.match_score >= 0.3 }).length
  var nearbyCount = topMatches.filter(function(m) { return m.match_score >= 0.5 && !m.locked }).length
  var strongCount = topMatches.filter(function(m) { return m.match_score >= 0.7 }).length

  // Get total database count for social proof
  var { count: totalReports } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')

  return res.status(200).json({
    matches: topMatches,
    stats: {
      total_matched: matchCount,
      nearby: nearbyCount,
      strong: strongCount,
      total_database: totalReports || 0,
    },
    source: {
      category: category,
      type_name: typeName,
      location: sourceReport?.location_description || null,
    },
  })
}

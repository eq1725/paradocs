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

  // V11.17.35 PR-5-b — Ghosts & hauntings: shape + behavior + entity
  // features. Currently the category had ZERO shape-specific sensory
  // labels — only the generic 'Multiple witnesses' / 'Temperature' /
  // 'Recurring' / 'Entity aware' applied. User feedback (Chase's
  // hypothetical "ghost-like face with red eyes flying at me in bed"
  // example): system should auto-recognize semantic features like
  // red eyes, face-shape, bedroom intrusion, intentional motion
  // toward witness. These labels surface those.
  'Red eyes':                  { keywords: ['red eyes', 'glowing red eyes', 'red orbs', 'red glow from its eyes', 'red eyes glowing', 'crimson eyes', 'eyes glowed red'], minHits: 1, categories: ['ghosts_hauntings', 'cryptids', 'religion_mythology'] },
  'Glowing eyes':              { keywords: ['glowing eyes', 'luminous eyes', 'shining eyes', 'eyes that glowed', 'bright eyes in the dark', 'eyes lit up'], minHits: 1, categories: ['ghosts_hauntings', 'cryptids', 'religion_mythology'] },
  'Face-like apparition':      { keywords: ['ghostly face', 'face appeared', 'disembodied face', 'face-like', 'face like', 'just a face', 'face in the dark', 'face hovering', 'face floating'], minHits: 1, categories: ['ghosts_hauntings', 'religion_mythology'] },
  // 'Shadow figure' already defined at line 108 above (broader coverage —
  // includes 'humanoid figure' / 'figure standing' / 'figure in the
  // doorway'). My ghost-specific variant would have duplicated it.
  'Full-body apparition':      { keywords: ['full-body apparition', 'full body apparition', 'solid figure', 'apparition standing', 'standing at the foot of', 'walked through the wall', 'translucent figure', 'see-through person', 'ghostly figure'], minHits: 1, categories: ['ghosts_hauntings'] },
  'Bedroom intrusion':         { keywords: ['in my bed', 'in my bedroom', 'foot of my bed', 'foot of the bed', 'by my bed', 'next to my bed', 'standing over me', 'standing above me', 'woke up to', 'woke up and saw', 'while i was sleeping', 'while i slept', 'in the middle of the night'], minHits: 1, categories: ['ghosts_hauntings', 'cryptids', 'consciousness_practices', 'psychological_experiences'] },
  'Entity moved toward witness': { keywords: ['flew at me', 'came at me', 'lunged at me', 'charged at me', 'rushed toward me', 'moved toward me', 'came right at me', 'came straight at me', 'approached me', 'reaching for me'], minHits: 1, categories: ['ghosts_hauntings', 'cryptids', 'religion_mythology'] },
  'Disembodied voice':         { keywords: ['heard a voice', 'voice in my head', 'voice with no source', 'voice from nowhere', 'spoke to me', 'whispered my name', 'called my name', 'audible whisper', 'evp', 'electronic voice phenomenon'], minHits: 1, categories: ['ghosts_hauntings', 'psychic_phenomena', 'religion_mythology'] },
  'Cold spot':                 { keywords: ['cold spot', 'sudden cold', 'temperature dropped', 'air went cold', 'icy chill', 'freezing patch', 'cold patch'], minHits: 1, categories: ['ghosts_hauntings'] },
  'Object movement':           { keywords: ['object moved on its own', 'moved by itself', 'flew across the room', 'shelf fell', 'objects flew', 'doors opened', 'cabinet door opened', 'thrown across the room', 'objects rearranged'], minHits: 1, categories: ['ghosts_hauntings', 'esoteric_practices'] },

  // Cryptids: morphology + behavior
  'Tall humanoid':             { keywords: ['7 feet tall', '8 feet tall', '9 feet tall', 'seven feet tall', 'eight feet tall', 'towering figure', 'massive humanoid', 'taller than any man', 'tall figure'], minHits: 1, categories: ['cryptids'] },
  'Hair / fur covered':        { keywords: ['covered in hair', 'covered in fur', 'matted fur', 'thick fur', 'shaggy', 'hairy creature', 'fur all over', 'thick coat'], minHits: 1, categories: ['cryptids'] },
  'Bipedal animal':            { keywords: ['walked upright', 'on two legs', 'bipedal', 'standing on hind legs', 'walked like a person', 'human-like gait'], minHits: 1, categories: ['cryptids'] },
  'Skinwalker / shapeshifter': { keywords: ['skinwalker', 'shapeshifter', 'shape-shifter', 'shape shifted', 'changed form', 'became something else', 'transformed in front'], minHits: 1, categories: ['cryptids', 'religion_mythology'] },
  'Bone-pale appearance':      { keywords: ['pale as bone', 'corpse-pale', 'sickly pale', 'translucent skin', 'no pigment'], minHits: 1, categories: ['cryptids', 'ghosts_hauntings'] },

  // Consciousness practices / NDE
  'Tunnel of light':           { keywords: ['tunnel of light', 'light at the end of the tunnel', 'long tunnel', 'rushing through a tunnel', 'tunnel toward light'], minHits: 1, categories: ['consciousness_practices', 'psychological_experiences'] },
  'Life review':               { keywords: ['life review', 'my whole life flashed', 'every moment of my life', 'reviewed my life', 'life played back', 'panoramic memory'], minHits: 1, categories: ['consciousness_practices', 'psychological_experiences'] },
  'Departed loved ones':       { keywords: ['saw my grandmother', 'saw my grandfather', 'departed loved ones', 'family members who had passed', 'relatives who had died', 'my deceased mother', 'my deceased father', 'saw my dad who had passed', 'saw my mom who had passed'], minHits: 1, categories: ['consciousness_practices', 'psychological_experiences', 'religion_mythology'] },
  'Time dilation':             { keywords: ['time stood still', 'time slowed down', 'time stretched', 'time felt frozen', 'seemed to last forever', 'lost track of time'], minHits: 1, categories: ['consciousness_practices', 'perception_sensory', 'psychological_experiences'] },
  'Beings of light':           { keywords: ['being of light', 'beings of light', 'luminous being', 'radiant figure', 'figure made of light', 'glowing entity'], minHits: 1, categories: ['consciousness_practices', 'religion_mythology', 'psychological_experiences'] },

  // Psychic phenomena
  'Verifiable detail':         { keywords: ['turned out to be true', 'was confirmed', 'i later found out', 'next day i learned', 'i didn\'t know at the time', 'verified later', 'proved accurate'], minHits: 1, categories: ['psychic_phenomena'] },
  'Imminent vision':           { keywords: ['minutes before it happened', 'right before', 'just before the accident', 'an hour before', 'days before', 'foresaw'], minHits: 1, categories: ['psychic_phenomena'] },
  'Thought transmission':      { keywords: ['heard her thoughts', 'thought transmission', 'mind to mind', 'received the message', 'telepathic communication', 'knew what they were thinking'], minHits: 1, categories: ['psychic_phenomena'] },

  // Esoteric / occult practices
  'Ritual circle':             { keywords: ['cast a circle', 'circle of salt', 'protective circle', 'within the circle', 'pentagram on the floor', 'ritual circle'], minHits: 1, categories: ['esoteric_practices'] },
  'Spirit attachment':         { keywords: ['something followed me home', 'attachment after the session', 'felt watched ever since', 'hasn\'t left me alone', 'never the same after'], minHits: 1, categories: ['esoteric_practices', 'ghosts_hauntings'] },
  'Planchette movement':       { keywords: ['planchette moved', 'planchette flew', 'moved on its own', 'spelled out my name', 'spelled out a message', 'started moving fast'], minHits: 1, categories: ['esoteric_practices'] },
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

/**
 * V11.17.35 PR-5-c — cosine similarity helper for embedding-based
 * semantic matching. Reuses pgvector embeddings stored in vector_chunks.
 * Returns null when either side has no embedding (handled upstream
 * as weight-redistributed missing dimension).
 */
function cosineSimilarity(a: number[] | null | undefined, b: number[] | null | undefined): number | null {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return null
  var dot = 0, magA = 0, magB = 0
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return null
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
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
    embedding?: number[] | null  // V11.17.35 PR-5-c
  },
  target: {
    category: string
    type_name: string | null
    lat: number | null
    lng: number | null
    event_date: string | null
    description: string | null
    embedding?: number[] | null  // V11.17.35 PR-5-c
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

  // V11.17.35 PR-5-c — Semantic similarity dimension (cosine on
  // text-embedding-3-small vectors). Captures meaning beyond
  // keyword overlap: "triangular UFO" ≈ "black triangle" (~0.9),
  // "ghost-like face with red eyes flying at me in bed" ≈
  // "shadow figure with glowing red eyes that flew toward me while
  // I slept" (~0.85). Weight 0.20 — meaningful but not dominant.
  // Treated as missing when either side has no embedding (backfill
  // not yet run for that report); weight redistributes to other
  // dimensions same as null event_date pattern.
  var semCos = cosineSimilarity(source.embedding, target.embedding)
  var semanticScore = 0
  var hasSemantic = false
  if (semCos != null) {
    hasSemantic = true
    // Cosine of text-embedding-3-small typically sits in 0.3-0.7 range
    // for unrelated reports and 0.7-0.95 for genuinely-similar ones.
    // Linearly remap 0.50→0, 0.95→1.0 so a "neutral" similarity
    // doesn't dominate; truly similar reports get full credit.
    semanticScore = Math.max(0, Math.min(1, (semCos - 0.5) / 0.45))
    dims.push({ label: 'Semantic similarity', score: semanticScore })
  }

  // V11.17.31 PR-2 → V11.17.35 PR-5-c — Weighted overall score with
  // null-event-date AND null-embedding redistribution. When either
  // axis can't contribute (missing data on either side), its weight
  // redistributes proportionally to the remaining axes so users with
  // missing fields aren't silently penalized.
  var weightCat = 0.22, weightLoc = 0.13, weightTime = 0.08, weightContent = 0.20, weightSensory = 0.17, weightSemantic = 0.20
  // Redistribute weight from any dimensions that can't contribute
  var skippedWeight = 0
  if (!source.event_date || !target.event_date) { skippedWeight += weightTime; weightTime = 0 }
  if (!hasSemantic) { skippedWeight += weightSemantic; weightSemantic = 0 }
  if (skippedWeight > 0) {
    // Count active dimensions to split bonus
    var activeCount = (weightTime > 0 ? 1 : 0) + (weightSemantic > 0 ? 1 : 0) + 4  // 4 = cat+loc+content+sensory always active
    var bonus = skippedWeight / activeCount
    weightCat += bonus
    weightLoc += bonus
    weightContent += bonus
    weightSensory += bonus
    if (weightTime > 0) weightTime += bonus
    if (weightSemantic > 0) weightSemantic += bonus
  }
  var overall = catScore * weightCat + locScore * weightLoc + timeScore * weightTime +
    contentScore * weightContent + sensoryScore * weightSensory + semanticScore * weightSemantic

  // V11.17.34 PR-4-a → V11.17.35 PR-5-a — Corroborated boolean.
  // Original rule (≥2 non-cat dims ≥0.5) was too strict when one
  // dimension is structurally zero (e.g., a target report with no
  // coords zeros out location; a source with null event_date zeros
  // out time). Loosened to recognize EITHER a single very strong
  // dim (≥0.7) OR two decent dims (≥0.5). Category still doesn't
  // count toward corroboration (already pre-filtered = table stakes).
  // Concretely: Lumberton TX triangle (null event_date) vs Black
  // Triangle TX (null coords) shares perfect shape sensory (1.0) +
  // decent content — now qualifies on the "single very strong dim"
  // path even though only 1 non-cat dim crosses 0.5.
  var nonCatStrongDims = 0      // dims ≥ 0.5
  var nonCatVeryStrongDims = 0  // dims ≥ 0.7
  if (locScore >= 0.5) nonCatStrongDims++
  if (locScore >= 0.7) nonCatVeryStrongDims++
  if (timeScore >= 0.5) nonCatStrongDims++
  if (timeScore >= 0.7) nonCatVeryStrongDims++
  if (contentScore >= 0.5) nonCatStrongDims++
  if (contentScore >= 0.7) nonCatVeryStrongDims++
  if (sensoryScore >= 0.5) nonCatStrongDims++
  if (sensoryScore >= 0.7) nonCatVeryStrongDims++
  // V11.17.35 PR-5-c — semantic dimension counts toward corroboration
  // when present
  if (hasSemantic && semanticScore >= 0.5) nonCatStrongDims++
  if (hasSemantic && semanticScore >= 0.7) nonCatVeryStrongDims++
  var corroborated = (nonCatVeryStrongDims >= 1 || nonCatStrongDims >= 2) && overall >= 0.4

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

  // V11.17.35 PR-5-c — Fetch embeddings for source + all candidates
  // in a single batch query so the per-candidate scoring loop can
  // include semantic similarity. Missing embeddings (backfill not
  // yet run for that report) are handled by computeMatchDimensions's
  // weight redistribution — no error path, gracefully degrades to
  // 5-dimension scoring.
  var embeddingMap = new Map<string, number[]>()
  var allEmbedIds: string[] = []
  if (reportId) allEmbedIds.push(reportId)
  for (var ci = 0; ci < candidates.length; ci++) allEmbedIds.push(candidates[ci].id)
  if (allEmbedIds.length > 0) {
    // vector_chunks holds 1+ chunks per report; take the first chunk
    // for now (most reports have a single chunk since they're under
    // the MAX_CHUNK_TOKENS limit). For longer reports later we can
    // average chunk embeddings.
    try {
      // Chunk into 500-ID batches to stay under PostgREST IN() limit
      for (var ei = 0; ei < allEmbedIds.length; ei += 500) {
        var idChunk = allEmbedIds.slice(ei, ei + 500)
        var { data: chunks } = await supabase
          .from('vector_chunks')
          .select('source_id, chunk_index, embedding')
          .eq('source_table', 'report')
          .in('source_id', idChunk)
          .order('chunk_index', { ascending: true })
        if (chunks) {
          for (var ck = 0; ck < chunks.length; ck++) {
            var row = chunks[ck] as any
            // Only keep first chunk per report (chunk_index=0 by sort)
            if (embeddingMap.has(row.source_id)) continue
            var vec = row.embedding
            // pgvector returns as string '[a,b,c,...]' OR as array
            // depending on Supabase client version
            if (typeof vec === 'string') {
              try {
                vec = JSON.parse(vec)
              } catch (_) {
                // Try comma-split fallback (rare)
                vec = vec.replace(/^\[|\]$/g, '').split(',').map(function (s: string) { return parseFloat(s) })
              }
            }
            if (Array.isArray(vec)) embeddingMap.set(row.source_id, vec as number[])
          }
        }
      }
    } catch (e) {
      console.warn('[match] embedding batch fetch failed (continuing without semantic):', (e as any)?.message || e)
    }
  }
  var sourceEmbedding = reportId ? (embeddingMap.get(reportId) || null) : null

  // Score each candidate
  var scored = candidates.map(function(c) {
    var result = computeMatchDimensions(Object.assign({}, sourceProfile, { embedding: sourceEmbedding }), {
      category: c.category,
      type_name: c.phenomenon_type?.name || null,
      lat: c.latitude,
      lng: c.longitude,
      event_date: c.event_date,
      description: c.description || c.summary || '',
      embedding: embeddingMap.get(c.id) || null,
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

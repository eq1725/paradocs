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

var SENSORY_KEYWORDS: Record<string, string[]> = {
  'Shadow figure':        ['shadow', 'dark', 'figure', 'silhouette', 'tall', 'black', 'shape', 'humanoid'],
  'Paralysis':            ['paralyzed', 'paralysis', 'couldnt move', 'frozen', 'unable', 'pinned'],
  'Dread / Fear':         ['dread', 'terror', 'fear', 'terrified', 'scared', 'panic', 'evil'],
  'Nighttime':            ['night', '3am', '2am', '4am', 'dark', 'midnight', 'bedtime', 'asleep'],
  'Bedroom':              ['bed', 'bedroom', 'room', 'doorway', 'sleeping', 'woke'],
  'Sound':                ['sound', 'noise', 'voice', 'whisper', 'footsteps', 'bang', 'knock'],
  'Light':                ['light', 'glow', 'bright', 'flash', 'orb', 'illuminated', 'beam'],
  'Duration short':       ['seconds', 'brief', 'instant', 'momentary', 'quick', 'flash'],
  'Duration medium':      ['minutes', 'few minutes', 'several minutes', 'lasted'],
  'Multiple witnesses':   ['witnesses', 'both saw', 'we all', 'everyone', 'others saw', 'friend saw'],
  'Physical evidence':    ['evidence', 'marks', 'burns', 'footprint', 'photograph', 'video', 'recording'],
  'Recurring':            ['again', 'recurring', 'multiple times', 'happened before', 'keeps happening'],
  'Entity aware':         ['watched', 'stared', 'looked at me', 'aware', 'intelligent', 'intentional'],
  'Temperature':          ['cold', 'freezing', 'chill', 'warm', 'heat', 'temperature'],
  'Electromagnetic':      ['static', 'electric', 'tingling', 'hair stood', 'interference', 'battery'],
  'Out of body':          ['floating', 'above', 'looking down', 'out of body', 'detached', 'hovering'],
  'Craft / Vehicle':      ['craft', 'triangle', 'disc', 'saucer', 'hovering', 'silent', 'formation'],
}

function extractSensoryProfile(text: string): Set<string> {
  if (!text) return new Set()
  var lower = text.toLowerCase()
  var matched = new Set<string>()
  Object.keys(SENSORY_KEYWORDS).forEach(function(label) {
    var keywords = SENSORY_KEYWORDS[label]
    var found = keywords.some(function(kw) { return lower.includes(kw) })
    if (found) matched.add(label)
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
  var catScore = 0
  if (source.category === target.category) {
    catScore = 0.7
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
  // Boost for longer matching (more meaningful overlap)
  contentScore = Math.min(contentScore * 2.5, 1.0)
  dims.push({ label: 'Description similarity', score: contentScore })

  // 5. Sensory overlap (weight: 0.25)
  var targetSensory = extractSensoryProfile(target.description || '')
  var sensoryScore = jaccardSimilarity(source.sensory, targetSensory)
  // Boost for sensory matches (these are more meaningful)
  sensoryScore = Math.min(sensoryScore * 2.0, 1.0)

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

  // Weighted overall score
  var overall = catScore * 0.25 + locScore * 0.15 + timeScore * 0.1 +
    contentScore * 0.25 + sensoryScore * 0.25

  // Only return the top 4 dimensions for the UI
  dims.sort(function(a, b) { return b.score - a.score })
  var topDims = dims.slice(0, 4)

  return { overall: overall, dimensions: topDims }
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
    sensory: extractSensoryProfile(description || ''),
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

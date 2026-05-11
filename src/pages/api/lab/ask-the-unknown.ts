/**
 * POST /api/lab/ask-the-unknown
 *
 * V9.13 Phase 3.A — single-turn Q&A about the user's own report or
 * the broader archive. Auth required; rate-limited per-user per-day
 * to keep Sonnet costs bounded.
 *
 * Body: { question: string }
 * Returns: { answer, citations: [{ id, slug, title }], refused, refusal_reason }
 *
 * Behavior:
 *   1. Auth check.
 *   2. Load the user's most recent report.
 *   3. Read cached fingerprint/cluster/context from
 *      your_signal_insights (if present) — supplies pre-computed
 *      grounding to Sonnet without re-running the deterministic
 *      generators.
 *   4. Build a small corpus of relevant reports (up to 10):
 *        - same phenomenon_type, recent, approved
 *        - PLUS up to 4 nearby reports (if user has location)
 *        - PLUS the user's own report
 *      Citations are constrained to these IDs.
 *   5. Call askTheUnknown(). Strip hallucinated citations.
 *   6. Resolve cited IDs to {id, slug, title} for the client.
 *
 * Cost: ~\$0.02 per question (1500–2500 input tokens + 200 output
 * at Sonnet 4.6 pricing). Rate-limited to 20/day per user.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { askTheUnknown, CorpusItem } from '@/lib/services/ask-the-unknown.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var MAX_QUESTION_LEN = 500
var MIN_QUESTION_LEN = 3
var CLUSTER_RADIUS_MI = 100
var DAILY_LIMIT_PER_USER = 20

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var question = String((req.body && req.body.question) || '').trim()
  if (question.length < MIN_QUESTION_LEN) return res.status(400).json({ error: 'Question is too short.' })
  if (question.length > MAX_QUESTION_LEN) return res.status(400).json({ error: 'Question is too long (max ' + MAX_QUESTION_LEN + ' chars).' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // --- Rate limit -------------------------------------------------
  // Cheap counter via the cached your_signal_insights table:
  // we re-use the cache audit fields (ai_cost_usd > 0 implies a
  // Sonnet call from this user). For the rate limit we count
  // anything we logged in the last 24h, including ask history rows
  // (table optional — fail-open if missing).
  var dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    var historyResult = await svc.from('ask_the_unknown_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', dayAgo)
    var todayCount = (historyResult && historyResult.count) || 0
    if (todayCount >= DAILY_LIMIT_PER_USER) {
      return res.status(429).json({ error: 'You\'ve reached today\'s ask limit (' + DAILY_LIMIT_PER_USER + '). Try again tomorrow.' })
    }
  } catch (_) { /* table missing or unreachable — fail open */ }

  // --- User report ------------------------------------------------
  var reportResult = await svc.from('reports')
    .select('id, slug, title, phenomenon_type_id, category, latitude, longitude, event_date, has_photo_video, witness_count, description, summary, location_description, city, state_province, country')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  var userReport = reportResult.data
  if (!userReport) {
    return res.status(200).json({
      answer: 'You haven\'t shared an experience yet. Share one from /start and ask me anything about it once it\'s in the archive.',
      citations: [],
      refused: true,
      refusal_reason: 'no_report',
    })
  }

  // --- Pre-computed Card 1/2/4 payloads (if cached) ---------------
  var fingerprint: any = null
  var cluster: any = null
  var context: any = null
  try {
    var cacheResult = await svc.from('your_signal_insights')
      .select('fingerprint_payload, cluster_payload, context_payload')
      .eq('user_id', user.id)
      .eq('report_id', userReport.id)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .single()
    if (cacheResult.data) {
      fingerprint = cacheResult.data.fingerprint_payload
      cluster = cacheResult.data.cluster_payload
      context = cacheResult.data.context_payload
    }
  } catch (_) { /* no cached row — Sonnet has less context but still works */ }

  // --- Phenomenon type name (for prompt) --------------------------
  var typeName: string | null = null
  if (userReport.phenomenon_type_id) {
    try {
      var t = await svc.from('phenomenon_types').select('name').eq('id', userReport.phenomenon_type_id).single()
      typeName = (t && t.data && t.data.name) || null
    } catch (_) { /* ignore */ }
  }

  // --- Corpus assembly --------------------------------------------
  // (a) Same phenomenon_type, recent, approved — up to 6
  var corpus: CorpusItem[] = []
  var seenIds: Record<string, boolean> = {}

  function addToCorpus(row: any) {
    if (!row || !row.id || seenIds[row.id]) return
    seenIds[row.id] = true
    corpus.push({
      id: row.id,
      slug: row.slug,
      title: row.title || '(untitled)',
      category: row.category,
      type_name: typeName, // we only know the user's type here; fine for V1
      event_date: row.event_date,
      location: row.location_description || [row.city, row.state_province, row.country].filter(function (s: any) { return !!s }).join(', ') || null,
      summary: row.summary || row.description || null,
    })
  }

  if (userReport.phenomenon_type_id) {
    var typeMatches = await svc.from('reports')
      .select('id, slug, title, category, event_date, location_description, city, state_province, country, summary, description')
      .eq('phenomenon_type_id', userReport.phenomenon_type_id)
      .eq('status', 'approved')
      .neq('id', userReport.id)
      .order('created_at', { ascending: false })
      .limit(6)
    ;((typeMatches && typeMatches.data) || []).forEach(addToCorpus)
  } else if (userReport.category) {
    var catMatches = await svc.from('reports')
      .select('id, slug, title, category, event_date, location_description, city, state_province, country, summary, description')
      .eq('category', userReport.category)
      .eq('status', 'approved')
      .neq('id', userReport.id)
      .order('created_at', { ascending: false })
      .limit(6)
    ;((catMatches && catMatches.data) || []).forEach(addToCorpus)
  }

  // (b) Nearby — up to 4 more
  if (typeof userReport.latitude === 'number' && typeof userReport.longitude === 'number') {
    var lat = userReport.latitude
    var lng = userReport.longitude
    var latDelta = CLUSTER_RADIUS_MI / 69
    var lngDelta = CLUSTER_RADIUS_MI / (69 * Math.cos(lat * Math.PI / 180) || 1)
    var nearby = await svc.from('reports')
      .select('id, slug, title, category, latitude, longitude, event_date, location_description, city, state_province, country, summary, description')
      .eq('status', 'approved')
      .neq('id', userReport.id)
      .gte('latitude', lat - latDelta)
      .lte('latitude', lat + latDelta)
      .gte('longitude', lng - lngDelta)
      .lte('longitude', lng + lngDelta)
      .order('created_at', { ascending: false })
      .limit(50)
    var nearbyRows: any[] = (nearby && nearby.data) || []
    var added = 0
    for (var i = 0; i < nearbyRows.length && added < 4; i++) {
      var r = nearbyRows[i]
      if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
      if (haversineMi(lat, lng, r.latitude, r.longitude) <= CLUSTER_RADIUS_MI && !seenIds[r.id]) {
        addToCorpus(r)
        added++
      }
    }
  }

  // (c) The user's own report — for self-referential answers
  addToCorpus(userReport)

  // --- Call Sonnet -----------------------------------------------
  var result = await askTheUnknown({
    question: question,
    userReport: {
      title: userReport.title,
      description: userReport.description,
      summary: userReport.summary,
      category: userReport.category,
      type_name: typeName,
      event_date: userReport.event_date,
      location_name: userReport.location_description ||
        [userReport.city, userReport.state_province, userReport.country].filter(function (s: any) { return !!s }).join(', ') ||
        null,
    },
    fingerprint: fingerprint,
    cluster: cluster,
    context: context,
    corpus: corpus,
  })

  if (!result) {
    return res.status(503).json({
      error: 'The AI is briefly unavailable. Try again in a minute.',
      answer: null,
    })
  }

  // --- Resolve citations to client-renderable shape --------------
  var citationsForClient: Array<{ id: string; slug: string; title: string }> = []
  result.citation_ids.forEach(function (id: string) {
    var c = corpus.find(function (x: CorpusItem) { return x.id === id })
    if (c) citationsForClient.push({ id: c.id, slug: c.slug, title: c.title })
  })

  // --- Log (best-effort; table may not exist yet) ----------------
  try {
    await (svc.from('ask_the_unknown_log') as any).insert({
      user_id: user.id,
      report_id: userReport.id,
      question: question,
      answer: result.answer,
      citation_ids: result.citation_ids,
      refused: result.refused,
      refusal_reason: result.refusal_reason,
      model: result.model,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: result.cost_usd,
    })
  } catch (_) { /* table missing; Vercel logs still capture spend */ }

  return res.status(200).json({
    answer: result.answer,
    citations: citationsForClient,
    refused: result.refused,
    refusal_reason: result.refusal_reason,
  })
}

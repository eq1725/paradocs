/**
 * GET /api/lab/your-signal
 *
 * V9.11.6 Phase 1.B — returns the 4-card "Your Signal" insight
 * payload for the signed-in user's most recent report.
 *
 * Card 1 — Your fingerprint   (deterministic, this commit)
 * Card 2 — Patterns near you  (deterministic, this commit)
 * Card 3 — Did you know       (placeholder until Phase 1.C — Sonnet)
 * Card 4 — Across the archive (deterministic, this commit)
 *
 * Caching: per-user-per-report in public.your_signal_insights with
 * a 7-day TTL. Cache is keyed by (user_id, report_id) and bypassed
 * with ?fresh=1 (admin / debug). Cache is invalidated implicitly
 * when expires_at passes OR when the user shares a new report (the
 * primary key changes).
 *
 * Tone rule: never diagnostic. Say "your report shares X with…",
 * not "your report exhibits X". This is documentation, not therapy.
 *
 * SWC compat: uses var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { generateDidYouKnow, DidYouKnowPayload } from '@/lib/services/your-signal-ai.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Geographic cluster radius for Card 2 — matches the "Nearby" filter
// on the RADAR view (V9.11.5 #30 — 500 mi). Card 2 uses a TIGHTER
// 100-mile window for "patterns near you" because that's where we
// want true regional clustering (cryptid corridors, urban hotspots)
// vs. the broader cross-state radius the RADAR's Nearby uses.
var CLUSTER_RADIUS_MI = 100

// ── Helpers ────────────────────────────────────────────────────────────────

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959 // Earth radius in miles
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December']

// ── Card 1: Your fingerprint ──────────────────────────────────────────────

async function generateFingerprint(svc: any, userReport: any) {
  // Count overlapping reports along three axes:
  //   - same phenomenon_type
  //   - same category
  //   - same evidence signal (has_photo_video / witness_count > 1)
  // Pick the strongest axis and frame the user's report against it.

  var phenomenonTypeId = userReport.phenomenon_type_id
  var category = userReport.category
  var hasEvidence = !!userReport.has_photo_video
  var manyWitnesses = (userReport.witness_count || 0) > 1

  var typeCount = 0
  var categoryCount = 0
  var typeLabel = ''

  if (phenomenonTypeId) {
    var r1 = await svc.from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('phenomenon_type_id', phenomenonTypeId)
      .eq('status', 'approved')
      .neq('id', userReport.id)
    typeCount = (r1 && r1.count) || 0

    var t = await svc.from('phenomenon_types').select('name').eq('id', phenomenonTypeId).single()
    typeLabel = (t && t.data && t.data.name) || ''
  }

  if (category) {
    var r2 = await svc.from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('category', category)
      .eq('status', 'approved')
      .neq('id', userReport.id)
    categoryCount = (r2 && r2.count) || 0
  }

  // Pick the strongest axis.
  var axis: 'type' | 'category' | 'evidence' = 'category'
  var count = categoryCount
  var label = category || 'this signature'

  if (phenomenonTypeId && typeCount >= 3) {
    // Prefer type when it has meaningful sample size — more specific.
    axis = 'type'
    count = typeCount
    label = typeLabel || label
  }

  // Evidence axis as a tiebreaker / colorful framing for visual-evidence
  // reports.
  var evidenceCount = 0
  if (hasEvidence) {
    var r3 = await svc.from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('has_photo_video', true)
      .eq('status', 'approved')
      .neq('id', userReport.id)
    evidenceCount = (r3 && r3.count) || 0
  }

  return {
    axis: axis,
    primary_label: label,
    primary_count: count,
    type_count: typeCount,
    category_count: categoryCount,
    evidence_count: evidenceCount,
    has_evidence: hasEvidence,
    many_witnesses: manyWitnesses,
  }
}

// ── Card 2: Patterns near you ─────────────────────────────────────────────

async function generateCluster(svc: any, userReport: any) {
  var lat = userReport.latitude
  var lng = userReport.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { skipped: true, reason: 'no_location' }
  }

  // Pull a generous regional candidate set; haversine-filter in-process.
  // Bounding-box pre-filter dramatically reduces the candidate set.
  var latDelta = CLUSTER_RADIUS_MI / 69 // ~69 mi per degree of latitude
  var lngDelta = CLUSTER_RADIUS_MI / (69 * Math.cos(lat * Math.PI / 180) || 1)

  // V10.9 Phase 3 — also fetch created_at so we can compute the
  // user's contribution position (foundational vs. recent joiner).
  var query = await svc.from('reports')
    .select('id, latitude, longitude, event_date, created_at')
    .eq('status', 'approved')
    .neq('id', userReport.id)
    .gte('latitude', lat - latDelta)
    .lte('latitude', lat + latDelta)
    .gte('longitude', lng - lngDelta)
    .lte('longitude', lng + lngDelta)
    .limit(2000)

  var candidates = (query && query.data) || []

  var nearbyReports = candidates.filter(function (r: any) {
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return false
    return haversineMi(lat, lng, r.latitude, r.longitude) <= CLUSTER_RADIUS_MI
  })

  // Compute year range of dated nearby reports.
  var years: number[] = []
  nearbyReports.forEach(function (r: any) {
    if (r.event_date) {
      var y = new Date(r.event_date).getUTCFullYear()
      if (!isNaN(y) && y > 1700 && y < 2100) years.push(y)
    }
  })
  years.sort(function (a, b) { return a - b })

  // V10.9 Phase 3 — cluster-contribution detection.
  // Frame the user's report against the cluster's CREATION timeline
  // (when it was added to the archive), not the event_date timeline.
  // The contribution story is "you put this on our map first" — that's
  // an archive-contribution claim, not a temporal-event claim. Three
  // tiers based on the user's percentile rank by created_at:
  //   - top quartile by oldest created_at AND cluster has ≥3 members
  //     → "foundational case" callout
  //   - second quartile → "early case" callout
  //   - otherwise → no callout (we don't want to trivialize the
  //     concept by attaching it to every report)
  var contribution: {
    is_foundational: boolean
    is_early: boolean
    older_than_count: number
    newer_arrivals_count: number
  } | null = null

  // We need the user's own report's created_at to compare. Hit it from
  // the userReport object — already selected in the handler.
  var userCreatedAtIso = (userReport as any).created_at
  if (userCreatedAtIso && nearbyReports.length >= 3) {
    var userCreatedMs = new Date(userCreatedAtIso).getTime()
    if (!isNaN(userCreatedMs)) {
      var olderCount = 0
      var newerCount = 0
      nearbyReports.forEach(function (r: any) {
        if (!r.created_at) return
        var t = new Date(r.created_at).getTime()
        if (isNaN(t)) return
        if (t < userCreatedMs) olderCount++
        else if (t > userCreatedMs) newerCount++
      })
      // Foundational: in the top 25% by age (75% are newer than user).
      var totalCmp = olderCount + newerCount
      var newerPct = totalCmp > 0 ? newerCount / totalCmp : 0
      contribution = {
        is_foundational: newerPct >= 0.75 && newerCount >= 2,
        is_early: !((newerPct >= 0.75 && newerCount >= 2)) && newerPct >= 0.5 && newerCount >= 1,
        older_than_count: olderCount,
        newer_arrivals_count: newerCount,
      }
    }
  }

  return {
    skipped: false,
    nearby_count: nearbyReports.length,
    radius_mi: CLUSTER_RADIUS_MI,
    year_min: years.length > 0 ? years[0] : null,
    year_max: years.length > 0 ? years[years.length - 1] : null,
    dated_count: years.length,
    contribution: contribution,
  }
}

// ── Card 4: Across the archive ────────────────────────────────────────────

async function generateContext(svc: any, userReport: any) {
  // Find when reports of the same phenomenon_type peak across the
  // archive, and contextualize the user's event_date inside that.
  var phenomenonTypeId = userReport.phenomenon_type_id
  var category = userReport.category

  if (!phenomenonTypeId && !category) {
    return { skipped: true, reason: 'no_classification' }
  }

  var queryBuilder = svc.from('reports')
    .select('event_date')
    .eq('status', 'approved')
    .not('event_date', 'is', null)

  if (phenomenonTypeId) queryBuilder = queryBuilder.eq('phenomenon_type_id', phenomenonTypeId)
  else if (category)    queryBuilder = queryBuilder.eq('category', category)

  var result = await queryBuilder.limit(5000)
  var rows = (result && result.data) || []

  if (rows.length < 10) {
    return { skipped: true, reason: 'insufficient_data', sample_size: rows.length }
  }

  // Month-of-year histogram (0-indexed, Jan = 0).
  var monthBuckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  rows.forEach(function (r: any) {
    var d = new Date(r.event_date)
    if (!isNaN(d.getTime())) monthBuckets[d.getUTCMonth()]++
  })

  // Peak month + share.
  var peakMonth = 0
  var peakCount = monthBuckets[0]
  for (var i = 1; i < 12; i++) {
    if (monthBuckets[i] > peakCount) { peakCount = monthBuckets[i]; peakMonth = i }
  }
  var totalDated = monthBuckets.reduce(function (a, b) { return a + b }, 0)
  var peakPct = totalDated > 0 ? Math.round((peakCount / totalDated) * 100) : 0

  // User's month (if event_date present).
  var userMonth: number | null = null
  if (userReport.event_date) {
    var ud = new Date(userReport.event_date)
    if (!isNaN(ud.getTime())) userMonth = ud.getUTCMonth()
  }

  return {
    skipped: false,
    label: phenomenonTypeId ? 'phenomenon_type' : 'category',
    peak_month_index: peakMonth,
    peak_month_name: MONTH_NAMES[peakMonth],
    peak_share_pct: peakPct,
    user_month_index: userMonth,
    user_month_name: userMonth !== null ? MONTH_NAMES[userMonth] : null,
    user_matches_peak: userMonth !== null && userMonth === peakMonth,
    sample_size: totalDated,
  }
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth — bearer token in the Authorization header (matches our other
  // /api/user/* endpoints' convention).
  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  // Service-role client for the actual queries (bypasses RLS so we can
  // aggregate across the archive without leaking other users' data —
  // we never return per-row archive content, only aggregates).
  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1. Find the user's most recent report.
  // V10.9 — added created_at for the cluster-contribution callout
  // (Phase 3) — we frame "foundational" against archive-creation
  // order, not event_date.
  var reportResult = await svc.from('reports')
    .select('id, phenomenon_type_id, category, latitude, longitude, event_date, event_time, has_photo_video, witness_count, description, summary, title, created_at')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  var userReport = reportResult.data
  if (!userReport) {
    return res.status(200).json({ has_report: false })
  }

  // V9.12 Phase 2.A — load any existing thumbs feedback for this
  // user+report so the UI renders the correct initial state. Best-
  // effort; falls back to empty object on error.
  async function loadFeedback(): Promise<Record<string, 'up' | 'down'>> {
    try {
      var feedbackResult = await svc.from('your_signal_feedback')
        .select('card_type, rating')
        .eq('user_id', user!.id)
        .eq('report_id', userReport!.id)
      var out: Record<string, 'up' | 'down'> = {}
      var rows: any[] = (feedbackResult && feedbackResult.data) || []
      rows.forEach(function (r: any) { out[r.card_type] = r.rating })
      return out
    } catch (e) {
      return {}
    }
  }

  // 2. Cache lookup unless ?fresh=1.
  var fresh = req.query.fresh === '1'
  if (!fresh) {
    var cacheResult = await svc.from('your_signal_insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('report_id', userReport.id)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .single()
    if (cacheResult.data) {
      var feedbackHit = await loadFeedback()
      return res.status(200).json({
        has_report: true,
        report_id: userReport.id,
        cached: true,
        generated_at: cacheResult.data.generated_at,
        fingerprint:   cacheResult.data.fingerprint_payload,
        cluster:       cacheResult.data.cluster_payload,
        did_you_know:  cacheResult.data.did_you_know_payload,
        context:       cacheResult.data.context_payload,
        feedback:      feedbackHit,
      })
    }
  }

  // 3. Generate the deterministic cards in parallel.
  var [fingerprint, cluster, context] = await Promise.all([
    generateFingerprint(svc, userReport),
    generateCluster(svc, userReport),
    generateContext(svc, userReport),
  ])

  // Card 3 — Phase 1.C — Sonnet call. Runs SECOND because it depends
  // on the three deterministic payloads as context. We let it fall
  // back to the pending placeholder if the call fails (no API key,
  // network error, unparseable response) so the response always
  // returns something useful.
  var didYouKnowResult: DidYouKnowPayload | null = null
  try {
    var typeNameLookup: string | null = null
    if (userReport.phenomenon_type_id) {
      var t = await svc.from('phenomenon_types').select('name').eq('id', userReport.phenomenon_type_id).single()
      typeNameLookup = (t && t.data && t.data.name) || null
    }
    didYouKnowResult = await generateDidYouKnow({
      userReport: {
        title: userReport.title,
        description: userReport.description,
        summary: userReport.summary,
        category: userReport.category,
        type_name: typeNameLookup,
        event_date: userReport.event_date,
        location_name: null, // resolved separately if needed; not critical for V1
      },
      fingerprint: fingerprint,
      cluster: cluster,
      context: context,
    })
  } catch (aiErr) {
    console.warn('your-signal: Sonnet generation failed:', aiErr)
  }

  var didYouKnow: any = didYouKnowResult || { pending: true, model: null }

  // 4. Write to cache (upsert).
  try {
    await svc.from('your_signal_insights').upsert({
      user_id: user.id,
      report_id: userReport.id,
      fingerprint_payload: fingerprint,
      cluster_payload: cluster,
      did_you_know_payload: didYouKnow,
      context_payload: context,
      ai_model_used: didYouKnowResult ? didYouKnowResult.model : null,
      ai_input_tokens: didYouKnowResult ? didYouKnowResult.input_tokens : null,
      ai_output_tokens: didYouKnowResult ? didYouKnowResult.output_tokens : null,
      ai_cost_usd: didYouKnowResult ? didYouKnowResult.cost_usd : null,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'user_id,report_id' })
  } catch (cacheErr) {
    // Cache writes are best-effort. Don't fail the response if the
    // cache table is missing or RLS blocks us — the user still gets
    // their insights, they just get regenerated on next visit.
    console.warn('your-signal: cache write failed:', cacheErr)
  }

  var feedbackMiss = await loadFeedback()

  // V9.13 Phase 3.B — People Like You. Surface up to 3 opted-in
  // peers whose reports overlap on phenomenon_type or category.
  // We never cache this — opt-ins change frequently as users sign
  // up. Lightweight enough to recompute per visit.
  var peers = await loadPeers(svc, user!.id, userReport!)

  // V10.9 Signal-Reframe — compute the "since you last visited" delta
  // and stamp the new visit. Defensive against the signal_user_visits
  // table not yet existing (the migration is staged but hasn't been
  // applied via Studio yet — we still want the rest of the response
  // to render).
  var sinceLastVisit = await loadAndStampVisit(svc, user!.id, userReport!)

  return res.status(200).json({
    has_report: true,
    report_id: userReport.id,
    cached: false,
    generated_at: new Date().toISOString(),
    fingerprint: fingerprint,
    cluster: cluster,
    did_you_know: didYouKnow,
    context: context,
    feedback: feedbackMiss,
    peers: peers,
    since_last_visit: sinceLastVisit,
  })
}

/**
 * V10.9 — load the user's prior Signal-tab visit timestamp, compute
 * how many new approved reports landed in their cluster (or
 * archive-wide if no location), and stamp the new visit.
 *
 * Returns:
 *   {
 *     is_first_visit: boolean,
 *     previous_visited_at: ISO | null,
 *     new_in_cluster: number,         // approved reports with status=approved AND created_at > previous_visit AND within CLUSTER_RADIUS_MI
 *     new_in_archive: number,         // archive-wide growth since last visit (rough scale signal)
 *     new_peers_opted_in: number,     // peers who turned on discoverable since last visit
 *   }
 *
 * Defensive: if signal_user_visits is missing, returns is_first_visit:true
 * with zero deltas so the UI can degrade gracefully.
 */
async function loadAndStampVisit(svc: any, userId: string, userReport: any) {
  var nowIso = new Date().toISOString()

  // 1. Read prior visit (if any).
  var priorVisitIso: string | null = null
  var priorVisitCount = 0
  var isFirstVisit = true
  try {
    var prior = await svc.from('signal_user_visits')
      .select('last_visited_at, visit_count')
      .eq('user_id', userId)
      .maybeSingle()
    if (prior && prior.data) {
      priorVisitIso = prior.data.last_visited_at
      priorVisitCount = prior.data.visit_count || 0
      isFirstVisit = false
    }
  } catch (e: any) {
    // Table likely missing — return safe defaults; the UI will hide
    // the delta line if is_first_visit is true.
    console.warn('signal_user_visits read failed (migration may be pending):', e && e.message)
    return {
      is_first_visit: true,
      previous_visited_at: null,
      new_in_cluster: 0,
      new_in_archive: 0,
      new_peers_opted_in: 0,
    }
  }

  // 2. If we have a prior visit, count what's changed since.
  var newInCluster = 0
  var newInArchive = 0
  var newPeersOptedIn = 0
  if (priorVisitIso) {
    try {
      // Archive-wide growth (cheap; no geometry).
      var archiveResult = await svc.from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gt('created_at', priorVisitIso)
      newInArchive = (archiveResult && archiveResult.count) || 0
    } catch (_e) { /* ignore */ }

    // Cluster growth — only meaningful when the user's report has
    // coords. Bounding-box pre-filter then haversine.
    var lat = userReport.latitude
    var lng = userReport.longitude
    if (typeof lat === 'number' && typeof lng === 'number') {
      try {
        var latDelta = 100 / 69
        var lngDelta = 100 / (69 * Math.cos(lat * Math.PI / 180) || 1)
        var clusterResult = await svc.from('reports')
          .select('id, latitude, longitude')
          .eq('status', 'approved')
          .neq('id', userReport.id)
          .gt('created_at', priorVisitIso)
          .gte('latitude', lat - latDelta)
          .lte('latitude', lat + latDelta)
          .gte('longitude', lng - lngDelta)
          .lte('longitude', lng + lngDelta)
          .limit(2000)
        var rows: any[] = (clusterResult && clusterResult.data) || []
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i]
          if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
          if (haversineMi(lat, lng, r.latitude, r.longitude) <= 100) newInCluster++
        }
      } catch (_e) { /* ignore */ }
    }

    // Peers who newly opted in. Best-effort; the table/view may not
    // expose updated_at the way we want.
    try {
      var peerResult = await svc.from('report_peer_visibility')
        .select('user_id', { count: 'exact', head: true })
        .eq('effective_allow_peer', true)
        .gt('updated_at', priorVisitIso)
      newPeersOptedIn = (peerResult && peerResult.count) || 0
    } catch (_e) { /* ignore */ }
  }

  // 3. Stamp the new visit (best-effort; failure here just means the
  //    next visit's "previous" stays at the older timestamp).
  //    visit_count is informational; we increment by reading prior+1
  //    rather than relying on a DB RPC.
  try {
    var nextVisitCount = isFirstVisit ? 1 : priorVisitCount + 1
    await svc.from('signal_user_visits').upsert({
      user_id: userId,
      last_visited_at: nowIso,
      previous_visited_at: priorVisitIso,
      visit_count: nextVisitCount,
      updated_at: nowIso,
    }, { onConflict: 'user_id' })
  } catch (e: any) {
    console.warn('signal_user_visits stamp failed:', e && e.message)
  }

  return {
    is_first_visit: isFirstVisit,
    previous_visited_at: priorVisitIso,
    new_in_cluster: newInCluster,
    new_in_archive: newInArchive,
    new_peers_opted_in: newPeersOptedIn,
  }
}

/**
 * V9.13 Phase 3.B — opted-in peers for the "People like you" card.
 *
 * Filters reports to:
 *   - Same phenomenon_type as the user's report (preferred),
 *     else same category
 *   - Not the user's own report
 *   - status = approved
 *   - Effective allow_peer_connection = TRUE (via the
 *     report_peer_visibility view)
 *
 * Then dedupes by user_id (one peer per person, latest report
 * wins), joins profile fields, returns up to 3.
 *
 * Returns { count_opted_in_total, sample: [...] } — total tells
 * the user "X others are open"; sample renders the cards.
 */
async function loadPeers(svc: any, currentUserId: string, userReport: any) {
  try {
    var filterCol = userReport.phenomenon_type_id ? 'phenomenon_type_id' : 'category'
    var filterVal = userReport.phenomenon_type_id || userReport.category
    if (!filterVal) return { count_opted_in_total: 0, sample: [] }

    // Pull candidate reports (recent, approved, same type/category, not us).
    var query = await svc.from('reports')
      .select('id, slug, title, submitted_by, created_at')
      .eq(filterCol, filterVal)
      .eq('status', 'approved')
      .neq('submitted_by', currentUserId)
      .order('created_at', { ascending: false })
      .limit(200)
    var candidates: any[] = (query && query.data) || []
    if (candidates.length === 0) return { count_opted_in_total: 0, sample: [] }

    var candidateIds = candidates.map(function (r: any) { return r.id })

    // Check effective peer visibility per report.
    var vizResult = await svc.from('report_peer_visibility')
      .select('report_id, user_id, effective_allow_peer')
      .in('report_id', candidateIds)
    var allowedReportIds: Record<string, boolean> = {}
    ;((vizResult && vizResult.data) || []).forEach(function (v: any) {
      if (v.effective_allow_peer) allowedReportIds[v.report_id] = true
    })

    var optedIn = candidates.filter(function (r: any) { return allowedReportIds[r.id] })
    var optedInCount = optedIn.length

    // Dedupe by user_id (one peer per person, latest report wins).
    var seen: Record<string, boolean> = {}
    var deduped: any[] = []
    for (var i = 0; i < optedIn.length && deduped.length < 3; i++) {
      var r = optedIn[i]
      if (seen[r.submitted_by]) continue
      seen[r.submitted_by] = true
      deduped.push(r)
    }
    if (deduped.length === 0) return { count_opted_in_total: optedInCount, sample: [] }

    // Join profile preview fields.
    var userIds = deduped.map(function (r: any) { return r.submitted_by })
    var profResult = await svc.from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds)
    var profileMap: Record<string, any> = {}
    ;((profResult && profResult.data) || []).forEach(function (p: any) { profileMap[p.id] = p })

    var sample = deduped.map(function (r: any) {
      var p = profileMap[r.submitted_by] || {}
      return {
        user_id: r.submitted_by,
        report_id: r.id,
        report_slug: r.slug,
        report_title: r.title || '(untitled)',
        username: p.username || null,
        display_name: p.display_name || null,
        avatar_url: p.avatar_url || null,
      }
    })

    return { count_opted_in_total: optedInCount, sample: sample }
  } catch (e: any) {
    console.warn('your-signal: peers load failed:', e && e.message)
    return { count_opted_in_total: 0, sample: [], error: true }
  }
}

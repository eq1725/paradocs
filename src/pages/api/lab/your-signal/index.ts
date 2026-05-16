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
// V10.12 — Sonnet-driven Did You Know is retired. Import retained as
// a comment for the next archaeologist; the service file still ships
// because it's referenced from year-in-review and other surfaces.
// import { generateDidYouKnow, DidYouKnowPayload } from '@/lib/services/your-signal-ai.service'

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

  // 1. Find the report this Signal call is about.
  //
  // Default = user's most recent submission. V10.15 — accept
  // ?report_id=xxx override so the consolidated Story tab can focus
  // SIGNAL on whichever submission the user has selected via the
  // multi-submission switcher. The override is constrained to
  // reports the caller actually owns (submitted_by = user.id) so
  // it can't be abused to inspect other users' data.
  var requestedReportId = (req.query.report_id as string) || null
  var reportQuery = svc.from('reports')
    .select('id, phenomenon_type_id, category, latitude, longitude, event_date, event_time, has_photo_video, witness_count, description, summary, title, created_at')
    .eq('submitted_by', user.id)
    .neq('status', 'deleted')
  if (requestedReportId) {
    reportQuery = reportQuery.eq('id', requestedReportId)
  } else {
    reportQuery = reportQuery.order('created_at', { ascending: false })
  }
  var reportResult = await reportQuery.limit(1).single()

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
      // V10.12 — peer_questions is always fresh (recomputed per visit
      // because the cost is a single SELECT and the data changes more
      // often than the deterministic cards). Compute even on cache hit.
      var peerQuestionsHit = await loadPeerQuestions(svc, userReport)
      // V10.12.1 — email prefs always fresh too. Cheap select; user
      // can change them between cache windows.
      var emailPrefsHit = await loadEmailPrefs(svc, user!.id)
      return res.status(200).json({
        has_report: true,
        report_id: userReport.id,
        cached: true,
        generated_at: cacheResult.data.generated_at,
        fingerprint:    cacheResult.data.fingerprint_payload,
        cluster:        cacheResult.data.cluster_payload,
        did_you_know:   cacheResult.data.did_you_know_payload,
        peer_questions: peerQuestionsHit,
        context:        cacheResult.data.context_payload,
        feedback:       feedbackHit,
        email_prefs:    emailPrefsHit,
      })
    }
  }

  // 3. Generate the deterministic cards in parallel.
  var [fingerprint, cluster, context] = await Promise.all([
    generateFingerprint(svc, userReport),
    generateCluster(svc, userReport),
    generateContext(svc, userReport),
  ])

  // V10.12 (Option C from audit) — Card 3 is now "What others are
  // asking": anonymized aggregation of recent Ask the Unknown
  // questions from peer reports in the same phenomenon_type or
  // category. Replaces the Sonnet-generated Did You Know card.
  // Reasons:
  //   - Did You Know was the only card that didn't reinforce
  //     "you're not alone" (audit's structural critique).
  //   - Peer questions DO reinforce it directly: "47 people with
  //     signals like yours have asked X."
  //   - Uses cached Ask history (no new Sonnet calls). Cost moves
  //     from per-user-per-week Sonnet generation to a single
  //     aggregation query.
  // The response key is renamed peer_questions; we also leave a
  // stub did_you_know for one release so any cached client doesn't
  // crash on the missing field. Stub can be removed in a follow-up.
  var peerQuestions = await loadPeerQuestions(svc, userReport)
  var didYouKnow: any = { pending: true, model: null, deprecated: true }

  // 4. Write to cache (upsert). V10.12 — peer_questions is recomputed
  // per-visit (cheap query, no AI cost) so we don't bother caching it
  // separately; the expensive cards (fingerprint, cluster, context)
  // still get cached.
  try {
    await svc.from('your_signal_insights').upsert({
      user_id: user.id,
      report_id: userReport.id,
      fingerprint_payload: fingerprint,
      cluster_payload: cluster,
      did_you_know_payload: didYouKnow,
      context_payload: context,
      ai_model_used: null,
      ai_input_tokens: null,
      ai_output_tokens: null,
      ai_cost_usd: null,
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
  // V10.11 — also detect cluster-contribution transitions and write
  // contribution_callout_pending_at when a transition fires (consumed
  // by the signal-alerts and signal-digest-email crons).
  var sinceLastVisit = await loadAndStampVisit(svc, user!.id, userReport!, cluster)

  // V10.12.1 — return the user's persisted email-digest preferences
  // so the SignalEmailDigestCard renders with the correct toggle
  // state on every page load (was previously defaulting to off and
  // forgetting the user's stored preference between visits).
  var emailPrefs = await loadEmailPrefs(svc, user!.id)

  // E0.6 — resolve the user's tier + first-submission status so the
  // client can render the locked-state on Sonnet-derived cards for
  // Free users beyond their first submission. Both lookups are
  // best-effort; on failure we fall back to 'free' + true.
  var tierName = 'free'
  try {
    var tierResult = await (svc.from('user_subscriptions') as any)
      .select('tier:subscription_tiers(name)')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    var tierRow = tierResult && tierResult.data && (tierResult.data as any).tier
    if (tierRow && tierRow.name) tierName = String(tierRow.name)
  } catch (_) { /* default to free */ }

  var isFirstSubmission = true
  try {
    var allSubsResult = await svc.from('reports')
      .select('id, created_at')
      .eq('submitted_by', user!.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .limit(2)
    var subs: any[] = (allSubsResult && allSubsResult.data) || []
    if (subs.length > 0) {
      isFirstSubmission = subs[0].id === userReport.id
    }
  } catch (_) { /* default to true */ }

  return res.status(200).json({
    has_report: true,
    report_id: userReport.id,
    cached: false,
    generated_at: new Date().toISOString(),
    fingerprint: fingerprint,
    cluster: cluster,
    did_you_know: didYouKnow,
    peer_questions: peerQuestions,
    context: context,
    feedback: feedbackMiss,
    peers: peers,
    since_last_visit: sinceLastVisit,
    email_prefs: emailPrefs,
    // E0.6 — drives the locked-state rendering on Sonnet cards for
    // Free users beyond their first experience.
    tier_name: tierName,
    is_first_submission: isFirstSubmission,
  })
}

/**
 * V10.12.1 — read the user's persisted email digest preferences so
 * the toggle in SignalEmailDigestCard hydrates with the correct
 * state. Defensive: returns sensible defaults if the row doesn't
 * exist yet (first-time visitor) or if the column is missing
 * (migration pending).
 */
async function loadEmailPrefs(svc: any, userId: string) {
  try {
    var result = await svc.from('signal_user_visits')
      .select('email_digest_enabled, email_digest_cadence')
      .eq('user_id', userId)
      .maybeSingle()
    if (result && result.data) {
      return {
        enabled: !!result.data.email_digest_enabled,
        cadence: (result.data.email_digest_cadence === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly',
      }
    }
    return { enabled: false, cadence: 'weekly' as const }
  } catch (_e) {
    return { enabled: false, cadence: 'weekly' as const }
  }
}

/**
 * V10.12 (Option C) — "What others are asking" data source.
 *
 * Aggregates anonymized Ask the Unknown questions from peers whose
 * reports share the same phenomenon_type (preferred) or category
 * (fallback). Returns the top 3 most-asked questions plus the total
 * number of distinct askers, framed as "X people with signals like
 * yours have asked these questions."
 *
 * Why this is the right substitute for Did You Know:
 *   - Reinforces "you're not alone" (the brand promise) by exposing
 *     real peer behavior instead of an isolated AI assertion.
 *   - Uses cached AI work — every question in ask_the_unknown_log
 *     already cost a Sonnet call to answer; surfacing the question
 *     text costs nothing additional.
 *   - Failure-mode is honest: when the corpus is too small to find
 *     peer questions, we degrade to a "be the first to ask" empty
 *     state rather than fabricating an AI fact.
 *
 * Defensive: if ask_the_unknown_log doesn't exist (it's optional in
 * the migration), returns empty payload so the UI shows the
 * empty state rather than crashing.
 */
async function loadPeerQuestions(svc: any, userReport: any) {
  try {
    var phenomenonTypeId = userReport.phenomenon_type_id
    var category = userReport.category

    // Pull peer report IDs first (same phenomenon_type, else same
    // category, else nothing). Limit to recent 200 — older reports
    // probably have stale Ask sessions that don't reflect what
    // current users are curious about.
    var reportIds: string[] = []
    if (phenomenonTypeId) {
      var byType = await svc.from('reports')
        .select('id')
        .eq('phenomenon_type_id', phenomenonTypeId)
        .eq('status', 'approved')
        .neq('id', userReport.id)
        .order('created_at', { ascending: false })
        .limit(200)
      reportIds = (byType.data || []).map(function (r: any) { return r.id })
    }
    if (reportIds.length === 0 && category) {
      var byCat = await svc.from('reports')
        .select('id')
        .eq('category', category)
        .eq('status', 'approved')
        .neq('id', userReport.id)
        .order('created_at', { ascending: false })
        .limit(200)
      reportIds = (byCat.data || []).map(function (r: any) { return r.id })
    }
    if (reportIds.length === 0) {
      return { questions: [], total_questions: 0, total_askers: 0, source_scope: 'none' }
    }

    // Pull Ask history for those reports. Cap at 1000 to bound query
    // cost; 1000 questions across 200 reports is generous coverage.
    var askResult = await svc.from('ask_the_unknown_log')
      .select('user_id, question, created_at')
      .in('report_id', reportIds)
      .eq('refused', false)
      .order('created_at', { ascending: false })
      .limit(1000)
    var rows: any[] = (askResult && askResult.data) || []
    if (rows.length === 0) {
      return { questions: [], total_questions: 0, total_askers: 0, source_scope: phenomenonTypeId ? 'phenomenon_type' : 'category' }
    }

    // Aggregate. Normalize question text (lowercase, collapse
    // whitespace, strip trailing punctuation) so near-duplicates
    // count together. Track distinct askers per question to filter
    // out one-person-asked-five-times patterns.
    function normalize(q: string): string {
      return String(q || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.?!,]+$/g, '')
        .trim()
    }
    var byNorm: Record<string, { text: string; count: number; askers: Record<string, boolean> }> = {}
    var distinctAskers: Record<string, boolean> = {}
    rows.forEach(function (r: any) {
      var norm = normalize(r.question)
      if (norm.length < 5) return // skip junk
      if (!byNorm[norm]) {
        byNorm[norm] = { text: r.question, count: 0, askers: {} }
      }
      byNorm[norm].count++
      if (r.user_id) {
        byNorm[norm].askers[r.user_id] = true
        distinctAskers[r.user_id] = true
      }
    })

    // Rank by distinct-asker count first (catches "10 people asked
    // similar things"), then by raw count as a tiebreaker. Top 3.
    var ranked = Object.values(byNorm)
      .map(function (q) { return { text: q.text, asked_count: q.count, distinct_askers: Object.keys(q.askers).length } })
      .filter(function (q) { return q.distinct_askers >= 1 })
      .sort(function (a, b) {
        if (b.distinct_askers !== a.distinct_askers) return b.distinct_askers - a.distinct_askers
        return b.asked_count - a.asked_count
      })
      .slice(0, 3)

    return {
      questions: ranked,
      total_questions: rows.length,
      total_askers: Object.keys(distinctAskers).length,
      source_scope: phenomenonTypeId ? 'phenomenon_type' : 'category',
    }
  } catch (e: any) {
    console.warn('your-signal: loadPeerQuestions failed:', e && e.message)
    return { questions: [], total_questions: 0, total_askers: 0, source_scope: 'error' }
  }
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
async function loadAndStampVisit(svc: any, userId: string, userReport: any, cluster?: any) {
  var nowIso = new Date().toISOString()

  // 1. Read prior visit (if any). V10.11 — also pull the cached
  // contribution payload so we can diff against the new one.
  var priorVisitIso: string | null = null
  var priorVisitCount = 0
  var priorContribution: any = null
  var isFirstVisit = true
  try {
    var prior = await svc.from('signal_user_visits')
      .select('last_visited_at, visit_count, last_contribution_payload')
      .eq('user_id', userId)
      .maybeSingle()
    if (prior && prior.data) {
      priorVisitIso = prior.data.last_visited_at
      priorVisitCount = prior.data.visit_count || 0
      priorContribution = prior.data.last_contribution_payload || null
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

  // V10.11 — detect contribution transitions. A transition fires when:
  //   (a) the new contribution.is_foundational is true AND the prior
  //       contribution wasn't foundational (early→foundational, or
  //       no-prior→foundational on a fast-growing brand-new cluster), OR
  //   (b) the user is foundational AND newer_arrivals_count grew by
  //       ≥5 since the last cached snapshot (continued momentum).
  //
  // Either case writes contribution_callout_pending_at so the next
  // outgoing push or email notification can prepend the contribution
  // block. The pending timestamp gets cleared by the cron after it's
  // consumed, so each transition produces exactly one notification.
  var newContribution = (cluster && cluster.contribution) || null
  var contributionPendingAt: string | null = null
  if (newContribution && (newContribution.is_foundational || newContribution.is_early)) {
    var becameFoundational = !!newContribution.is_foundational &&
      (!priorContribution || !priorContribution.is_foundational)
    var foundationalGrew = !!newContribution.is_foundational &&
      !!priorContribution && !!priorContribution.is_foundational &&
      ((newContribution.newer_arrivals_count || 0) - (priorContribution.newer_arrivals_count || 0)) >= 5
    if (becameFoundational || foundationalGrew) {
      contributionPendingAt = nowIso
    }
  }

  // 3. Stamp the new visit (best-effort; failure here just means the
  //    next visit's "previous" stays at the older timestamp).
  //    visit_count is informational; we increment by reading prior+1
  //    rather than relying on a DB RPC.
  try {
    var nextVisitCount = isFirstVisit ? 1 : priorVisitCount + 1
    var upsertPayload: any = {
      user_id: userId,
      last_visited_at: nowIso,
      previous_visited_at: priorVisitIso,
      visit_count: nextVisitCount,
      last_contribution_payload: newContribution,
      updated_at: nowIso,
    }
    if (contributionPendingAt) {
      upsertPayload.contribution_callout_pending_at = contributionPendingAt
    }
    await svc.from('signal_user_visits').upsert(upsertPayload, { onConflict: 'user_id' })
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
    // B0.4 — ingested reports never appear as peer candidates. Their
    // "author" is an external source (NUFORC, Reddit, etc.), not a
    // Paradocs user who could receive a DM.
    var query = await svc.from('reports')
      .select('id, slug, title, submitted_by, created_at, report_type')
      .eq(filterCol, filterVal)
      .eq('status', 'approved')
      .eq('report_type', 'submitted')
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

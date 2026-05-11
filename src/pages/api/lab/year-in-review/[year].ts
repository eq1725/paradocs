/**
 * GET /api/lab/year-in-review/[year]
 *
 * V10 Phase 4.C — Your Signal Year in Review payload.
 *
 * Process:
 *   1. Auth
 *   2. Look up cache (7-day TTL for in-progress year, effectively
 *      permanent once year closes)
 *   3. Cache miss → compile deterministic stats from:
 *        - reports submitted in the year
 *        - your_signal_insights (count of distinct generations)
 *        - report_resonance (received + given)
 *        - connection_requests + connections (made in year)
 *        - report_comments (made by user in year)
 *        - ask_the_unknown_log (questions in year)
 *      Plus aggregate: top phenomenon_type by report count,
 *      most-active month, oldest archived match year
 *   4. Call Sonnet for intro + closing narrative
 *   5. Cache + return
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { generateYearNarrative, YearStats } from '@/lib/services/year-in-review-ai.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  var year = parseInt(String(req.query.year || ''), 10)
  if (!Number.isFinite(year) || year < 2024 || year > new Date().getUTCFullYear()) {
    return res.status(400).json({ error: 'Invalid year' })
  }

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1) Cache lookup
  var fresh = req.query.fresh === '1'
  if (!fresh) {
    try {
      var cacheResult = await svc.from('year_in_review_cache')
        .select('payload, generated_at, expires_at')
        .eq('user_id', user.id)
        .eq('year', year)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .single()
      if (cacheResult.data) {
        return res.status(200).json({
          year: year,
          cached: true,
          payload: (cacheResult.data as any).payload,
        })
      }
    } catch (_) { /* miss */ }
  }

  // 2) Compute stats
  var startIso = new Date(Date.UTC(year, 0, 1)).toISOString()
  var endIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString()

  function safeCount(p: any): Promise<number> {
    return Promise.resolve(p).then(function (r: any) { return (r && r.count) || 0 }).catch(function () { return 0 })
  }

  // Reports shared (within the year)
  var [
    reportsShared,
    insightsSurfaced,
    resonancesReceived,
    resonancesGiven,
    connectionsMade,
    commentsMade,
    askQuestions,
  ] = await Promise.all([
    safeCount(svc.from('reports').select('id', { count: 'exact', head: true })
      .eq('submitted_by', user.id).gte('created_at', startIso).lt('created_at', endIso)),
    safeCount(svc.from('your_signal_insights').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('generated_at', startIso).lt('generated_at', endIso)),
    safeCount(svc.from('report_resonance').select('id', { count: 'exact', head: true })
      .in('report_id',
        // resonances on reports authored by THIS user — proxied via
        // a separate query because Postgres requires a real subselect.
        // For V1 simplicity we count all resonances; future v2 can
        // filter to "received on my reports" with a JOIN.
        // Returning unfiltered count to keep this single query.
        []
      )),
    safeCount(svc.from('report_resonance').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', startIso).lt('created_at', endIso)),
    safeCount(svc.from('connections').select('id', { count: 'exact', head: true })
      .or('user_a.eq.' + user.id + ',user_b.eq.' + user.id)
      .gte('created_at', startIso).lt('created_at', endIso)),
    safeCount(svc.from('report_comments').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', startIso).lt('created_at', endIso)),
    safeCount(svc.from('ask_the_unknown_log').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', startIso).lt('created_at', endIso)),
  ])

  // Resonances received: count rows on reports the user authored.
  var receivedCount = 0
  try {
    var userReportsRes = await svc.from('reports')
      .select('id')
      .eq('submitted_by', user.id)
      .gte('created_at', startIso).lt('created_at', endIso)
    var userReportIds: string[] = ((userReportsRes && userReportsRes.data) || []).map(function (r: any) { return r.id })
    if (userReportIds.length > 0) {
      var recRes = await svc.from('report_resonance')
        .select('id', { count: 'exact', head: true })
        .in('report_id', userReportIds)
      receivedCount = (recRes && recRes.count) || 0
    }
  } catch (_) { /* leave 0 */ }

  // Cluster size — sum nearby_count from cached insights generated
  // for the user this year (a directionally-correct cheap proxy).
  var clusterSizeTotal = 0
  try {
    var ins = await svc.from('your_signal_insights')
      .select('cluster_payload')
      .eq('user_id', user.id)
      .gte('generated_at', startIso).lt('generated_at', endIso)
    ;((ins && ins.data) || []).forEach(function (r: any) {
      var nc = r.cluster_payload && r.cluster_payload.nearby_count
      if (typeof nc === 'number') clusterSizeTotal += nc
    })
  } catch (_) { /* leave 0 */ }

  // Top phenomenon type — most common in user's reports this year.
  var topPhenomenonType: string | null = null
  var monthBuckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  var oldestMatchYear: number | null = null
  try {
    var reps = await svc.from('reports')
      .select('phenomenon_type_id, event_date, created_at')
      .eq('submitted_by', user.id)
      .gte('created_at', startIso).lt('created_at', endIso)
      .limit(200)
    var typeFreq: Record<string, number> = {}
    ;((reps && reps.data) || []).forEach(function (r: any) {
      if (r.phenomenon_type_id) typeFreq[r.phenomenon_type_id] = (typeFreq[r.phenomenon_type_id] || 0) + 1
      var d = new Date(r.created_at)
      if (!isNaN(d.getTime())) monthBuckets[d.getUTCMonth()]++
      if (r.event_date) {
        var y = new Date(r.event_date).getUTCFullYear()
        if (!isNaN(y) && y > 1700 && (oldestMatchYear === null || y < oldestMatchYear)) oldestMatchYear = y
      }
    })
    var topId: string | null = null
    var topCount = 0
    Object.keys(typeFreq).forEach(function (k) { if (typeFreq[k] > topCount) { topCount = typeFreq[k]; topId = k } })
    if (topId) {
      var t = await svc.from('phenomenon_types').select('name').eq('id', topId).single()
      topPhenomenonType = (t && t.data && (t.data as any).name) || null
    }
  } catch (_) { /* leave null */ }

  var topMonth = 0
  var topMonthCount = monthBuckets[0]
  for (var i = 1; i < 12; i++) {
    if (monthBuckets[i] > topMonthCount) { topMonthCount = monthBuckets[i]; topMonth = i }
  }
  var topMonthLabel = topMonthCount > 0 ? MONTH_NAMES[topMonth] : null

  var stats: YearStats = {
    year: year,
    reports_shared: reportsShared,
    cluster_size_total: clusterSizeTotal,
    insights_surfaced: insightsSurfaced,
    resonances_received: receivedCount,
    resonances_given: resonancesGiven,
    connections_made: connectionsMade,
    comments_made: commentsMade,
    ask_questions: askQuestions,
    top_phenomenon_type: topPhenomenonType,
    top_month_label: topMonthLabel,
    oldest_match_year: oldestMatchYear,
  }

  // 3) Sonnet narrative
  var narrative = await generateYearNarrative(stats)

  var payload = {
    stats: stats,
    narrative: narrative
      ? { intro: narrative.intro, closing: narrative.closing, model: narrative.model }
      : { intro: null, closing: null, model: null },
  }

  // 4) Cache (best-effort)
  try {
    var expiresAt = (year < new Date().getUTCFullYear())
      // Closed year → effectively permanent (10 years).
      ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
      // In-progress year → 7-day TTL.
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await (svc.from('year_in_review_cache') as any).upsert({
      user_id: user.id,
      year: year,
      payload: payload,
      ai_model_used: narrative ? narrative.model : null,
      ai_input_tokens: narrative ? narrative.input_tokens : null,
      ai_output_tokens: narrative ? narrative.output_tokens : null,
      ai_cost_usd: narrative ? narrative.cost_usd : null,
      generated_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'user_id,year' })
  } catch (_) { /* best-effort */ }

  return res.status(200).json({
    year: year,
    cached: false,
    payload: payload,
  })
}

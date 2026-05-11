/**
 * GET  /api/cron/match-circles-curate
 * POST /api/cron/match-circles-curate
 *
 * V10 Phase 4.B — nightly Match Circle curation.
 *
 * Panel-driven sizing:
 *   TARGET active members = 7
 *   RANGE = 5–10
 *   - active = posted OR read in last 14 days (last_active_at)
 *   - Below 5 active → flag the circle for "needs new members"
 *     (prioritize incoming opt-ins for it)
 *   - Above 10 → flag for split (we don't auto-split in V1; an
 *     admin reviews and splits manually). Splitting is queued via
 *     status='splitting'
 *
 * V1 behaviour (this commit):
 *   1. Recount member_count + active_count for every active circle
 *   2. Flag circles below 5 active as 'needs_growth' (status stays
 *      'active' but active_count drives the priority list)
 *   3. Identify opted-in users with no circle yet and try to add
 *      them to under-target circles matching their phenomenon_type
 *      (respecting cooldown_until + member_count < 10)
 *   4. If a user has no fit AND there are ≥4 other un-circled
 *      users on the same phenomenon_type, seed a NEW circle with
 *      them as the founding members
 *
 * Auto-split (active_count > 10) and merge-with-similar-circle
 * (active_count < 3) are V2 follow-ups; this commit doesn't risk
 * destructive operations on existing groups.
 *
 * Cadence: Vercel cron daily at 16:00 UTC (12pm EDT) — spaced
 * after signal-alerts to avoid resource collision.
 *
 * Auth: Bearer CRON_SECRET or x-admin-key (matches our other crons).
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var TARGET_SIZE = 7
var MIN_ACTIVE = 5
var MAX_SIZE = 10
var ACTIVE_WINDOW_DAYS = 14
var FOUND_NEW_THRESHOLD = 4 // minimum un-circled candidates of same type to seed a new circle

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth
  var adminKey = req.headers['x-admin-key']
  var isAuthed = adminKey === process.env.ADMIN_API_KEY
  if (!isAuthed) {
    var authHeader = req.headers.authorization || ''
    var cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader === 'Bearer ' + cronSecret) isAuthed = true
  }
  if (!isAuthed) return res.status(401).json({ error: 'Unauthorized' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // ── 1) Recount existing circles ───────────────────────────
  var existingResult = await svc.from('match_circles')
    .select('id, phenomenon_type_id, region_label, status')
    .eq('status', 'active')
    .limit(500)
  var existingCircles: any[] = (existingResult && existingResult.data) || []

  var recountStats = { circles_recounted: 0, flagged_growth: 0, flagged_splitting: 0 }

  for (var i = 0; i < existingCircles.length; i++) {
    var c = existingCircles[i]
    var totalRes = await svc.from('match_circle_members')
      .select('id', { count: 'exact', head: true })
      .eq('circle_id', c.id)
      .is('left_at', null)
    var memberCount = (totalRes && totalRes.count) || 0

    var activeRes = await svc.from('match_circle_members')
      .select('id', { count: 'exact', head: true })
      .eq('circle_id', c.id)
      .is('left_at', null)
      .gte('last_active_at', activeCutoff)
    var activeCount = (activeRes && activeRes.count) || 0

    var newStatus = c.status
    if (memberCount > MAX_SIZE) { newStatus = 'splitting'; recountStats.flagged_splitting++ }
    else if (activeCount < MIN_ACTIVE) { recountStats.flagged_growth++ }

    await (svc.from('match_circles') as any)
      .update({
        member_count: memberCount,
        active_count: activeCount,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id)
    recountStats.circles_recounted++
  }

  // ── 2) Find un-circled, opted-in candidates ───────────────
  // A candidate is a user who:
  //   (a) has an approved report submitted in the last 90 days,
  //   (b) has effective_allow_peer = TRUE via their profile
  //       default OR per-report override,
  //   (c) is NOT currently in any active circle (left_at NULL),
  //   (d) doesn't have an active cooldown_until in the future
  //       for the candidate circle's phenomenon_type.
  var recentCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  var candReports = await svc.from('reports')
    .select('id, submitted_by, phenomenon_type_id, latitude, longitude, created_at')
    .eq('status', 'approved')
    .not('phenomenon_type_id', 'is', null)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: false })
    .limit(2000)
  var candidateRows: any[] = (candReports && candReports.data) || []

  // Filter to opted-in (use the report_peer_visibility view).
  var candidateReportIds = candidateRows.map(function (r: any) { return r.id })
  var optedReportIds: Record<string, boolean> = {}
  if (candidateReportIds.length > 0) {
    var viz = await svc.from('report_peer_visibility')
      .select('report_id, effective_allow_peer')
      .in('report_id', candidateReportIds)
    ;((viz && viz.data) || []).forEach(function (v: any) {
      if (v.effective_allow_peer) optedReportIds[v.report_id] = true
    })
  }
  var optedCandidates = candidateRows.filter(function (r: any) { return optedReportIds[r.id] })

  // Latest report per user (dedupe).
  var perUser: Record<string, any> = {}
  optedCandidates.forEach(function (r: any) {
    if (!perUser[r.submitted_by]) perUser[r.submitted_by] = r
  })
  var candidateUsers = Object.keys(perUser).map(function (uid) { return perUser[uid] })

  // Remove users already in a non-left membership row.
  var allUserIds = candidateUsers.map(function (r: any) { return r.submitted_by })
  var existingMems: any[] = []
  if (allUserIds.length > 0) {
    var em = await svc.from('match_circle_members')
      .select('user_id, circle_id')
      .in('user_id', allUserIds)
      .is('left_at', null)
    existingMems = (em && em.data) || []
  }
  var alreadyInCircle: Record<string, boolean> = {}
  existingMems.forEach(function (m: any) { alreadyInCircle[m.user_id] = true })
  var uncircled = candidateUsers.filter(function (r: any) { return !alreadyInCircle[r.submitted_by] })

  // ── 3) Place uncircled users into existing under-target
  //    circles of the matching phenomenon_type (preferring 5-7
  //    over 8-10 to keep the bell-curve healthy).
  var placed = 0
  var seeded = 0
  var byType: Record<string, any[]> = {}
  uncircled.forEach(function (r: any) {
    if (!byType[r.phenomenon_type_id]) byType[r.phenomenon_type_id] = []
    byType[r.phenomenon_type_id].push(r)
  })

  for (var typeId in byType) {
    if (!byType.hasOwnProperty(typeId)) continue
    var candidates = byType[typeId]

    // Existing circles of this type, ordered preference 5-7 first.
    var circlesRes = await svc.from('match_circles')
      .select('id, member_count, active_count')
      .eq('phenomenon_type_id', typeId)
      .eq('status', 'active')
      .lt('member_count', MAX_SIZE)
      .order('active_count', { ascending: true }) // prefer smaller-active circles
      .limit(20)
    var availCircles: any[] = (circlesRes && circlesRes.data) || []

    // Respect 30-day cooldown per (user, circle).
    var candidateUserIds = candidates.map(function (c: any) { return c.submitted_by })
    var coolMap: Record<string, Record<string, boolean>> = {}
    if (candidateUserIds.length > 0 && availCircles.length > 0) {
      var nowIso = new Date().toISOString()
      var cl = await svc.from('match_circle_members')
        .select('circle_id, user_id, cooldown_until')
        .in('user_id', candidateUserIds)
        .in('circle_id', availCircles.map(function (c: any) { return c.id }))
        .gt('cooldown_until', nowIso)
      ;((cl && cl.data) || []).forEach(function (row: any) {
        if (!coolMap[row.user_id]) coolMap[row.user_id] = {}
        coolMap[row.user_id][row.circle_id] = true
      })
    }

    // Place candidates into circles.
    var remaining: any[] = []
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci]
      var placedThis = false
      for (var ai = 0; ai < availCircles.length; ai++) {
        var ac = availCircles[ai]
        if (ac.member_count >= MAX_SIZE) continue
        if (coolMap[cand.submitted_by] && coolMap[cand.submitted_by][ac.id]) continue
        // Add.
        var insMem = await (svc.from('match_circle_members') as any).insert({
          circle_id: ac.id,
          user_id: cand.submitted_by,
          role: 'member',
        })
        if (!insMem.error) {
          ac.member_count++
          placed++
          placedThis = true
          break
        }
      }
      if (!placedThis) remaining.push(cand)
    }

    // Seed new circles from the remaining if ≥ FOUND_NEW_THRESHOLD.
    while (remaining.length >= FOUND_NEW_THRESHOLD) {
      var seedBatch = remaining.splice(0, Math.min(TARGET_SIZE, remaining.length))
      var circleIns = await (svc.from('match_circles') as any).insert({
        phenomenon_type_id: typeId,
        status: 'active',
      }).select('id').single()
      if (circleIns.error || !circleIns.data) {
        console.error('match-circles-curate: failed to seed circle:', circleIns.error)
        break
      }
      var newCircleId = circleIns.data.id
      for (var si = 0; si < seedBatch.length; si++) {
        await (svc.from('match_circle_members') as any).insert({
          circle_id: newCircleId,
          user_id: seedBatch[si].submitted_by,
          role: si === 0 ? 'moderator' : 'member',
        })
      }
      seeded++
    }
  }

  return res.status(200).json({
    recount: recountStats,
    placed: placed,
    seeded: seeded,
    candidates_total: uncircled.length,
  })
}

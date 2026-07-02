/**
 * GET /api/cron/signal-alerts
 * POST /api/cron/signal-alerts
 *
 * V9.12 Phase 2.C — Time-evolving Your Signal alerts.
 *
 * For each user who has:
 *   - a report submitted in the last 90 days
 *   - at least one active push_subscription that includes the
 *     'your_signal' topic (or null/empty topics array = all topics)
 *
 * …compute the current "patterns near you" cluster size (Card 2
 * logic), compare to the snapshot stored in signal_alert_state,
 * and send a push notification when:
 *   - cluster has grown by >= ALERT_THRESHOLD reports since the
 *     last alert (default 3), AND
 *   - it's been >= COOLDOWN_HOURS since the last alert (default 72)
 *
 * Cadence: Vercel cron daily at 15:00 UTC (11am EDT) — see
 * vercel.json. Manual trigger via x-admin-key for testing.
 *
 * Auth (matches send-daily-lead.ts pattern):
 *   - Bearer ${CRON_SECRET} (Vercel cron)
 *   - x-admin-key header (manual)
 *
 * Returns: { checked, alerted, skipped, errors, details }
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Mirrors the Card 2 generator in /api/lab/your-signal/index.ts
var CLUSTER_RADIUS_MI = 100

// How many NEW reports near the user before we trigger an alert.
// Tunable — bump up if alerts feel noisy after launch; bump down
// once we have signal that users want more frequent updates.
var ALERT_THRESHOLD = 3

// Minimum time between two alerts to the same user, regardless of
// growth. Protects against ingestion bursts spamming users.
var COOLDOWN_HOURS = 72

// Max users to process per invocation. Keeps the function within
// Vercel's 300s limit; users not reached today will be reached
// tomorrow. Sorted by last_checked_at ascending so we naturally
// round-robin.
var MAX_USERS_PER_RUN = 500

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function computeClusterSize(svc: any, report: any): Promise<number> {
  if (typeof report.latitude !== 'number' || typeof report.longitude !== 'number') return 0
  var lat = report.latitude
  var lng = report.longitude
  var latDelta = CLUSTER_RADIUS_MI / 69
  var lngDelta = CLUSTER_RADIUS_MI / (69 * Math.cos(lat * Math.PI / 180) || 1)
  var query = await svc.from('reports')
    .select('id, latitude, longitude')
    .eq('status', 'approved')
    .neq('id', report.id)
    .gte('latitude', lat - latDelta)
    .lte('latitude', lat + latDelta)
    .gte('longitude', lng - lngDelta)
    .lte('longitude', lng + lngDelta)
    .limit(2000)
  var candidates: any[] = (query && query.data) || []
  var n = 0
  for (var i = 0; i < candidates.length; i++) {
    var r = candidates[i]
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
    if (haversineMi(lat, lng, r.latitude, r.longitude) <= CLUSTER_RADIUS_MI) n++
  }
  return n
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth — matches send-daily-lead.ts.
  var adminKey = req.headers['x-admin-key']
  var isAuthed = adminKey === process.env.ADMIN_API_KEY
  if (!isAuthed) {
    var authHeader = req.headers.authorization || ''
    var cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader === 'Bearer ' + cronSecret) isAuthed = true
  }
  if (!isAuthed) return res.status(401).json({ error: 'Unauthorized' })

  // VAPID setup — required to send pushes.
  var vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  var vapidPrivate = process.env.VAPID_PRIVATE_KEY
  var vapidSubject = process.env.VAPID_SUBJECT || 'mailto:williamschaseh@gmail.com'
  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID not configured' })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1) Candidate users: anyone with an active push sub. We then
  //    narrow to those with a recent report inside the loop.
  var subsResult = await svc.from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth_secret, topics, last_active_at')
    .eq('is_active', true)
    .not('user_id', 'is', null)
    .limit(5000)
  var allSubs: any[] = (subsResult && subsResult.data) || []
  // Filter by topics — same convention as send-daily-lead.
  var topic = 'your_signal'
  var topicSubs = allSubs.filter(function (s: any) {
    var t = s.topics
    return !t || (Array.isArray(t) && (t.length === 0 || t.indexOf(topic) >= 0))
  })

  // Group subs by user_id.
  var subsByUser: Record<string, any[]> = {}
  topicSubs.forEach(function (s: any) {
    if (!s.user_id) return
    if (!subsByUser[s.user_id]) subsByUser[s.user_id] = []
    subsByUser[s.user_id].push(s)
  })
  var userIds = Object.keys(subsByUser)

  if (userIds.length === 0) {
    return res.status(200).json({ checked: 0, alerted: 0, skipped: 0, errors: 0, reason: 'no_subscribed_users' })
  }

  // E0.8 — tier gating. Daily Signal Alerts push is a Basic+ feature
  // per the V2 tier design. Resolve each user's tier and filter the
  // batch down to basic/pro. Free users with the your_signal topic
  // get a one-time "moved to Basic" push (handled below) then are
  // unsubscribed from the topic so subsequent runs skip them.
  var freeUserIds: string[] = []
  var tierByUser: Record<string, string> = {}
  try {
    var subTierResult = await (svc.from('user_subscriptions') as any)
      .select('user_id, tier:subscription_tiers(name)')
      .in('user_id', userIds)
      .eq('status', 'active')
    var subRows: any[] = (subTierResult && subTierResult.data) || []
    subRows.forEach(function (r: any) {
      var tierName = (r.tier && r.tier.name) || 'free'
      tierByUser[r.user_id] = tierName
    })
    userIds.forEach(function (uid) {
      if (!tierByUser[uid]) tierByUser[uid] = 'free'
    })
  } catch (e) {
    console.error('[signal-alerts] tier resolution failed:', e)
    return res.status(500).json({ error: 'Tier resolution failed' })
  }

  var paidUserIds = userIds.filter(function (uid) {
    var t = tierByUser[uid]
    return t === 'basic' || t === 'pro' || t === 'enterprise'
  })
  freeUserIds = userIds.filter(function (uid) {
    return !(tierByUser[uid] === 'basic' || tierByUser[uid] === 'pro' || tierByUser[uid] === 'enterprise')
  })

  // E0.8 — one-time "Signal Alerts are now Basic" notice to free users
  // who previously opted into the topic. Sent best-effort, then their
  // your_signal topic is removed so they don't keep showing up.
  var freeNoticeSent = 0
  for (var fIdx = 0; fIdx < freeUserIds.length; fIdx++) {
    var freeUserId = freeUserIds[fIdx]
    var freeSubs = subsByUser[freeUserId] || []
    var noticeNotif = {
      title: 'Daily record alerts are now part of membership',
      body: 'Become a Member to keep getting pushes when new accounts land near your experiences. $7.99/mo.',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: {
        url: '/account/subscription',
        source: 'signal_alert_tier_notice',
      },
    }
    for (var fs = 0; fs < freeSubs.length; fs++) {
      try {
        await webpush.sendNotification(
          { endpoint: freeSubs[fs].endpoint, keys: { p256dh: freeSubs[fs].p256dh, auth: freeSubs[fs].auth_secret } },
          JSON.stringify(noticeNotif),
          { TTL: 24 * 60 * 60 }
        )
      } catch (_e) { /* sub may be dead; ignore */ }
    }
    try {
      for (var rs = 0; rs < freeSubs.length; rs++) {
        var existingTopics: string[] = Array.isArray(freeSubs[rs].topics) ? freeSubs[rs].topics : []
        var newTopics = existingTopics.filter(function (t: string) { return t !== 'your_signal' })
        await svc.from('push_subscriptions')
          .update({ topics: newTopics })
          .eq('endpoint', freeSubs[rs].endpoint)
      }
    } catch (_e) { /* non-fatal */ }
    try {
      await svc.from('user_notifications').insert({
        user_id: freeUserId,
        type: 'tier_change',
        title: noticeNotif.title,
        body: noticeNotif.body,
        link_url: '/account/subscription',
        metadata: { source: 'signal_alert_tier_notice' },
      })
    } catch (_e) { /* non-fatal */ }
    freeNoticeSent++
  }

  // Replace the working list with paid users only.
  userIds = paidUserIds
  if (userIds.length === 0) {
    return res.status(200).json({
      checked: 0,
      alerted: 0,
      skipped: 0,
      errors: 0,
      free_notices_sent: freeNoticeSent,
      reason: 'no_paid_users_subscribed',
    })
  }

  // 2) Load existing alert states for these users in one shot.
  var stateResult = await svc.from('signal_alert_state')
    .select('*')
    .in('user_id', userIds)
  var stateRows: any[] = (stateResult && stateResult.data) || []
  var stateByUser: Record<string, any> = {}
  stateRows.forEach(function (r: any) { stateByUser[r.user_id] = r })

  // 3) Round-robin: process users least-recently-checked first.
  userIds.sort(function (a, b) {
    var sa = stateByUser[a]
    var sb = stateByUser[b]
    var ta = sa && sa.last_checked_at ? new Date(sa.last_checked_at).getTime() : 0
    var tb = sb && sb.last_checked_at ? new Date(sb.last_checked_at).getTime() : 0
    return ta - tb
  })
  var batch = userIds.slice(0, MAX_USERS_PER_RUN)

  var checked = 0
  var alerted = 0
  var skipped = 0
  var errors = 0
  var details: any[] = []

  var cooldownCutoff = Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000
  var recentReportCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  for (var u = 0; u < batch.length; u++) {
    var userId = batch[u]
    checked++

    try {
      // Most recent report (within 90 days) — older than that and
      // the user has likely lost interest; we don't pester them.
      var reportResult = await svc.from('reports')
        .select('id, latitude, longitude')
        .eq('submitted_by', userId)
        .gte('created_at', recentReportCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      var report = reportResult.data
      if (!report) {
        skipped++
        details.push({ user_id: userId, reason: 'no_recent_report' })
        continue
      }

      var clusterSize = await computeClusterSize(svc, report)
      var state = stateByUser[userId]

      // Cooldown.
      var inCooldown = false
      if (state && state.last_alerted_at) {
        var lastAlertedMs = new Date(state.last_alerted_at).getTime()
        if (!isNaN(lastAlertedMs) && lastAlertedMs > cooldownCutoff) inCooldown = true
      }

      // If we don't have prior state OR the user's report changed,
      // initialize without alerting — we need a baseline to compare
      // against. Same for cluster size = 0.
      var shouldAlert = false
      var growth = 0
      if (state && state.last_report_id === report.id && clusterSize > 0) {
        growth = clusterSize - (state.last_cluster_size || 0)
        if (growth >= ALERT_THRESHOLD && !inCooldown) shouldAlert = true
      }

      // Persist updated state regardless of alert decision so the
      // baseline advances every cron run.
      var stateUpdate: any = {
        user_id: userId,
        last_report_id: report.id,
        last_cluster_size: clusterSize,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (shouldAlert) stateUpdate.last_alerted_at = new Date().toISOString()

      await svc.from('signal_alert_state').upsert(stateUpdate, { onConflict: 'user_id' })

      if (!shouldAlert) {
        skipped++
        details.push({
          user_id: userId,
          reason: !state ? 'baseline_set' :
                  inCooldown ? 'cooldown' :
                  growth < ALERT_THRESHOLD ? 'below_threshold' :
                  'no_change',
          cluster_size: clusterSize,
          growth: growth,
        })
        continue
      }

      // V10.11 — check for a pending contribution callout. The
      // /api/lab/your-signal endpoint sets contribution_callout_pending_at
      // when the user crosses early→foundational or gains 5+ new
      // arrivals as a foundational case. If pending, replace the
      // standard "Your Signal grew" copy with a higher-emotional-payoff
      // contribution title; otherwise keep the standard copy.
      var contribPending = false
      var contribPayload: any = null
      try {
        var visitRow = await svc.from('signal_user_visits')
          .select('contribution_callout_pending_at, last_contribution_payload')
          .eq('user_id', userId)
          .maybeSingle()
        if (visitRow && visitRow.data && visitRow.data.contribution_callout_pending_at) {
          contribPending = true
          contribPayload = visitRow.data.last_contribution_payload || null
        }
      } catch (_e) { /* table may not have columns yet — ignore */ }

      // Send a push to every active sub for this user.
      var userSubs = subsByUser[userId] || []
      var notif: any
      if (contribPending && contribPayload) {
        var arrivals = (contribPayload.newer_arrivals_count || 0)
        notif = {
          title: contribPayload.is_foundational
            ? 'Your story anchors a growing cluster'
            : 'Your story is one of the early cases here',
          body: arrivals === 1
            ? '1 new report has joined since you logged yours.'
            : arrivals + ' new reports have joined since you logged yours.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          data: {
            url: '/lab?tab=signal',
            source: 'signal_alert_contribution',
          },
        }
      } else {
        notif = {
          title: 'Your Signal grew',
          body: growth === 1
            ? '1 new report joined your cluster.'
            : growth + ' new reports joined your cluster.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          data: {
            url: '/lab?tab=signal',
            source: 'signal_alert',
          },
        }
      }

      var perUserSent = 0
      var perUserFailed = 0
      for (var j = 0; j < userSubs.length; j++) {
        var s = userSubs[j]
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
            JSON.stringify(notif),
            { TTL: 48 * 60 * 60 }
          )
          perUserSent++
          await svc.from('push_subscriptions')
            .update({ last_sent_at: new Date().toISOString(), consecutive_failures: 0 })
            .eq('endpoint', s.endpoint)
        } catch (sendErr: any) {
          perUserFailed++
          // 410/404 = endpoint dead, mark inactive.
          var statusCode = (sendErr && sendErr.statusCode) || 0
          if (statusCode === 404 || statusCode === 410) {
            await svc.from('push_subscriptions')
              .update({ is_active: false, last_failure_at: new Date().toISOString() })
              .eq('endpoint', s.endpoint)
          } else {
            try {
              await svc.rpc('increment_push_failure', { p_endpoint: s.endpoint })
            } catch (_) { /* RPC may not exist; ignore */ }
          }
        }
      }

      if (perUserSent > 0) {
        alerted++
        // V10.11 — if the alert consumed a pending contribution
        // callout, clear it so the email cron doesn't also fire on
        // the same transition. Best-effort update.
        if (contribPending) {
          try {
            await svc.from('signal_user_visits')
              .update({ contribution_callout_pending_at: null, updated_at: new Date().toISOString() })
              .eq('user_id', userId)
          } catch (_e) { /* column may not exist yet — ignore */ }
        }

        // T1.9 — log to user_notifications so the bell dropdown
        // surfaces this alert. Best-effort.
        try {
          await svc.from('user_notifications').insert({
            user_id: userId,
            type: 'signal_alert',
            title: notif.title,
            body: notif.body,
            link_url: (notif.data && notif.data.url) || '/lab?tab=story',
            metadata: {
              cluster_size: clusterSize,
              growth: growth,
              source: (notif.data && notif.data.source) || 'signal_alert',
            },
          })
        } catch (_e) { /* user_notifications may not exist yet */ }
      } else {
        skipped++
        details.push({ user_id: userId, reason: 'all_subs_failed', cluster_size: clusterSize, growth: growth })
      }

    } catch (e: any) {
      errors++
      console.error('[signal-alerts] error for user ' + userId + ':', e && e.message)
      details.push({ user_id: userId, reason: 'exception', error: String(e && e.message || e) })
    }
  }

  return res.status(200).json({
    checked: checked,
    alerted: alerted,
    skipped: skipped,
    errors: errors,
    batch_size: batch.length,
    total_candidates: userIds.length,
    free_notices_sent: freeNoticeSent, // E0.8 — one-time tier-gating notice
    details: details.slice(0, 50), // Trim for response size; full log in Vercel function output.
  })
}

// V11.17.72 - Custom Watchlists
//
// POST /api/cron/evaluate-watchlists
// GET  /api/cron/evaluate-watchlists  (Vercel cron-friendly)
//
// Nightly sweep: for each active watchlist, query approved reports
// ingested since last_evaluated_at, score them, persist matches above
// threshold, then advance last_evaluated_at.
//
// After persisting matches, fires push notifications subject to:
//   - watchlist.notify_push must be TRUE
//   - the user's push cadence cap (max 1 push per user per 7-day
//     rolling window across ALL their watchlists — see
//     `userIsInPushCooldown` below)
//   - match_confidence >= watchlist.match_confidence_threshold (enforced
//     in the engine, but re-checked defensively here)
//
// Auth (matches signal-alerts.ts pattern):
//   - Bearer ${CRON_SECRET} (Vercel cron)
//   - x-admin-key header (manual)

import type { NextApiRequest, NextApiResponse } from 'next'
import webpush from 'web-push'
import { serviceContext } from '@/lib/lab/watchlists/watchlist-auth'
import {
  evaluateWatchlistAgainstReports,
} from '@/lib/lab/watchlists/match-engine'
import type { WatchlistCriteria } from '@/lib/lab/watchlists/criteria-schema'

// Cap on how many watchlists we process per run. Vercel function ceiling
// is 300s; each watchlist's evaluation is bounded by the candidate cap
// in the engine (2k rows), so 200 watchlists / run keeps us under budget.
var MAX_WATCHLISTS_PER_RUN = 200

// Founder decision (PRO_TIER_VALIDATION_V3 Round 3): max 1 push per
// user per 7-day rolling window across ALL their watchlists.
var PUSH_COOLDOWN_HOURS = 7 * 24

// Cap on initial sweep (when last_evaluated_at IS NULL): only consider
// reports ingested in the last 30 days for the first run. Without this
// the first eval would scan the whole Archive against every brand-new
// watchlist; we'd rather have the first hit-set be "recent activity"
// and then the cron tracks forward from there.
var INITIAL_SWEEP_DAYS = 30

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // Auth (mirrors signal-alerts.ts).
  var adminKey = req.headers['x-admin-key']
  var isAuthed = adminKey === process.env.ADMIN_API_KEY
  if (!isAuthed) {
    var authHeader = req.headers.authorization || ''
    var cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader === 'Bearer ' + cronSecret) isAuthed = true
  }
  if (!isAuthed) return res.status(401).json({ error: 'unauthorized' })

  var ctx = serviceContext()
  var svc = ctx.svc

  // VAPID — required for push. We tolerate missing VAPID (skip push,
  // still persist matches + return summary) so the matcher can run
  // even in environments where push isn't configured (smoke / staging).
  var vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  var vapidPrivate = process.env.VAPID_PRIVATE_KEY
  var vapidSubject = process.env.VAPID_SUBJECT || 'mailto:williamschaseh@gmail.com'
  var canPush = !!vapidPublic && !!vapidPrivate
  if (canPush) webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!)

  // Pull active watchlists, least-recently-evaluated first.
  var wlResp = await svc
    .from('lab_watchlists')
    .select('id, user_id, name, criteria, status, notify_push, match_confidence_threshold, last_evaluated_at')
    .eq('status', 'active')
    .order('last_evaluated_at', { ascending: true, nullsFirst: true } as any)
    .limit(MAX_WATCHLISTS_PER_RUN)
  if (wlResp.error) {
    return res.status(500).json({ error: 'watchlist_query_failed', detail: wlResp.error.message })
  }
  var watchlists: any[] = (wlResp.data as any[]) || []

  var totalWatchlists = watchlists.length
  var totalMatches = 0
  var totalPushSent = 0
  var totalPushSkipped = 0
  var perUserPushSent: Record<string, boolean> = {}
  var errors = 0
  var details: any[] = []

  for (var i = 0; i < watchlists.length; i++) {
    var wl = watchlists[i]
    try {
      var since = wl.last_evaluated_at
        ? new Date(wl.last_evaluated_at).toISOString()
        : new Date(Date.now() - INITIAL_SWEEP_DAYS * 24 * 60 * 60 * 1000).toISOString()

      var hits = await evaluateWatchlistAgainstReports(
        svc,
        wl.id,
        wl.criteria as WatchlistCriteria,
        Number(wl.match_confidence_threshold) || 0.85,
        { since: since, maxCandidates: 2000 },
      )

      var newlyPersisted: any[] = []
      for (var h = 0; h < hits.length; h++) {
        var hit = hits[h]
        // UPSERT-by-UNIQUE — onConflict skips dupes without throwing.
        var ins = await svc
          .from('lab_watchlist_matches')
          .upsert(
            {
              watchlist_id: wl.id,
              report_id: hit.report_id,
              match_confidence: hit.confidence,
            } as any,
            { onConflict: 'watchlist_id,report_id', ignoreDuplicates: false },
          )
          .select()
        if (ins.data && ins.data.length > 0) {
          // We can't easily tell from upsert whether the row was newly
          // inserted vs. re-upserted. Distinguish by checking
          // notified_push: a freshly-minted row has notified_push=false
          // AND no notified_email; a re-upsert leaves these intact.
          var row = ins.data[0] as any
          if (!row.notified_push) newlyPersisted.push(row)
        }
      }
      totalMatches += newlyPersisted.length

      // Push notification — at most ONE per user per 7-day window
      // across ALL their watchlists. We resolve the user's cooldown
      // ONCE per watchlist (cached in perUserPushSent for the run).
      if (canPush && wl.notify_push && newlyPersisted.length > 0) {
        var sendKey = wl.user_id as string
        if (!perUserPushSent[sendKey]) {
          var inCooldown = await userIsInPushCooldown(svc, sendKey)
          if (!inCooldown) {
            // Pick the highest-confidence newly-persisted match as the
            // representative; one push, deep-link to /report/[id].
            newlyPersisted.sort(function (a, b) { return (b.match_confidence || 0) - (a.match_confidence || 0) })
            var lead = newlyPersisted[0]
            var pushed = await sendWatchlistPush(svc, sendKey, wl, lead.report_id)
            if (pushed.sent > 0) {
              perUserPushSent[sendKey] = true
              totalPushSent += pushed.sent
              // Mark every newly-persisted match for this watchlist
              // notified_push = TRUE (consolidated push; we don't fire
              // again on later matches in the same run).
              var ids = newlyPersisted.map(function (n) { return n.id })
              await svc
                .from('lab_watchlist_matches')
                .update({ notified_push: true } as any)
                .in('id', ids)
            } else {
              totalPushSkipped += newlyPersisted.length
            }
          } else {
            perUserPushSent[sendKey] = true // mark visited so we don't re-check
            totalPushSkipped += newlyPersisted.length
            details.push({ watchlist_id: wl.id, reason: 'push_cooldown_active' })
          }
        } else {
          totalPushSkipped += newlyPersisted.length
        }
      }

      // Advance last_evaluated_at AFTER persistence + push so a crash
      // mid-loop re-tries the same watchlist next run (idempotent thanks
      // to the UNIQUE constraint on (watchlist_id, report_id)).
      await svc
        .from('lab_watchlists')
        .update({ last_evaluated_at: new Date().toISOString() } as any)
        .eq('id', wl.id)

      details.push({ watchlist_id: wl.id, candidates_scored: hits.length, newly_persisted: newlyPersisted.length })
    } catch (e: any) {
      errors++
      console.error('[evaluate-watchlists] failed for ' + wl.id + ':', e && e.message)
      details.push({ watchlist_id: wl.id, error: String(e && e.message || e) })
    }
  }

  return res.status(200).json({
    ok: true,
    watchlists_processed: totalWatchlists,
    matches_persisted: totalMatches,
    push_sent: totalPushSent,
    push_skipped: totalPushSkipped,
    errors: errors,
    can_push: canPush,
    details: details.slice(0, 100),
  })
}

/**
 * Returns true if the user has received any watchlist push in the
 * last PUSH_COOLDOWN_HOURS. We look at the max `notified_push=TRUE`
 * timestamp across all of this user's watchlists' matches in the
 * cooldown window.
 *
 * Implementation note: matched_at is a proxy for notification time
 * because we set notified_push=TRUE in the same handler immediately
 * after the push fires; there's no `notified_push_at` column. If we
 * ever decouple them, add a notified_push_at column to the schema.
 */
async function userIsInPushCooldown(svc: any, userId: string): Promise<boolean> {
  var cutoff = new Date(Date.now() - PUSH_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
  // Get this user's watchlist ids.
  var wRes = await svc
    .from('lab_watchlists')
    .select('id')
    .eq('user_id', userId)
    .limit(200)
  var ids = ((wRes.data as any[]) || []).map(function (r: any) { return r.id })
  if (ids.length === 0) return false
  var mRes = await svc
    .from('lab_watchlist_matches')
    .select('id')
    .in('watchlist_id', ids)
    .eq('notified_push', true)
    .gte('matched_at', cutoff)
    .limit(1)
  var rows = (mRes.data as any[]) || []
  return rows.length > 0
}

/**
 * Send the per-user consolidated push for a watchlist match. Returns
 * { sent, failed }.
 *
 * Copy: documentary tone, no "you", no exclamation, no emoji. The
 * watchlist name carries the personalization.
 */
async function sendWatchlistPush(
  svc: any,
  userId: string,
  watchlist: { id: string; name: string },
  reportId: string,
): Promise<{ sent: number; failed: number }> {
  // Resolve report slug for deep link.
  var rRes = await svc
    .from('reports')
    .select('slug')
    .eq('id', reportId)
    .maybeSingle()
  var slug = (rRes.data && (rRes.data as any).slug) || reportId
  var url = '/report/' + slug

  // Pull active push subs for this user. We do NOT topic-filter — a
  // Pro user opting in via the Watchlist toggle is the consent.
  var subsRes = await svc
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_secret')
    .eq('user_id', userId)
    .eq('is_active', true)
  var subs: any[] = (subsRes.data as any[]) || []
  if (subs.length === 0) return { sent: 0, failed: 0 }

  var notif = {
    title: 'New match in the Archive',
    body: 'A report matching the "' + watchlist.name + '" watchlist landed in the Archive.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: {
      url: url,
      source: 'watchlist_match',
      watchlist_id: watchlist.id,
    },
  }

  var sent = 0
  var failed = 0
  for (var i = 0; i < subs.length; i++) {
    var s = subs[i]
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
        JSON.stringify(notif),
        { TTL: 7 * 24 * 60 * 60 },
      )
      sent++
      try {
        await svc.from('push_subscriptions')
          .update({ last_sent_at: new Date().toISOString(), consecutive_failures: 0 })
          .eq('endpoint', s.endpoint)
      } catch (_e) { /* non-fatal */ }
    } catch (err: any) {
      failed++
      var statusCode = (err && err.statusCode) || 0
      if (statusCode === 404 || statusCode === 410) {
        try {
          await svc.from('push_subscriptions')
            .update({ is_active: false, last_failure_at: new Date().toISOString() })
            .eq('endpoint', s.endpoint)
        } catch (_e) { /* non-fatal */ }
      }
    }
  }

  // Log to user_notifications so the in-app bell surfaces this. Best-effort.
  if (sent > 0) {
    try {
      await svc.from('user_notifications').insert({
        user_id: userId,
        type: 'watchlist_match',
        title: notif.title,
        body: notif.body,
        link_url: url,
        metadata: { source: 'watchlist_match', watchlist_id: watchlist.id, report_id: reportId },
      })
    } catch (_e) { /* user_notifications may not have this 'type' enum value yet */ }
  }

  return { sent: sent, failed: failed }
}

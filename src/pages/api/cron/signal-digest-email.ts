/**
 * GET /api/cron/signal-digest-email
 * POST /api/cron/signal-digest-email
 *
 * V10.9 Phase 2 — Resend-backed email digest of Signal activity.
 *
 * Mirrors signal-alerts.ts (push notifications) but delivers via
 * email. Two reasons we ship both:
 *   1. iOS Safari < 16.4 can't receive web push from a non-PWA;
 *      email is the universal fallback.
 *   2. Email is a low-friction reactivation channel for the
 *      single-stale-report cohort identified in the Signal audit.
 *
 * Eligibility:
 *   - signal_user_visits.email_digest_enabled = TRUE
 *   - email_digest_cadence: 'weekly' (default) or 'daily'
 *   - last_email_sent_at + cadence_window has elapsed
 *   - The user has at least one approved report submitted in the
 *     last 90 days (matches signal-alerts cohort logic)
 *
 * Payload per user:
 *   - new_in_cluster since last_email_sent_at OR previous_visited_at
 *   - new_in_archive (archive-wide growth, contextual)
 *   - peer count for their phenomenon_type / category
 *   - link back to /lab?tab=signal
 *
 * Auth (matches signal-alerts.ts pattern):
 *   - Bearer ${CRON_SECRET} (Vercel cron)
 *   - x-admin-key header (manual)
 *
 * Cron cadence (vercel.json): daily at 14:00 UTC. The endpoint
 * decides per-user whether they're due based on their cadence
 * preference and last_email_sent_at, so 'weekly' users only get
 * mail once per week even though the cron runs daily.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/services/email.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var CLUSTER_RADIUS_MI = 100
var DAILY_COOLDOWN_HOURS = 22 // give a little slack so daily-at-14:00 runs always send
var WEEKLY_COOLDOWN_HOURS = 6 * 24 + 22 // 7 days minus a slack window
var MAX_USERS_PER_RUN = 500
// V10.9 — soft growth threshold. We send the digest even when the
// only growth is "X new reports in the archive" (no cluster matches),
// but we DON'T send if literally nothing has happened. That bar
// trades a slightly higher unsubscribe rate for fewer empty pings.
var MIN_NEW_REPORTS_TO_SEND = 1

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildHtml(opts: {
  displayName: string | null
  newInCluster: number
  newInArchive: number
  reportTitle: string
  unsubscribeUrl: string
  signalUrl: string
  // V10.11 — when present, the email prepends a contribution block.
  contribution?: { is_foundational: boolean; is_early: boolean; newer_arrivals_count: number } | null
}): string {
  var name = opts.displayName ? opts.displayName.split(' ')[0] : 'there'
  // V10.9 — keep the HTML embeddable, no external CSS, table-based
  // layout for Outlook/Gmail compat. The brand purple matches the
  // app surface (#a855f7 / brand-purple-500).
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your Signal grew</title></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#15151f;border:1px solid #1f1f33;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a78bfa;font-weight:600;">Your Signal</p>
          <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#fff;line-height:1.3;">
            ${opts.newInCluster > 0
              ? (opts.newInCluster === 1
                  ? 'A new case joined your cluster'
                  : opts.newInCluster + ' new cases joined your cluster')
              : (opts.newInArchive + ' new cases landed in the archive')}
          </h1>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">
            Hi ${escapeHtml(name)} — since your last visit, the archive has grown around your story
            <em style="color:#a78bfa;font-style:normal;">${escapeHtml(opts.reportTitle)}</em>.
          </p>
          ${opts.contribution ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.4);border-radius:12px;padding:18px;margin-bottom:20px;">
            <tr><td>
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#c4b5fd;font-weight:600;">${opts.contribution.is_foundational ? 'Your story anchors a growing cluster' : 'Your story is one of the early cases here'}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#e5e7eb;">
                ${opts.contribution.is_foundational
                  ? 'Your report is one of the foundational cases at this location. '
                  : 'Your report arrived early in this cluster. '}
                <span style="color:#a78bfa;font-weight:600;">${opts.contribution.newer_arrivals_count}</span>
                ${opts.contribution.newer_arrivals_count === 1 ? 'report has' : 'reports have'} joined since you logged yours.
              </p>
            </td></tr>
          </table>
          ` : ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2a;border:1px solid #2a2a44;border-radius:12px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <p style="margin:0 0 12px 0;font-size:13px;color:#94a3b8;">Since you last looked:</p>
              ${opts.newInCluster > 0 ? `
              <p style="margin:0 0 8px 0;font-size:14px;color:#e5e7eb;">
                <span style="color:#a78bfa;font-weight:600;">${opts.newInCluster}</span>
                new ${opts.newInCluster === 1 ? 'case' : 'cases'} within ${CLUSTER_RADIUS_MI} miles of yours
              </p>` : ''}
              <p style="margin:0;font-size:14px;color:#e5e7eb;">
                <span style="color:#a78bfa;font-weight:600;">${opts.newInArchive}</span>
                new ${opts.newInArchive === 1 ? 'case' : 'cases'} added to the broader archive
              </p>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td>
              <a href="${opts.signalUrl}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">See your Signal</a>
            </td></tr>
          </table>
          <p style="margin:32px 0 0 0;font-size:12px;color:#64748b;line-height:1.5;">
            You're receiving this because you turned on Signal email digests.
            <a href="${opts.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
            or change the cadence in your Signal settings.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' })
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1. Find candidate users — opted in to email digest.
  // Defensive: if the table doesn't exist yet, exit cleanly.
  var subsResult: any
  try {
    // V10.11 — also pull contribution_callout_pending_at + the cached
    // contribution payload so the email cron can prepend a high-payoff
    // contribution block when one's pending. Defensive against the
    // V10.11 column-add migration not being applied yet — if those
    // columns don't exist, the SELECT still returns the basic fields
    // and contribution-related logic just no-ops.
    subsResult = await svc.from('signal_user_visits')
      .select('user_id, last_visited_at, previous_visited_at, last_email_sent_at, email_digest_cadence, contribution_callout_pending_at, last_contribution_payload')
      .eq('email_digest_enabled', true)
      .limit(5000)
  } catch (e: any) {
    return res.status(200).json({
      checked: 0, sent: 0, skipped: 0, errors: 0,
      reason: 'signal_user_visits table missing (run V10.9 migration)',
    })
  }

  var subs: any[] = (subsResult && subsResult.data) || []
  if (subs.length === 0) {
    return res.status(200).json({ checked: 0, sent: 0, skipped: 0, errors: 0, reason: 'no_subscribers' })
  }

  // 2. Round-robin: oldest last_email_sent_at first.
  subs.sort(function (a: any, b: any) {
    var ta = a.last_email_sent_at ? new Date(a.last_email_sent_at).getTime() : 0
    var tb = b.last_email_sent_at ? new Date(b.last_email_sent_at).getTime() : 0
    return ta - tb
  })
  var batch = subs.slice(0, MAX_USERS_PER_RUN)

  var checked = 0
  var sent = 0
  var skipped = 0
  var errors = 0
  var details: any[] = []

  var nowMs = Date.now()
  var recentReportCutoff = new Date(nowMs - 90 * 24 * 60 * 60 * 1000).toISOString()

  for (var i = 0; i < batch.length; i++) {
    var sub = batch[i]
    checked++
    try {
      // Cooldown check based on per-user cadence preference.
      var cadenceHours = sub.email_digest_cadence === 'daily'
        ? DAILY_COOLDOWN_HOURS
        : WEEKLY_COOLDOWN_HOURS
      var cooldownCutoffMs = nowMs - cadenceHours * 60 * 60 * 1000
      if (sub.last_email_sent_at) {
        var lastMs = new Date(sub.last_email_sent_at).getTime()
        if (!isNaN(lastMs) && lastMs > cooldownCutoffMs) {
          skipped++
          details.push({ user_id: sub.user_id, reason: 'cooldown', cadence: sub.email_digest_cadence })
          continue
        }
      }

      // Fetch user email + name.
      var userResult = await svc.auth.admin.getUserById(sub.user_id)
      var authUser = userResult.data && userResult.data.user
      if (!authUser || !authUser.email) {
        skipped++
        details.push({ user_id: sub.user_id, reason: 'no_email' })
        continue
      }

      var profResult = await svc.from('profiles').select('display_name').eq('id', sub.user_id).maybeSingle()
      var displayName = (profResult && profResult.data && profResult.data.display_name) || null

      // User's most recent eligible report.
      var reportResult = await svc.from('reports')
        .select('id, title, latitude, longitude')
        .eq('submitted_by', sub.user_id)
        .gte('created_at', recentReportCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      var report = reportResult.data
      if (!report) {
        skipped++
        details.push({ user_id: sub.user_id, reason: 'no_recent_report' })
        continue
      }

      // Compute deltas since last_email_sent_at OR previous_visited_at,
      // whichever is older (we care about everything since we last
      // CONTACTED the user).
      var sinceIso = sub.last_email_sent_at || sub.previous_visited_at || sub.last_visited_at
      if (!sinceIso) {
        skipped++
        details.push({ user_id: sub.user_id, reason: 'no_baseline' })
        continue
      }

      var archiveResult = await svc.from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gt('created_at', sinceIso)
      var newInArchive = (archiveResult && archiveResult.count) || 0

      var newInCluster = 0
      if (typeof report.latitude === 'number' && typeof report.longitude === 'number') {
        var latDelta = CLUSTER_RADIUS_MI / 69
        var lngDelta = CLUSTER_RADIUS_MI / (69 * Math.cos(report.latitude * Math.PI / 180) || 1)
        var clusterResult = await svc.from('reports')
          .select('id, latitude, longitude')
          .eq('status', 'approved')
          .neq('id', report.id)
          .gt('created_at', sinceIso)
          .gte('latitude', report.latitude - latDelta)
          .lte('latitude', report.latitude + latDelta)
          .gte('longitude', report.longitude - lngDelta)
          .lte('longitude', report.longitude + lngDelta)
          .limit(2000)
        var rows: any[] = (clusterResult && clusterResult.data) || []
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j]
          if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
          if (haversineMi(report.latitude, report.longitude, r.latitude, r.longitude) <= CLUSTER_RADIUS_MI) newInCluster++
        }
      }

      if (newInArchive < MIN_NEW_REPORTS_TO_SEND) {
        skipped++
        details.push({ user_id: sub.user_id, reason: 'no_new_activity', new_in_archive: newInArchive })
        continue
      }

      // V10.11 — pull contribution callout if pending. Subject line
      // upgrades to the contribution framing when present (higher
      // open rate; concrete to the user's own story).
      var contribPending = !!sub.contribution_callout_pending_at
      var contribPayload = (contribPending && sub.last_contribution_payload) || null

      // Build + send.
      var html = buildHtml({
        displayName: displayName,
        newInCluster: newInCluster,
        newInArchive: newInArchive,
        reportTitle: report.title || 'your experience',
        unsubscribeUrl: 'https://www.discoverparadocs.com/lab?tab=signal#email-prefs',
        signalUrl: 'https://www.discoverparadocs.com/lab?tab=signal',
        contribution: contribPayload,
      })
      var subject: string
      if (contribPayload && contribPayload.is_foundational) {
        subject = 'Your story anchors a growing cluster on Paradocs'
      } else if (contribPayload && contribPayload.is_early) {
        subject = 'New cases joined the cluster you started'
      } else if (newInCluster > 0) {
        subject = newInCluster === 1
          ? 'A new case joined your cluster on Paradocs'
          : newInCluster + ' new cases joined your cluster on Paradocs'
      } else {
        subject = 'New activity in your Signal'
      }

      var emailResult = await sendEmail({
        to: authUser.email,
        subject: subject,
        html: html,
        tags: [
          { name: 'category', value: 'signal_digest' },
          { name: 'cadence', value: sub.email_digest_cadence },
        ],
      })

      if (!emailResult.success) {
        errors++
        details.push({ user_id: sub.user_id, reason: 'send_failed', error: emailResult.error })
        continue
      }

      // Stamp last_email_sent_at so the cooldown advances. V10.11 —
      // also clear contribution_callout_pending_at when we consumed
      // a contribution callout, so each transition produces exactly
      // one notification (this digest OR a push, whichever fires
      // first). Best-effort UPDATE; if the column doesn't exist yet
      // (migration pending) it'll error and we just skip clearing.
      var updatePayload: any = {
        last_email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (contribPending) {
        updatePayload.contribution_callout_pending_at = null
      }
      await svc.from('signal_user_visits').update(updatePayload).eq('user_id', sub.user_id)

      // T1.9 — log to user_notifications so the bell dropdown surfaces
      // this digest. Best-effort.
      try {
        await svc.from('user_notifications').insert({
          user_id: sub.user_id,
          type: 'signal_digest',
          title: subject,
          body: newInCluster > 0
            ? (newInCluster === 1
                ? '1 new case in your cluster.'
                : newInCluster + ' new cases in your cluster.')
            : 'New activity in your Signal.',
          link_url: '/lab?tab=story',
          metadata: {
            cadence: sub.email_digest_cadence,
            new_in_cluster: newInCluster,
            source: 'signal_digest_email',
          },
        })
      } catch (_e) { /* user_notifications may not exist yet */ }

      sent++
    } catch (e: any) {
      errors++
      console.error('[signal-digest-email] error for user ' + sub.user_id + ':', e && e.message)
      details.push({ user_id: sub.user_id, reason: 'exception', error: String(e && e.message || e) })
    }
  }

  return res.status(200).json({
    checked: checked,
    sent: sent,
    skipped: skipped,
    errors: errors,
    batch_size: batch.length,
    total_subscribers: subs.length,
    details: details.slice(0, 50),
  })
}

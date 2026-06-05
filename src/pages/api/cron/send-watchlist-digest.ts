// V11.17.72 - Custom Watchlists
//
// POST /api/cron/send-watchlist-digest
// GET  /api/cron/send-watchlist-digest
//
// Weekly digest — Sundays 09:00 UTC. For each user with one or more
// undelivered watchlist matches in the last 7 days (and at least one
// watchlist with notify_email_weekly = TRUE), build a single grouped
// HTML email and send via Resend. Mark matches notified_email = TRUE.
//
// Auth: Bearer CRON_SECRET OR x-admin-key.

import type { NextApiRequest, NextApiResponse } from 'next'
import { serviceContext } from '@/lib/lab/watchlists/watchlist-auth'
import { sendEmail } from '@/lib/services/email.service'

var MAX_USERS_PER_RUN = 500
var DIGEST_LOOKBACK_DAYS = 7

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var adminKey = req.headers['x-admin-key']
  var isAuthed = adminKey === process.env.ADMIN_API_KEY
  if (!isAuthed) {
    var authHeader = req.headers.authorization || ''
    var cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader === 'Bearer ' + cronSecret) isAuthed = true
  }
  if (!isAuthed) return res.status(401).json({ error: 'unauthorized' })

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({
      ok: true,
      sent: 0,
      reason: 'RESEND_API_KEY not configured — skipping send (gap intentional, see TIER3B_WATCHLISTS_BUILD_NOTES.md)',
    })
  }

  var svc = serviceContext().svc

  // 1) Pull pending matches (notified_email=FALSE) in the lookback window.
  var since = new Date(Date.now() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  var mResp = await svc
    .from('lab_watchlist_matches')
    .select('id, watchlist_id, report_id, matched_at, match_confidence')
    .eq('notified_email', false)
    .eq('dismissed', false)
    .gte('matched_at', since)
    .order('matched_at', { ascending: false })
    .limit(5000)
  if (mResp.error) {
    return res.status(500).json({ error: 'matches_query_failed', detail: mResp.error.message })
  }
  var matches: any[] = (mResp.data as any[]) || []
  if (matches.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, reason: 'no_pending_matches' })
  }

  // 2) Resolve watchlists for these matches; filter to those with email opt-in.
  var watchlistIds = Array.from(new Set(matches.map(function (m) { return m.watchlist_id })))
  var wResp = await svc
    .from('lab_watchlists')
    .select('id, user_id, name, notify_email_weekly')
    .in('id', watchlistIds)
  if (wResp.error) {
    return res.status(500).json({ error: 'watchlist_query_failed', detail: wResp.error.message })
  }
  var watchlistById: Record<string, any> = {}
  ;((wResp.data as any[]) || []).forEach(function (w: any) {
    if (w.notify_email_weekly) watchlistById[w.id] = w
  })

  // 3) Group matches by user → watchlist.
  var byUser: Record<string, { wls: Record<string, { wl: any; matches: any[] }> }> = {}
  matches.forEach(function (m: any) {
    var wl = watchlistById[m.watchlist_id]
    if (!wl) return // filtered out by email opt-in
    var uid = wl.user_id
    if (!byUser[uid]) byUser[uid] = { wls: {} }
    if (!byUser[uid].wls[wl.id]) byUser[uid].wls[wl.id] = { wl: wl, matches: [] }
    byUser[uid].wls[wl.id].matches.push(m)
  })
  var userIds = Object.keys(byUser).slice(0, MAX_USERS_PER_RUN)
  if (userIds.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, reason: 'no_users_with_email_opt_in' })
  }

  // 4) Hydrate report payloads for the digest body.
  var allReportIds = matches.map(function (m) { return m.report_id })
  var rResp = await svc
    .from('reports')
    .select('id, slug, title, summary, category, city, state_province, country, event_date')
    .in('id', allReportIds)
  var reportById: Record<string, any> = {}
  ;((rResp.data as any[]) || []).forEach(function (r: any) { reportById[r.id] = r })

  var sent = 0
  var skipped = 0
  var errors = 0
  var details: any[] = []
  var allMatchIdsToMark: number[] = []

  for (var i = 0; i < userIds.length; i++) {
    var userId = userIds[i]
    var bundle = byUser[userId]

    // Resolve email + display_name.
    var authUser: any = null
    try {
      var ar = await svc.auth.admin.getUserById(userId)
      authUser = ar.data && ar.data.user
    } catch (_e) { /* nothing */ }
    if (!authUser || !authUser.email) {
      skipped++
      details.push({ user_id: userId, reason: 'no_email' })
      continue
    }
    var profResp = await svc.from('profiles').select('display_name').eq('id', userId).maybeSingle()
    var displayName: string | null = (profResp.data && (profResp.data as any).display_name) || null

    // Build the per-watchlist sections — up to 5 matches per watchlist.
    var html = buildDigestHtml({
      displayName: displayName,
      bundle: bundle,
      reportById: reportById,
    })

    var subject = 'This week in your watchlists'

    var emailRes = await sendEmail({
      to: authUser.email,
      subject: subject,
      html: html,
      tags: [
        { name: 'category', value: 'watchlist_digest' },
      ],
    })

    if (!emailRes.success) {
      errors++
      details.push({ user_id: userId, reason: 'send_failed', error: emailRes.error })
      continue
    }

    sent++
    // Stage match IDs to mark notified_email after the loop.
    Object.keys(bundle.wls).forEach(function (wlId) {
      bundle.wls[wlId].matches.forEach(function (m: any) { allMatchIdsToMark.push(m.id) })
    })

    // Bell log — best-effort.
    try {
      await svc.from('user_notifications').insert({
        user_id: userId,
        type: 'watchlist_digest',
        title: subject,
        body: summarizeBundle(bundle),
        link_url: '/lab',
        metadata: { source: 'watchlist_digest', match_count: countMatches(bundle) },
      })
    } catch (_e) { /* non-fatal */ }
  }

  // Mark all-at-once at the end.
  if (allMatchIdsToMark.length > 0) {
    try {
      await svc
        .from('lab_watchlist_matches')
        .update({ notified_email: true } as any)
        .in('id', allMatchIdsToMark)
    } catch (e: any) {
      console.error('[send-watchlist-digest] mark-notified failed:', e && e.message)
    }
  }

  return res.status(200).json({
    ok: true,
    sent: sent,
    skipped: skipped,
    errors: errors,
    candidates: userIds.length,
    matches_marked: allMatchIdsToMark.length,
    details: details.slice(0, 50),
  })
}

/* -------------------------------------------------------------------------- */
/* Email rendering                                                              */
/* -------------------------------------------------------------------------- */

function buildDigestHtml(opts: {
  displayName: string | null
  bundle: { wls: Record<string, { wl: any; matches: any[] }> }
  reportById: Record<string, any>
}): string {
  var name = opts.displayName ? opts.displayName.split(' ')[0] : 'there'
  var sections = Object.keys(opts.bundle.wls).map(function (wlId) {
    var section = opts.bundle.wls[wlId]
    var ms = section.matches.slice(0, 5)
    var rows = ms.map(function (m) {
      var rep = opts.reportById[m.report_id]
      if (!rep) return ''
      var loc = [rep.city, rep.state_province, rep.country].filter(Boolean).join(', ')
      var eventDate = rep.event_date ? new Date(rep.event_date).toISOString().slice(0, 10) : 'undated'
      var href = 'https://www.discoverparadocs.com/report/' + (rep.slug || rep.id)
      return (
        '<tr><td style="padding:12px 0;border-bottom:1px solid #1f1f33;">' +
          '<a href="' + href + '" style="color:#a78bfa;text-decoration:none;font-weight:600;font-size:14px;">' + escapeHtml(rep.title || 'Untitled report') + '</a>' +
          '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">' + escapeHtml(eventDate) + (loc ? ' &middot; ' + escapeHtml(loc) : '') + '</div>' +
        '</td></tr>'
      )
    }).join('')
    var more = section.matches.length > 5
      ? '<p style="margin:8px 0 0;font-size:12px;color:#64748b;">+ ' + (section.matches.length - 5) + ' more</p>'
      : ''
    return (
      '<div style="margin-top:24px;padding:16px;background:#15151f;border:1px solid #1f1f33;border-radius:12px;">' +
        '<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a78bfa;font-weight:600;">Watchlist</p>' +
        '<h3 style="margin:0 0 12px;font-size:16px;color:#fff;">' + escapeHtml(section.wl.name) + '</h3>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table>' +
        more +
      '</div>'
    )
  }).join('')

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>This week in your watchlists</title></head>' +
    '<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#e5e7eb;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:32px 16px;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a0a14;padding:0;"><tr><td>' +
    '<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a78bfa;font-weight:600;">Paradocs Archive</p>' +
    '<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;line-height:1.3;">This week in the Archive</h1>' +
    '<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#cbd5e1;">' + escapeHtml(name) + ' — the watchlists below surfaced new reports this week.</p>' +
    sections +
    '<p style="margin:32px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Manage your watchlists at <a href="https://www.discoverparadocs.com/lab" style="color:#94a3b8;text-decoration:underline;">discoverparadocs.com/lab</a>.</p>' +
    '</td></tr></table></td></tr></table></body></html>'
}

function summarizeBundle(bundle: { wls: Record<string, { wl: any; matches: any[] }> }): string {
  var total = countMatches(bundle)
  var nWls = Object.keys(bundle.wls).length
  if (nWls === 1) {
    return total === 1 ? '1 new match in your watchlist.' : total + ' new matches in your watchlist.'
  }
  return total + ' new matches across ' + nWls + ' watchlists.'
}

function countMatches(bundle: { wls: Record<string, { wl: any; matches: any[] }> }): number {
  var n = 0
  Object.keys(bundle.wls).forEach(function (k) { n += bundle.wls[k].matches.length })
  return n
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

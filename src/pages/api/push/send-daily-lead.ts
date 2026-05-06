/**
 * POST /api/push/send-daily-lead
 * GET  /api/push/send-daily-lead   (Vercel cron-friendly)
 *
 * V9.4 — sends Today's Lead push_copy to all active subscriptions
 * subscribed to the 'daily_lead' topic. Called by Vercel cron daily
 * at 8 AM UTC (configurable via vercel.json crons).
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) OR x-admin-key (manual).
 *
 * Behavior:
 *   1. Read today's daily_leads row → phenomenon_id
 *   2. Read phenomenon's push_copy + slug
 *   3. Read all active push_subscriptions where 'daily_lead' in topics
 *   4. POST a Web Push notification to each endpoint via web-push lib
 *   5. On 410 (Gone) or 404 → mark subscription is_active=false
 *   6. On other errors → increment consecutive_failures; auto-disable
 *      after 5 consecutive failures
 *
 * Returns: { sent, failed, disabled, total }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function todayUTC(): string {
  var d = new Date()
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0')
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

  // VAPID config
  var vapidPublic = process.env.VAPID_PUBLIC_KEY
  var vapidPrivate = process.env.VAPID_PRIVATE_KEY
  var vapidSubject = process.env.VAPID_SUBJECT || 'mailto:williamschaseh@gmail.com'
  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID keys not configured' })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  var supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) Today's lead
  var leadDate = todayUTC()
  var { data: lead } = await supabase
    .from('daily_leads')
    .select('phenomenon_id, report_id')
    .eq('lead_date', leadDate)
    .maybeSingle()

  if (!lead || (!lead.phenomenon_id && !lead.report_id)) {
    return res.status(200).json({ skipped: true, reason: 'no_lead_for_today', lead_date: leadDate })
  }

  // 2) Resolve push_copy + slug
  var pushCopy: string | null = null
  var slug: string | null = null
  var name: string | null = null
  var targetPath: string = '/discover'

  if (lead.phenomenon_id) {
    var { data: phen } = await supabase
      .from('phenomena')
      .select('push_copy, slug, name')
      .eq('id', lead.phenomenon_id)
      .single()
    if (phen) {
      pushCopy = (phen as any).push_copy
      slug = (phen as any).slug
      name = (phen as any).name
      targetPath = '/phenomena/' + slug
    }
  } else if (lead.report_id) {
    var { data: rep } = await supabase
      .from('reports')
      .select('push_copy, slug, title')
      .eq('id', lead.report_id)
      .single()
    if (rep) {
      pushCopy = (rep as any).push_copy
      slug = (rep as any).slug
      name = (rep as any).title
      targetPath = '/report/' + slug
    }
  }

  if (!pushCopy || pushCopy.substring(0, 2) === '__') {
    return res.status(200).json({ skipped: true, reason: 'no_push_copy', lead_date: leadDate })
  }

  // 3) Active subscriptions on the daily_lead topic
  var { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret, consecutive_failures')
    .eq('is_active', true)
    .contains('topics', ['daily_lead'])

  if (!subs || subs.length === 0) {
    return res.status(200).json({ skipped: true, reason: 'no_subscribers', lead_date: leadDate })
  }

  // 4) Send to each
  var notif = {
    title: 'Paradocs',
    body: pushCopy,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: targetPath,
      lead_date: leadDate,
      phenomenon: slug,
    },
  }

  var sent = 0
  var failed = 0
  var disabled = 0

  for (var i = 0; i < subs.length; i++) {
    var s = subs[i] as any
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth_secret },
        },
        JSON.stringify(notif),
        { TTL: 24 * 60 * 60 } // expire after a day
      )
      sent++
      await supabase
        .from('push_subscriptions')
        .update({
          last_sent_at: new Date().toISOString(),
          consecutive_failures: 0,
          last_failure_at: null,
        })
        .eq('id', s.id)
    } catch (err: any) {
      failed++
      var statusCode = err && err.statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Endpoint gone — disable permanently
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false, last_failure_at: new Date().toISOString() })
          .eq('id', s.id)
        disabled++
      } else {
        var nextFails = (s.consecutive_failures || 0) + 1
        var update: any = {
          last_failure_at: new Date().toISOString(),
          consecutive_failures: nextFails,
        }
        if (nextFails >= 5) {
          update.is_active = false
          disabled++
        }
        await supabase.from('push_subscriptions').update(update).eq('id', s.id)
      }
    }
  }

  return res.status(200).json({
    lead_date: leadDate,
    name: name,
    push_copy: pushCopy,
    target: targetPath,
    sent: sent,
    failed: failed,
    disabled: disabled,
    total: subs.length,
  })
}

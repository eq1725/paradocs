// V11.17.73 — Named-Match + DM
//
// POST /api/lab/named-match/threads/[id]/messages
//   - Send a new message into a thread. Text only, ≤2000 chars.
//   - Auth: Basic+. Caller must be a party to the thread; thread must
//     be in state='open'.
//   - Fires a push to the counterparty (best-effort, separate cadence
//     from the watchlist push cap — DMs are interactive and we let
//     them through subject to web-push subscription health).

import type { NextApiRequest, NextApiResponse } from 'next'
import webpush from 'web-push'
import { resolveNamedMatchContext, isBasicOrAbove } from '@/lib/lab/named-match/named-match-auth'

var MAX_BODY_LEN = 2000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveNamedMatchContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (!isBasicOrAbove(ctx.tier)) {
    return res.status(403).json({ error: 'basic_tier_required', tier: ctx.tier })
  }

  var threadId = (req.query.id as string) || ''
  if (!threadId) return res.status(400).json({ error: 'missing_id' })

  var body = (req.body || {}).body as string | undefined
  if (typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'empty_body' })
  }
  if (body.length > MAX_BODY_LEN) {
    return res.status(400).json({ error: 'body_too_long', max: MAX_BODY_LEN })
  }

  // Thread validation.
  var tResp = await ctx.svc
    .from('lab_dm_threads')
    .select('id, user_a_id, user_b_id, state')
    .eq('id', threadId)
    .maybeSingle()
  if (tResp.error) return res.status(500).json({ error: 'thread_fetch_failed', detail: tResp.error.message })
  var thread: any = tResp.data
  if (!thread) return res.status(404).json({ error: 'thread_not_found' })
  if (thread.user_a_id !== ctx.user.id && thread.user_b_id !== ctx.user.id) {
    return res.status(403).json({ error: 'not_a_party' })
  }
  if (thread.state !== 'open') return res.status(409).json({ error: 'thread_closed' })

  var insResp = await ctx.svc
    .from('lab_dm_messages')
    .insert({
      thread_id: threadId,
      sender_user_id: ctx.user.id,
      body: body,
    } as any)
    .select()
    .single()
  if (insResp.error) return res.status(500).json({ error: 'insert_failed', detail: insResp.error.message })

  // Fire-and-forget push to the counterparty (non-fatal).
  var otherId = thread.user_a_id === ctx.user.id ? thread.user_b_id : thread.user_a_id
  try {
    await sendDmPush(ctx.svc, otherId, threadId)
  } catch (_e) {
    /* non-fatal */
  }

  return res.status(200).json({ ok: true, message: insResp.data })
}

async function sendDmPush(svc: any, userId: string, threadId: string): Promise<void> {
  var vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  var vapidPrivate = process.env.VAPID_PRIVATE_KEY
  var vapidSubject = process.env.VAPID_SUBJECT || 'mailto:williamschaseh@gmail.com'
  if (!vapidPublic || !vapidPrivate) return
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  // Counterparty display_name for the title (best effort; default to
  // "another contributor" so we still ship even when profile is empty).
  var pResp = await svc.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  var _counterpartyName = (pResp.data && (pResp.data as any).display_name) || 'Another contributor'

  var subs = await svc
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_secret')
    .eq('user_id', userId)
    .eq('is_active', true)
  var rows: any[] = (subs.data as any[]) || []
  if (rows.length === 0) return

  var url = '/lab#thread-' + threadId
  var notif = {
    title: 'A new message',
    body: 'You have a new message in your named-match thread.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: url, source: 'named_match_dm', thread_id: threadId },
  }

  for (var i = 0; i < rows.length; i++) {
    var s = rows[i]
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
        JSON.stringify(notif),
        { TTL: 7 * 24 * 60 * 60 },
      )
      try {
        await svc.from('push_subscriptions')
          .update({ last_sent_at: new Date().toISOString(), consecutive_failures: 0 })
          .eq('endpoint', s.endpoint)
      } catch (_e) { /* non-fatal */ }
    } catch (err: any) {
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

  // Log to bell.
  try {
    await svc.from('user_notifications').insert({
      user_id: userId,
      type: 'named_match_dm',
      title: notif.title,
      body: notif.body,
      link_url: url,
      metadata: { source: 'named_match_dm', thread_id: threadId },
    })
  } catch (_e) { /* non-fatal */ }
}

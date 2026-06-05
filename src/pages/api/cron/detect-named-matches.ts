// V11.17.73 — Named-Match + DM
//
// POST /api/cron/detect-named-matches
// GET  /api/cron/detect-named-matches  (Vercel cron-friendly)
//
// Nightly sweep: scan all discoverable reports owned by Basic+ users,
// score every same-phen_family pair, emit offers where confidence >=
// 0.85 AND no suppression AND under the per-user 7-day cadence cap.
//
// Also handles two housekeeping passes:
//   - Expire offers that are past their expires_at (state → 'expired').
//   - Sweep stale suppressions can be left to the partial index; nothing
//     to do server-side, the lookup query filters by suppressed_until.
//
// On each newly-persisted offer that is currently visible to the
// initiator (state='pending'), fire ONE push to the initiator with
// documentary-tone copy. The recipient is NOT pushed until the
// initiator accepts (state→'initiator_accepted') — there's currently
// no push from that transition; we'll add it when the recipient-side
// notification cadence is decided. (Open question logged in build notes.)
//
// Auth: Bearer CRON_SECRET OR x-admin-key.

import type { NextApiRequest, NextApiResponse } from 'next'
import webpush from 'web-push'
import { serviceContext } from '@/lib/lab/named-match/named-match-auth'
import {
  detectNamedMatches,
  type CandidateOffer,
} from '@/lib/lab/named-match/match-engine'

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

  var svc = serviceContext().svc

  // Push setup — gracefully skip when VAPID isn't configured.
  var vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  var vapidPrivate = process.env.VAPID_PRIVATE_KEY
  var vapidSubject = process.env.VAPID_SUBJECT || 'mailto:williamschaseh@gmail.com'
  var canPush = !!vapidPublic && !!vapidPrivate
  if (canPush) webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!)

  // 1) Expire stale offers.
  var nowIso = new Date().toISOString()
  var expiredSet: any[] = []
  try {
    var exp = await svc
      .from('lab_named_match_offers')
      .update({ state: 'expired' } as any)
      .lt('expires_at', nowIso)
      .in('state', ['pending', 'initiator_accepted'])
      .select('id')
    expiredSet = ((exp.data as any[]) || [])
  } catch (_e) { /* non-fatal */ }

  // 2) Run the matcher.
  var result = await detectNamedMatches(svc)
  var offers = result.offers
  var stats = result.stats

  // 3) Persist offers — one row each, dedup via UNIQUE pair on
  //    (initiator_report_id, recipient_report_id).
  var persistedIds: string[] = []
  var insertErrors = 0
  for (var i = 0; i < offers.length; i++) {
    var o = offers[i]
    var ins = await svc
      .from('lab_named_match_offers')
      .insert({
        initiator_user_id: o.initiator_user_id,
        initiator_report_id: o.initiator_report_id,
        recipient_user_id: o.recipient_user_id,
        recipient_report_id: o.recipient_report_id,
        signal_overlap_count: o.signal_overlap_count,
        match_confidence: o.match_confidence,
        anonymous_payload: o.anonymous_payload,
      } as any)
      .select('id')
      .single()
    if (ins.error) {
      insertErrors++
      continue
    }
    persistedIds.push((ins.data as any).id)
  }

  // 4) Push notify the initiators (one per offer; the cadence cap
  //    already guaranteed ≤1 NEW offer per user per 7 days).
  var pushSent = 0
  var pushSkipped = 0
  if (canPush) {
    for (var p = 0; p < offers.length && p < persistedIds.length; p++) {
      var offer = offers[p]
      try {
        var sent = await pushNamedMatchOfferToInitiator(svc, offer)
        if (sent > 0) pushSent += sent
        else pushSkipped++
      } catch (_e) {
        pushSkipped++
      }
    }
  } else {
    pushSkipped = offers.length
  }

  return res.status(200).json({
    ok: true,
    expired_offers: expiredSet.length,
    offers_persisted: persistedIds.length,
    insert_errors: insertErrors,
    push_sent: pushSent,
    push_skipped: pushSkipped,
    can_push: canPush,
    stats: stats,
  })
}

async function pushNamedMatchOfferToInitiator(svc: any, offer: CandidateOffer): Promise<number> {
  // Pull active push subs for the initiator.
  var subsResp = await svc
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_secret')
    .eq('user_id', offer.initiator_user_id)
    .eq('is_active', true)
  var subs: any[] = (subsResp.data as any[]) || []
  if (subs.length === 0) return 0

  // Anonymous-payload-only copy. Documentary register.
  var fam = (offer.anonymous_payload && offer.anonymous_payload.phen_family) || 'experience'
  var decade = (offer.anonymous_payload && offer.anonymous_payload.decade) || null
  var decStr = decade ? (decade + 's') : 'undated'
  var notif = {
    title: 'A new match in My Record',
    body:
      'Another contributor\'s account shares ' + offer.signal_overlap_count +
      ' of 8 signals with your ' + decStr + ' ' + readableFamily(fam) + ' account. Visit My Record to view.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: {
      url: '/lab#offers',
      source: 'named_match_offer',
    },
  }

  var sent = 0
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

  if (sent > 0) {
    try {
      await svc.from('user_notifications').insert({
        user_id: offer.initiator_user_id,
        type: 'named_match_offer',
        title: notif.title,
        body: notif.body,
        link_url: '/lab#offers',
        metadata: { source: 'named_match_offer', signal_overlap_count: offer.signal_overlap_count },
      })
    } catch (_e) { /* non-fatal */ }
  }

  return sent
}

function readableFamily(slug: string): string {
  if (!slug) return 'experience'
  if (slug === 'ufos_aliens') return 'UFO-shape'
  if (slug === 'ghosts_hauntings') return 'apparition'
  if (slug === 'cryptids') return 'cryptid'
  if (slug === 'psychic_phenomena') return 'psychic'
  if (slug === 'consciousness_practices') return 'consciousness'
  if (slug === 'perception_sensory') return 'perception'
  return slug.replace(/_/g, ' ')
}

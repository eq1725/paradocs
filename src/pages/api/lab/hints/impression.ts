// V11.17.65 — POST /api/lab/hints/impression
//
// Logs a Hint impression event for the authenticated user. Body:
//   {
//     hint_id: string,            // required
//     event: 'shown' | 'cta_clicked' | 'dismissed'
//   }
//
// 'shown' inserts a new row. 'cta_clicked' / 'dismissed' update the
// most recent shown-row for that user+hint_id within the last 24h
// (best-effort — failures fall through silently because impression
// logging is observational, not load-bearing).

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var ALLOWED_EVENTS = ['shown', 'cta_clicked', 'dismissed']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var authHeader = req.headers.authorization || ''
    var token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Not authenticated' })

    var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + token } },
    })
    var userResult = await authClient.auth.getUser(token)
    var user = userResult.data.user
    if (!user) return res.status(401).json({ error: 'Invalid session' })

    var body = req.body || {}
    var hintId = String(body.hint_id || '').trim()
    var event = String(body.event || 'shown').trim()
    if (!hintId) return res.status(400).json({ error: 'Missing hint_id' })
    if (ALLOWED_EVENTS.indexOf(event) === -1) {
      return res.status(400).json({ error: 'Invalid event' })
    }

    var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if (event === 'shown') {
      var ins = await svc.from('lab_hint_impressions').insert({
        user_id: user.id,
        hint_id: hintId,
        shown_at: new Date().toISOString(),
      })
      if (ins.error) {
        console.warn('[api/lab/hints/impression] insert failed:', ins.error.message)
      }
      return res.status(200).json({ ok: true })
    }

    // For cta_clicked / dismissed — update the most recent shown row.
    var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    var lookupRes = await svc
      .from('lab_hint_impressions')
      .select('id')
      .eq('user_id', user.id)
      .eq('hint_id', hintId)
      .gte('shown_at', since)
      .order('shown_at', { ascending: false })
      .limit(1)
    var rows: any[] = (lookupRes.data as any[]) || []
    if (rows.length === 0) {
      // No prior shown row — insert a stub so the event isn't lost.
      var insStub = await svc.from('lab_hint_impressions').insert({
        user_id: user.id,
        hint_id: hintId,
        shown_at: new Date().toISOString(),
        cta_clicked: event === 'cta_clicked',
        dismissed: event === 'dismissed',
      })
      if (insStub.error) {
        console.warn('[api/lab/hints/impression] stub insert failed:', insStub.error.message)
      }
      return res.status(200).json({ ok: true, stubbed: true })
    }
    var patch: any = {}
    if (event === 'cta_clicked') patch.cta_clicked = true
    if (event === 'dismissed') patch.dismissed = true
    var upd = await svc
      .from('lab_hint_impressions')
      .update(patch)
      .eq('id', rows[0].id)
    if (upd.error) {
      console.warn('[api/lab/hints/impression] update failed:', upd.error.message)
    }
    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.warn('[api/lab/hints/impression] failed:', e && e.message)
    // Best-effort — never fail the UI on impression-log errors.
    return res.status(200).json({ ok: false, error: true })
  }
}

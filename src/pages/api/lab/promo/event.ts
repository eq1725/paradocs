/**
 * POST /api/lab/promo/event
 *
 * V11.17.40 — Backlog #4. Logs a single Lab promo interaction event
 * into lab_promo_impressions. Identity resolves from Authorization
 * Bearer token (preferred) OR explicit session_id from the body.
 *
 * Body:
 *   {
 *     event_type: 'shown' | 'dismissed' | 'clicked' | 'paywall_view',
 *     session_id?: string,   // required if not authed
 *     context?: object,      // arbitrary client metadata
 *   }
 *
 * Fire-and-forget on the client (no payload returned beyond {ok:true}).
 * Errors are swallowed-on-client per the LabPromo design — failed
 * telemetry must never disrupt the user experience.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ALLOWED_EVENTS = new Set(['shown', 'dismissed', 'clicked', 'paywall_view'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const body = req.body || {}
    const eventType = typeof body.event_type === 'string' ? body.event_type : null
    if (!eventType || !ALLOWED_EVENTS.has(eventType)) {
      return res.status(400).json({ error: 'invalid_event_type' })
    }
    const sessionId = typeof body.session_id === 'string' ? body.session_id : null
    const context = body.context && typeof body.context === 'object' ? body.context : {}

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Resolve user from auth header.
    let userId: string | null = null
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    if (token) {
      const userResult = await supabase.auth.getUser(token)
      if (!userResult.error && userResult.data.user) userId = userResult.data.user.id
    }

    if (!userId && !sessionId) {
      return res.status(400).json({ error: 'missing_identity' })
    }

    const { error } = await supabase.from('lab_promo_impressions').insert({
      user_id: userId,
      session_id: sessionId,
      event_type: eventType,
      context,
    })
    if (error) {
      console.error('[api/lab/promo/event] insert error:', error.message)
      return res.status(500).json({ error: 'insert_failed' })
    }

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.error('[api/lab/promo/event] error:', e?.message || e)
    return res.status(500).json({ error: 'internal' })
  }
}

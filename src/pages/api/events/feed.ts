/**
 * POST /api/events/feed — Batch event ingestion
 *
 * Accepts array of feed events, inserts in batch.
 * Supports both authenticated (user_id from session) and anonymous (null) requests.
 * Also supports sendBeacon (no auth header, body is JSON blob).
 *
 * Rate limit: 100 events per request, 1 request per 3 seconds per session_id
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Simple in-memory rate limit (per-process, resets on deploy)
var lastFlush: Record<string, number> = {}

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

interface IncomingEvent {
  card_id: string
  card_type: string
  phenomenon_category?: string
  event_type: string
  duration_ms?: number
  scroll_depth_pct?: number
  metadata?: Record<string, any>
  session_id: string
  created_at?: string
}

var VALID_EVENT_TYPES = ['impression', 'dwell', 'tap', 'save', 'share', 'scroll_depth', 'swipe_related', 'dismiss']

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var body = req.body
    if (!body || !body.events || !Array.isArray(body.events)) {
      return res.status(400).json({ error: 'Missing events array' })
    }

    var events: IncomingEvent[] = body.events

    // Rate limit: max 100 events per request
    if (events.length > 100) {
      events = events.slice(0, 100)
    }

    // Rate limit: 1 request per 3 seconds per session_id
    if (events.length > 0 && events[0].session_id) {
      var sid = events[0].session_id
      var now = Date.now()
      if (lastFlush[sid] && (now - lastFlush[sid]) < 3000) {
        return res.status(429).json({ error: 'Too many requests' })
      }
      lastFlush[sid] = now

      // Clean up old entries (prevent memory leak)
      var keys = Object.keys(lastFlush)
      if (keys.length > 10000) {
        var cutoff = now - 60000
        keys.forEach(function (k) {
          if (lastFlush[k] < cutoff) delete lastFlush[k]
        })
      }
    }

    // Try to extract user_id from auth token
    var userId: string | null = null
    var authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      var token = authHeader.substring(7)
      var supabaseAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      var { data: userData } = await supabaseAuth.auth.getUser(token)
      if (userData && userData.user) {
        userId = userData.user.id
      }
    }

    // Validate and normalize events
    var rows = events
      .filter(function (e) {
        return e.card_id && e.card_type && e.event_type && e.session_id &&
               VALID_EVENT_TYPES.indexOf(e.event_type) >= 0
      })
      .map(function (e) {
        return {
          user_id: userId,
          session_id: e.session_id,
          card_id: e.card_id,
          card_type: e.card_type,
          phenomenon_category: e.phenomenon_category || null,
          event_type: e.event_type,
          duration_ms: e.duration_ms || null,
          scroll_depth_pct: e.scroll_depth_pct || null,
          metadata: e.metadata || null,
          created_at: e.created_at || new Date().toISOString(),
        }
      })

    if (rows.length === 0) {
      return res.status(200).json({ inserted: 0 })
    }

    // Batch insert using service role (bypasses RLS for anonymous events)
    var supabase = getSupabase()
    var { error } = await supabase.from('feed_events').insert(rows)

    if (error) {
      console.error('[Events] Insert error:', error)
      return res.status(500).json({ error: 'Insert failed' })
    }

    return res.status(200).json({ inserted: rows.length })
  } catch (error) {
    console.error('[Events] Handler error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}

/**
 * GET /api/admin/feed-metrics — Admin metrics dashboard for feed tuning.
 *
 * Returns key metrics:
 *   - avg_session_depth (north star)
 *   - tap/dwell/save/share rates by category and card type
 *   - gate hit rate and conversion rate
 *   - return visit rate
 *
 * Admin-only endpoint.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Admin auth check
  var adminKey = req.headers['x-admin-key']
  var cronSecret = process.env.CRON_SECRET
  if (adminKey !== cronSecret && adminKey !== process.env.ADMIN_API_KEY) {
    // Also check bearer token for admin role
    var authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    var token = authHeader.substring(7)
    var supabaseAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    var { data: userData } = await supabaseAuth.auth.getUser(token)
    if (!userData?.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    var supabaseAdmin = getSupabase()
    var { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' })
    }
  }

  try {
    var supabase = getSupabase()
    var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // --- Session depth: average impressions per session ---
    var { data: sessionData } = await supabase
      .from('feed_events')
      .select('session_id')
      .eq('event_type', 'impression')
      .gte('created_at', thirtyDaysAgo)

    var sessionCounts: Record<string, number> = {}
    if (sessionData) {
      sessionData.forEach(function (e) {
        sessionCounts[e.session_id] = (sessionCounts[e.session_id] || 0) + 1
      })
    }
    var sessionIds = Object.keys(sessionCounts)
    var avgSessionDepth = 0
    if (sessionIds.length > 0) {
      var totalDepth = 0
      sessionIds.forEach(function (sid) { totalDepth += sessionCounts[sid] })
      avgSessionDepth = Math.round((totalDepth / sessionIds.length) * 10) / 10
    }

    // --- Category metrics ---
    var { data: catEvents } = await supabase
      .from('feed_events')
      .select('phenomenon_category, event_type, duration_ms')
      .gte('created_at', thirtyDaysAgo)
      .not('phenomenon_category', 'is', null)

    var catMetrics: Record<string, { impressions: number; taps: number; dwellSum: number; dwellCount: number; saves: number; shares: number }> = {}
    if (catEvents) {
      catEvents.forEach(function (e) {
        var cat = e.phenomenon_category
        if (!catMetrics[cat]) {
          catMetrics[cat] = { impressions: 0, taps: 0, dwellSum: 0, dwellCount: 0, saves: 0, shares: 0 }
        }
        if (e.event_type === 'impression') catMetrics[cat].impressions++
        else if (e.event_type === 'tap') catMetrics[cat].taps++
        else if (e.event_type === 'dwell' && e.duration_ms) {
          catMetrics[cat].dwellSum += e.duration_ms
          catMetrics[cat].dwellCount++
        }
        else if (e.event_type === 'save') catMetrics[cat].saves++
        else if (e.event_type === 'share') catMetrics[cat].shares++
      })
    }

    var tapRateByCategory: Record<string, number> = {}
    var avgDwellByCategory: Record<string, number> = {}
    Object.keys(catMetrics).forEach(function (cat) {
      var m = catMetrics[cat]
      tapRateByCategory[cat] = m.impressions > 0 ? Math.round((m.taps / m.impressions) * 1000) / 10 : 0
      avgDwellByCategory[cat] = m.dwellCount > 0 ? Math.round(m.dwellSum / m.dwellCount) : 0
    })

    // --- Card type metrics ---
    var { data: typeEvents } = await supabase
      .from('feed_events')
      .select('card_type, event_type')
      .gte('created_at', thirtyDaysAgo)

    var typeMetrics: Record<string, { impressions: number; taps: number }> = {}
    if (typeEvents) {
      typeEvents.forEach(function (e) {
        if (!typeMetrics[e.card_type]) typeMetrics[e.card_type] = { impressions: 0, taps: 0 }
        if (e.event_type === 'impression') typeMetrics[e.card_type].impressions++
        else if (e.event_type === 'tap') typeMetrics[e.card_type].taps++
      })
    }

    var tapRateByCardType: Record<string, number> = {}
    Object.keys(typeMetrics).forEach(function (ct) {
      var m = typeMetrics[ct]
      tapRateByCardType[ct] = m.impressions > 0 ? Math.round((m.taps / m.impressions) * 1000) / 10 : 0
    })

    // --- Total save/share rates ---
    var totalImpressions = 0
    var totalSaves = 0
    var totalShares = 0
    Object.keys(catMetrics).forEach(function (cat) {
      totalImpressions += catMetrics[cat].impressions
      totalSaves += catMetrics[cat].saves
      totalShares += catMetrics[cat].shares
    })

    var metrics = {
      avg_session_depth: avgSessionDepth,
      total_sessions_30d: sessionIds.length,
      tap_through_rate_by_category: tapRateByCategory,
      tap_through_rate_by_card_type: tapRateByCardType,
      avg_dwell_ms_by_category: avgDwellByCategory,
      save_rate: totalImpressions > 0 ? Math.round((totalSaves / totalImpressions) * 1000) / 10 : 0,
      share_rate: totalImpressions > 0 ? Math.round((totalShares / totalImpressions) * 1000) / 10 : 0,
      total_events_30d: (catEvents ? catEvents.length : 0) + (typeEvents ? typeEvents.length : 0),
    }

    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json(metrics)
  } catch (error) {
    console.error('[FeedMetrics] Error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}

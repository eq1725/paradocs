/**
 * V11.18.12 — Sprint 1E. GET /api/lab/recent-saves
 *
 * Returns up to 4 of the signed-in user's most-recently saved reports
 * — title, location (short), event-or-saved date, slug — for the
 * LabPromo Today-variant's "YOUR RECORD SO FAR" chip stack. Each chip
 * is a tap target to the report page; the chip stack is the new
 * substance-zone fill that replaces the V5-era RADAR sphere teaser.
 *
 * Response shape:
 *   {
 *     signedIn: boolean,
 *     savedCount7d: number,     // mirror of /api/lab/footprint for the
 *                               // state-aware headline ladder
 *     saves: [
 *       { id, slug, title, location_short, date_short },
 *       ...
 *     ],
 *   }
 *
 * Anonymous users → `signedIn: false`, `saves: []`. LabPromo then
 * renders the empty-state chip ("Start saving reports to fill your
 * record") so the substance zone never has a void.
 *
 * Auth: Bearer access token. The endpoint is per-user and bypasses
 * edge cache (Cache-Control: private, no-store).
 *
 * SWC: var + function() per repo convention.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var PERIOD_DAYS = 7
var MAX_CHIPS = 4

interface RecentSaveChip {
  id: string
  slug: string
  title: string
  location_short: string | null
  date_short: string | null
}

function shortLocationLabel(r: any): string | null {
  if (!r) return null
  var city = (r.city || '').trim()
  var state = (r.state_province || '').trim()
  var country = (r.country || '').trim()
  if (city && state) return city + ', ' + state
  if (city && country) return city + ', ' + country
  if (state && country) return state + ', ' + country
  if (state) return state
  if (city) return city
  if (country) return country
  if (r.location_text) return String(r.location_text)
  return null
}

// Compact day label for the chip line: "saved Tuesday" inside the
// current week, "saved Mar 14" for older saves. Anchored on the
// saved_reports.created_at — that's when the user added it to their
// record, not when the witness saw the thing.
function savedDayLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return null
    var now = new Date()
    var diffMs = now.getTime() - d.getTime()
    var diffDays = Math.floor(diffMs / 86400000)
    if (diffDays <= 0) return 'saved today'
    if (diffDays === 1) return 'saved yesterday'
    if (diffDays < 7) {
      var weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
      return 'saved ' + weekday
    }
    var short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return 'saved ' + short
  } catch {
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'supabase_env_missing' })
  }

  res.setHeader('Cache-Control', 'private, no-store')

  try {
    var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Resolve user from Bearer token.
    var userId: string | null = null
    var authHeader = req.headers.authorization || ''
    var token = typeof authHeader === 'string'
      ? authHeader.replace('Bearer ', '').trim()
      : ''
    if (token) {
      var userResult = await supabase.auth.getUser(token)
      if (!userResult.error && userResult.data.user) {
        userId = userResult.data.user.id
      }
    }

    if (!userId) {
      return res.status(200).json({
        signedIn: false,
        savedCount7d: 0,
        saves: [] as RecentSaveChip[],
      })
    }

    // 7-day saved count for the state-aware headline ladder.
    var periodStart = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()
    var countRes = await supabase
      .from('saved_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', periodStart)
    var savedCount7d = countRes.count || 0

    // Most-recent N saves with the joined report row.
    var listRes = await supabase
      .from('saved_reports')
      .select(
        'id, created_at, report_id, ' +
        'report:reports!saved_reports_report_id_fkey(' +
          'id, slug, title, city, state_province, country, location_text, event_date' +
        ')'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CHIPS)

    var rows: any[] = (listRes.data as any[]) || []
    var saves: RecentSaveChip[] = []
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      var r: any = row.report
      // saved_reports can technically join to nothing if the report was
      // archived between save + read; tolerate it by skipping the row.
      if (!r || !r.id) continue
      saves.push({
        id: String(r.id),
        slug: String(r.slug || r.id),
        title: String(r.title || 'Untitled account'),
        location_short: shortLocationLabel(r),
        date_short: savedDayLabel(row.created_at),
      })
    }

    return res.status(200).json({
      signedIn: true,
      savedCount7d: savedCount7d,
      saves: saves,
    })
  } catch (e: any) {
    console.error('[api/lab/recent-saves] error:', e?.message || e)
    return res.status(500).json({ error: 'internal' })
  }
}

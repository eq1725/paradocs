/**
 * API: GET /api/lab/footprint
 *
 * Returns the user's 7-day engagement footprint for the Lab upsell
 * card's headline variant ladder (V11.17.39 — Round 4 panel-locked).
 *
 * Response shape:
 *   {
 *     signedIn: boolean,
 *     savedCount7d: number,       // saved_reports created in last 7d
 *     thumbsUpCount7d: number,    // feed_events event_type=thumbs_up in last 7d
 *     viewedCount7d: number,      // feed_events event_type=view in last 7d (when tracked)
 *     period_days: 7,
 *   }
 *
 * Headline variant matrix (consumer logic in LabPromo.tsx):
 *   1. signedIn=false                        → "Something keeps pulling you back."
 *   2. signedIn, saved=0, viewed<30          → "You've been reading. Lab connects what you read."
 *   3. signedIn, 1<=saved<=3                 → "You're starting to notice something."
 *   4. signedIn, saved>=4                    → "You saved {N} reports this week. There's a reason."
 *   5. signedIn, saved=0, (thumbs>=10 OR viewed>=30) → "You've viewed {N} reports. Lab finds the thread."
 *
 * Anonymous fallback returns signedIn:false and zero counts.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const PERIOD_DAYS = 7

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const periodStart = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Resolve user (optional — anon returns signedIn:false).
    let userId: string | null = null
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    if (token) {
      const userResult = await supabase.auth.getUser(token)
      if (!userResult.error && userResult.data.user) userId = userResult.data.user.id
    }

    if (!userId) {
      return res.status(200).json({
        signedIn: false,
        savedCount7d: 0,
        thumbsUpCount7d: 0,
        viewedCount7d: 0,
        period_days: PERIOD_DAYS,
      })
    }

    // saved_reports — created_at within last 7d.
    const savedResult = await supabase
      .from('saved_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', periodStart)
    const savedCount7d = savedResult.count || 0

    // feed_events thumbs_up — within last 7d.
    const thumbsResult = await (supabase.from('feed_events') as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'thumbs_up')
      .gte('created_at', periodStart)
    const thumbsUpCount7d = (thumbsResult.count as number) || 0

    // feed_events view — within last 7d. Tolerate absence (we may not be
    // tracking 'view' yet; the variant ladder gracefully degrades when 0).
    let viewedCount7d = 0
    try {
      const viewResult = await (supabase.from('feed_events') as any)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'view')
        .gte('created_at', periodStart)
      viewedCount7d = (viewResult.count as number) || 0
    } catch (_e) { /* table column missing or other — leave at 0 */ }

    return res.status(200).json({
      signedIn: true,
      savedCount7d,
      thumbsUpCount7d,
      viewedCount7d,
      period_days: PERIOD_DAYS,
    })
  } catch (e: any) {
    console.error('[api/lab/footprint] error:', e?.message || e)
    return res.status(500).json({ error: 'internal' })
  }
}

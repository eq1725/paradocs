/**
 * API: GET /api/lab/signature-growth
 *
 * Returns Spotify-Wrapped-style monthly delta numbers for the
 * Story-tab "Your signature is growing" card (PR-7 item 2,
 * V11.17.38).
 *
 * Reinforces the "you're not alone" promise + activates the
 * embedding backfill investment by showing the user new corroborating
 * reports added to their submissions' constellation since last month.
 *
 * Response shape:
 *   {
 *     period_days: 30,
 *     corpus_added: number,           // total Paradocs report growth
 *     user_submissions: number,       // total user reports
 *     user_match_growth: number,      // new corroborating reports
 *     top_aligned_category: string|null,
 *     has_growth: boolean,
 *     month_label: string,            // "April", "May", etc.
 *   }
 *
 * Anonymous fallback: when no auth token, returns corpus_added only
 * (still meaningful — "Paradocs grew by 12,847 reports this month").
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const PERIOD_DAYS = 30

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date()
    const periodStart = new Date(now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000)
    const periodStartIso = periodStart.toISOString()

    // Resolve user (optional — anonymous gets corpus-only)
    let userId: string | null = null
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    if (token) {
      const userResult = await supabase.auth.getUser(token)
      if (!userResult.error && userResult.data.user) userId = userResult.data.user.id
    }

    // Corpus growth — total approved reports added in the last 30 days.
    const corpusResult = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('created_at', periodStartIso)
    const corpusAdded = corpusResult.count || 0

    let userSubmissions = 0
    let userMatchGrowth = 0
    let topAlignedCategory: string | null = null

    if (userId) {
      // User's total submissions (all-time).
      const subResult = await supabase
        .from('reports')
        .select('id, category', { count: 'exact' })
        .eq('author_id', userId)
        .eq('status', 'approved')
      userSubmissions = subResult.count || 0

      // Compute "match growth" — for each of the user's submitted
      // reports, how many NEW corroborating reports (same category +
      // posted in the last 30 days) exist. Cheap heuristic: count
      // reports in the same category as the user's submissions that
      // were added in the period. This avoids running the full
      // constellation match algorithm server-side here.
      const subRows = (subResult.data || []) as Array<{ id: string; category: string }>
      const userCategories = Array.from(new Set(subRows.map(r => r.category).filter(Boolean)))

      if (userCategories.length > 0) {
        // Per-category new-arrivals count (capped to top 5 cats so
        // we don't blow query budget for a user with 50+ submissions).
        const cats = userCategories.slice(0, 5)
        const perCat: Array<{ cat: string; n: number }> = []
        for (const cat of cats) {
          const r = await supabase
            .from('reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'approved')
            .eq('category', cat)
            .gte('created_at', periodStartIso)
          perCat.push({ cat, n: r.count || 0 })
        }
        // Sort and pick top.
        perCat.sort((a, b) => b.n - a.n)
        userMatchGrowth = perCat.reduce((s, x) => s + x.n, 0)
        topAlignedCategory = perCat[0]?.n > 0 ? perCat[0].cat : null
      }
    }

    const monthLabel = now.toLocaleString('en-US', { month: 'long' })
    const hasGrowth = corpusAdded > 0 || userMatchGrowth > 0

    return res.status(200).json({
      period_days: PERIOD_DAYS,
      corpus_added: corpusAdded,
      user_submissions: userSubmissions,
      user_match_growth: userMatchGrowth,
      top_aligned_category: topAlignedCategory,
      has_growth: hasGrowth,
      month_label: monthLabel,
    })
  } catch (e: any) {
    console.error('[signature-growth] error', e?.message || e)
    // Graceful — return a benign empty payload so the card hides.
    return res.status(200).json({
      period_days: PERIOD_DAYS,
      corpus_added: 0,
      user_submissions: 0,
      user_match_growth: 0,
      top_aligned_category: null,
      has_growth: false,
      month_label: new Date().toLocaleString('en-US', { month: 'long' }),
      _error: true,
    })
  }
}

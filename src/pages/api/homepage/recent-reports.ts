/**
 * API: GET /api/homepage/recent-reports
 *
 * Thin endpoint that powers the LiveActivityTicker on the marketing
 * homepage. Returns the N most recent approved reports with the
 * minimum fields the ticker needs to render. No auth required —
 * public surface.
 *
 * Why a dedicated endpoint:
 *   - The discover feed (/api/discover/feed-v2) returns a sectioned,
 *     mixed-content payload that's heavier than the ticker needs.
 *   - Edge-cachable. Single-table read, cleanly paginatable.
 *   - Lets us A/B-test the ticker's data source later (e.g., mix in
 *     "trending" sort) without disturbing the discover feed contract.
 *
 * Query params:
 *   limit  (default 8, max 20)
 *
 * Returns:
 *   { reports: [{ id, title, slug, category, location_name, country,
 *                  summary, created_at }] }
 *
 * Edge cache: 30s s-maxage + 5min SWR. The ticker re-fetches every 60s
 * client-side, so 30s edge cache is the sweet spot — visitors during
 * the same 30-second window share the same response.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300')

  var limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8))

  try {
    var sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    var result = await sb.from('reports')
      .select('id, title, slug, category, location_name, country, summary, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (result.error) {
      console.error('[recent-reports] query error:', result.error.message)
      return res.status(500).json({ error: result.error.message })
    }

    return res.status(200).json({ reports: result.data || [] })
  } catch (error) {
    console.error('[recent-reports] fatal:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

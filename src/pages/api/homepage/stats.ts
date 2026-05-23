/**
 * API: GET /api/homepage/stats
 *
 * Aggregate count endpoint for the marketing homepage. Returns
 * approved-report count, distinct-source count, and active-phenomena
 * count. Used by:
 *   - DataProofCTA component (client-side, on scroll-into-view)
 *
 * The hero's stat number is wired separately via getStaticProps in
 * index.tsx (ISR-cached server-side) so it lands with the initial
 * HTML rather than animating in on hydration.
 *
 * Edge cache 5min + SWR 30min. Counts don't move fast enough to
 * justify shorter cache windows.
 *
 * Returns:
 *   { reports: number, sources: number, phenomena: number }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800')

  try {
    var sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    var [reportsRes, phenomenaRes] = await Promise.all([
      sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      sb.from('phenomena').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    return res.status(200).json({
      reports: reportsRes.count || 0,
      // Source archive count — content-curated value, not a DB count.
      // Reflects the number of distinct source archives surfaced to
      // users on the homepage marketing copy. Bump this when a new
      // source comes online.
      sources: 47,
      phenomena: phenomenaRes.count || 0,
    })
  } catch (error) {
    console.error('[homepage/stats] error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

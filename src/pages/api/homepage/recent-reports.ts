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
 *   limit   (default 8, max 20)
 *   diverse (optional, "1") — V11.38 P0-5 (APP_EXPERIENCE_PANEL_REVIEW.md):
 *     apply category + location caps so one ingest burst (e.g. 5,059 BFRO
 *     rows) can't turn the rail into a single-category monoculture.
 *     Greedy pass over a wider recency pool: max 2 per category, max 2
 *     per coarse location key; backfills by recency if the caps leave
 *     the list short. Default (no param) is the old pure-recency
 *     behavior — the homepage ticker is unchanged.
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
  var diverse = String(req.query.diverse) === '1'

  try {
    var sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // In diverse mode, over-fetch a recency pool so the caps have
    // something to choose from (8× the ask, hard cap 60 rows).
    var fetchLimit = diverse ? Math.min(60, limit * 8) : limit

    var result = await sb.from('reports')
      .select('id, title, slug, category, location_name, country, summary, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(fetchLimit)

    if (result.error) {
      console.error('[recent-reports] query error:', result.error.message)
      return res.status(500).json({ error: result.error.message })
    }

    var rows = result.data || []

    if (diverse && rows.length > limit) {
      var CAT_CAP = 2
      var LOC_CAP = 2
      var catCounts: Record<string, number> = {}
      var locCounts: Record<string, number> = {}
      var picked: typeof rows = []
      var skipped: typeof rows = []

      // Coarse location key: the last comma-segment of location_name
      // ("Kennikot, Alaska" → "alaska"), falling back to country. Keeps
      // an Alaska ingest burst from filling every slot without needing
      // a structured state column on this thin endpoint. (Function
      // expression, not declaration — ES5-strict block rules.)
      var locKey = function (r: (typeof rows)[number]): string {
        var name = (r.location_name || '').trim()
        if (name) {
          var parts = name.split(',')
          return parts[parts.length - 1].trim().toLowerCase()
        }
        return (r.country || '').trim().toLowerCase()
      }

      for (var i = 0; i < rows.length && picked.length < limit; i++) {
        var row = rows[i]
        var ck = (row.category || 'uncategorized').toLowerCase()
        var lk = locKey(row)
        var catOk = (catCounts[ck] || 0) < CAT_CAP
        var locOk = lk === '' || (locCounts[lk] || 0) < LOC_CAP
        if (catOk && locOk) {
          picked.push(row)
          catCounts[ck] = (catCounts[ck] || 0) + 1
          if (lk !== '') locCounts[lk] = (locCounts[lk] || 0) + 1
        } else {
          skipped.push(row)
        }
      }
      // Backfill by recency if the caps left us short.
      for (var j = 0; j < skipped.length && picked.length < limit; j++) {
        picked.push(skipped[j])
      }
      rows = picked
    } else if (rows.length > limit) {
      rows = rows.slice(0, limit)
    }

    return res.status(200).json({ reports: rows })
  } catch (error) {
    console.error('[recent-reports] fatal:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * GET /api/avatars/curated
 *
 * V9.7 Phase 1 — returns the curated avatar library grouped by
 * category. Replaces the hardcoded list previously embedded in
 * AvatarSelector. New avatars can be added via SQL insert + a WebP
 * file in /public/avatars/curated/, no deploy or component change.
 *
 * Response shape:
 *   {
 *     categories: [
 *       {
 *         key: 'travelers',
 *         label: 'Travelers',
 *         avatars: [{ slug, name, image_url }]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Cached aggressively (1 hour) since the curated set rarely changes.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface CuratedAvatarRow {
  slug: string
  name: string
  category: string
  image_url: string
  sort_order: number
}

// Display labels + presentation order for the category tabs.
var CATEGORY_LABELS: Record<string, string> = {
  travelers: 'Travelers',
  cosmos: 'Cosmos',
  mystics: 'Mystics',
  symbols: 'Symbols',
  researchers: 'Researchers',
}
var CATEGORY_ORDER = ['travelers', 'cosmos', 'mystics', 'symbols', 'researchers']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    var { data, error } = await supabase
      .from('curated_avatars')
      .select('slug, name, category, image_url, sort_order')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })

    if (error) throw error

    var rows = (data || []) as CuratedAvatarRow[]

    // Group by category preserving CATEGORY_ORDER.
    var byCategory: Record<string, CuratedAvatarRow[]> = {}
    rows.forEach(function (row) {
      if (!byCategory[row.category]) byCategory[row.category] = []
      byCategory[row.category].push(row)
    })

    var categories = CATEGORY_ORDER
      .filter(function (key) { return byCategory[key] && byCategory[key].length > 0 })
      .map(function (key) {
        return {
          key: key,
          label: CATEGORY_LABELS[key] || key,
          avatars: byCategory[key].map(function (r) {
            return { slug: r.slug, name: r.name, image_url: r.image_url }
          })
        }
      })

    // Cache 1 hour — the curated set is data-driven but rarely changes.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ categories: categories, total: rows.length })
  } catch (err: any) {
    console.error('[CuratedAvatars] Error:', err)
    return res.status(500).json({ error: 'Failed to fetch avatars' })
  }
}

/**
 * API: GET /api/phenomena/[slug]/facets
 *
 * Returns count-by-value facets used to populate filter chips on the
 * phenomenon detail page. Specifically: country counts and decade
 * counts for all approved reports linked to this phenomenon.
 *
 * Why an endpoint vs client computation:
 *   - Client only knows what's currently in the report grid (max 100).
 *   - Facets need to reflect the FULL set of tagged reports — otherwise
 *     "Country (12)" lies when there are 8 more on subsequent pages.
 *
 * Edge-cached 5min (stale-while-revalidate 30min). Facets only change
 * when classifier writes new junction rows; aggressive cache is fine.
 *
 * Returns:
 *   {
 *     countries: { US: 847, UK: 142, ... }   // sorted desc by count
 *     decades:   { "2020s": 312, "2010s": 287, ..., earlier: 38 }
 *     total:     1215
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getPhenomenonBySlug } from '@/lib/services/phenomena.service'

function yearToDecade(year: number): string {
  if (year >= 2020) return '2020s'
  if (year >= 2010) return '2010s'
  if (year >= 2000) return '2000s'
  if (year >= 1990) return '1990s'
  if (year >= 1980) return '1980s'
  if (year >= 1970) return '1970s'
  return 'earlier'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  var slug = req.query.slug
  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' })
  }

  try {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800')

    var phenomenon = await getPhenomenonBySlug(slug)
    if (!phenomenon) return res.status(404).json({ error: 'Phenomenon not found' })

    var sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Pull country + event_date for every approved junction row of this
    // phenomenon. Paginate in case there are more than 1000.
    var all: Array<{ country: string | null; event_date: string | null }> = []
    var offset = 0
    while (true) {
      var res2 = await sb.from('report_phenomena')
        .select('report:reports!inner(country, event_date, status)')
        .eq('phenomenon_id', phenomenon.id)
        .eq('report.status', 'approved')
        .range(offset, offset + 999)
      if (res2.error) {
        console.error('[API] facets error:', res2.error)
        return res.status(500).json({ error: res2.error.message })
      }
      var rows = res2.data || []
      for (var i = 0; i < rows.length; i++) {
        var r = (rows[i] as any).report
        if (r) all.push({ country: r.country, event_date: r.event_date })
      }
      if (rows.length < 1000) break
      offset += 1000
      if (offset > 50000) break // safety
    }

    var countries: Record<string, number> = {}
    var decades: Record<string, number> = {}
    for (var j = 0; j < all.length; j++) {
      var row2 = all[j]
      if (row2.country) {
        countries[row2.country] = (countries[row2.country] || 0) + 1
      }
      if (row2.event_date) {
        var year = parseInt(row2.event_date.substring(0, 4), 10)
        if (Number.isFinite(year) && year > 0) {
          var dec = yearToDecade(year)
          decades[dec] = (decades[dec] || 0) + 1
        }
      }
    }

    // Sort countries by count desc, return as ordered object via array
    var countryEntries = Object.entries(countries).sort(function (a, b) { return b[1] - a[1] })
    var countriesSorted: Record<string, number> = {}
    for (var k = 0; k < countryEntries.length; k++) {
      countriesSorted[countryEntries[k][0]] = countryEntries[k][1]
    }

    return res.status(200).json({
      countries: countriesSorted,
      decades: decades,
      total: all.length,
    })
  } catch (error) {
    console.error('[API] facets fatal:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * API: GET /api/phenomena/[slug]/reports
 *
 * Paginated + filterable reports linked to a phenomenon.
 *
 * V11.15.3 rewrite: replaces the previous "load all linked IDs then
 * .in(ids)" approach (which broke past ~100 reports due to PostgREST
 * URL-length limits) with a single junction-inner-join. Pagination
 * happens at the SQL level, no IN-list bloat.
 *
 * Query params:
 *   page          (default: 1)
 *   limit         (default: 20, max: 100)
 *   sort          confidence | newest | oldest | popular | most_viewed
 *                 (default: confidence — Haiku's best matches first)
 *   search        Free-text on title + summary
 *   country       ISO-style country name match
 *   decade        "2020s" | "2010s" | "2000s" | "1990s" | "1980s" | "1970s"
 *                 | "earlier"  — operates on event_date year
 *   credibility   high | medium | low  (legacy, kept for API compat)
 *   category      legacy, ignored when same as phenomenon.category
 *
 * Returns:
 *   { phenomenon, reports[], pagination: { page, limit, total, totalPages } }
 *
 * Edge-cached 60s. Stale-while-revalidate 5min.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getPhenomenonBySlug } from '@/lib/services/phenomena.service'

function decadeToRange(decade: string): { from: string; to: string } | null {
  switch (decade) {
    case '2020s': return { from: '2020-01-01', to: '2029-12-31' }
    case '2010s': return { from: '2010-01-01', to: '2019-12-31' }
    case '2000s': return { from: '2000-01-01', to: '2009-12-31' }
    case '1990s': return { from: '1990-01-01', to: '1999-12-31' }
    case '1980s': return { from: '1980-01-01', to: '1989-12-31' }
    case '1970s': return { from: '1970-01-01', to: '1979-12-31' }
    case 'earlier': return { from: '0001-01-01', to: '1969-12-31' }
    default: return null
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var slug = req.query.slug
  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' })
  }

  try {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

    var phenomenon = await getPhenomenonBySlug(slug)
    if (!phenomenon) {
      return res.status(404).json({ error: 'Phenomenon not found' })
    }

    var page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
    var limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20))
    var sort = String(req.query.sort || 'confidence')
    var search = req.query.search ? String(req.query.search).trim() : ''
    var country = req.query.country ? String(req.query.country).trim() : ''
    var decade = req.query.decade ? String(req.query.decade).trim() : ''
    var credibility = req.query.credibility ? String(req.query.credibility).trim() : ''

    var sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Single junction-inner-join. PostgREST emits one SQL query.
    var q: any = sb.from('report_phenomena')
      .select(
        'confidence, is_primary, ' +
          'report:reports!inner(' +
            'id, title, slug, summary, category, location_name, country, ' +
            'event_date, event_date_precision, credibility, view_count, status, upvotes, created_at, ' +
            'phenomenon_type:phenomenon_types(id, name, icon)' +
          ')',
        { count: 'exact' }
      )
      .eq('phenomenon_id', phenomenon.id)
      .eq('report.status', 'approved')

    // Apply filters at the joined-table level so PostgREST pushes them
    // down into the SQL, not into a post-fetch filter on this side.
    if (search) {
      // Use the embedded-resource filter syntax. Both title + summary.
      q = q.or('title.ilike.%' + search + '%,summary.ilike.%' + search + '%', { foreignTable: 'reports' })
    }
    if (country) {
      q = q.eq('report.country', country)
    }
    if (credibility) {
      q = q.eq('report.credibility', credibility)
    }
    if (decade) {
      var range = decadeToRange(decade)
      if (range) {
        q = q.gte('report.event_date', range.from).lte('report.event_date', range.to)
      }
    }

    // Sort.
    switch (sort) {
      case 'newest':
        q = q.order('event_date', { ascending: false, nullsFirst: false, foreignTable: 'reports' })
        break
      case 'oldest':
        q = q.order('event_date', { ascending: true, nullsFirst: false, foreignTable: 'reports' })
        break
      case 'popular':
        q = q.order('upvotes', { ascending: false, foreignTable: 'reports' })
        break
      case 'most_viewed':
        q = q.order('view_count', { ascending: false, foreignTable: 'reports' })
        break
      case 'confidence':
      default:
        q = q.order('is_primary', { ascending: false })
          .order('confidence', { ascending: false })
    }

    var from = (page - 1) * limit
    q = q.range(from, from + limit - 1)

    var result = await q
    if (result.error) {
      console.error('[API] phenomena reports error:', result.error)
      return res.status(500).json({ error: result.error.message })
    }

    var rows = result.data || []
    var reports = rows.map(function (row: any) {
      return Object.assign({}, row.report, {
        match_confidence: row.confidence,
        is_primary: row.is_primary,
      })
    })

    var total = result.count || 0
    var totalPages = Math.ceil(total / limit)

    return res.status(200).json({
      phenomenon: {
        id: phenomenon.id,
        name: phenomenon.name,
        slug: phenomenon.slug,
        icon: phenomenon.icon,
        report_count: phenomenon.report_count,
      },
      reports: reports,
      pagination: { page: page, limit: limit, total: total, totalPages: totalPages },
    })
  } catch (error) {
    console.error('[API] phenomena reports fatal:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

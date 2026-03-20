/**
 * Report Similar Reports API — Vector-powered
 *
 * GET /api/ai/report-similar?id=UUID  or  ?slug=SLUG
 *
 * Returns reports similar to a given report based on vector embeddings.
 * This extends the existing report-insights similar cases with actual
 * semantic similarity rather than just category/location matching.
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { semanticSearch } from '@/lib/services/embedding.service'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var reportId = req.query.id as string
  var slug = req.query.slug as string

  if (!reportId && !slug) {
    return res.status(400).json({ error: 'id or slug parameter is required' })
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Get the report
    var query = supabase
      .from('reports')
      .select('id, title, description, summary, category, location, event_date, slug')

    if (reportId) query = query.eq('id', reportId)
    else query = query.eq('slug', slug)

    var { data: report, error } = await query.single()

    if (error || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Build search text from the report
    var searchText = [report.title, report.summary, (report.description || '').substring(0, 500)].filter(Boolean).join(' ')

    // Find similar via semantic search
    var results = await semanticSearch(searchText, {
      matchCount: 8,
      threshold: 0.5,
      sourceTable: 'report'
    })

    // Filter out the source report itself, deduplicate
    var seenIds: Record<string, boolean> = {}
    seenIds[report.id] = true

    var similar: any[] = []
    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      if (seenIds[r.source_id]) continue
      seenIds[r.source_id] = true

      similar.push({
        source_id: r.source_id,
        title: (r.metadata && r.metadata.title) || 'Unknown',
        slug: (r.metadata && r.metadata.slug) || '',
        category: (r.metadata && r.metadata.category) || '',
        location: (r.metadata && r.metadata.location) || '',
        date: (r.metadata && r.metadata.date) || '',
        credibility: (r.metadata && r.metadata.credibility) || '',
        similarity: Math.round(r.similarity * 100),
        snippet: r.chunk_text.substring(0, 200)
      })
    }

    // Cache for 10 minutes
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600')

    return res.status(200).json({
      report_id: report.id,
      report_slug: report.slug,
      similar_reports: similar,
      total: similar.length
    })
  } catch (error: any) {
    console.error('Report similar error:', error)

    // Graceful degradation
    return res.status(200).json({
      report_id: reportId || slug,
      similar_reports: [],
      total: 0,
      note: 'Semantic similarity search unavailable.'
    })
  }
}

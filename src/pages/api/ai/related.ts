/**
 * Related Patterns & Context API — Search Enrichment
 *
 * GET /api/ai/related?query=X
 *
 * When a user searches, this returns AI-detected patterns and related context
 * to display alongside fulltext search results.
 *
 * Used by Session 7 Phase 3 for "Related Patterns" section on search results.
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { semanticSearch } from '@/lib/services/embedding.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var query = req.query.query as string
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'query parameter is required (min 2 chars)' })
  }

  var safeQuery = query.substring(0, 500).trim()

  try {
    // Run semantic search for related content
    var results = await semanticSearch(safeQuery, {
      matchCount: 5,
      threshold: 0.45,
      sourceTable: undefined // Search across both reports and phenomena
    })

    // Separate reports and phenomena
    var relatedReports: any[] = []
    var relatedPhenomena: any[] = []
    var seenIds: Record<string, boolean> = {}

    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      if (seenIds[r.source_id]) continue
      seenIds[r.source_id] = true

      var item = {
        source_id: r.source_id,
        title: (r.metadata && r.metadata.title) || 'Unknown',
        slug: (r.metadata && r.metadata.slug) || '',
        category: (r.metadata && r.metadata.category) || '',
        similarity: Math.round(r.similarity * 100),
        snippet: r.chunk_text.substring(0, 200)
      }

      if (r.source_table === 'report') {
        relatedReports.push(item)
      } else {
        relatedPhenomena.push(item)
      }
    }

    // Build a brief AI context summary
    var contextSummary = ''
    if (relatedReports.length > 0 || relatedPhenomena.length > 0) {
      var total = relatedReports.length + relatedPhenomena.length
      contextSummary = 'Found ' + total + ' related ' + (total === 1 ? 'item' : 'items') + ' in the database'
      if (relatedReports.length > 0) {
        contextSummary += ': ' + relatedReports.length + ' report' + (relatedReports.length === 1 ? '' : 's')
      }
      if (relatedPhenomena.length > 0) {
        contextSummary += (relatedReports.length > 0 ? ' and ' : ': ') + relatedPhenomena.length + ' encyclopedia ' + (relatedPhenomena.length === 1 ? 'entry' : 'entries')
      }
      contextSummary += '.'
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

    return res.status(200).json({
      query: safeQuery,
      related_reports: relatedReports,
      related_phenomena: relatedPhenomena,
      context_summary: contextSummary,
      total_results: relatedReports.length + relatedPhenomena.length
    })
  } catch (error: any) {
    console.error('Related search error:', error)

    // Graceful degradation
    if (error.message && error.message.indexOf('OPENAI_API_KEY') >= 0) {
      return res.status(200).json({
        query: safeQuery,
        related_reports: [],
        related_phenomena: [],
        context_summary: '',
        total_results: 0,
        note: 'Semantic search is being configured.'
      })
    }

    return res.status(500).json({ error: 'Related search failed' })
  }
}

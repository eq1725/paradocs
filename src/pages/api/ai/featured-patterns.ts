/**
 * Featured Patterns API — Homepage AI Preview
 *
 * GET /api/ai/featured-patterns
 *
 * Returns 2-3 interesting pattern discoveries for display on the homepage.
 * Example: "47 reports describe triangular objects over military bases in the 1980s"
 *
 * Caches results for 24 hours. Used by Session 7 Phase 2 homepage hero redesign.
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { generateFeaturedPatterns } from '@/lib/services/ai-pattern-detection.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var patterns = await generateFeaturedPatterns()

    // Cache for 5 minutes on CDN, stale for 1 hour
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')

    return res.status(200).json({
      patterns: patterns.map(function(p) {
        return {
          type: p.type,
          title: p.title,
          description: p.description,
          confidence: p.confidence,
          report_count: p.report_count,
          metadata: {
            category: p.metadata.category,
            location: p.metadata.location,
            date_range: p.metadata.date_range,
            center_lat: p.metadata.center_lat,
            center_lng: p.metadata.center_lng
          }
        }
      }),
      generated_at: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Featured patterns error:', error)
    return res.status(500).json({ error: 'Failed to generate featured patterns' })
  }
}

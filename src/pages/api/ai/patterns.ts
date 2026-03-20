/**
 * Pattern Detection API
 *
 * GET  /api/ai/patterns                — get all detected patterns
 * GET  /api/ai/patterns?category=X     — filter by category
 * GET  /api/ai/patterns?type=geographic_cluster — filter by pattern type
 * POST /api/ai/patterns                — detect patterns with custom params
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  detectAllPatterns,
  detectGeographicClusters,
  detectTemporalSpikes,
  detectPhenomenaSimilarity
} from '@/lib/services/ai-pattern-detection.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var category = (req.query.category || (req.body && req.body.category)) as string | undefined
    var type = (req.query.type || (req.body && req.body.type)) as string | undefined

    if (type) {
      // Run specific detector
      var results: any[] = []
      switch (type) {
        case 'geographic_cluster':
          results = await detectGeographicClusters({ category: category })
          break
        case 'temporal_spike':
          results = await detectTemporalSpikes({ category: category })
          break
        case 'phenomena_similarity':
          results = await detectPhenomenaSimilarity({ category: category })
          break
        default:
          return res.status(400).json({ error: 'Unknown pattern type: ' + type })
      }

      return res.status(200).json({
        type: type,
        patterns: results,
        total: results.length
      })
    }

    // Run all detectors
    var allPatterns = await detectAllPatterns({ category: category })

    // Set cache header (5 min)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

    return res.status(200).json(allPatterns)
  } catch (error: any) {
    console.error('Pattern detection error:', error)
    return res.status(500).json({ error: 'Pattern detection failed: ' + error.message })
  }
}

export var config = {
  maxDuration: 60 // Pattern detection can take up to 60s
}

/**
 * Cron API: POST /api/cron/analyze-patterns
 *
 * Scheduled job to detect patterns in report data.
 * Runs every 6 hours via Vercel Cron.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { runPatternAnalysis } from '@/lib/services/pattern-analysis.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('[Pattern Analysis] Starting scheduled analysis...')

    const result = await runPatternAnalysis('full')

    console.log('[Pattern Analysis] Analysis complete:', {
      patterns_detected: result.patterns_detected,
      patterns_updated: result.patterns_updated,
      patterns_archived: result.patterns_archived,
      reports_analyzed: result.reports_analyzed,
      duration_ms: result.duration_ms
    })

    return res.status(200).json({
      success: true,
      result
    })
  } catch (error) {
    console.error('[Pattern Analysis] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Increase timeout for this endpoint
export const config = {
  maxDuration: 300 // 5 minutes
}

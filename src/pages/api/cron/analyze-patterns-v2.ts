/**
 * Cron API: POST /api/cron/analyze-patterns-v2
 *
 * Optimized pattern analysis that handles large datasets (270K+ reports).
 * Can be triggered by:
 * - Vercel Cron (if Pro plan)
 * - External cron service (cron-job.org, GitHub Actions, etc.)
 * - Manual trigger via admin panel
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { runOptimizedPatternAnalysis } from '@/lib/services/pattern-analysis-v2.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow both POST (Vercel cron) and GET (external cron services)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify authorization
  // Accept either:
  // 1. Vercel CRON_SECRET (for Vercel cron)
  // 2. X-Cron-Secret header (for external cron services)
  // 3. No auth for development (localhost)
  const authHeader = req.headers.authorization || req.headers['x-cron-secret']
  const cronSecret = process.env.CRON_SECRET

  const isLocalhost = req.headers.host?.includes('localhost')
  const isValidAuth = !cronSecret ||
    authHeader === `Bearer ${cronSecret}` ||
    authHeader === cronSecret

  if (!isLocalhost && !isValidAuth) {
    console.log('[Pattern Analysis V2] Unauthorized request')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('[Pattern Analysis V2] Starting scheduled analysis...')
    const startTime = Date.now()

    const result = await runOptimizedPatternAnalysis()

    console.log('[Pattern Analysis V2] Complete:', {
      status: result.status,
      patterns_detected: result.patterns_detected,
      patterns_updated: result.patterns_updated,
      patterns_archived: result.patterns_archived,
      reports_analyzed: result.reports_analyzed,
      duration_ms: result.duration_ms,
      errors: result.errors.length
    })

    return res.status(200).json({
      success: true,
      result
    })
  } catch (error) {
    console.error('[Pattern Analysis V2] Fatal error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Increase timeout for pattern analysis
export const config = {
  maxDuration: 300 // 5 minutes (Vercel limit)
}

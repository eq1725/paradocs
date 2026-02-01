/**
 * Admin API: POST /api/admin/trigger-pattern-analysis
 *
 * Manually trigger pattern analysis (no auth required for admin use)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { runOptimizedPatternAnalysis } from '@/lib/services/pattern-analysis-v2.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('[Admin] Triggering pattern analysis...')

    const result = await runOptimizedPatternAnalysis()

    return res.status(200).json({
      success: true,
      result
    })
  } catch (error) {
    console.error('[Admin] Pattern analysis error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
  }
}

export const config = {
  maxDuration: 300 // 5 minutes
}

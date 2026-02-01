/**
 * Admin API: POST /api/admin/run-pattern-analysis
 *
 * Manually trigger pattern analysis (for testing or when cron isn't available)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { runPatternAnalysis } from '@/lib/services/pattern-analysis.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('[Pattern Analysis] Manual trigger starting...')

    const runType = (req.query.type as string) === 'incremental' ? 'incremental' : 'full'
    const result = await runPatternAnalysis(runType)

    console.log('[Pattern Analysis] Complete:', result)

    return res.status(200).json({
      success: true,
      result
    })
  } catch (error) {
    console.error('[Pattern Analysis] Error:', error)
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

/**
 * API: POST /api/patterns/analyze
 *
 * Trigger pattern analysis run
 * In production, this would be called by a cron job
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { runPatternAnalysis } from '@/lib/services/pattern-analysis.service'

// Simple API key check for cron/admin access
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify authorization (cron secret or admin)
  const authHeader = req.headers.authorization
  const providedSecret = authHeader?.replace('Bearer ', '')

  // In production, require the cron secret
  if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
    if (providedSecret !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const { run_type = 'full' } = req.body

  try {
    console.log(`Starting pattern analysis (${run_type})...`)

    const result = await runPatternAnalysis(run_type as 'full' | 'incremental')

    console.log('Pattern analysis completed:', result)

    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('Pattern analysis error:', error)
    return res.status(500).json({
      error: 'Pattern analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

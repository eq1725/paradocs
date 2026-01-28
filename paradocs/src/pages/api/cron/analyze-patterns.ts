/**
 * API: POST /api/cron/analyze-patterns
 *
 * Vercel Cron Job endpoint for pattern analysis
 * Runs every 6 hours to detect emergent patterns
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { runPatternAnalysis } from '@/lib/services/pattern-analysis.service'
import { generateWeeklyDigest } from '@/lib/services/ai-insights.service'

// Vercel Cron requires this header
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify the request is from Vercel Cron
  const authHeader = req.headers.authorization

  // Check for Vercel's cron header or our cron secret
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const hasValidSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`

  if (process.env.NODE_ENV === 'production' && !isVercelCron && !hasValidSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('Starting scheduled pattern analysis...')

    // Run pattern detection
    const analysisResult = await runPatternAnalysis('full')

    // Check if we should generate weekly digest (once per week)
    const today = new Date()
    const isWeeklyDigestDay = today.getDay() === 0 // Sunday

    let digestGenerated = false
    if (isWeeklyDigestDay) {
      console.log('Generating weekly digest...')
      await generateWeeklyDigest()
      digestGenerated = true
    }

    console.log('Scheduled analysis completed:', analysisResult)

    return res.status(200).json({
      success: true,
      analysis: analysisResult,
      weekly_digest_generated: digestGenerated,
      next_run: getNextRunTime()
    })
  } catch (error) {
    console.error('Scheduled pattern analysis error:', error)
    return res.status(500).json({
      error: 'Scheduled analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

function getNextRunTime(): string {
  const now = new Date()
  const hours = now.getHours()
  const nextRunHour = Math.ceil((hours + 1) / 6) * 6 % 24

  const next = new Date(now)
  next.setHours(nextRunHour, 0, 0, 0)

  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }

  return next.toISOString()
}

// Configure for Vercel Cron - runs every 6 hours
export const config = {
  maxDuration: 300 // 5 minutes timeout for pattern analysis
}

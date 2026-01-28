/**
 * API: GET /api/patterns/[id]/insight
 *
 * Get or generate AI insight for a pattern
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getPatternInsight } from '@/lib/services/ai-insights.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Pattern ID is required' })
  }

  try {
    const insight = await getPatternInsight(id)

    if (!insight) {
      return res.status(404).json({ error: 'Pattern not found or insight generation failed' })
    }

    return res.status(200).json({ insight })
  } catch (error) {
    console.error('Pattern insight API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

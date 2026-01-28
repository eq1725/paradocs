/**
 * GET /api/subscription/tiers
 * Returns all available subscription tiers
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSubscriptionTiers } from '@/lib/subscription'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const tiers = await getSubscriptionTiers()

    return res.status(200).json({
      tiers,
      count: tiers.length
    })
  } catch (error) {
    console.error('Error fetching tiers:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

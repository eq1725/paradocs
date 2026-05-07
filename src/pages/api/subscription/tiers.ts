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

    // V9.6 T1.2 — enterprise is admin-only and not surfaced to users.
    // It still exists in the DB (for internal/admin tier overrides)
    // but the public tier list shows free / basic / pro only.
    const visible = (tiers || []).filter(function (t: any) {
      return t && t.name !== 'enterprise'
    })

    return res.status(200).json({
      tiers: visible,
      count: visible.length
    })
  } catch (error) {
    console.error('Error fetching tiers:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

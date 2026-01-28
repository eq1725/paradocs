/**
 * GET /api/user/subscription
 * Returns user's current subscription with usage stats
 *
 * POST /api/user/subscription
 * Change user's subscription tier
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import {
  getSubscriptionWithUsage,
  changeSubscription
} from '@/lib/subscription'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createServerClient()

  // Get authenticated user
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    try {
      const subscriptionData = await getSubscriptionWithUsage(user.id)

      if (!subscriptionData) {
        return res.status(404).json({ error: 'Subscription not found' })
      }

      return res.status(200).json(subscriptionData)
    } catch (error) {
      console.error('Error fetching subscription:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'POST') {
    try {
      const { tier_id } = req.body

      if (!tier_id) {
        return res.status(400).json({ error: 'tier_id is required' })
      }

      const result = await changeSubscription(user.id, tier_id)

      if (!result.success) {
        return res.status(400).json({ error: result.error })
      }

      // Get updated subscription data
      const updatedSubscription = await getSubscriptionWithUsage(user.id)

      return res.status(200).json({
        message: 'Subscription updated successfully',
        subscription: updatedSubscription
      })
    } catch (error) {
      console.error('Error changing subscription:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

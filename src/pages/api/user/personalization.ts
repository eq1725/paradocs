/**
 * GET /api/user/personalization
 * Returns user's personalization settings (location & interests)
 *
 * POST /api/user/personalization
 * Update user's personalization settings
 *
 * DELETE /api/user/personalization/location
 * Clear user's location data
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import {
  getUserPersonalization,
  updatePersonalization,
  clearLocationData,
  getPersonalizedInsights
} from '@/lib/services/personalization.service'

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

  // GET - Fetch personalization settings
  if (req.method === 'GET') {
    try {
      // Check if full insights are requested
      const withInsights = req.query.insights === 'true'

      if (withInsights) {
        const insights = await getPersonalizedInsights(user.id)
        return res.status(200).json(insights)
      }

      const personalization = await getUserPersonalization(user.id)

      if (!personalization) {
        return res.status(404).json({ error: 'Personalization settings not found' })
      }

      return res.status(200).json(personalization)
    } catch (error) {
      console.error('Error fetching personalization:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  // POST - Update personalization settings
  if (req.method === 'POST') {
    try {
      const {
        location_city,
        location_state,
        location_country,
        location_latitude,
        location_longitude,
        watch_radius_miles,
        share_location,
        interested_categories
      } = req.body

      const result = await updatePersonalization(user.id, {
        location_city,
        location_state,
        location_country,
        location_latitude,
        location_longitude,
        watch_radius_miles,
        share_location,
        interested_categories
      })

      if (!result.success) {
        return res.status(400).json({ error: result.error })
      }

      // Return updated personalization
      const updated = await getUserPersonalization(user.id)

      return res.status(200).json({
        message: 'Personalization updated successfully',
        personalization: updated
      })
    } catch (error) {
      console.error('Error updating personalization:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  // DELETE - Clear location data
  if (req.method === 'DELETE') {
    try {
      const result = await clearLocationData(user.id)

      if (!result.success) {
        return res.status(400).json({ error: result.error })
      }

      return res.status(200).json({ message: 'Location data cleared successfully' })
    } catch (error) {
      console.error('Error clearing location:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * GET /api/research-hub/insights
 * POST /api/research-hub/insights
 *
 * Handles insights for the Research Hub
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createServerClient()

  // Authenticate user
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    // GET: List active insights, filterable by view
    if (req.method === 'GET') {
      const { view, limit = '20' } = req.query

      const limitNum = Math.min(parseInt(limit as string, 10), 100)
      const now = new Date().toISOString()

      try {
        let query = supabase
          .from('constellation_ai_insights')
          .select('*')
          .eq('user_id', user.id)
          .eq('dismissed', false)

        // Filter by primary_view if provided
        if (view) {
          query = query.eq('primary_view', view as string)
        }

        // Filter out expired insights
        query = query.or('expires_at.is.null,expires_at.gt.' + now)

        const { data: insights, error } = await query
          .order('created_at', { ascending: false })
          .limit(limitNum)

        if (error) {
          if (error.code === '42P01') {
            return res.status(200).json({ insights: [] })
          }
          throw error
        }

        return res.status(200).json({ insights: insights || [] })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(200).json({ insights: [] })
        }
        throw error
      }
    }

    // POST: Provide feedback on insight (dismiss or mark helpful)
    if (req.method === 'POST') {
      const { id, helpful, dismissed } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      try {
        const updateData: Record<string, any> = {}

        if (dismissed !== undefined) {
          updateData.dismissed = dismissed
        }

        if (helpful !== undefined) {
          updateData.helpful = helpful
        }

        const { data: insight, error } = await supabase
          .from('constellation_ai_insights')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_ai_insights table does not exist' })
          }
          throw error
        }

        if (!insight) {
          return res.status(404).json({ error: 'Insight not found' })
        }

        return res.status(200).json({ insight })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_ai_insights table does not exist' })
        }
        throw error
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Insights API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

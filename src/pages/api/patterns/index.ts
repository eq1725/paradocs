/**
 * API: GET /api/patterns
 *
 * List detected patterns with optional filtering
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabase = createServerClient()

    const {
      status,
      type,
      limit = '20',
      offset = '0',
      sortBy = 'significance_score',
      sortOrder = 'desc'
    } = req.query

    let query = (supabase
      .from('detected_patterns' as any) as any)
      .select('*', { count: 'exact' })

    // Apply filters
    if (status) {
      const statuses = (status as string).split(',')
      query = query.in('status', statuses)
    } else {
      // Default to active and emerging patterns
      query = query.in('status', ['active', 'emerging'])
    }

    if (type) {
      const types = (type as string).split(',')
      query = query.in('pattern_type', types)
    }

    // Apply sorting
    const validSortFields = [
      'significance_score',
      'confidence_score',
      'report_count',
      'last_updated_at',
      'first_detected_at'
    ]
    const sortField = validSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : 'significance_score'

    query = query.order(sortField, {
      ascending: sortOrder === 'asc'
    })

    // Apply pagination
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100)
    const offsetNum = parseInt(offset as string, 10) || 0
    query = query.range(offsetNum, offsetNum + limitNum - 1)

    const { data: patterns, error, count } = await query

    if (error) {
      console.error('Error fetching patterns:', error)
      return res.status(500).json({ error: 'Failed to fetch patterns' })
    }

    return res.status(200).json({
      patterns,
      pagination: {
        total: count || 0,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (count || 0) > offsetNum + limitNum
      }
    })
  } catch (error) {
    console.error('Patterns API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

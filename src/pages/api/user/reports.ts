/**
 * GET /api/user/reports
 * Returns user's submitted reports with pagination and filtering
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

  try {
    // Parse query parameters
    const {
      page = '1',
      limit = '10',
      status,
      sort = 'created_at',
      order = 'desc',
      search
    } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = Math.min(parseInt(limit as string, 10), 50)
    const offset = (pageNum - 1) * limitNum

    // Build query.
    // V10.16 — added description, summary, city, state_province,
    // country so the CASES tab inline-preview pane can show the
    // full submission content for pending/in-review reports (which
    // can't be linked to /report/[slug] because that page filters
    // on status='approved').
    let query = supabase
      .from('reports')
      .select(`
        id,
        title,
        slug,
        status,
        category,
        description,
        summary,
        location_description,
        city,
        state_province,
        country,
        event_date,
        created_at,
        updated_at,
        view_count,
        credibility
      `, { count: 'exact' })
      .eq('submitted_by', user.id)

    // Apply status filter
    if (status && status !== 'all') {
      query = query.eq('status', status)
    } else {
      // V10.13.1 — by default exclude soft-deleted reports so the
      // CASES tab doesn't keep showing rows the user just deleted.
      // Pass ?status=deleted explicitly to surface a "trash" view in
      // the future.
      query = query.neq('status', 'deleted')
    }

    // Apply search filter
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }

    // Apply sorting
    const validSortFields = ['created_at', 'updated_at', 'title', 'status', 'view_count']
    const sortField = validSortFields.includes(sort as string) ? sort as string : 'created_at'
    const sortOrder = order === 'asc' ? true : false
    query = query.order(sortField, { ascending: sortOrder })

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1)

    const { data: reports, error, count } = await query

    if (error) {
      console.error('Error fetching reports:', error)
      throw error
    }

    // Calculate pagination info
    const totalPages = count ? Math.ceil(count / limitNum) : 0

    return res.status(200).json({
      reports: reports || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages,
        hasMore: pageNum < totalPages
      }
    })
  } catch (error) {
    console.error('Error fetching user reports:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

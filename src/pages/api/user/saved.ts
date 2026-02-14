/**
 * GET /api/user/saved
 * Returns user's saved reports with pagination
 *
 * POST /api/user/saved
 * Saves a report to user's list (idempotent)
 *
 * DELETE /api/user/saved
 * Removes a report from saved list
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

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
      const {
        page = '1',
        limit = '10',
        sort = 'created_at',
        order = 'desc'
      } = req.query

      const pageNum = parseInt(page as string, 10)
      const limitNum = Math.min(parseInt(limit as string, 10), 50)
      const offset = (pageNum - 1) * limitNum

      // Get saved reports with report details
      let query = supabase
        .from('saved_reports')
        .select(`
          id,
          created_at,
          reports:report_id (
            id,
            title,
            slug,
            status,
            category,
            location_description,
            event_date,
            created_at,
            view_count,
            credibility
          )
        `, { count: 'exact' })
        .eq('user_id', user.id)

      // Apply sorting
      const sortOrder = order === 'asc'
      query = query.order(sort as string, { ascending: sortOrder })

      // Apply pagination
      query = query.range(offset, offset + limitNum - 1)

      const { data: savedReports, error, count } = await query

      if (error) {
        console.error('Error fetching saved reports:', error)
        throw error
      }

      // Transform data to flatten the structure
      const reports = (savedReports || []).map((item: any) => ({
        saved_id: item.id,
        saved_at: item.created_at,
        ...(item.reports as any)
      }))

      const totalPages = count ? Math.ceil(count / limitNum) : 0

      return res.status(200).json({
        reports,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages,
          hasMore: pageNum < totalPages
        }
      })
    } catch (error) {
      console.error('Error fetching saved reports:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'POST') {
    try {
      const { report_id } = req.body

      if (!report_id) {
        return res.status(400).json({ error: 'report_id is required' })
      }

      // Check if already saved
      const { data: existing } = await supabase
        .from('saved_reports')
        .select('id')
        .eq('user_id', user.id)
        .eq('report_id', report_id)
        .single()

      if (existing) {
        return res.status(200).json({ success: true, saved_id: existing.id, already_saved: true })
      }

      const { data: inserted, error } = await supabase
        .from('saved_reports')
        .insert({ user_id: user.id, report_id })
        .select('id')
        .single()

      if (error) {
        console.error('Error saving report:', error)
        throw error
      }

      return res.status(201).json({ success: true, saved_id: inserted.id })
    } catch (error) {
      console.error('Error saving report:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { saved_id } = req.body

      if (!saved_id) {
        return res.status(400).json({ error: 'saved_id is required' })
      }

      const { error } = await supabase
        .from('saved_reports')
        .delete()
        .eq('id', saved_id)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error removing saved report:', error)
        throw error
      }

      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error removing saved report:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * Admin Media Management API
 *
 * Allows administrators to manage report media, including:
 * - Deleting artifacts or spam media
 * - Listing media for a report
 * - Bulk cleanup operations
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Admin client with service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Simple auth check - in production use proper admin auth
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || 'dev-admin-secret'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check admin authorization
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    // List media for a report
    const { report_slug, report_id } = req.query

    if (!report_slug && !report_id) {
      return res.status(400).json({ error: 'report_slug or report_id required' })
    }

    let targetReportId = report_id as string

    // If slug provided, look up the report ID
    if (report_slug && !report_id) {
      const { data: report, error: reportError } = await supabaseAdmin
        .from('reports')
        .select('id')
        .eq('slug', report_slug)
        .single()

      if (reportError || !report) {
        return res.status(404).json({ error: 'Report not found' })
      }
      targetReportId = report.id
    }

    // Fetch media
    const { data: media, error } = await supabaseAdmin
      .from('report_media')
      .select('*')
      .eq('report_id', targetReportId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Admin Media] Error fetching media:', error)
      return res.status(500).json({ error: 'Failed to fetch media' })
    }

    return res.json({ media, count: media?.length || 0 })
  }

  if (req.method === 'DELETE') {
    const { media_ids, report_slug, delete_all } = req.body

    // Delete specific media by IDs
    if (media_ids && Array.isArray(media_ids) && media_ids.length > 0) {
      const { error } = await supabaseAdmin
        .from('report_media')
        .delete()
        .in('id', media_ids)

      if (error) {
        console.error('[Admin Media] Error deleting media:', error)
        return res.status(500).json({ error: 'Failed to delete media' })
      }

      return res.json({ deleted: media_ids.length, message: 'Media deleted successfully' })
    }

    // Delete all media for a report
    if (report_slug && delete_all === true) {
      // First get the report ID
      const { data: report, error: reportError } = await supabaseAdmin
        .from('reports')
        .select('id')
        .eq('slug', report_slug)
        .single()

      if (reportError || !report) {
        return res.status(404).json({ error: 'Report not found' })
      }

      const { data: deleted, error } = await supabaseAdmin
        .from('report_media')
        .delete()
        .eq('report_id', report.id)
        .select('id')

      if (error) {
        console.error('[Admin Media] Error deleting all media:', error)
        return res.status(500).json({ error: 'Failed to delete media' })
      }

      return res.json({
        deleted: deleted?.length || 0,
        message: `All media deleted for report ${report_slug}`
      })
    }

    return res.status(400).json({ error: 'media_ids array or report_slug with delete_all required' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

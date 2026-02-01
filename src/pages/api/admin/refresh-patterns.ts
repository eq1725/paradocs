/**
 * Admin API: POST /api/admin/refresh-patterns
 *
 * Refresh existing patterns with updated report counts and status
 * without running expensive geographic clustering.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('[Pattern Refresh] Starting...')

    // Get all existing patterns
    const { data: patterns, error: patternsError } = await supabaseAdmin
      .from('detected_patterns')
      .select('id, pattern_type, status, report_count, metadata, last_updated_at')
      .in('status', ['active', 'emerging', 'declining'])

    if (patternsError) throw patternsError

    let updated = 0
    let archived = 0

    for (const pattern of patterns || []) {
      // Count current linked reports
      const { count: currentCount } = await supabaseAdmin
        .from('pattern_reports')
        .select('*', { count: 'exact', head: true })
        .eq('pattern_id', pattern.id)

      // Determine new status based on last activity
      const lastUpdated = new Date(pattern.last_updated_at)
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)

      let newStatus = pattern.status
      if (daysSinceUpdate > 90) {
        newStatus = 'historical'
        archived++
      } else if (daysSinceUpdate > 30) {
        newStatus = 'declining'
      } else if (daysSinceUpdate < 7) {
        newStatus = 'emerging'
      } else {
        newStatus = 'active'
      }

      // Update pattern
      await supabaseAdmin
        .from('detected_patterns')
        .update({
          report_count: currentCount || pattern.report_count,
          status: newStatus,
          last_updated_at: new Date().toISOString()
        })
        .eq('id', pattern.id)

      updated++
    }

    // Also update the total reports count in the database
    const { count: totalApproved } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    console.log('[Pattern Refresh] Complete:', { updated, archived, totalApproved })

    return res.status(200).json({
      success: true,
      updated,
      archived,
      total_patterns: patterns?.length || 0,
      total_reports: totalApproved
    })
  } catch (error) {
    console.error('[Pattern Refresh] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

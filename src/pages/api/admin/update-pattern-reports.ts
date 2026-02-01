/**
 * Admin API: POST /api/admin/update-pattern-reports
 *
 * Find new reports that match existing patterns and link them.
 * Uses pattern metadata (categories, date ranges) to find matching reports.
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
    console.log('[Update Pattern Reports] Starting...')

    // Get all active/emerging patterns
    const { data: patterns, error: patternsError } = await supabaseAdmin
      .from('detected_patterns')
      .select('*')
      .in('status', ['active', 'emerging', 'declining'])

    if (patternsError) throw patternsError

    const results: any[] = []

    for (const pattern of patterns || []) {
      let newReportsAdded = 0
      const categories = pattern.categories || []
      const metadata = pattern.metadata || {}

      // Get existing linked report IDs
      const { data: existingLinks } = await supabaseAdmin
        .from('pattern_reports')
        .select('report_id')
        .eq('pattern_id', pattern.id)

      const existingReportIds = new Set((existingLinks || []).map(l => l.report_id))

      // Find matching reports based on pattern type
      let query = supabaseAdmin
        .from('reports')
        .select('id, category, event_date')
        .eq('status', 'approved')

      // Filter by categories if pattern has them
      if (categories.length > 0) {
        query = query.in('category', categories)
      }

      // For temporal patterns, use date range from metadata
      if (metadata.first_date) {
        query = query.gte('event_date', metadata.first_date)
      }
      if (metadata.last_date) {
        // Extend the end date to capture new reports
        const extendedEndDate = new Date()
        query = query.lte('event_date', extendedEndDate.toISOString().split('T')[0])
      }

      // Limit to recent reports for performance
      query = query.order('created_at', { ascending: false }).limit(5000)

      const { data: matchingReports, error: reportsError } = await query

      if (reportsError) {
        console.error(`Error finding reports for pattern ${pattern.id}:`, reportsError)
        continue
      }

      // Add new report links
      const newLinks: { pattern_id: string; report_id: string; relevance_score: number }[] = []

      for (const report of matchingReports || []) {
        if (!existingReportIds.has(report.id)) {
          newLinks.push({
            pattern_id: pattern.id,
            report_id: report.id,
            relevance_score: 0.8 // Default relevance for auto-matched
          })
        }
      }

      if (newLinks.length > 0) {
        // Insert in batches
        const batchSize = 500
        for (let i = 0; i < newLinks.length; i += batchSize) {
          const batch = newLinks.slice(i, i + batchSize)
          await supabaseAdmin
            .from('pattern_reports')
            .upsert(batch, { onConflict: 'pattern_id,report_id' })
        }
        newReportsAdded = newLinks.length
      }

      // Update pattern's report count and timestamp
      const totalReports = existingReportIds.size + newReportsAdded

      // Determine status based on activity
      const daysSinceFirstDetected = (Date.now() - new Date(pattern.first_detected_at).getTime()) / (1000 * 60 * 60 * 24)
      let newStatus = pattern.status

      if (newReportsAdded > 0) {
        newStatus = daysSinceFirstDetected < 14 ? 'emerging' : 'active'
      }

      await supabaseAdmin
        .from('detected_patterns')
        .update({
          report_count: totalReports,
          status: newStatus,
          last_updated_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            last_date: new Date().toISOString().split('T')[0],
            auto_updated: true,
            last_auto_update: new Date().toISOString()
          }
        })
        .eq('id', pattern.id)

      results.push({
        pattern_id: pattern.id,
        title: pattern.ai_title?.substring(0, 50),
        previous_count: existingReportIds.size,
        new_reports_added: newReportsAdded,
        new_total: totalReports,
        new_status: newStatus
      })
    }

    console.log('[Update Pattern Reports] Complete:', results)

    return res.status(200).json({
      success: true,
      patterns_processed: results.length,
      results
    })
  } catch (error) {
    console.error('[Update Pattern Reports] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const config = {
  maxDuration: 300 // 5 minutes
}

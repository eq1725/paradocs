/**
 * API: POST /api/admin/invalidate-insights
 *
 * Marks all pattern insights as stale so they regenerate with updated AI prompts.
 * Admin only.
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

  const scope = req.body?.scope || 'all' // 'all', 'patterns', 'reports', 'reddit-reports'

  try {
    let patternCount = 0
    let reportCount = 0

    // Mark pattern insights as stale
    if (scope === 'all' || scope === 'patterns') {
      const { data, error } = await supabaseAdmin
        .from('pattern_insights')
        .update({ is_stale: true })
        .eq('insight_type', 'pattern_narrative')
        .select('id')

      if (error) {
        console.error('Error invalidating pattern insights:', error)
      } else {
        patternCount = data?.length || 0
      }

      // Also clear ai_narrative from detected_patterns so they regenerate
      const { error: patternError } = await supabaseAdmin
        .from('detected_patterns')
        .update({
          ai_narrative: null,
          ai_narrative_generated_at: null
        })
        .not('ai_narrative', 'is', null)

      if (patternError) {
        console.error('Error clearing pattern narratives:', patternError)
      }
    }

    // Mark report-level insights as stale
    if (scope === 'all' || scope === 'reports') {
      const { data, error } = await supabaseAdmin
        .from('report_insights' as any)
        .update({ is_stale: true })
        .eq('is_stale', false)
        .select('id')

      if (error) {
        console.error('Error invalidating report insights:', error)
      } else {
        reportCount = (data as any[])?.length || 0
      }
    }

    // Only invalidate insights for Reddit-sourced reports
    if (scope === 'reddit-reports') {
      // Get all Reddit report IDs, then invalidate their insights
      const { data: redditReports } = await supabaseAdmin
        .from('reports')
        .select('id')
        .in('source_type', ['reddit', 'reddit-comments'])

      if (redditReports && redditReports.length > 0) {
        const reportIds = redditReports.map((r: any) => r.id)
        // Process in chunks of 500
        for (let i = 0; i < reportIds.length; i += 500) {
          const chunk = reportIds.slice(i, i + 500)
          const { data, error } = await supabaseAdmin
            .from('report_insights' as any)
            .update({ is_stale: true })
            .in('report_id', chunk)
            .select('id')

          if (!error && data) {
            reportCount += (data as any[]).length
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      scope,
      pattern_insights_invalidated: patternCount,
      report_insights_invalidated: reportCount,
      message: `Insights marked as stale (scope: ${scope}). They will regenerate on next view.`
    })
  } catch (error) {
    console.error('Invalidate insights error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

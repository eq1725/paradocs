/**
 * Admin API: POST /api/admin/cleanup-ingestion-patterns
 *
 * Archives patterns that were created from bulk ingestion surges
 * These are not genuine emerging patterns, just data setup
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

  const dryRun = req.query.dryRun === 'true'

  try {
    console.log(`[Cleanup Patterns] Starting (dryRun: ${dryRun})...`)

    // Find patterns that are likely from bulk ingestion:
    // - Created in the current week (during our bulk upload)
    // - Have very high report counts (1000+ reports)
    // - Have "1300% Above Average" or similar surge language
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const { data: suspectPatterns, error: fetchError } = await supabaseAdmin
      .from('detected_patterns')
      .select('id, ai_title, pattern_type, report_count, created_at, status')
      .gte('created_at', oneWeekAgo.toISOString())
      .in('status', ['active', 'emerging'])
      .or('report_count.gte.500,ai_title.ilike.%1000%,ai_title.ilike.%1300%')

    if (fetchError) throw fetchError

    console.log(`[Cleanup Patterns] Found ${suspectPatterns?.length || 0} suspect patterns`)

    // Log what we found
    const samples = (suspectPatterns || []).slice(0, 10).map(p => ({
      id: p.id,
      title: p.ai_title?.substring(0, 60),
      count: p.report_count,
      status: p.status
    }))

    if (!dryRun && suspectPatterns && suspectPatterns.length > 0) {
      // Archive these patterns
      const { error: archiveError } = await supabaseAdmin
        .from('detected_patterns')
        .update({
          status: 'archived',
          metadata: {
            archived_reason: 'bulk_ingestion_surge',
            archived_at: new Date().toISOString()
          }
        })
        .in('id', suspectPatterns.map(p => p.id))

      if (archiveError) throw archiveError
    }

    return res.status(200).json({
      success: true,
      dryRun,
      patternsFound: suspectPatterns?.length || 0,
      archived: dryRun ? 0 : (suspectPatterns?.length || 0),
      samples
    })

  } catch (error) {
    console.error('[Cleanup Patterns] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

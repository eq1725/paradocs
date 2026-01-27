/**
 * API: GET /api/patterns/[id]
 *
 * Get a single pattern by ID with its associated reports and insights
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

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Pattern ID is required' })
  }

  try {
    const supabase = createServerClient()

    // Fetch pattern
    const { data: pattern, error: patternError } = await supabase
      .from('detected_patterns')
      .select('*')
      .eq('id', id)
      .single()

    if (patternError || !pattern) {
      return res.status(404).json({ error: 'Pattern not found' })
    }

    // Fetch associated reports
    const { data: reportLinks } = await supabase
      .from('pattern_reports')
      .select(`
        relevance_score,
        report:report_id (
          id,
          title,
          slug,
          category,
          event_date,
          location_description,
          coordinates
        )
      `)
      .eq('pattern_id', id)
      .order('relevance_score', { ascending: false })
      .limit(20)

    // Fetch latest insight
    const { data: insight } = await supabase
      .from('pattern_insights')
      .select('*')
      .eq('pattern_id', id)
      .eq('insight_type', 'pattern_narrative')
      .eq('is_stale', false)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    // Increment view count
    await supabase
      .from('detected_patterns')
      .update({ view_count: (pattern.view_count || 0) + 1 })
      .eq('id', id)

    return res.status(200).json({
      pattern,
      reports: reportLinks?.map(link => ({
        ...link.report,
        relevance_score: link.relevance_score
      })) || [],
      insight
    })
  } catch (error) {
    console.error('Pattern detail API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

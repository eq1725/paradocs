/**
 * API: GET /api/reports/[slug]/insight
 *
 * Get or generate AI insight for a report
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'
import { getReportInsight } from '@/lib/services/report-insights.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  try {
    // First, get the report ID from the slug
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Get or generate the insight
    const insight = await getReportInsight(report.id)

    if (!insight) {
      return res.status(404).json({ error: 'Could not generate insight for this report' })
    }

    return res.status(200).json({ insight })
  } catch (error) {
    console.error('Report insight API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

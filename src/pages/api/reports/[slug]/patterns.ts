/**
 * API: GET /api/reports/[slug]/patterns
 *
 * Get patterns that contain this report
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'
import { createServerClient } from '@/lib/supabase'

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
    // Get the report ID from the slug
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Get patterns containing this report using the junction table
    const serverClient = createServerClient()
    const { data: patterns, error: patternError } = await (serverClient
      .from('pattern_reports' as any) as any)
      .select(`
        relevance_score,
        pattern:pattern_id (
          id,
          pattern_type,
          status,
          ai_title,
          ai_summary,
          confidence_score,
          significance_score,
          report_count,
          first_detected_at,
          last_updated_at
        )
      `)
      .eq('report_id', report.id)

    if (patternError) {
      console.error('Error fetching patterns:', patternError)
      return res.status(500).json({ error: 'Failed to fetch patterns' })
    }

    // Filter to only active/emerging patterns and format response
    const activePatterns = (patterns || [])
      .filter((p: any) => p.pattern && ['active', 'emerging'].includes(p.pattern.status))
      .map((p: any) => ({
        ...p.pattern,
        relevance_score: p.relevance_score
      }))
      .sort((a: any, b: any) => {
        // Sort by relevance, then significance
        if (b.relevance_score !== a.relevance_score) {
          return b.relevance_score - a.relevance_score
        }
        return b.significance_score - a.significance_score
      })

    return res.status(200).json({
      patterns: activePatterns,
      total: activePatterns.length
    })
  } catch (error) {
    console.error('Report patterns API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

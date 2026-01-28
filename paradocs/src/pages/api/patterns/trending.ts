import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' })
    }

  const { limit = '5' } = req.query
    const limitNum = Math.min(parseInt(limit as string) || 5, 20)

  const supabase = createServerClient()

  const { data: patterns, error } = await supabase
      .from('detected_patterns')
      .select(`
            id, pattern_type, status, confidence_score, significance_score,
                  report_count, ai_title, ai_summary, metadata, categories,
                        center_point, radius_km, first_report_date, last_report_date, created_at
                            `)
      .in('status', ['active', 'emerging'])
      .order('significance_score', { ascending: false })
      .limit(limitNum)

  if (error) {
        return res.status(500).json({ error: error.message })
  }

  const enrichedPatterns = patterns?.map(p => ({
        ...p,
        trend: p.status === 'emerging' ? 'rising' : 'stable'
  })) || []

      return res.status(200).json({ patterns: enrichedPatterns })
}

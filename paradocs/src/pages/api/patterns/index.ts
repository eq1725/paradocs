import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' })
    }

  const { type, status, limit = '20', offset = '0' } = req.query
    const supabase = createServerClient()

  let query = supabase
      .from('detected_patterns')
      .select('*', { count: 'exact' })

  if (type) query = query.eq('pattern_type', type)
    if (status) query = query.eq('status', status)

  const { data, error, count } = await query
      .order('significance_score', { ascending: false })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1)

  if (error) {
        return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ patterns: data, total: count })
}

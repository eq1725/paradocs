import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/stats/locations
 *
 * Returns the count of distinct report locations in the database.
 * A "location" is a unique (city, state_province, country) tuple
 * where at least one field is non-null.
 *
 * Response: { count: number }
 *
 * Cached for 5 minutes via Cache-Control to avoid hammering the DB
 * on every homepage load.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Fetch distinct location tuples from reports
    // We select the three location columns and filter for rows with at least one non-null
    const { data, error } = await supabase
      .from('reports')
      .select('city, state_province, country')
      .or('city.not.is.null,state_province.not.is.null,country.not.is.null')

    if (error) {
      console.error('Location count error:', error)
      return res.status(500).json({ error: 'Failed to fetch location count' })
    }

    // Deduplicate to unique location tuples
    var seen = new Set<string>()
    if (data) {
      for (var i = 0; i < data.length; i++) {
        var row = data[i]
        var key = (row.city || '') + '|' + (row.state_province || '') + '|' + (row.country || '')
        seen.add(key)
      }
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

    return res.status(200).json({ count: seen.size })
  } catch (err) {
    console.error('Location stats error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

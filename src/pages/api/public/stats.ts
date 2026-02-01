import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Use service role for server-side queries (no row limit)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Use fast approximate counts to avoid timeout on 250K+ rows
    let total = 0

    // Try RPC first (fastest)
    try {
      const { data: countData } = await supabaseAdmin
        .rpc('get_approved_reports_count')
        .single()
      if (countData?.count) {
        total = Number(countData.count)
      }
    } catch {
      // RPC doesn't exist yet
    }

    // Fallback: use head count query (slower but accurate)
    if (!total) {
      try {
        const { count } = await supabaseAdmin
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
        total = count || 0
      } catch {
        // Last resort fallback
        total = 0
      }
    }

    // Get this month's count - smaller dataset, can use exact
    const thisMonth = new Date()
    thisMonth.setUTCDate(1)
    thisMonth.setUTCHours(0, 0, 0, 0)

    let monthly = 0
    try {
      const { data: recentData, error: monthlyError } = await supabaseAdmin
        .from('reports')
        .select('id')
        .eq('status', 'approved')
        .gte('created_at', thisMonth.toISOString())
        .limit(10000)

      if (!monthlyError && recentData) {
        monthly = recentData.length
      }
    } catch {
      // Monthly count optional
    }

    // Get unique countries - try RPC first, else direct query
    let uniqueCountries = 0
    try {
      const { data: countryData, error: countryError } = await supabaseAdmin
        .rpc('get_unique_countries_count')
        .single()
      if (!countryError && countryData?.count) {
        uniqueCountries = Number(countryData.count)
      }
    } catch {
      // RPC doesn't exist yet
    }

    // Fallback: sample distinct countries
    if (!uniqueCountries) {
      try {
        const { data: countries } = await supabaseAdmin
          .from('reports')
          .select('country')
          .eq('status', 'approved')
          .not('country', 'is', null)
          .limit(10000)
        const uniqueSet = new Set(countries?.map(r => r.country).filter(Boolean))
        uniqueCountries = uniqueSet.size
      } catch {
        uniqueCountries = 0
      }
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')

    return res.status(200).json({
      total: total || 0,
      thisMonth: monthly || 0,
      countries: uniqueCountries
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return res.status(500).json({ error: 'Failed to fetch stats' })
  }
}

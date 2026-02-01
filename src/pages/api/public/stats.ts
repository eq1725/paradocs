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
    // Get total approved reports count
    const { count: total, error: totalError } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    if (totalError) throw totalError

    // Get this month's count (from 1st of month at midnight UTC)
    const thisMonth = new Date()
    thisMonth.setUTCDate(1)
    thisMonth.setUTCHours(0, 0, 0, 0)

    const { count: monthly, error: monthlyError } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('created_at', thisMonth.toISOString())

    if (monthlyError) throw monthlyError

    // Get unique countries using raw SQL for accuracy
    // This bypasses row limits and gets true distinct count
    const { data: countryData, error: countryError } = await supabaseAdmin
      .rpc('get_unique_countries_count')
      .single()

    let uniqueCountries = 0
    if (countryError) {
      // Fallback: paginate through countries if RPC doesn't exist
      const allCountries = new Set<string>()
      let offset = 0
      const pageSize = 1000

      while (true) {
        const { data: batch, error: batchError } = await supabaseAdmin
          .from('reports')
          .select('country')
          .eq('status', 'approved')
          .not('country', 'is', null)
          .range(offset, offset + pageSize - 1)

        if (batchError || !batch || batch.length === 0) break

        batch.forEach(r => {
          if (r.country) allCountries.add(r.country)
        })

        if (batch.length < pageSize) break
        offset += pageSize
      }

      uniqueCountries = allCountries.size
    } else {
      uniqueCountries = countryData?.count || 0
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

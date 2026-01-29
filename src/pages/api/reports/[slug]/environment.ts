/**
 * Environmental Context API
 *
 * Returns astronomical and environmental data for a report's date/time
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getEnvironmentalContext } from '@/lib/services/astronomical.service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  try {
    // Get report data
    const { data: report, error } = await supabase
      .from('reports')
      .select('id, event_date, event_time, latitude, longitude')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (error || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Get environmental context
    const latitude = report.latitude || 0
    const context = getEnvironmentalContext(
      report.event_date,
      report.event_time,
      latitude
    )

    return res.status(200).json({
      reportId: report.id,
      eventDate: report.event_date,
      eventTime: report.event_time,
      ...context
    })
  } catch (error) {
    console.error('Error fetching environmental context:', error)
    return res.status(500).json({ error: 'Failed to fetch environmental context' })
  }
}

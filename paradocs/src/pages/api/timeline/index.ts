/**
 * Timeline Visualization API
 * GET /api/timeline - Get timeline data for visualization
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface TimelineEvent {
  id: string
  date: string
  time?: string
  title: string
  description: string
  category: string
  location: string
  country: string
  latitude?: number
  longitude?: number
  significance: number
  has_media: boolean
  report_id?: string
}

interface TimelineStats {
  total_events: number
  date_range: { start: string; end: string }
  events_by_category: Record<string, number>
  events_by_year: Record<string, number>
  peak_period: { year: number; month: number; count: number }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  const supabase = createServerClient()

  try {
    const {
      start_date,
      end_date,
      category,
      country,
      min_significance = '1',
      limit = '500',
      granularity = 'day', // day, month, year
      include_stats = 'true',
    } = req.query

    // Build query
    let query = supabase
      .from('reports')
      .select('id, title, description, category, location, country, date_of_encounter, time_of_encounter, latitude, longitude, has_photo_video, credibility')
      .eq('status', 'approved')
      .not('date_of_encounter', 'is', null)
      .order('date_of_encounter', { ascending: true })

    // Apply filters
    if (start_date) {
      query = query.gte('date_of_encounter', start_date as string)
    }

    if (end_date) {
      query = query.lte('date_of_encounter', end_date as string)
    }

    if (category) {
      query = query.eq('category', category as string)
    }

    if (country) {
      query = query.ilike('country', `%${country}%`)
    }

    query = query.limit(parseInt(limit as string))

    const { data: reports, error } = await query

    if (error) throw error

    // Transform to timeline events
    const events: TimelineEvent[] = (reports || []).map(report => ({
      id: report.id,
      date: report.date_of_encounter,
      time: report.time_of_encounter,
      title: report.title,
      description: report.description?.slice(0, 200) + (report.description?.length > 200 ? '...' : ''),
      category: report.category,
      location: report.location,
      country: report.country,
      latitude: report.latitude,
      longitude: report.longitude,
      significance: calculateSignificance(report),
      has_media: report.has_photo_video,
      report_id: report.id,
    })).filter(e => e.significance >= parseInt(min_significance as string))

    // Calculate statistics if requested
    let stats: TimelineStats | null = null

    if (include_stats === 'true' && events.length > 0) {
      const eventsByCategory: Record<string, number> = {}
      const eventsByYear: Record<string, number> = {}
      const eventsByYearMonth: Record<string, number> = {}

      events.forEach(e => {
        // By category
        eventsByCategory[e.category] = (eventsByCategory[e.category] || 0) + 1

        // By year
        const year = e.date.split('-')[0]
        eventsByYear[year] = (eventsByYear[year] || 0) + 1

        // By year-month
        const yearMonth = e.date.slice(0, 7)
        eventsByYearMonth[yearMonth] = (eventsByYearMonth[yearMonth] || 0) + 1
      })

      // Find peak period
      const peakYearMonth = Object.entries(eventsByYearMonth)
        .sort((a, b) => b[1] - a[1])[0]

      const [peakYear, peakMonth] = peakYearMonth?.[0]?.split('-').map(Number) || [0, 0]

      stats = {
        total_events: events.length,
        date_range: {
          start: events[0]?.date || '',
          end: events[events.length - 1]?.date || '',
        },
        events_by_category: eventsByCategory,
        events_by_year: eventsByYear,
        peak_period: {
          year: peakYear,
          month: peakMonth,
          count: peakYearMonth?.[1] || 0,
        },
      }
    }

    // Aggregate by granularity if needed
    let aggregatedEvents = events
    if (granularity === 'month' || granularity === 'year') {
      const grouped: Record<string, TimelineEvent[]> = {}

      events.forEach(e => {
        const key = granularity === 'year'
          ? e.date.split('-')[0]
          : e.date.slice(0, 7)

        if (!grouped[key]) grouped[key] = []
        grouped[key].push(e)
      })

      aggregatedEvents = Object.entries(grouped).map(([period, periodEvents]) => {
        const topEvent = periodEvents.sort((a, b) => b.significance - a.significance)[0]
        return {
          ...topEvent,
          id: `agg-${period}`,
          date: granularity === 'year' ? `${period}-01-01` : `${period}-01`,
          title: `${periodEvents.length} reports in ${period}`,
          description: `Categories: ${[...new Set(periodEvents.map(e => e.category))].join(', ')}`,
          significance: Math.max(...periodEvents.map(e => e.significance)),
        }
      })
    }

    return res.status(200).json({
      events: aggregatedEvents,
      stats,
      filters_applied: {
        start_date: start_date || null,
        end_date: end_date || null,
        category: category || null,
        country: country || null,
        granularity,
      },
    })

  } catch (error) {
    console.error('Timeline API error:', error)
    return res.status(500).json({ error: 'Failed to fetch timeline data' })
  }
}

function calculateSignificance(report: any): number {
  let score = 5 // Base score

  // Credibility boost
  if (report.credibility === 'verified') score += 3
  else if (report.credibility === 'credible') score += 2

  // Media boost
  if (report.has_photo_video) score += 2

  // Description length (more detail = more significant)
  if (report.description?.length > 500) score += 1

  return Math.min(score, 10)
}

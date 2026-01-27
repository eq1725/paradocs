/**
 * API: GET /api/patterns/trending
 *
 * Get trending patterns for dashboard widgets
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

  try {
    const supabase = createServerClient()
    const { limit = '5' } = req.query
    const limitNum = Math.min(parseInt(limit as string, 10) || 5, 20)

    // Fetch trending patterns (active/emerging with highest significance)
    const { data: patterns, error } = await supabase
      .from('detected_patterns')
      .select(`
        id,
        pattern_type,
        status,
        confidence_score,
        significance_score,
        report_count,
        ai_title,
        ai_summary,
        center_point,
        radius_km,
        categories,
        first_detected_at,
        last_updated_at,
        metadata
      `)
      .in('status', ['active', 'emerging'])
      .order('significance_score', { ascending: false })
      .order('last_updated_at', { ascending: false })
      .limit(limitNum)

    if (error) {
      console.error('Error fetching trending patterns:', error)
      return res.status(500).json({ error: 'Failed to fetch trending patterns' })
    }

    // Add type-specific labels and icons
    const enrichedPatterns = patterns?.map(pattern => ({
      ...pattern,
      typeLabel: getPatternTypeLabel(pattern.pattern_type),
      typeIcon: getPatternTypeIcon(pattern.pattern_type)
    })) || []

    return res.status(200).json({ patterns: enrichedPatterns })
  } catch (error) {
    console.error('Trending patterns API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

function getPatternTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    geographic_cluster: 'Hotspot',
    temporal_anomaly: 'Activity Spike',
    flap_wave: 'Wave Event',
    characteristic_correlation: 'Correlation',
    regional_concentration: 'Regional Focus',
    seasonal_pattern: 'Seasonal Trend',
    time_of_day_pattern: 'Time Pattern',
    date_correlation: 'Date Correlation'
  }
  return labels[type] || 'Pattern'
}

function getPatternTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    geographic_cluster: 'map-pin',
    temporal_anomaly: 'trending-up',
    flap_wave: 'waves',
    characteristic_correlation: 'link',
    regional_concentration: 'target',
    seasonal_pattern: 'calendar',
    time_of_day_pattern: 'clock',
    date_correlation: 'calendar-days'
  }
  return icons[type] || 'activity'
}

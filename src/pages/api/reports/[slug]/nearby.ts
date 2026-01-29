/**
 * API: GET /api/reports/[slug]/nearby
 *
 * Get nearby reports within a specified radius
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug, radius = '50', limit = '10' } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  const radiusKm = Math.min(Math.max(parseFloat(radius as string) || 50, 1), 500)
  const maxLimit = Math.min(Math.max(parseInt(limit as string) || 10, 1), 50)

  try {
    // Get the source report with coordinates
    const { data: sourceReport, error: reportError } = await supabase
      .from('reports')
      .select('id, latitude, longitude')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !sourceReport) {
      return res.status(404).json({ error: 'Report not found' })
    }

    if (!sourceReport.latitude || !sourceReport.longitude) {
      return res.status(200).json({
        nearby: [],
        total: 0,
        message: 'Source report has no location data'
      })
    }

    // Query nearby reports using PostGIS
    // Note: This uses a simplified distance calculation
    // For production, use the find_nearby_reports function or PostGIS directly
    const latRange = radiusKm / 111  // Approximate km to degrees latitude
    const lngRange = radiusKm / (111 * Math.cos(sourceReport.latitude * Math.PI / 180))

    const { data: nearbyReports, error: nearbyError } = await supabase
      .from('reports')
      .select(`
        id,
        title,
        slug,
        category,
        event_date,
        latitude,
        longitude,
        location_name,
        summary
      `)
      .neq('id', sourceReport.id)
      .eq('status', 'approved')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', sourceReport.latitude - latRange)
      .lte('latitude', sourceReport.latitude + latRange)
      .gte('longitude', sourceReport.longitude - lngRange)
      .lte('longitude', sourceReport.longitude + lngRange)
      .limit(maxLimit * 2)  // Fetch extra to filter by actual distance

    if (nearbyError) {
      console.error('Error fetching nearby reports:', nearbyError)
      return res.status(500).json({ error: 'Failed to fetch nearby reports' })
    }

    // Calculate actual distances and filter/sort
    const reportsWithDistance = (nearbyReports || [])
      .map(report => {
        const distance = calculateDistance(
          sourceReport.latitude!,
          sourceReport.longitude!,
          report.latitude!,
          report.longitude!
        )
        return { ...report, distance_km: Math.round(distance * 10) / 10 }
      })
      .filter(report => report.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, maxLimit)

    return res.status(200).json({
      nearby: reportsWithDistance,
      total: reportsWithDistance.length,
      center: {
        latitude: sourceReport.latitude,
        longitude: sourceReport.longitude
      },
      radius_km: radiusKm
    })
  } catch (error) {
    console.error('Nearby reports API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

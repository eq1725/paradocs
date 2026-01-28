/**
 * Geographic Hotspots API
 * GET /api/hotspots - List detected hotspots
 * POST /api/hotspots/detect - Run hotspot detection algorithm
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface Hotspot {
  id: string
  name: string
  description: string
  center_lat: number
  center_lng: number
  radius_km: number
  report_count: number
  intensity_score: number
  primary_category: string
  category_breakdown: Record<string, number>
  first_report_date: string
  last_report_date: string
  is_active: boolean
}

// Simple clustering algorithm parameters
const CLUSTER_RADIUS_KM = 50
const MIN_REPORTS_FOR_HOTSPOT = 3

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()

  if (req.method === 'GET') {
    // List existing hotspots
    try {
      const {
        category,
        min_intensity,
        active_only,
        limit = '50',
        offset = '0',
        sort_by = 'intensity',
      } = req.query

      let query = supabase
        .from('geographic_hotspots')
        .select('*')

      if (category) {
        query = query.eq('primary_category', category)
      }

      if (min_intensity) {
        query = query.gte('intensity_score', parseFloat(min_intensity as string))
      }

      if (active_only === 'true') {
        query = query.eq('is_active', true)
      }

      // Sorting
      switch (sort_by) {
        case 'reports':
          query = query.order('report_count', { ascending: false })
          break
        case 'recent':
          query = query.order('last_report_date', { ascending: false })
          break
        default:
          query = query.order('intensity_score', { ascending: false })
      }

      query = query.range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1)

      const { data: hotspots, error } = await query

      if (error) throw error

      return res.status(200).json({
        hotspots: hotspots || [],
        total: hotspots?.length || 0,
      })

    } catch (error) {
      console.error('Hotspots list error:', error)
      return res.status(500).json({ error: 'Failed to fetch hotspots' })
    }
  }

  if (req.method === 'POST') {
    // Run hotspot detection (admin/cron only in production)
    try {
      // Get all approved reports with coordinates
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('id, title, category, latitude, longitude, date_of_encounter, credibility')
        .eq('status', 'approved')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (reportsError) throw reportsError

      if (!reports || reports.length === 0) {
        return res.status(200).json({ message: 'No reports with coordinates found', hotspots_detected: 0 })
      }

      // Cluster reports by proximity
      const clusters: Array<{
        reports: typeof reports
        center_lat: number
        center_lng: number
      }> = []

      const assigned = new Set<string>()

      for (const report of reports) {
        if (assigned.has(report.id)) continue

        // Find all reports within CLUSTER_RADIUS_KM
        const nearbyReports = reports.filter(r => {
          if (assigned.has(r.id)) return false
          const distance = calculateDistance(
            report.latitude!, report.longitude!,
            r.latitude!, r.longitude!
          )
          return distance <= CLUSTER_RADIUS_KM
        })

        if (nearbyReports.length >= MIN_REPORTS_FOR_HOTSPOT) {
          // Calculate cluster center
          const center_lat = nearbyReports.reduce((sum, r) => sum + r.latitude!, 0) / nearbyReports.length
          const center_lng = nearbyReports.reduce((sum, r) => sum + r.longitude!, 0) / nearbyReports.length

          clusters.push({
            reports: nearbyReports,
            center_lat,
            center_lng,
          })

          nearbyReports.forEach(r => assigned.add(r.id))
        }
      }

      // Convert clusters to hotspots
      const detectedHotspots: Omit<Hotspot, 'id'>[] = clusters.map(cluster => {
        // Count categories
        const categoryBreakdown: Record<string, number> = {}
        cluster.reports.forEach(r => {
          categoryBreakdown[r.category] = (categoryBreakdown[r.category] || 0) + 1
        })

        const primaryCategory = Object.entries(categoryBreakdown)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'

        // Find date range
        const dates = cluster.reports
          .map(r => r.date_of_encounter)
          .filter(Boolean)
          .sort()

        const firstDate = dates[0]
        const lastDate = dates[dates.length - 1]

        // Calculate if active (report in last 90 days)
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const isActive = lastDate ? new Date(lastDate) > ninetyDaysAgo : false

        // Calculate days since first report
        const daysActive = firstDate
          ? Math.ceil((Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
          : 365

        // Check if any reports are verified
        const hasVerified = cluster.reports.some(r => r.credibility === 'verified')

        // Calculate intensity
        const intensity = calculateIntensity(cluster.reports.length, daysActive, hasVerified)

        // Generate name based on location (would need reverse geocoding in production)
        const name = `Hotspot ${cluster.center_lat.toFixed(2)}, ${cluster.center_lng.toFixed(2)}`

        return {
          name,
          description: `Cluster of ${cluster.reports.length} ${primaryCategory} reports`,
          center_lat: cluster.center_lat,
          center_lng: cluster.center_lng,
          radius_km: CLUSTER_RADIUS_KM,
          report_count: cluster.reports.length,
          intensity_score: intensity,
          primary_category: primaryCategory,
          category_breakdown: categoryBreakdown,
          first_report_date: firstDate || new Date().toISOString().split('T')[0],
          last_report_date: lastDate || new Date().toISOString().split('T')[0],
          is_active: isActive,
        }
      })

      // Upsert hotspots (merge with existing or create new)
      for (const hotspot of detectedHotspots) {
        // Check if similar hotspot exists (within 10km of center)
        const { data: existing } = await supabase
          .from('geographic_hotspots')
          .select('id')
          .gte('center_lat', hotspot.center_lat - 0.1)
          .lte('center_lat', hotspot.center_lat + 0.1)
          .gte('center_lng', hotspot.center_lng - 0.1)
          .lte('center_lng', hotspot.center_lng + 0.1)
          .limit(1)
          .single()

        if (existing) {
          // Update existing hotspot
          await supabase
            .from('geographic_hotspots')
            .update({
              report_count: hotspot.report_count,
              intensity_score: hotspot.intensity_score,
              category_breakdown: hotspot.category_breakdown,
              last_report_date: hotspot.last_report_date,
              is_active: hotspot.is_active,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        } else {
          // Insert new hotspot
          const { data: newHotspot } = await supabase
            .from('geographic_hotspots')
            .insert({
              ...hotspot,
              detection_method: 'clustering',
            })
            .select('id')
            .single()

          // Link reports to hotspot
          if (newHotspot) {
            const cluster = clusters.find(c =>
              Math.abs(c.center_lat - hotspot.center_lat) < 0.001 &&
              Math.abs(c.center_lng - hotspot.center_lng) < 0.001
            )

            if (cluster) {
              const links = cluster.reports.map(r => ({
                hotspot_id: newHotspot.id,
                report_id: r.id,
                distance_km: calculateDistance(
                  hotspot.center_lat, hotspot.center_lng,
                  r.latitude!, r.longitude!
                ),
              }))

              await supabase.from('hotspot_reports').upsert(links, {
                onConflict: 'hotspot_id,report_id'
              })
            }
          }
        }
      }

      return res.status(200).json({
        message: 'Hotspot detection completed',
        hotspots_detected: detectedHotspots.length,
        total_reports_analyzed: reports.length,
        reports_in_hotspots: assigned.size,
      })

    } catch (error) {
      console.error('Hotspot detection error:', error)
      return res.status(500).json({ error: 'Failed to detect hotspots' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: `Method ${req.method} not allowed` })
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function calculateIntensity(reportCount: number, daysActive: number, hasVerified: boolean): number {
  // Base score from report count (logarithmic scale)
  const baseScore = Math.min(50, Math.log10(reportCount + 1) * 25)

  // Recency factor
  let recencyFactor = 5
  if (daysActive <= 30) recencyFactor = 30
  else if (daysActive <= 90) recencyFactor = 20
  else if (daysActive <= 365) recencyFactor = 10

  // Verification bonus
  const verificationBonus = hasVerified ? 20 : 0

  return Math.min(100, baseScore + recencyFactor + verificationBonus)
}

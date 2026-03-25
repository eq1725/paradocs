/**
 * GET /api/discover/clusters — Clustering cards for the feed.
 *
 * Returns data-driven metadata synthesis cards:
 *   - Geographic clusters (3+ reports in same state within 7 days)
 *   - Temporal bursts (category with 50%+ above monthly average)
 *   - Category trends (rising engagement)
 *   - Milestones (first-in-X-time events)
 *
 * Cached 1 hour (clusters don't change fast).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

interface ClusterCard {
  id: string
  type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  headline: string
  subheadline: string
  category: string
  report_count: number
  time_range: string
  location_summary?: string
  linked_report_ids: string[]
  generated_at: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var supabase = getSupabase()
    var clusters: ClusterCard[] = []

    // --- Geographic clusters: 3+ reports in same state within 7 days ---
    var { data: geoClusters } = await supabase.rpc('get_geographic_clusters').select('*')

    // If RPC doesn't exist, use a raw approach
    if (!geoClusters) {
      var { data: geoRaw } = await supabase
        .from('reports')
        .select('id, category, state_province, country')
        .eq('status', 'approved')
        .not('state_province', 'is', null)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      if (geoRaw && geoRaw.length > 0) {
        // Group by state + category
        var geoGroups: Record<string, any[]> = {}
        geoRaw.forEach(function (r) {
          var key = (r.state_province || '') + '|' + (r.category || '')
          if (!geoGroups[key]) geoGroups[key] = []
          geoGroups[key].push(r)
        })

        Object.keys(geoGroups).forEach(function (key) {
          var group = geoGroups[key]
          if (group.length >= 3) {
            var parts = key.split('|')
            var state = parts[0]
            var cat = parts[1]
            var catLabel = cat.replace(/_/g, ' ')

            clusters.push({
              id: 'geo-' + key.replace(/[^a-z0-9]/gi, '-'),
              type: 'geographic_cluster',
              headline: group.length + ' ' + catLabel + ' reports from ' + state,
              subheadline: 'A concentration of activity detected in ' + state + ' over the past week.',
              category: cat,
              report_count: group.length,
              time_range: 'Past 7 days',
              location_summary: state + (group[0].country ? ', ' + group[0].country : ''),
              linked_report_ids: group.map(function (r) { return r.id }),
              generated_at: new Date().toISOString(),
            })
          }
        })
      }
    }

    // --- Temporal bursts: unusual volume in a category ---
    var { data: recentCounts } = await supabase
      .from('reports')
      .select('category')
      .eq('status', 'approved')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    var { data: monthlyCounts } = await supabase
      .from('reports')
      .select('category')
      .eq('status', 'approved')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (recentCounts && monthlyCounts) {
      var weeklyByCat: Record<string, number> = {}
      var monthlyByCat: Record<string, number> = {}

      recentCounts.forEach(function (r) {
        weeklyByCat[r.category] = (weeklyByCat[r.category] || 0) + 1
      })

      monthlyCounts.forEach(function (r) {
        monthlyByCat[r.category] = (monthlyByCat[r.category] || 0) + 1
      })

      Object.keys(weeklyByCat).forEach(function (cat) {
        var weeklyAvg = (monthlyByCat[cat] || 0) / 4
        var thisWeek = weeklyByCat[cat]
        if (thisWeek > weeklyAvg * 1.5 && thisWeek >= 5) {
          var catLabel = cat.replace(/_/g, ' ')
          var pctIncrease = weeklyAvg > 0 ? Math.round(((thisWeek - weeklyAvg) / weeklyAvg) * 100) : 100

          clusters.push({
            id: 'burst-' + cat,
            type: 'temporal_burst',
            headline: catLabel.charAt(0).toUpperCase() + catLabel.slice(1) + ' activity surging',
            subheadline: thisWeek + ' reports this week \u2014 ' + pctIncrease + '% above the monthly average.',
            category: cat,
            report_count: thisWeek,
            time_range: 'Past 7 days',
            linked_report_ids: [],
            generated_at: new Date().toISOString(),
          })
        }
      })
    }

    // Sort: geographic clusters first (more specific), then bursts
    clusters.sort(function (a, b) {
      if (a.type === 'geographic_cluster' && b.type !== 'geographic_cluster') return -1
      if (a.type !== 'geographic_cluster' && b.type === 'geographic_cluster') return 1
      return b.report_count - a.report_count
    })

    // Limit to top 5
    clusters = clusters.slice(0, 5)

    // Cache 1 hour
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')

    return res.status(200).json({ clusters: clusters })
  } catch (error) {
    console.error('[Clusters] Error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}

/**
 * Enhanced Analytics API
 *
 * Provides comprehensive analytics data using PostgreSQL aggregation
 * for efficient performance at scale (10M+ records).
 *
 * Uses RPC functions for aggregation instead of loading records into memory.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Use service role client for full data access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Parallel data fetching for performance using optimized RPC functions
    const [
      basicStats,
      categoryBreakdown,
      countryBreakdown,
      monthlyTrend,
      credibilityBreakdown,
      timeOfDayData,
      dayOfWeekData,
      evidenceAnalysis,
      sourceAnalysis,
      recentActivity,
      emergingPatterns,
      witnessStats,
    ] = await Promise.all([
      getBasicStats(supabaseAdmin),
      getCategoryBreakdown(supabaseAdmin),
      getCountryBreakdown(supabaseAdmin),
      getMonthlyTrend(supabaseAdmin),
      getCredibilityBreakdown(supabaseAdmin),
      getTimeOfDayData(supabaseAdmin),
      getDayOfWeekData(supabaseAdmin),
      getEvidenceAnalysis(supabaseAdmin),
      getSourceAnalysis(supabaseAdmin),
      getRecentActivity(supabaseAdmin),
      getEmergingPatterns(supabaseAdmin),
      getWitnessStats(supabaseAdmin),
    ])

    // Cache for 5 minutes to reduce load
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')

    return res.status(200).json({
      basicStats,
      categoryBreakdown,
      countryBreakdown,
      monthlyTrend,
      credibilityBreakdown,
      timeOfDayData,
      dayOfWeekData,
      evidenceAnalysis,
      sourceAnalysis,
      recentActivity,
      emergingPatterns,
      witnessStats,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Enhanced analytics error:', error)
    return res.status(500).json({ error: 'Failed to fetch analytics' })
  }
}

// Use RPC function or fallback to optimized query
async function getBasicStats(supabase: any) {
  try {
    // Try optimized RPC first
    const { data: statsData, error } = await supabase.rpc('get_basic_stats').single()

    if (!error && statsData) {
      const thisMonthCount = statsData.this_month_reports || 0
      const lastMonthCount = statsData.last_month_reports || 0
      const monthChange = lastMonthCount > 0
        ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
        : 0

      return {
        totalReports: statsData.total_reports || 0,
        totalViews: statsData.total_views || 0,
        countriesCount: statsData.countries_count || 0,
        thisMonthReports: thisMonthCount,
        monthOverMonthChange: monthChange,
        last24hReports: statsData.last_24h_reports || 0,
        last7dReports: statsData.last_7d_reports || 0,
      }
    }
  } catch {
    // RPC not available, use fallback
  }

  // Fallback: efficient queries with head:true for counts only
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [totalResult, thisMonthResult, lastMonthResult, last24hResult, last7dResult] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', thisMonth.toISOString()),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', lastMonth.toISOString()).lt('created_at', thisMonth.toISOString()),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', last24h.toISOString()),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', last7d.toISOString()),
  ])

  const thisMonthCount = thisMonthResult.count || 0
  const lastMonthCount = lastMonthResult.count || 0
  const monthChange = lastMonthCount > 0
    ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
    : 0

  return {
    totalReports: totalResult.count || 0,
    totalViews: 0, // Skip view aggregation in fallback for performance
    countriesCount: 0,
    thisMonthReports: thisMonthCount,
    monthOverMonthChange: monthChange,
    last24hReports: last24hResult.count || 0,
    last7dReports: last7dResult.count || 0,
  }
}

async function getCategoryBreakdown(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_category_breakdown')
    if (!error && data) {
      return data.map((r: any) => ({ category: r.category, count: Number(r.count) }))
    }
  } catch {
    // RPC not available
  }

  // Fallback: sample-based estimation for large datasets
  const { data } = await supabase
    .from('reports')
    .select('category')
    .eq('status', 'approved')
    .limit(10000)

  const counts: Record<string, number> = {}
  data?.forEach((r: any) => {
    counts[r.category] = (counts[r.category] || 0) + 1
  })

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

async function getCountryBreakdown(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_country_breakdown', { limit_count: 15 })
    if (!error && data) {
      return data.map((r: any) => ({ country: r.country, count: Number(r.count) }))
    }
  } catch {
    // RPC not available
  }

  // Fallback
  const { data } = await supabase
    .from('reports')
    .select('country')
    .eq('status', 'approved')
    .not('country', 'is', null)
    .limit(10000)

  const counts: Record<string, number> = {}
  data?.forEach((r: any) => {
    if (r.country) {
      counts[r.country] = (counts[r.country] || 0) + 1
    }
  })

  return Object.entries(counts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
}

async function getMonthlyTrend(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_monthly_trend', { months_back: 12 })
    if (!error && data) {
      // Format the data for the frontend
      return data.map((r: any) => ({
        month: new Date(r.month_key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        monthKey: r.month_key,
        count: Number(r.count),
        byCategory: {}, // RPC doesn't return by-category breakdown for simplicity
      }))
    }
  } catch {
    // RPC not available
  }

  // Fallback with limited data
  const { data } = await supabase
    .from('reports')
    .select('created_at, category')
    .eq('status', 'approved')
    .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(10000)

  const now = new Date()
  const months: Record<string, { total: number; byCategory: Record<string, number> }> = {}

  // Initialize last 12 months
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    months[key] = { total: 0, byCategory: {} }
  }

  data?.forEach((r: any) => {
    const key = r.created_at.slice(0, 7)
    if (key in months) {
      months[key].total++
      months[key].byCategory[r.category] = (months[key].byCategory[r.category] || 0) + 1
    }
  })

  return Object.entries(months).map(([month, data]) => ({
    month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    monthKey: month,
    count: data.total,
    byCategory: data.byCategory,
  }))
}

async function getCredibilityBreakdown(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_credibility_breakdown')
    if (!error && data) {
      return data.map((r: any) => ({ name: r.credibility, value: Number(r.count) }))
        .filter((d: any) => d.value > 0)
    }
  } catch {
    // RPC not available
  }

  // Fallback
  const { data } = await supabase
    .from('reports')
    .select('credibility')
    .eq('status', 'approved')
    .limit(10000)

  const counts: Record<string, number> = {}
  data?.forEach((r: any) => {
    counts[r.credibility] = (counts[r.credibility] || 0) + 1
  })

  const order = ['confirmed', 'high', 'medium', 'low', 'unverified']
  return order.map(level => ({
    name: level,
    value: counts[level] || 0,
  })).filter(d => d.value > 0)
}

async function getTimeOfDayData(supabase: any) {
  // Initialize 24-hour buckets
  const hourLabels = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${h.toString().padStart(2, '0')}:00`,
    count: 0,
    byCategory: {},
  }))

  try {
    const { data, error } = await supabase.rpc('get_time_of_day_breakdown')
    if (!error && data) {
      data.forEach((r: any) => {
        if (r.hour >= 0 && r.hour < 24) {
          hourLabels[r.hour].count = Number(r.count)
        }
      })
      return hourLabels
    }
  } catch {
    // RPC not available
  }

  // Fallback - limited query
  const { data } = await supabase
    .from('reports')
    .select('event_time, category')
    .eq('status', 'approved')
    .not('event_time', 'is', null)
    .limit(5000)

  data?.forEach((r: any) => {
    if (r.event_time) {
      const hour = parseInt(r.event_time.split(':')[0], 10)
      if (hour >= 0 && hour < 24) {
        hourLabels[hour].count++
      }
    }
  })

  return hourLabels
}

async function getDayOfWeekData(supabase: any) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayData = days.map((name, i) => ({
    day: i,
    name,
    shortName: name.slice(0, 3),
    count: 0,
    byCategory: {},
  }))

  try {
    const { data, error } = await supabase.rpc('get_day_of_week_breakdown')
    if (!error && data) {
      data.forEach((r: any) => {
        if (r.day_of_week >= 0 && r.day_of_week < 7) {
          dayData[r.day_of_week].count = Number(r.count)
        }
      })
      return dayData
    }
  } catch {
    // RPC not available
  }

  // Fallback
  const { data } = await supabase
    .from('reports')
    .select('event_date, category')
    .eq('status', 'approved')
    .not('event_date', 'is', null)
    .limit(10000)

  data?.forEach((r: any) => {
    if (r.event_date) {
      const date = new Date(r.event_date)
      const day = date.getDay()
      dayData[day].count++
    }
  })

  return dayData
}

async function getEvidenceAnalysis(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_evidence_analysis').single()
    if (!error && data) {
      const total = Number(data.total) || 1
      return {
        total: Number(data.total),
        withPhotoVideo: {
          count: Number(data.with_photo_video),
          percentage: Math.round((Number(data.with_photo_video) / total) * 100)
        },
        withPhysicalEvidence: {
          count: Number(data.with_physical_evidence),
          percentage: Math.round((Number(data.with_physical_evidence) / total) * 100)
        },
        withOfficialReport: {
          count: Number(data.with_official_report),
          percentage: Math.round((Number(data.with_official_report) / total) * 100)
        },
        withAnyEvidence: {
          count: Number(data.with_any_evidence),
          percentage: Math.round((Number(data.with_any_evidence) / total) * 100)
        },
      }
    }
  } catch {
    // RPC not available
  }

  // Fallback
  const { data } = await supabase
    .from('reports')
    .select('has_photo_video, has_physical_evidence, has_official_report')
    .eq('status', 'approved')
    .limit(10000)

  const total = data?.length || 1
  let withPhoto = 0
  let withPhysical = 0
  let withOfficial = 0
  let withAny = 0

  data?.forEach((r: any) => {
    if (r.has_photo_video) withPhoto++
    if (r.has_physical_evidence) withPhysical++
    if (r.has_official_report) withOfficial++
    if (r.has_photo_video || r.has_physical_evidence || r.has_official_report) withAny++
  })

  return {
    total,
    withPhotoVideo: { count: withPhoto, percentage: Math.round((withPhoto / total) * 100) },
    withPhysicalEvidence: { count: withPhysical, percentage: Math.round((withPhysical / total) * 100) },
    withOfficialReport: { count: withOfficial, percentage: Math.round((withOfficial / total) * 100) },
    withAnyEvidence: { count: withAny, percentage: Math.round((withAny / total) * 100) },
  }
}

async function getSourceAnalysis(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_source_breakdown')
    if (!error && data) {
      return data.map((r: any) => ({ source: r.source_type, count: Number(r.count) }))
    }
  } catch {
    // RPC not available
  }

  // Fallback
  const { data } = await supabase
    .from('reports')
    .select('source_type')
    .eq('status', 'approved')
    .limit(10000)

  const counts: Record<string, number> = {}
  data?.forEach((r: any) => {
    const source = r.source_type || 'user_submission'
    counts[source] = (counts[source] || 0) + 1
  })

  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}

async function getRecentActivity(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('id, title, slug, category, location_name, country, created_at, view_count')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(10)

  return data || []
}

async function getEmergingPatterns(supabase: any) {
  const { data, error } = await supabase
    .from('detected_patterns')
    .select('id, pattern_type, ai_title, ai_summary, report_count, confidence_score, significance_score, categories, first_detected_at, last_updated_at, status')
    .in('status', ['active', 'emerging'])
    .order('significance_score', { ascending: false })
    .limit(5)

  if (error) {
    return []
  }

  return data || []
}

async function getWitnessStats(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('get_witness_stats').single()
    if (!error && data) {
      const total = Number(data.total_reports) || 1
      return {
        totalReports: Number(data.total_reports),
        totalWitnesses: Number(data.total_witnesses),
        averageWitnessCount: (Number(data.total_witnesses) / total).toFixed(1),
        reportsWithMultipleWitnesses: Number(data.reports_with_multiple_witnesses),
        submitterWasWitness: Number(data.submitter_was_witness_count),
        anonymousSubmissions: Number(data.anonymous_submissions),
        anonymousPercentage: Math.round((Number(data.anonymous_submissions) / total) * 100),
      }
    }
  } catch {
    // RPC not available
  }

  // Fallback
  const { data } = await supabase
    .from('reports')
    .select('witness_count, submitter_was_witness, anonymous_submission')
    .eq('status', 'approved')
    .limit(10000)

  const total = data?.length || 1
  let totalWitnesses = 0
  let multipleWitnesses = 0
  let submitterWitness = 0
  let anonymous = 0

  data?.forEach((r: any) => {
    if (r.witness_count) {
      totalWitnesses += r.witness_count
      if (r.witness_count > 1) multipleWitnesses++
    }
    if (r.submitter_was_witness) submitterWitness++
    if (r.anonymous_submission) anonymous++
  })

  return {
    totalReports: total,
    totalWitnesses,
    averageWitnessCount: (totalWitnesses / total).toFixed(1),
    reportsWithMultipleWitnesses: multipleWitnesses,
    submitterWasWitness: submitterWitness,
    anonymousSubmissions: anonymous,
    anonymousPercentage: Math.round((anonymous / total) * 100),
  }
}

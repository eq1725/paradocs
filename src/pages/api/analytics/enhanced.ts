/**
 * Enhanced Analytics API
 *
 * Provides comprehensive analytics data including:
 * - Basic stats (reports, views, countries)
 * - Temporal patterns (time of day, day of week, seasonal)
 * - Evidence and source analysis
 * - Emerging patterns and alerts
 * - Correlation data
 * - Recent activity feed
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {

    // Parallel data fetching for performance
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
      // Basic stats
      getBasicStats(supabase),
      // Category breakdown
      getCategoryBreakdown(supabase),
      // Country breakdown
      getCountryBreakdown(supabase),
      // Monthly trend (12 months)
      getMonthlyTrend(supabase),
      // Credibility breakdown
      getCredibilityBreakdown(supabase),
      // Time of day heatmap data
      getTimeOfDayData(supabase),
      // Day of week distribution
      getDayOfWeekData(supabase),
      // Evidence analysis
      getEvidenceAnalysis(supabase),
      // Source analysis
      getSourceAnalysis(supabase),
      // Recent activity feed
      getRecentActivity(supabase),
      // Emerging patterns
      getEmergingPatterns(supabase),
      // Witness statistics
      getWitnessStats(supabase),
    ])

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

async function getBasicStats(supabase: any) {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [totalResult, viewsResult, countriesResult, thisMonthResult, lastMonthResult, last24hResult, last7dResult] = await Promise.all([
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('reports').select('view_count').eq('status', 'approved'),
    supabase.from('reports').select('country').eq('status', 'approved').not('country', 'is', null),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', thisMonth.toISOString()),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', lastMonth.toISOString()).lt('created_at', thisMonth.toISOString()),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', last24h.toISOString()),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', last7d.toISOString()),
  ])

  const totalViews = viewsResult.data?.reduce((sum: number, r: any) => sum + (r.view_count || 0), 0) || 0
  const uniqueCountries = new Set(countriesResult.data?.map((r: any) => r.country)).size

  // Calculate month-over-month change
  const thisMonthCount = thisMonthResult.count || 0
  const lastMonthCount = lastMonthResult.count || 0
  const monthChange = lastMonthCount > 0
    ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
    : 0

  return {
    totalReports: totalResult.count || 0,
    totalViews,
    countriesCount: uniqueCountries,
    thisMonthReports: thisMonthCount,
    monthOverMonthChange: monthChange,
    last24hReports: last24hResult.count || 0,
    last7dReports: last7dResult.count || 0,
  }
}

async function getCategoryBreakdown(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('category')
    .eq('status', 'approved')

  const counts: Record<string, number> = {}
  data?.forEach((r: any) => {
    counts[r.category] = (counts[r.category] || 0) + 1
  })

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

async function getCountryBreakdown(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('country')
    .eq('status', 'approved')
    .not('country', 'is', null)

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
  const { data } = await supabase
    .from('reports')
    .select('created_at, category')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

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
  const { data } = await supabase
    .from('reports')
    .select('credibility')
    .eq('status', 'approved')

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
  const { data } = await supabase
    .from('reports')
    .select('event_time, category')
    .eq('status', 'approved')
    .not('event_time', 'is', null)

  // Initialize 24-hour buckets
  const hourData: Record<number, { total: number; byCategory: Record<string, number> }> = {}
  for (let h = 0; h < 24; h++) {
    hourData[h] = { total: 0, byCategory: {} }
  }

  data?.forEach((r: any) => {
    if (r.event_time) {
      const hour = parseInt(r.event_time.split(':')[0], 10)
      if (hour >= 0 && hour < 24) {
        hourData[hour].total++
        hourData[hour].byCategory[r.category] = (hourData[hour].byCategory[r.category] || 0) + 1
      }
    }
  })

  return Object.entries(hourData).map(([hour, data]) => ({
    hour: parseInt(hour),
    label: `${hour.toString().padStart(2, '0')}:00`,
    count: data.total,
    byCategory: data.byCategory,
  }))
}

async function getDayOfWeekData(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('event_date, category')
    .eq('status', 'approved')
    .not('event_date', 'is', null)

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayData: Record<number, { total: number; byCategory: Record<string, number> }> = {}
  for (let d = 0; d < 7; d++) {
    dayData[d] = { total: 0, byCategory: {} }
  }

  data?.forEach((r: any) => {
    if (r.event_date) {
      const date = new Date(r.event_date)
      const day = date.getDay()
      dayData[day].total++
      dayData[day].byCategory[r.category] = (dayData[day].byCategory[r.category] || 0) + 1
    }
  })

  return Object.entries(dayData).map(([day, data]) => ({
    day: parseInt(day),
    name: days[parseInt(day)],
    shortName: days[parseInt(day)].slice(0, 3),
    count: data.total,
    byCategory: data.byCategory,
  }))
}

async function getEvidenceAnalysis(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('has_photo_video, has_physical_evidence, has_official_report, category')
    .eq('status', 'approved')

  const total = data?.length || 0
  let withPhoto = 0
  let withPhysical = 0
  let withOfficial = 0
  let withAnyEvidence = 0

  data?.forEach((r: any) => {
    if (r.has_photo_video) withPhoto++
    if (r.has_physical_evidence) withPhysical++
    if (r.has_official_report) withOfficial++
    if (r.has_photo_video || r.has_physical_evidence || r.has_official_report) withAnyEvidence++
  })

  return {
    total,
    withPhotoVideo: { count: withPhoto, percentage: total > 0 ? Math.round((withPhoto / total) * 100) : 0 },
    withPhysicalEvidence: { count: withPhysical, percentage: total > 0 ? Math.round((withPhysical / total) * 100) : 0 },
    withOfficialReport: { count: withOfficial, percentage: total > 0 ? Math.round((withOfficial / total) * 100) : 0 },
    withAnyEvidence: { count: withAnyEvidence, percentage: total > 0 ? Math.round((withAnyEvidence / total) * 100) : 0 },
  }
}

async function getSourceAnalysis(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('source_type')
    .eq('status', 'approved')

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
  // Check if detected_patterns table exists and has data
  const { data, error } = await supabase
    .from('detected_patterns')
    .select('id, pattern_type, ai_title, ai_summary, report_count, confidence_score, significance_score, categories, first_detected_at, last_updated_at, status')
    .in('status', ['active', 'emerging'])
    .order('significance_score', { ascending: false })
    .limit(5)

  if (error) {
    // Table might not exist or be empty
    return []
  }

  return data || []
}

async function getWitnessStats(supabase: any) {
  const { data } = await supabase
    .from('reports')
    .select('witness_count, submitter_was_witness, anonymous_submission')
    .eq('status', 'approved')

  const total = data?.length || 0
  let totalWitnesses = 0
  let reportsWithMultipleWitnesses = 0
  let submitterWasWitness = 0
  let anonymousSubmissions = 0

  data?.forEach((r: any) => {
    if (r.witness_count) {
      totalWitnesses += r.witness_count
      if (r.witness_count > 1) reportsWithMultipleWitnesses++
    }
    if (r.submitter_was_witness) submitterWasWitness++
    if (r.anonymous_submission) anonymousSubmissions++
  })

  return {
    totalReports: total,
    totalWitnesses,
    averageWitnessCount: total > 0 ? (totalWitnesses / total).toFixed(1) : '0',
    reportsWithMultipleWitnesses,
    submitterWasWitness,
    anonymousSubmissions,
    anonymousPercentage: total > 0 ? Math.round((anonymousSubmissions / total) * 100) : 0,
  }
}

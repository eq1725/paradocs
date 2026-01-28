/**
 * Analytics API
 * GET - Fetch analytics data for the dashboard
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface AnalyticsData {
  overview: {
    total_reports: number
    reports_this_month: number
    reports_change: number
    categories_count: number
    countries_count: number
    avg_credibility: number
  }
  reports_by_category: Array<{
    category: string
    count: number
    percentage: number
  }>
  reports_by_country: Array<{
    country: string
    count: number
    percentage: number
  }>
  reports_by_month: Array<{
    month: string
    count: number
  }>
  reports_by_credibility: Array<{
    credibility: string
    count: number
    percentage: number
  }>
  recent_trends: {
    most_active_category: string
    most_active_country: string
    peak_month: string
    reports_with_media: number
    media_percentage: number
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  const supabase = createServerClient()

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Check if user has analytics feature (pro or researcher tier)
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('tier_id, subscription_tiers(features)')
    .eq('user_id', user.id)
    .single()

  const features = (subscription?.subscription_tiers as any)?.features || {}

  // For now, allow all authenticated users to view basic analytics
  // Pro/researcher tiers will get more detailed data in the future

  try {
    // Get total reports count
    const { count: totalReports } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    // Get reports this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count: reportsThisMonth } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('created_at', startOfMonth.toISOString())

    // Get reports last month for comparison
    const startOfLastMonth = new Date(startOfMonth)
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1)

    const { count: reportsLastMonth } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('created_at', startOfLastMonth.toISOString())
      .lt('created_at', startOfMonth.toISOString())

    const reportsChange = reportsLastMonth && reportsLastMonth > 0
      ? Math.round(((reportsThisMonth || 0) - reportsLastMonth) / reportsLastMonth * 100)
      : 0

    // Get reports by category
    const { data: categoryData } = await supabase
      .from('reports')
      .select('category')
      .eq('status', 'approved')

    const categoryCount: Record<string, number> = {}
    categoryData?.forEach(r => {
      categoryCount[r.category] = (categoryCount[r.category] || 0) + 1
    })

    const reportsByCategory = Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / (totalReports || 1)) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get reports by country
    const { data: countryData } = await supabase
      .from('reports')
      .select('country')
      .eq('status', 'approved')
      .not('country', 'is', null)

    const countryCount: Record<string, number> = {}
    countryData?.forEach(r => {
      if (r.country) {
        countryCount[r.country] = (countryCount[r.country] || 0) + 1
      }
    })

    const reportsByCountry = Object.entries(countryCount)
      .map(([country, count]) => ({
        country,
        count,
        percentage: Math.round((count / (totalReports || 1)) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get reports by month (last 12 months)
    const { data: monthlyData } = await supabase
      .from('reports')
      .select('created_at')
      .eq('status', 'approved')
      .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())

    const monthCount: Record<string, number> = {}
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${months[d.getMonth()]} ${d.getFullYear()}`
      monthCount[key] = 0
    }

    monthlyData?.forEach(r => {
      const d = new Date(r.created_at)
      const key = `${months[d.getMonth()]} ${d.getFullYear()}`
      if (key in monthCount) {
        monthCount[key]++
      }
    })

    const reportsByMonth = Object.entries(monthCount).map(([month, count]) => ({
      month,
      count
    }))

    // Get reports by credibility
    const { data: credibilityData } = await supabase
      .from('reports')
      .select('credibility')
      .eq('status', 'approved')

    const credibilityCount: Record<string, number> = {}
    credibilityData?.forEach(r => {
      const cred = r.credibility || 'unverified'
      credibilityCount[cred] = (credibilityCount[cred] || 0) + 1
    })

    const reportsByCredibility = Object.entries(credibilityCount)
      .map(([credibility, count]) => ({
        credibility,
        count,
        percentage: Math.round((count / (totalReports || 1)) * 100)
      }))
      .sort((a, b) => b.count - a.count)

    // Get reports with media
    const { count: reportsWithMedia } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('has_photo_video', true)

    // Find peak month
    const peakMonth = Object.entries(monthCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

    const analytics: AnalyticsData = {
      overview: {
        total_reports: totalReports || 0,
        reports_this_month: reportsThisMonth || 0,
        reports_change: reportsChange,
        categories_count: Object.keys(categoryCount).length,
        countries_count: Object.keys(countryCount).length,
        avg_credibility: 0 // Would calculate from numeric scores if available
      },
      reports_by_category: reportsByCategory,
      reports_by_country: reportsByCountry,
      reports_by_month: reportsByMonth,
      reports_by_credibility: reportsByCredibility,
      recent_trends: {
        most_active_category: reportsByCategory[0]?.category || 'N/A',
        most_active_country: reportsByCountry[0]?.country || 'N/A',
        peak_month: peakMonth,
        reports_with_media: reportsWithMedia || 0,
        media_percentage: Math.round(((reportsWithMedia || 0) / (totalReports || 1)) * 100)
      }
    }

    return res.status(200).json(analytics)

  } catch (error) {
    console.error('Analytics error:', error)
    return res.status(500).json({ error: 'Failed to fetch analytics' })
  }
}

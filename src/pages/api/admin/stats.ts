import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get total reports count
    const { count: totalReports } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })

    // Get reports ingested today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: reportsToday } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())

    // Get reports from last week for trend comparison
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    const { count: reportsLastWeek } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', lastWeek.toISOString())

    // Get data sources stats
    const { data: sources } = await supabaseAdmin
      .from('data_sources')
      .select('id, name, slug, is_active, adapter_type, last_synced_at, total_records, error_count')

    const activeSources = sources?.filter(s => s.is_active && s.adapter_type).length || 0
    const totalSources = sources?.filter(s => s.adapter_type).length || 0

    // Get recent jobs for health check
    const { data: recentJobs } = await supabaseAdmin
      .from('ingestion_jobs')
      .select('status, source_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    // Calculate health status
    const failedRecent = recentJobs?.filter(j => j.status === 'failed').length || 0
    const healthStatus = failedRecent === 0 ? 'healthy' : failedRecent < 3 ? 'warning' : 'critical'

    // Get reports by source type for pie chart
    const { data: reportsBySource } = await supabaseAdmin
      .from('reports')
      .select('source_type')

    const sourceBreakdown: Record<string, number> = {}
    reportsBySource?.forEach(r => {
      const source = r.source_type || 'unknown'
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1
    })

    // Get ingestion history for line chart (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentReports } = await supabaseAdmin
      .from('reports')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    // Group by day
    const dailyCounts: Record<string, number> = {}
    recentReports?.forEach(r => {
      const date = new Date(r.created_at).toISOString().split('T')[0]
      dailyCounts[date] = (dailyCounts[date] || 0) + 1
    })

    // Convert to array format for charts
    const ingestionHistory = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count
    }))

    res.status(200).json({
      totalReports: totalReports || 0,
      reportsToday: reportsToday || 0,
      weeklyTrend: (reportsLastWeek || 0) - (totalReports || 0) + (reportsLastWeek || 0),
      activeSources,
      totalSources,
      healthStatus,
      sourceBreakdown,
      ingestionHistory,
      sources: sources || []
    })
  } catch (error) {
    console.error('Stats API error:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
}

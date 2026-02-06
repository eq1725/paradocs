import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch all data in parallel
    const [
      usersResult,
      reportsResult,
      reportsCountByCategory,
      reportsCountByStatus,
      recentReportsResult,
      commentsResult,
      votesResult,
    ] = await Promise.all([
      // Users with profiles
      supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false }),

      // All reports
      supabase
        .from('reports')
        .select('id, created_at, status, category, user_id'),

      // Reports by category
      supabase
        .from('reports')
        .select('category'),

      // Reports by status
      supabase
        .from('reports')
        .select('status'),

      // Recent reports (last 30 days with more details)
      supabase
        .from('reports')
        .select('id, title, created_at, status, category, user_id')
        .gte('created_at', thisMonth.toISOString())
        .order('created_at', { ascending: false }),

      // Comments count
      supabase
        .from('comments')
        .select('id, created_at'),

      // Votes count
      supabase
        .from('votes')
        .select('id, created_at'),
    ])

    const users = usersResult.data || []
    const reports = reportsResult.data || []
    const recentReports = recentReportsResult.data || []
    const comments = commentsResult.data || []
    const votes = votesResult.data || []

    // Calculate user stats
    const usersToday = users.filter(u => new Date(u.created_at) >= today).length
    const usersThisWeek = users.filter(u => new Date(u.created_at) >= thisWeek).length
    const usersThisMonth = users.filter(u => new Date(u.created_at) >= thisMonth).length

    const usersByRole = users.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate report stats
    const reportsToday = reports.filter(r => new Date(r.created_at) >= today).length
    const reportsThisWeek = reports.filter(r => new Date(r.created_at) >= thisWeek).length
    const reportsThisMonth = reports.filter(r => new Date(r.created_at) >= thisMonth).length

    const reportsByCategory = (reportsCountByCategory.data || []).reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const reportsByStatus = (reportsCountByStatus.data || []).reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate activity stats
    const commentsToday = comments.filter(c => new Date(c.created_at) >= today).length
    const commentsThisWeek = comments.filter(c => new Date(c.created_at) >= thisWeek).length
    const votesToday = votes.filter(v => new Date(v.created_at) >= today).length
    const votesThisWeek = votes.filter(v => new Date(v.created_at) >= thisWeek).length

    // Generate daily activity for the last 30 days
    const dailyActivity: Array<{ date: string; reports: number; users: number; comments: number }> = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000)

      dailyActivity.push({
        date: dateStr,
        reports: recentReports.filter(r => {
          const d = new Date(r.created_at)
          return d >= date && d < nextDate
        }).length,
        users: users.filter(u => {
          const d = new Date(u.created_at)
          return d >= date && d < nextDate
        }).length,
        comments: comments.filter(c => {
          const d = new Date(c.created_at)
          return d >= date && d < nextDate
        }).length,
      })
    }

    // Top contributors (users with most reports)
    const reportsByUser = reports.reduce((acc, r) => {
      if (r.user_id) {
        acc[r.user_id] = (acc[r.user_id] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    const topContributors = Object.entries(reportsByUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => {
        const user = users.find(u => u.id === userId)
        return {
          id: userId,
          username: user?.username || 'Unknown',
          displayName: user?.display_name || user?.username || 'Unknown',
          avatarUrl: user?.avatar_url,
          reportCount: count,
          role: user?.role || 'user',
        }
      })

    res.status(200).json({
      // User stats
      users: {
        total: users.length,
        today: usersToday,
        thisWeek: usersThisWeek,
        thisMonth: usersThisMonth,
        byRole: usersByRole,
        list: users.slice(0, 100).map(u => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          email: u.email,
          avatarUrl: u.avatar_url,
          role: u.role,
          reputationScore: u.reputation_score,
          reportsSubmitted: u.reports_submitted,
          reportsApproved: u.reports_approved,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        })),
      },

      // Content stats
      content: {
        totalReports: reports.length,
        reportsToday,
        reportsThisWeek,
        reportsThisMonth,
        byCategory: reportsByCategory,
        byStatus: reportsByStatus,
        pendingReview: reportsByStatus['pending'] || 0,
        approved: reportsByStatus['approved'] || 0,
        rejected: reportsByStatus['rejected'] || 0,
        flagged: reportsByStatus['flagged'] || 0,
      },

      // Activity stats
      activity: {
        totalComments: comments.length,
        commentsToday,
        commentsThisWeek,
        totalVotes: votes.length,
        votesToday,
        votesThisWeek,
        dailyActivity,
        topContributors,
      },
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard data' })
  }
}

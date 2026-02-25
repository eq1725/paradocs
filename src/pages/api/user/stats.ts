/**
 * GET /api/user/stats
 * Returns user's dashboard statistics
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { getSubscriptionWithUsage } from '@/lib/subscription'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createServerClient()

  // Get authenticated user
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Get user's reports count
    const { count: totalReports } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('submitted_by', user.id)

    // Get pending reports count
    const { count: pendingReports } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('submitted_by', user.id)
      .eq('status', 'pending')

    // Get approved reports count
    const { count: approvedReports } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('submitted_by', user.id)
      .eq('status', 'approved')

    // Get saved reports count
    const { count: savedReports } = await supabase
      .from('saved_reports')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    // Get subscription and usage
    const subscriptionData = await getSubscriptionWithUsage(user.id)

    // Get recent activity (last 5 reports)
    const { data: recentReports } = await supabase
      .from('reports')
      .select('id, title, slug, status, created_at')
      .eq('submitted_by', user.id)
      .order('created_at', { ascending: false })
      .limit(5)

    // ── Constellation & Journal data (graceful fallback if tables don't exist) ──
    let constellationData = { totalEntries: 0, totalConnections: 0, rank: 'Stargazer', rankIcon: '🔭' }
    let journalData = { totalEntries: 0 }
    let researchActivity: Array<{ id: string; type: string; title: string; created_at: string }> = []

    try {
      // Constellation entries count + recent
      const { count: entryCount } = await supabase
        .from('constellation_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const { data: recentEntries } = await supabase
        .from('constellation_entries')
        .select('id, created_at, report:reports(title)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3)

      // Connections count
      const { count: connCount } = await supabase
        .from('constellation_connections')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const total = entryCount || 0
      const ranks = [
        { name: 'Stargazer', min: 0, icon: '🔭' },
        { name: 'Field Researcher', min: 3, icon: '📋' },
        { name: 'Pattern Seeker', min: 10, icon: '🔍' },
        { name: 'Cartographer', min: 25, icon: '🗺️' },
        { name: 'Master Archivist', min: 50, icon: '📜' },
      ]
      const currentRank = [...ranks].reverse().find(r => total >= r.min) || ranks[0]

      constellationData = {
        totalEntries: total,
        totalConnections: connCount || 0,
        rank: currentRank.name,
        rankIcon: currentRank.icon,
      }

      // Add constellation entries to research activity
      if (recentEntries) {
        researchActivity.push(...recentEntries.map((e: any) => ({
          id: e.id,
          type: 'constellation_entry',
          title: e.report?.title || 'Logged entry',
          created_at: e.created_at,
        })))
      }
    } catch {}

    try {
      // Journal entries count + recent
      const { count: journalCount } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const { data: recentJournal } = await supabase
        .from('journal_entries')
        .select('id, title, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2)

      journalData = { totalEntries: journalCount || 0 }

      if (recentJournal) {
        researchActivity.push(...recentJournal.map((j: any) => ({
          id: j.id,
          type: 'journal_entry',
          title: j.title || 'Journal entry',
          created_at: j.created_at,
        })))
      }
    } catch {}

    // Sort research activity by date, limit 5
    researchActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    researchActivity = researchActivity.slice(0, 5)

    const stats = {
      profile: {
        username: profile?.username,
        display_name: profile?.display_name,
        avatar_url: profile?.avatar_url,
        reputation_score: profile?.reputation_score || 0,
        member_since: profile?.created_at
      },
      reports: {
        total: totalReports || 0,
        pending: pendingReports || 0,
        approved: approvedReports || 0,
        rejected: (totalReports || 0) - (pendingReports || 0) - (approvedReports || 0)
      },
      saved: {
        total: savedReports || 0
      },
      constellation: constellationData,
      journal: journalData,
      research_activity: researchActivity,
      subscription: subscriptionData ? {
        tier: subscriptionData.subscription.tier.name,
        tier_display: subscriptionData.subscription.tier.display_name,
        status: subscriptionData.subscription.status,
        usage: subscriptionData.usage,
        limits: subscriptionData.limits,
        canSubmitReport: subscriptionData.canSubmitReport,
        canSaveReport: subscriptionData.canSaveReport
      } : null,
      recent_reports: recentReports || []
    }

    return res.status(200).json(stats)
  } catch (error) {
    console.error('Error fetching user stats:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

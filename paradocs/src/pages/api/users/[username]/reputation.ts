/**
 * User Reputation API
 * GET /api/users/[username]/reputation - Get detailed reputation profile
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface ReputationBreakdown {
  reports_submitted: number
  reports_approved: number
  approval_rate: number
  high_credibility_reports: number
  verified_reports: number
  total_upvotes_received: number
  total_downvotes_received: number
  comments_made: number
  helpful_comments: number
  account_age_days: number
  last_activity: string | null
}

interface ReputationBadge {
  id: string
  name: string
  description: string
  icon: string
  earned_at: string
}

interface ReputationLevel {
  level: number
  title: string
  min_score: number
  max_score: number
  color: string
}

const REPUTATION_LEVELS: ReputationLevel[] = [
  { level: 1, title: 'Novice Observer', min_score: 0, max_score: 99, color: 'gray' },
  { level: 2, title: 'Curious Investigator', min_score: 100, max_score: 249, color: 'green' },
  { level: 3, title: 'Dedicated Researcher', min_score: 250, max_score: 499, color: 'blue' },
  { level: 4, title: 'Expert Analyst', min_score: 500, max_score: 999, color: 'purple' },
  { level: 5, title: 'Master Investigator', min_score: 1000, max_score: 2499, color: 'amber' },
  { level: 6, title: 'Legendary Chronicler', min_score: 2500, max_score: Infinity, color: 'red' },
]

function getReputationLevel(score: number): ReputationLevel {
  return REPUTATION_LEVELS.find(l => score >= l.min_score && score <= l.max_score) || REPUTATION_LEVELS[0]
}

function calculateBadges(breakdown: ReputationBreakdown, role: string): ReputationBadge[] {
  const badges: ReputationBadge[] = []
  const now = new Date().toISOString()

  // Submission badges
  if (breakdown.reports_submitted >= 1) {
    badges.push({ id: 'first_report', name: 'First Sighting', description: 'Submitted your first report', icon: '👁️', earned_at: now })
  }
  if (breakdown.reports_submitted >= 10) {
    badges.push({ id: 'prolific_10', name: 'Regular Contributor', description: 'Submitted 10+ reports', icon: '📝', earned_at: now })
  }
  if (breakdown.reports_submitted >= 50) {
    badges.push({ id: 'prolific_50', name: 'Prolific Researcher', description: 'Submitted 50+ reports', icon: '📚', earned_at: now })
  }
  if (breakdown.reports_submitted >= 100) {
    badges.push({ id: 'prolific_100', name: 'Documentation Master', description: 'Submitted 100+ reports', icon: '🏆', earned_at: now })
  }

  // Quality badges
  if (breakdown.approval_rate >= 0.9 && breakdown.reports_submitted >= 5) {
    badges.push({ id: 'high_quality', name: 'Quality Reporter', description: '90%+ approval rate with 5+ reports', icon: '⭐', earned_at: now })
  }
  if (breakdown.high_credibility_reports >= 5) {
    badges.push({ id: 'credible', name: 'Credible Source', description: '5+ high credibility reports', icon: '🎯', earned_at: now })
  }
  if (breakdown.verified_reports >= 1) {
    badges.push({ id: 'verified', name: 'Verified Reporter', description: 'Has expert-verified report', icon: '✅', earned_at: now })
  }

  // Engagement badges
  if (breakdown.comments_made >= 50) {
    badges.push({ id: 'active_commenter', name: 'Active Discussant', description: '50+ comments', icon: '💬', earned_at: now })
  }
  if (breakdown.helpful_comments >= 20) {
    badges.push({ id: 'helpful', name: 'Helpful Contributor', description: '20+ upvoted comments', icon: '🤝', earned_at: now })
  }

  // Veteran badges
  if (breakdown.account_age_days >= 365) {
    badges.push({ id: 'veteran_1yr', name: 'One Year Veteran', description: 'Member for 1+ year', icon: '🎂', earned_at: now })
  }
  if (breakdown.account_age_days >= 730) {
    badges.push({ id: 'veteran_2yr', name: 'Two Year Veteran', description: 'Member for 2+ years', icon: '🎖️', earned_at: now })
  }

  // Role badges
  if (role === 'moderator' || role === 'admin') {
    badges.push({ id: 'staff', name: 'Staff Member', description: 'Official ParaDocs team', icon: '🛡️', earned_at: now })
  }
  if (role === 'contributor') {
    badges.push({ id: 'contributor', name: 'Verified Contributor', description: 'Recognized contributor status', icon: '✨', earned_at: now })
  }

  return badges
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  const { username } = req.query

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' })
  }

  const supabase = createServerClient()

  try {
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Get report statistics
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, credibility, status, upvotes, downvotes, created_at')
      .eq('submitted_by', profile.id)

    const userReports = reports || []

    // Get comment statistics
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('id, upvotes, downvotes, created_at')
      .eq('user_id', profile.id)
      .eq('is_deleted', false)

    const userComments = comments || []

    // Calculate breakdown
    const approvedReports = userReports.filter(r => r.status === 'approved')
    const highCredibilityReports = userReports.filter(r =>
      r.credibility === 'high' || r.credibility === 'confirmed'
    )
    const verifiedReports = userReports.filter(r => r.credibility === 'confirmed')

    const totalUpvotes = userReports.reduce((sum, r) => sum + (r.upvotes || 0), 0)
    const totalDownvotes = userReports.reduce((sum, r) => sum + (r.downvotes || 0), 0)

    const helpfulComments = userComments.filter(c => (c.upvotes || 0) > (c.downvotes || 0))

    const accountAge = Math.floor(
      (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    const lastActivity = [...userReports, ...userComments]
      .map(item => item.created_at)
      .sort()
      .pop() || null

    const breakdown: ReputationBreakdown = {
      reports_submitted: userReports.length,
      reports_approved: approvedReports.length,
      approval_rate: userReports.length > 0 ? approvedReports.length / userReports.length : 0,
      high_credibility_reports: highCredibilityReports.length,
      verified_reports: verifiedReports.length,
      total_upvotes_received: totalUpvotes,
      total_downvotes_received: totalDownvotes,
      comments_made: userComments.length,
      helpful_comments: helpfulComments.length,
      account_age_days: accountAge,
      last_activity: lastActivity,
    }

    // Calculate reputation level
    const level = getReputationLevel(profile.reputation_score)

    // Calculate badges
    const badges = calculateBadges(breakdown, profile.role)

    // Calculate trust score (0-100)
    let trustScore = 50 // Base score
    trustScore += Math.min(breakdown.approval_rate * 20, 20) // Up to 20 for approval rate
    trustScore += Math.min(breakdown.high_credibility_reports * 2, 10) // Up to 10 for high credibility
    trustScore += Math.min(breakdown.verified_reports * 5, 10) // Up to 10 for verified reports
    trustScore += Math.min(accountAge / 365 * 5, 5) // Up to 5 for account age
    trustScore += breakdown.total_upvotes_received > breakdown.total_downvotes_received ? 5 : 0
    trustScore = Math.min(Math.round(trustScore), 100)

    // Recent activity summary
    const recentReports = userReports
      .filter(r => new Date(r.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .length

    return res.status(200).json({
      user: {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        role: profile.role,
        created_at: profile.created_at,
      },
      reputation: {
        score: profile.reputation_score,
        level: level,
        trust_score: trustScore,
        badges: badges,
        breakdown: breakdown,
        recent_activity: {
          reports_last_30_days: recentReports,
          is_active: lastActivity ?
            new Date(lastActivity) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : false,
        },
      },
      all_levels: REPUTATION_LEVELS.map(l => ({
        ...l,
        max_score: l.max_score === Infinity ? null : l.max_score,
      })),
    })

  } catch (error) {
    console.error('Error fetching reputation:', error)
    return res.status(500).json({ error: 'Failed to fetch reputation data' })
  }
}

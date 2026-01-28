/**
 * Witness Reputation System API
 * GET /api/reputation - Get current user's reputation profile
 * GET /api/reputation/[userId] - Get specific user's public reputation
 * POST /api/reputation/event - Record a reputation event (internal use)
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface ReputationProfile {
  id: string
  reputation_score: number
  credibility_tier: string
  total_reports: number
  verified_reports: number
  disputed_reports: number
  reports_with_evidence: number
  consistency_score: number
  badges: string[]
  member_since: string
}

interface ReputationEvent {
  event_type: string
  points_change: number
  reason: string
  related_report_id?: string
}

// Points awarded for different actions
const REPUTATION_POINTS = {
  report_submitted: 5,
  report_approved: 10,
  report_verified: 25,
  report_disputed: -15,
  report_rejected: -10,
  evidence_added: 5,
  expert_endorsement: 20,
  helpful_comment: 2,
  report_saved_by_others: 1,
  consistency_bonus: 10, // Awarded periodically for consistent reporting
}

// Badge definitions
const BADGES = {
  first_report: { name: 'First Report', description: 'Submitted your first report', icon: 'badge' },
  prolific_reporter: { name: 'Prolific Reporter', description: 'Submitted 10+ reports', icon: 'star' },
  verified_witness: { name: 'Verified Witness', description: 'Had a report verified by experts', icon: 'check-circle' },
  media_contributor: { name: 'Media Contributor', description: 'Submitted reports with photo/video evidence', icon: 'camera' },
  global_explorer: { name: 'Global Explorer', description: 'Reported from 3+ countries', icon: 'globe' },
  trusted_source: { name: 'Trusted Source', description: 'Reached "Trusted" credibility tier', icon: 'shield' },
  expert_recognized: { name: 'Expert Recognized', description: 'Received expert endorsement', icon: 'award' },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()

  if (req.method === 'GET') {
    // Get reputation profile
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Get or create reputation profile
      let { data: profile, error: profileError } = await supabase
        .from('witness_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (profileError || !profile) {
        // Create new profile
        const { data: newProfile, error: createError } = await supabase
          .from('witness_profiles')
          .insert({
            user_id: user.id,
            reputation_score: 50,
            credibility_tier: 'new',
            badges: [],
          })
          .select()
          .single()

        if (createError) throw createError
        profile = newProfile
      }

      // Get recent reputation events
      const { data: recentEvents } = await supabase
        .from('reputation_events')
        .select('*')
        .eq('witness_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10)

      // Calculate additional stats
      const { count: totalReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const { count: approvedReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'approved')

      const { count: reportsWithMedia } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('has_photo_video', true)

      // Check for new badges
      const earnedBadges = [...(profile.badges || [])]
      const newBadges: string[] = []

      if ((totalReports || 0) >= 1 && !earnedBadges.includes('first_report')) {
        earnedBadges.push('first_report')
        newBadges.push('first_report')
      }

      if ((totalReports || 0) >= 10 && !earnedBadges.includes('prolific_reporter')) {
        earnedBadges.push('prolific_reporter')
        newBadges.push('prolific_reporter')
      }

      if ((reportsWithMedia || 0) >= 1 && !earnedBadges.includes('media_contributor')) {
        earnedBadges.push('media_contributor')
        newBadges.push('media_contributor')
      }

      if (profile.credibility_tier === 'trusted' && !earnedBadges.includes('trusted_source')) {
        earnedBadges.push('trusted_source')
        newBadges.push('trusted_source')
      }

      // Update profile with new badges if any
      if (newBadges.length > 0) {
        await supabase
          .from('witness_profiles')
          .update({
            badges: earnedBadges,
            total_reports: totalReports || 0,
            reports_with_evidence: reportsWithMedia || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id)

        // Record badge events
        for (const badge of newBadges) {
          await supabase.from('reputation_events').insert({
            witness_id: profile.id,
            event_type: 'badge_earned',
            points_change: 5,
            reason: `Earned badge: ${BADGES[badge as keyof typeof BADGES]?.name || badge}`,
          })
        }
      }

      const responseProfile: ReputationProfile = {
        id: profile.id,
        reputation_score: profile.reputation_score,
        credibility_tier: profile.credibility_tier,
        total_reports: totalReports || 0,
        verified_reports: profile.verified_reports || 0,
        disputed_reports: profile.disputed_reports || 0,
        reports_with_evidence: reportsWithMedia || 0,
        consistency_score: profile.consistency_score || 50,
        badges: earnedBadges.map(b => ({
          id: b,
          ...BADGES[b as keyof typeof BADGES],
        })),
        member_since: profile.created_at,
      }

      return res.status(200).json({
        profile: responseProfile,
        recent_events: recentEvents || [],
        new_badges: newBadges.map(b => BADGES[b as keyof typeof BADGES]),
        tier_progress: {
          current: profile.credibility_tier,
          score: profile.reputation_score,
          next_tier: getNextTier(profile.credibility_tier),
          points_to_next: getPointsToNextTier(profile.reputation_score, profile.credibility_tier),
        },
      })

    } catch (error) {
      console.error('Get reputation error:', error)
      return res.status(500).json({ error: 'Failed to fetch reputation' })
    }
  }

  if (req.method === 'POST') {
    // Record a reputation event (should be called internally by other APIs)
    try {
      const { user_id, event_type, related_report_id } = req.body as {
        user_id: string
        event_type: keyof typeof REPUTATION_POINTS
        related_report_id?: string
      }

      if (!user_id || !event_type) {
        return res.status(400).json({ error: 'user_id and event_type are required' })
      }

      // Get or create witness profile
      let { data: profile } = await supabase
        .from('witness_profiles')
        .select('id')
        .eq('user_id', user_id)
        .single()

      if (!profile) {
        const { data: newProfile } = await supabase
          .from('witness_profiles')
          .insert({
            user_id,
            reputation_score: 50,
            credibility_tier: 'new',
          })
          .select('id')
          .single()

        profile = newProfile
      }

      if (!profile) {
        return res.status(500).json({ error: 'Failed to get/create witness profile' })
      }

      const points = REPUTATION_POINTS[event_type] || 0

      // Record the event (trigger will update reputation score)
      const { error: eventError } = await supabase.from('reputation_events').insert({
        witness_id: profile.id,
        event_type,
        points_change: points,
        reason: `${event_type.replace(/_/g, ' ')}`,
        related_report_id,
      })

      if (eventError) throw eventError

      return res.status(200).json({
        success: true,
        points_change: points,
        event_type,
      })

    } catch (error) {
      console.error('Record reputation event error:', error)
      return res.status(500).json({ error: 'Failed to record reputation event' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: `Method ${req.method} not allowed` })
}

function getNextTier(currentTier: string): string | null {
  const tiers = ['new', 'emerging', 'established', 'trusted', 'expert']
  const currentIndex = tiers.indexOf(currentTier)
  if (currentIndex === -1 || currentIndex === tiers.length - 1) return null
  return tiers[currentIndex + 1]
}

function getPointsToNextTier(currentScore: number, currentTier: string): number {
  const thresholds: Record<string, number> = {
    new: 40,
    emerging: 60,
    established: 75,
    trusted: 90,
  }

  const threshold = thresholds[currentTier]
  if (!threshold) return 0

  return Math.max(0, threshold - currentScore)
}

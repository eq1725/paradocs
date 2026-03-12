/**
 * POST /api/research-hub/analyze
 *
 * Triggers an on-demand deep scan analysis of the user's research hub.
 * Uses Claude to find non-obvious patterns across all artifacts, case files, and connections.
 * Also runs community pattern detection.
 *
 * Rate limited: max 1 deep scan per user per 24 hours.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { runDeepScan, detectCommunityPatterns } from '@/lib/services/research-hub-insights.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = createServerClient()

  // Authenticate user
  var token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var authResult = await supabase.auth.getUser(token)
  if (authResult.error || !authResult.data.user) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  var user = authResult.data.user

  try {
    // Rate limit: check for recent deep scan insights
    var recentCheck = await supabase
      .from('constellation_ai_insights')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('scope_type', 'constellation')
      .order('created_at', { ascending: false })
      .limit(1)

    if (recentCheck.data && recentCheck.data.length > 0) {
      var lastScan = new Date((recentCheck.data[0] as any).created_at)
      var hoursSince = (Date.now() - lastScan.getTime()) / (1000 * 60 * 60)

      if (hoursSince < 24) {
        var hoursRemaining = Math.ceil(24 - hoursSince)
        return res.status(429).json({
          error: 'Deep scan already run recently. Try again in ' + hoursRemaining + ' hour' + (hoursRemaining > 1 ? 's' : '') + '.',
          next_available_at: new Date(lastScan.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        })
      }
    }

    // Run deep scan + community patterns in parallel
    var deepScanPromise = runDeepScan(user.id)
    var communityPromise = detectCommunityPatterns(user.id)

    var results = await Promise.all([deepScanPromise, communityPromise])
    var deepInsights = results[0]
    var communityInsights = results[1]

    var totalInsights = deepInsights.length + communityInsights.length

    return res.status(200).json({
      success: true,
      insights_generated: totalInsights,
      deep_scan_insights: deepInsights.length,
      community_insights: communityInsights.length,
    })
  } catch (error: any) {
    console.error('Analyze API error:', error)
    return res.status(500).json({ error: 'Analysis failed. Please try again later.' })
  }
}

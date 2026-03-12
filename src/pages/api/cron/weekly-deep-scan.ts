/**
 * GET /api/cron/weekly-deep-scan
 *
 * Vercel Cron Job — runs weekly to perform deep scan analysis
 * for all active Research Hub users.
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 *
 * Schedule: Every Sunday at 6:00 AM UTC
 * vercel.json: { "crons": [{ "path": "/api/cron/weekly-deep-scan", "schedule": "0 6 * * 0" }] }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { runDeepScan, detectCommunityPatterns } from '@/lib/services/research-hub-insights.service'

var MAX_USERS_PER_RUN = 50 // Safety cap to avoid runaway costs
var MIN_ARTIFACTS_FOR_SCAN = 5 // Only scan users with enough data

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify cron secret (Vercel sends this header for cron jobs)
  var authHeader = req.headers.authorization
  var cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var supabase = createServerClient()

  try {
    // Find active users with enough artifacts for meaningful analysis
    // "Active" = has added an artifact in the last 30 days
    var thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    var usersResult = await supabase
      .from('constellation_artifacts')
      .select('user_id')
      .gte('created_at', thirtyDaysAgo.toISOString())

    if (!usersResult.data || usersResult.data.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active users found',
        users_scanned: 0,
      })
    }

    // Deduplicate user IDs and count artifacts per user
    var userArtifactCounts: Record<string, number> = {}
    usersResult.data.forEach(function(row: any) {
      userArtifactCounts[row.user_id] = (userArtifactCounts[row.user_id] || 0) + 1
    })

    // Filter to users with enough artifacts
    var eligibleUserIds = Object.keys(userArtifactCounts).filter(function(userId) {
      return userArtifactCounts[userId] >= MIN_ARTIFACTS_FOR_SCAN
    })

    // Cap the number of users per run
    var usersToScan = eligibleUserIds.slice(0, MAX_USERS_PER_RUN)

    var results = {
      users_scanned: 0,
      total_insights_generated: 0,
      errors: 0,
    }

    // Process users sequentially to avoid overwhelming the API
    for (var i = 0; i < usersToScan.length; i++) {
      var userId = usersToScan[i]
      try {
        var deepInsights = await runDeepScan(userId)
        var communityInsights = await detectCommunityPatterns(userId)

        results.users_scanned++
        results.total_insights_generated += deepInsights.length + communityInsights.length
      } catch (err) {
        console.error('Deep scan error for user ' + userId + ':', err)
        results.errors++
      }
    }

    return res.status(200).json({
      success: true,
      eligible_users: eligibleUserIds.length,
      ...results,
    })
  } catch (error: any) {
    console.error('Weekly deep scan cron error:', error)
    return res.status(500).json({ error: 'Cron job failed' })
  }
}

/**
 * Cron API: POST /api/cron/weekly-digest
 *
 * Generates and sends personalized weekly anomaly reports to opted-in users.
 * Scheduled to run every Monday at 8 AM UTC via Vercel Cron.
 *
 * Can also be triggered manually via admin or external cron service.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getDigestOptedInUsers,
  generateUserDigest,
  storeDigest,
  markDigestEmailed,
  generateDigestEmailHtml,
} from '@/lib/services/digest.service'
import { sendEmail } from '@/lib/services/email.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify authorization
  const authHeader = req.headers.authorization || req.headers['x-cron-secret']
  const cronSecret = process.env.CRON_SECRET
  const isLocalhost = req.headers.host?.includes('localhost')
  const isValidAuth = !cronSecret ||
    authHeader === `Bearer ${cronSecret}` ||
    authHeader === cronSecret

  if (!isLocalhost && !isValidAuth) {
    console.log('[Weekly Digest] Unauthorized request')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('[Weekly Digest] Starting weekly digest generation...')
    const startTime = Date.now()

    // Calculate the week range (previous Monday to Sunday)
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() - now.getDay()) // Last Sunday
    weekEnd.setHours(23, 59, 59, 999)

    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekEnd.getDate() - 6) // Previous Monday
    weekStart.setHours(0, 0, 0, 0)

    console.log(`[Weekly Digest] Week: ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`)

    // Get opted-in users
    const users = await getDigestOptedInUsers()
    console.log(`[Weekly Digest] Found ${users.length} opted-in users`)

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No opted-in users',
        users_processed: 0,
        duration_ms: Date.now() - startTime,
      })
    }

    let emailsSent = 0
    let emailsFailed = 0
    let digestsStored = 0
    const errors: string[] = []

    // Process each user
    for (const user of users) {
      try {
        // Generate personalized digest
        const digestData = await generateUserDigest(
          user.id,
          user.email,
          user.display_name,
          user.interested_categories,
          weekStart,
          weekEnd
        )

        // Skip if no content to show
        if (digestData.sections.length === 0 && digestData.total_new_reports === 0) {
          console.log(`[Weekly Digest] Skipping ${user.id} - no content`)
          continue
        }

        // Store digest in DB (for in-app viewing)
        const digestId = await storeDigest(
          user.id,
          weekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0],
          digestData
        )

        if (digestId) {
          digestsStored++

          // Send email
          const emailHtml = generateDigestEmailHtml(digestData)
          const emailResult = await sendEmail({
            to: user.email,
            subject: `🔮 Your Weekly Anomaly Report — ${digestData.total_new_reports} new reports`,
            html: emailHtml,
            tags: [
              { name: 'type', value: 'weekly-digest' },
              { name: 'week', value: weekStart.toISOString().split('T')[0] },
            ],
          })

          if (emailResult.success) {
            await markDigestEmailed(digestId)
            emailsSent++
          } else {
            emailsFailed++
            errors.push(`User ${user.id}: ${emailResult.error}`)
          }
        }
      } catch (userError) {
        emailsFailed++
        const msg = userError instanceof Error ? userError.message : 'Unknown error'
        errors.push(`User ${user.id}: ${msg}`)
        console.error(`[Weekly Digest] Error processing user ${user.id}:`, userError)
      }
    }

    const duration = Date.now() - startTime
    console.log(`[Weekly Digest] Complete:`, {
      users_processed: users.length,
      digests_stored: digestsStored,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      duration_ms: duration,
    })

    return res.status(200).json({
      success: true,
      users_processed: users.length,
      digests_stored: digestsStored,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration,
    })
  } catch (error) {
    console.error('[Weekly Digest] Fatal error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const config = {
  maxDuration: 300, // 5 minutes max for processing all users
}

/**
 * Admin API: POST /api/admin/cleanup-questions
 *
 * Remove question-only posts that shouldn't have been imported
 * These are discussion posts, not first-hand experiences
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Question patterns that indicate discussion posts, not experiences
const QUESTION_PATTERNS = [
  /^what (are|is|do|does|would|could|should|might|can)\b/i,
  /^(why|how|where|when) (are|is|do|does|would|could|should|can)\b/i,
  /^(does|do|is|are|can|could|would|should) (anyone|anybody|someone|you|we|they)\b/i,
  /what (?:are|is) .{1,50} made of/i,
  /^what (?:exactly )?(?:is|are) (?:a |an |the )?(?:\w+\s?){1,4}\??$/i,
  /^(thoughts on|opinions? on|what do you think)\b/i,
  /^has (anyone|anybody) (ever|here)\b/i,
  /^does (anyone|anybody) (know|have|remember)\b/i,
  /^(explain|define|eli5|tldr)\b/i,
  /\bwhat if\b/i,
  /^if (you|we|they|someone)\b/i,
]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dryRun = req.query.dryRun === 'true'

  try {
    console.log(`[Cleanup] Starting question-post cleanup (dryRun: ${dryRun})...`)

    // Get all reports
    let allReports: { id: string; title: string; slug: string }[] = []
    let offset = 0
    const pageSize = 1000

    while (true) {
      const { data: batch, error } = await supabaseAdmin
        .from('reports')
        .select('id, title, slug')
        .range(offset, offset + pageSize - 1)

      if (error) {
        console.error('Fetch error:', error)
        break
      }

      if (!batch || batch.length === 0) break

      allReports = [...allReports, ...batch]
      offset += pageSize

      if (batch.length < pageSize) break
    }

    console.log(`[Cleanup] Checking ${allReports.length} reports...`)

    // Find reports matching question patterns
    const toDelete: { id: string; title: string; slug: string; matchedPattern: string }[] = []

    for (const report of allReports) {
      for (const pattern of QUESTION_PATTERNS) {
        if (pattern.test(report.title)) {
          toDelete.push({
            id: report.id,
            title: report.title,
            slug: report.slug,
            matchedPattern: pattern.source.substring(0, 40)
          })
          break // Only match once per report
        }
      }
    }

    console.log(`[Cleanup] Found ${toDelete.length} question-only posts to remove`)

    let deleted = 0
    if (!dryRun && toDelete.length > 0) {
      // Delete in batches
      const batchSize = 100
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize)
        const ids = batch.map(r => r.id)

        const { error } = await supabaseAdmin
          .from('reports')
          .delete()
          .in('id', ids)

        if (error) {
          console.error('Delete error:', error)
        } else {
          deleted += batch.length
        }
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      totalChecked: allReports.length,
      matchedForDeletion: toDelete.length,
      deleted: dryRun ? 0 : deleted,
      samples: toDelete.slice(0, 20).map(r => ({
        title: r.title,
        slug: r.slug,
        pattern: r.matchedPattern
      }))
    })
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const config = {
  maxDuration: 300 // 5 minutes
}

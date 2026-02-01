/**
 * Admin API: POST /api/admin/cleanup-discussions
 *
 * Identifies and archives Reddit posts that are discussions/questions
 * rather than actual sighting reports
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Patterns that indicate a discussion post, not a sighting
const DISCUSSION_PATTERNS = [
  // Question patterns
  /^what('s| is| are) (the|your) (consensus|theory|opinion|take|thought)/i,
  /^(what|why|how|where|when) do (you|we|people) think/i,
  /years? later.*\?$/i,
  /^can (someone|anyone) explain/i,
  /^(thoughts|opinions|theories) (on|about)\?/i,
  /^what do you (think|believe|make)/i,
  /^does anyone (know|think|believe|have)/i,
  /^is (this|it|there) (a|the|any)/i,
  /^has anyone (ever|else)/i,
  // Non-sighting content patterns
  /^(i made|i drew|i created|my art|check out)/i,
  /\b(theory|conspiracy|debunk|explain)\b.*\?$/i,
  // Historical discussions (not personal experience)
  /^the (wow signal|black knight|phoenix lights|roswell)/i,
  /^(famous|well-known|historical) (case|sighting|event)/i,
]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dryRun = req.query.dryRun === 'true'
  const limit = parseInt(req.query.limit as string) || 1000

  try {
    console.log(`[Cleanup Discussions] Starting (dryRun: ${dryRun}, limit: ${limit})...`)

    // Get Reddit reports with question mark titles or short question titles
    const { data: reports, error: fetchError } = await supabaseAdmin
      .from('reports')
      .select('id, title, summary, source_type')
      .eq('source_type', 'reddit')
      .eq('status', 'approved')
      .limit(limit)

    if (fetchError) throw fetchError

    const toArchive: string[] = []
    const samples: { id: string; title: string; reason: string }[] = []

    for (const report of reports || []) {
      const title = report.title?.toLowerCase() || ''

      // Check if title matches discussion patterns
      for (const pattern of DISCUSSION_PATTERNS) {
        if (pattern.test(title)) {
          toArchive.push(report.id)
          if (samples.length < 20) {
            samples.push({
              id: report.id,
              title: report.title?.substring(0, 60) || '',
              reason: `matches pattern: ${pattern.source.substring(0, 30)}`
            })
          }
          break
        }
      }

      // Also check: short question titles (< 10 words ending in ?)
      if (!toArchive.includes(report.id) && title.endsWith('?')) {
        const wordCount = title.split(/\s+/).length
        if (wordCount < 12) {
          // Check if it seems like a question asking for info, not reporting
          const askingWords = ['what', 'why', 'how', 'does', 'do', 'is', 'are', 'has', 'have', 'can', 'anyone', 'thoughts']
          if (askingWords.some(w => title.startsWith(w + ' ') || title.includes(' ' + w + ' '))) {
            toArchive.push(report.id)
            if (samples.length < 20) {
              samples.push({
                id: report.id,
                title: report.title?.substring(0, 60) || '',
                reason: 'short question title'
              })
            }
          }
        }
      }
    }

    console.log(`[Cleanup Discussions] Found ${toArchive.length} discussion posts to archive`)

    if (!dryRun && toArchive.length > 0) {
      // Archive in batches
      const batchSize = 100
      for (let i = 0; i < toArchive.length; i += batchSize) {
        const batch = toArchive.slice(i, i + batchSize)
        const { error: archiveError } = await supabaseAdmin
          .from('reports')
          .update({ status: 'archived' })
          .in('id', batch)

        if (archiveError) {
          console.error(`[Cleanup Discussions] Batch archive failed:`, archiveError)
        }
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      totalChecked: reports?.length || 0,
      toArchive: toArchive.length,
      archived: dryRun ? 0 : toArchive.length,
      samples
    })

  } catch (error) {
    console.error('[Cleanup Discussions] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

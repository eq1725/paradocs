/**
 * Admin API: POST /api/admin/cleanup-questions
 *
 * Remove question-only posts that shouldn't have been imported
 * These are discussion posts, not first-hand experiences
 *
 * Optimized: Uses only prefix patterns (fast with indexes) and processes in batches
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// FAST prefix patterns only (iLIKE 'pattern%' uses index)
// These match question-only posts that start with question words
const PREFIX_PATTERNS = [
  // "What is/are/do/does..." questions
  'what is %',
  'what are %',
  'what do %',
  'what does %',
  'what would %',
  'what could %',
  'what should %',
  'what can %',
  'what if %',
  // "Why/How/Where/When..." questions
  'why is %',
  'why are %',
  'why do %',
  'why does %',
  'how is %',
  'how are %',
  'how do %',
  'how does %',
  'how can %',
  'how would %',
  'where is %',
  'where are %',
  'where do %',
  'when is %',
  'when are %',
  'when do %',
  // "Does/Do/Is/Are anyone..." questions
  'does anyone %',
  'does anybody %',
  'does someone %',
  'do you %',
  'do any %',
  'is anyone %',
  'is there %',
  'is it %',
  'are there %',
  'are you %',
  'can anyone %',
  'can someone %',
  'can you %',
  'could anyone %',
  'could someone %',
  'would anyone %',
  'would you %',
  'should i %',
  'should we %',
  'has anyone %',
  'has anybody %',
  'have you %',
  'have any %',
  'will anyone %',
  // Discussion starters
  'thoughts on %',
  'opinion on %',
  'opinions on %',
  'what do you think%',
  // Requests
  'explain %',
  'define %',
  'eli5 %',
  'eli5:%',
  'tldr %',
  'tldr:%',
  // Hypotheticals
  'if you %',
  'if we %',
  'if they %',
  'if someone %',
  'if i %',
  // Comparisons/rankings
  'which one %',
  'which is %',
  'which are %',
  'who is %',
  'who are %',
  'who was %',
  'who would %',
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
    console.log(`[Cleanup] Processing ${PREFIX_PATTERNS.length} patterns...`)

    // Track unique IDs to delete (avoid duplicates across patterns)
    const idsToDelete = new Set<string>()
    const samples: { id: string; title: string; slug: string; pattern: string }[] = []
    let patternsProcessed = 0
    let patternsWithMatches = 0

    // Process each pattern with timeout protection
    for (const pattern of PREFIX_PATTERNS) {
      try {
        const { data: matches, error } = await supabaseAdmin
          .from('reports')
          .select('id, title, slug')
          .ilike('title', pattern)
          .limit(2000) // Cap per pattern

        patternsProcessed++

        if (error) {
          console.error(`[Cleanup] Error with pattern "${pattern}":`, error.message)
          continue
        }

        if (matches && matches.length > 0) {
          patternsWithMatches++
          console.log(`[Cleanup] "${pattern}" → ${matches.length} matches`)

          for (const match of matches) {
            if (!idsToDelete.has(match.id)) {
              idsToDelete.add(match.id)
              if (samples.length < 30) {
                samples.push({ ...match, pattern })
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Cleanup] Exception with pattern "${pattern}":`, err)
        continue
      }

      // Progress log every 10 patterns
      if (patternsProcessed % 10 === 0) {
        console.log(`[Cleanup] Progress: ${patternsProcessed}/${PREFIX_PATTERNS.length} patterns, ${idsToDelete.size} matches`)
      }
    }

    console.log(`[Cleanup] Total unique matches: ${idsToDelete.size} from ${patternsWithMatches} patterns`)

    let deleted = 0
    if (!dryRun && idsToDelete.size > 0) {
      // Delete in batches of 500
      const idsArray = Array.from(idsToDelete)
      const batchSize = 500

      for (let i = 0; i < idsArray.length; i += batchSize) {
        const batch = idsArray.slice(i, i + batchSize)

        const { error } = await supabaseAdmin
          .from('reports')
          .delete()
          .in('id', batch)

        if (error) {
          console.error(`[Cleanup] Delete error at batch ${i}:`, error.message)
        } else {
          deleted += batch.length
          console.log(`[Cleanup] Deleted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} reports`)
        }
      }
    }

    console.log(`[Cleanup] Complete. Matched: ${idsToDelete.size}, Deleted: ${deleted}`)

    return res.status(200).json({
      success: true,
      dryRun,
      patternsProcessed,
      patternsWithMatches,
      matchedForDeletion: idsToDelete.size,
      deleted: dryRun ? 0 : deleted,
      samples: samples.map(r => ({
        title: r.title,
        slug: r.slug,
        pattern: r.pattern
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

/**
 * Admin API: POST /api/admin/cleanup-questions
 *
 * Remove question-only posts that shouldn't have been imported
 * These are discussion posts, not first-hand experiences
 *
 * Optimized: Queries one pattern at a time instead of loading all 273K reports
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// iLIKE patterns (SQL wildcards: % = any chars)
// These match question-only posts that are discussions, not experiences
const QUESTION_ILIKE_PATTERNS = [
  // "What is/are/do/does..." questions
  'what is %',
  'what are %',
  'what do %',
  'what does %',
  'what would %',
  'what could %',
  'what should %',
  'what can %',
  // "Why/How/Where/When are/is..." questions
  'why is %',
  'why are %',
  'why do %',
  'why does %',
  'how is %',
  'how are %',
  'how do %',
  'how does %',
  'where is %',
  'where are %',
  'when is %',
  'when are %',
  // "Does/Do anyone..." questions
  'does anyone %',
  'does anybody %',
  'do anyone %',
  'do you %',
  'is anyone %',
  'is there %',
  'are there %',
  'can anyone %',
  'can someone %',
  'could anyone %',
  'would anyone %',
  'has anyone %',
  'has anybody %',
  'have you %',
  'will anyone %',
  // "What is X made of" questions
  '% made of%',
  // "Thoughts on / Opinions on" discussions
  'thoughts on %',
  'opinion on %',
  'opinions on %',
  'what do you think%',
  // ELI5 / Explain / Define requests
  'explain %',
  'define %',
  'eli5 %',
  'eli5:%',
  'tldr %',
  // "What if" hypotheticals
  '% what if %',
  'what if %',
  // "If you/we/they..." hypotheticals
  'if you %',
  'if we %',
  'if they %',
  'if someone %',
  // Question marks at end with question starters
  'which one %',
  'which is %',
  'which are %',
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

    // Track unique IDs to delete (avoid duplicates across patterns)
    const idsToDelete = new Set<string>()
    const samples: { id: string; title: string; slug: string; pattern: string }[] = []

    // Process each pattern - much faster than loading all reports
    for (const pattern of QUESTION_ILIKE_PATTERNS) {
      const { data: matches, error } = await supabaseAdmin
        .from('reports')
        .select('id, title, slug')
        .ilike('title', pattern)
        .limit(5000) // Cap per pattern to avoid timeouts

      if (error) {
        console.error(`[Cleanup] Error with pattern "${pattern}":`, error.message)
        continue
      }

      if (matches && matches.length > 0) {
        console.log(`[Cleanup] Pattern "${pattern}" matched ${matches.length} reports`)
        for (const match of matches) {
          if (!idsToDelete.has(match.id)) {
            idsToDelete.add(match.id)
            if (samples.length < 30) {
              samples.push({ ...match, pattern })
            }
          }
        }
      }
    }

    console.log(`[Cleanup] Total unique matches: ${idsToDelete.size}`)

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

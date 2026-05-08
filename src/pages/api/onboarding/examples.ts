/**
 * GET /api/onboarding/examples
 *
 * V9.11 — returns 4-5 short, diverse, real reports from our DB
 * for the example carousel below the experience-share textarea.
 *
 * Filters:
 *   - status = 'approved'
 *   - description length 30-200 chars (short enough to read inline)
 *   - one per category to ensure diversity
 *   - randomized within constraints so the carousel rotates
 *
 * Response:
 *   { examples: Array<{ id, title, summary, category }> }
 *
 * Cached 5 min server-side; clients can re-fetch on each /start
 * mount for variety.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface Example {
  id: string
  title: string
  summary: string
  category: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Pull a candidate pool — 50 short approved reports, then sample by
  // category for diversity. We do this client-of-DB-side rather than
  // a complex SQL window because the candidate set is small.
  var { data: candidates, error } = await (admin
    .from('reports') as any)
    .select('id, title, summary, category')
    .eq('status', 'approved')
    .not('summary', 'is', null)
    .gte('char_length(summary)', 30)
    .lte('char_length(summary)', 200)
    .limit(50)

  if (error) {
    // char_length() in eq filter can fail on some Supabase configs;
    // fall back to a simpler query without length filter and trim
    // client-of-DB-side.
    var fallback = await (admin
      .from('reports') as any)
      .select('id, title, summary, category')
      .eq('status', 'approved')
      .not('summary', 'is', null)
      .limit(80)
    candidates = fallback.data
    if (fallback.error) {
      console.error('[OnboardingExamples] fallback failed:', fallback.error.message)
      return res.status(500).json({ error: 'Failed to fetch examples' })
    }
  }

  // Filter to short summaries + bucket by category.
  var byCategory: Record<string, Example[]> = {}
  ;(candidates || []).forEach(function (row: any) {
    var summary = (row.summary || '').toString().trim()
    if (summary.length < 30 || summary.length > 200) return
    var cat = row.category || 'unexplained_event'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push({ id: row.id, title: row.title, summary, category: cat })
  })

  // Pick one random from each category, prefer paranormal categories,
  // cap at 5 total. Order: UFO, ghosts, cryptid, psychic, then anything.
  // V9.11.1 — uses canonical PhenomenonCategory slugs (the prerelease
  // used legacy 'ufo_uap'/'ghost_haunting' strings that didn't exist
  // in the reports table, so the preference list never matched).
  var preferred = [
    'ufos_aliens',
    'ghosts_hauntings',
    'cryptids',
    'psychic_phenomena',
    'consciousness_practices',
    'religion_mythology',
    'esoteric_practices',
    'combination',
  ]
  var examples: Example[] = []
  for (var cat of preferred) {
    if (examples.length >= 5) break
    var pool = byCategory[cat]
    if (!pool || pool.length === 0) continue
    var pick = pool[Math.floor(Math.random() * pool.length)]
    examples.push(pick)
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900')
  return res.status(200).json({ examples })
}

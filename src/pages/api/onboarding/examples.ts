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

// Paranormal categories we surface in the first-impression carousel.
// Excludes the catch-all 'psychological_experiences' bucket where dream
// journals + low-signal entries tend to live.
var PREFERRED_CATEGORIES = [
  'ufos_aliens',
  'ghosts_hauntings',
  'cryptids',
  'psychic_phenomena',
  'consciousness_practices',
  'religion_mythology',
  'esoteric_practices',
]

// V11.20.3 — content screens for the onboarding examples. New users
// form their first impression here, so we reject (a) meta/editorial
// commentary and dream-journal entries that aren't real experience
// reports, and (b) violent/harmful content that shouldn't headline a
// welcome screen. Rejected candidates yield their slot to the next one
// (and the curated fallback fills any gap).
var REJECT_PATTERNS: RegExp[] = [
  // Meta / editorial / dream-journal commentary
  /^\s*note\s*[:\-]/i,
  /\bi (write|record|journal) my dreams\b/i,
  /\bi modified|i edited|i changed this\b/i,
  /\b(might|may) not make sense\b/i,
  /\bgrammatical/i,
  /\bin (my|a) dream\b/i,
  /\bit was (just )?a dream\b/i,
  /\bi (dreamt|dreamed)\b/i,
  /\bmy dream\b/i,
  /\blucid dream/i,
  /\bthis (is|was) (a |my )?dream\b/i,
  // Violent / harmful content — not for a welcome carousel
  /\b(killed|kill|killing|murder|stabbed|shot (him|her|them)|suicide|self[\s-]?harm|raped?|molest|abused?)\b/i,
]

function isRejected(s: string): boolean {
  for (var i = 0; i < REJECT_PATTERNS.length; i++) {
    if (REJECT_PATTERNS[i].test(s)) return true
  }
  return false
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
    .in('category', PREFERRED_CATEGORIES)
    .not('summary', 'is', null)
    .gte('char_length(summary)', 30)
    .lte('char_length(summary)', 200)
    .limit(120)

  if (error) {
    // char_length() in eq filter can fail on some Supabase configs;
    // fall back to a simpler query without length filter and trim
    // client-of-DB-side.
    var fallback = await (admin
      .from('reports') as any)
      .select('id, title, summary, category')
      .eq('status', 'approved')
      .in('category', PREFERRED_CATEGORIES)
      .not('summary', 'is', null)
      .limit(150)
    candidates = fallback.data
    if (fallback.error) {
      console.error('[OnboardingExamples] fallback failed:', fallback.error.message)
      return res.status(500).json({ error: 'Failed to fetch examples' })
    }
  }

  // V9.11.3 #6 — clean editorial noise out of the user-facing examples.
  //
  // Real summaries in our DB sometimes start with bracketed editorial
  // tags ("[Class B]", "[UFO]", "[NUFORC]") or have leading source-name
  // prefixes ("MUFON Case 12345 — "). These look unprofessional in the
  // onboarding carousel where new users are forming first impressions.
  // We strip the noise where we can; if a summary still looks ugly
  // (still has unbalanced brackets, very ALL-CAPS, contains URLs), we
  // skip it entirely and let the next candidate take its slot.
  function cleanSummary(raw: string): string | null {
    var s = (raw || '').toString().trim()
    if (!s) return null
    // Strip leading bracketed tags: "[Class B]", "[UFO]", "[NUFORC]"
    s = s.replace(/^\s*(?:\[[^\]]{1,40}\]\s*[-–—:]?\s*)+/g, '').trim()
    // Strip leading "MUFON case 1234 — ", "Report 1234: ", etc.
    s = s.replace(/^(?:[A-Z][A-Za-z]{1,12}\s+(?:case|report|sighting)\s+#?\d+\s*[-–—:]\s*)/i, '').trim()
    // Strip leading "Date submitted: ..." preamble
    s = s.replace(/^date\s+(?:submitted|reported)\s*:?\s*[A-Za-z0-9\s,/.-]+?[—:-]\s*/i, '').trim()
    // Reject anything still containing brackets — too noisy.
    if (/[\[\]]/.test(s)) return null
    // Reject if it looks like a URL or contains one.
    if (/https?:\/\//i.test(s)) return null
    // V11.20.3 — reject meta/editorial/dream-journal + harmful content.
    if (isRejected(s)) return null
    // Reject if more than 70% uppercase letters (likely shouting headline).
    var letters = s.replace(/[^A-Za-z]/g, '')
    if (letters.length > 20) {
      var upper = (letters.match(/[A-Z]/g) || []).length
      if (upper / letters.length > 0.7) return null
    }
    // Capitalise first letter if needed.
    if (s.length > 0 && /[a-z]/.test(s[0])) {
      s = s[0].toUpperCase() + s.slice(1)
    }
    if (s.length < 30 || s.length > 200) return null
    return s
  }

  // Filter to clean short summaries + bucket by category.
  var byCategory: Record<string, Example[]> = {}
  ;(candidates || []).forEach(function (row: any) {
    var summary = cleanSummary(row.summary || '')
    if (!summary) return
    var cat = row.category || 'unexplained_event'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push({ id: row.id, title: row.title || '', summary, category: cat })
  })

  // Pick one random from each category, prefer paranormal categories,
  // cap at 5 total. Order: UFO, ghosts, cryptid, psychic, then anything.
  // V9.11.1 — uses canonical PhenomenonCategory slugs (the prerelease
  // used legacy 'ufo_uap'/'ghost_haunting' strings that didn't exist
  // in the reports table, so the preference list never matched).
  var examples: Example[] = []
  for (var cat of PREFERRED_CATEGORIES) {
    if (examples.length >= 5) break
    var pool = byCategory[cat]
    if (!pool || pool.length === 0) continue
    var pick = pool[Math.floor(Math.random() * pool.length)]
    examples.push(pick)
  }

  // V9.11.3 #6 — curated fallback if real-DB filtering leaves us thin.
  // These are hand-written, brand-safe examples in case every candidate
  // for a category is editorial noise. Generic enough to fit any
  // visitor without being attributable.
  if (examples.length < 4) {
    var curated: Example[] = [
      {
        id: 'curated-1',
        title: '',
        summary: 'It was around midnight when three lights moved in formation across the sky, then split off in different directions instantly. No sound at all.',
        category: 'ufos_aliens',
      },
      {
        id: 'curated-2',
        title: '',
        summary: 'I woke up unable to move and felt a heavy presence at the edge of the bed. It lasted maybe a minute but felt much longer.',
        category: 'consciousness_practices',
      },
      {
        id: 'curated-3',
        title: '',
        summary: 'My grandmother passed away that morning. That night a clock she had given me, that hadn’t worked in years, started chiming on its own.',
        category: 'psychic_phenomena',
      },
      {
        id: 'curated-4',
        title: '',
        summary: 'We were hiking when something tall and hunched stepped between two trees, watched us, and walked away without a sound. We didn’t finish the trail.',
        category: 'cryptids',
      },
      {
        id: 'curated-5',
        title: '',
        summary: 'Every time I walked into the upstairs hallway of the old house I felt watched. Cold spots, doors closing, footsteps when I was the only one home.',
        category: 'ghosts_hauntings',
      },
    ]
    var have = new Set(examples.map(function (e) { return e.category }))
    for (var c of curated) {
      if (examples.length >= 5) break
      if (have.has(c.category)) continue
      examples.push(c)
      have.add(c.category)
    }
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900')
  return res.status(200).json({ examples })
}

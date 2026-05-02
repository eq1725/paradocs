/**
 * API Route: /api/admin/ai/generate-phenomena-hooks
 *
 * Admin endpoint for generating engagement-optimized feed hooks for phenomena.
 * These replace the encyclopedia-style ai_summary on feed cards with
 * documentary-trailer-tone copy that maximizes tap-through.
 *
 * Actions:
 *   - batch_missing: Generate hooks for all phenomena without feed_hook
 *   - single: Generate for a specific phenomenon ID
 *   - stats: Return hook coverage stats
 *
 * Session 2: Explore & Discovery
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

// V6 prompt — content/UX panel review revision (May 2026).
// Key change vs V5: hook MUST lead with what the phenomenon IS in plain
// terms a Gaia-cohort reader (paranormal-curious, not steeped in lore)
// can grasp in the first 6-8 words. Old prompt led with 'striking data
// points' which assumed prior knowledge ('Three Navy pilots tracked it'
// is meaningless if you don't know what 'it' is). New prompt structures
// Sentence 1 as identification, Sentence 2 as the unresolved tension.
var SYSTEM_PROMPT = 'You write two-sentence hooks for phenomenon entries on a paranormal investigation index. '
  + 'Each hook must stop a paranormal-curious adult (Gaia-subscriber type) mid-scroll AND make sense '
  + 'to someone who has never heard of this specific phenomenon before. Self-contained, never assumes '
  + 'prior knowledge.\n\n'
  + 'FORMAT — exactly two sentences:\n'
  + 'Sentence 1 (IDENTIFICATION): What this phenomenon IS in plain language. Within the first 8 words '
  + 'a reader who has never heard of it must understand what kind of thing this is and where/when it '
  + 'belongs. Lead with location + type, or culture + class, or era + category. Never assume the '
  + 'reader knows the name in the title.\n'
  + 'Sentence 2 (HOOK): The unresolved tension or striking data point — what pattern has no '
  + 'explanation, what evidence contradicts the mainstream account, what keeps happening that '
  + 'shouldn\u2019t. This is what makes them tap.\n\n'
  + 'CRITICAL — Sentence 1 must read fluently to a stranger to this topic. If a Gaia subscriber has '
  + 'never heard of "Pali Canon", "Roko\u2019s Basilisk", "Tulpa", "Spring-heeled Jack", etc., your hook '
  + 'must still make sense. Treat the phenomenon name as additional information, NOT as an anchor.\n\n'
  + 'RULES:\n'
  + '- 30-55 words total. Two complete sentences.\n'
  + '- Present tense always.\n'
  + '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, bizarre, strange.\n'
  + '- BANNED patterns: rhetorical questions, "This phenomenon...", "Known as...", "What if...", "Could it be...".\n'
  + '- No editorial opinions. No spoilers. No meta-commentary. Do NOT mention Paradocs.\n\n'
  + 'CATEGORY TONE (applied to Sentence 2 — Sentence 1 is always plain identification):\n'
  + '- ufos_aliens: Cockpit-clinical. Altitude, airspeed, radar lock, fleet-wide counts.\n'
  + '- cryptids: Field-biologist. Stride length, cast quality, sighting density.\n'
  + '- ghosts_hauntings: Architectural. Room dimensions, construction date.\n'
  + '- psychic_phenomena: Lab-report. Sample size, sigma, replication status.\n'
  + '- consciousness_practices: Physiological. Heart rate, brain wave frequency, duration.\n'
  + '- religion_mythology: Archival. Manuscript dates, translation counts, cross-cultural parallels.\n'
  + '- esoteric_practices: Lineage-precise. Practice duration, documented physiological effects.\n\n'
  + 'EXAMPLES OF GOOD V6 HOOKS (every one identifies first, then tensions):\n'
  + '- "Scotland\u2019s most famous lake monster, reported from Loch Ness since 1933. A 2019 environmental '
  + 'DNA survey ruled out large reptiles — but couldn\u2019t exclude a giant eel."\n'
  + '- "The Buddha\u2019s earliest teachings, preserved in 47 manuscript versions across Southeast Asia. '
  + 'All describe identical miracles — levitation, telepathy, weather control — that no contemporary '
  + 'record from his lifetime documents."\n'
  + '- "An ape-like creature reported in the Pacific Northwest since the 1950s. Footprint casts from '
  + 'Blue Creek Mountain show dermal ridges no known primate produces."\n'
  + '- "A consciousness state during REM sleep where the dreamer becomes aware they\u2019re dreaming. '
  + 'EEG studies show prefrontal cortex activation identical to waking — yet the body stays paralyzed."\n\n'
  + 'EXAMPLES OF BAD HOOKS (V5 patterns — never write these):\n'
  + '- "Three Navy pilots tracked it on infrared at 80,000 feet." (What is "it"? Reader who doesn\u2019t '
  + 'know this case is lost.)\n'
  + '- "Four centuries of manuscript transmission, 47 major Pali Canon recensions." (Assumes reader '
  + 'knows what the Pali Canon is.)\n'
  + '- "Over 10,000 sightings since 1958." (Sightings of what? No identification.)\n\n'
  + 'Return ONLY the hook text. No quotes, no labels, no explanation.'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

function buildPrompt(phenomenon: any): string {
  var parts: string[] = []

  if (phenomenon.name) parts.push('Name: ' + phenomenon.name)
  if (phenomenon.category) parts.push('Category: ' + phenomenon.category)
  if (phenomenon.aliases && phenomenon.aliases.length > 0) {
    parts.push('Also known as: ' + phenomenon.aliases.join(', '))
  }
  if (phenomenon.primary_regions && phenomenon.primary_regions.length > 0) {
    parts.push('Primary regions: ' + phenomenon.primary_regions.join(', '))
  }
  if (phenomenon.first_reported_date) {
    parts.push('First reported: ' + phenomenon.first_reported_date)
  }
  if (phenomenon.report_count) {
    parts.push('Report count: ' + phenomenon.report_count)
  }
  if (phenomenon.ai_quick_facts) {
    try {
      var qf = typeof phenomenon.ai_quick_facts === 'string'
        ? JSON.parse(phenomenon.ai_quick_facts)
        : phenomenon.ai_quick_facts
      Object.keys(qf).forEach(function (key) {
        if (qf[key]) parts.push(key + ': ' + qf[key])
      })
    } catch (e) {}
  }
  if (phenomenon.ai_summary) {
    parts.push('\nCurrent summary: ' + phenomenon.ai_summary)
  }
  if (phenomenon.ai_description) {
    var desc = phenomenon.ai_description.length > 1500
      ? phenomenon.ai_description.substring(0, 1500) + '...'
      : phenomenon.ai_description
    parts.push('\nFull description:\n' + desc)
  }

  return parts.join('\n')
}

async function callClaude(userPrompt: string): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[PhenomenaHook] No ANTHROPIC_API_KEY found')
    return null
  }

  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  for (var i = 0; i < models.length; i++) {
    try {
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: models[i],
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (response.ok) {
        var data = await response.json()
        var text = data.content && data.content[0] ? data.content[0].text : null
        return text ? text.trim() : null
      }

      if (response.status === 404 && i < models.length - 1) {
        continue
      }

      console.error('[PhenomenaHook] API error:', response.status)
      return null
    } catch (err) {
      console.error('[PhenomenaHook] Request failed:', err)
      if (i < models.length - 1) continue
      return null
    }
  }

  return null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check
  var adminKey = req.headers['x-admin-key']
  if (adminKey !== process.env.ADMIN_API_KEY) {
    var authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    var userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    var { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  var supabase = getSupabaseAdmin()
  var action = (req.body && req.body.action) || 'batch_missing'

  // ---- Stats ----
  if (action === 'stats') {
    var { count: total } = await supabase
      .from('phenomena')
      .select('id', { count: 'exact', head: true })

    var { count: withHook } = await supabase
      .from('phenomena')
      .select('id', { count: 'exact', head: true })
      .not('feed_hook', 'is', null)

    return res.status(200).json({
      total: total || 0,
      with_hook: withHook || 0,
      missing: (total || 0) - (withHook || 0),
      coverage: total ? Math.round(((withHook || 0) / total) * 100) + '%' : '0%',
    })
  }

  // ---- Single ----
  if (action === 'single') {
    var phenomenonId = req.body.id
    if (!phenomenonId) {
      return res.status(400).json({ error: 'Missing id' })
    }

    var { data: phenom } = await supabase
      .from('phenomena')
      .select('*')
      .eq('id', phenomenonId)
      .single()

    if (!phenom) {
      return res.status(404).json({ error: 'Phenomenon not found' })
    }

    var prompt = buildPrompt(phenom)
    var hook = await callClaude(prompt)

    if (hook) {
      await supabase
        .from('phenomena')
        .update({ feed_hook: hook })
        .eq('id', phenomenonId)

      return res.status(200).json({ id: phenomenonId, name: phenom.name, hook: hook })
    }

    return res.status(500).json({ error: 'Failed to generate hook' })
  }

  // ---- Batch missing ----
  var batchSize = (req.body && req.body.batch_size) || 25
  var offset = (req.body && req.body.offset) || 0
  var delay = (req.body && req.body.delay_ms) || 500

  var query = supabase
    .from('phenomena')
    .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_regions, first_reported_date, report_count, aliases')
    .is('feed_hook', null)
    .order('report_count', { ascending: false })
    .range(offset, offset + batchSize - 1)

  var { data: missing } = await query

  if (!missing || missing.length === 0) {
    return res.status(200).json({ message: 'All phenomena have hooks', generated: 0 })
  }

  var results: { id: string; name: string; success: boolean; hook?: string }[] = []

  for (var j = 0; j < missing.length; j++) {
    var p = missing[j]
    var userPrompt = buildPrompt(p)
    var generatedHook = await callClaude(userPrompt)

    if (generatedHook) {
      await supabase
        .from('phenomena')
        .update({ feed_hook: generatedHook })
        .eq('id', p.id)

      results.push({ id: p.id, name: p.name, success: true, hook: generatedHook })
    } else {
      results.push({ id: p.id, name: p.name, success: false })
    }

    // Rate limit
    if (j < missing.length - 1 && delay > 0) {
      await new Promise(function (resolve) { setTimeout(resolve, delay) })
    }
  }

  var successCount = results.filter(function (r) { return r.success }).length

  return res.status(200).json({
    generated: successCount,
    failed: results.length - successCount,
    total_processed: results.length,
    results: results,
  })
}

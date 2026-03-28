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

var SYSTEM_PROMPT = 'You write two-line hooks for phenomenon entries on a paranormal investigation feed. '
  + 'Each hook must stop a user mid-scroll and compel them to tap.\n\n'
  + 'FORMAT — exactly two lines:\n'
  + 'Line 1: The single most striking data point about this phenomenon — a number, a date range, a geographic pattern, or a physical measurement.\n'
  + 'Line 2: The unresolved tension — what pattern has no explanation, what evidence contradicts the mainstream account, or what keeps happening.\n\n'
  + 'RULES:\n'
  + '- 25-50 words total. Shorter is better.\n'
  + '- Present tense always.\n'
  + '- Lead with numbers, names, dates, or places — never abstractions.\n'
  + '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, bizarre.\n'
  + '- BANNED patterns: rhetorical questions, "This phenomenon...", "Known as...", "What if...", "Could it be...".\n'
  + '- No editorial opinions. No spoilers. No meta-commentary.\n'
  + '- Do NOT mention Paradocs.\n\n'
  + 'CATEGORY TONE:\n'
  + '- ufos_aliens: Cockpit-clinical. Altitude, airspeed, radar lock, fleet-wide sighting counts.\n'
  + '- cryptids: Field-biologist. Stride length, cast quality, habitat range, sighting density per decade.\n'
  + '- ghosts_hauntings: Architectural. Room dimensions, construction date, temperature differentials, recurrence intervals.\n'
  + '- psychic_phenomena: Lab-report. Sample size, sigma value, replication status across institutions.\n'
  + '- consciousness_practices: Physiological. Heart rate, brain wave frequency, duration of state.\n'
  + '- religion_mythology: Archival. Manuscript dates, translation counts, cross-cultural parallels.\n'
  + '- esoteric_practices: Lineage-precise. Practice duration, documented physiological effects.\n'
  + '- Other: Always lead with the most concrete detail available.\n\n'
  + 'EXAMPLES OF GOOD HOOKS:\n'
  + '- "Over 10,000 sightings since 1958, concentrated in a 90-mile corridor of the Pacific Northwest. Most witnesses describe the same detail first: the smell."\n'
  + '- "Three Navy pilots tracked it on infrared at 80,000 feet — it descended to sea level in 0.78 seconds. The Pentagon confirmed the footage."\n'
  + '- "Since 1882, 47 separate families have reported identical cold spots in the second-floor hallway. The building\'s heating system has been replaced four times."\n\n'
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
  var delay = (req.body && req.body.delay_ms) || 500

  var { data: missing } = await supabase
    .from('phenomena')
    .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_regions, first_reported_date, report_count, aliases')
    .is('feed_hook', null)
    .order('report_count', { ascending: false })
    .limit(batchSize)

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

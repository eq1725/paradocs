/**
 * Feed Hook Generation Service
 *
 * Generates compelling 2-3 sentence hooks for the Discover feed
 * using Claude Haiku. Each hook creates irresistible curiosity
 * about a report, optimized for the feed card experience.
 *
 * Session 10: Data Ingestion & Pipeline
 */

import { createServerClient } from '../supabase'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

// V6 prompt — content/UX panel review revision (May 2026).
// For REPORTS the title usually carries identification (location + year),
// but the hook still needs to be self-contained and lead with the
// concrete subject. The Gaia cohort hasn't memorized case names like
// 'Roswell' or 'Rendlesham' — the hook must still make sense to them.
var SYSTEM_PROMPT = 'You write two-sentence hooks for individual reports on a paranormal investigation index. '
  + 'Each hook must stop a paranormal-curious adult mid-scroll AND make sense to someone who has never '
  + 'heard of this specific case before. Self-contained, never assumes prior knowledge.\n\n'
  + 'FORMAT — exactly two sentences:\n'
  + 'Sentence 1 (IDENTIFICATION + EVENT): What kind of event happened, where, and roughly when, in '
  + 'plain language. Lead with the kind of phenomenon (UFO encounter, cryptid sighting, ghost '
  + 'observation, NDE, etc.) and the concrete who/where/when. The reader should know what category '
  + 'of thing this is within the first 8 words.\n'
  + 'Sentence 2 (HOOK): The single most striking detail or unresolved tension — the impossible '
  + 'detail, the contradiction, the thing that doesn\u2019t fit. This is what makes them tap.\n\n'
  + 'CRITICAL — A reader who has never heard of this case must still understand what happened. '
  + 'The case name ("Roswell", "Rendlesham", etc.) is additional information, NOT an anchor.\n\n'
  + 'RULES:\n'
  + '- 30-55 words total. Two complete sentences.\n'
  + '- Present tense always.\n'
  + '- NEVER include precise clock times (e.g. "at 21:19 local time"). Vague time references are fine.\n'
  + '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, bizarre, strange, peculiar.\n'
  + '- BANNED patterns: rhetorical questions, "This report...", "Known as...", "What if...", "Could this be...".\n'
  + '- No editorial opinions. No spoilers. No meta-commentary. Do NOT mention Paradocs.\n\n'
  + 'CATEGORY TONE (applied to Sentence 2):\n'
  + '- ufos_aliens: Cockpit-clinical. Altitude, airspeed, radar lock, witness credentials.\n'
  + '- cryptids: Field-biologist. Stride length, cast quality, habitat range.\n'
  + '- ghosts_hauntings: Architectural. Room dimensions, construction date, temperature differentials.\n'
  + '- psychic_phenomena: Lab-report. Sample size, sigma value, replication status.\n'
  + '- psychological_experiences: Phenomenology-precise. Duration, lucidity, after-effects.\n'
  + '- consciousness_practices: Physiological. Heart rate, brain wave frequency, duration of state.\n'
  + '- Other: Always lead with the most concrete detail available.\n\n'
  + 'EXAMPLES OF GOOD V6 HOOKS:\n'
  + '- "A UFO encounter over Iran in 1976 involving two F-4 fighter pilots scrambled to intercept. Both jets '
  + 'lost instrumentation when they approached the object — and one captured the entire encounter on radar."\n'
  + '- "A Bigfoot footprint cast pulled from Blue Creek Mountain, Oregon, in 1967. Forensic analysis showed '
  + 'dermal ridges no known primate produces — and the Smithsonian still has it in storage."\n'
  + '- "A near-death experience reported by a cardiac arrest patient in Minneapolis, 1989. The patient '
  + 'recounted overhearing a conversation that had taken place in the operating room while she was clinically dead."\n\n'
  + 'EXAMPLES OF BAD V5 HOOKS:\n'
  + '- "Four military witnesses photograph the moon over Pennsylvania." (No category, no tension.)\n'
  + '- "Three Navy pilots tracked it on infrared." (What is "it"?)\n'
  + '- "Something unexplained happens at an old house in Vermont." (Banned word, no specifics.)\n\n'
  + 'Return ONLY the hook text. No quotes, no labels, no explanation.'

/**
 * Build the user prompt with all available report data
 */
function buildUserPrompt(report: any): string {
  var parts: string[] = []

  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Category: ' + report.category)
  if (report.location_name) parts.push('Location: ' + report.location_name)
  if (report.country) parts.push('Country: ' + report.country)
  if (report.state_province) parts.push('State/Province: ' + report.state_province)
  if (report.city) parts.push('City: ' + report.city)
  if (report.event_date) parts.push('Date: ' + report.event_date)
  if (report.credibility) parts.push('Credibility: ' + report.credibility)
  if (report.source_type) parts.push('Source: ' + report.source_type)
  if (report.summary) parts.push('Summary: ' + report.summary)

  // Include description but truncate to ~2000 chars to keep costs down
  if (report.description) {
    var desc = report.description.length > 2000
      ? report.description.substring(0, 2000) + '...'
      : report.description
    parts.push('\nFull Report:\n' + desc)
  }

  return parts.join('\n')
}

/**
 * Call Claude Haiku to generate a feed hook
 */
async function callClaude(userPrompt: string): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[FeedHook] No ANTHROPIC_API_KEY found')
    return null
  }

  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  for (var m = 0; m < models.length; m++) {
    try {
      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: models[m],
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })

      if (!resp.ok) {
        var errText = await resp.text()
        console.error('[FeedHook] API error with ' + models[m] + ': ' + resp.status + ' ' + errText)
        continue
      }

      var data = await resp.json()
      if (data.content && data.content.length > 0 && data.content[0].text) {
        var hook = data.content[0].text.trim()

        // Validate hook quality
        if (hook.length < 30) {
          console.warn('[FeedHook] Hook too short, skipping: ' + hook.substring(0, 50))
          return null
        }
        if (hook.length > 250) {
          // Truncate to ~55 words if too long
          var words = hook.split(/\s+/)
          if (words.length > 55) {
            hook = words.slice(0, 50).join(' ') + '...'
          }
        }

        // Strip quotes if the model wrapped it
        if ((hook.startsWith('"') && hook.endsWith('"')) ||
            (hook.startsWith("'") && hook.endsWith("'"))) {
          hook = hook.slice(1, -1)
        }

        return hook
      }
    } catch (err) {
      console.error('[FeedHook] Error with model ' + models[m] + ':', err)
      continue
    }
  }

  return null
}

/**
 * Generate a feed hook for a report and save it to the database.
 * Returns the generated hook text, or null if generation failed.
 */
export async function generateAndSaveFeedHook(reportId: string): Promise<string | null> {
  var supabase = createServerClient()

  // Fetch report data
  var { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, credibility, source_type')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[FeedHook] Report not found: ' + reportId)
    return null
  }

  // Build prompt and generate
  var userPrompt = buildUserPrompt(report)
  var hook = await callClaude(userPrompt)

  if (!hook) {
    console.warn('[FeedHook] Failed to generate hook for report: ' + reportId)
    return null
  }

  // Save to database
  var { error: updateError } = await supabase
    .from('reports')
    .update({
      feed_hook: hook,
      feed_hook_generated_at: new Date().toISOString()
    })
    .eq('id', reportId)

  if (updateError) {
    console.error('[FeedHook] Failed to save hook for report ' + reportId + ':', updateError)
    return null
  }

  return hook
}

/**
 * Generate hooks for a batch of report IDs.
 * Includes rate limiting to avoid API throttling.
 */
export async function generateHooksBatch(
  reportIds: string[],
  options?: { delayMs?: number; batchSize?: number; force?: boolean }
): Promise<{ generated: number; skipped: number; failed: number; errors: string[] }> {
  var supabase = createServerClient()
  var delay = options?.delayMs || 200
  var batchSize = options?.batchSize || 15
  var force = options?.force || false
  var stats = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] }

  for (var i = 0; i < reportIds.length; i += batchSize) {
    var batch = reportIds.slice(i, i + batchSize)

    for (var j = 0; j < batch.length; j++) {
      var reportId = batch[j]

      // Check if already has hook (unless force)
      if (!force) {
        var { data: existing } = await supabase
          .from('reports')
          .select('feed_hook')
          .eq('id', reportId)
          .single()

        if (existing && existing.feed_hook) {
          stats.skipped++
          continue
        }
      }

      try {
        var hook = await generateAndSaveFeedHook(reportId)
        if (hook) {
          stats.generated++
        } else {
          stats.failed++
          stats.errors.push('Report ' + reportId + ': generation returned null')
        }
      } catch (err: any) {
        stats.failed++
        stats.errors.push('Report ' + reportId + ': ' + (err.message || 'unknown error'))
      }

      // Rate limiting delay between individual calls
      if (j < batch.length - 1) {
        await new Promise(function(resolve) { setTimeout(resolve, delay) })
      }
    }

    // Longer delay between batches
    if (i + batchSize < reportIds.length) {
      await new Promise(function(resolve) { setTimeout(resolve, 2000) })
    }
  }

  return stats
}

/**
 * Get feed hook generation statistics
 */
export async function getFeedHookStats(): Promise<{
  total_approved: number
  with_hooks: number
  without_hooks: number
  coverage_pct: number
}> {
  var supabase = createServerClient()

  var { count: totalApproved } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')

  var { count: withHooks } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .not('feed_hook', 'is', null)

  var total = totalApproved || 0
  var hooks = withHooks || 0

  return {
    total_approved: total,
    with_hooks: hooks,
    without_hooks: total - hooks,
    coverage_pct: total > 0 ? Math.round((hooks / total) * 1000) / 10 : 0
  }
}

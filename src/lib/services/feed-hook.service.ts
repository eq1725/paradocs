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

var SYSTEM_PROMPT = 'You write two-sentence hooks for a paranormal investigation feed. '
  + 'Each hook must stop a user mid-scroll and compel them to tap.\n\n'
  + 'FORMAT — ALWAYS exactly two sentences:\n'
  + 'Sentence 1: The single most striking or unusual detail from the report — a specific fact that makes someone pause.\n'
  + 'Sentence 2: The open loop — what remains unexplained, what contradicts expectation, or what happened that shouldn\'t have. This sentence is what makes them click.\n\n'
  + 'CRITICAL — YOUR HOOK MUST HAVE BOTH SENTENCES. A single factual statement is NOT a hook. '
  + 'The second sentence creates the tension that drives the click.\n\n'
  + 'RULES:\n'
  + '- 25-50 words total. Shorter is better.\n'
  + '- Present tense always.\n'
  + '- NEVER just restate what happened. Find the angle — the contradiction, the impossible detail, the thing that doesn\'t fit.\n'
  + '- NEVER include precise clock times (e.g. "at 21:19 local time"). Vague time references are fine ("after midnight", "at dusk").\n'
  + '- NEVER write a one-sentence summary of the event. That is a caption, not a hook.\n'
  + '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, bizarre, strange, peculiar.\n'
  + '- BANNED patterns: rhetorical questions, "This report...", "Known as...", "What if...", "Could this be...".\n'
  + '- No editorial opinions. No spoilers. No meta-commentary.\n'
  + '- Do NOT mention Paradocs.\n\n'
  + 'CATEGORY TONE:\n'
  + '- ufos_aliens: Cockpit-clinical. Altitude, airspeed, radar lock, flight duration, witness credentials.\n'
  + '- cryptids: Field-biologist. Stride length, cast quality, habitat range, population estimates.\n'
  + '- ghosts_hauntings: Architectural. Room dimensions, construction date, temperature differentials.\n'
  + '- psychic_phenomena: Lab-report. Sample size, sigma value, replication status.\n'
  + '- consciousness_practices: Physiological. Heart rate, brain wave frequency, duration of state.\n'
  + '- Other: Always lead with the most concrete detail available.\n\n'
  + 'GOOD HOOKS (notice: every one has two sentences with tension):\n'
  + '- "Fourteen commercial pilots report the same object over Lake Michigan in a single 40-minute window. None of them filed until the FAA released the radar tapes."\n'
  + '- "A 16-inch footprint cast pulled from Blue Creek Mountain shows dermal ridges no known primate produces. The Smithsonian still has it in storage."\n'
  + '- "Every guest in Room 428 of the Driskill Hotel reports waking at 2:47 AM. Management stopped renting it in 2003."\n'
  + '- "Four military personnel watch a bright object pace the moon for several minutes over rural Pennsylvania. All four cameras capture the same thing — and none of them can explain the second object in the frame."\n\n'
  + 'BAD HOOKS (never write these — they are captions, not hooks):\n'
  + '- "Four military witnesses photograph the moon over Pennsylvania on April 1, 2026 at 21:19 local time." (Just restates the event. No tension. No second sentence.)\n'
  + '- "A large creature is spotted near a lake in Oregon." (Generic, no specific detail, no open loop.)\n'
  + '- "Something unexplained happens at an old house in Vermont." (Uses banned word, no specifics.)\n\n'
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

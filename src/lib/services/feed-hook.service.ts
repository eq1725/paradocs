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

var SYSTEM_PROMPT = 'You are a master storyteller writing hooks for a paranormal investigation feed. '
  + 'Your job is to take a full report and distill it into 2-3 sentences that create '
  + 'irresistible curiosity. Think of it as the opening of a documentary trailer.\n\n'
  + 'Rules:\n'
  + '- First sentence: set the scene with a specific detail (date, place, number of witnesses)\n'
  + '- Second sentence: introduce the anomaly or tension\n'
  + '- Third sentence (optional): deepen the mystery or hint at implications\n'
  + '- NEVER use: "mysterious", "unexplained", "shocking", "terrifying", "you won\'t believe"\n'
  + '- NEVER spoil the resolution or conclusion\n'
  + '- Use present tense for immediacy when possible\n'
  + '- Keep it between 40-80 words\n'
  + '- The reader should feel compelled to tap "Read more"\n\n'
  + 'Category tone guidance:\n'
  + '- ufos_aliens: Technical, aviation-flavored. Reference altitude, speed, radar, military.\n'
  + '- cryptids: Nature documentary tone. Reference habitat, measurements, witness credibility.\n'
  + '- ghosts_hauntings: Gothic atmosphere. Reference architecture, time of day, sensory details.\n'
  + '- psychic_phenomena: Clinical but open-minded. Reference controlled conditions, repeatability.\n'
  + '- consciousness_practices: Experiential, first-person-adjacent. Reference altered states, physiology.\n'
  + '- Other: Adapt to subject, always lead with specificity over vagueness.\n\n'
  + 'Quality rules:\n'
  + '- DO: Lead with the most specific or unusual detail\n'
  + '- DO: Use real names, dates, and places when available\n'
  + '- DO: Create a "camera movement" zoom from wide to close\n'
  + '- DO: End unresolved — leave the reader wanting more\n'
  + '- DON\'T: Start with "This report describes..."\n'
  + '- DON\'T: Use rhetorical questions\n'
  + '- DON\'T: Include editorial opinions\n'
  + '- DON\'T: Mention Paradocs\n\n'
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
        if (hook.length > 300) {
          // Truncate to ~80 words if too long
          var words = hook.split(/\s+/)
          if (words.length > 85) {
            hook = words.slice(0, 80).join(' ') + '...'
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

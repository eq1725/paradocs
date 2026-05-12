/**
 * Feed Hook Generation Service — V10.4 refactor
 *
 * Generates the 2-sentence "feed hook" copy used on the Today
 * discovery feed (DiscoverCards). Each hook stops a reader
 * mid-scroll AND makes sense to someone who has never heard of
 * this specific case before.
 *
 * V10.4: delegates to src/lib/ai/rewrite-pipeline.ts so the
 * hook goes through the SAME anti-fabrication + anonymization
 * + claim-citation + audit-log pipeline as every other AI
 * rewrite. The tone rules (banned words, category voice,
 * length constraints) are passed in as extraInstructions.
 *
 * Public API preserved — the ingestion engine and admin
 * regeneration endpoints keep calling the same functions.
 */

import { createServerClient } from '../supabase'
import { rewriteWithGuardrails } from '@/lib/ai/rewrite-pipeline'

const HOOK_TONE_INSTRUCTIONS = [
  'You are writing a TWO-SENTENCE hook for the Paradocs discovery feed (Today tab).',
  'Goal: stop a paranormal-curious adult mid-scroll AND make sense to someone who has never heard of this specific case before.',
  '',
  'FORMAT — exactly two sentences (30-55 words total):',
  '  Sentence 1 (IDENTIFICATION + EVENT): What kind of event the source describes, where, and roughly when, in plain language. Lead with the kind of phenomenon (UFO encounter, cryptid sighting, ghost observation, NDE, etc.) and the concrete who/where/when within the first 8 words. Use hedge voice — "the source describes…", "the report records…".',
  '  Sentence 2 (HOOK): The single most striking detail or unresolved tension that appears IN THE SOURCE — never invented. The impossible detail, the contradiction, the thing that does not fit. This is what makes the reader tap.',
  '',
  'TONE RULES:',
  '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, bizarre, strange, peculiar.',
  '- BANNED patterns: rhetorical questions, "This report…", "Known as…", "What if…", "Could this be…".',
  '- No editorial opinions. No spoilers. No meta-commentary. Do NOT mention Paradocs.',
  '',
  'CATEGORY TONE (applied to Sentence 2 when relevant):',
  '- ufos_aliens: cockpit-clinical. Altitude, airspeed, radar lock, witness credentials.',
  '- cryptids: field-biologist. Stride length, cast quality, habitat range.',
  '- ghosts_hauntings: architectural. Room dimensions, construction date, temperature differentials.',
  '- psychic_phenomena: lab-report. Sample size, sigma value, replication status.',
  '- psychological_experiences: phenomenology-precise. Duration, lucidity, after-effects.',
  '- consciousness_practices: physiological. Heart rate, brain wave frequency, duration of state.',
  '',
  'IMPORTANT: every concrete detail (altitude, sample size, room dimensions, etc.) MUST appear in the source. If the source does not contain enough material for a faithful 2-sentence hook, return INSUFFICIENT.',
].join('\n')

/**
 * Build the source-text packet that the rewrite pipeline will
 * paraphrase. Everything goes into a single block; we keep field
 * labels so the model can lean on what's most concrete.
 */
function buildSourceText(report: any): string {
  const parts: string[] = []
  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Category: ' + report.category)
  if (report.location_name) parts.push('Location: ' + report.location_name)
  if (report.country) parts.push('Country: ' + report.country)
  if (report.state_province) parts.push('State/Province: ' + report.state_province)
  if (report.city) parts.push('City: ' + report.city)
  if (report.event_date) parts.push('Date: ' + report.event_date)
  if (report.credibility) parts.push('Credibility: ' + report.credibility)
  if (report.source_type) parts.push('Source type: ' + report.source_type)
  if (report.summary) parts.push('Summary: ' + report.summary)
  if (report.description) {
    const desc = report.description.length > 2000
      ? report.description.substring(0, 2000) + '...'
      : report.description
    parts.push('\nFull source text:\n' + desc)
  }
  return parts.join('\n')
}

/**
 * Generate a feed hook for a report and save it to the database.
 * Returns the hook text or null on failure.
 */
export async function generateAndSaveFeedHook(reportId: string): Promise<string | null> {
  const supabase = createServerClient()

  const { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, credibility, source_type')
    .eq('id', reportId)
    .single()
  if (fetchError || !report) {
    console.error('[FeedHook] Report not found: ' + reportId)
    return null
  }

  const sourceText = buildSourceText(report)

  const result = await rewriteWithGuardrails({
    mode: 'faithful_paraphrase',
    sourceText,
    task: 'Write the two-sentence feed hook described below. Lead Sentence 1 with the phenomenon type, place, and rough date. Lead Sentence 2 with the most striking faithful detail from the source.',
    extraInstructions: HOOK_TONE_INSTRUCTIONS,
    maxChars: 280, // ~55 words at avg word length
    anonymize: true,
    outputField: 'reports.feed_hook',
    reportId,
    maxTokens: 220,
  })

  if (!result.output) {
    console.warn('[FeedHook] generation produced no output for ' + reportId + ' (reason=' + result.reason + ')')
    return null
  }

  // Reject too-short outputs (the V6 rule).
  if (result.output.length < 30) {
    console.warn('[FeedHook] Hook too short, skipping: ' + result.output.substring(0, 50))
    return null
  }

  const { error: updateError } = await (supabase.from('reports') as any)
    .update({
      feed_hook: result.output,
      feed_hook_generated_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (updateError) {
    console.error('[FeedHook] Failed to save hook for report ' + reportId + ':', updateError)
    return null
  }

  return result.output
}

/**
 * Batch generation with rate limiting.
 */
export async function generateHooksBatch(
  reportIds: string[],
  options?: { delayMs?: number; batchSize?: number; force?: boolean },
): Promise<{ generated: number; skipped: number; failed: number; errors: string[] }> {
  const supabase = createServerClient()
  const delay = options?.delayMs || 200
  const batchSize = options?.batchSize || 15
  const force = options?.force || false
  const stats = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] }

  for (let i = 0; i < reportIds.length; i += batchSize) {
    const batch = reportIds.slice(i, i + batchSize)

    for (let j = 0; j < batch.length; j++) {
      const reportId = batch[j]

      if (!force) {
        const { data: existing } = await (supabase.from('reports') as any)
          .select('feed_hook')
          .eq('id', reportId)
          .single()
        if (existing && existing.feed_hook) {
          stats.skipped++
          continue
        }
      }

      try {
        const hook = await generateAndSaveFeedHook(reportId)
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

      if (j < batch.length - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, delay))
      }
    }

    if (i + batchSize < reportIds.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 2000))
    }
  }

  return stats
}

/**
 * Coverage stats for the admin dashboard.
 */
export async function getFeedHookStats(): Promise<{
  total_approved: number
  with_hooks: number
  without_hooks: number
  coverage_pct: number
}> {
  const supabase = createServerClient()

  const { count: totalApproved } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')

  const { count: withHooks } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .not('feed_hook', 'is', null)

  const total = totalApproved || 0
  const with_ = withHooks || 0

  return {
    total_approved: total,
    with_hooks: with_,
    without_hooks: total - with_,
    coverage_pct: total > 0 ? Math.round((with_ / total) * 100) : 0,
  }
}

/**
 * answer-line.service — V10.4 Phase 1.6
 *
 * Generates a one-sentence faithful summary of a report, stored
 * as reports.answer_line. Used on the new mobile-first report
 * page (Phase 2) directly under the title — the TL;DR a
 * mass-market reader sees first.
 *
 * Hard rules:
 *   - One sentence. Max ~180 characters.
 *   - Faithful paraphrase (hedge voice, no general knowledge,
 *     INSUFFICIENT sentinel, anonymization, claim-citation
 *     check, audit log).
 *
 * Delegates to src/lib/ai/rewrite-pipeline.ts so it shares the
 * exact same anti-fabrication regime as every other AI rewrite.
 */

import { createServerClient } from '../supabase'
import { rewriteWithGuardrails } from '@/lib/ai/rewrite-pipeline'

const MAX_ANSWER_LINE_CHARS = 180

const ANSWER_LINE_INSTRUCTIONS = [
  'Write ONE complete sentence that answers the question: "What does this report describe?"',
  '',
  'Format: ONE sentence, maximum 180 characters total. No more than ~25 words.',
  '',
  'Lead with the phenomenon type and the most identifying details:',
  '  Bad:  "The source records an event from 1972 in Pennsylvania involving witnesses."',
  '  Good: "A 1972 Pennsylvania UFO sighting that the source describes as a 45-second close encounter with a luminous disc, witnessed by two people."',
  '',
  'Use hedge voice — "the source describes…", "the report records…", "the page documents…".',
  'Do NOT include the URL.',
  'Do NOT begin with "This report" or "This article".',
  'Just return the sentence — no preamble, no quotes, no labels.',
].join('\n')

/**
 * Generate and persist the answer_line for a single report.
 *
 * V10.6.13 — Returns { text, reason } so callers can distinguish:
 *   - text='...'  → success
 *   - text=null + reason='insufficient' → source too sparse
 *   - text=null + reason='claim_check_failed' → AI drifted
 *   - text=null + reason='no_source' → no description to work from
 *   - text=null + reason='not_found' → reportId invalid
 * Backward-compat: text-only callers can still do `if (result.text)`.
 */
export interface AnswerLineResult {
  text: string | null
  reason?: string
}

export async function generateAndSaveAnswerLine(reportId: string): Promise<AnswerLineResult> {
  const supabase = createServerClient()

  const { data: report, error: fetchError } = await (supabase.from('reports') as any)
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, witness_count')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[AnswerLine] Report not found: ' + reportId)
    return { text: null, reason: 'not_found' }
  }

  // V10.6.15 — Source packet now contains ONLY: title, category,
  // summary, and the full narrative. ALL other structured metadata
  // (location_name/city/state_province/country, event_date,
  // witness_count) is excluded.
  //
  // History: V10.6.14 dropped the location columns after the
  // Georgia→Louisiana case revealed they were corrupt for a slice
  // of the corpus. Pass rate went 30% → 60%. V10.6.15 extends the
  // principle: the dream-experience-1970 case revealed event_date
  // has the SAME problem — OBERF ingestion writes YYYY-01-01 as a
  // placeholder when the actual date is unknown. AI faithfully
  // writes 'in 1970', claim-check correctly flags that the source
  // narrative doesn't specify 1970. Same pattern, different
  // column. Witness_count likely has similar default values.
  //
  // Net design: the structured columns are for UI display (report
  // page header, map, OG card meta row, /explore filters). They
  // are NOT trustworthy enough to feed to the anti-fabrication
  // pipeline. The narrative contains date / location / witnesses
  // organically where they exist; where they don't, the AI writes
  // a more general answer-line, which is correct behavior.
  const parts: string[] = []
  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Category: ' + report.category)
  if (report.summary) parts.push('Summary: ' + report.summary)
  if (report.description) {
    const desc = report.description.length > 2500
      ? report.description.substring(0, 2500) + '...'
      : report.description
    parts.push('\nFull source text:\n' + desc)
  }
  const sourceText = parts.join('\n')

  const result = await rewriteWithGuardrails({
    mode: 'faithful_paraphrase',
    sourceText,
    task: 'Write the one-sentence answer-line for this report. See the formatting rules below.',
    extraInstructions: ANSWER_LINE_INSTRUCTIONS,
    maxChars: MAX_ANSWER_LINE_CHARS,
    anonymize: true,
    outputField: 'reports.answer_line',
    reportId,
    maxTokens: 100,
  })

  if (!result.output) {
    console.warn('[AnswerLine] generation produced no output for ' + reportId + ' (reason=' + result.reason + ')')
    // Persist null to make the report-page render the absence cleanly.
    await (supabase.from('reports') as any)
      .update({ answer_line: null })
      .eq('id', reportId)
    return { text: null, reason: result.reason || 'unknown' }
  }

  const { error: updateError } = await (supabase.from('reports') as any)
    .update({ answer_line: result.output })
    .eq('id', reportId)

  if (updateError) {
    console.error('[AnswerLine] Failed to save for report ' + reportId + ':', updateError)
    return { text: null, reason: 'db_save_failed' }
  }

  return { text: result.output }
}

/**
 * Batch generation with rate limiting (mirrors feed-hook batch).
 */
export async function generateAnswerLinesBatch(
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
          .select('answer_line')
          .eq('id', reportId)
          .single()
        if (existing && existing.answer_line) {
          stats.skipped++
          continue
        }
      }

      try {
        const r = await generateAndSaveAnswerLine(reportId)
        if (r.text) {
          stats.generated++
        } else {
          stats.failed++
          stats.errors.push('Report ' + reportId + ': ' + (r.reason || 'generation returned null'))
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

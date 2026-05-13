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

const MAX_ANSWER_LINE_CHARS = 280

const ANSWER_LINE_INSTRUCTIONS = [
  'Write ONE complete sentence (or TWO short sentences) that answers the question: "What does this report describe?"',
  '',
  'Format: 1–2 sentences, maximum 280 characters total. Aim for ~35–45 words. The user is reading this in lieu of going to the original source — pack it with the most identifying, specific facts the source contains.',
  '',
  'WHAT TO INCLUDE (in priority order — work down this list, including each item that the source directly supports):',
  '  1. The phenomenon type (orb sighting, NDE, cryptid encounter, etc.).',
  '  2. The most distinctive observed detail (shape, color, behavior, duration).',
  '  3. WHEN: year or month+year, or part of decade ("mid-1990s"). Vague is fine — match source precision.',
  '  4. WHERE: city + state, or state, or country. Match the source\'s precision.',
  '  5. WHO: witness age (or age range), occupation, state of mind ("during meditation", "while driving"), and/or number of witnesses if more than one.',
  '  6. Notable sequel or corroborating detail: physical evidence, second-witness corroboration, a follow-on event ("hours later", "the same night").',
  '',
  'Lead with the most identifying details:',
  '  Bad:  "The source records an event from 1972 in Pennsylvania involving witnesses." (4 generic facts, no specifics)',
  '  Good (180 chars / 25 words): "A 1972 Pennsylvania UFO sighting the source describes as a 45-second close encounter with a luminous disc, witnessed by two people."',
  '  Best (280 chars / 40 words): "A 19-year-old in Kansas reports a bright orange orb passing over their home during late-evening meditation in mid-December, followed by purple wavy lines in the distant sky and a friend\'s nearby park UFO post the same night."',
  '',
  'Use hedge voice — "the source describes…", "the report records…", "the page documents…", or the more concise "A [witness] reports…".',
  '',
  // V10.6.19 — match the source\'s intensity. The Madrid Art Exhibition case
  // had the AI writing "fever-stricken" when the source said "slight fever";
  // also drifted timeline by placing the fever at the exhibition when the
  // source said it developed hours later. Both correctly rejected by the
  // claim-check. This is the AI editorializing, not a source-packet bug.
  'INTENSITY DISCIPLINE — do NOT dramatize or intensify the source\'s language:',
  '  - If the source says "slight fever," do NOT write "fever-stricken" or "ravaged by fever."',
  '  - If the source says "felt afraid," do NOT write "terrified" or "horrified."',
  '  - If the source says "saw a light," do NOT write "blinded by a brilliant light."',
  '  - If the source says "the experience felt real," do NOT write "deeply transformative."',
  '  Match the source\'s register. Plain becomes plain. Vivid stays vivid. Never escalate.',
  '',
  'TITLE DISCIPLINE — the title may be more dramatic than the narrative supports.',
  '  Treat the title as a hint, not a fact source. Every claim in your output must be',
  '  supported by the FULL SOURCE TEXT, not the title. If the title says "Fever-Induced',
  '  Revelation" but the narrative says "slight fever later that night," your output',
  '  must match the narrative, not the title.',
  '',
  'TIMELINE DISCIPLINE — events that happened BEFORE / DURING / AFTER are not',
  '  interchangeable. If the source says X happened "hours later" or "the next day"',
  '  or "weeks before," preserve that temporal relationship.',
  '',
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

  // V10.6.16 — Source packet refinement:
  //  - DROP category from the source packet. The 'Child Led Through
  //    Emerald Tunnel' audit revealed the AI was echoing the literal
  //    category name ('psychological experience') as a noun phrase in
  //    the output, which the claim-check correctly flagged as drift —
  //    'psychological experience' is editorial classification, not a
  //    fact stated in the narrative. Same class of bug as date/
  //    location; category is just another structured field with the
  //    same vulnerability.
  //  - BUMP truncation from 2500 → 5000 chars. The same audit showed
  //    the narrative was cut off mid-sentence describing the tunnel
  //    walls — we were losing the "emerald" mention the AI was
  //    pulling from. NDERF reports run 3-6K chars; 2500 was too tight.
  //
  // Source packet is now: TITLE + SUMMARY + FULL NARRATIVE (5K cap).
  // Everything else gets stripped — the narrative is the source of
  // truth and the claim-check pass requires every fact to come from
  // there.
  const parts: string[] = []
  if (report.title) parts.push('Title: ' + report.title)
  if (report.summary) parts.push('Summary: ' + report.summary)
  if (report.description) {
    // V10.6.18 — bumped 5K → 8K. The 'Nineteen Year Old…Spiritual
    // Awakening' audit (12:21 PM) revealed 5K was still too tight
    // for chatty NDERF reports with long biographical preambles —
    // we were cutting off BEFORE the actual experience description.
    // AI was then inferring location from 'grew up in Ireland' bio
    // context and claim-check correctly rejected the inference.
    // 8K captures the full narrative for the vast majority of OBERF
    // and NDERF reports while keeping token cost reasonable.
    const desc = report.description.length > 8000
      ? report.description.substring(0, 8000) + '...'
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
    maxTokens: 180, // V10.7.B.5 — bumped 100 → 180 because the new ~45-word answer line target (280 chars) needs ~70-80 output tokens; 100 was OK for 25-word lines but the model began hitting stop_reason='max_tokens' under the new cap.
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

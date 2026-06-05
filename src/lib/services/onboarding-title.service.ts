/**
 * onboarding-title.service — Haiku-based short title generation
 *
 * Panel-feedback (May 2026). Two callers:
 *   - /api/onboarding/suggest-title (client-driven, on textarea blur)
 *   - /api/onboarding/submit (server-side fallback if the user didn't
 *     accept the suggestion or didn't wait for it)
 *
 * Why a shared util instead of inlining both call sites: the prompt,
 * the model choice, and the post-processing rules need to stay in
 * sync. If we tighten the title style later (say "no first-person
 * voice"), we want one place to change it.
 *
 * SWC: var + function() form.
 */

import Anthropic from '@anthropic-ai/sdk'
import { logAiUsage, getCostLogClient } from './ai-cost-logger'

var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

var MODEL = 'claude-haiku-4-5-20251001'

var MAX_TITLE_CHARS = 90

var SYSTEM_PROMPT = [
  'You write short titles for first-person paranormal, UFO, and unexplained experience reports.',
  '',
  'Rules:',
  '- 4 to 10 words.',
  '- Plain sentence case (no Title Case unless a proper noun demands it).',
  '- No quotes, no emoji, no exclamation marks.',
  '- No clickbait ("You won\'t believe what I saw"). No question marks.',
  '- Lead with the concrete element of the experience — the figure, the light, the place, the moment.',
  '- Use the author\'s voice ("I" / "we" / "my") only if the author already used it; otherwise prefer third-person framing.',
  '- Never invent specifics that aren\'t in the source.',
  '',
  'Respond with ONLY the title text. No quotes around it, no preamble, no trailing punctuation other than what the sentence needs.',
].join('\n')

export interface SuggestTitleResult {
  /** Trimmed, sanitized title — or null if the call failed. */
  title: string | null
  /** Approximate cost in USD (cents-precision is fine). */
  costUsd: number
  /** Diagnostic — 'ok' on success, otherwise a short reason. */
  reason: 'ok' | 'too-short' | 'no-api-key' | 'empty-response' | 'error'
}

/**
 * Run a Haiku title-generation call.
 *
 * Returns a sanitized title (or null on any failure). Never throws —
 * the caller can decide whether to fall back to the first-sentence
 * makeTitle pattern when title is null.
 */
export async function suggestOnboardingTitle(
  description: string,
  category?: string | null,
): Promise<SuggestTitleResult> {
  var body = (description || '').trim()
  if (body.length < 50) {
    return { title: null, costUsd: 0, reason: 'too-short' }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { title: null, costUsd: 0, reason: 'no-api-key' }
  }
  if (body.length > 2500) body = body.slice(0, 2500)

  try {
    var userMsg = 'Experience body:\n\n' + body
    if (category) userMsg += '\n\nUser-picked category hint: ' + category

    var message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 60,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    })

    // V11.17.84 — actual token usage from the response (replaces the
    // earlier char-based approximation) + unified cost log.
    var realUsage: any = (message as any).usage || {}
    var inputTokens = realUsage.input_tokens || Math.ceil((SYSTEM_PROMPT.length + userMsg.length) / 4)
    var outputTokens = realUsage.output_tokens || Math.ceil(60 / 4)
    var costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0
    try {
      var logClient = await getCostLogClient()
      if (logClient) {
        logAiUsage('onboarding-title', logClient, {
          model: MODEL,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cacheCreationTokens: realUsage.cache_creation_input_tokens || 0,
          cacheReadTokens: realUsage.cache_read_input_tokens || 0,
          costUsd: costUsd,
          requestId: (message as any).id || null,
          status: 'completed',
        })
      }
    } catch (_logErr) { /* logging never blocks */ }

    var textBlock: any = message.content.find(function (b: any) { return b.type === 'text' })
    var raw = textBlock && textBlock.type === 'text' ? String(textBlock.text || '') : ''

    var cleaned = raw.trim()
      .replace(/^["'`“”‘’]+/g, '')
      .replace(/["'`“”‘’]+$/g, '')
      .replace(/[.\!]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (cleaned.length === 0) {
      return { title: null, costUsd: costUsd, reason: 'empty-response' }
    }
    if (cleaned.length > MAX_TITLE_CHARS) {
      cleaned = cleaned.slice(0, MAX_TITLE_CHARS).replace(/\s+\S*$/, '')
    }

    return { title: cleaned, costUsd: costUsd, reason: 'ok' }
  } catch (e: any) {
    console.error('[onboarding-title] failed:', e?.message || e)
    return { title: null, costUsd: 0, reason: 'error' }
  }
}

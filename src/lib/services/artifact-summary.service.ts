/**
 * artifact-summary.service — V10.3 (QA #3b)
 *
 * Generates a clean 2-3 sentence summary for external URL saves
 * (BFRO sightings, Reddit threads, YouTube clips, etc.) using
 * Claude Haiku. Replaces the raw OG meta description that we
 * previously stored — those tend to be generic boilerplate on
 * sites like BFRO (literally "Bigfoot Field Researchers
 * Organization") with zero descriptive value.
 *
 * Tone rules:
 *   - Documentary, not promotional.
 *   - Past tense for sightings/events ("witnesses observed…").
 *   - No exclamation marks. No editorializing.
 *   - 2-3 sentences max. Hard cap at 320 characters.
 *
 * Failure mode: fails OPEN. If the API key is missing or the call
 * errors, we return null — caller should fall back to the existing
 * metadata_json.description. Never block a user's save on this.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface ArtifactSummaryResult {
  summary: string | null
  source: 'ai' | 'fallback' | 'disabled' | 'error'
  /** ms — for monitoring. */
  durationMs: number
  /** Whether the input had enough material to summarize at all. */
  hadInput: boolean
}

var MODEL = 'claude-haiku-4-5-20251001'
var MAX_SUMMARY_CHARS = 320

interface SummarizeInput {
  url: string
  title: string
  /** Raw meta description (OG / Twitter card / first <p>) — often poor. */
  metaDescription?: string | null
  /** Best-effort page content if we have it (first ~2KB of stripped HTML). */
  pageText?: string | null
  /** Source platform if known (youtube, reddit, bfro, etc.) — informs tone. */
  sourcePlatform?: string | null
}

/**
 * Generate an AI summary. Input gets concatenated into a prompt; we
 * only call the model when we have at least a title (otherwise
 * there's nothing to work with). Returns null if AI is disabled or
 * the call fails — callers fall back to the raw meta description.
 */
export async function summarizeArtifact(input: SummarizeInput): Promise<ArtifactSummaryResult> {
  var started = Date.now()

  var hadInput = !!(input.title && input.title.trim().length > 0)
  if (!hadInput) {
    return { summary: null, source: 'fallback', durationMs: 0, hadInput: false }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { summary: null, source: 'disabled', durationMs: 0, hadInput }
  }

  var meta = (input.metaDescription || '').trim().slice(0, 800)
  var page = (input.pageText || '').trim().slice(0, 2000)
  var platform = input.sourcePlatform || 'web'

  var prompt = buildPrompt({
    url: input.url,
    title: input.title.trim(),
    metaDescription: meta,
    pageText: page,
    platform,
  })

  try {
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    var resp = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    })
    var content = resp.content[0]
    if (!content || content.type !== 'text') {
      return { summary: null, source: 'error', durationMs: Date.now() - started, hadInput }
    }
    var text = (content.text || '').trim()
    if (!text) {
      return { summary: null, source: 'error', durationMs: Date.now() - started, hadInput }
    }
    // Strip surrounding quotes / formatting Haiku occasionally adds.
    text = stripWrapping(text)

    // V10.3.1 — anti-hallucination sentinel. If the model determined
    // the inputs were too sparse to summarize without fabricating,
    // it returns INSUFFICIENT. We respect that and abstain, letting
    // the caller fall back to whatever raw description exists.
    if (/^\s*insufficient\s*$/i.test(text) || text.toUpperCase().startsWith('INSUFFICIENT')) {
      return { summary: null, source: 'fallback', durationMs: Date.now() - started, hadInput }
    }

    if (text.length > MAX_SUMMARY_CHARS) {
      text = truncateAtSentence(text, MAX_SUMMARY_CHARS)
    }
    return { summary: text, source: 'ai', durationMs: Date.now() - started, hadInput }
  } catch (err) {
    console.error('[artifact-summary] Haiku call failed:', err)
    return { summary: null, source: 'error', durationMs: Date.now() - started, hadInput }
  }
}

// ── Prompt construction ─────────────────────────────────────

function buildPrompt(args: {
  url: string
  title: string
  metaDescription: string
  pageText: string
  platform: string
}): string {
  // Build the available material section, dropping empty fields
  // so the model isn't told "Meta description: (empty)".
  var parts: string[] = []
  parts.push('Title: ' + args.title)
  if (args.metaDescription) parts.push('Page description: ' + args.metaDescription)
  if (args.pageText) parts.push('Page content snippet: ' + args.pageText)
  parts.push('URL: ' + args.url)
  if (args.platform && args.platform !== 'other' && args.platform !== 'web') {
    parts.push('Platform: ' + args.platform)
  }

  return [
    'You are paraphrasing a source description for a paranormal-research archive entry.',
    'Below is ONLY the information available about an external source that a researcher saved.',
    'Your job is to write a faithful 2-3 sentence paraphrase of what is in that information — nothing more.',
    '',
    'CRITICAL ANTI-FABRICATION RULES:',
    '- Every claim in your summary MUST be directly supported by the provided title, description, or page snippet. Nothing else.',
    '- If the input is too thin to write 2 sentences without making things up, return EXACTLY this single word and nothing else: INSUFFICIENT',
    '- Do NOT add details that are not present in the input — no invented dates, locations, witnesses, behaviors, outcomes, or context. None.',
    '- Do NOT use your general knowledge to fill in what a typical case of this type looks like. We do NOT want a generic template; we want a faithful paraphrase of THIS specific input.',
    '- Do NOT name people, places, or events that are not explicitly in the input.',
    '- If the input mentions a general location ("Pennsylvania"), do not narrow it ("a wooded area near Pittsburgh"). If it mentions a year, do not invent a month. If it mentions an animal, do not invent a description.',
    '- When the input is sparse, write a more GENERAL but accurate paraphrase — never compensate with invented specificity.',
    '',
    'VOICE RULES (only after the anti-fabrication rules are satisfied):',
    '- Hedge framing: refer to the source itself, not the events as facts. Use phrases like "the source documents", "the page describes", "the report records", "according to the entry", "the writeup notes".',
    '- Past tense for sightings or events ("the source describes a sighting witnesses reported in 1998").',
    '- Documentary tone. No hype, no editorializing, no exclamation marks, no emoji.',
    '- Do NOT include the URL in the summary.',
    '- Do NOT start with "This is" or "This article".',
    '- Just return the summary text, no preamble, no quotes, no markdown. Or return INSUFFICIENT.',
    '',
    'AVAILABLE INFORMATION:',
    parts.join('\n'),
    '',
    'FAITHFUL PARAPHRASE (or INSUFFICIENT):',
  ].join('\n')
}

function stripWrapping(text: string): string {
  var t = text.trim()
  // Remove leading/trailing quote marks
  if ((t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith('“') && t.endsWith('”')) ||
      (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }
  // Remove common preamble Haiku sometimes inserts despite the
  // instruction.
  var preambles = [
    /^summary:\s*/i,
    /^here(?:'s| is) (?:the |a |my )?summary[:.]?\s*/i,
  ]
  for (var p of preambles) t = t.replace(p, '').trim()
  return t
}

function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  var head = text.slice(0, maxLen)
  // Prefer last sentence-ending punctuation.
  var lastPunct = Math.max(
    head.lastIndexOf('.'),
    head.lastIndexOf('!'),
    head.lastIndexOf('?'),
  )
  if (lastPunct > maxLen * 0.6) return head.slice(0, lastPunct + 1).trim()
  // Otherwise truncate at last space + ellipsis.
  var lastSpace = head.lastIndexOf(' ')
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trim() + '…'
}

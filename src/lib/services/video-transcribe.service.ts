/**
 * video-transcribe.service — Whisper transcription + Haiku metadata
 *
 * Panel-feedback (May 2026 — 3rd round). Shared between:
 *   - /api/reports/video/[id]/finalize (synchronous inline call so
 *     transcript is ready by the time the user lands on review)
 *   - /api/cron/transcribe-videos (backup retry every 5 min for any
 *     row that timed out or failed during finalize)
 *
 * Cost: Whisper $0.006/min audio + Haiku ~$0.0005/call ≈ $0.013/video
 * at 2-min avg. Trivial against any plausible revenue.
 *
 * SWC: var + function() form (consistent with the rest of the codebase).
 */

import Anthropic from '@anthropic-ai/sdk'

var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface WhisperResult {
  text: string
  language?: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

export interface ExtractedMeta {
  proposed_title?: string
  proposed_description?: string
  location_hints?: string[]
  date_hints?: string[]
  category_hints?: string[]
}

/**
 * Send a video Blob to OpenAI Whisper. Returns the transcription
 * plus word-level segments for caption generation.
 *
 * Throws on Whisper API failure — callers should retry with backoff
 * or fall back to manual review.
 */
export async function runWhisper(blob: Blob, filename: string): Promise<WhisperResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured')
  }
  var form = new FormData()
  form.append('file', blob, filename)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')

  var resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: form,
  })
  if (!resp.ok) {
    var text = await resp.text()
    throw new Error('Whisper API ' + resp.status + ': ' + text.slice(0, 200))
  }
  return await resp.json()
}

var HAIKU_EXTRACT_SYSTEM = [
  'You analyze short first-person video transcripts about paranormal, UFO, or unexplained experiences and produce structured metadata.',
  '',
  'Return a JSON object with these keys (no preamble, no markdown, no code fences):',
  '{',
  '  "proposed_title": string,           // 4-10 words, sentence case, no quotes/emoji',
  '  "proposed_description": string,     // a clean 2-4 sentence summary in the author\'s voice',
  '  "location_hints": string[],         // any place names mentioned (cities, states, countries)',
  '  "date_hints": string[],             // any dates / years / time references',
  '  "category_hints": string[]          // canonical category slugs from this list:',
  '                                       //   ghosts_hauntings, ufos_aliens, cryptids,',
  '                                       //   psychic_phenomena, consciousness_practices,',
  '                                       //   psychological_experiences, combination',
  '}',
  '',
  'Rules:',
  '- Never invent specifics that aren\'t in the transcript.',
  '- For arrays, use [] if there\'s nothing valid to put in them.',
  '- For category_hints, pick AT MOST 2 from the list above; do not invent new categories.',
].join('\n')

/**
 * Run Haiku over a transcript to extract structured metadata for
 * prefilling the review form. Never throws — returns null on any
 * failure so the caller can fall through to a manual flow.
 */
export async function runHaikuExtract(transcript: string): Promise<ExtractedMeta | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!transcript || transcript.trim().length < 20) return null
  try {
    var resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0.2,
      system: HAIKU_EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: 'Transcript:\n\n' + transcript.slice(0, 4000) }],
    })
    var block: any = resp.content.find(function (b: any) { return b.type === 'text' })
    var raw = block && block.type === 'text' ? String(block.text || '') : ''
    var cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned) as ExtractedMeta
  } catch (e: any) {
    console.warn('[video-transcribe] haiku extract failed:', e?.message)
    return null
  }
}

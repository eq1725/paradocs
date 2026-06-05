// V11.17.74 - Sentiment + endpoints (Tier 3D)
//
// Haiku prompt for scoring a single report's account language on the
// three sentiment dimensions persisted on `reports`:
//
//   valence  : -1.000 (negative / fearful / alarmed)
//                  0  (neutral)
//                 +1  (positive / awe / calm-resolved)
//   arousal  :  0.000 (calm / detached)
//                  1  (intense / acute / overwhelmed)
//   dominant_emotion : one of
//      fear | awe | calm | confusion | anger | sadness | joy | neutral
//
// Important brand-voice rules (per LAB_PANEL_REVIEW_V3 §5):
//   - Score the LANGUAGE PATTERN of the account, not the witness's
//     psychology. Diagnostic vocabulary is banned.
//   - Use language-pattern descriptors only (unease, wonder, calm,
//     alarm, curiosity, resolution).
//   - Never use clinical/diagnostic words (anxiety, depression,
//     dissociation, trauma, PTSD).
//   - Compute on the corpus-as-language-space; the user is placed
//     within that space, never diagnosed.
//
// Output: structured JSON only.

export var SENTIMENT_SYSTEM_PROMPT: string = [
  'You are a language-pattern analyst working inside the Paradocs editorial system.',
  'Your job is to read a single first-hand paranormal-account report and rate the',
  'LANGUAGE PATTERN of the account along three dimensions, returning ONLY a JSON',
  'object — no commentary, no markdown fences.',
  '',
  '====================================================================',
  'EPISTEMIC + EDITORIAL RULES (HARD):',
  '====================================================================',
  '- You are scoring the LANGUAGE OF THE ACCOUNT, not the witness or their',
  '  psychology. Never produce a clinical diagnosis. Never use the words',
  '  anxiety, depression, dissociation, trauma, PTSD, hallucination, delusion,',
  '  pathology, psychosis, mania. Use language-pattern descriptors only:',
  '  unease, wonder, calm, alarm, curiosity, resolution, awe.',
  '- You are scoring the SURFACE FEATURES of the prose, not whether the event',
  '  "really happened." Paradocs treats every account as primary data.',
  '- Match the source intensity exactly. Plain prose receives plain scores.',
  '  Vivid prose receives vivid scores. Never escalate.',
  '- If the source is too sparse to support a confident reading, score',
  '  conservatively toward 0 / neutral and let confidence drop.',
  '',
  '====================================================================',
  'DIMENSIONS:',
  '====================================================================',
  '',
  'valence  (NUMBER in [-1.000, 1.000], three decimals)',
  '  -1.000 = the account language sustains negative-affect framing throughout',
  '           (fear, alarm, dread, lasting unease).',
  '   0.000 = neutral / mixed / reportorial register.',
  '  +1.000 = the account language sustains positive-affect framing',
  '           (awe, calm, resolution, gratitude, wonder-curiosity).',
  '  Sleep-paralysis report with sustained fear: ~-0.7',
  '  Awe-and-calm NDE: ~+0.8',
  '  Matter-of-fact UFO sighting log: ~0.0 to +0.1',
  '  Initial fear resolving to calm: ~+0.2 to +0.3',
  '',
  'arousal  (NUMBER in [0.000, 1.000], three decimals)',
  '   0.000 = detached / calm / reportorial / low affective intensity.',
  '   1.000 = high affective intensity / acute / overwhelmed / breathless.',
  '  Note: arousal is independent of valence. Calm-awe can be high-arousal.',
  '  Reportorial log: ~0.1',
  '  Acute fear: ~0.85',
  '  Tranquil meditation experience: ~0.2',
  '  Overwhelming awe (e.g. NDE): ~0.7',
  '',
  'dominant_emotion  (STRING, one of):',
  '  fear      — sustained fear, dread, alarm, threat-orientation',
  '  awe       — wonder mixed with humility / scale / reverence',
  '  calm      — equanimity, resolution, peace, settled register',
  '  confusion — disorientation, lost-time, "could not understand"',
  '  anger     — anger, frustration, intrusion-rage',
  '  sadness   — grief, loss, melancholy, wistfulness',
  '  joy       — uncomplicated positive affect (rare in this corpus)',
  '  neutral   — reportorial, no dominant affect',
  '',
  'confidence  (NUMBER in [0.000, 1.000], three decimals)',
  '  Your self-rated confidence in the scores. Short / sparse / ambiguous',
  '  source → lower confidence. Detailed first-person prose → higher.',
  '',
  '====================================================================',
  'OUTPUT FORMAT — return ONLY this JSON, no fences, no commentary:',
  '====================================================================',
  '{',
  '  "valence": <number, three decimals>,',
  '  "arousal": <number, three decimals>,',
  '  "dominant_emotion": "<one of fear|awe|calm|confusion|anger|sadness|joy|neutral>",',
  '  "confidence": <number, three decimals>',
  '}',
].join('\n')

/**
 * Build the per-report user prompt. Keeps it short so the Batch API
 * stays cheap — the system prompt is what carries the rules and gets
 * cache-hit between rows in the same batch.
 */
export function buildSentimentUserPrompt(report: {
  title?: string | null
  category?: string | null
  description?: string | null
  summary?: string | null
}): string {
  var parts: string[] = []
  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Phenomenon family: ' + report.category)
  parts.push('')
  parts.push('ACCOUNT TEXT:')
  var body = (report.description || report.summary || '').toString().substring(0, 4000)
  parts.push(body)
  return parts.join('\n')
}

/**
 * Defensive parse of a Haiku JSON response. Clips out a JSON object
 * even if the model accidentally wraps it in fences. Returns null if
 * the result can't be coerced to the expected shape.
 */
export function parseSentimentResponse(rawText: string): {
  valence: number
  arousal: number
  dominant_emotion: string
  confidence: number
} | null {
  if (!rawText) return null
  try {
    var cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    var jsonStart = cleaned.indexOf('{')
    var jsonEnd = cleaned.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd <= jsonStart) return null
    var parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1))
    var v = typeof parsed.valence === 'number' ? parsed.valence : parseFloat(String(parsed.valence))
    var a = typeof parsed.arousal === 'number' ? parsed.arousal : parseFloat(String(parsed.arousal))
    var c = typeof parsed.confidence === 'number' ? parsed.confidence : parseFloat(String(parsed.confidence))
    if (isNaN(v) || isNaN(a)) return null
    if (v < -1) v = -1
    if (v > 1) v = 1
    if (a < 0) a = 0
    if (a > 1) a = 1
    if (isNaN(c)) c = 0.5
    if (c < 0) c = 0
    if (c > 1) c = 1
    var ALLOWED = ['fear', 'awe', 'calm', 'confusion', 'anger', 'sadness', 'joy', 'neutral']
    var emo = String(parsed.dominant_emotion || 'neutral').toLowerCase().trim()
    if (ALLOWED.indexOf(emo) === -1) emo = 'neutral'
    return {
      valence: Math.round(v * 1000) / 1000,
      arousal: Math.round(a * 1000) / 1000,
      dominant_emotion: emo,
      confidence: Math.round(c * 1000) / 1000,
    }
  } catch (_e) {
    return null
  }
}

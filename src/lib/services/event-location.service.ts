/**
 * Event Location Extraction Service
 *
 * Narrative-rich sources (NDERF, OBERF, IANDS, Reddit) often mention
 * multiple locations — where the narrator lives, where they grew up,
 * where a friend was born, and where the event being described actually
 * happened. Pure-regex extraction picks up whichever mention fits the
 * grammar first, which silently mis-pins reports. Example:
 *
 *   "I lived in Beaumont, Texas at the time but saw the light in the
 *    sky in Cheyenne, WY when on vacation."
 *
 * Pattern matching sees "in Beaumont, Texas" first and stamps the event
 * as Beaumont. Correct answer: Cheyenne, WY.
 *
 * This service calls a small Claude model with a prompt that forces the
 * model to identify the EVENT location specifically and return strict
 * JSON. Callers (NDERF adapter, OBERF adapter, backfill scripts) use the
 * result as the primary extraction, falling back to regex only when the
 * LLM is unavailable or returns low-confidence output.
 *
 * Design notes:
 *  - Model: Claude Haiku 4.5 — fast, cheap, sufficient for extraction
 *  - Input is the *narrative body* only (no questionnaire scaffolding),
 *    truncated to a reasonable length to keep latency bounded
 *  - Output is strict JSON; the service parses and validates
 *  - The service NEVER invents locations — if the narrative doesn't plainly
 *    name an event location, confidence is 'none' and we return null
 */

var ANTHROPIC_PRIMARY = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-sonnet-4-5-20250929'
var REQUEST_TIMEOUT_MS = 25000
var MAX_RETRIES = 2
var MAX_NARRATIVE_CHARS = 6000

export interface EventLocationInput {
  /** Full narrative text (witness prose) to analyse. */
  narrative: string
  /**
   * Optional structured hints the source already gave us. These are
   * passed to the model so it can confirm or correct them, not taken
   * on faith. Many NDERF accounts list a home state on the cover page
   * but describe an event that happened elsewhere.
   */
  hintCity?: string | null
  hintState?: string | null
  hintCountry?: string | null
  /** Short description of what "the event" is, for disambiguation. */
  eventTypeLabel?: string | null
}

export interface EventLocation {
  city: string | null
  state: string | null
  country: string | null
  precision: 'city' | 'state' | 'country' | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  reasoning: string
}

export interface EventLocationResult {
  location: EventLocation | null
  model: string | null
  attempts: number
  fallbackReason?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  if (s.length <= n) return s
  // Try to cut at a sentence boundary
  var window = s.substring(0, n)
  var lastPeriod = window.lastIndexOf('.')
  if (lastPeriod > n * 0.6) return window.substring(0, lastPeriod + 1)
  return window + '…'
}

var SYSTEM_PROMPT = [
  'You extract the EVENT LOCATION from first-person paranormal or near-death narratives.',
  '',
  'The narrator may mention several locations:',
  '  • where they lived at the time',
  '  • where they grew up / were born',
  '  • where they later moved',
  '  • where a friend, relative, or hospital is',
  '  • where the EVENT being described actually happened',
  '',
  'Your job is to return ONLY the location where the described event actually took place.',
  'If the narrator says "I lived in Beaumont, TX but saw the light in Cheyenne, WY", you return',
  'Cheyenne, WY — because that is where the sighting happened, even though Beaumont is mentioned',
  'more prominently.',
  '',
  'Rules:',
  '  - NEVER invent or guess. If the narrative does not plainly identify an event location, return',
  '    null fields and confidence "none".',
  '  - If only a state/country is given (no city), return that with matching precision.',
  '  - If the event location and home location are the same, return it as the event location.',
  '  - For structured hints provided by the caller, CONFIRM or OVERRIDE — do not just echo them.',
  '    If the narrative contradicts a hint, trust the narrative.',
  '  - Use canonical US state names ("Wyoming", not "WY") and full country names.',
  '',
  'Return STRICT JSON with this exact shape and no commentary:',
  '{',
  '  "city": string | null,',
  '  "state": string | null,',
  '  "country": string | null,',
  '  "precision": "city" | "state" | "country" | null,',
  '  "confidence": "high" | "medium" | "low" | "none",',
  '  "reasoning": string',
  '}',
  '',
  'Confidence guide:',
  '  "high"   — narrative explicitly names the event location',
  '  "medium" — event location is strongly implied but not named verbatim',
  '  "low"    — weak signal; only one plausible candidate',
  '  "none"   — narrative does not identify an event location (return null fields)',
].join('\n')

function buildUserPrompt(input: EventLocationInput): string {
  var parts: string[] = []
  parts.push('NARRATIVE:')
  parts.push(truncate(input.narrative.trim(), MAX_NARRATIVE_CHARS))
  parts.push('')
  var hints: string[] = []
  if (input.hintCity) hints.push('City: ' + input.hintCity)
  if (input.hintState) hints.push('State: ' + input.hintState)
  if (input.hintCountry) hints.push('Country: ' + input.hintCountry)
  if (hints.length > 0) {
    parts.push('STRUCTURED HINTS (verify against narrative; override if contradicted):')
    parts.push(hints.join(' | '))
    parts.push('')
  }
  if (input.eventTypeLabel) {
    parts.push('EVENT TYPE: ' + input.eventTypeLabel)
    parts.push('')
  }
  parts.push('Return the JSON object now.')
  return parts.join('\n')
}

async function callClaude(model: string, userPrompt: string): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  var controller = new AbortController()
  var timeoutId = setTimeout(function () { controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: controller.signal
    })
    if (!resp.ok) {
      var errText = await resp.text()
      console.error('[EventLocation] API ' + resp.status + ': ' + errText.substring(0, 200))
      return null
    }
    var data = await resp.json()
    var content = data && data.content
    if (!Array.isArray(content) || content.length === 0) return null
    var block = content[0]
    if (!block || block.type !== 'text') return null
    return typeof block.text === 'string' ? block.text : null
  } catch (e: any) {
    if (e && e.name === 'AbortError') {
      console.error('[EventLocation] Timeout for model ' + model)
    } else {
      console.error('[EventLocation] Error: ' + (e && e.message ? e.message : String(e)))
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseJsonBlock(raw: string): EventLocation | null {
  if (!raw) return null
  // Strip code fences if present
  var cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Locate first JSON object boundary
  var start = cleaned.indexOf('{')
  var end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  var blob = cleaned.substring(start, end + 1)
  try {
    var obj = JSON.parse(blob)
    var city = typeof obj.city === 'string' && obj.city.trim() ? obj.city.trim() : null
    var state = typeof obj.state === 'string' && obj.state.trim() ? obj.state.trim() : null
    var country = typeof obj.country === 'string' && obj.country.trim() ? obj.country.trim() : null
    var precision: 'city' | 'state' | 'country' | null = null
    if (obj.precision === 'city' || obj.precision === 'state' || obj.precision === 'country') {
      precision = obj.precision
    }
    // Infer precision if missing but fields are present
    if (!precision) {
      if (city) precision = 'city'
      else if (state) precision = 'state'
      else if (country) precision = 'country'
    }
    var conf: EventLocation['confidence'] = 'none'
    if (obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low' || obj.confidence === 'none') {
      conf = obj.confidence
    }
    var reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : ''
    return {
      city: city,
      state: state,
      country: country,
      precision: precision,
      confidence: conf,
      reasoning: reasoning,
    }
  } catch (e) {
    console.error('[EventLocation] JSON parse failed: ' + (e instanceof Error ? e.message : String(e)))
    return null
  }
}

function isUsable(loc: EventLocation | null): boolean {
  if (!loc) return false
  if (loc.confidence === 'none') return false
  // Require at least one geographic field
  if (!loc.city && !loc.state && !loc.country) return false
  return true
}

/**
 * Extract the event location from a narrative via Claude.
 * Retries on model errors, falls through to a secondary model, and
 * returns null when the narrative does not plainly name an event location.
 */
export async function extractEventLocation(
  input: EventLocationInput
): Promise<EventLocationResult> {
  if (!input.narrative || input.narrative.trim().length < 80) {
    return { location: null, model: null, attempts: 0, fallbackReason: 'narrative too short' }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { location: null, model: null, attempts: 0, fallbackReason: 'no ANTHROPIC_API_KEY' }
  }

  var userPrompt = buildUserPrompt(input)
  var models = [ANTHROPIC_PRIMARY, ANTHROPIC_FALLBACK]
  var attempts = 0
  var lastReason = 'model returned no parseable JSON'

  for (var m = 0; m < models.length; m++) {
    var model = models[m]
    for (var r = 0; r < MAX_RETRIES; r++) {
      attempts++
      var raw = await callClaude(model, userPrompt)
      if (!raw) {
        lastReason = 'api error on ' + model
        await sleep(300 * (r + 1))
        continue
      }
      var parsed = parseJsonBlock(raw)
      if (!parsed) {
        lastReason = 'unparseable JSON from ' + model
        await sleep(300 * (r + 1))
        continue
      }
      // Return whatever the model produced — including low-confidence nulls.
      // Caller decides whether to accept based on `isUsable`.
      if (!isUsable(parsed)) {
        return {
          location: parsed,
          model: model,
          attempts: attempts,
          fallbackReason: 'model returned confidence=' + parsed.confidence,
        }
      }
      return { location: parsed, model: model, attempts: attempts }
    }
  }

  return { location: null, model: null, attempts: attempts, fallbackReason: lastReason }
}

// Re-exported for callers that want to run their own validity check
// before accepting a result.
export { isUsable as isUsableEventLocation }

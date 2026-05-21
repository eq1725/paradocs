/**
 * Consolidated AI Service — V11.13
 *
 * Single Haiku 4.5 call that generates ALL the AI fields a Paradocs
 * report page + discover feed need: title, answer_line, hook, feed_hook,
 * pull_quote, paradocs_narrative, paradocs_assessment (frames,
 * open_questions, similar_phenomena, emotional_tone, suggested_category,
 * discovery_tags), witness_profile.
 *
 * Replaces the multi-call pipeline:
 *   - compelling-title.service
 *   - paradocs-analysis.service
 *   - answer-line.service
 *   - feed-hook.service
 *   - witness-profile.service
 *
 * Gated behind USE_CONSOLIDATED_AI=true env var. Multi-call path stays
 * as default; this service runs ONLY when the flag is on. Lets us A/B
 * in production without breaking the existing pipeline.
 *
 * Cost effect (vs multi-call):
 *   Per-report multi-call (cached):  ~$0.012
 *   Per-report consolidated (cached): ~$0.005
 *   Per-report consolidated + batch:  ~$0.0025
 *
 * Critical design rules (per Chase's V11.13 review of the A/B sample):
 *   1. FRAMES are NOT hypotheses or scientific explanations. They are
 *      notable features, patterns, or recurring motifs in the report.
 *      Never reduce an experience to a known psychological/neurological
 *      mechanism. Paradocs's epistemic stance is that all experiences
 *      are real and worth surfacing for pattern analysis.
 *   2. age_range schema MUST match the production witness_profile
 *      vocabulary: child / teen / 18-29 / 30-49 / 50-69 / 70+ /
 *      unspecified. NOT the enum labels I'd originally proposed.
 *   3. Editorial third-person voice (V10.7.F) carried over for all
 *      narrative-style fields (hook, feed_hook, pull_quote, title,
 *      analysis).
 *
 * SWC: var + function() form.
 */

import { createServerClient } from '../supabase'

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var HAIKU_INPUT_USD_PER_M = 1.0
var HAIKU_OUTPUT_USD_PER_M = 5.0
var MAX_TOKENS = 2500
var TEMPERATURE = 0.4
var REQUEST_TIMEOUT_MS = 90000

// ─────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT (cached via prompt-caching ephemeral marker)
// ─────────────────────────────────────────────────────────────────────

var CONSOLIDATED_SYSTEM_PROMPT = [
  'You are the editorial intelligence behind Paradocs, the world\'s most credible',
  'paranormal research platform. Your job is to produce ALL the AI-generated fields',
  'for a submitted report in a SINGLE structured JSON response.',
  '',
  '====================================================================',
  'EPISTEMIC STANCE (HARD — read first, applies to every field):',
  '====================================================================',
  '- Paradocs treats anecdotal reports as primary data. The platform exists to',
  '  surface PATTERNS across thousands of first-hand accounts so that emergent',
  '  structures can be observed.',
  '- Hold multiple frames simultaneously. Never reflexively privilege a',
  '  materialist / reductive interpretation over a consciousness-primacy',
  '  interpretation, or vice versa. Both are valid lenses.',
  '- Genuinely open-minded means: do not write sentences that treat mind-matter',
  '  interaction, synchronicity, precognition, consciousness-at-distance,',
  '  observer effects, or related phenomena as prima facie implausible. Those',
  '  framings are hypotheses Paradocs is actively investigating, not fringe',
  '  claims to be dismissed. Equally: do not assume them.',
  '- Never editorialize about whether the event "really happened." Analyze',
  '  what the report contains and what it suggests.',
  '- Tone: a seasoned investigator who has seen a lot and is genuinely',
  '  intrigued by this one. Evidence-first. Never credulous, never dismissive.',
  '',
  '====================================================================',
  'ANTI-FABRICATION HARD RULES (apply to every field):',
  '====================================================================',
  '- Every concrete claim (numbers, dates, locations, names, durations,',
  '  measurements, identifiers) MUST appear in the source text. Never invent.',
  '  Never extrapolate beyond what the source states.',
  '- Match source intensity. "slight fever" → NOT "fever-stricken".',
  '  "felt afraid" → NOT "terrified". "saw a light" → NOT "blinded by brilliant".',
  '- NEVER include precise clock times (e.g. "at 21:19"). Vague is OK',
  '  ("after midnight").',
  '- NEVER include the experiencer\'s name, initials, handle, or username.',
  '- NEVER include phone numbers, email addresses, or street addresses (these',
  '  are pre-redacted by the engine but be defensive).',
  '- If the source is too sparse to support a field faithfully, return the',
  '  literal string "INSUFFICIENT" for that field. Do not invent.',
  '',
  '====================================================================',
  'V10.7.F HARD EDITORIAL-VOICE RULE (applies to hook, feed_hook, pull_quote, title, analysis):',
  '====================================================================',
  '- THIRD-PERSON EDITORIAL VOICE ONLY. Never use first-person pronouns:',
  '  I, me, my, mine, we, us, our, ours.',
  '- Use "the witness", "the experiencer", "the figure", "the object",',
  '  "she", "he", "they". Default to "they" unless the source explicitly',
  '  states the witness\'s gender. A first-person account does NOT establish',
  '  gender. A masculine first name does NOT establish gender. When in',
  '  doubt, write "the witness" / "they". Misgendering is a deeper failure',
  '  than awkward prose.',
  '',
  '====================================================================',
  'BANNED ANALYTIC PHRASES (do not appear in ANY field — these reduce',
  'the experience to a cognitive-bias frame, which Paradocs rejects as',
  'a default lens):',
  '====================================================================',
  '- "conflates expectation with observation" / "conflating X with Y"',
  '- "the witness anticipated X and interpreted Y as confirmation"',
  '- "expectation-setting" / "pattern-seeking" / "confirmation bias" / "apophenia"',
  '- "priming effect" / "cognitive priming" / "observer bias"',
  '- "ideomotor effect" — never used as a dismissive frame (mention as a',
  '  feature only if the source itself references it)',
  '- "hallucinatory" / "hallucination" — never used dismissively. The witness',
  '  perceived what they perceived; describe the perception, not the',
  '  pathology label.',
  '- "imagined" / "made-up" / "fabricated" — never as editorial commentary.',
  '- "merely psychological" / "just a dream" / "only sleep paralysis" —',
  '  these collapse the mystery into a known mechanism. Don\'t.',
  '',
  '====================================================================',
  'STRUCTURE — Return ONLY valid JSON (no markdown fences, no commentary):',
  '====================================================================',
  '{',
  '  "title": "<4-9 words, title case, phenomenon-first newspaper headline>",',
  '  "answer_line": "<1-2 sentences, max 280 chars, hedge voice TL;DR>",',
  '  "hook": "<1 sentence, max 25 words, open-loop, third-person>",',
  '  "feed_hook": "<2 sentences, 30-55 words, for /discover feed>",',
  '  "pull_quote": "<1 sentence, max 20 words, screenshot-worthy, third-person>",',
  '  "analysis": "<2-3 paragraphs separated by \\\\n\\\\n, max 200 words total, the editorial narrative>",',
  '  "credibility_signal": "<1 phrase, max 8 words>",',
  '  "frames": [{"label": "<2-5 word feature/pattern name>", "body": "<2-4 sentences, ~40-80 words>"}],',
  '  "open_questions": ["<1-3 inquiry-voice questions, 10-20 words each>"],',
  '  "similar_phenomena": ["<2-3 related phenomenon names>"],',
  '  "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful",',
  '  "suggested_category": "ufos_aliens|cryptids|ghosts_hauntings|psychic_phenomena|consciousness_practices|psychological_experiences|perception_sensory|religion_mythology|esoteric_practices",',
  '  "discovery_tags": ["<3-6 plain-language tags for user-facing discovery>"],',
  '  "witness_profile": {',
  '    "gender": "male|female|nonbinary|unspecified",',
  '    "age_range": "child|teen|18-29|30-49|50-69|70+|unspecified",',
  '    "occupation_category": "<broad category or unspecified>",',
  '    "state_at_event": "awake_alert|meditation|drowsy_falling_asleep|sleeping|driving|physical_activity|intoxicated|unspecified",',
  '    "with_others": true | false | null,',
  '    "prior_similar_experience": true | false | null,',
  '    "confidence": 0.0-1.0',
  '  }',
  '}',
  '',
  '====================================================================',
  'TITLE RULES:',
  '====================================================================',
  '- 4-9 words, title case. Lead with the phenomenon, action, or specific',
  '  concrete detail. NOT with a role noun.',
  '- BANNED LEAD-INS: any title starting with "Witness Reports X",',
  '  "Researcher Struggles With X", "Seeker Pursues X", "Medium Reports X",',
  '  "Practitioner Describes X", etc.',
  '- Name the most distinctive concrete element from the report.',
  '- No clickbait, exclamation marks, ellipses, quotation marks, colons.',
  '- Place names ARE allowed when concrete and present in the source.',
  '- GOOD: "Pale Crawler Appears at Bedroom Window"',
  '- BAD: "Witness Reports Pale Crawler at Window"',
  '',
  '====================================================================',
  'ANSWER_LINE RULES:',
  '====================================================================',
  '- 1-2 sentences, max 280 characters, ~35-45 words.',
  '- Lead with: phenomenon type, distinctive detail, when, where, who,',
  '  notable sequel — in that priority order.',
  '- Hedge voice: "the source describes…", "A 19-year-old reports…".',
  '- INTENSITY DISCIPLINE — match the source\'s register exactly. Plain',
  '  becomes plain. Vivid stays vivid. Never escalate.',
  '',
  '====================================================================',
  'HOOK (inline on report page) RULES:',
  '====================================================================',
  '- 1 sentence, max 25 words. Present tense.',
  '- Start with the most unusual, specific element. Create an open loop.',
  '- Never start with "A witness" or "In [year]".',
  '- THIRD-PERSON ONLY.',
  '',
  '====================================================================',
  'FEED_HOOK (for /discover) RULES:',
  '====================================================================',
  '- Exactly 2 sentences, 30-55 words.',
  '- Sentence 1: identification + event (phenomenon type, who/where/when).',
  '- Sentence 2: the single most striking detail or unresolved tension',
  '  from the source. The thing that makes a scroller tap.',
  '- BANNED WORDS in feed_hook: mysterious, unexplained, shocking, terrifying,',
  '  eerie, chilling, haunting, bizarre, strange, peculiar.',
  '- BANNED PATTERNS in feed_hook: rhetorical questions, "This report…",',
  '  "What if…", "Could this be…".',
  '- THIRD-PERSON ONLY.',
  '',
  '====================================================================',
  'PULL_QUOTE RULES (CRITICAL — renders as a hero blockquote on the page):',
  '====================================================================',
  '- 1 sentence, max 20 words.',
  '- An ORIGINAL editorial line. Your analytical insight, NOT a witness quote.',
  '- THIRD-PERSON ONLY (V10.7.F). NEVER first-person pronouns.',
  '- Frame as an analyst\'s observation about the evidence, patterns, or',
  '  implications. Specific > general. Evocative > explanatory.',
  '- MUST include at least one concrete sensory or physical detail.',
  '- Must work as a complete thought with zero context — screenshot-worthy.',
  '- GOOD: "The terrain alone rules out human-speed movement at that distance."',
  '- BAD: "I couldn\'t believe what I was seeing." (first-person, forbidden)',
  '',
  '====================================================================',
  'ANALYSIS (narrative body) RULES:',
  '====================================================================',
  '- 2-3 short paragraphs separated by \\n\\n. Max 200 words total.',
  '- The narrative IS the page body, NOT a summary.',
  '- Suggested beat sequence: SETUP (where/what doing) → THE EXPERIENCE',
  '  (anomaly, sensory details) → REACTION + AFTERMATH (response, traces) →',
  '  CONTEXT (optional, only if source supports).',
  '- Lead with a grounding sensory anchor. NOT a metadata inventory.',
  '- Capture specific observational details: heights, durations, distances,',
  '  sounds, colors, behaviors, smells — preserve as source recorded them.',
  '- THIRD-PERSON throughout. May use "they/them/their" when gender unset.',
  '',
  '====================================================================',
  'FRAMES (CRITICAL — read carefully, this is where AI usually fails):',
  '====================================================================',
  'Frames are NOT hypotheses. Frames are NOT scientific explanations. Frames',
  'are NOT "this is what really happened" candidates. Paradocs\'s entire',
  'editorial stance rejects reducing experiences to known mechanisms.',
  '',
  'A frame is a NOTABLE FEATURE, PATTERN, OR RECURRING MOTIF surfaced from',
  'the report itself — something a careful reader would point at when',
  'discussing the account. The reader should come away with a richer view',
  'of what was IN the report, not a checklist of possible mundane causes.',
  '',
  'BANNED FRAME LABELS (do not produce any frame whose label matches these',
  'shapes — they collapse the experience into a reductive scientific frame):',
  '  - Anything ending in "Hypothesis"',
  '  - Anything ending in "Effect" (Ideomotor Effect, Priming Effect, etc.)',
  '  - Anything starting with "Cognitive" / "Psychological"',
  '  - Anything containing "Bias" / "Hallucination" / "Pareidolia"',
  '  - Anything containing "Construction" / "Confabulation"',
  '  - "Sleep Paralysis Neurology" / "DMT Pharmacology" / similar',
  '    reductive-mechanism labels.',
  '',
  'GOOD FRAME LABELS (descriptive features — these are what we want):',
  '  - "The Recurring Image"  — the visual/element that repeats',
  '  - "The Witness\'s Protocol"  — what the witness did in response',
  '  - "The Threshold Moment"  — when the experience pivoted',
  '  - "The Physical Aftermath"  — bodily traces that remained',
  '  - "The Soundscape"  — acoustic details that anchor the account',
  '  - "Pattern Across Cases"  — connections to other archetypes (NDE,',
  '    OBE, hat-man, shadow figures) WITHOUT claiming the connection',
  '    explains the experience',
  '  - "The Witness\'s Frame"  — how the witness themselves interpreted it',
  '',
  'FRAME BODY:',
  '- 2-4 sentences, 40-80 words each.',
  '- Describe what is IN the feature/pattern, using language drawn from',
  '  the source.',
  '- "Pattern Across Cases" frames may reference broader archetypes',
  '  (e.g., "Shadow figures with red eyes recur across both NDE accounts',
  '  and sleep-paralysis reports — features the witness here describes',
  '  closely match those motifs"). NEVER assert this means the witness',
  '  was "really" experiencing one of those things. Frame as resonance,',
  '  not explanation.',
  '- Do NOT use frames to adjudicate between possibilities. Surface the',
  '  feature; let the reader weigh.',
  '- 2-3 frames per report.',
  '',
  '====================================================================',
  'OPEN_QUESTIONS RULES:',
  '====================================================================',
  '- 1-3 questions. Inquiry voice, not skeptic voice.',
  '- Each question, 10-20 words.',
  '- Frame as "What would help us understand this report better?" Not as',
  '  "Was this real?" or "How can we explain this?" Open the inquiry; do',
  '  not close it.',
  '',
  '====================================================================',
  'WITNESS_PROFILE RULES:',
  '====================================================================',
  '- Infer ONLY from what the source text states. Default to "unspecified"',
  '  when the source is silent.',
  '- gender: only "male"/"female"/"nonbinary" if source EXPLICITLY states it.',
  '  First-person account does NOT establish gender. First names do NOT',
  '  establish gender. Default "unspecified".',
  '- age_range: child (≤12), teen (13-17), 18-29, 30-49, 50-69, 70+,',
  '  unspecified. Match the source\'s precision; if the source says "I was',
  '  in my 20s", choose 18-29.',
  '- state_at_event: what the witness was doing physically/mentally at the',
  '  moment of the experience. "awake_alert" is the default for daytime',
  '  experiences with no other state clue.',
  '- confidence: 0.0-1.0. Single first-person body with most fields',
  '  inferred → ~0.6. Detailed source with explicit demographics → ~0.85.',
  '',
  'Return ONLY the JSON. No markdown fences. No commentary before or after.',
].join('\n')

// ─────────────────────────────────────────────────────────────────────
// USER PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────

function buildConsolidatedUserPrompt(report: any): string {
  var parts: string[] = []
  if (report.title) parts.push('Original source title: ' + report.title)
  if (report.category) parts.push('Pre-assigned category: ' + report.category)
  if (report.location_name) parts.push('Location (if any): ' + report.location_name)
  if (report.country) parts.push('Country: ' + report.country)
  if (report.state_province) parts.push('State/Province: ' + report.state_province)
  if (report.city) parts.push('City: ' + report.city)
  if (report.event_date) parts.push('Event date (if any): ' + report.event_date)
  if (report.source_type) parts.push('Source type: ' + report.source_type)
  if (report.source_label) parts.push('Source label: ' + report.source_label)
  parts.push('')
  parts.push('FULL SOURCE TEXT (PII pre-redacted):')
  parts.push((report.description || '').substring(0, 5000))
  return parts.join('\n')
}

// ─────────────────────────────────────────────────────────────────────
// HAIKU API CALL
// ─────────────────────────────────────────────────────────────────────

interface ConsolidatedCallResult {
  parsed: any | null
  rawText: string | null
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

async function callHaikuConsolidated(
  apiKey: string,
  userPrompt: string,
): Promise<ConsolidatedCallResult> {
  var controller = new AbortController()
  var timeoutId = setTimeout(function () { controller.abort() }, REQUEST_TIMEOUT_MS)

  try {
    var bodyObj = {
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: CONSOLIDATED_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
      temperature: TEMPERATURE,
    }

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!resp.ok) {
      var errText = await resp.text().catch(function () { return '' })
      console.error('[ConsolidatedAI] ' + resp.status + ' from ' + HAIKU_MODEL + ': ' + errText.substring(0, 400))
      return { parsed: null, rawText: null, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
    }

    var data = await resp.json()
    var inputTokens = (data.usage && data.usage.input_tokens) || 0
    var outputTokens = (data.usage && data.usage.output_tokens) || 0
    var cacheW = (data.usage && data.usage.cache_creation_input_tokens) || 0
    var cacheR = (data.usage && data.usage.cache_read_input_tokens) || 0

    var costUsd =
      (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
      (cacheW / 1_000_000) * HAIKU_INPUT_USD_PER_M * 1.25 +
      (cacheR / 1_000_000) * HAIKU_INPUT_USD_PER_M * 0.10 +
      (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M

    var rawText = (data.content && data.content[0] && data.content[0].text) || null
    var parsed: any = null
    if (rawText) {
      try {
        var cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        var jsonStart = cleaned.indexOf('{')
        var jsonEnd = cleaned.lastIndexOf('}')
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1))
        }
      } catch (parseErr: any) {
        console.warn('[ConsolidatedAI] JSON parse failed: ' + (parseErr.message || parseErr))
      }
    }

    console.log(
      '[ConsolidatedAI] ' + HAIKU_MODEL +
      ' in=' + inputTokens + ' out=' + outputTokens +
      ' cache_w=' + cacheW + ' cache_r=' + cacheR +
      ' cost=$' + costUsd.toFixed(5) +
      ' parsed=' + (!!parsed),
    )

    return {
      parsed: parsed,
      rawText: rawText,
      costUsd: costUsd,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      cacheCreationTokens: cacheW,
      cacheReadTokens: cacheR,
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.error('[ConsolidatedAI] Timeout (' + REQUEST_TIMEOUT_MS + 'ms)')
    } else {
      console.error('[ConsolidatedAI] Network error: ' + (err.message || err))
    }
    return { parsed: null, rawText: null, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
  }
}

// ─────────────────────────────────────────────────────────────────────
// COST LOGGING (reuses paradocs_narrative_cost_log table for now)
// ─────────────────────────────────────────────────────────────────────

async function logConsolidatedCost(
  supabase: any,
  reportId: string | null,
  result: ConsolidatedCallResult,
  status: 'completed' | 'failed' | 'parse_failed',
): Promise<void> {
  try {
    await supabase.from('paradocs_narrative_cost_log').insert({
      report_id: reportId,
      model: HAIKU_MODEL + ' (consolidated)',
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: result.costUsd,
      status: status === 'completed' ? 'completed' : 'failed',
      reason: status === 'completed' ? null : status,
    })
  } catch (_e) {
    /* non-fatal */
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────

export interface GenerateConsolidatedAIResult {
  success: boolean
  cost: number
  parsed?: any
  error?: string
}

/**
 * Generate and save all AI-generated fields for a report in a single
 * Haiku call. Replaces the multi-call sequence
 * (paradocs-analysis + feed-hook + answer-line + witness-profile +
 * compelling-title) with one consolidated call.
 *
 * Writes to the same DB columns the multi-call services write:
 *   - reports.title (compelling title)
 *   - reports.feed_hook
 *   - reports.answer_line
 *   - reports.paradocs_narrative
 *   - reports.paradocs_assessment (JSONB containing pull_quote, frames,
 *     open_questions, similar_phenomena, emotional_tone, suggested_category,
 *     discovery_tags, credibility_signal)
 *   - reports.witness_profile (JSONB)
 *   - reports.paradocs_analysis_generated_at
 *   - reports.paradocs_analysis_model
 *
 * On parse failure: returns success=false, lets the engine's existing
 * demotion gate catch the report.
 */
export async function generateAndSaveConsolidatedAI(reportId: string): Promise<GenerateConsolidatedAIResult> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { success: false, cost: 0, error: 'ANTHROPIC_API_KEY missing' }
  }

  var supabase = createServerClient()
  var { data: report, error: fetchError } = await (supabase.from('reports') as any)
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, source_type, source_label, tags')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[ConsolidatedAI] Report not found: ' + reportId + ' err: ' + (fetchError ? fetchError.message : 'no data'))
    return { success: false, cost: 0, error: 'report not found' }
  }

  var userPrompt = buildConsolidatedUserPrompt(report)
  console.log('[ConsolidatedAI] Generating for ' + reportId + ' (' + ((report as any).title || 'untitled').substring(0, 40) + ')')

  var result = await callHaikuConsolidated(apiKey, userPrompt)

  if (!result.parsed) {
    await logConsolidatedCost(supabase, reportId, result, 'parse_failed')
    console.warn('[ConsolidatedAI] Parse failed for ' + reportId + '. Raw (first 300): ' + (result.rawText || '').substring(0, 300))
    return { success: false, cost: result.costUsd, error: 'parse_failed' }
  }

  var p = result.parsed
  await logConsolidatedCost(supabase, reportId, result, 'completed')

  // Build the assessment JSONB (matches existing paradocs_assessment shape)
  var assessmentData: Record<string, any> = {
    pull_quote: p.pull_quote || null,
    credibility_signal: p.credibility_signal || null,
    frames: Array.isArray(p.frames) ? p.frames : [],
    open_questions: Array.isArray(p.open_questions) ? p.open_questions : [],
    similar_phenomena: Array.isArray(p.similar_phenomena) ? p.similar_phenomena : [],
    emotional_tone: p.emotional_tone || null,
    suggested_category: p.suggested_category || null,
    discovery_tags: Array.isArray(p.discovery_tags) ? p.discovery_tags : [],
  }
  if (p.suggested_category && (report as any).category && p.suggested_category !== (report as any).category) {
    assessmentData.category_mismatch = true
  }

  // Build witness profile JSONB
  var wp = p.witness_profile || {}
  var witnessProfile: Record<string, any> = {
    gender: wp.gender || 'unspecified',
    age_range: wp.age_range || 'unspecified',
    occupation_category: wp.occupation_category || 'unspecified',
    state_at_event: wp.state_at_event || 'unspecified',
    with_others: wp.with_others === undefined ? null : wp.with_others,
    prior_similar_experience: wp.prior_similar_experience === undefined ? null : wp.prior_similar_experience,
    confidence: typeof wp.confidence === 'number' ? wp.confidence : 0.5,
  }

  // Build the update payload — same columns the multi-call services
  // would have written. The engine's V11.8 demotion gate then reads
  // paradocs_narrative + paradocs_assessment.pull_quote and demotes
  // if either is null/empty.
  var updateData: Record<string, any> = {
    title: p.title || (report as any).title,
    feed_hook: p.feed_hook || null,
    answer_line: p.answer_line || null,
    paradocs_narrative: p.analysis || null,
    paradocs_assessment: assessmentData,
    witness_profile: witnessProfile,
    paradocs_analysis_generated_at: new Date().toISOString(),
    paradocs_analysis_model: HAIKU_MODEL + ' (consolidated)',
    feed_hook_generated_at: new Date().toISOString(),
  }

  var { error: updateError } = await (supabase.from('reports') as any)
    .update(updateData)
    .eq('id', reportId)

  if (updateError) {
    console.error('[ConsolidatedAI] DB save error for ' + reportId + ': ' + updateError.message)
    return { success: false, cost: result.costUsd, error: 'db_save_failed: ' + updateError.message }
  }

  console.log('[ConsolidatedAI] Saved all fields for ' + reportId + ' (title: ' + (p.title || '').substring(0, 40) + '...)')
  return { success: true, cost: result.costUsd, parsed: p }
}

/**
 * Helper: returns true if env says we should use the consolidated path.
 */
export function isConsolidatedAIEnabled(): boolean {
  var raw = process.env.USE_CONSOLIDATED_AI
  if (!raw) return false
  return String(raw).toLowerCase() === 'true' || raw === '1'
}

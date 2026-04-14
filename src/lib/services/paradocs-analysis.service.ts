/**
 * Paradocs Analysis Generation Service — Hybrid Architecture
 *
 * Single API call produces 5 structured fields per report:
 *   1. hook         — 1 sentence, max 25 words, present tense, open loop (stored as feed_hook)
 *   2. analysis     — 4-6 sentences, max 120 words, evidence-first editorial context
 *   3. pull_quote   — 1 sentence, max 20 words, the screenshot-worthy line
 *   4. credibility_signal — 1 phrase, max 8 words, evidence-based honesty
 *   5. assessment   — structured JSON (mundane explanations, similar phenomena)
 *
 * Storage mapping (no schema changes needed):
 *   hook             → reports.feed_hook
 *   analysis         → reports.paradocs_narrative
 *   pull_quote       → reports.paradocs_assessment.pull_quote
 *   credibility_signal → reports.paradocs_assessment.credibility_signal
 *   assessment data  → reports.paradocs_assessment (mundane_explanations, similar_phenomena, etc.)
 *
 * Preserves: robust callClaude with timeouts/retries/backoff, anti-AI voice rules,
 * inter-report pacing, SWC compatibility (var, function(){}, string concat).
 */

import { createServerClient } from '../supabase'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

// ============================================
// Types
// ============================================

interface ParadocsAnalysisResult {
  hook: string
  analysis: string
  pull_quote: string
  credibility_signal: string
  mundane_explanations: Array<{
    explanation: string
    likelihood: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  similar_phenomena: string[]
  emotional_tone?: string
}

// Legacy type kept for backward compatibility with ParadocsAnalysisBox
export interface ParadocsAssessment {
  credibility_signal?: string
  pull_quote?: string
  mundane_explanations?: Array<{
    explanation: string
    likelihood: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  similar_phenomena?: string[]
  emotional_tone?: string
  // Legacy fields — still readable from old reports
  credibility_score?: number
  credibility_reasoning?: string
  credibility_factors?: Array<{
    name: string
    impact: 'positive' | 'negative' | 'neutral'
    description: string
  }>
}

// ============================================
// Voice Rules
// ============================================

var VOICE_RULES = '\n\nWRITING STYLE (CRITICAL — your output must not read as AI-generated):\n'
  + '- NEVER use em dashes. Use commas, periods, or semicolons instead.\n'
  + '- NEVER use: "It is worth noting", "Notably", "Interestingly", '
  + '"It bears mentioning", "One cannot help but notice", "It should be noted", '
  + '"Perhaps most striking", "What makes this particularly", "This raises questions", '
  + '"It remains to be seen", "Only time will tell", "At the end of the day".\n'
  + '- NEVER start a sentence with "While" as a hedging conjunction.\n'
  + '- NEVER use "delve", "tapestry", "multifaceted", "landscape" (metaphorical), "nuanced", "robust".\n'
  + '- NEVER use "a testament to" or "speaks to the broader".\n'
  + '- Keep sentences short and direct. Prefer 10-20 words. No sentence over 30 words.\n'
  + '- Use periods more than commas. Break long thoughts into two sentences.\n'
  + '- Write like a seasoned beat reporter. Declarative. Concrete. No throat-clearing.\n'
  + '- Vary sentence openings. Never start three consecutive sentences the same way.\n'
  + '- Use "but" and "and" to start sentences when natural. Use contractions.\n'
  + '- Prefer active voice. Name the actor.\n'
  + '- If you catch yourself hedging, cut the hedge and state the fact.\n'

// ============================================
// System Prompt — Single unified call
// ============================================

var SYSTEM_PROMPT = 'You are the editorial intelligence behind Paradocs, the world\'s most credible '
  + 'paranormal research platform. Your job is to write the Paradocs Analysis for a submitted report.\n\n'
  + 'EPISTEMIC STANCE (read this before anything else):\n'
  + '- Paradocs treats anecdotal reports as primary data. The platform exists to surface patterns '
  + 'across thousands of first-hand accounts so that emergent structures can be observed, including '
  + 'ones that classical science does not yet fully model.\n'
  + '- Hold multiple frames simultaneously. Do NOT reflexively privilege a materialist / reductive '
  + 'interpretation over a consciousness-primacy interpretation, or vice versa. Both are valid lenses.\n'
  + '- Genuinely open-minded means: do not write sentences that treat mind-matter interaction, '
  + 'synchronicity, precognition, consciousness-at-distance, observer effects, or related phenomena '
  + 'as prima facie implausible. Those framings are hypotheses Paradocs is actively investigating, '
  + 'not fringe claims to be dismissed. Equally: do not assume them.\n'
  + '- Avoid prose that collapses the mystery by implying "the witness expected X, so they '
  + 'perceived X, end of story." Expectation MAY shape perception, and expectation MAY also be a '
  + 'genuine precursor to anomalous experience. Report both possibilities when relevant.\n'
  + '- When the evidence is thin, say so. When the experience is striking, say so. Do not editorialize '
  + 'about whether the event "really happened." Analyze what the report contains and what it suggests.\n\n'
  + 'VOICE:\n'
  + '- Evidence-first. Never credulous, never dismissive.\n'
  + '- Tone of a seasoned investigator who has seen a lot and is genuinely intrigued by this one.\n'
  + '- Present tense for immediacy. Active voice always.\n'
  + VOICE_RULES
  + '\nSTRUCTURE — Return ONLY valid JSON (no markdown fences, no commentary):\n'
  + '{\n'
  + '  "hook": "<1 sentence, max 25 words, present tense, open loop>",\n'
  + '  "analysis": "<4-6 sentences, max 120 words, evidence-first editorial context>",\n'
  + '  "pull_quote": "<1 sentence, max 20 words, the screenshot-worthy line>",\n'
  + '  "credibility_signal": "<1 phrase, max 8 words>",\n'
  + '  "mundane_explanations": [{"explanation": "...", "likelihood": "high|medium|low", "reasoning": "..."}],\n'
  + '  "similar_phenomena": ["phenomenon 1", "phenomenon 2"],\n'
  + '  "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful"\n'
  + '}\n\n'
  + 'HOOK RULES:\n'
  + '- Start with the most unusual, specific, or inexplicable element.\n'
  + '- Never start with "A witness" or "In [year]".\n'
  + '- Use specificity: durations, behaviors, sounds, number of witnesses, physical details.\n'
  + '- Create an open loop the reader must resolve by reading further.\n'
  + '- NEVER include precise clock times (e.g. "at 21:19"). Vague times are fine ("after midnight").\n\n'
  + 'ANALYSIS RULES:\n'
  + '- Lead with what is unusual about this report relative to its category.\n'
  + '- CAPTURE SPECIFIC OBSERVATIONAL DETAILS: height estimates, build, coloring, limb proportions, '
  + 'gait or movement patterns, sounds, smells, behavioral responses, distance, duration of sighting. '
  + 'These physical and sensory details are the most valuable data in any report. If the report '
  + 'describes a creature or object, your analysis MUST reference the key physical characteristics reported.\n'
  + '- When a follow-up investigation is included, reference its findings: track measurements, '
  + 'physical evidence found, terrain assessment, investigator conclusions.\n'
  + '- Place it in broader context: historical parallels, geographic patterns, similar accounts.\n'
  + '- Reference pattern context when available (e.g. "This corridor has produced 12 similar reports since 2019").\n'
  + '- If a single unverified account, say so honestly — but do NOT imply "single unverified" means '
  + '"probably didn\'t happen." Unverified just means no corroborating evidence surfaced yet.\n'
  + '- BANNED PHRASES — do not use ANY variation of these in the analysis field:\n'
  + '  * "conflates expectation with observation" / "conflates X with Y" / "conflating"\n'
  + '  * "the witness anticipated X and interpreted Y as confirmation"\n'
  + '  * "expectation-setting" / "pattern-seeking" / "confirmation bias" / "apophenia"\n'
  + '  * "priming effect" / "cognitive priming" / "observer bias"\n'
  + '  * "causal attribution difficult" / "difficult to disentangle expectation from experience"\n'
  + '  These phrasings all assume that expectation cannot itself be a causal precursor to anomalous '
  + 'experience. Paradocs rejects that assumption as the default frame. If you want to discuss the '
  + 'relationship between intention and outcome, frame it neutrally (e.g. "The witness had spent months '
  + 'attempting telepathic contact; the sighting followed") and let the correlation stand on its own.\n'
  + '- NEVER describe a witness\'s preparation, research, or intention as contaminating the data. '
  + 'Intention preceding experience is itself a data point Paradocs tracks across reports.\n'
  + '- Never use: "bizarre", "terrifying", "shocking", "incredible", "unbelievable".\n'
  + '- Never use: "alleged", "claimed", "purported". Treat report content as data.\n'
  + '- NEVER reproduce or closely paraphrase the source text. Write original analysis.\n'
  + '- Category tone:\n'
  + '  - UFOs/UAPs: Aerial-anomaly framing. Flight characteristics, instrumentation, witness response. '
  + 'Also note psi-adjacent patterns (contact-synchronicity, remote-viewing pre-cognition) when the '
  + 'report contains them.\n'
  + '  - Cryptids: Natural-history framing AND folk / ethnographic pattern framing. Habitat, behavioral '
  + 'patterns, witness credibility, historical recurrence on the same land. Consider interdimensional or '
  + 'consciousness-based framings when the details resist pure zoological interpretation (e.g. cloaking, '
  + 'reality-distortion, vanishing).\n'
  + '  - Ghosts/Hauntings: Investigative + parapsychological. Property history, recurring patterns, '
  + 'experiencer state, field effects (EMF, temperature, animal response).\n'
  + '  - NDEs / OBEs / Consciousness: Phenomenological, cross-cultural. Common elements (tunnel, light, '
  + 'life-review, deceased-encounter). Hold BOTH a neurophysiological frame (hypoxia, DMT, REM intrusion) '
  + 'AND a consciousness-survives frame as working hypotheses. Do not privilege one.\n'
  + '  - Psychic / Precognition: Pattern-first. Frequency across populations, synchronicity framing, '
  + 'base-rate caveats. Do not dismiss; do not oversell.\n\n'
  + 'PULL QUOTE RULES:\n'
  + '- Write an ORIGINAL editorial line. This is YOUR analytical insight, not a witness quote.\n'
  + '- CRITICAL: Do NOT rephrase, restructure, or echo the witness\'s own words. If the witness '
  + 'said "A man couldn\'t have covered that much ground in the dark" you CANNOT write a similar sentence. '
  + 'Instead write something like "The terrain alone rules out human-speed movement at that distance."\n'
  + '- Frame it as an analyst\'s observation about the evidence, patterns, or implications.\n'
  + '- Must work as a complete thought with zero context.\n'
  + '- Should be the line someone would screenshot.\n'
  + '- Specific > general. Evocative > explanatory.\n'
  + '- Must be grammatically complete and polished. No fragments, no typos.\n\n'
  + 'CREDIBILITY SIGNAL RULES:\n'
  + '- Evidence-based only: corroboration count, evidence type, source quality, witness count.\n'
  + '- Honest when thin: "Single witness, unverified" is correct.\n'
  + '- Never fabricate corroboration.\n'
  + '- Examples: "Four military witnesses, photographic evidence", "Single anonymous account", '
  + '"Multiple witnesses, no physical evidence", "Official report with radar data".\n\n'
  + 'ALTERNATIVE EXPLANATIONS (field name: "mundane_explanations"):\n'
  + '- Provide 1-3. They do NOT all have to be reductive/materialist — a range of framings is the goal.\n'
  + '- Mix classical explanations (misidentification, sleep paralysis, pareidolia, hoax, coincidence, '
  + 'weather, known aircraft, psychological state) with non-classical ones when relevant '
  + '(thought-form manifestation, observer-influenced synchronicity, consciousness-at-distance, '
  + 'precognitive resonance). Both are alternative framings worth showing the reader.\n'
  + '- Be specific to THIS report, grounded in its actual details. Generic labels are not acceptable.\n'
  + '- LIKELIHOOD LABELING — BE CONSERVATIVE:\n'
  + '  * "high" is RARE. Only use it when the report itself contains specific, concrete evidence that '
  + 'directly supports that explanation (e.g. witness mentions being half-asleep AND describes classic '
  + 'sleep-paralysis symptoms; or the "craft" is explicitly described as blinking navigation lights in '
  + 'standard aircraft configuration). "High" must clear a strong-evidence bar, not a hunch.\n'
  + '  * "medium" is the default when the explanation is plausible but not directly evidenced.\n'
  + '  * "low" when the explanation is worth listing for completeness but the report\'s details argue '
  + 'against it.\n'
  + '  * If you are tempted to write "high" because the explanation "usually fits cases like this," '
  + 'downgrade to "medium." Base rates across a category are not specific evidence in THIS report.\n\n'
  + 'SIMILAR PHENOMENA:\n'
  + '- Name real paranormal phenomena categories (e.g. "shadow people", "orbs", "missing time").\n\n'
  + 'GLOBAL RULE: NEVER copy, quote, paraphrase, or restructure ANY sentence from the witness text. '
  + 'Do not use the witness\'s phrasing even with minor word changes. Every sentence you write must '
  + 'be composed from scratch as original editorial analysis. If you find yourself echoing the witness\'s '
  + 'language, stop and rewrite from an analytical perspective instead.\n\n'
  + 'Return ONLY the JSON object. No wrapping text.'

// ============================================
// Prompt Builder
// ============================================

// Count words in a string (simple whitespace split).
function countWords(text: string): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(function(w) { return w.length > 0 }).length
}

// Determine the max allowed analysis word count for a given source description.
// Rule: analysis must NEVER be longer than the source material itself.
// For typical reports, we cap at 120 words (our default structure).
// For short source material, cap tighter so we don't over-editorialize.
function computeAnalysisWordBudget(sourceText: string): number {
  var sourceWords = countWords(sourceText)
  if (sourceWords === 0) return 60 // Fallback minimum
  // Never exceed source length. For safety, allow up to 90% of source or 120 words,
  // whichever is smaller. Minimum floor is 40 words so we can still form coherent analysis.
  var cap = Math.min(120, Math.floor(sourceWords * 0.9))
  return Math.max(40, cap)
}

// Trim an analysis string to a maximum word count without breaking mid-sentence.
function trimAnalysisToWords(analysis: string, maxWords: number): string {
  if (!analysis) return analysis
  var words = analysis.trim().split(/\s+/)
  if (words.length <= maxWords) return analysis
  // Find the last sentence ending within the budget
  var truncated = words.slice(0, maxWords).join(' ')
  var lastPeriod = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  )
  if (lastPeriod > truncated.length * 0.5) {
    return truncated.substring(0, lastPeriod + 1)
  }
  return truncated + '.'
}

function buildUserPrompt(report: any, analysisWordBudget: number): string {
  var parts: string[] = []
  parts.push('Generate a Paradocs Analysis for the following report.\n')
  parts.push('LENGTH LIMIT: Your "analysis" field must be AT MOST ' + analysisWordBudget + ' words. '
    + 'This is a hard cap. Do not exceed it under any circumstances. '
    + 'If the source material is brief, keep your analysis proportionally brief.')

  if (report.source_label || report.source_type) parts.push('SOURCE: ' + (report.source_label || report.source_type))
  if (report.category) parts.push('CATEGORY: ' + report.category)
  if (report.event_date) parts.push('DATE: ' + report.event_date)

  // Location line
  var locParts: string[] = []
  if (report.city) locParts.push(report.city)
  if (report.state_province) locParts.push(report.state_province)
  if (report.country && report.country !== 'United States') locParts.push(report.country)
  if (locParts.length > 0) {
    var locStr = 'LOCATION: ' + locParts.join(', ')
    if (report.latitude && report.longitude) {
      locStr = locStr + ' (' + report.latitude + ', ' + report.longitude + ')'
    }
    parts.push(locStr)
  }

  // Evidence on file
  var evidenceParts: string[] = []
  if (report.has_photo_video) evidenceParts.push('photos/video referenced')
  if (report.has_official_report) evidenceParts.push('official report filed')
  if (report.witness_count && report.witness_count > 1) evidenceParts.push(report.witness_count + ' witnesses')
  parts.push('EVIDENCE ON FILE: ' + (evidenceParts.length > 0 ? evidenceParts.join(', ') : 'none'))

  // Full description — truncate at ~3000 chars for cost
  if (report.description) {
    var desc = report.description.length > 3000
      ? report.description.substring(0, 3000) + '...'
      : report.description
    parts.push('\nREPORT NARRATIVE:\n' + desc)
  } else if (report.summary) {
    parts.push('\nREPORT NARRATIVE:\n' + report.summary)
  }

  // Include metadata sections for richer analysis (follow-up investigation, environment, etc.)
  var meta = report.metadata || {}
  if (meta.followUpInvestigation) {
    var followUp = meta.followUpInvestigation.length > 2000
      ? meta.followUpInvestigation.substring(0, 2000) + '...'
      : meta.followUpInvestigation
    parts.push('\nFOLLOW-UP INVESTIGATION:\n' + followUp)
  }
  if (meta.environment) {
    parts.push('\nENVIRONMENT: ' + meta.environment)
  }
  if (meta.timeAndConditions) {
    parts.push('CONDITIONS: ' + meta.timeAndConditions)
  }
  if (meta.bfroClass) {
    parts.push('CLASSIFICATION: ' + meta.bfroClass)
  }

  parts.push('\nReturn only the JSON object.')
  return parts.join('\n')
}

// ============================================
// API Calling (preserved — robust with timeouts/retries/backoff)
// ============================================

var REQUEST_TIMEOUT_MS = 45000
var MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature?: number
): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ParadocsAnalysis] No ANTHROPIC_API_KEY found')
    return null
  }

  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  for (var m = 0; m < models.length; m++) {
    var modelName = models[m]

    for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        var controller = new AbortController()
        var timeoutId = setTimeout(function() { controller.abort() }, REQUEST_TIMEOUT_MS)

        var bodyObj: Record<string, any> = {
          model: modelName,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        }
        if (temperature != null) {
          bodyObj.temperature = temperature
        }

        var resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(bodyObj),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (resp.status === 429) {
          var retryAfter = resp.headers.get('retry-after')
          var backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (Math.pow(2, attempt + 1) * 1000)
          console.warn('[ParadocsAnalysis] Rate limited (429) on ' + modelName + ', attempt ' + (attempt + 1) + '/' + MAX_RETRIES + ', backing off ' + backoffMs + 'ms')
          await sleep(backoffMs)
          continue
        }

        if (resp.status >= 500) {
          var errBody = await resp.text().catch(function() { return '(no body)' })
          var backoff5xx = Math.pow(2, attempt + 1) * 1000
          console.warn('[ParadocsAnalysis] Server error ' + resp.status + ' on ' + modelName + ', attempt ' + (attempt + 1) + '/' + MAX_RETRIES + '. Body: ' + errBody.substring(0, 200))
          await sleep(backoff5xx)
          continue
        }

        if (!resp.ok) {
          var errText = await resp.text().catch(function() { return '(no body)' })
          console.error('[ParadocsAnalysis] API error with ' + modelName + ': ' + resp.status + ' ' + errText.substring(0, 300))
          break
        }

        var data = await resp.json()
        if (data.content && data.content.length > 0 && data.content[0].text) {
          return data.content[0].text.trim()
        }

        console.warn('[ParadocsAnalysis] Empty response from ' + modelName)
        break

      } catch (err: any) {
        clearTimeout(timeoutId!)
        if (err.name === 'AbortError') {
          console.error('[ParadocsAnalysis] Timeout on ' + modelName + ', attempt ' + (attempt + 1))
        } else {
          console.error('[ParadocsAnalysis] Network error on ' + modelName + ', attempt ' + (attempt + 1) + ':', err.message || err)
        }
        if (attempt < MAX_RETRIES - 1) {
          await sleep(Math.pow(2, attempt + 1) * 1000)
          continue
        }
        break
      }
    }
  }

  console.error('[ParadocsAnalysis] All models and retries exhausted')
  return null
}

// ============================================
// Parsing
// ============================================

function parseAnalysisJson(text: string): ParadocsAnalysisResult | null {
  try {
    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    var jsonStart = cleaned.indexOf('{')
    var jsonEnd = cleaned.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return null

    var jsonStr = cleaned.substring(jsonStart, jsonEnd + 1)
    var parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (!parsed.hook || typeof parsed.hook !== 'string') return null
    if (!parsed.analysis || typeof parsed.analysis !== 'string') return null

    // Ensure defaults
    if (!parsed.pull_quote) parsed.pull_quote = ''
    if (!parsed.credibility_signal) parsed.credibility_signal = 'Unverified account'
    if (!Array.isArray(parsed.mundane_explanations)) parsed.mundane_explanations = []
    if (!Array.isArray(parsed.similar_phenomena)) parsed.similar_phenomena = []

    // Validate emotional_tone
    var validTones = ['frightening', 'awe_inspiring', 'ambiguous', 'clinical', 'unsettling', 'hopeful']
    if (parsed.emotional_tone && validTones.indexOf(parsed.emotional_tone) === -1) {
      delete parsed.emotional_tone
    }

    return parsed as ParadocsAnalysisResult
  } catch (err) {
    console.error('[ParadocsAnalysis] JSON parse failed:', err)
    return null
  }
}

// ============================================
// Core Generation
// ============================================

export async function generateParadocsAnalysis(reportId: string): Promise<ParadocsAnalysisResult | null> {
  var supabase = createServerClient()

  var { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, credibility, source_type, source_label, tags, latitude, longitude, has_photo_video, has_official_report, witness_count, metadata')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[ParadocsAnalysis] Report not found: ' + reportId)
    return null
  }

  // Compute per-report length budget so analysis never exceeds source length.
  var sourceText = (report as any).description || (report as any).summary || ''
  var analysisWordBudget = computeAnalysisWordBudget(sourceText)
  console.log('[ParadocsAnalysis] Report ' + reportId + ' sourceWords=' + countWords(sourceText) + ', analysisBudget=' + analysisWordBudget + ' words')

  var userPrompt = buildUserPrompt(report, analysisWordBudget)

  console.log('[ParadocsAnalysis] Generating for: ' + reportId + ' (' + ((report as any).title || 'untitled').substring(0, 40) + ')')

  // Single call, temperature 0.4 for consistent quality
  // 1024 tokens needed — 500 was causing truncation mid-JSON for detailed reports
  var response = await callClaude(SYSTEM_PROMPT, userPrompt, 1024, 0.4)

  if (response) {
    var result = parseAnalysisJson(response)
    if (result) {
      // Enforce hard cap post-hoc in case the model overran the budget.
      var trimmedAnalysis = trimAnalysisToWords(result.analysis, analysisWordBudget)
      if (trimmedAnalysis !== result.analysis) {
        console.log('[ParadocsAnalysis] Trimmed analysis from ' + countWords(result.analysis) + ' to ' + countWords(trimmedAnalysis) + ' words (budget: ' + analysisWordBudget + ')')
        result.analysis = trimmedAnalysis
      }
      console.log('[ParadocsAnalysis] Success for ' + reportId + ' (hook: ' + result.hook.length + ' chars, analysis: ' + result.analysis.length + ' chars)')
      return result
    }
    console.warn('[ParadocsAnalysis] Parse failed for ' + reportId + '. Raw: ' + response.substring(0, 300))
  } else {
    console.warn('[ParadocsAnalysis] API returned null for ' + reportId)
  }

  // Retry once with fresh call
  console.log('[ParadocsAnalysis] Retrying for ' + reportId)
  await sleep(2000)

  var retryResponse = await callClaude(SYSTEM_PROMPT, userPrompt, 500, 0.4)
  if (retryResponse) {
    var retryResult = parseAnalysisJson(retryResponse)
    if (retryResult) {
      var retryTrimmed = trimAnalysisToWords(retryResult.analysis, analysisWordBudget)
      if (retryTrimmed !== retryResult.analysis) {
        retryResult.analysis = retryTrimmed
      }
      console.log('[ParadocsAnalysis] Retry success for ' + reportId)
      return retryResult
    }
    console.warn('[ParadocsAnalysis] Retry parse failed for ' + reportId + '. Raw: ' + retryResponse.substring(0, 300))
  }

  console.error('[ParadocsAnalysis] COMPLETE FAILURE for ' + reportId)
  return null
}

/**
 * Generate and save Paradocs Analysis for a single report.
 * Stores: hook → feed_hook, analysis → paradocs_narrative,
 * pull_quote + credibility_signal + assessment → paradocs_assessment.
 * Includes internal retry with backoff.
 */
export async function generateAndSaveParadocsAnalysis(reportId: string): Promise<boolean> {
  var SAVE_RETRIES = 2
  var lastError: any = null

  for (var attempt = 0; attempt <= SAVE_RETRIES; attempt++) {
    if (attempt > 0) {
      var backoff = Math.pow(2, attempt) * 2000
      console.log('[ParadocsAnalysis] Save retry ' + (attempt + 1) + ' for ' + reportId + ' after ' + backoff + 'ms')
      await sleep(backoff)
    }

    try {
      var result = await generateParadocsAnalysis(reportId)

      if (!result) {
        lastError = 'generation returned null'
        continue
      }

      var supabase = createServerClient()

      // Build the assessment object (stored as JSONB)
      var assessmentData: Record<string, any> = {
        pull_quote: result.pull_quote,
        credibility_signal: result.credibility_signal,
        mundane_explanations: result.mundane_explanations,
        similar_phenomena: result.similar_phenomena
      }
      if (result.emotional_tone) {
        assessmentData.emotional_tone = result.emotional_tone
      }

      var updateData: Record<string, any> = {
        feed_hook: result.hook,
        feed_hook_generated_at: new Date().toISOString(),
        paradocs_narrative: result.analysis,
        paradocs_assessment: assessmentData,
        paradocs_analysis_generated_at: new Date().toISOString(),
        paradocs_analysis_model: ANTHROPIC_MODEL
      }

      if (result.emotional_tone) {
        updateData.emotional_tone = result.emotional_tone
      }

      var { error: updateError } = await (supabase
        .from('reports') as any)
        .update(updateData)
        .eq('id', reportId)

      if (updateError) {
        console.error('[ParadocsAnalysis] DB save error for ' + reportId + ':', updateError.message)
        lastError = updateError.message
        continue
      }

      console.log('[ParadocsAnalysis] Saved for ' + reportId + ' (hook: ' + result.hook.substring(0, 50) + '...)')
      return true

    } catch (err: any) {
      console.error('[ParadocsAnalysis] Exception for ' + reportId + ':', err.message || err)
      lastError = err.message || 'unknown exception'
      continue
    }
  }

  console.error('[ParadocsAnalysis] FAILED after ' + (SAVE_RETRIES + 1) + ' attempts for ' + reportId + ': ' + lastError)
  return false
}

/**
 * Generate analysis for a batch of report IDs.
 */
export async function generateAnalysisBatch(
  reportIds: string[],
  options?: { delayMs?: number; batchSize?: number; force?: boolean }
): Promise<{ generated: number; skipped: number; failed: number; errors: string[] }> {
  var supabase = createServerClient()
  var delayMs = options?.delayMs || 200
  var batchSize = options?.batchSize || 15
  var force = options?.force || false
  var stats = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] }

  for (var i = 0; i < reportIds.length; i += batchSize) {
    var batch = reportIds.slice(i, i + batchSize)

    for (var j = 0; j < batch.length; j++) {
      var reportId = batch[j]

      if (!force) {
        var { data: existing } = await (supabase
          .from('reports') as any)
          .select('paradocs_narrative')
          .eq('id', reportId)
          .single()

        if (existing && existing.paradocs_narrative) {
          stats.skipped++
          continue
        }
      }

      try {
        var success = await generateAndSaveParadocsAnalysis(reportId)
        if (success) {
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
        await new Promise(function(resolve) { setTimeout(resolve, delayMs) })
      }
    }

    if (i + batchSize < reportIds.length) {
      await new Promise(function(resolve) { setTimeout(resolve, 2000) })
    }
  }

  return stats
}

export async function getParadocsAnalysisStats(): Promise<{
  total_approved: number
  with_narrative: number
  with_assessment: number
  without_analysis: number
  coverage_pct: number
}> {
  var supabase = createServerClient()

  var { count: totalApproved } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')

  var { count: withNarrative } = await (supabase
    .from('reports') as any)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .not('paradocs_narrative', 'is', null)

  var { count: withAssessment } = await (supabase
    .from('reports') as any)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .not('paradocs_assessment', 'is', null)

  var total = totalApproved || 0
  var narr = withNarrative || 0
  var assess = withAssessment || 0

  return {
    total_approved: total,
    with_narrative: narr,
    with_assessment: assess,
    without_analysis: total - narr,
    coverage_pct: total > 0 ? Math.round((narr / total) * 1000) / 10 : 0
  }
}

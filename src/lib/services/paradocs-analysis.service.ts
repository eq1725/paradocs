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
import { verifyAndAuditRewrite, PROMPT_VERSION } from '@/lib/ai/rewrite-pipeline'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

// B0.7 — Haiku 4.5 pricing per million tokens as of May 2026.
// Source: anthropic.com/pricing. Update when Anthropic publishes a
// price change; the rest of the cost-tracking machinery is constant.
var HAIKU_INPUT_USD_PER_M = 1.0
var HAIKU_OUTPUT_USD_PER_M = 5.0

// Daily spend ceiling for paradocs_narrative generation across ALL
// reports system-wide. When today's logged completed spend exceeds
// this, no further calls fire — the report still inserts but without
// narrative, and the next day's first ingestion pass picks up
// unnarrated reports first. Env var override for ops flexibility.
var DAILY_COST_CAP_USD = (function () {
  var raw = process.env.PARADOCS_HAIKU_DAILY_CAP
  if (!raw) return 50.0
  var n = parseFloat(raw)
  return isNaN(n) || n < 0 ? 50.0 : n
})()

/**
 * B0.7 — sum today's completed paradocs_narrative spend. Returns 0
 * if the cost-log table is missing (fail open — we'd rather burn
 * a little money than block ingestion when the table isn't applied).
 */
async function getTodaysParadocsSpend(supabase: any): Promise<number> {
  try {
    var todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    var result = await supabase
      .from('paradocs_narrative_cost_log')
      .select('cost_usd')
      .gte('created_at', todayStart.toISOString())
      .eq('status', 'completed')
    var rows = (result && result.data) || []
    var sum = 0
    for (var i = 0; i < rows.length; i++) sum += parseFloat(rows[i].cost_usd) || 0
    return sum
  } catch (_e) {
    return 0
  }
}

/**
 * B0.7 — compute USD cost from token counts + model.
 * Currently only Haiku 4.5 + fallback are priced; other models
 * (Sonnet) return 0 here because they're paid for elsewhere
 * (your-signal-ai.service.ts owns its own pricing).
 */
function computeHaikuCost(model: string | null, inputTokens: number, outputTokens: number): number {
  if (!model) return 0
  var mLower = String(model).toLowerCase()
  if (mLower.indexOf('haiku') < 0) return 0
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M
  )
}

/**
 * B0.7 — log a generation event (completed, skipped, or failed).
 * Best-effort; logging failure does not block the calling code.
 */
async function logParadocsCost(
  supabase: any,
  args: {
    report_id: string | null
    model: string
    input_tokens: number | null
    output_tokens: number | null
    cost_usd: number
    status: 'completed' | 'skipped_cap' | 'failed'
    reason?: string | null
  },
): Promise<void> {
  try {
    await supabase.from('paradocs_narrative_cost_log').insert({
      report_id: args.report_id,
      model: args.model,
      input_tokens: args.input_tokens,
      output_tokens: args.output_tokens,
      cost_usd: args.cost_usd,
      status: args.status,
      reason: args.reason || null,
    })
  } catch (_e) { /* table may not exist yet; non-fatal */ }
}

// ============================================
// Types
// ============================================

interface ParadocsAnalysisResult {
  hook: string
  analysis: string
  pull_quote: string
  credibility_signal: string
  // V10.6 — new shape replacing mundane_explanations + likelihood.
  frames?: Array<{ label: string; body: string }>
  open_questions?: string[]
  // Legacy — preserved for backward compat reads of pre-V10.6 reports.
  mundane_explanations?: Array<{
    explanation: string
    likelihood: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  similar_phenomena: string[]
  emotional_tone?: string
  suggested_category?: string
  discovery_tags?: string[]
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

// V10.4 — anti-fabrication preamble injected at the top of the
// system prompt. These rules OVERRIDE every other instruction
// below. They mirror the unified rewrite-pipeline.ts preamble
// so paradocs-analysis runs under the same anti-hallucination
// regime as artifact-summary, feed-hook, and answer_line.
var ANTI_FABRICATION_PREAMBLE = 'CRITICAL ANTI-FABRICATION RULES (read first; these override every other rule below):\n'
  + '- Every factual claim in your output MUST be directly supported by the report data you receive. Nothing else.\n'
  + '- If a field cannot be filled without fabrication, return EXACTLY the string "INSUFFICIENT" for that field (still inside the JSON structure).\n'
  + '- Do NOT invent dates, locations, witnesses, behaviors, outcomes, or contextual details that are not in the source.\n'
  + '- Do NOT use general knowledge to fill in what a typical case of this type looks like. We do NOT want a generic template; we want a faithful analysis of THIS specific source.\n'
  + '- Do NOT narrow general details (source says "Pennsylvania", do not write "near Pittsburgh"). Do NOT invent months when only a year is given.\n'
  + '- When the source is sparse, write a more GENERAL but accurate analysis — never compensate with invented specificity.\n'
  + '- Pattern context references ("This corridor has produced 12 similar reports since 2019") are only allowed when explicitly provided in the report data — never invent statistics.\n\n'
  + 'ANONYMIZATION RULES (apply even when the source contains identifying details):\n'
  + '- NEVER include the submitter\'s real name. Witnesses roll up to counts ("a hiker", "two witnesses", "a family").\n'
  + '- NEVER include exact street addresses. Locations resolve to city / region / state precision only.\n'
  + '- NEVER include full dates. Use month + year, or just year, depending on what the source committed to.\n'
  + '- NEVER include exact times. Use part-of-day ("late evening", "after midnight") when the source has minute precision.\n'
  + '- NEVER include phone numbers, email addresses, or other contact info, regardless of whether the source contains them.\n\n'

var SYSTEM_PROMPT = ANTI_FABRICATION_PREAMBLE
  + 'You are the editorial intelligence behind Paradocs, the world\'s most credible '
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
  + '  "frames": [{"label": "2-4 word lens name", "body": "2-4 sentence framing, ~40-80 words"}],\n'
  + '  "open_questions": ["<one inquiry-voice question, 10-20 words>"],\n'
  + '  "similar_phenomena": ["phenomenon 1", "phenomenon 2"],\n'
  + '  "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful",\n'
  + '  "suggested_category": "<the category YOU think fits best, from the allowed list>",\n'
  + '  "discovery_tags": ["<3-6 plain-language tags for user-facing discovery>"]\n'
  + '}\n\n'
  + 'HOOK RULES:\n'
  + '- Start with the most unusual, specific, or inexplicable element.\n'
  + '- Never start with "A witness" or "In [year]".\n'
  + '- Use specificity: durations, behaviors, sounds, number of witnesses, physical details.\n'
  + '- Create an open loop the reader must resolve by reading further.\n'
  + '- NEVER include precise clock times (e.g. "at 21:19"). Vague times are fine ("after midnight").\n'
  + '- V10.7.F HARD RULE — EDITORIAL THIRD-PERSON ONLY. The hook is OUR archive\'s editorial '
  + 'voice — NEVER a witness quote. NEVER use first-person pronouns: I, me, my, mine, we, us, '
  + 'our, ours. Use third-person framing: "the witness", "a 19-year-old", "the experiencer", '
  + '"they", or no subject at all if the structure permits. DEFAULT TO "they" unless the source '
  + 'narrative explicitly states the witness\'s gender. See GENDER RULE below.\n'
  + '  GOOD: "A nineteen-year-old in meditation opens their eyes to find a smoke trail morphing '
  + 'into a bright orange sphere fifty feet away."\n'
  + '  BAD:  "I opened my eyes mid-meditation to find a smoke trail morphing into a bright '
  + 'orange sphere." (first-person — reads as a witness quote, forbidden)\n\n'
  + 'GENDER RULE (V10.7.E.8 HARD): The default pronoun is THEY / THEM / THEIR. Never use he/she/his/her '
  + 'unless the SOURCE NARRATIVE explicitly states the witness\'s gender (e.g. the source contains '
  + '"my wife saw", "I\'m a 40-year-old man", "she told me", "he reported"). The narrative being a '
  + 'first-person account does NOT establish gender. A masculine-sounding first name, a stereotyped '
  + 'voice in a Whisper transcript, or a photo the model can\'t see do NOT establish gender. When in '
  + 'doubt, write "the witness" / "the experiencer" / "they" — never guess. Misgendering a real human '
  + 'being is a deeper failure than an awkward sentence.\n\n'
  + 'ANALYSIS RULES (V10.6.25 — the narrative IS the page body, not a summary):\n'
  + '\n'
  + 'LENGTH AND SHAPE:\n'
  + '- The narrative is the body of the report page. It is what the reader reads after the pull quote. '
  + 'It is NOT a summary. It is NOT a one-paragraph synopsis. It is the rewritten experience.\n'
  + '- Aim for 2-3 short paragraphs separated by \\n\\n, each 2-4 sentences. If the source is rich, '
  + '4 paragraphs is fine. If the source is sparse, 2 paragraphs is fine. Match the source\'s depth.\n'
  + '- Within the per-report word budget, USE the budget generously. Don\'t leave 60 words on the table '
  + 'when 200 are available — but never invent content to hit a length.\n'
  + '- If you genuinely cannot write multiple paragraphs without inventing, write ONE good paragraph. '
  + 'A solid one-paragraph narrative is better than padded prose or an INSUFFICIENT bail.\n'
  + '\n'
  + 'SUGGESTED BEAT SEQUENCE (use as a guide, not a strict template):\n'
  + '  • SETUP — Where the witness was, what they were doing, the ordinary moment before. One sensory '
  + 'anchor (time of day, weather, posture, what they were thinking about).\n'
  + '  • THE EXPERIENCE — The anomaly itself. Lead with the most specific sensory detail. Preserve '
  + 'durations, distances, sounds, colors, behaviors as the source recorded them.\n'
  + '  • REACTION + AFTERMATH — How the witness felt or responded. What happened immediately after. '
  + 'What did or didn\'t leave a trace.\n'
  + '  • CONTEXT (optional) — Witness history with similar experiences, broader pattern, editorial note. '
  + 'Include only when the source supports it.\n'
  + '\n'
  + 'OPENING SENTENCE: Lead with a grounding sensory anchor — what the witness was physically doing or '
  + 'perceiving. NOT a metadata inventory. NOT the answer-line restated.\n'
  + '  GOOD: "It was past midnight when the witness opened their eyes after thirty minutes of meditation."\n'
  + '  GOOD: "The hike had been ordinary — late afternoon sun, ridge trail south of the lake — until '
  + 'the trees ahead went silent."\n'
  + '  BAD: "A Kansas witness reports a psychic phenomenon during meditation." (metadata inventory)\n'
  + '  BAD: "The witness describes a bright object emerging from a smoke trail." (echoes the answer-line)\n'
  + '\n'
  + 'WHEN POSSIBLE, capture specific observational details: height estimates, build, coloring, limb '
  + 'proportions, gait or movement, sounds, smells, behavioral responses, distance, duration. If the '
  + 'source describes a state of consciousness (meditation, NDE, OBE, dream), reference the state '
  + 'before / during / after when the source allows it. Use what the source gives you; don\'t demand '
  + 'detail the source didn\'t provide.\n'
  + '\n'
  + '- After the opening, contextualize what is unusual about this report relative to its category.\n'
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
  + '- NEVER name the experiencer. Do NOT use first names, last names, last initials, '
  + 'nicknames, or constructions like "Margaret B", "John D.", "Sarah J reports", '
  + '"Katarina describes", "David recalls". Do NOT invent a plausible-sounding name '
  + 'even if the source text does not contain one. The source text may contain the '
  + 'experiencer\'s name in a header row, URL slug, or byline — ignore it. Refer to '
  + 'the subject generically: "the witness", "the experiencer", "the narrator", '
  + '"the reporter", or "they". Use "she" or "he" ONLY when the source narrative '
  + 'explicitly states the witness\'s gender. This rule applies to EVERY field in the '
  + 'JSON output (hook, analysis, pull_quote, credibility_signal).\n'
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
  + 'NARRATIVE READING LEVEL (V10.6.28 — HARD REQUIREMENT):\n'
  + 'The narrative paragraphs are read by curious people on phones, not academics in a journal. '
  + 'Target a 7th-to-8th grade reading level for the entire narrative. If a thirteen-year-old reader '
  + 'would need to slow down or reread a sentence, simplify it.\n'
  + '- Sentence length: aim for 12-18 words on average. Hard ceiling at 25. Break long thoughts '
  + 'into two sentences rather than chaining clauses with semicolons or "and yet…".\n'
  + '- Active voice over passive. Subject-verb-object. "The witness saw the light" beats '
  + '"A light was observed by the witness".\n'
  + '- Concrete nouns over abstract ones. "Meditation" not "contemplative practice". '
  + '"Breathing slowly" not "engaging in respiratory regulation".\n'
  + '- BANNED NARRATIVE PHRASINGS (these all read above 8th grade or sound like a paper):\n'
  + '  * "creates a state where perception shifts" → "their thinking changed" or "their senses sharpened"\n'
  + '  * "the relationship between intention and outcome" → "what they wanted and what happened next"\n'
  + '  * "deep focus on breath and intention" → "slow breathing and quiet focus"\n'
  + '  * "altered state of consciousness" → "a different state of mind" (use once max if needed)\n'
  + '  * "phenomenological account" → "the witness\'s account"\n'
  + '  * "perceptual experience" → "what they saw" / "what they felt"\n'
  + '  * "the experiencer reports that…" → "they said…" or "the witness said…"\n'
  + '  * "this account presents…" → "in this account…" or just drop the meta-frame\n'
  + '  * "characterized by", "constitutes", "manifests as", "presents as" → use plain verbs\n'
  + '  * "subsequently", "thereafter", "preceding", "antecedent" → "then", "after", "before"\n'
  + '  * "demonstrate", "exhibit", "exemplify" → "show"\n'
  + '  * "underscores", "highlights", "illustrates" → drop or use "shows"\n'
  + '  * "discrete event", "distinct phenomenon" → "one moment", "what happened"\n'
  + '  * "in the context of", "with respect to", "in regards to" → drop or use "for" / "with"\n'
  + '- WRITE LIKE A FRIEND TELLING A STORY, not like a paper. A friend says "They were meditating in '
  + 'their room when something changed" — not "The witness entered a meditative state during which '
  + 'a perceptual shift occurred."\n'
  + '- It is FINE to use a precise technical term ONCE in the narrative if it is the right word '
  + '(e.g. "out-of-body experience", "near-death experience"). Define it inline the first time '
  + 'in plain words if it might not be familiar. Then drop back to plain language for the rest.\n'
  + '- READING LEVEL SELF-CHECK: Before finalizing the narrative, scan for any sentence over 25 '
  + 'words or any banned phrase from the list above. If found, rewrite it before returning.\n\n'
  + 'PULL QUOTE RULES:\n'
  + '- Write an ORIGINAL editorial line. This is YOUR analytical insight, not a witness quote.\n'
  + '- V10.7.F HARD RULE — EDITORIAL THIRD-PERSON ONLY. The pull_quote is rendered on the report '
  + 'page inside a styled blockquote with curly quotation marks. If you use first-person voice, '
  + 'the reader sees what looks like a direct quote from the experiencer — which is a policy '
  + 'violation. NEVER use first-person pronouns: I, me, my, mine, we, us, our, ours. Use '
  + 'third-person framing only: "the witness", "the object", "the figure", "she", "he", "they", '
  + 'or pure description with no subject.\n'
  + '  REAL FAILURE EXAMPLE (must not be replicated): "It rushed past me, flew directly over '
  + 'my roof, and as soon as it passed the apex, it blinked out of existence."  (Forbidden: me, my.)\n'
  + '  GOOD REWRITE: "The object cleared the roofline at high speed and vanished mid-arc with '
  + 'no afterglow and no debris."\n'
  + '- CRITICAL: Do NOT rephrase, restructure, or echo the witness\'s own words. If the witness '
  + 'said "A man couldn\'t have covered that much ground in the dark" you CANNOT write a similar sentence. '
  + 'Instead write something like "The terrain alone rules out human-speed movement at that distance."\n'
  + '- Frame it as an analyst\'s observation about the evidence, patterns, or implications.\n'
  + '- Must work as a complete thought with zero context.\n'
  + '- Should be the line someone would screenshot.\n'
  + '- MUST include at least one concrete sensory or physical detail from the report. '
  + 'Generic editorial ("This case raises important questions") is NOT acceptable.\n'
  + '- Specific > general. Evocative > explanatory.\n'
  + '- Must be grammatically complete and polished. No fragments, no typos.\n'
  + '- FEW-SHOT EXAMPLES (study these for tone and specificity):\n'
  + '  GOOD: "Three independent observers in a 40-mile corridor described identical descent patterns within the same hour."\n'
  + '  GOOD: "The 8-foot bipedal figure left 17-inch tracks in fresh mud, then the trail simply stops."\n'
  + '  GOOD: "They flatlined for four minutes and described the resuscitation procedure from a vantage point above the gurney."\n'
  + '  GOOD: "The object held position against 60-knot winds for eleven minutes before accelerating beyond visual range."\n'
  + '  BAD: "This report adds to the growing body of evidence." (generic, no detail)\n'
  + '  BAD: "The witness describes a truly remarkable encounter." (empty, no specifics)\n'
  + '  BAD: "Cases like this challenge our understanding." (cliche, could apply to anything)\n\n'
  + 'CREDIBILITY SIGNAL RULES:\n'
  + '- Describe what the report CONTAINS, not what it lacks. Frame positively.\n'
  + '- Lead with the strongest evidentiary element actually present in the report.\n'
  + '- Never fabricate corroboration. Be honest but constructive.\n'
  + '- BANNED: "Single witness, no physical evidence", "Single anonymous account", '
  + '"Unverified", "No corroboration". These phrases discourage readers without adding insight.\n'
  + '- GOOD EXAMPLES: "First-person account with sensory detail", '
  + '"Detailed physical description, multiple observers", '
  + '"Investigated by field team, physical traces documented", '
  + '"Consistent with 12 similar reports from this region", '
  + '"Named witness, specific timeframe and location", '
  + '"Structured questionnaire response with cross-validated elements".\n'
  + '- If the report is genuinely thin (short, vague, no specifics), use: '
  + '"Brief account, limited detail" rather than implying falsehood.\n\n'
  + 'FRAMES (field name: "frames") — V10.6.5 — THIS IS THE MOST IMPORTANT SECTION:\n'
  + 'We are NOT in the business of trying to prove something was something else. Paradocs does not '
  + 'rank explanations or push readers toward debunking. Instead we offer multiple lenses through '
  + 'which a thoughtful reader can hold this case. Each lens has equal standing. No ranking. No '
  + 'likelihoods. No "more likely" or "less likely". The point is enrichment, not adjudication.\n'
  + '\n'
  + 'FRAME COUNT: Provide 2-3 frames. (Three is preferred when the case has enough texture.)\n'
  + '\n'
  + 'READING LEVEL (HARD REQUIREMENT — V10.6.5):\n'
  + 'Our audience is the curious general public, not academics. Target a 7th-to-8th grade reading '
  + 'level. This is the single highest priority for the frames + open questions sections. If your '
  + 'output sounds like a journal article, you have failed the brief.\n'
  + '- Average sentence length: 10-15 words. Hard ceiling: 20 words. Break long thoughts into two sentences.\n'
  + '- Each frame BODY is 3 sentences max. Not 4. Three.\n'
  + '- Lead the body with a single PLAIN-LANGUAGE INSIGHT — the one thing you want the reader to '
  + 'walk away knowing under this lens. Then 1-2 short supporting sentences. That is the entire frame.\n'
  + '\n'
  + 'BANNED VOCABULARY (V10.6.5 — these all push reading level above 8th grade or sound academic):\n'
  + '  * temporal, temporal proximity, temporal window, temporal clustering\n'
  + '  * anomalous, anomalous occurrence, anomalous properties\n'
  + '  * manifestation, intentional manifestation\n'
  + '  * synchronicity, routing synchronicity\n'
  + '  * propulsion effect, propulsive signature, signaling effect\n'
  + '  * data point (as in "is itself the data point"), contaminant\n'
  + '  * deliberate (use "on purpose" or just drop it), sustained (use "long" or drop it)\n'
  + '  * selective attention, pre-existing phenomena, observer effect\n'
  + '  * cluster (as a verb), aggregated, recurrence (as a noun)\n'
  + '  * locomotion (use "movement"), bipedal (use "two-legged"), corroborate (use "back up")\n'
  + '  * deconstruct, foreground, problematize, contextualize, instantiate\n'
  + '  * argue against, argues for, prima facie\n'
  + 'If a concept needs ONE technical term to be accurate, you may use it ONCE per frame and define '
  + 'it inline in plain words. Otherwise use the everyday word.\n'
  + '\n'
  + 'PLAIN-LANGUAGE REPLACEMENTS (use the right column):\n'
  + '  * "temporal proximity of X and Y"           → "X happened first, then Y"\n'
  + '  * "the witness immersed themselves in"      → "the witness spent months on"\n'
  + '  * "sustained telepathic contact attempts"   → "trying to make contact in their mind"\n'
  + '  * "anomalous occurrence"                    → "what happened"\n'
  + '  * "intentional manifestation"               → "making it happen on purpose"\n'
  + '  * "selective attention to pre-existing"     → "noticing what was already there"\n'
  + '  * "routing synchronicity"                   → "the way their path led them there"\n'
  + '  * "propulsion effect or active signaling"   → "the lights moved on their own"\n'
  + '  * "consistent with reports across the corpus" → "matches what other people describe"\n'
  + '  * "Paradocs tracks this pattern"            → "We see this in many cases"\n'
  + '\n'
  + 'WHAT A FRAME LOOKS LIKE:\n'
  + '- label: 2-4 words. SHORT, EVERYDAY phrase. Examples: "The light itself", "The route home", '
  + '"What the witness brought", "The way it moved", "Who else saw it", "What stayed behind". '
  + 'AVOID academic noun-stacks like "Material taxonomy" or "Pattern recurrence" — those read as '
  + 'textbook chapter titles. Use a phrase a normal person would say out loud.\n'
  + '- body: 3 sentences max, ~30-50 words total. First sentence is the INSIGHT in plain language. '
  + 'Second sentence anchors it with one concrete detail from the source. Third sentence (optional) '
  + 'offers a pattern beat — what we see in other cases, why it matters. Done.\n'
  + '\n'
  + 'EXAMPLES OF GOOD V10.6.5 FRAMES (study the voice — short, plain, declarative):\n'
  + '\n'
  + '  GOOD label: "What the witness brought"\n'
  + '  GOOD body: "The witness spent months trying to make contact in their mind. Then this happened. '
  + 'We see this pattern in many cases where someone prepares first and an experience follows."\n'
  + '\n'
  + '  GOOD label: "The light itself"\n'
  + '  GOOD body: "Pink strobing from the cloud base. The blinking sped up until the witness felt afraid. '
  + 'Lightning is blue, so a pink signal is rare and worth noting."\n'
  + '\n'
  + '  GOOD label: "The route home"\n'
  + '  GOOD body: "The witness expected to take an unusual back route. They drove their normal way and '
  + 'still arrived right at the lights. The path seemed to find the event, not the other way around."\n'
  + '\n'
  + '  GOOD label: "The tracks"\n'
  + '  GOOD body: "The figure left 17-inch footprints, then the trail simply stopped. No matching prints '
  + 'in the open clearing. The way it moved is what argues most against an ordinary animal."\n'
  + '\n'
  + 'EXAMPLES OF BAD FRAMES (too academic, too long, too jargon-y):\n'
  + '  BAD label: "Material taxonomy"\n'
  + '  BAD body: "The temporal clustering of materials defying era-known aerospace and witness testimony '
  + 'suggests a recovery pattern. Through this lens, the anomalous properties argue against conventional '
  + 'explanations of the period."\n'
  + '  (Reading level 14+. "Temporal", "anomalous", "argues against", and "conventional" all blacklisted. '
  + 'No plain-language hook. 2 sentences but 38 words and reads like a thesis abstract.)\n'
  + '\n'
  + 'BANNED FRAME PATTERNS — do NOT do any of these:\n'
  + '  * Lead a frame body with "Under this reading", "Through this lens", "From a X perspective", or '
  + 'any other framing-meta opener. Lead with the SPECIFIC INSIGHT. The label IS the framing-meta.\n'
  + '  * Words/phrases: "alternative explanation", "more likely", "less likely", "skeptical reading", '
  + '"prosaic", "mundane", "conventional explanation", "debunking", "ruling out", "rules out", '
  + '"can be explained by", "could be explained by", "remains untestable", "remains unverifiable".\n'
  + '  * Hedge-soup: "could potentially indicate that perhaps the witness may have…". Use short, '
  + 'declarative sentences. Active voice. Concrete > general.\n'
  + '  * Ranking frames against each other. They are equally-held.\n'
  + '  * Treating someone\'s preparation, intention, or beliefs as suspect or contaminating. '
  + 'Those are valid lenses, not flaws.\n'
  + '  * Vague generic frames like "Skeptical lens" with no concrete detail from THIS case. Every '
  + 'frame body MUST contain at least one specific detail from the source.\n'
  + '  * Sentences over 20 words. Words from the BANNED VOCABULARY list above.\n'
  + '\n'
  + 'OPEN QUESTIONS (field name: "open_questions") — V10.6.5:\n'
  + 'One or two questions. Plain-language, conversational. The kind of question someone curious '
  + 'about the case would ask a friend, not a research team in a conference room. Frame as '
  + '"How often does ___?" "What would it take to ___?" "Could ___?" NOT "Was it really ___?".\n'
  + '\n'
  + 'READING LEVEL FOR QUESTIONS: same 7th-8th grade rule. 10-15 words each, hard ceiling 20.\n'
  + 'NO jargon — no "corpus", no "temporal window", no "forensic test", no "patterned".\n'
  + '\n'
  + 'EXAMPLES OF GOOD V10.6.5 OPEN QUESTIONS:\n'
  + '  GOOD: "How often does someone\'s preparation predict an experience like this in our other cases?"\n'
  + '  GOOD: "Is the witness really making this happen, or just noticing what was already there?"\n'
  + '  GOOD: "What would it take to prove the lights moved on their own?"\n'
  + '  GOOD: "What second piece of evidence would change the picture?"\n'
  + '  BAD: "What forensic test today would distinguish a black-budget recovery from a non-terrestrial '
  + 'debris field?" (14th grade, four jargon terms)\n'
  + '  BAD: "How often does sustained intention precede sighting in the broader corpus?" '
  + '("sustained", "precede", "corpus" — all banned)\n'
  + '  BAD: "Was this really an alien encounter?" (binary, adversarial)\n'
  + '\n'
  + 'SIMILAR PHENOMENA:\n'
  + '- Name real paranormal phenomena categories (e.g. "shadow people", "orbs", "missing time").\n\n'
  + 'SUGGESTED CATEGORY:\n'
  + '- Based on the actual content, which Paradocs category fits best? Allowed values:\n'
  + '  ufos_aliens, cryptids, ghosts_hauntings, psychic_phenomena, consciousness_practices, '
  + 'psychological_experiences, biological_factors, high_strangeness, earth_mysteries, '
  + 'time_anomalies, technology_ai, folklore_mythology, conspiracies, other.\n'
  + '- This is used for misclassification detection. Some sources (e.g. OBERF) file reports '
  + 'under a blanket category that may not match the actual content. A UFO sighting filed under '
  + '"psychic_phenomena" should have suggested_category: "ufos_aliens".\n'
  + '- If the current category is correct, return the same value. Only differ when the content '
  + 'clearly belongs elsewhere.\n\n'
  + 'DISCOVERY TAGS:\n'
  + '- Provide 3-6 plain-language tags that a general audience would use to find this report.\n'
  + '- These are for user-facing discovery, NOT source-system metadata.\n'
  + '- BANNED: source identifiers ("nuforc", "bfro", "oberf", "nderf"), technical codes '
  + '("class-a", "class-b", "ce-1", "ce-3"), and internal jargon.\n'
  + '- GOOD examples: "triangle craft", "night sighting", "rural encounter", "multiple witnesses", '
  + '"bedroom visitation", "tunnel of light", "life review", "childhood NDE", "forest sounds", '
  + '"physical traces", "recurring location".\n'
  + '- Tags should be lowercase, 1-3 words each, specific to THIS report.\n\n'
  + 'VAGUE DATE HANDLING:\n'
  + '- When the report lacks a precise date (year only, decade, or "sometime in the 90s"), '
  + 'weave a brief temporal anchor into the analysis. Reference what was happening culturally, '
  + 'technologically, or in the field at that time to give the reader context.\n'
  + '- Example: "This mid-1990s sighting predates consumer drones and widespread LED technology, '
  + 'narrowing the conventional explanations available."\n'
  + '- Do NOT fabricate dates. Only contextualize when the imprecision is notable.\n\n'
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
//
// V10.6.24 — bumped 120 → 240 to support the new 3-4 paragraph
// shape. With 60-80 words per paragraph and 3-4 paragraphs, 240 gives
// the AI room for a real body without losing the "never exceed source"
// guardrail. For short sources we still scale proportionally; the
// scale-by-source clause does the right thing.
function computeAnalysisWordBudget(sourceText: string): number {
  var sourceWords = countWords(sourceText)
  if (sourceWords === 0) return 60 // Fallback minimum
  // Never exceed source length. For safety, allow up to 90% of source or 240 words,
  // whichever is smaller. Minimum floor is 60 words so we can still form coherent analysis.
  var cap = Math.min(240, Math.floor(sourceWords * 0.9))
  return Math.max(60, cap)
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

// Strip OBERF/NDERF header chrome from source text before it reaches the
// LLM. When this prefix ("<Name> Experience Home Page Share Experience
// New Experiences Experience description:") leaks into a stored
// description, the analysis model tends to echo the name as a byline.
// Kept local to this service so it runs even on already-polluted rows
// that haven't been backfilled yet.
function scrubSourceHeaderChrome(text: string): string {
  if (!text) return text
  // Anchor on the invariant OBERF/NDERF header tail and strip up to 120
  // chars of preceding prefix. Mirrors stripOBERFHeaderChrome.
  var headerRe = /^[^\n]{0,120}Home\s+Page\s+Share\s+Experience\s+New\s+Experiences\s+Experience\s+description:?\s*/i
  return text.replace(headerRe, '').trim() || text
}

function buildUserPrompt(report: any, analysisWordBudget: number): string {
  var parts: string[] = []
  parts.push('Generate a Paradocs Analysis for the following report.\n')
  parts.push('LENGTH LIMIT: Your "analysis" field must be AT MOST ' + analysisWordBudget + ' words. '
    + 'This is a hard cap. Do not exceed it under any circumstances. '
    + 'If the source material is brief, keep your analysis proportionally brief.')

  if (report.source_label || report.source_type) parts.push('SOURCE: ' + (report.source_label || report.source_type))
  if (report.category) parts.push('CATEGORY: ' + report.category)

  // V10.7.E.5 — MEDIUM hint. When the report has an attached
  // user-submitted video (has_video=true), the narrative we're
  // analyzing is a Whisper transcription of the witness speaking
  // on camera. The default analysis voice is calibrated for written
  // accounts ("the witness writes…", "the report states…") which
  // reads awkwardly when the source is a 30-second selfie video.
  // Tell the model what medium it's working with so it can pick the
  // right verbs ("recounts on camera", "says into the camera",
  // "describes in the video"), and preserve the on-camera framing
  // when relevant ("the witness pauses before saying X", "the
  // delivery is matter-of-fact"). Same writer voice rules otherwise —
  // no first-person pronouns, no quoting/paraphrasing.
  if (report.has_video) {
    parts.push(
      'MEDIUM: This report is a short user-submitted video; the narrative below is a Whisper '
      + 'transcription of the witness speaking on camera. Prefer video-aware verbs ("recounts on camera", '
      + '"says into the camera", "describes in the video", "the witness pauses before…") over written-account '
      + 'verbs ("writes", "the report states", "the account claims"). If on-camera delivery details are '
      + 'visible in the transcript (laughter, hesitation, emphasis), you may briefly note them in the analysis '
      + 'or pull_quote, but do NOT invent any non-verbal detail not literally present in the transcript text.'
    )
  } else if (report.source_type === 'user_submission') {
    parts.push(
      'MEDIUM: This is a first-party written submission from the witness themselves (not a third-party '
      + 'ingest). Use written-account verbs ("the witness writes", "describes", "recounts") and keep the '
      + 'analysis grounded entirely in what the narrative states. Same anti-fabrication rules apply.'
    )
  }

  // V10.6.15 — All structured metadata DELIBERATELY excluded from
  // the source packet: location (V10.6.14 found these corrupt for
  // a slice of the corpus) AND event_date (V10.6.15 found OBERF
  // writes YYYY-01-01 as a placeholder when actual date unknown,
  // which the AI faithfully echoes and the claim-check correctly
  // rejects as drift from the narrative). The narrative contains
  // dates / locations / witnesses naturally where they exist; the
  // structured fields are display-only and not trustworthy enough
  // to feed to the anti-fabrication pipeline.

  // V10.6.15 — EVIDENCE ON FILE block removed. has_photo_video,
  // has_official_report, and witness_count have the same
  // 'structured metadata may be wrong' vulnerability that drove
  // the V10.6.14 location fix and the dream-experience-1970 date
  // fix. The narrative organically mentions photos, official
  // reports, and witnesses where they exist; the AI can pull
  // those facts from there without trusting potentially-bad
  // structured fields.

  // Full description — truncate at ~3000 chars for cost. Scrub any
  // OBERF/NDERF page-header chrome first so the model never sees the
  // experiencer's name as a byline in the source material.
  if (report.description) {
    var scrubbed = scrubSourceHeaderChrome(report.description)
    // V10.6.18 — bumped 5K → 8K to match the answer-line service.
    // Same root cause: long-preamble NDERF reports needed more
    // window for the AI to reach the actual experience description.
    var desc = scrubbed.length > 8000
      ? scrubbed.substring(0, 8000) + '...'
      : scrubbed
    parts.push('\nREPORT NARRATIVE:\n' + desc)
  } else if (report.summary) {
    parts.push('\nREPORT NARRATIVE:\n' + scrubSourceHeaderChrome(report.summary))
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
// API Calling — simplified, matching proven diagnose pattern
// ============================================

var REQUEST_TIMEOUT_MS = 50000

function sleep(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

/**
 * Single API call attempt to one model. Returns response text or null.
 * Isolated function avoids var-scoping issues with AbortController in loops.
 */
async function callClaudeOnce(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  // B0.7 — optional reportId for cost-log correlation. When provided,
  // every successful call writes a row to paradocs_narrative_cost_log
  // with the per-call USD spend computed from token usage.
  reportId?: string | null,
): Promise<{ text: string | null; retryable: boolean; status: number; inputTokens?: number; outputTokens?: number }> {
  var controller = new AbortController()
  var timeoutId = setTimeout(function() { controller.abort() }, REQUEST_TIMEOUT_MS)

  try {
    var bodyObj = {
      model: modelName,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: temperature
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

    if (resp.status === 429 || resp.status >= 500) {
      var errBody = await resp.text().catch(function() { return '' })
      console.warn('[ParadocsAnalysis] ' + resp.status + ' from ' + modelName + ': ' + errBody.substring(0, 200))
      return { text: null, retryable: true, status: resp.status }
    }

    if (!resp.ok) {
      var errText = await resp.text().catch(function() { return '' })
      console.error('[ParadocsAnalysis] ' + resp.status + ' from ' + modelName + ': ' + errText.substring(0, 400))
      return { text: null, retryable: false, status: resp.status }
    }

    var data = await resp.json()
    if (data.content && data.content.length > 0 && data.content[0].text) {
      var inputTokens = data.usage ? data.usage.input_tokens : 0
      var outputTokens = data.usage ? data.usage.output_tokens : 0
      console.log('[ParadocsAnalysis] OK from ' + modelName + ' (' + data.content[0].text.length + ' chars, ' + outputTokens + ' tokens)')

      // B0.7 — log per-call cost so the daily cap can sum it. Best-
      // effort; never block on logging failure.
      var costUsd = computeHaikuCost(modelName, inputTokens, outputTokens)
      try {
        var supabaseLog = createServerClient()
        await logParadocsCost(supabaseLog, {
          report_id: reportId || null,
          model: modelName,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
          status: 'completed',
        })
      } catch (_e) { /* non-fatal */ }

      return { text: data.content[0].text.trim(), retryable: false, status: 200, inputTokens: inputTokens, outputTokens: outputTokens }
    }

    console.warn('[ParadocsAnalysis] Empty content from ' + modelName + ', stop_reason: ' + (data.stop_reason || 'none'))
    return { text: null, retryable: false, status: 200 }

  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.error('[ParadocsAnalysis] Timeout (' + REQUEST_TIMEOUT_MS + 'ms) on ' + modelName)
    } else {
      console.error('[ParadocsAnalysis] Network error on ' + modelName + ': ' + (err.message || err))
    }
    return { text: null, retryable: true, status: 0 }
  }
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature?: number,
  // B0.7 — optional reportId for cost-log correlation.
  reportId?: string | null,
): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ParadocsAnalysis] No ANTHROPIC_API_KEY found')
    return null
  }

  var temp = (temperature != null) ? temperature : 0.4
  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  // Try primary model with 2 attempts
  var r1 = await callClaudeOnce(apiKey, models[0], systemPrompt, userPrompt, maxTokens, temp, reportId)
  if (r1.text) return r1.text

  if (r1.retryable) {
    await sleep(2000)
    var r2 = await callClaudeOnce(apiKey, models[0], systemPrompt, userPrompt, maxTokens, temp, reportId)
    if (r2.text) return r2.text
  }

  // Try fallback model
  var r3 = await callClaudeOnce(apiKey, models[1], systemPrompt, userPrompt, maxTokens, temp, reportId)
  if (r3.text) return r3.text

  console.error('[ParadocsAnalysis] All attempts exhausted')
  return null
}

// ============================================
// Parsing
// ============================================

// Capitalized tokens we must never rewrite as "the witness" — these are
// legitimate sentence-initial words that the LLM routinely uses and are NOT
// experiencer names. Kept conservative; better to miss a rare name than to
// mangle grammatical prose.
var NON_NAME_TOKENS: Record<string, true> = {
  'The': true, 'This': true, 'That': true, 'These': true, 'Those': true,
  'A': true, 'An': true, 'And': true, 'But': true, 'Or': true, 'So': true, 'Yet': true, 'For': true,
  'He': true, 'She': true, 'They': true, 'It': true, 'We': true, 'You': true, 'I': true,
  'His': true, 'Her': true, 'Their': true, 'Our': true, 'My': true, 'Your': true, 'Its': true,
  'One': true, 'Two': true, 'Three': true, 'Four': true, 'Five': true, 'Six': true,
  'Someone': true, 'Everyone': true, 'Anyone': true, 'Nobody': true, 'Somebody': true,
  'Others': true, 'Several': true, 'Many': true, 'Most': true, 'Some': true, 'Few': true,
  'Both': true, 'Neither': true, 'Either': true, 'Each': true, 'All': true, 'None': true,
  'Witness': true, 'Witnesses': true, 'Reporter': true, 'Narrator': true,
  'Experiencer': true, 'Experiencers': true, 'Observer': true, 'Observers': true,
  'Subject': true, 'Subjects': true, 'Person': true, 'People': true, 'Respondent': true,
  'Police': true, 'Officer': true, 'Officers': true, 'Deputy': true, 'Sheriff': true,
  'Doctor': true, 'Doctors': true, 'Nurse': true, 'Nurses': true, 'Paramedic': true,
  'Researcher': true, 'Researchers': true, 'Scientist': true, 'Scientists': true,
  'Author': true, 'Writer': true, 'Editor': true,
  'Dreamer': true, 'Sleeper': true, 'Meditator': true, 'Pilot': true, 'Driver': true,
  'Man': true, 'Woman': true, 'Boy': true, 'Girl': true, 'Child': true, 'Children': true,
  'Patient': true, 'Mother': true, 'Father': true, 'Son': true, 'Daughter': true,
  'Husband': true, 'Wife': true, 'Brother': true, 'Sister': true, 'Friend': true, 'Neighbor': true,
  'Uncle': true, 'Aunt': true, 'Grandmother': true, 'Grandfather': true, 'Grandma': true, 'Grandpa': true,
  'Family': true, 'Group': true, 'Team': true, 'Couple': true, 'Pair': true,
  'While': true, 'During': true, 'After': true, 'Before': true, 'When': true, 'Where': true, 'As': true,
  'Although': true, 'Though': true, 'Because': true, 'Since': true, 'If': true, 'Unless': true, 'Until': true,
  'Then': true, 'Now': true, 'Later': true, 'Today': true, 'Yesterday': true, 'Tomorrow': true,
  'Once': true, 'Twice': true, 'Again': true, 'Earlier': true, 'Afterward': true,
  'Also': true, 'Even': true, 'Still': true, 'However': true, 'Thus': true, 'Therefore': true,
  'Meanwhile': true, 'Moreover': true, 'Nevertheless': true, 'Consequently': true,
  'In': true, 'On': true, 'At': true, 'By': true, 'With': true, 'Without': true, 'Of': true, 'From': true, 'To': true,
  'Under': true, 'Over': true, 'Above': true, 'Below': true, 'Near': true, 'Inside': true, 'Outside': true,
  'Here': true, 'There': true, 'Nowhere': true, 'Somewhere': true, 'Anywhere': true, 'Elsewhere': true,
  'Single': true, 'Multiple': true, 'Only': true, 'Just': true,
  'What': true, 'Who': true, 'Whom': true, 'Whose': true, 'Which': true, 'Why': true, 'How': true,
  // Common phenomenology / narrative words that read as sentence subjects
  'Adult': true, 'Adults': true, 'Infant': true, 'Infants': true,
  'Consciousness': true, 'Awareness': true, 'Perception': true, 'Memory': true, 'Memories': true,
  'Vision': true, 'Visions': true, 'Dream': true, 'Dreams': true, 'Experience': true, 'Experiences': true,
  'Event': true, 'Events': true, 'Incident': true, 'Case': true, 'Cases': true, 'Report': true, 'Reports': true,
  'Account': true, 'Accounts': true, 'Narrative': true, 'Narratives': true, 'Story': true, 'Stories': true,
  'Encounter': true, 'Encounters': true, 'Sighting': true, 'Sightings': true,
}

// Reporting verbs after which a leading capitalized token is almost certainly
// a proper-noun byline ("Katarina reports ...", "Margaret B describes ...").
var REPORTING_VERBS = [
  'reports', 'describes', 'recounts', 'narrates', 'shares', 'offers', 'recalls',
  'presents', 'submits', 'provides', 'details', 'documents', 'writes', 'states',
  'experiences', 'experienced', 'says', 'claims', 'notes', 'observes',
  'remembers', 'recollects', 'awakens', 'awakes', 'encounters', 'witnesses',
  'sees', 'saw', 'hears', 'heard', 'feels', 'felt', 'explains', 'explained',
  'tells', 'told', 'described', 'reported', 'recalled', 'mentions', 'mentioned',
  'wakes', 'woke', 'reveals', 'revealed', 'relates', 'related',
].join('|')

// Strip any leaked experiencer-name construction from a single analysis
// field. Handles three shapes the model (and, rarely, the source material)
// produces:
//   1. "Margaret B reports ..." / "John D. describes ..."  (First + initial)
//   2. "Katarina reports ..."                              (bare first name)
//   3. "Margaret B's account ..." / "Katarina's account ..." (possessives)
// Replaces the proper-noun byline with a neutral subject so the sentence
// remains grammatical. Runs after the prompt-level rule as defense-in-depth.
// NB: the bare-first-name pattern is gated on an explicit reporting verb +
// a NON_NAME_TOKENS blacklist so it cannot mangle legitimate sentence-
// initial words like "The", "Adults", "Memory", etc.
export function stripExperiencerNames(text: string): string {
  if (!text) return text

  // 1) First + LastInitial byline — verb OR possessive (existing behaviour).
  var byline = new RegExp(
    '(^|[.!?\\n]\\s+)([A-Z][a-zA-Z\'\\-]{1,24})\\s+([A-Z])\\.?' +
    '(?=\\s+(?:' + REPORTING_VERBS + '|a |an |the )|\\s*[\'\u2019]s\\b)',
    'g'
  )
  var cleaned = text.replace(byline, function (_match, pre) {
    return (pre || '') + 'The witness'
  })

  // 2) Bare first-name byline at sentence start, followed by a reporting
  //    verb — "Katarina reports her earliest memory ..."
  var bareByline = new RegExp(
    '(^|[.!?\\n]\\s+)([A-Z][a-z][a-zA-Z\'\\-]{1,23})(?=\\s+(?:' + REPORTING_VERBS + ')\\b)',
    'g'
  )
  cleaned = cleaned.replace(bareByline, function (_match, pre, name) {
    if (NON_NAME_TOKENS[name]) return _match
    return (pre || '') + 'The witness'
  })

  // 3) Possessive forms — "Margaret B's account", "Katarina's account".
  //    The first variant is already handled by (1) when the possessive
  //    follows the initial; this extra pass covers cases where the initial
  //    is absent or separated oddly.
  var initialPossessive = /(^|[.!?\n]\s+)([A-Z][a-zA-Z'\-]{1,24})\s+([A-Z])\.?['\u2019]s\b/g
  cleaned = cleaned.replace(initialPossessive, function (_m, pre) {
    return (pre || '') + 'The witness\u2019s'
  })

  var bareFirstPossessive = /(^|[.!?\n]\s+)([A-Z][a-z][a-zA-Z'\-]{1,23})['\u2019]s\b/g
  cleaned = cleaned.replace(bareFirstPossessive, function (_m, pre, name) {
    if (NON_NAME_TOKENS[name]) return _m
    return (pre || '') + 'The witness\u2019s'
  })

  return cleaned
}

// V10.7.F — editorial third-person enforcement for short, blockquote-style
// fields (hook + pull_quote). Detects first-person pronouns (I, me, my,
// mine, we, us, our, ours) at word boundaries. Excludes hyphenated
// compound tokens where the matched word is glued to another word /
// number via "-" — e.g. "I-80" (highway), "strip-mine" (compound noun),
// "U.S.-issued" (compound modifier). Returns the list of offending
// tokens for logging.
//
// Why field-scoped: narrative + frames are intentionally permitted to use
// "we" or "our" in a Paradocs-collective sense ("we track this pattern
// across cases"). The two fields that render quote-styled (pull_quote in
// a styled blockquote with curly marks, hook as a short editorial line)
// are where first-person pronouns are misread as direct witness speech.
export function findFirstPersonPronouns(text: string): string[] {
  if (!text) return []
  var re = /\b(I|me|my|mine|we|us|our|ours)\b/gi
  var hits: string[] = []
  var m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    var idx = m.index
    var len = m[0].length
    // Skip if this is part of a hyphenated compound. Hyphen on either
    // side, immediately adjacent to a letter or digit on the OTHER side
    // of the hyphen, means the matched substring is morphologically a
    // compound segment, not a standalone word. Covers:
    //   "strip-mine" → "mine" preceded by "-p"
    //   "I-80"       → "I" followed by "-8"
    //   "we-the-people" → "we" followed by "-t"
    var prev = text.charAt(idx - 1)
    var prev2 = text.charAt(idx - 2)
    if (prev === '-' && /[A-Za-z0-9]/.test(prev2)) continue
    var next = text.charAt(idx + len)
    var next2 = text.charAt(idx + len + 1)
    if (next === '-' && /[A-Za-z0-9]/.test(next2)) continue
    hits.push(m[0])
  }
  return hits
}

// V10.7.F — apply the editorial-voice rule to hook + pull_quote. If a
// field violates, blank it. Returns the list of violations seen. The
// orchestrator (generateParadocsAnalysisOnce + generateAndSaveDirect)
// inspects the return value and decides whether to retry the whole
// generation (preferred — small cost, fresh draw) or accept the partial
// result on the final attempt. NOT called from sanitizeAnalysisResult
// because retry-vs-accept is a caller decision that depends on attempt
// count.
export function enforceEditorialVoice(r: ParadocsAnalysisResult): { hook: string[]; pull_quote: string[] } {
  var v = { hook: [] as string[], pull_quote: [] as string[] }
  if (r.hook) {
    var hookHits = findFirstPersonPronouns(r.hook)
    if (hookHits.length > 0) {
      v.hook = hookHits
      r.hook = ''
    }
  }
  if (r.pull_quote) {
    var pqHits = findFirstPersonPronouns(r.pull_quote)
    if (pqHits.length > 0) {
      v.pull_quote = pqHits
      r.pull_quote = ''
    }
  }
  return v
}

function sanitizeAnalysisResult(r: ParadocsAnalysisResult): ParadocsAnalysisResult {
  r.hook = stripExperiencerNames(r.hook)
  r.analysis = stripExperiencerNames(r.analysis)
  if (r.pull_quote) r.pull_quote = stripExperiencerNames(r.pull_quote)
  if (r.credibility_signal) r.credibility_signal = stripExperiencerNames(r.credibility_signal)
  if (Array.isArray(r.mundane_explanations)) {
    r.mundane_explanations = r.mundane_explanations.map(function(me) {
      return {
        explanation: stripExperiencerNames(me.explanation || ''),
        likelihood: me.likelihood,
        reasoning: stripExperiencerNames(me.reasoning || ''),
      }
    })
  }
  // NOTE: V10.7.F editorial-voice enforcement (first-person pronoun ban
  // on hook + pull_quote) is intentionally NOT called here — the orchestrator
  // runs enforceEditorialVoice() per attempt so it can retry on the first
  // violation rather than silently blanking fields.
  return r
}

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
    // V10.6 — frames + open_questions are the new editorial shape.
    if (!Array.isArray(parsed.frames)) parsed.frames = []
    parsed.frames = parsed.frames
      .filter(function(f: any) { return f && typeof f === 'object' && typeof f.label === 'string' && typeof f.body === 'string' })
      .map(function(f: any) { return { label: f.label.trim(), body: f.body.trim() } })
      .filter(function(f: any) { return f.label.length > 0 && f.body.length > 0 })
      .slice(0, 3)
    if (!Array.isArray(parsed.open_questions)) parsed.open_questions = []
    parsed.open_questions = parsed.open_questions
      .map(function(q: any) {
        if (typeof q === 'string') return q.trim()
        if (q && typeof q.question === 'string') return q.question.trim()
        return ''
      })
      .filter(function(q: string) { return q.length > 0 })
      .slice(0, 2)
    // Legacy field — left empty when the model uses the new shape.
    if (!Array.isArray(parsed.mundane_explanations)) parsed.mundane_explanations = []
    if (!Array.isArray(parsed.similar_phenomena)) parsed.similar_phenomena = []

    // Safety net: strip any experiencer-name bylines that slipped past the
    // prompt-level rule. Runs on every generated analysis.
    sanitizeAnalysisResult(parsed as ParadocsAnalysisResult)

    // Validate emotional_tone
    var validTones = ['frightening', 'awe_inspiring', 'ambiguous', 'clinical', 'unsettling', 'hopeful']
    if (parsed.emotional_tone && validTones.indexOf(parsed.emotional_tone) === -1) {
      delete parsed.emotional_tone
    }

    // Validate suggested_category
    var validCategories = [
      'ufos_aliens', 'cryptids', 'ghosts_hauntings', 'psychic_phenomena',
      'consciousness_practices', 'psychological_experiences', 'biological_factors',
      'high_strangeness', 'earth_mysteries', 'time_anomalies', 'technology_ai',
      'folklore_mythology', 'conspiracies', 'other'
    ]
    if (parsed.suggested_category && validCategories.indexOf(parsed.suggested_category) === -1) {
      delete parsed.suggested_category
    }

    // Validate discovery_tags — ensure array of strings, max 6
    if (parsed.discovery_tags) {
      if (!Array.isArray(parsed.discovery_tags)) {
        delete parsed.discovery_tags
      } else {
        parsed.discovery_tags = parsed.discovery_tags
          .filter(function(t: any) { return typeof t === 'string' && t.trim().length > 0 })
          .map(function(t: string) { return t.trim().toLowerCase() })
          .slice(0, 6)
      }
    }

    return parsed as ParadocsAnalysisResult
  } catch (err) {
    console.error('[ParadocsAnalysis] JSON parse failed:', err)
    return null
  }
}

// ============================================
// V10.4 — per-field claim-check + audit log
// ============================================

/**
 * Run claim-check on every text field in a generated analysis
 * result. Failed fields are SET TO NULL so the render layer can
 * decide what to fall back to (the existing UI already handles
 * null narrative / null pull_quote etc.). Every field — pass or
 * fail — gets an ai_rewrite_audit row.
 *
 * Returns the (possibly partially-nullified) result.
 */
async function claimCheckAnalysisFields(
  result: ParadocsAnalysisResult,
  sourceText: string,
  reportId: string,
): Promise<{ result: ParadocsAnalysisResult; failures: string[]; notes: string[] }> {
  var failures: string[] = []
  // V10.6.22 — collect per-field rejection notes so the caller
  // can feed them to a corrective regeneration.
  var notes: string[] = []
  if (!sourceText || !sourceText.trim()) {
    // No source to check against — fail OPEN, log everything as bypassed.
    // The pipeline lib's verifyAndAuditRewrite handles this internally.
  }

  // Fields to verify, with their target output_field labels for
  // the audit log.
  var fields: Array<{ key: keyof ParadocsAnalysisResult; outputField: string; text: string | null }> = [
    { key: 'hook',                 outputField: 'reports.feed_hook',                                  text: result.hook || null },
    { key: 'analysis',             outputField: 'reports.paradocs_narrative',                         text: result.analysis || null },
    { key: 'pull_quote',           outputField: 'reports.paradocs_assessment.pull_quote',             text: result.pull_quote || null },
    { key: 'credibility_signal',   outputField: 'reports.paradocs_assessment.credibility_signal',     text: result.credibility_signal || null },
  ]

  for (var f = 0; f < fields.length; f++) {
    var field = fields[f]
    if (!field.text || !field.text.trim()) continue

    try {
      var check = await verifyAndAuditRewrite({
        output: field.text,
        sourceText: sourceText,
        outputField: field.outputField,
        promptVersion: 'paradocs-analysis-' + PROMPT_VERSION,
        model: ANTHROPIC_MODEL,
        reportId: reportId,
      })
      if (!check.passed) {
        failures.push(field.key as string)
        if (check.notes) notes.push((field.key as string) + ': ' + check.notes)
        // Null out the failed field — render layer handles missing fields.
        ;(result as any)[field.key] = null
      }
    } catch (err: any) {
      console.warn('[ParadocsAnalysis] claim-check error for ' + field.key + ':', err.message || err)
      // Fail-open on error — keep the output text.
    }
  }

  // Verify each mundane_explanation reasoning + explanation text too.
  if (Array.isArray(result.mundane_explanations)) {
    for (var m = 0; m < result.mundane_explanations.length; m++) {
      var me = result.mundane_explanations[m]
      if (!me.reasoning) continue
      try {
        var meCheck = await verifyAndAuditRewrite({
          output: (me.explanation || '') + ' — ' + (me.reasoning || ''),
          sourceText: sourceText,
          outputField: 'reports.paradocs_assessment.mundane_explanations[' + m + ']',
          promptVersion: 'paradocs-analysis-' + PROMPT_VERSION,
          model: ANTHROPIC_MODEL,
          reportId: reportId,
        })
        if (!meCheck.passed) {
          failures.push('mundane_explanation[' + m + ']')
          // Mark for removal rather than nullify in place.
          ;(me as any)._failed = true
        }
      } catch (err: any) {
        console.warn('[ParadocsAnalysis] claim-check error for mundane_explanation[' + m + ']:', err.message || err)
      }
    }
    // Drop failed mundane_explanations entirely.
    result.mundane_explanations = result.mundane_explanations.filter(function(me: any) { return !me._failed })
  }

  return { result, failures, notes }
}

// ============================================
// Core Generation
// ============================================

export async function generateParadocsAnalysis(
  reportId: string,
  /**
   * V10.6.22 — Optional corrective context for retry generation.
   * When the first attempt's output had fields rejected by the
   * claim-check, the caller passes the failed field names + their
   * rejection notes here so the retry prompt explicitly targets
   * the previous mistakes.
   */
  correctiveContext?: { failedFields: string[]; notes?: string | null }
): Promise<ParadocsAnalysisResult | null> {
  var supabase = createServerClient()

  var { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, credibility, source_type, source_label, tags, latitude, longitude, has_photo_video, has_video, has_official_report, witness_count, metadata')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[ParadocsAnalysis] Report not found: ' + reportId + ' error: ' + (fetchError ? fetchError.message : 'no data'))
    return null
  }
  console.log('[ParadocsAnalysis] Fetched report ' + reportId + ' - has description: ' + !!(report as any).description + ', category: ' + (report as any).category)

  // Compute per-report length budget so analysis never exceeds source length.
  var sourceText = (report as any).description || (report as any).summary || ''
  var analysisWordBudget = computeAnalysisWordBudget(sourceText)
  console.log('[ParadocsAnalysis] Report ' + reportId + ' sourceWords=' + countWords(sourceText) + ', analysisBudget=' + analysisWordBudget + ' words')

  var userPrompt = buildUserPrompt(report, analysisWordBudget)

  // V10.6.22 — Append corrective context on retry so the model
  // has explicit negative feedback on what its previous attempt
  // got wrong. Mirrors the answer-line retry pattern from V10.6.20.
  if (correctiveContext && correctiveContext.failedFields.length > 0) {
    userPrompt += '\n\nCRITICAL — YOUR PREVIOUS ATTEMPT WAS REJECTED FOR THESE FIELDS:\n' +
      correctiveContext.failedFields.map(f => '  • ' + f).join('\n') +
      '\n\n' +
      (correctiveContext.notes
        ? 'Claim-check notes from the previous attempt:\n' + correctiveContext.notes + '\n\n'
        : '') +
      'Rewrite the WHOLE analysis JSON. Be MAXIMALLY CONSERVATIVE on the failed fields:\n' +
      '- For ANY claim in the failed fields, use ONLY facts literally stated in the narrative.\n' +
      '- Drop dates unless the year is explicitly in the narrative text (not the title).\n' +
      '- Drop location specifics unless literally stated in the narrative.\n' +
      '- Drop interpretive adjectives (vivid, profound, terrifying, transformative).\n' +
      '- Drop pattern claims ("Paradocs tracks this across...") unless we have stats to cite.\n' +
      '- For the OTHER fields that passed, keep their content largely intact.\n' +
      'If a field cannot be supported under those rules, return INSUFFICIENT for that field.'
  }

  console.log('[ParadocsAnalysis] Generating for: ' + reportId + ' (' + ((report as any).title || 'untitled').substring(0, 40) + ')')

  // B0.7 — daily cost cap check. Done HERE rather than in callClaude
  // because the cap applies only to paradocs_narrative generation,
  // not every Anthropic call in the codebase (the per-user Sonnet
  // surfaces enforce their own caps via E0.7). When the cap is hit,
  // we log a skip event so the admin dashboard sees the bottleneck,
  // and return null — the caller treats this as a transient failure
  // and the report inserts without narrative. Next day's ingestion
  // pass picks up unnarrated reports first.
  var todaysSpend = await getTodaysParadocsSpend(supabase)
  if (todaysSpend >= DAILY_COST_CAP_USD) {
    console.warn(
      '[ParadocsAnalysis] DAILY CAP HIT — skipped ' + reportId +
      ' (spend $' + todaysSpend.toFixed(2) + ' >= cap $' + DAILY_COST_CAP_USD.toFixed(2) + ')'
    )
    await logParadocsCost(supabase, {
      report_id: reportId,
      model: 'skipped',
      input_tokens: null,
      output_tokens: null,
      cost_usd: 0,
      status: 'skipped_cap',
      reason: 'daily_spend=' + todaysSpend.toFixed(4) + ' cap=' + DAILY_COST_CAP_USD.toFixed(2),
    })
    return null
  }

  // Single call, temperature 0.4 for consistent quality
  // 1200 tokens needed — added suggested_category + discovery_tags fields
  // B0.7 — pass reportId so callClaudeOnce can correlate the cost-log row
  var response = await callClaude(SYSTEM_PROMPT, userPrompt, 1800, 0.4, reportId)

  if (response) {
    var result = parseAnalysisJson(response)
    if (result) {
      // Enforce hard cap post-hoc in case the model overran the budget.
      var trimmedAnalysis = trimAnalysisToWords(result.analysis, analysisWordBudget)
      if (trimmedAnalysis !== result.analysis) {
        console.log('[ParadocsAnalysis] Trimmed analysis from ' + countWords(result.analysis) + ' to ' + countWords(trimmedAnalysis) + ' words (budget: ' + analysisWordBudget + ')')
        result.analysis = trimmedAnalysis
      }
      // V10.7.F — first-person pronoun gate on hook + pull_quote. If
      // either field has 1st-person pronouns, blank it and fall through
      // to the retry path. On the retry we accept whatever the next
      // attempt produces (even if still violating — better to ship the
      // rest of the analysis with a null pull_quote than block the row).
      var voiceFails = enforceEditorialVoice(result)
      if (voiceFails.hook.length > 0 || voiceFails.pull_quote.length > 0) {
        console.warn(
          '[ParadocsAnalysis] V10.7.F voice violation on attempt 1 for ' + reportId +
          ' — hook: ' + JSON.stringify(voiceFails.hook) +
          ' pull_quote: ' + JSON.stringify(voiceFails.pull_quote) +
          ' — retrying'
        )
        // Fall through to retry block below.
      } else {
        console.log('[ParadocsAnalysis] Success for ' + reportId + ' (hook: ' + result.hook.length + ' chars, analysis: ' + result.analysis.length + ' chars)')
        return result
      }
    } else {
      console.warn('[ParadocsAnalysis] Parse failed for ' + reportId + '. Raw: ' + response.substring(0, 300))
    }
  } else {
    console.warn('[ParadocsAnalysis] API returned null for ' + reportId)
  }

  // Retry once with fresh call
  console.log('[ParadocsAnalysis] Retrying for ' + reportId)
  await sleep(2000)

  var retryResponse = await callClaude(SYSTEM_PROMPT, userPrompt, 1800, 0.4)
  if (retryResponse) {
    var retryResult = parseAnalysisJson(retryResponse)
    if (retryResult) {
      var retryTrimmed = trimAnalysisToWords(retryResult.analysis, analysisWordBudget)
      if (retryTrimmed !== retryResult.analysis) {
        retryResult.analysis = retryTrimmed
      }
      // V10.7.F — re-apply the voice gate on the retry. If it still
      // violates, accept the result with offending field(s) blanked
      // rather than block ingestion. The save layer will write empty
      // strings, the render layer falls through (the report page hides
      // the pull-quote block when empty), and the audit row preserves
      // the violation so we can spot-check later.
      var retryVoiceFails = enforceEditorialVoice(retryResult)
      if (retryVoiceFails.hook.length > 0 || retryVoiceFails.pull_quote.length > 0) {
        console.warn(
          '[ParadocsAnalysis] V10.7.F voice violation on attempt 2 for ' + reportId +
          ' — hook: ' + JSON.stringify(retryVoiceFails.hook) +
          ' pull_quote: ' + JSON.stringify(retryVoiceFails.pull_quote) +
          ' — accepting with offending field(s) blanked'
        )
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

      // V10.4 — claim-check every text field against the source.
      // Failed fields are nulled out so we never ship fabricated
      // claims to users. Each call writes an ai_rewrite_audit row.
      var supabase = createServerClient()
      var { data: sourceRow } = await (supabase.from('reports') as any)
        .select('description, summary, category')
        .eq('id', reportId)
        .single()
      var sourceForCheck = ((sourceRow && sourceRow.description) || (sourceRow && sourceRow.summary) || '').toString()
      var reportCategory = (sourceRow && sourceRow.category) || null
      var checked = await claimCheckAnalysisFields(result, sourceForCheck, reportId)
      result = checked.result
      if (checked.failures.length > 0) {
        console.warn('[ParadocsAnalysis] claim-check failed for fields: ' + checked.failures.join(', ') + ' (report ' + reportId + ')')

        // V10.6.22 — Self-correcting retry. When any field failed
        // claim-check on the first generation, regenerate the WHOLE
        // analysis JSON with corrective context (failed field names
        // + their rejection notes), then re-verify. If the retry's
        // failures count is strictly less than the first attempt's,
        // we ship the retry instead. Mirrors the V10.6.20 answer-line
        // retry pattern adapted to multi-field JSON output. Cost:
        // ~$0.01 extra per row that needs retry — acceptable for
        // the millions-scale mandate.
        var firstFailureCount = checked.failures.length
        try {
          var retryResult = await generateParadocsAnalysis(reportId, {
            failedFields: checked.failures,
            notes: checked.notes.length > 0 ? checked.notes.join('\n') : null,
          })
          if (retryResult) {
            var retryChecked = await claimCheckAnalysisFields(retryResult, sourceForCheck, reportId)
            console.log('[ParadocsAnalysis] retry: first-attempt failures=' + firstFailureCount + ', retry failures=' + retryChecked.failures.length + ' (report ' + reportId + ')')
            if (retryChecked.failures.length < firstFailureCount) {
              // Retry improved the result — use it.
              result = retryChecked.result
              console.log('[ParadocsAnalysis] retry adopted for ' + reportId + ' (cleared ' + (firstFailureCount - retryChecked.failures.length) + ' field failures)')
            } else {
              console.log('[ParadocsAnalysis] retry did not improve, keeping first attempt for ' + reportId)
            }
          }
        } catch (retryErr: any) {
          console.warn('[ParadocsAnalysis] retry threw, keeping first attempt:', retryErr?.message || retryErr)
        }
      }

      // Build the assessment object (stored as JSONB)
      // V10.6 — writes both legacy + new shape. Legacy field
      // (mundane_explanations) stays in the JSONB but the model
      // outputs an empty array under the new prompt; the report
      // page no longer renders it. New fields (frames +
      // open_questions) drive the analysis section render.
      var assessmentData: Record<string, any> = {
        pull_quote: result.pull_quote,
        credibility_signal: result.credibility_signal,
        frames: result.frames || [],
        open_questions: result.open_questions || [],
        mundane_explanations: result.mundane_explanations || [],
        similar_phenomena: result.similar_phenomena
      }
      if (result.emotional_tone) {
        assessmentData.emotional_tone = result.emotional_tone
      }
      if (result.suggested_category) {
        assessmentData.suggested_category = result.suggested_category
      }
      if (result.discovery_tags && result.discovery_tags.length > 0) {
        assessmentData.discovery_tags = result.discovery_tags
      }

      // Only write to columns known to exist in the schema.
      // New fields (emotional_tone, suggested_category, discovery_tags, category_mismatch)
      // are stored inside paradocs_assessment JSONB.
      if (result.suggested_category && reportCategory && result.suggested_category !== reportCategory) {
        assessmentData.category_mismatch = true
      }

      var updateData: Record<string, any> = {
        feed_hook: result.hook,
        feed_hook_generated_at: new Date().toISOString(),
        paradocs_narrative: result.analysis,
        paradocs_assessment: assessmentData,
        paradocs_analysis_generated_at: new Date().toISOString(),
        paradocs_analysis_model: ANTHROPIC_MODEL
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

/**
 * Diagnostic function — runs the pipeline for a single report and returns
 * a detailed trace of what happened at each step, rather than just pass/fail.
 * Used by the admin endpoint with action: "diagnose".
 */
export async function diagnoseAnalysisGeneration(reportId: string): Promise<Record<string, any>> {
  var trace: Record<string, any> = { reportId: reportId, steps: [] }

  try {
    // Step 1: Check API key
    var apiKey = process.env.ANTHROPIC_API_KEY
    trace.apiKeyPresent = !!apiKey
    trace.apiKeyPrefix = apiKey ? apiKey.substring(0, 15) + '...' : null
    trace.steps.push('api_key_check: ' + (apiKey ? 'found' : 'MISSING'))

    if (!apiKey) return trace

    // Step 2: Fetch report
    var supabase = createServerClient()
    var { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, source_type, source_label, latitude, longitude, has_photo_video, has_official_report, witness_count, metadata')
      .eq('id', reportId)
      .single()

    if (fetchError || !report) {
      trace.fetchError = fetchError ? fetchError.message : 'no data returned'
      trace.steps.push('fetch_report: FAILED')
      return trace
    }
    trace.reportTitle = ((report as any).title || '').substring(0, 60)
    trace.hasDescription = !!(report as any).description
    trace.descriptionLength = ((report as any).description || '').length
    trace.category = (report as any).category
    trace.steps.push('fetch_report: OK')

    // Step 3: Build prompts
    var sourceText = (report as any).description || (report as any).summary || ''
    var budget = computeAnalysisWordBudget(sourceText)
    var userPrompt = buildUserPrompt(report, budget)
    trace.systemPromptLength = SYSTEM_PROMPT.length
    trace.userPromptLength = userPrompt.length
    trace.analysisBudget = budget
    trace.steps.push('build_prompts: OK (sys=' + SYSTEM_PROMPT.length + ', user=' + userPrompt.length + ')')

    // Step 4: Make API call directly (single attempt, no retry)
    var controller = new AbortController()
    var timeoutId = setTimeout(function() { controller.abort() }, 50000)

    var bodyObj = {
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.4
    }

    var startTime = Date.now()
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

    var elapsed = Date.now() - startTime
    trace.apiResponseStatus = resp.status
    trace.apiResponseTime = elapsed + 'ms'

    if (!resp.ok) {
      var errBody = await resp.text().catch(function() { return '(no body)' })
      trace.apiErrorBody = errBody.substring(0, 1000)
      trace.steps.push('api_call: FAILED status=' + resp.status)
      return trace
    }

    trace.steps.push('api_call: OK status=' + resp.status + ' in ' + elapsed + 'ms')

    // Step 5: Parse response
    var data = await resp.json()
    trace.stopReason = data.stop_reason || 'unknown'
    trace.inputTokens = data.usage ? data.usage.input_tokens : null
    trace.outputTokens = data.usage ? data.usage.output_tokens : null

    var rawText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : null
    trace.hasResponseText = !!rawText
    trace.responseLength = rawText ? rawText.length : 0
    trace.responsePreview = rawText ? rawText.substring(0, 500) : null

    if (!rawText) {
      trace.steps.push('parse_response: NO TEXT in response')
      trace.rawContent = JSON.stringify(data.content || null).substring(0, 500)
      return trace
    }

    trace.steps.push('parse_response: got ' + rawText.length + ' chars')

    // Step 6: Parse JSON
    var parsed = parseAnalysisJson(rawText)
    trace.jsonParseSuccess = !!parsed
    if (parsed) {
      trace.steps.push('json_parse: OK')
      trace.parsedFields = Object.keys(parsed)
      trace.hookPreview = parsed.hook ? parsed.hook.substring(0, 80) : null
    } else {
      trace.steps.push('json_parse: FAILED')
      trace.rawResponseTail = rawText.substring(Math.max(0, rawText.length - 200))
    }

    return trace
  } catch (err: any) {
    trace.exception = err.message || String(err)
    trace.exceptionName = err.name || 'Error'
    trace.steps.push('exception: ' + (err.message || String(err)))
    return trace
  }
}

/**
 * Generate and save using proven direct-fetch pattern (bypasses callClaude).
 * This is the working path confirmed by diagnose.
 */
export async function generateAndSaveDirect(reportId: string): Promise<{ success: boolean; error?: string }> {
  try {
    var apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { success: false, error: 'No ANTHROPIC_API_KEY' }

    var supabase = createServerClient()

    // Fetch report
    var { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, credibility, source_type, source_label, tags, latitude, longitude, has_photo_video, has_video, has_official_report, witness_count, metadata')
      .eq('id', reportId)
      .single()

    if (fetchError || !report) {
      return { success: false, error: 'Report not found: ' + (fetchError ? fetchError.message : 'no data') }
    }

    // Build prompts
    var sourceText = (report as any).description || (report as any).summary || ''
    var analysisWordBudget = computeAnalysisWordBudget(sourceText)
    var userPrompt = buildUserPrompt(report, analysisWordBudget)

    // Direct API call (proven working pattern)
    var controller = new AbortController()
    var timeoutId = setTimeout(function() { controller.abort() }, 50000)

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.4
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!resp.ok) {
      var errText = await resp.text().catch(function() { return '' })
      return { success: false, error: 'API ' + resp.status + ': ' + errText.substring(0, 200) }
    }

    var data = await resp.json()
    var rawText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text.trim() : null
    if (!rawText) {
      return { success: false, error: 'Empty API response, stop_reason: ' + (data.stop_reason || 'none') }
    }

    // Parse JSON
    var result = parseAnalysisJson(rawText)
    if (!result) {
      return { success: false, error: 'JSON parse failed. Raw tail: ' + rawText.substring(Math.max(0, rawText.length - 150)) }
    }

    // Trim analysis
    var trimmed = trimAnalysisToWords(result.analysis, analysisWordBudget)
    if (trimmed !== result.analysis) result.analysis = trimmed

    // V10.7.F — apply the editorial-voice (no first-person pronouns)
    // gate to hook + pull_quote. The direct path does a SINGLE call
    // and does not retry on voice failure — we accept the result with
    // offending field(s) blanked rather than block the row. Worst case
    // is a null pull_quote on a small fraction of reports; the
    // multi-attempt orchestrator (generateAndSaveParadocsAnalysis) is
    // the preferred ingestion path and DOES retry. This path exists
    // for one-shot debug / dry-run usage.
    var directVoiceFails = enforceEditorialVoice(result)
    if (directVoiceFails.hook.length > 0 || directVoiceFails.pull_quote.length > 0) {
      console.warn(
        '[ParadocsAnalysis] V10.7.F voice violation (direct path, no retry) for ' + reportId +
        ' — hook: ' + JSON.stringify(directVoiceFails.hook) +
        ' pull_quote: ' + JSON.stringify(directVoiceFails.pull_quote) +
        ' — accepting with offending field(s) blanked'
      )
    }

    // V10.4 — claim-check every text field against the source.
    // Failed fields get nulled out before persistence; audit log
    // captures each call so admin can spot regressions.
    var checked2 = await claimCheckAnalysisFields(result, sourceText, reportId)
    result = checked2.result
    if (checked2.failures.length > 0) {
      console.warn('[ParadocsAnalysis] direct path claim-check failed: ' + checked2.failures.join(', ') + ' (report ' + reportId + ')')
    }

    // Save to DB
    // V10.6 — writes both legacy + new shape. See note in
    // generateAndSaveParadocsAnalysis above for rationale.
    var assessmentData: Record<string, any> = {
      pull_quote: result.pull_quote,
      credibility_signal: result.credibility_signal,
      frames: result.frames || [],
      open_questions: result.open_questions || [],
      mundane_explanations: result.mundane_explanations || [],
      similar_phenomena: result.similar_phenomena
    }
    if (result.emotional_tone) assessmentData.emotional_tone = result.emotional_tone
    if (result.suggested_category) assessmentData.suggested_category = result.suggested_category
    if (result.discovery_tags && result.discovery_tags.length > 0) assessmentData.discovery_tags = result.discovery_tags

    // Store category mismatch flag inside assessment JSONB
    if (result.suggested_category && result.suggested_category !== (report as any).category) {
      assessmentData.category_mismatch = true
    }

    // Only write to columns known to exist in the schema
    var updateData: Record<string, any> = {
      feed_hook: result.hook,
      feed_hook_generated_at: new Date().toISOString(),
      paradocs_narrative: result.analysis,
      paradocs_assessment: assessmentData,
      paradocs_analysis_generated_at: new Date().toISOString(),
      paradocs_analysis_model: ANTHROPIC_MODEL
    }

    var { error: updateError } = await (supabase.from('reports') as any)
      .update(updateData)
      .eq('id', reportId)

    if (updateError) {
      return { success: false, error: 'DB save failed: ' + updateError.message }
    }

    console.log('[ParadocsAnalysis] Direct save OK for ' + reportId)
    return { success: true }

  } catch (err: any) {
    return { success: false, error: 'Exception: ' + (err.message || String(err)) }
  }
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

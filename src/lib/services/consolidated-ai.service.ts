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

// V11.14 — exported so the batch-API worker can build identical
// payloads to what the live ingestion path uses. Same prompt → same
// caching benefit (system prompt is identical between live and batch
// requests).
export var CONSOLIDATED_SYSTEM_PROMPT: string  // assigned below
CONSOLIDATED_SYSTEM_PROMPT = [
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
  'ANOMALY GATE (V11.17.41 — required on every response):',
  '====================================================================',
  '- The final field "anomalous_content_check" is a self-audit. After',
  '  drafting the other fields, look back at the SOURCE TEXT (not your',
  '  rewrite of it) and ask: does this account actually describe an',
  '  anomalous / paranormal / unexplained personal experience that',
  '  Paradocs should archive?',
  '- KEEP (anomalous="yes") — first-hand or close-witness accounts of:',
  '  UFO sightings, encounters with non-human entities, missing time,',
  '  apparitions, hauntings, poltergeist activity, witnessed phenomena,',
  '  precognitive dreams that came true, telepathy, OBE, NDE, sleep',
  '  paralysis with sensed presence, cryptid sightings, witness sketches,',
  '  shared synchronicity, manifestation experiences, and similar.',
  '- ARCHIVE (anomalous="no") — accounts that are NOT actually anomalous',
  '  even when fluent narrative makes them sound like reports:',
  '   - mundane hiking, navigation, dehydration, or outdoor misadventure',
  '     stories (the witness got lost, got dehydrated, took a wrong turn)',
  '   - wildlife encounters where the danger is the animal, not anything',
  '     unexplained (charged by an elephant, snake-bit, swarmed by bees)',
  '   - perceptual-quirk explainers — describing normal optics or',
  '     spatial perception ("trails become invisible from the side") as',
  '     if they were anomalous',
  '   - platform / algorithm / media-bias complaints (YouTube',
  '     recommendations, channel demonetization, debunking narratives)',
  '   - opinion pieces, theory posts, news summaries, advice requests',
  '   - product reviews, equipment troubleshooting, how-to questions',
  '   - personal psychological/emotional change narratives with no',
  '     anomalous element',
  '- Be STRICT. False negatives are recoverable (admin can re-approve',
  '  from pending_review); false positives clutter the live archive.',
  '- If unsure, set anomalous="yes" with confidence <0.7 so the gate',
  '  does NOT fire — uncertainty is not grounds for rejection.',
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
  '  },',
  // V11.17.41 — ingest-time anomaly gate. After CITD-week QA caught
  // YouTube comments being rewritten into fluent feed_hooks despite
  // containing zero anomalous content (hiking misadventures, wildlife
  // pursuits, perceptual-quirk explainers), we added an explicit
  // self-check field. Engine.ts reads paradocs_assessment.
  // anomalous_content_check after persistence and demotes the row to
  // pending_review when anomalous="no" with confidence >= 0.7. Zero
  // marginal cost — same single Haiku call already runs for every
  // ingested report.
  '  "anomalous_content_check": {',
  '    "anomalous": "yes|no",',
  '    "confidence": 0.0-1.0,',
  '    "reason": "<one sentence — required even when anomalous=yes>",',
  '    "genre": "<if anomalous=no, one of: hiking_misadventure | wildlife_encounter | perceptual_quirk | platform_complaint | opinion_theory | advice_request | product_review | news_summary | other_mundane | other; if anomalous=yes, the empty string>"',
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
  'Think of frames as a curator\'s annotations on a museum exhibit. The',
  'exhibit is the witness\'s account; the frames are short signs next to',
  'specific details that say "look at this carefully — here\'s what\'s',
  'notable about it." The curator never claims the artifact is a fake,',
  'never claims it\'s the only one of its kind, never claims they\'ve',
  'figured out exactly what it is. The frames invite the visitor to LOOK.',
  '',
  'BANNED FRAME LABELS (do not produce any frame whose label matches these',
  'shapes — they collapse the experience into a reductive scientific frame):',
  '  - Anything ending in "Hypothesis" — "Sleep Paralysis Hypothesis",',
  '    "Polydrug Synergy Hypothesis", "Hallucination Hypothesis", etc.',
  '  - Anything ending in "Effect" — "Ideomotor Effect", "Priming Effect",',
  '    "Stroboscopic Effect", "Doppler Effect" used dismissively, etc.',
  '  - Anything starting with "Cognitive" / "Psychological" / "Neurological"',
  '  - Anything containing "Bias" / "Hallucination" / "Pareidolia"',
  '  - Anything containing "Construction" / "Confabulation" / "Fabrication"',
  '  - "Sleep Paralysis Neurology" / "DMT Pharmacology" / "REM Intrusion"',
  '    / similar reductive-mechanism labels.',
  '  - "Grief-Driven Narrative" / "Trauma Somatic Memory" / "Memory',
  '    Reconstruction" — these treat the experience as a psychological',
  '    artifact rather than something worth surfacing on its own terms.',
  '  - "Mass Hysteria" / "Folie à Deux" / "Collective Delusion"',
  '  - "Hypnagogic" / "Hypnopompic" used as standalone explanatory labels',
  '    (mentioning them inside a frame body as a feature is OK; using them',
  '    as the FRAME ITSELF is not).',
  '',
  'GOOD FRAME LABELS (descriptive features — these are what we want):',
  '  - "The Recurring Image"  — the visual/element that repeats',
  '  - "The Witness\'s Protocol"  — what the witness did in response',
  '  - "The Threshold Moment"  — when the experience pivoted from one',
  '    state to another',
  '  - "The Physical Aftermath"  — bodily traces that remained',
  '  - "The Soundscape"  — acoustic details that anchor the account',
  '  - "The Visual Signature"  — specific colors, shapes, textures, or',
  '    proportions that recur or define the encounter',
  '  - "The Spatial Anchor"  — the consistent location/positioning of',
  '    the phenomenon (always at the doorway, always in the corner, etc.)',
  '  - "The Temporal Pattern"  — when the phenomenon appears (always at',
  '    3am, always during meditation, always after sleep)',
  '  - "Pattern Across Cases"  — connections to other archetypes (NDE,',
  '    OBE, hat-man, shadow figures, crawler accounts, mothman, sleep',
  '    paralysis canon) WITHOUT claiming the connection EXPLAINS the',
  '    experience. Frame as resonance, not reduction.',
  '  - "The Witness\'s Frame"  — how the witness themselves interpreted',
  '    the experience (their explanatory model, not yours)',
  '  - "The Sensory Progression"  — the order in which different senses',
  '    were engaged (sight first, then sound, then touch)',
  '  - "The Witness\'s Anchor"  — what kept them grounded during the event',
  '  - "The Liminal Setting"  — environmental conditions that bracket the',
  '    experience (between waking/sleep, between rooms, on the edge of a',
  '    body of water, etc.)',
  '  - "The Synchronicity"  — meaningful coincidence the witness noted',
  '  - "The Aftermath Echo"  — what changed for the witness after',
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
  '- Frame bodies can mention mechanism vocabulary if the witness',
  '  themselves used it ("the witness attributes the imagery to PTSD" is',
  '  acceptable because it reports the witness\'s frame, not yours). But',
  '  never write "this is caused by X" or "X explains this" as your own',
  '  editorial position.',
  '- Do NOT use frames to adjudicate between possibilities. Surface the',
  '  feature; let the reader weigh.',
  '- 2-3 frames per report.',
  '',
  'WORKED EXAMPLE — Sleep paralysis report with shadow figure:',
  '  BAD frames (reductive, banned):',
  '    {"label": "REM Intrusion Hypothesis", "body": "Sleep paralysis involves...",}',
  '    {"label": "Hypnagogic Imagery", "body": "The shadow figure may be..."}',
  '    {"label": "Trauma Somatic Memory", "body": "Unprocessed trauma encodes..."}',
  '  GOOD frames (descriptive, what we want):',
  '    {"label": "The Recurring Image", "body": "The shadow figure appears in the same corner of the room across multiple episodes, always tall and faceless. The witness describes its proportions consistently across sessions, suggesting a stable internal image tied to this specific bedroom geometry."}',
  '    {"label": "The Witness\'s Protocol", "body": "On waking, the witness immediately engages a fixed sequence: music, movement, deep breathing. The speed of the response — within seconds — suggests a practiced ritual rather than a reactive scramble. The witness has clearly developed a working model of their own re-grounding."}',
  '    {"label": "Pattern Across Cases", "body": "Shadow figures positioned at the foot of the bed during sleep paralysis appear across thousands of accounts, often described with identical proportions and posture. The hat-man archetype is one variant; this account closely matches its structure without referencing it. Whether this represents shared neurology, archetypal pattern, or genuine cross-witness encounter remains open."}',
  '',
  '====================================================================',
  'ADDITIONAL OPENER GUIDANCE (V11.10 — for context, not direct output):',
  '====================================================================',
  'The source report may have been submitted with an opener that signals',
  'it is more essay, opinion, or theorizing than experience report. Common',
  'shapes:',
  '  - "In my opinion, X" / "First of all, Y" / "I\'d say 99% of the time"',
  '  - "In the West, X is debated" / "In the modern world, Y is"',
  '  - "X is the concept of Y" / "Gematria is the concept of adding letters"',
  '  - "Magick is like water" / analogy-explainer openers',
  '  - "It explains how X" / "We can prove X" theorizing',
  '  - "If you think about it" / "Imagine if" / "What if" hypotheticals',
  '  - "Why have people found it so easy to" rhetorical openers',
  '  - "Well, OP, you got your answer" reply-to-OP markers',
  '',
  'When you see an opener like this, the source is more likely commentary',
  'than experience. The upstream filter should have rejected most of these,',
  'but if one reaches you, focus your analysis on what (if anything) IS a',
  'witnessed event in the body. If the body contains no concrete witnessed',
  'event, return "INSUFFICIENT" for analysis. Do NOT invent an experience',
  'that the source does not describe.',
  '',
  '====================================================================',
  'INTENSITY DISCIPLINE EXAMPLES (apply to analysis, answer_line, pull_quote):',
  '====================================================================',
  'Match the source\'s register exactly. Plain becomes plain. Vivid stays',
  'vivid. Never escalate.',
  '  Source: "slight fever"      →  NOT "fever-stricken" or "ravaged by fever"',
  '  Source: "felt afraid"       →  NOT "terrified" or "horrified"',
  '  Source: "saw a light"       →  NOT "blinded by a brilliant light"',
  '  Source: "the experience felt real" → NOT "deeply transformative"',
  '  Source: "I was confused"    →  NOT "I was utterly disoriented"',
  '  Source: "a few months back" →  NOT "during a recent traumatic period"',
  '  Source: "I couldn\'t move"   →  "the witness could not move" (preserve;',
  '                                 do not amplify to "was paralyzed in terror")',
  '',
  '====================================================================',
  'HEDGE VOICE EXAMPLES (apply to answer_line, feed_hook):',
  '====================================================================',
  'Use hedge voice in summary fields to attribute claims to the source:',
  '  GOOD: "The source describes a recurring sleep paralysis episode..."',
  '  GOOD: "The report records a Witnessed encounter..."',
  '  GOOD: "A 19-year-old reports an out-of-body experience..."',
  '  GOOD: "A medium describes a series of psychic openings..."',
  '  GOOD: "The witness recalls hearing..."',
  '  BAD: "A witness had a real out-of-body experience..."',
  '  BAD: "The witness clearly saw an alien craft..."',
  '  BAD: "An undeniable cryptid encounter occurred..."',
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

// V11.14 — exported for batch worker reuse.
export function buildConsolidatedUserPrompt(report: any): string {
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

  var saved = await persistConsolidatedResult(supabase, reportId, p, (report as any).category, (report as any).title)
  if (!saved.ok) {
    return { success: false, cost: result.costUsd, error: saved.error }
  }

  console.log('[ConsolidatedAI] Saved all fields for ' + reportId + ' (title: ' + (p.title || '').substring(0, 40) + '...)')
  return { success: true, cost: result.costUsd, parsed: p }
}

/**
 * V11.14 — Persistence helper extracted so the batch-API worker can
 * reuse it. Takes a parsed consolidated JSON result and writes every
 * AI field to the right DB column. Returns { ok, error? }.
 *
 * Used by:
 *   - generateAndSaveConsolidatedAI (live ingestion, single-shot Haiku)
 *   - scripts/batch-ingest-worker.ts (mass-mode batch Haiku, 50% off)
 *
 * Schema:
 *   - reports.title — overwritten with parsed.title when present
 *   - reports.feed_hook — parsed.feed_hook
 *   - reports.answer_line — parsed.answer_line
 *   - reports.paradocs_narrative — parsed.analysis
 *   - reports.paradocs_assessment (JSONB) — pull_quote, frames, etc.
 *   - reports.witness_profile (JSONB) — demographics
 *   - reports.paradocs_analysis_generated_at — now
 *   - reports.paradocs_analysis_model — HAIKU_MODEL + ' (consolidated)'
 *     or HAIKU_MODEL + ' (consolidated-batch)' depending on caller
 */
export async function persistConsolidatedResult(
  supabase: any,
  reportId: string,
  parsed: any,
  reportCategory: string | null,
  fallbackTitle: string | null,
  modelMarker?: string,
): Promise<{ ok: boolean; error?: string }> {
  var p = parsed
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
    // V11.17.41 — anomaly self-check from the same Haiku call. Engine.ts
    // reads this after persistence and demotes the row to pending_review
    // when anomalous="no" + confidence>=0.7. Stored verbatim so admins
    // can review the reason + genre on the pending-review queue.
    anomalous_content_check: normalizeAnomalyCheck(p.anomalous_content_check),
  }
  if (p.suggested_category && reportCategory && p.suggested_category !== reportCategory) {
    assessmentData.category_mismatch = true
  }

  // Build witness profile JSONB
  var wp = p.witness_profile || {}
  // V11.14.8 — normalizeAgeRange: Haiku occasionally returns the raw
  // age ("16", "37 ", "thirties") instead of bucketing to the enum.
  // The WitnessProfilePill component only renders chips for valid enum
  // keys, so the literal age silently drops from the UI. Defensive
  // mapping covers all the common breakdowns we've seen.
  // V11.17.41 — defensive: Haiku may return string variants ("Yes"/"YES"/"true"),
  // missing fields, or odd confidence formats. Normalize into a canonical
  // shape so engine.ts can read it deterministically.
  function normalizeAnomalyCheck(raw: any): { anomalous: 'yes' | 'no' | 'unknown'; confidence: number; reason: string; genre: string } {
    var def = { anomalous: 'unknown' as 'yes' | 'no' | 'unknown', confidence: 0, reason: '', genre: '' }
    if (!raw || typeof raw !== 'object') return def
    var aRaw = String(raw.anomalous ?? '').toLowerCase().trim()
    var a: 'yes' | 'no' | 'unknown' = 'unknown'
    if (aRaw === 'yes' || aRaw === 'true' || aRaw === 'y') a = 'yes'
    else if (aRaw === 'no' || aRaw === 'false' || aRaw === 'n') a = 'no'
    var c = typeof raw.confidence === 'number' ? raw.confidence : parseFloat(String(raw.confidence ?? ''))
    if (isNaN(c)) c = 0
    if (c < 0) c = 0
    if (c > 1) c = 1
    var reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 500) : ''
    var genre = typeof raw.genre === 'string' ? raw.genre.slice(0, 60) : ''
    return { anomalous: a, confidence: c, reason: reason, genre: genre }
  }
  function normalizeAgeRange(raw: any): string {
    if (typeof raw !== 'string') return 'unspecified'
    var trimmed = raw.trim().toLowerCase()
    var VALID = ['child', 'teen', '18-29', '30-49', '50-69', '70+', 'unspecified']
    if (VALID.indexOf(trimmed) !== -1) return trimmed
    // Numeric age: "16" / "16 " / "16f" / "16m"
    var numMatch = trimmed.match(/^(\d{1,3})(?:\s*[fm]|\s*y(?:ears?)?|\s*old)?$/)
    if (numMatch) {
      var n = parseInt(numMatch[1], 10)
      if (n >= 0 && n <= 12) return 'child'
      if (n >= 13 && n <= 17) return 'teen'
      if (n >= 18 && n <= 29) return '18-29'
      if (n >= 30 && n <= 49) return '30-49'
      if (n >= 50 && n <= 69) return '50-69'
      if (n >= 70 && n <= 120) return '70+'
    }
    // Range: "16-20" / "30s" / "early 40s"
    var rangeMatch = trimmed.match(/(\d{1,3})\s*(?:s|-|to|–)/)
    if (rangeMatch) {
      var rn = parseInt(rangeMatch[1], 10)
      if (rn >= 0 && rn <= 12) return 'child'
      if (rn >= 13 && rn <= 17) return 'teen'
      if (rn >= 18 && rn <= 29) return '18-29'
      if (rn >= 30 && rn <= 49) return '30-49'
      if (rn >= 50 && rn <= 69) return '50-69'
      if (rn >= 70) return '70+'
    }
    // Word descriptors
    if (/\b(kid|child|toddler|infant|baby|preschool|elementary)\b/.test(trimmed)) return 'child'
    if (/\b(teen|teenager|adolescent|high\s+school|middle\s+school)\b/.test(trimmed)) return 'teen'
    if (/\b(twent|college|young\s+adult)\b/.test(trimmed)) return '18-29'
    if (/\b(thirt|fort)\b/.test(trimmed)) return '30-49'
    if (/\b(fift|sixt)\b/.test(trimmed)) return '50-69'
    if (/\b(senior|elder|retir|old\s+age|sevent|eight|ninet|nonagenarian)\b/.test(trimmed)) return '70+'
    return 'unspecified'
  }
  // Likewise sanitize gender / state_at_event so out-of-band Haiku
  // strings ("37m", "drowsy") still land on valid enum values.
  function normalizeGender(raw: any): string {
    if (typeof raw !== 'string') return 'unspecified'
    var t = raw.trim().toLowerCase()
    if (t === 'male' || t === 'female' || t === 'nonbinary' || t === 'unspecified') return t
    if (/^\d+\s*m$/.test(t) || t === 'm' || t === 'man' || t === 'boy' || t === 'masculine') return 'male'
    if (/^\d+\s*f$/.test(t) || t === 'f' || t === 'woman' || t === 'girl' || t === 'feminine') return 'female'
    if (t === 'nb' || t === 'non-binary' || t === 'non binary') return 'nonbinary'
    return 'unspecified'
  }
  function normalizeState(raw: any): string {
    if (typeof raw !== 'string') return 'unspecified'
    var t = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
    var VALID = ['awake_alert', 'meditation', 'drowsy_falling_asleep', 'sleeping', 'driving', 'physical_activity', 'intoxicated', 'unspecified']
    if (VALID.indexOf(t) !== -1) return t
    if (/awake/.test(t)) return 'awake_alert'
    if (/medit/.test(t)) return 'meditation'
    if (/drows|tired|falling/.test(t)) return 'drowsy_falling_asleep'
    if (/sleep|asleep|dream/.test(t)) return 'sleeping'
    if (/driv|car|highway/.test(t)) return 'driving'
    if (/exercis|workout|hiking|running|active/.test(t)) return 'physical_activity'
    if (/drunk|high|intoxic|psyched|trip/.test(t)) return 'intoxicated'
    return 'unspecified'
  }
  var witnessProfile: Record<string, any> = {
    gender: normalizeGender(wp.gender),
    age_range: normalizeAgeRange(wp.age_range),
    occupation_category: wp.occupation_category || 'unspecified',
    state_at_event: normalizeState(wp.state_at_event),
    with_others: wp.with_others === undefined ? null : wp.with_others,
    prior_similar_experience: wp.prior_similar_experience === undefined ? null : wp.prior_similar_experience,
    confidence: typeof wp.confidence === 'number' ? wp.confidence : 0.5,
  }

  var updateData: Record<string, any> = {
    title: p.title || fallbackTitle,
    feed_hook: p.feed_hook || null,
    answer_line: p.answer_line || null,
    paradocs_narrative: p.analysis || null,
    paradocs_assessment: assessmentData,
    witness_profile: witnessProfile,
    paradocs_analysis_generated_at: new Date().toISOString(),
    paradocs_analysis_model: HAIKU_MODEL + ' (' + (modelMarker || 'consolidated') + ')',
    feed_hook_generated_at: new Date().toISOString(),
  }

  var { error: updateError } = await (supabase.from('reports') as any)
    .update(updateData)
    .eq('id', reportId)

  if (updateError) {
    console.error('[ConsolidatedAI] DB save error for ' + reportId + ': ' + updateError.message)
    return { ok: false, error: 'db_save_failed: ' + updateError.message }
  }
  return { ok: true }
}

/**
 * Helper: returns true if env says we should use the consolidated path.
 */
export function isConsolidatedAIEnabled(): boolean {
  var raw = process.env.USE_CONSOLIDATED_AI
  if (!raw) return false
  return String(raw).toLowerCase() === 'true' || raw === '1'
}

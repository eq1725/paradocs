#!/usr/bin/env tsx
/**
 * V11.13 A/B sample — Consolidated single-call Haiku vs current multi-call pipeline.
 *
 * Reads the 16 approved smoke #12 reports from the DB (their current
 * multi-call output is already populated: title, paradocs_narrative,
 * paradocs_assessment, feed_hook, answer_line, witness_profile).
 * Runs a single Haiku call against each source body with a consolidated
 * system prompt that requests all fields in one JSON. Generates a
 * side-by-side markdown report so Chase can pick:
 *   (i) Consolidated  — cheaper at scale, single failure mode
 *   (ii) Keep multi-call — current quality, already-cached
 *
 * No production code is touched by this script. The new Haiku output
 * is not written to the DB — it's only captured in the comparison
 * markdown.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ab-consolidated-vs-multicall.ts
 *
 * Output:
 *   outputs/ab-consolidated-{timestamp}.md
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from env')
  process.exit(1)
}
var HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// =========================================================================
// CONSOLIDATED SYSTEM PROMPT
// =========================================================================
// Combines essential rules from compelling-title.service, paradocs-analysis,
// answer-line.service, feed-hook.service, witness-profile.service into one
// prompt that requests every report-page + discover-feed field in a single
// JSON response.

var CONSOLIDATED_SYSTEM_PROMPT = [
  'You are the editorial intelligence behind Paradocs, the world\'s most credible',
  'paranormal research platform. Your job is to produce ALL the AI-generated fields',
  'for a submitted report in a SINGLE structured JSON response.',
  '',
  '====================================================================',
  'EPISTEMIC STANCE (read first, applies to every field):',
  '====================================================================',
  '- Paradocs treats anecdotal reports as primary data. Hold multiple frames',
  '  simultaneously. Never reflexively privilege materialist OR consciousness-',
  '  primacy interpretations — both are valid lenses worth surfacing.',
  '- Never editorialize about whether the event "really happened." Analyze',
  '  what the report contains and what it suggests.',
  '- Evidence-first. Never credulous, never dismissive. Tone of a seasoned',
  '  investigator who has seen a lot and is genuinely intrigued by this one.',
  '',
  '====================================================================',
  'ANTI-FABRICATION HARD RULES (apply to every field):',
  '====================================================================',
  '- Every concrete claim (numbers, dates, locations, names, durations,',
  '  measurements, identifiers) MUST appear in the source text. Never',
  '  invent. Never extrapolate beyond what the source states.',
  '- Match source intensity. "slight fever" → NOT "fever-stricken".',
  '  "felt afraid" → NOT "terrified".',
  '- NEVER include precise clock times (e.g. "at 21:19"). Vague is OK',
  '  ("after midnight").',
  '- NEVER include the experiencer\'s name, initials, handle, or username.',
  '- NEVER include phone numbers, email addresses, or street addresses.',
  '- If the source is too sparse to support a field faithfully, return',
  '  the literal string "INSUFFICIENT" for that field. Do not invent.',
  '',
  '====================================================================',
  'V10.7.F HARD EDITORIAL-VOICE RULE (applies to hook, feed_hook, pull_quote, title):',
  '====================================================================',
  '- THIRD-PERSON EDITORIAL VOICE ONLY. Never use first-person pronouns:',
  '  I, me, my, mine, we, us, our, ours.',
  '- Use "the witness", "the experiencer", "the figure", "the object",',
  '  "she", "he", "they". Default to "they" unless the source explicitly',
  '  states the witness\'s gender. A first-person account does NOT',
  '  establish gender. A masculine first name does NOT establish gender.',
  '  When in doubt, write "the witness" or "they". Misgendering is a',
  '  deeper failure than awkward prose.',
  '',
  '====================================================================',
  'STRUCTURE — Return ONLY valid JSON (no markdown fences, no commentary):',
  '====================================================================',
  '{',
  '  "title": "<4-9 words, title case, phenomenon-first newspaper headline>",',
  '  "answer_line": "<1-2 sentences, max 280 chars total, hedge voice TL;DR>",',
  '  "hook": "<1 sentence, max 25 words, open-loop, third-person>",',
  '  "feed_hook": "<2 sentences, 30-55 words, for /discover feed>",',
  '  "pull_quote": "<1 sentence, max 20 words, screenshot-worthy, third-person>",',
  '  "analysis": "<2-3 paragraphs separated by \\\\n\\\\n, max 200 words total, the editorial narrative>",',
  '  "credibility_signal": "<1 phrase, max 8 words>",',
  '  "frames": [{"label": "<2-4 word lens name>", "body": "<2-4 sentences, ~40-80 words>"}],',
  '  "open_questions": ["<1-3 inquiry-voice questions, 10-20 words each>"],',
  '  "similar_phenomena": ["<2-3 related phenomenon names>"],',
  '  "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful",',
  '  "suggested_category": "ufos_aliens|cryptids|ghosts_hauntings|psychic_phenomena|consciousness_practices|psychological_experiences|perception_sensory|religion_mythology|esoteric_practices",',
  '  "discovery_tags": ["<3-6 plain-language tags for user-facing discovery>"],',
  '  "witness_profile": {',
  '    "gender": "male|female|nonbinary|unspecified",',
  '    "age_range": "child|teen|young_adult|adult|middle_aged|senior|unspecified",',
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
  '- BANNED LEAD-INS: "Witness Reports X", "Researcher Struggles With X",',
  '  "Seeker Pursues X", "Medium Reports X", "Practitioner Describes X",',
  '  etc. These read like news copy ABOUT a witness, not the experience.',
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
  '- Lead with the most identifying details: phenomenon type, distinctive',
  '  detail, when, where, who, notable sequel — in that priority order.',
  '- Use hedge voice: "the source describes…", "the report records…",',
  '  "A 19-year-old reports…".',
  '- INTENSITY DISCIPLINE: do NOT dramatize beyond what the source says.',
  '',
  '====================================================================',
  'HOOK (inline on report page) RULES:',
  '====================================================================',
  '- 1 sentence, max 25 words. Present tense.',
  '- Start with the most unusual, specific element. Create an open loop.',
  '- Never start with "A witness" or "In [year]".',
  '- THIRD-PERSON ONLY (V10.7.F).',
  '',
  '====================================================================',
  'FEED_HOOK (for /discover) RULES:',
  '====================================================================',
  '- Exactly 2 sentences, 30-55 words.',
  '- Sentence 1: identification + event (phenomenon type, who/where/when).',
  '- Sentence 2: the single most striking detail or unresolved tension',
  '  from the source. The thing that makes a scroller tap.',
  '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie,',
  '  chilling, haunting, bizarre, strange, peculiar.',
  '- BANNED patterns: rhetorical questions, "This report…", "What if…".',
  '- THIRD-PERSON ONLY.',
  '',
  '====================================================================',
  'PULL_QUOTE RULES (critical — renders as a hero blockquote on the page):',
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
  '- 2-3 short paragraphs separated by \\n\\n. 4 paragraphs OK if source is rich.',
  '- Max 200 words total. The narrative IS the page body, NOT a summary.',
  '- Suggested beat sequence: SETUP (where/what doing) → THE EXPERIENCE',
  '  (anomaly, sensory details) → REACTION + AFTERMATH (response, traces) →',
  '  CONTEXT (optional, only if source supports).',
  '- Lead with a grounding sensory anchor. NOT a metadata inventory.',
  '- Capture specific observational details: heights, durations, distances,',
  '  sounds, colors, behaviors, smells — preserve as source recorded them.',
  '- BANNED PHRASES: "conflates expectation with observation", "the witness',
  '  anticipated X and interpreted Y as confirmation", "expectation-setting",',
  '  "pattern-seeking", "confirmation bias", "apophenia", "priming effect",',
  '  "observer bias", "difficult to disentangle expectation from experience".',
  '  These collapse the mystery into reductive cognitive-bias frames.',
  '- THIRD-PERSON throughout. May use "they/them/their" if gender is',
  '  unestablished.',
  '',
  '====================================================================',
  'FRAMES (alternative explanations) RULES:',
  '====================================================================',
  '- 2-3 frames. Each frame is a different lens through which to view the',
  '  same source material. Examples: "Sleep Paralysis Hypothesis",',
  '  "Hypnagogic Imagery", "Genuine Encounter", "Cultural Memory".',
  '- Each frame body is 2-4 sentences (40-80 words) explaining what this',
  '  lens implies about the report. Do not adjudicate between frames —',
  '  surface them, let the reader weigh.',
  '',
  '====================================================================',
  'WITNESS_PROFILE RULES:',
  '====================================================================',
  '- Infer ONLY from what the source text states. Default to "unspecified"',
  '  when the source is silent.',
  '- gender: only "male"/"female"/"nonbinary" if source EXPLICITLY states it',
  '  ("my wife", "I\'m a 40-year-old man", "she told me"). First-person',
  '  account does NOT establish gender. Default "unspecified".',
  '- age_range: child (≤12), teen (13-19), young_adult (20-29), adult (30-49),',
  '  middle_aged (50-64), senior (65+), unspecified.',
  '- state_at_event: what the witness was doing physically/mentally at the',
  '  moment of the experience. "awake_alert" is the default for daytime',
  '  experiences with no other state clue.',
  '- confidence: 0.0-1.0 reflecting how well the source supports the profile.',
  '  Single first-person body with most fields inferred → ~0.6. Detailed',
  '  source with explicit demographics → ~0.9.',
  '',
  'Return ONLY the JSON. No markdown fences. No commentary before or after.',
].join('\n')

// =========================================================================
// USER PROMPT BUILDER
// =========================================================================

function buildUserPrompt(report: any): string {
  var parts: string[] = []
  if (report.title) parts.push('Original source title: ' + report.title)
  if (report.category) parts.push('Pre-assigned category: ' + report.category)
  if (report.location_name) parts.push('Location (if any): ' + report.location_name)
  if (report.event_date) parts.push('Event date (if any): ' + report.event_date)
  if (report.source_type) parts.push('Source type: ' + report.source_type)
  if (report.source_label) parts.push('Source label: ' + report.source_label)
  parts.push('')
  parts.push('FULL SOURCE TEXT:')
  parts.push((report.description || '').substring(0, 5000))
  return parts.join('\n')
}

// =========================================================================
// HAIKU API CALL (with prompt caching)
// =========================================================================

async function callHaikuConsolidated(report: any): Promise<{
  raw: string | null
  parsed: any
  usage: { input: number; output: number; cache_w: number; cache_r: number }
  costUsd: number
}> {
  var userPrompt = buildUserPrompt(report)
  var bodyObj = {
    model: HAIKU_MODEL,
    max_tokens: 2500,
    system: [
      {
        type: 'text',
        text: CONSOLIDATED_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.4,
  }

  var resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(bodyObj),
  })

  if (!resp.ok) {
    var errText = await resp.text().catch(function () { return '' })
    console.error('API error ' + resp.status + ': ' + errText.substring(0, 300))
    return { raw: null, parsed: null, usage: { input: 0, output: 0, cache_w: 0, cache_r: 0 }, costUsd: 0 }
  }

  var data = await resp.json()
  var inputTokens = (data.usage && data.usage.input_tokens) || 0
  var outputTokens = (data.usage && data.usage.output_tokens) || 0
  var cacheW = (data.usage && data.usage.cache_creation_input_tokens) || 0
  var cacheR = (data.usage && data.usage.cache_read_input_tokens) || 0

  // Haiku 4.5 pricing
  var costUsd =
    (inputTokens / 1_000_000) * 1.0 +
    (cacheW / 1_000_000) * 1.25 +
    (cacheR / 1_000_000) * 0.10 +
    (outputTokens / 1_000_000) * 5.0

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
    } catch (e: any) {
      console.warn('Parse failed: ' + (e.message || e))
    }
  }

  return {
    raw: rawText,
    parsed: parsed,
    usage: { input: inputTokens, output: outputTokens, cache_w: cacheW, cache_r: cacheR },
    costUsd: costUsd,
  }
}

// =========================================================================
// MARKDOWN COMPARISON RENDERER
// =========================================================================

function fieldDiffSection(label: string, current: any, consolidated: any): string {
  var c = current === null || current === undefined ? '*(empty)*' : (typeof current === 'string' ? current : JSON.stringify(current, null, 2))
  var n = consolidated === null || consolidated === undefined ? '*(empty)*' : (typeof consolidated === 'string' ? consolidated : JSON.stringify(consolidated, null, 2))
  return [
    '#### ' + label,
    '',
    '**Current (multi-call):**  ',
    c,
    '',
    '**Consolidated (single-call):**  ',
    n,
    '',
  ].join('\n')
}

function renderReportComparison(report: any, consolidated: any): string {
  var sections: string[] = []
  sections.push('---')
  sections.push('## ' + (report.title || '(no title)'))
  sections.push('slug: `' + report.slug + '`')
  sections.push('')

  if (!consolidated.parsed) {
    sections.push('**⚠ Consolidated call failed to produce parseable JSON.**')
    sections.push('')
    sections.push('Raw output (first 500 chars):')
    sections.push('```')
    sections.push((consolidated.raw || '(null)').substring(0, 500))
    sections.push('```')
    return sections.join('\n')
  }

  var p = consolidated.parsed
  var assess = report.paradocs_assessment || {}

  sections.push(fieldDiffSection('Title', report.title, p.title))
  sections.push(fieldDiffSection('Answer line', report.answer_line, p.answer_line))
  sections.push(fieldDiffSection('Pull quote', assess.pull_quote, p.pull_quote))
  sections.push(fieldDiffSection('Hook (inline)', null /* not separately stored */, p.hook))
  sections.push(fieldDiffSection('Feed hook (/discover)', report.feed_hook, p.feed_hook))
  sections.push(fieldDiffSection('Analysis (narrative)', report.paradocs_narrative, p.analysis))
  sections.push(fieldDiffSection('Frames', assess.frames, p.frames))
  sections.push(fieldDiffSection('Open questions', assess.open_questions, p.open_questions))
  sections.push(fieldDiffSection('Similar phenomena', assess.similar_phenomena, p.similar_phenomena))
  sections.push(fieldDiffSection('Emotional tone', assess.emotional_tone, p.emotional_tone))
  sections.push(fieldDiffSection('Suggested category', assess.suggested_category || report.category, p.suggested_category))
  sections.push(fieldDiffSection('Discovery tags', assess.discovery_tags, p.discovery_tags))
  sections.push(fieldDiffSection('Witness profile', report.witness_profile, p.witness_profile))

  return sections.join('\n')
}

// =========================================================================
// MAIN
// =========================================================================

async function main() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  var sb = createClient(supabaseUrl, supabaseKey)

  console.log('Loading approved smoke #12 reports…')
  var r = await sb
    .from('reports')
    .select('id, slug, title, description, category, location_name, event_date, source_type, source_label, paradocs_narrative, paradocs_assessment, feed_hook, answer_line, witness_profile')
    .eq('status', 'approved')
    .neq('source_type', 'user_submission')
    .neq('source_type', 'editorial')
    .neq('source_type', 'curated')
    .order('created_at', { ascending: false })
    .limit(16)

  if (r.error) {
    console.error('DB error: ' + r.error.message)
    process.exit(1)
  }
  var reports = r.data || []
  console.log('Got ' + reports.length + ' reports.')

  var mdSections: string[] = []
  mdSections.push('# A/B Comparison — Consolidated single-call vs current multi-call')
  mdSections.push('')
  mdSections.push('Generated: ' + new Date().toISOString())
  mdSections.push('')
  mdSections.push('For each report, the **Current** column shows what the existing')
  mdSections.push('multi-call pipeline produced (already in the DB from smoke #12 ingestion +')
  mdSections.push('admin approval). The **Consolidated** column shows what a single Haiku')
  mdSections.push('call with the new consolidated prompt produced from the same source body.')
  mdSections.push('')

  var totalCost = 0
  var successCount = 0
  var parseFailCount = 0

  for (var i = 0; i < reports.length; i++) {
    var rep = reports[i] as any
    console.log('[' + (i + 1) + '/' + reports.length + '] ' + (rep.title || '(no title)').substring(0, 50))
    try {
      var consolidated = await callHaikuConsolidated(rep)
      totalCost += consolidated.costUsd
      if (consolidated.parsed) successCount++
      else parseFailCount++

      console.log('  in=' + consolidated.usage.input + ' out=' + consolidated.usage.output +
        ' cache_w=' + consolidated.usage.cache_w + ' cache_r=' + consolidated.usage.cache_r +
        '  cost=$' + consolidated.costUsd.toFixed(5) +
        '  parsed=' + (!!consolidated.parsed))

      mdSections.push(renderReportComparison(rep, consolidated))
      mdSections.push('')

      // brief pause between calls to be polite to the API
      await new Promise(function (resolve) { setTimeout(resolve, 500) })
    } catch (e: any) {
      console.error('  ERROR: ' + (e.message || e))
      mdSections.push('---')
      mdSections.push('## ' + (rep.title || '(no title)'))
      mdSections.push('**ERROR**: ' + (e.message || e))
      mdSections.push('')
    }
  }

  mdSections.push('---')
  mdSections.push('')
  mdSections.push('## Summary')
  mdSections.push('')
  mdSections.push('- Reports processed: **' + reports.length + '**')
  mdSections.push('- Consolidated call parsed JSON cleanly: **' + successCount + '** / ' + reports.length)
  mdSections.push('- Consolidated call parse failures: **' + parseFailCount + '**')
  mdSections.push('- Total A/B cost: **$' + totalCost.toFixed(4) + '**')
  mdSections.push('- Average per-report (consolidated, A/B run): **$' + (totalCost / reports.length).toFixed(5) + '**')
  mdSections.push('')

  var outPath = path.join('outputs', 'ab-consolidated-' + Date.now() + '.md')
  fs.mkdirSync('outputs', { recursive: true })
  fs.writeFileSync(outPath, mdSections.join('\n'))
  console.log('\nWrote ' + outPath)
  console.log('Total cost: $' + totalCost.toFixed(4))
  console.log('Avg per-report: $' + (totalCost / reports.length).toFixed(5))
  console.log('Parse success: ' + successCount + '/' + reports.length)
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})

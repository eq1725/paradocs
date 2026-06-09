// V11.18.4 — Sprint 1B — seed-patterns-v1.ts
//
// Promotes the priority cross-category descriptors into
// `findings_catalogue` rows by counting their occurrences in the live
// corpus and synthesizing a one-sentence interpretive gloss with
// Claude Haiku 4.5 (live API, ~$0.005 per finding × 10 = $0.05/run).
//
// Sprint 1B coverage — 10 patterns from PATTERNS_TAXONOMY.md §4:
//   1. shadow_figure                  (already shipped — preserved)
//   2. tunnel_imagery                 (mapping fix → psych_exp included)
//   3. electromagnetic_disturbance    (expanded keyword set)
//   4. obe_observer_from_above        (new in 1B)
//   5. paralysis                      (new in 1B)
//   6. time_dilation                  (new in 1B)
//   7. hypnagogic_state               (new in 1B — uses witness_state_pct
//                                       not text scan)
//   8. sensed_presence                (new in 1B)
//   9. reunion_with_deceased          (new in 1B — WOO, Helena copy-pass)
//  10. animal_witness_reaction        (new in 1B)
//
// Usage:
//   npx tsx scripts/seed-patterns-v1.ts                   # dry-run (default)
//   npx tsx scripts/seed-patterns-v1.ts --apply           # UPSERTs preserving founder copy
//   npx tsx scripts/seed-patterns-v1.ts --apply --force-update-copy
//                                                         # overwrites
//                                                         # interpretive_sentence
//                                                         # even on existing rows
//
// Idempotency contract — preservation of founder edits:
//   When a row already exists for a slug, the script INSERTs missing
//   columns but does NOT overwrite `interpretive_sentence` unless one of:
//     (a) the existing column is NULL,
//     (b) the existing column exactly matches a previous Haiku output we
//         remembered (we don't have history, so practically: matches the
//         template fallback we'd emit now),
//     (c) `--force-update-copy` is passed.
//   Counts and family bindings ARE always refreshed (those are pure
//   data; the founder edits prose, not numbers).
//
// Cost: 10 Haiku calls × ~$0.005 ≈ $0.05 per --apply run with prose
// refresh. With --counts-only (used by the nightly cron) cost = $0.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  executeQuery,
  humanizeFamily,
} from '../src/lib/lab/hints/data-query-executor'
import type {
  HintDataQuery,
  HintToken,
  DescriptorFamily,
} from '../src/lib/lab/hints/data-query-types'
import type { HintCategory } from '../src/lib/lab/hints/hint-schema'
import { DESCRIPTOR_VOCAB } from '../src/lib/patterns/descriptor-vocabulary'

var APPLY = process.argv.includes('--apply')
var FORCE_UPDATE_COPY = process.argv.includes('--force-update-copy')
var COUNTS_ONLY = process.argv.includes('--counts-only')

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/* -------------------------------------------------------------------------- */
/* Pattern publish list                                                       */
/* -------------------------------------------------------------------------- */

interface PatternConfig {
  descriptor: DescriptorFamily
  // Explicit family choice — overrides the vocabulary default if set.
  families: [HintCategory, HintCategory, HintCategory] | [HintCategory, HintCategory]
  // Witness-state alternate path (per PATTERNS_GAPS Fix 4).
  // When set, the counts are pulled from witness_state_at_event = <value>
  // joined against the family, instead of via keyword scan.
  witness_state?: 'drowsy_falling_asleep'
  // Editorial guardrail — when true the seed script flags the row for
  // mandatory Helena copy-pass before publish. Sets `helena_review_required`
  // in the dry-run output; the operator carries the policy forward into
  // the publish workflow.
  helena_review_required?: boolean
  publish_order: number
}

var PATTERN_CONFIGS: PatternConfig[] = [
  // 1. shadow_figure — preserved as the V11.18.3 hand-edited row. We
  //    still emit a payload so the counts refresh, but the seed marks
  //    the slug for non-clobbering UPSERT.
  {
    descriptor: 'shadow_figure',
    families: ['perception_sensory', 'ghosts_hauntings', 'ufos_aliens'],
    publish_order: 1,
  },
  // 2. tunnel_imagery — psychological_experiences added (gap memo Fix 3).
  {
    descriptor: 'tunnel_imagery',
    families: ['psychological_experiences', 'consciousness_practices', 'perception_sensory'],
    publish_order: 2,
  },
  // 3. electromagnetic_disturbance — expanded keyword set.
  {
    descriptor: 'electromagnetic_disturbance',
    families: ['ufos_aliens', 'ghosts_hauntings', 'cryptids'],
    publish_order: 3,
  },
  // 4. obe_observer_from_above — NDE/OBE/SP triple.
  {
    descriptor: 'obe_observer_from_above',
    families: ['psychological_experiences', 'consciousness_practices', 'perception_sensory'],
    publish_order: 4,
  },
  // 5. paralysis — SP / NDE-onset / abduction triple.
  {
    descriptor: 'paralysis',
    families: ['perception_sensory', 'psychological_experiences', 'ufos_aliens'],
    publish_order: 5,
  },
  // 6. time_dilation — NDE / consciousness-practice / UFO triple.
  {
    descriptor: 'time_dilation',
    families: ['psychological_experiences', 'consciousness_practices', 'ufos_aliens'],
    publish_order: 6,
  },
  // 7. hypnagogic_state — uses witness_state_pct path (gap memo Fix 4).
  {
    descriptor: 'hypnagogic_state',
    families: ['perception_sensory', 'consciousness_practices', 'psychological_experiences'],
    witness_state: 'drowsy_falling_asleep',
    publish_order: 7,
  },
  // 8. sensed_presence — ghost / SP / cryptid triple.
  {
    descriptor: 'sensed_presence',
    families: ['ghosts_hauntings', 'perception_sensory', 'cryptids'],
    publish_order: 8,
  },
  // 9. reunion_with_deceased — WOO pattern; founder O1 decision says
  //    publish with mandatory Helena copy-pass.
  {
    descriptor: 'reunion_with_deceased',
    families: ['psychological_experiences', 'ghosts_hauntings', 'psychic_phenomena'],
    helena_review_required: true,
    publish_order: 9,
  },
  // 10. animal_witness_reaction — ghost / UFO / cryptid triple.
  {
    descriptor: 'animal_witness_reaction',
    families: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
    publish_order: 10,
  },
]

/* -------------------------------------------------------------------------- */
/* Payload types                                                              */
/* -------------------------------------------------------------------------- */

interface FamilyBreakdown {
  family_slug: string
  family_label: string
  count: number
  total_in_family: number
  pct: number
}

interface SeedPayload {
  slug: string
  eyebrow_type: 'cross_cutting_descriptor'
  headline: string
  descriptor: string
  phen_families: FamilyBreakdown[]
  denominator_n: number
  denominator_n_label: string
  interpretive_sentence: string
  representative_report_ids: string[]
  published: boolean
  publish_order: number
  helena_review_required?: boolean
}

/* -------------------------------------------------------------------------- */
/* Helena banned-word list                                                    */
/* -------------------------------------------------------------------------- */

// V11.18.6 — Sprint 1C. Removed bare 'haunting' from this list and
// replaced it with a structured `isAdjectivalHaunting()` check below.
// Rationale: 'haunting' as a NOUN ("in a haunting", "the haunting",
// "filed as a haunting") is acceptable register — it's how the
// catalogue refers to the ghost-family of accounts; it's the verb
// an archivist uses. 'haunting' as an ADJECTIVE ("haunting tale",
// "haunting silence", "haunting melody") is the goth-marketing
// register Helena vetoed. The substring match couldn't disambiguate;
// the new check does.
var BANNED = [
  'mysteriously', 'mysterious', 'unexplained', 'shocking', 'incredibly',
  'amazingly', 'fascinating', 'spooky', 'creepy', 'weird', 'bizarre',
  'eerie', 'chilling', 'strange', 'fun fact', 'did you know',
  'you might', 'you are', "you're", 'your record',
  'remarkable', 'remarkably', 'striking', 'strikingly',
]

// Export so the cron prose refresh route can re-use the same list.
export var BANNED_PHRASES = BANNED

/**
 * Reject "haunting + adjective_noun" patterns ("haunting tale",
 * "haunting silence", "haunting melody") while accepting "haunting"
 * as a noun ("in a haunting", "the haunting", "filed as a haunting")
 * and "haunted" as a past-participle adjective ("haunted location",
 * "haunted house").
 *
 * Examples (Sprint 1C unit-test-style):
 *   "in a haunting (47%)"          → PASS (noun, preceded by article)
 *   "a haunting tale"              → REJECT (adjective + noun)
 *   "in a haunted location"        → PASS (past-participle adjective)
 *   "haunting silence"             → REJECT (adjective + noun)
 *   "the haunting"                 → PASS (noun, preceded by article)
 *   "filed as a haunting"          → PASS (noun, preceded by article)
 *
 * The regex tests for "haunting" followed by one of a documented
 * list of nouns the goth-register voice attaches it to (tale,
 * silence, melody, story, image, moment, memory, feeling, sound,
 * sight). Other syntactic environments pass.
 */
export function isAdjectivalHaunting(text: string): boolean {
  return /\bhaunting\b\s+(tale|tales|silence|silences|melody|melodies|story|stories|image|images|moment|moments|memory|memories|feeling|feelings|sound|sounds|sight|sights)\b/i.test(text)
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function slugify(input: string): string {
  return String(input).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function countWord(n: number): string {
  if (n === 2) return 'two'
  if (n === 3) return 'three'
  if (n === 4) return 'four'
  return String(n)
}

function buildHeadline(descriptor: string, familyLabels: string[]): string {
  var dLabel = humanizeDescriptorForHeadline(descriptor)
  var fams = familyLabels.slice()
  if (fams.length === 2) {
    return 'The same ' + dLabel + ' appears in ' + fams[0] + ' and ' + fams[1] + '.'
  }
  if (fams.length === 3) {
    return 'The same ' + dLabel + ' appears in ' + fams[0] + ', ' + fams[1] + ', and ' + fams[2] + '.'
  }
  return 'The same ' + dLabel + ' appears in ' + fams.join(', ') + '.'
}

function humanizeDescriptorForHeadline(descriptor: string): string {
  switch (descriptor) {
    case 'shadow_figure': return 'shadow figure'
    case 'electromagnetic_disturbance': return 'electromagnetic disturbance'
    case 'tunnel_imagery': return 'tunnel'
    case 'static_electricity': return 'static-electricity sensation'
    case 'witness_drowsy': return 'drowsy witness state'
    case 'obe_observer_from_above': return 'observer-from-above perspective'
    case 'paralysis': return 'paralysis at onset'
    case 'time_dilation': return 'time dilation'
    case 'hypnagogic_state': return 'drowsy / falling-asleep state'
    case 'sensed_presence': return 'sensed presence'
    case 'reunion_with_deceased': return 'reunion with a deceased loved one'
    case 'animal_witness_reaction': return 'animal-witness reaction'
    case 'piloerection': return 'hair-raising sensation'
    default: return descriptor.replace(/_/g, ' ')
  }
}

/* -------------------------------------------------------------------------- */
/* Haiku interpretive sentence — generation                                   */
/* -------------------------------------------------------------------------- */

var HAIKU_SYSTEM = [
  'You are the editorial voice of Paradocs, a serious paranormal-research database.',
  'Write ONE 1-2 sentence editorial gloss in a documentary register.',
  '',
  'PURPOSE: Make the reader think "wait — that\'s interesting" within 5 seconds. They should',
  'finish the sentence asking themselves a question, not nodding at a statistic.',
  '',
  'STRUCTURE (pick the shape that fits the data):',
  '  - "What X witnesses describe (P%) matches what Y witnesses describe (Q%) — and shows up in Z% of [third]."',
  '  - "Three [category] families describe the same [descriptor]: [A] at P%, [B] at Q%, [C] at R%."',
  '  - "[Category A] (P%), [category B] (Q%), [category C] (R%): three different phenomenon families, one recurring [descriptor]."',
  '  - Close with the absolute count to make scale concrete: "Across NNN,NNN documented accounts, [the descriptor] is the constant."',
  '',
  'HARD RULES:',
  '  - Lead with the cross-cutting comparison. Do NOT lead with the descriptor name.',
  '  - Always include the absolute count (denominator_n) somewhere. Numbers anchor the claim.',
  '  - Under 50 words total.',
  '  - Helena-style austere: no clickbait, no buzzwords, no exclamation marks.',
  '  - BANNED words: mysteriously, mysterious, unexplained, shocking, incredibly, fascinating, spooky, eerie, chilling, strange, bizarre, weird, "did you know", "remarkable", "striking".',
  '  - No second-person ("you", "your"). Third-person archival only.',
  '  - No superlatives unless the input explicitly says "most common" / "highest"; "most consistent" is BANNED.',
  '  - Do NOT make the Vallée-style inference ("the same phenomenon", "the same entity", "evidence of"). State the structure; let the reader infer.',
  '  - Describe what witnesses describe / report / see — not the corpus\'s internal structure ("the descriptor cuts across categories" is the OLD voice; we want plain English now).',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object: {"sentence": "<text>"}. No preamble, no markdown.',
].join('\n')

interface HaikuInput {
  headline: string
  descriptor: string
  families: FamilyBreakdown[]
}

export async function callHaikuInterpretive(input: HaikuInput): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[seed-patterns] ANTHROPIC_API_KEY not set — falling back to template.')
    return null
  }
  // V11.18.5 — substitute "haunting" → "ghost report" in the family labels
  // passed to Haiku so the generated prose uses the un-banned synonym.
  // The rendered FindingCard UI still maps "haunting" → "Hauntings" at
  // render time (FindingCard pretty-label map), so this substitution
  // affects ONLY the Haiku prompt input + its generated prose.
  function _labelForPrompt(label: string): string {
    if (label === 'haunting') return 'ghost report'
    if (label === 'hauntings') return 'ghost reports'
    return label
  }
  var userPrompt = [
    'HEADLINE: ' + input.headline.replace(/hauntings?/gi, function (m) {
      return m[0] === m[0].toUpperCase() ? 'Ghost reports' : 'ghost reports'
    }),
    'DESCRIPTOR: ' + input.descriptor,
    'FAMILY BREAKDOWN:',
    input.families.map(function (f) {
      return '  - ' + _labelForPrompt(f.family_label) + ': ' + f.pct + '% (' + f.count + ' of ' + f.total_in_family + ')'
    }).join('\n'),
    '',
    'IMPORTANT VOCAB: Refer to the ghost-family category as "ghost reports" or "ghost accounts" — do NOT use "haunting" or "hauntings" as adjectives (they are reserved as a genre term in our brand register).',
    '',
    'Write the catalogue-treatment sentence per the rules. JSON only.',
  ].join('\n')

  var controller = new AbortController()
  var timeoutId = setTimeout(function () { controller.abort() }, 15000)
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        temperature: 0.3,
        system: HAIKU_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      console.warn('[seed-patterns] Haiku non-2xx: ' + resp.status)
      return null
    }
    var data: any = await resp.json()
    var text: string = (data?.content?.[0]?.text || '').trim()
    var parsed = parseSentence(text)
    if (!parsed) return null
    var v = validateInterpretive(parsed)
    if (!v.ok) {
      console.warn('[seed-patterns] interpretive sentence rejected: ' + v.reason + ' — text: ' + parsed)
      return null
    }
    return parsed
  } catch (e: any) {
    clearTimeout(timeoutId)
    console.warn('[seed-patterns] Haiku threw: ' + (e?.message || e))
    return null
  }
}

function parseSentence(raw: string): string | null {
  try {
    var trimmed = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    var s = trimmed.indexOf('{')
    var e = trimmed.lastIndexOf('}')
    if (s >= 0 && e > s) {
      var obj = JSON.parse(trimmed.substring(s, e + 1))
      if (typeof obj.sentence === 'string') return obj.sentence.trim()
    }
  } catch (_e) { /* fall through */ }
  return null
}

export function validateInterpretive(text: string): { ok: boolean; reason?: string } {
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > 500) return { ok: false, reason: 'too_long_chars' }
  if (/!/.test(text)) return { ok: false, reason: 'exclamation' }
  var words = text.split(/\s+/).filter(Boolean)
  if (words.length > 55) return { ok: false, reason: 'too_long_words' }
  var lower = text.toLowerCase()
  for (var i = 0; i < BANNED.length; i++) {
    if (lower.indexOf(BANNED[i]) !== -1) {
      return { ok: false, reason: 'banned:' + BANNED[i] }
    }
  }
  // V11.18.6 — structured adjectival-haunting check (replaces the bare
  // 'haunting' substring entry in the BANNED list).
  if (isAdjectivalHaunting(text)) {
    return { ok: false, reason: 'banned:adjectival_haunting' }
  }
  return { ok: true }
}

export function templatedInterpretive(descriptor: string, n: number, denom?: number): string {
  var nWord = countWord(n)
  var denomPhrase = denom && denom > 0
    ? 'Across ' + denom.toLocaleString('en-US') + ' documented accounts, the same descriptor recurs.'
    : 'The same descriptor recurs across all ' + nWord + ' families.'
  return nWord.charAt(0).toUpperCase() + nWord.slice(1) +
    ' different phenomenon families describe the same ' +
    descriptor.replace(/_/g, ' ') + '. ' + denomPhrase
}

/* -------------------------------------------------------------------------- */
/* Family-count execution                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Pull the absolute count of approved reports in `family` whose
 * `witness_state_at_event` equals the given enum value. Used for the
 * hypnagogic_state Finding which sources from the structured field,
 * not text scanning (PATTERNS_GAPS Fix 4).
 */
async function countWitnessStateInFamily(
  svc: any,
  family: HintCategory,
  state: string,
): Promise<{ match: number; denom: number }> {
  try {
    var totalRes = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', family)
    var denom = Number((totalRes as any).count) || 0
    if (denom === 0) return { match: 0, denom: 0 }
    var matchRes = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', family)
      .eq('witness_state_at_event', state)
    var match = Number((matchRes as any).count) || 0
    return { match: match, denom: denom }
  } catch (_e) {
    return { match: 0, denom: 0 }
  }
}

/**
 * Execute the keyword-scan family count via the existing executor's
 * `cross_family_overlap_pct` path. Returns per-family breakdowns.
 */
async function executeCrossFamilyKeywordScan(
  svc: any,
  descriptor: DescriptorFamily,
  families: HintCategory[],
): Promise<FamilyBreakdown[]> {
  // We use the executor's already-implemented dispatch and re-decompose
  // the pcts + labels into our breakdown shape. The executor scales
  // sample-based counts up to family totals.
  var query: HintDataQuery = {
    kind: 'cross_family_overlap_pct',
    descriptor_family: descriptor,
    families: families as any,
    bind_to: 'cross_family_set',
    min_denominator_per_family: 1,
  }
  var ctx = {
    user_id: '00000000-0000-0000-0000-000000000000',
    primary_report: null,
    all_reports: [],
  }
  var binding = await executeQuery(query, ctx as any, svc as any)
  var labelTokens: HintToken[] = [
    'cross_family_a_label', 'cross_family_b_label', 'cross_family_c_label',
  ]
  var pctTokens: HintToken[] = [
    'cross_family_a_pct', 'cross_family_b_pct', 'cross_family_c_pct',
  ]
  var breakdowns: FamilyBreakdown[] = []
  for (var i = 0; i < families.length; i++) {
    var fam = families[i]
    var totalRes = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', fam)
    var totalDenom = Number((totalRes as any).count) || 0
    var pct = binding.bindings ? Number(binding.bindings[pctTokens[i]]) || 0 : 0
    var label = binding.bindings
      ? String(binding.bindings[labelTokens[i]] || humanizeFamily(fam))
      : humanizeFamily(fam)
    var matchCount = Math.round((pct / 100) * totalDenom)
    breakdowns.push({
      family_slug: fam,
      family_label: label,
      count: matchCount,
      total_in_family: totalDenom,
      pct: pct,
    })
  }
  return breakdowns
}

/**
 * Top-level resolver — given a PatternConfig, build the per-family
 * breakdowns. Routes to keyword-scan OR witness-state direct depending
 * on the config.
 */
async function resolveFamilyBreakdowns(
  svc: any,
  cfg: PatternConfig,
): Promise<FamilyBreakdown[]> {
  if (cfg.witness_state) {
    var out: FamilyBreakdown[] = []
    for (var i = 0; i < cfg.families.length; i++) {
      var fam = cfg.families[i] as HintCategory
      var r = await countWitnessStateInFamily(svc, fam, cfg.witness_state)
      var pct = r.denom > 0 ? Math.round((r.match / r.denom) * 100) : 0
      out.push({
        family_slug: fam,
        family_label: humanizeFamily(fam),
        count: r.match,
        total_in_family: r.denom,
        pct: pct,
      })
    }
    return out
  }
  return await executeCrossFamilyKeywordScan(
    svc,
    cfg.descriptor,
    cfg.families as HintCategory[],
  )
}

/* -------------------------------------------------------------------------- */
/* Representative report sampling                                             */
/* -------------------------------------------------------------------------- */

async function sampleRepresentativeReportIds(
  svc: any,
  families: HintCategory[],
): Promise<string[]> {
  var out: string[] = []
  for (var i = 0; i < families.length; i++) {
    try {
      var res = await svc
        .from('reports')
        .select('id')
        .eq('status', 'approved')
        .eq('category', families[i])
        .order('created_at', { ascending: false })
        .limit(1)
      if (res.data && res.data.length > 0) {
        out.push(String((res.data[0] as any).id))
      }
    } catch (_e) { /* defensive */ }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* UPSERT — idempotent, founder-copy-preserving                               */
/* -------------------------------------------------------------------------- */

/**
 * Idempotent UPSERT that respects founder edits. Behavior:
 *   - If row absent → INSERT with all fields.
 *   - If row present → UPDATE phen_families / denominator_n / etc.
 *     - Update `interpretive_sentence` IF the existing one is NULL, or
 *       the operator passed `--force-update-copy`. Otherwise leave it.
 *   - Always stamps `refreshed_at`.
 */
async function upsertPreservingFounderCopy(
  svc: any,
  payload: SeedPayload,
  forceCopyUpdate: boolean,
): Promise<{ ok: boolean; mode: 'inserted' | 'updated_full' | 'updated_counts_only' | 'error'; message?: string }> {
  try {
    var existingRes = await svc
      .from('findings_catalogue' as any)
      .select('id, interpretive_sentence')
      .eq('slug', payload.slug)
      .maybeSingle()
    if (existingRes.error) {
      return { ok: false, mode: 'error', message: existingRes.error.message }
    }
    var existing = existingRes.data
    if (!existing) {
      // Brand new row.
      var ins = await svc
        .from('findings_catalogue' as any)
        .insert({
          slug: payload.slug,
          eyebrow_type: payload.eyebrow_type,
          headline: payload.headline,
          descriptor: payload.descriptor,
          phen_families: payload.phen_families as any,
          denominator_n: payload.denominator_n,
          denominator_n_label: payload.denominator_n_label,
          interpretive_sentence: payload.interpretive_sentence,
          representative_report_ids: payload.representative_report_ids as any,
          published: payload.published,
          publish_order: payload.publish_order,
          refreshed_at: new Date().toISOString(),
        })
      if (ins.error) return { ok: false, mode: 'error', message: ins.error.message }
      return { ok: true, mode: 'inserted' }
    }
    // Row exists — update counts always; touch interpretive_sentence
    // only on opt-in (NULL OR --force-update-copy).
    var existingInterp = (existing as any).interpretive_sentence
    var updateInterp = !existingInterp || forceCopyUpdate
    var patch: any = {
      eyebrow_type: payload.eyebrow_type,
      headline: payload.headline,
      descriptor: payload.descriptor,
      phen_families: payload.phen_families,
      denominator_n: payload.denominator_n,
      denominator_n_label: payload.denominator_n_label,
      representative_report_ids: payload.representative_report_ids,
      publish_order: payload.publish_order,
      refreshed_at: new Date().toISOString(),
    }
    if (updateInterp) patch.interpretive_sentence = payload.interpretive_sentence
    var upd = await svc
      .from('findings_catalogue' as any)
      .update(patch)
      .eq('slug', payload.slug)
    if (upd.error) return { ok: false, mode: 'error', message: upd.error.message }
    return {
      ok: true,
      mode: updateInterp ? 'updated_full' : 'updated_counts_only',
    }
  } catch (e: any) {
    return { ok: false, mode: 'error', message: e?.message || String(e) }
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('='.repeat(64))
  console.log('seed-patterns-v1 — Sprint 1B (V11.18.4)')
  console.log(
    APPLY
      ? 'MODE: --apply (will UPSERT findings_catalogue, preserving founder copy)'
      : 'MODE: dry-run (no DB writes)',
  )
  if (FORCE_UPDATE_COPY) console.log('FLAG: --force-update-copy (will overwrite interpretive_sentence)')
  if (COUNTS_ONLY) console.log('FLAG: --counts-only (no Haiku calls; counts refresh only)')
  console.log('='.repeat(64))

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var payloads: SeedPayload[] = []
  var helenaFlagged: string[] = []

  for (var i = 0; i < PATTERN_CONFIGS.length; i++) {
    var cfg = PATTERN_CONFIGS[i]
    console.log('\n[' + (i + 1) + '/' + PATTERN_CONFIGS.length + '] ' + cfg.descriptor)
    console.log('  families: ' + cfg.families.join(', '))
    if (cfg.witness_state) console.log('  witness_state path: ' + cfg.witness_state)
    if (cfg.helena_review_required) console.log('  ** HELENA REVIEW REQUIRED **')

    // Sanity-check the vocabulary has this descriptor (the executor
    // falls back to an empty keyword list if we ask for a slug not in
    // the vocab).
    if (!cfg.witness_state && !DESCRIPTOR_VOCAB[cfg.descriptor]) {
      console.warn('  ✗ descriptor missing from DESCRIPTOR_VOCAB: ' + cfg.descriptor)
      continue
    }

    var breakdowns = await resolveFamilyBreakdowns(svc, cfg)
    if (breakdowns.length === 0) {
      console.warn('  ✗ no breakdowns resolved. Skipping.')
      continue
    }
    // Editorial floor — if every family is 0% we skip.
    var hasSignal = breakdowns.some(function (b) { return b.count > 0 })
    if (!hasSignal) {
      console.warn('  ✗ all-zero signal. Skipping.')
      continue
    }
    console.log('  resolved: ' + breakdowns.map(function (b) {
      return b.family_slug + '=' + b.pct + '% (' + b.count + '/' + b.total_in_family + ')'
    }).join(', '))

    var familyLabels = breakdowns.map(function (b) { return b.family_label })
    var totalAccounts = breakdowns.reduce(function (acc, b) { return acc + b.total_in_family }, 0)
    var headline = buildHeadline(cfg.descriptor, familyLabels)
    var denominator_n_label = 'Across ' + totalAccounts.toLocaleString('en-US') +
      ' accounts in ' + countWord(breakdowns.length) + ' phen families.'

    var interpretive: string
    if (COUNTS_ONLY) {
      interpretive = templatedInterpretive(cfg.descriptor, breakdowns.length, totalAccounts)
    } else {
      var haikuOut = await callHaikuInterpretive({
        headline: headline,
        descriptor: cfg.descriptor,
        families: breakdowns,
      })
      interpretive = haikuOut || templatedInterpretive(cfg.descriptor, breakdowns.length, totalAccounts)
    }

    var repIds = await sampleRepresentativeReportIds(svc, cfg.families as HintCategory[])
    var slug = slugify(
      cfg.descriptor + '-across-' + cfg.families.map(function (f) {
        return humanizeFamily(f as HintCategory)
      }).join('-'),
    )

    payloads.push({
      slug: slug,
      eyebrow_type: 'cross_cutting_descriptor',
      headline: headline,
      descriptor: cfg.descriptor,
      phen_families: breakdowns,
      denominator_n: totalAccounts,
      denominator_n_label: denominator_n_label,
      interpretive_sentence: interpretive,
      representative_report_ids: repIds,
      published: false,
      publish_order: cfg.publish_order,
      helena_review_required: cfg.helena_review_required,
    })

    if (cfg.helena_review_required) helenaFlagged.push(slug)

    console.log('  slug: ' + slug)
    console.log('  headline: ' + headline)
    console.log('  denominator: ' + denominator_n_label)
    console.log('  interpretive: ' + interpretive)
    if (cfg.helena_review_required) {
      console.log('  ** HELENA REVIEW REQUIRED — DO NOT auto-publish.')
    }
  }

  console.log('\n' + '='.repeat(64))
  console.log('Built ' + payloads.length + ' Finding payload(s).')
  if (helenaFlagged.length > 0) {
    console.log('Helena review required on slug(s):')
    helenaFlagged.forEach(function (s) { console.log('  - ' + s) })
  }
  console.log('='.repeat(64))

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to UPSERT into findings_catalogue.')
    console.log('Founder edits to interpretive_sentence are PRESERVED on re-apply.')
    console.log('Pass --force-update-copy if you want the seed to overwrite founder edits.')
    return
  }

  var written = 0
  var preserved = 0
  var inserted = 0
  for (var pi = 0; pi < payloads.length; pi++) {
    var p = payloads[pi]
    var res = await upsertPreservingFounderCopy(svc, p, FORCE_UPDATE_COPY)
    if (!res.ok) {
      console.error('  ✗ ' + p.slug + ': ' + (res.message || 'failed'))
    } else {
      written++
      if (res.mode === 'inserted') inserted++
      if (res.mode === 'updated_counts_only') preserved++
      console.log('  ✓ ' + p.slug + ' (' + res.mode + ')')
    }
  }

  console.log('\n' + '='.repeat(64))
  console.log('Wrote ' + written + ' / ' + payloads.length + ' Finding row(s).')
  console.log('  - inserted (brand new):        ' + inserted)
  console.log('  - founder copy preserved:      ' + preserved)
  console.log('  - copy refreshed:              ' + (written - inserted - preserved))
  console.log('\nFounder review: rows land with published=false. Publish via SQL:')
  console.log("  UPDATE findings_catalogue SET published = true WHERE slug = '<slug>';")
  if (helenaFlagged.length > 0) {
    console.log('\nHELENA copy-pass required on:')
    helenaFlagged.forEach(function (s) { console.log('  - ' + s) })
    console.log('Do NOT publish those slugs until Helena (or founder) approves the copy.')
  }
  console.log('='.repeat(64))
}

main().catch(function (e) {
  console.error('seed-patterns-v1 fatal:', e)
  process.exit(1)
})

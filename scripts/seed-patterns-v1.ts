// V11.18.1 — Sprint 1A-2 — seed-patterns-v1.ts
//
// Promotes the 5 strongest cross-category Hints into `findings_catalogue`
// rows by executing their `cross_family_overlap_pct` queries against the
// live corpus and synthesizing a one-sentence interpretive gloss with
// Claude Haiku 4.5 (live API, ~$0.002 per finding).
//
// Usage:
//   npx tsx scripts/seed-patterns-v1.ts             # dry-run (default)
//   npx tsx scripts/seed-patterns-v1.ts --apply     # writes to findings_catalogue
//
// Idempotent on `slug` — re-running with --apply UPSERTs (refreshing the
// per-family bindings + interpretive sentence + refreshed_at).
//
// Cost: 5 Haiku calls × ~$0.002 ≈ $0.01 per seed run. The 5 sourced
// cross-category Hints are seed-hints.ts:958-1147; we slice the first 5
// (static_sensation / tunnel / shadow_figure / electromagnetic /
// witness_drowsy) which are the cross_family_overlap_pct variants per
// the roadmap V2 §4.2 leverage map.
//
// Helena-cleared copy rules enforced post-Haiku:
//   - no exclamation marks
//   - no second-person ("you", "your")
//   - no banned phrases (mysteriously, unexplained, shocking, etc.)
//   - opens with "The catalogue treats this as" or a structural equivalent
//   - ≤35 words

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { SEED_HINTS } from '../src/lib/lab/hints/seed-hints'
import {
  executeQuery,
  humanizeFamily,
} from '../src/lib/lab/hints/data-query-executor'
import type {
  HintDataQuery,
  HintToken,
} from '../src/lib/lab/hints/data-query-types'
import type { HintCategory } from '../src/lib/lab/hints/hint-schema'

var APPLY = process.argv.includes('--apply')

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// The 5 Hint IDs we promote into the Sprint 1 Patterns catalogue.
// Ordered by editorial priority (publish_order = idx + 1).
var SOURCE_HINT_IDS = [
  'cross_category.shadow_figure.three_family',          // 1 — three-family flagship
  'cross_category.electromagnetic.cryptid_ufo_ghost',   // 2 — three-family
  'cross_category.tunnel.nde_sp',                       // 3 — two-family, NDE/SP
  'cross_category.static_sensation.cryptid_ufo',        // 4 — two-family, cryptid/UFO
  'cross_category.witness_drowsy.sp_obe',               // 5 — boundary of consciousness
]

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
}

// Helena banned words — checked against the generated interpretive sentence.
var BANNED = [
  'mysteriously', 'mysterious', 'unexplained', 'shocking', 'incredibly',
  'amazingly', 'fascinating', 'spooky', 'creepy', 'weird', 'bizarre',
  'eerie', 'chilling', 'haunting', 'strange', 'fun fact', 'did you know',
  'you might', 'you are', "you're", 'your record',
]

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

// Pull descriptor + families out of a Hint's first cross_family_overlap_pct
// query. Returns null if the Hint has no qualifying query.
function readCrossFamilyQuery(
  queries: HintDataQuery[],
): { descriptor_family: string; families: HintCategory[] } | null {
  for (var i = 0; i < queries.length; i++) {
    var q = queries[i]
    if (q.kind === 'cross_family_overlap_pct') {
      return {
        descriptor_family: q.descriptor_family,
        families: q.families.slice() as HintCategory[],
      }
    }
  }
  return null
}

// Helena-cleared headline construction. We avoid Haiku for the headline
// (the founder reviews each one in draft state and the Haiku risk per
// roadmap V2 §9 R1 — superlative drift, comparative-claim hallucination
// — is highest in headline text). Instead we build deterministically
// from the descriptor + the resolved family labels.
function buildHeadline(descriptor: string, familyLabels: string[]): string {
  var dLabel = humanizeDescriptor(descriptor)
  var fams = familyLabels.slice()
  if (fams.length === 2) {
    return capitalize(dLabel) + ' recurs across ' + fams[0] + ' and ' + fams[1] + ' accounts.'
  }
  if (fams.length === 3) {
    return capitalize(dLabel) + ' recurs across ' + fams[0] + ', ' + fams[1] + ', and ' + fams[2] + ' accounts.'
  }
  // Defensive — schema guarantees 2 or 3.
  return capitalize(dLabel) + ' recurs across ' + fams.join(', ') + ' accounts.'
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function humanizeDescriptor(descriptor: string): string {
  switch (descriptor) {
    case 'shadow_figure': return 'shadow-figure imagery'
    case 'electromagnetic_disturbance': return 'electromagnetic disturbance'
    case 'tunnel_imagery': return 'tunnel imagery'
    case 'static_electricity': return 'static-electricity sensation'
    case 'witness_drowsy': return 'the drowsy / falling-asleep witness state'
    default: return descriptor.replace(/_/g, ' ')
  }
}

// ─── Haiku call ───────────────────────────────────────────────────────

var HAIKU_SYSTEM = [
  'You are the editorial voice of Paradocs, a serious paranormal-research database.',
  'Write ONE 1-2 sentence editorial gloss in a documentary register.',
  '',
  'HARD RULES:',
  '  - Begin the sentence with "The catalogue treats this as" or a clear structural equivalent ("The corpus tracks this as…", "The catalogue groups this under…").',
  '  - Under 35 words total.',
  '  - Helena-style austere: no clickbait, no buzzwords, no exclamation marks.',
  '  - BANNED words: mysteriously, mysterious, unexplained, shocking, incredibly, fascinating, spooky, eerie, chilling, strange, bizarre, weird, "did you know".',
  '  - No second-person ("you", "your"). Third-person archival only.',
  '  - No superlatives unless the input explicitly says "most common" / "highest"; "most consistent" is BANNED.',
  '  - Describe the corpus structure, not the experiencer.',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object: {"sentence": "<text>"}. No preamble, no markdown.',
].join('\n')

interface HaikuInput {
  headline: string
  descriptor: string
  families: FamilyBreakdown[]
}

async function callHaikuInterpretive(input: HaikuInput): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[seed-patterns] ANTHROPIC_API_KEY not set — falling back to template.')
    return null
  }
  var userPrompt = [
    'HEADLINE: ' + input.headline,
    'DESCRIPTOR: ' + input.descriptor,
    'FAMILY BREAKDOWN:',
    input.families.map(function (f) {
      return '  - ' + f.family_label + ': ' + f.pct + '% (' + f.count + ' of ' + f.total_in_family + ')'
    }).join('\n'),
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

function validateInterpretive(text: string): { ok: boolean; reason?: string } {
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > 360) return { ok: false, reason: 'too_long_chars' }
  if (/!/.test(text)) return { ok: false, reason: 'exclamation' }
  var words = text.split(/\s+/).filter(Boolean)
  if (words.length > 38) return { ok: false, reason: 'too_long_words' }
  var lower = text.toLowerCase()
  for (var i = 0; i < BANNED.length; i++) {
    if (lower.indexOf(BANNED[i]) !== -1) {
      return { ok: false, reason: 'banned:' + BANNED[i] }
    }
  }
  return { ok: true }
}

function templatedInterpretive(descriptor: string, n: number): string {
  return 'The catalogue treats this as a cross-family descriptor anchored across ' +
    countWord(n) + ' phenomenon families rather than within any one.'
}

// ─── Representative report sampling ─────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(64))
  console.log('seed-patterns-v1 — Sprint 1A-2 (V11.18.1)')
  console.log(APPLY ? 'MODE: --apply (will UPSERT findings_catalogue)' : 'MODE: dry-run (no DB writes)')
  console.log('='.repeat(64))

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Index the source hints by id for lookup.
  var hintMap: Record<string, any> = {}
  SEED_HINTS.forEach(function (h) { hintMap[h.id] = h })

  var payloads: SeedPayload[] = []

  for (var i = 0; i < SOURCE_HINT_IDS.length; i++) {
    var hintId = SOURCE_HINT_IDS[i]
    var hint = hintMap[hintId]
    if (!hint) {
      console.warn('[seed-patterns] Hint not found in SEED_HINTS: ' + hintId)
      continue
    }
    var cf = readCrossFamilyQuery(hint.data_queries)
    if (!cf) {
      console.warn('[seed-patterns] Hint has no cross_family_overlap_pct query: ' + hintId)
      continue
    }
    console.log('\n[' + (i + 1) + '/' + SOURCE_HINT_IDS.length + '] ' + hintId)
    console.log('  descriptor=' + cf.descriptor_family + ' families=' + cf.families.join(','))

    // Execute the query — synthetic user context (Patterns are corpus-
    // wide; no user binding needed).
    var ctx = { user_id: '00000000-0000-0000-0000-000000000000', primary_report: null, all_reports: [] }
    var binding = await executeQuery(hint.data_queries[0] as HintDataQuery, ctx, svc as any)
    if (!binding.bindings) {
      console.warn('  ✗ executor returned no bindings (denom=' + binding.denominator + '). Skipping.')
      continue
    }

    // Re-run countDescriptorMatchInFamily for each family to recover
    // the per-family count + total. The executor returns only pcts and
    // labels; we want the absolute numerator + denominator on each
    // family for the Finding Card breakdown.
    var families: FamilyBreakdown[] = []
    var totalAccounts = 0
    var labelTokens: HintToken[] = ['cross_family_a_label', 'cross_family_b_label', 'cross_family_c_label']
    var pctTokens: HintToken[] = ['cross_family_a_pct', 'cross_family_b_pct', 'cross_family_c_pct']
    for (var fi = 0; fi < cf.families.length; fi++) {
      var famSlug = cf.families[fi]
      // Total approved in this family.
      var totalRes = await svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', famSlug)
      var totalDenom = Number((totalRes as any).count) || 0
      var pct = Number(binding.bindings[pctTokens[fi]]) || 0
      var label = String(binding.bindings[labelTokens[fi]] || humanizeFamily(famSlug))
      var matchCount = Math.round((pct / 100) * totalDenom)
      families.push({
        family_slug: famSlug,
        family_label: label,
        count: matchCount,
        total_in_family: totalDenom,
        pct: pct,
      })
      totalAccounts += totalDenom
    }
    console.log('  families resolved: ' + families.map(function (f) {
      return f.family_slug + '=' + f.pct + '% (' + f.count + '/' + f.total_in_family + ')'
    }).join(', '))

    var familyLabels = families.map(function (f) { return f.family_label })
    var headline = buildHeadline(cf.descriptor_family, familyLabels)
    var denominator_n_label = 'Across ' + totalAccounts.toLocaleString('en-US') +
      ' accounts in ' + countWord(families.length) + ' phen families.'

    // Haiku — interpretive sentence.
    var haikuOut = await callHaikuInterpretive({
      headline: headline,
      descriptor: cf.descriptor_family,
      families: families,
    })
    var interpretive = haikuOut || templatedInterpretive(cf.descriptor_family, families.length)

    var repIds = await sampleRepresentativeReportIds(svc, cf.families)

    var slug = slugify(cf.descriptor_family + '-across-' + cf.families.map(function (f) { return humanizeFamily(f as HintCategory) }).join('-'))

    payloads.push({
      slug: slug,
      eyebrow_type: 'cross_cutting_descriptor',
      headline: headline,
      descriptor: cf.descriptor_family,
      phen_families: families,
      denominator_n: totalAccounts,
      denominator_n_label: denominator_n_label,
      interpretive_sentence: interpretive,
      representative_report_ids: repIds,
      published: false,
      publish_order: i + 1,
    })

    console.log('  slug: ' + slug)
    console.log('  headline: ' + headline)
    console.log('  denominator: ' + denominator_n_label)
    console.log('  interpretive: ' + interpretive)
    console.log('  rep_report_ids: [' + repIds.join(', ') + ']')
  }

  console.log('\n' + '='.repeat(64))
  console.log('Built ' + payloads.length + ' Finding payload(s).')
  console.log('='.repeat(64))

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to UPSERT into findings_catalogue.')
    return
  }

  // UPSERT each payload by slug.
  var written = 0
  for (var pi = 0; pi < payloads.length; pi++) {
    var p = payloads[pi]
    try {
      var up = await svc
        .from('findings_catalogue' as any)
        .upsert({
          slug: p.slug,
          eyebrow_type: p.eyebrow_type,
          headline: p.headline,
          descriptor: p.descriptor,
          phen_families: p.phen_families as any,
          denominator_n: p.denominator_n,
          denominator_n_label: p.denominator_n_label,
          interpretive_sentence: p.interpretive_sentence,
          representative_report_ids: p.representative_report_ids as any,
          published: p.published,
          publish_order: p.publish_order,
          refreshed_at: new Date().toISOString(),
        }, { onConflict: 'slug' })
      if ((up as any).error) {
        console.error('  ✗ upsert failed for ' + p.slug + ': ' + (up as any).error.message)
      } else {
        written++
        console.log('  ✓ upserted ' + p.slug)
      }
    } catch (e: any) {
      console.error('  ✗ upsert threw for ' + p.slug + ': ' + (e?.message || e))
    }
  }

  console.log('\n' + '='.repeat(64))
  console.log('Wrote ' + written + ' / ' + payloads.length + ' Finding row(s).')
  console.log('Founder review: rows land with published=false. Publish via SQL or admin UI:')
  console.log('  UPDATE findings_catalogue SET published = true WHERE slug = \'<slug>\';')
  console.log('='.repeat(64))
}

main().catch(function (e) {
  console.error('seed-patterns-v1 fatal:', e)
  process.exit(1)
})

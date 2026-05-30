#!/usr/bin/env tsx
/**
 * V11.17.53 — Audit niche folkloric phenomenon tags for false positives.
 *
 * Problem: niche folkloric entities (Adze, Pishacha, Lechuza, etc.)
 * have generic single-word keywords in auto-targets.json. The plain
 * keyword `"adze"` matches reports about the woodworking tool;
 * `"lechuza"` matches Spanish-language reports about owls in general;
 * `"banshee"` matches metaphorical use ("she screamed like a banshee").
 * The classifier's evidenceRules LLM gate catches some false positives
 * but not all — these phen pages end up with tagged reports that have
 * nothing to do with the actual folkloric entity.
 *
 * This script:
 *   1. For each phen in FOLKLORIC_PHENS (curated list of culturally-
 *      specific entities), pull every report tagged with it via
 *      report_phenomena.
 *   2. For each tagged report, ask Haiku a strict yes/no verification:
 *      "Is this report a credible match for {phen}, given its specific
 *      cultural origin in {region/people}?"
 *   3. When Haiku says no (with reasoning), DELETE the report_phenomena
 *      row. The report itself stays intact — only the bad tag is removed.
 *
 * Cost: ~$0.0005 per verification call. Per-phen cost depends on how
 * many reports are tagged.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   # Audit all curated folkloric phens (default; dry-run prints what
 *   # WOULD be untagged without making changes)
 *   npx tsx scripts/audit-folkloric-tags.ts --dry-run
 *   npx tsx scripts/audit-folkloric-tags.ts --apply
 *
 *   # Audit just one phen
 *   npx tsx scripts/audit-folkloric-tags.ts --slug adze --dry-run
 *   npx tsx scripts/audit-folkloric-tags.ts --slug adze --apply
 *
 *   # Bound the audit (per phen) for cost control during initial runs
 *   npx tsx scripts/audit-folkloric-tags.ts --apply --limit 30
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// ── CLI args ─────────────────────────────────────────────────────────
function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    slug: flag('--slug', ''),
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    limit: parseInt(flag('--limit', '0')),
    concurrency: Math.max(1, parseInt(flag('--concurrency', '6'))),
  }
}

// ── Curated folkloric phens with cultural context ────────────────────
// Each entry: slug + a short cultural-origin string used in the Haiku
// verification prompt. The cultural-origin string is the KEY signal —
// it lets Haiku reject reports that are linguistically a match for the
// keyword but culturally unrelated (e.g., a Bigfoot story that happens
// to mention an "adze" tool).
interface FolkloricPhen {
  slug: string
  name: string
  origin: string
}

const FOLKLORIC_PHENS: FolkloricPhen[] = [
  // African
  { slug: 'adze',          name: 'Adze',          origin: 'Ewe people of Togo, Ghana, and Benin in West Africa. Vampiric spirit that takes the form of a firefly or mosquito.' },
  { slug: 'asanbosam',     name: 'Asanbosam',     origin: 'Akan / Ashanti folklore of Ghana and Côte d\'Ivoire. Iron-toothed forest vampire that hangs from trees.' },
  { slug: 'tikoloshe',     name: 'Tikoloshe',     origin: 'Zulu folklore of southern Africa. Small, mischievous water sprite or familiar created by a witch.' },

  // South Asian
  { slug: 'pishacha',      name: 'Pishacha',      origin: 'Hindu and Buddhist folklore of India and Nepal. Flesh-eating spirit haunting cremation grounds.' },
  { slug: 'churel',        name: 'Churel',        origin: 'South Asian folklore (India, Pakistan, Bangladesh, Nepal). Female ghost of a woman who died in childbirth or with unfulfilled desires.' },
  { slug: 'bhoot',         name: 'Bhoot',         origin: 'South Asian folklore. Restless spirit of a deceased person, often with backwards-facing feet.' },

  // Southeast Asian
  { slug: 'pontianak',     name: 'Pontianak',     origin: 'Malay and Indonesian folklore. Vampiric female ghost of a woman who died in childbirth.' },
  { slug: 'aswang',        name: 'Aswang',        origin: 'Philippine folklore. Shape-shifting creature, often vampiric or ghoulish.' },
  { slug: 'manananggal',   name: 'Manananggal',   origin: 'Philippine folklore. Female vampiric creature that detaches its upper torso to fly with bat-like wings.' },
  { slug: 'jiangshi',      name: 'Jiangshi',      origin: 'Chinese folklore. Reanimated corpse that hops, drains the qi (life force) of the living.' },
  { slug: 'kuchisake-onna', name: 'Kuchisake-onna', origin: 'Japanese urban legend. Vengeful female spirit with a slit mouth, asks if she is pretty before attacking.' },

  // Middle Eastern / Islamic
  { slug: 'qareen',        name: 'Qareen',        origin: 'Islamic theology. Spiritual companion assigned to every person at birth; in some traditions, can mislead or whisper.' },
  { slug: 'djinn',         name: 'Djinn',         origin: 'Pre-Islamic and Islamic folklore of the Arab world. Supernatural being created from smokeless fire, can be benevolent or malevolent.' },

  // European
  { slug: 'banshee',       name: 'Banshee',       origin: 'Irish folklore. Female spirit whose wailing foretells a death in a family.' },
  { slug: 'strigoi',       name: 'Strigoi',       origin: 'Romanian folklore. Restless dead, sometimes returning as vampire-like revenants.' },
  { slug: 'boggart',       name: 'Boggart',       origin: 'English folklore (especially northern England). Household or marsh-dwelling malevolent spirit that hides or breaks things.' },

  // Latin American / Caribbean
  { slug: 'soucouyant',    name: 'Soucouyant',    origin: 'Caribbean (especially Trinidadian and Guadeloupean) folklore. Old woman who sheds her skin at night and flies as a ball of fire to drink blood.' },
  { slug: 'lechuza',       name: 'Lechuza',       origin: 'Mexican and South Texas folklore. Giant owl with the face of an elderly woman; associated with brujería.' },
  { slug: 'chupacabra',    name: 'Chupacabra',    origin: 'Latin American folklore (Puerto Rico, Mexico, US southwest). Creature that drains the blood of livestock.' },
  { slug: 'tunda',         name: 'Tunda',         origin: 'Afro-Colombian folklore of the Pacific coast of Colombia. Shape-shifting forest creature that lures people to be lost in the jungle.' },

  // Native American
  { slug: 'chindi',        name: 'Chindi',        origin: 'Navajo (Diné) folklore. Vengeful ghost or evil spirit released at the moment of death.' },
  { slug: 'wendigo',       name: 'Wendigo',       origin: 'Algonquian (Cree, Ojibwe, Innu) folklore. Malevolent cannibalistic spirit, often associated with winter and the deep forest.' },
  { slug: 'skinwalker',    name: 'Skinwalker',    origin: 'Navajo (Diné) folklore. Witch who can take the form of an animal; specifically a violation of traditional Navajo law.' },
]

// ── Haiku verification ──────────────────────────────────────────────
interface VerifyResult {
  match: 'yes' | 'no' | 'uncertain'
  reasoning: string
}

function buildVerifyPrompt(phen: FolkloricPhen, report: any): string {
  const loc = [report.city, report.state_province, report.country].filter(Boolean).join(', ') || 'unspecified'
  return [
    'PHENOMENON: ' + phen.name,
    'CULTURAL ORIGIN: ' + phen.origin,
    '',
    'REPORT:',
    '  title: ' + (report.title || '(none)'),
    '  location: ' + loc,
    '  summary: ' + (report.summary || '(none)').slice(0, 400),
    '  description (first 1500 chars): ' + (report.description || '(none)').slice(0, 1500),
    '',
    'TASK: Is this report a credible match for "' + phen.name + '" as defined by its cultural origin above?',
    '',
    'A credible match requires AT LEAST ONE of:',
    '  - Explicit reference to the entity\'s cultural origin (people, region, language, religion).',
    '  - First-hand or close-witness account with characteristics consistent with the entity (visual, behavior, named identification, ritual context).',
    '  - Location is in or culturally connected to the entity\'s origin region AND the description fits.',
    '',
    'NOT a credible match:',
    '  - The keyword appears but the report is about something else (e.g. "adze" = woodworking tool, "lechuza" = generic owl).',
    '  - Generic mention with no entity-specific details.',
    '  - Fictional / pop-culture reference (movie, book, game).',
    '  - Wrong cultural context entirely (e.g. an American suburban ghost report tagged as Pishacha).',
    '',
    'OUTPUT: JSON only. {"match": "yes"|"no"|"uncertain", "reasoning": "<1 sentence>"}',
  ].join('\n')
}

async function verifyTag(anth: Anthropic, phen: FolkloricPhen, report: any): Promise<VerifyResult | null> {
  try {
    const resp = await anth.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: buildVerifyPrompt(phen, report) }],
    })
    const text = (resp.content[0] as any)?.text || ''
    const trimmed = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jStart = trimmed.indexOf('{')
    const jEnd = trimmed.lastIndexOf('}')
    if (jStart < 0 || jEnd <= jStart) return null
    const parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
    return {
      match: parsed.match || 'uncertain',
      reasoning: parsed.reasoning || '',
    }
  } catch (e: any) {
    console.warn('  ! Haiku failed:', e?.message || e)
    return null
  }
}

// ── Per-phen audit ──────────────────────────────────────────────────
interface AuditStats {
  total: number
  match_yes: number
  match_no: number
  match_uncertain: number
  haiku_failed: number
  untagged: number
}

async function auditPhen(
  supabase: any,
  anth: Anthropic,
  phen: FolkloricPhen,
  args: ReturnType<typeof parseArgs>,
): Promise<AuditStats> {
  const stats: AuditStats = { total: 0, match_yes: 0, match_no: 0, match_uncertain: 0, haiku_failed: 0, untagged: 0 }

  // Resolve phen id by slug.
  const phenRes = await supabase.from('phenomena').select('id').eq('slug', phen.slug).maybeSingle()
  if (!phenRes.data) {
    console.log('  ⚠️  no phenomenon row with slug "' + phen.slug + '" — skipping')
    return stats
  }
  const phenId = phenRes.data.id

  // Pull all report_phenomena rows for this phen, joined with report metadata.
  let q = supabase
    .from('report_phenomena')
    .select('id, report:reports(id, title, summary, description, city, state_province, country, status)')
    .eq('phenomenon_id', phenId)
  if (args.limit > 0) q = q.limit(args.limit)
  const linksRes = await q
  if (linksRes.error) { console.warn('  ! fetch error:', linksRes.error.message); return stats }
  const links: any[] = linksRes.data || []
  stats.total = links.length

  if (links.length === 0) {
    console.log('  (no tagged reports — nothing to audit)')
    return stats
  }
  console.log('  ' + links.length + ' tagged reports — verifying...')

  // Bounded-concurrency worker pool.
  let nextIndex = 0
  async function processOne(link: any) {
    const report = link.report
    if (!report || report.status !== 'approved') return
    const v = await verifyTag(anth, phen, report)
    if (!v) { stats.haiku_failed++; return }
    if (v.match === 'yes') {
      stats.match_yes++
      return
    }
    if (v.match === 'uncertain') {
      stats.match_uncertain++
      console.log('    ? ' + report.id.substring(0, 8) + ' uncertain: ' + v.reasoning.slice(0, 100))
      return
    }
    // match === 'no' — candidate for untag
    stats.match_no++
    console.log('    ✗ ' + report.id.substring(0, 8) + ' ' + (report.title || '').slice(0, 50).padEnd(52) + ' → ' + v.reasoning.slice(0, 80))
    if (args.apply) {
      const del = await supabase.from('report_phenomena').delete().eq('id', link.id)
      if (del.error) {
        console.warn('      ! untag failed: ' + del.error.message)
      } else {
        stats.untagged++
      }
    }
  }

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= links.length) return
      try { await processOne(links[i]) } catch (e: any) { console.warn('  ! err:', e?.message || e) }
    }
  }

  const workers = Array.from({ length: args.concurrency }, () => worker())
  await Promise.all(workers)
  return stats
}

// ── MAIN ────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs()
  console.log('Folkloric tag audit — V11.17.53')
  console.log('args:', JSON.stringify(args))
  console.log('Mode:', args.apply ? 'APPLY (will delete report_phenomena rows)' : 'DRY-RUN (preview only)')
  console.log()

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const phensToAudit = args.slug
    ? FOLKLORIC_PHENS.filter(p => p.slug === args.slug)
    : FOLKLORIC_PHENS
  if (phensToAudit.length === 0) {
    console.error('No phens to audit. --slug must match one of: ' + FOLKLORIC_PHENS.map(p => p.slug).join(', '))
    process.exit(1)
  }

  const totals: AuditStats = { total: 0, match_yes: 0, match_no: 0, match_uncertain: 0, haiku_failed: 0, untagged: 0 }
  const startedMs = Date.now()

  for (const phen of phensToAudit) {
    console.log('═══ ' + phen.name + ' (' + phen.slug + ') ═══')
    const s = await auditPhen(supabase, anth, phen, args)
    console.log('  Total: ' + s.total + ' | yes: ' + s.match_yes + ' | no: ' + s.match_no + ' | uncertain: ' + s.match_uncertain + ' | untagged: ' + s.untagged + (args.dryRun ? ' (dry)' : ''))
    totals.total += s.total
    totals.match_yes += s.match_yes
    totals.match_no += s.match_no
    totals.match_uncertain += s.match_uncertain
    totals.haiku_failed += s.haiku_failed
    totals.untagged += s.untagged
    console.log()
  }

  const elapsed = ((Date.now() - startedMs) / 1000).toFixed(1)
  console.log('═══════════ ALL DONE ═══════════')
  console.log('Phens audited:    ' + phensToAudit.length)
  console.log('Total tags:       ' + totals.total)
  console.log('Match yes (kept): ' + totals.match_yes)
  console.log('Match no (bad):   ' + totals.match_no)
  console.log('Uncertain (kept): ' + totals.match_uncertain)
  console.log('Haiku failed:     ' + totals.haiku_failed)
  console.log('Untagged:         ' + totals.untagged + (args.dryRun ? ' (DRY-RUN — no changes)' : ''))
  console.log('Time:             ' + elapsed + 's')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

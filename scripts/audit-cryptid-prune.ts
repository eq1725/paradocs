#!/usr/bin/env tsx
/**
 * V11.17.61 — Cryptid taxonomy prune.
 *
 * Pulls every active phenomenon in the cryptids category, sends to
 * Haiku with a strict rubric: which are likely just real-world
 * animals out of place / misidentified known species, vs. which are
 * genuine cryptozoological entities (no known species match + some
 * anomalous / paranormal framing).
 *
 * Output: docs/CRYPTID_PRUNE_REVIEW.json with proposed-archive list
 * for operator review. A separate apply script (TODO) flips
 * status='archived' for the approved entries. Reports stay tagged
 * (so the data isn't lost) but the phen pages disappear from
 * /explore?view=phenomena and /phenomena/[slug] 404s.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-cryptid-prune.ts
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const OUTPUT_PATH = 'docs/CRYPTID_PRUNE_REVIEW.json'

interface PhenRow {
  id: string
  slug: string
  name: string
  ai_summary: string | null
  report_count: number
}

interface ArchiveProposal {
  slug: string
  name: string
  verdict: 'archive' | 'keep'
  category_guess: 'big_cat' | 'primate' | 'large_mammal' | 'color_variant' | 'lake_creature' | 'reptile' | 'humanoid_anomaly' | 'folkloric' | 'mothman_class' | 'other'
  rationale: string
}

const SYSTEM_PROMPT = [
  'You are a taxonomy auditor for Paradocs, a paranormal documentation catalogue.',
  '',
  'The Cryptids category currently contains a mix of:',
  '  (A) GENUINE CRYPTIDS — entities that fit no known species and carry anomalous /',
  '      paranormal framing. Bigfoot, Yeti, Mothman, Dogman, Goatman, Jersey Devil,',
  '      Chupacabra, Dover Demon, Flatwoods Monster, lake monsters (Nessie / Champ /',
  '      Ogopogo / Mokele-mbembe), Spring-Heeled Jack. KEEP these.',
  '',
  '  (B) REAL-ANIMAL SIGHTINGS that drifted into the catalogue but are most likely',
  '      mundane: real big cats in places they shouldn\'t be (Alien Big Cat,',
  '      Australian Panther, Beast of Bodmin Moor, Marozi, Mngwa, Gippsland Phantom',
  '      Cat); claimed primates that are most likely real / undiscovered large',
  '      mammals (Mono Grande, Pongo, Almasti as a primate-cousin claim); known-',
  '      species color variants or oversize individuals (Specter Moose, Old Yellow',
  '      Top, Ochre Coloured Cat); ordinary-looking creatures with vague reports.',
  '      ARCHIVE these.',
  '',
  'EDGE CASES — be conservative (default to KEEP):',
  '  - Lake serpents / aquatic mystery animals → KEEP (these are core cryptozoology',
  '    even if "could be a sturgeon," the cultural status is genuine cryptid).',
  '  - Yeti / Almasti / hominid cryptids → KEEP (canonical cryptozoology).',
  '  - Regional Bigfoot variants (Skunk Ape, Grassman, Fouke Monster) → KEEP.',
  '  - Folkloric beings (Adze, Lechuza, Soucouyant) → KEEP.',
  '  - "Wild man" style hominids → KEEP unless the description is explicitly "this',
  '    is probably a feral human" or "this is a known great ape misidentified."',
  '',
  'When in doubt, KEEP. The cost of archiving a real cryptid is much higher than',
  'the cost of keeping a borderline real-animal page.',
  '',
  'For each phen, output:',
  '  slug, name, verdict ("archive"|"keep"), category_guess, rationale (1 sentence)',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object. No markdown fences. Shape:',
  '{"proposals": [{"slug": "...", "name": "...", "verdict": "...", "category_guess": "...", "rationale": "..."}]}',
].join('\n')

function buildUserPrompt(phens: PhenRow[]): string {
  const lines = phens.map(p => {
    const summary = (p.ai_summary || '').slice(0, 200).replace(/\n/g, ' ')
    return `  ${p.slug} | ${p.name} | ${p.report_count} reports | ${summary}`
  }).join('\n')
  return [
    'CRYPTIDS PHENS (' + phens.length + '):',
    '  [slug | name | report_count | summary]',
    lines,
    '',
    'Evaluate each per the rubric. Be CONSERVATIVE (default to KEEP). JSON only.',
  ].join('\n')
}

async function callHaiku(anth: Anthropic, phens: PhenRow[]): Promise<ArchiveProposal[]> {
  const resp = await anth.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 8000,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(phens) }],
  })
  const text = (resp.content[0] as any)?.text || ''
  const trimmed = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const jStart = trimmed.indexOf('{')
  const jEnd = trimmed.lastIndexOf('}')
  if (jStart < 0 || jEnd <= jStart) {
    console.warn('Could not parse JSON. Raw (first 800 chars):')
    console.warn(text.slice(0, 800))
    return []
  }
  try {
    const parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
    return Array.isArray(parsed.proposals) ? parsed.proposals : []
  } catch (e: any) {
    console.warn('JSON parse failed:', e?.message)
    return []
  }
}

async function main() {
  console.log('Cryptid prune audit — V11.17.61')
  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const res = await sb
    .from('phenomena')
    .select('id, slug, name, ai_summary, report_count')
    .eq('status', 'active')
    .eq('category', 'cryptids')
    .order('name', { ascending: true })
  if (res.error) { console.error('fetch failed:', res.error.message); process.exit(1) }
  const phens = (res.data || []) as PhenRow[]
  console.log('Cryptid phens to audit: ' + phens.length)
  console.log()

  // Cryptid count is small enough (~86 after merges) to fit in one
  // Haiku prompt. If it ever exceeds ~150 we'd chunk.
  const proposals = await callHaiku(anth, phens)
  if (proposals.length === 0) {
    console.error('No proposals returned. Aborting.')
    process.exit(1)
  }

  // Validate every slug in proposals actually exists in our list.
  const validSlugs = new Set(phens.map(p => p.slug))
  const validProposals = proposals.filter(p => {
    if (!validSlugs.has(p.slug)) {
      console.warn('  ⚠ dropping proposal for unknown slug: ' + p.slug)
      return false
    }
    return true
  })

  // Group + display.
  const toArchive = validProposals.filter(p => p.verdict === 'archive')
  const toKeep = validProposals.filter(p => p.verdict === 'keep')

  console.log('═══ ARCHIVE (' + toArchive.length + ') ═══')
  // Group by category_guess for readability.
  const byCat: Record<string, ArchiveProposal[]> = {}
  for (const p of toArchive) {
    if (!byCat[p.category_guess]) byCat[p.category_guess] = []
    byCat[p.category_guess].push(p)
  }
  for (const cat of Object.keys(byCat).sort()) {
    console.log('  [' + cat + '] (' + byCat[cat].length + ')')
    for (const p of byCat[cat]) {
      console.log('    - ' + p.name.padEnd(40) + ' ' + p.rationale.slice(0, 80))
    }
  }
  console.log()
  console.log('═══ KEEP (' + toKeep.length + ') — for reference ═══')
  // Just list slugs to keep things short.
  console.log('  ' + toKeep.map(p => p.slug).join(', '))
  console.log()

  // Find phens that Haiku didn't return verdicts for (default = keep, but flag).
  const reviewedSlugs = new Set(validProposals.map(p => p.slug))
  const unreviewed = phens.filter(p => !reviewedSlugs.has(p.slug))
  if (unreviewed.length > 0) {
    console.log('═══ NOT REVIEWED (' + unreviewed.length + ') — defaulted to keep ═══')
    console.log('  ' + unreviewed.map(p => p.slug).join(', '))
    console.log()
  }

  const output = {
    generated_at: new Date().toISOString(),
    model: HAIKU_MODEL,
    cryptid_phens_total: phens.length,
    archived_count: toArchive.length,
    kept_count: toKeep.length + unreviewed.length,
    unreviewed_count: unreviewed.length,
    archive: toArchive,
    keep: toKeep,
    unreviewed: unreviewed.map(p => ({ slug: p.slug, name: p.name })),
  }
  try { mkdirSync(dirname(OUTPUT_PATH), { recursive: true }) } catch { /* exists */ }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2))

  console.log('═══════════ DONE ═══════════')
  console.log('Review file: ' + OUTPUT_PATH)
  console.log('Next: open the JSON, delete any entries from the "archive" array that you')
  console.log('      want to keep, save. Then I will build scripts/apply-cryptid-archive.ts')
  console.log('      to flip status=\'archived\' on the survivors.')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

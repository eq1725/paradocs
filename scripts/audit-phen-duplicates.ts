#!/usr/bin/env tsx
/**
 * V11.17.57 — Taxonomy audit: find duplicate phenomena + bad names.
 *
 * Pulls every active phenomenon grouped by category, sends each
 * category to Haiku in one prompt, and asks for:
 *
 *   1. DUPLICATE CLUSTERS — phens that refer to the same underlying
 *      thing under different names ("Abduction Phenomenon" + "Alien
 *      Abduction" → same).
 *
 *   2. RENAME-ONLY suggestions — phens that aren't duplicates but
 *      have overly clinical / long / AI-flavored names ("Agricultural
 *      UFO Circle Patterns" → "UFO Crop Circles").
 *
 * Output: docs/PHEN_DEDUP_REVIEW.json with the proposed clusters +
 * renames per category. Operator reviews, edits as needed, then a
 * separate apply script (scripts/apply-phen-merges.ts) re-points
 * report_phenomena rows + marks duplicates as status='merged'.
 *
 * Cost: one Haiku call per category (~9 calls) ≈ $0.05 total.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-phen-duplicates.ts
 *
 *   # Single category, useful for spot-checks:
 *   npx tsx scripts/audit-phen-duplicates.ts --category ufos_aliens
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
const OUTPUT_PATH = 'docs/PHEN_DEDUP_REVIEW.json'

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  return {
    category: flag('--category', ''),
    output: flag('--output', OUTPUT_PATH),
  }
}

interface PhenRow {
  id: string
  slug: string
  name: string
  category: string
  ai_summary: string | null
  report_count: number
}

interface ClusterSuggestion {
  canonical_slug: string
  canonical_name: string
  member_slugs: string[]
  rationale: string
}

interface RenameSuggestion {
  slug: string
  current_name: string
  proposed_name: string
  rationale: string
}

interface CategoryAudit {
  category: string
  phen_count: number
  clusters: ClusterSuggestion[]
  rename_only: RenameSuggestion[]
}

const SYSTEM_PROMPT = [
  'You are a taxonomy auditor for Paradocs, a paranormal documentation catalogue.',
  '',
  'You will receive a list of phenomena in one category. Identify two kinds of cleanup:',
  '',
  '1. DUPLICATE CLUSTERS — phens that refer to the same underlying thing under different names.',
  '   Examples:',
  '     "Alien Abduction" + "Abduction Phenomenon" → same thing',
  '     "Crop Circle" + "Agricultural UFO Circle Patterns" → same thing',
  '     "UFO Sighting" + "UFO Encounter" → likely same (decide based on summaries)',
  '   Do NOT cluster things that are merely related but distinct',
  '   ("Bigfoot" and "Sasquatch" are duplicates; "Bigfoot" and "Yeti" are NOT — different cryptids).',
  '',
  '2. RENAME-ONLY — phens that are NOT duplicates of anything in the list, but have overly clinical /',
  '   long / AI-flavored names. Examples:',
  '     "Agricultural UFO Circle Patterns" → "UFO Crop Circles"',
  '     "Spontaneous Aerial Bioluminescence Anomaly" → "Unexplained Lights"',
  '   The proposed name should be how a normal person would search for the phenomenon.',
  '   Do NOT propose a rename just because the name is long; only when it is clinical, jargon-heavy,',
  '   or obviously AI-generated.',
  '',
  'For each duplicate cluster, output:',
  '  canonical_slug — which existing slug should survive (prefer the one with highest report_count,',
  '                    then the shortest / most-popular name)',
  '  canonical_name — the best name for the surviving phen (often one of the existing names; may be',
  '                    a cleaner version)',
  '  member_slugs — array of ALL slugs in the cluster including the canonical',
  '  rationale — one sentence',
  '',
  'For each rename-only suggestion, output:',
  '  slug, current_name, proposed_name, rationale',
  '',
  'CONSERVATIVE BIAS: only cluster phens you are confident are the same thing. When in doubt, leave',
  'them separate. False clusters destroy real distinctions.',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object. No markdown fences, no preamble. Shape:',
  '{',
  '  "clusters": [{"canonical_slug": "...", "canonical_name": "...", "member_slugs": ["..."], "rationale": "..."}],',
  '  "rename_only": [{"slug": "...", "current_name": "...", "proposed_name": "...", "rationale": "..."}]',
  '}',
].join('\n')

function buildUserPrompt(category: string, phens: PhenRow[]): string {
  const lines = phens.map(p => {
    const summary = (p.ai_summary || '').slice(0, 150).replace(/\n/g, ' ')
    return `  ${p.slug} | ${p.name} | ${p.report_count} reports | ${summary}`
  }).join('\n')
  return [
    `CATEGORY: ${category}`,
    `PHENOMENA (${phens.length}):`,
    '  [slug | name | report_count | summary first 150 chars]',
    lines,
    '',
    'Identify duplicate clusters + rename-only suggestions per the rules. JSON only.',
  ].join('\n')
}

async function callHaiku(anth: Anthropic, category: string, phens: PhenRow[]): Promise<{ clusters: ClusterSuggestion[]; rename_only: RenameSuggestion[] } | null> {
  try {
    const resp = await anth.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 4000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(category, phens) }],
    })
    const text = (resp.content[0] as any)?.text || ''
    const trimmed = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jStart = trimmed.indexOf('{')
    const jEnd = trimmed.lastIndexOf('}')
    if (jStart < 0 || jEnd <= jStart) {
      console.warn('  ! could not parse JSON. Raw response (first 500 chars):')
      console.warn('    ' + text.slice(0, 500))
      return null
    }
    const parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
    return {
      clusters: Array.isArray(parsed.clusters) ? parsed.clusters : [],
      rename_only: Array.isArray(parsed.rename_only) ? parsed.rename_only : [],
    }
  } catch (e: any) {
    console.warn('  ! Haiku failed:', e?.message || e)
    return null
  }
}

async function main() {
  const args = parseArgs()
  console.log('Phenomenon duplicate audit — V11.17.57')
  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Pull all active phens with at least 1 report. Skip the long
  // tail of zero-report phens — they're not visible to users and
  // dedupping them has no functional payoff right now.
  let q = supabase
    .from('phenomena')
    .select('id, slug, name, category, ai_summary, report_count')
    .eq('status', 'active')
    .gt('report_count', 0)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (args.category) q = q.eq('category', args.category)
  const res = await q
  if (res.error) { console.error('fetch failed:', res.error.message); process.exit(1) }
  const phens = (res.data || []) as PhenRow[]
  if (phens.length === 0) { console.log('No phens to audit.'); return }

  // Group by category.
  const byCat: Record<string, PhenRow[]> = {}
  for (const p of phens) {
    if (!byCat[p.category]) byCat[p.category] = []
    byCat[p.category].push(p)
  }
  const categories = Object.keys(byCat).sort()
  console.log('Categories to audit: ' + categories.length)
  console.log('Total phens: ' + phens.length)
  console.log()

  const results: CategoryAudit[] = []
  let totalClusters = 0
  let totalMembersToMerge = 0
  let totalRenames = 0

  for (const cat of categories) {
    const list = byCat[cat]
    console.log('═══ ' + cat + ' (' + list.length + ' phens) ═══')
    const out = await callHaiku(anth, cat, list)
    if (!out) {
      console.log('  ! Haiku failed; skipping')
      results.push({ category: cat, phen_count: list.length, clusters: [], rename_only: [] })
      continue
    }
    // Validate that every slug Haiku referenced actually exists in
    // this category (catch hallucinations).
    const validSlugs = new Set(list.map(p => p.slug))
    const validClusters = out.clusters.filter(c => {
      const ok = c.member_slugs.every(s => validSlugs.has(s)) && validSlugs.has(c.canonical_slug)
      if (!ok) console.warn('  ⚠ dropping cluster with unknown slug(s): ' + c.member_slugs.join(', '))
      return ok
    })
    const validRenames = out.rename_only.filter(r => {
      const ok = validSlugs.has(r.slug)
      if (!ok) console.warn('  ⚠ dropping rename for unknown slug: ' + r.slug)
      return ok
    })
    console.log('  Clusters: ' + validClusters.length + ' | Renames: ' + validRenames.length)
    for (const c of validClusters) {
      console.log('    ↳ ' + c.canonical_name + ' (' + c.member_slugs.length + ' members): ' + c.member_slugs.join(', '))
    }
    for (const r of validRenames.slice(0, 5)) {
      console.log('    ⟲ ' + r.current_name + ' → ' + r.proposed_name)
    }
    if (validRenames.length > 5) console.log('    ⟲ ... and ' + (validRenames.length - 5) + ' more renames')

    results.push({
      category: cat,
      phen_count: list.length,
      clusters: validClusters,
      rename_only: validRenames,
    })
    totalClusters += validClusters.length
    totalMembersToMerge += validClusters.reduce((s, c) => s + (c.member_slugs.length - 1), 0)
    totalRenames += validRenames.length
    console.log()
  }

  // Persist for review.
  const output = {
    generated_at: new Date().toISOString(),
    model: HAIKU_MODEL,
    total_phens: phens.length,
    total_clusters: totalClusters,
    total_phens_to_merge: totalMembersToMerge,
    total_renames: totalRenames,
    categories: results,
  }
  try { mkdirSync(dirname(args.output), { recursive: true }) } catch { /* exists */ }
  writeFileSync(args.output, JSON.stringify(output, null, 2))

  console.log('═══════════ ALL DONE ═══════════')
  console.log('Categories audited:  ' + categories.length)
  console.log('Total phens:         ' + phens.length)
  console.log('Duplicate clusters:  ' + totalClusters)
  console.log('Phens to merge:      ' + totalMembersToMerge + ' (will be marked status=merged)')
  console.log('Rename-only:         ' + totalRenames)
  console.log()
  console.log('Review file written: ' + args.output)
  console.log('Next: read the JSON, edit/remove any clusters or renames you disagree with,')
  console.log('      then run scripts/apply-phen-merges.ts (TODO) to commit changes.')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

#!/usr/bin/env tsx
/**
 * V11.17.40 — Auto-generate TARGETS entries for the 3 unsupported categories
 * (ufos_aliens, ghosts_hauntings, cryptids) covering all 1041 phenomena.
 *
 * Why auto-gen: hand-curating 1041 PhenomenonTarget entries the way the
 * existing 5 categories were curated is ~80-170 hrs. Auto-gen synthesizes
 * the same shape from phenomena table columns:
 *
 *   keywords      = lower(name) + deslug(slug) + aliases column +
 *                   ai_quick_facts.also_known_as
 *                   (filtered to drop near-stopwords and dedupe)
 *   evidenceRules = generic 3-rule template (positive + negative)
 *   description   = display_blurb → feed_hook → trimmed ai_summary
 *
 * Output: src/lib/ingestion/utils/auto-targets.json
 *
 * The main reclassify-priority-categories.ts script merges this JSON into
 * TARGETS at runtime when one of the 3 covered categories is selected.
 *
 * Re-run this whenever phenomena.aliases / display_blurb / quick_facts
 * change for any phen in the 3 categories.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/generate-auto-targets.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const CATEGORIES = ['ufos_aliens', 'ghosts_hauntings', 'cryptids']
const OUT_PATH = path.resolve(process.cwd(), 'src/lib/ingestion/utils/auto-targets.json')

// Stopword-ish 1-word names whose bare keyword would blow up the candidate
// pre-filter. For these, we don't use the name as a standalone keyword;
// we use compound forms like "${name} sighting" instead.
//
// Heuristic: any 1-word name <= 6 chars that's also a common English noun.
// Hand-picked; safe to extend.
const NAME_AMBIGUOUS_BARE = new Set([
  'orbs', 'orb', 'fetch', 'champ', 'almas', 'portal', 'fireball', 'mimic',
  'shuck', 'visitor', 'apparition', 'doppelganger', 'pukwudgie', 'apport',
  'gnome', 'witch', 'shadow', 'crisis', 'territorial', 'liminal',
])

interface AutoTarget {
  slug: string
  name: string
  keywords: string[]
  evidenceRules: string[]
  description: string
}

interface PhenRow {
  slug: string
  name: string
  aliases: unknown
  ai_summary: string | null
  display_blurb: string | null
  feed_hook: string | null
  ai_quick_facts: unknown
}

function slugToWords(slug: string): string {
  return slug.replace(/-/g, ' ')
}

function dedupeKeep(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    if (typeof raw !== 'string') continue
    const s = raw.trim()
    if (!s) continue
    if (s.length < 3) continue
    const lk = s.toLowerCase()
    if (seen.has(lk)) continue
    seen.add(lk)
    out.push(lk)
  }
  return out
}

function generateKeywords(phen: PhenRow): string[] {
  const raw: string[] = []
  const nameLower = phen.name.toLowerCase()
  const nameIsOneWord = !/\s/.test(nameLower)
  const nameIsAmbiguousBare = nameIsOneWord && NAME_AMBIGUOUS_BARE.has(nameLower)

  if (nameIsAmbiguousBare) {
    // Use compound forms instead of bare ambiguous word
    raw.push(`${nameLower} sighting`)
    raw.push(`${nameLower} encounter`)
    raw.push(`${nameLower} experience`)
  } else {
    raw.push(nameLower)
  }

  const deslug = slugToWords(phen.slug)
  if (deslug !== nameLower) raw.push(deslug)

  // aliases column (jsonb array of strings)
  if (Array.isArray(phen.aliases)) {
    for (const a of phen.aliases) {
      if (typeof a === 'string') raw.push(a)
    }
  }

  // ai_quick_facts.also_known_as
  const qf = phen.ai_quick_facts as { also_known_as?: unknown } | null
  if (qf && Array.isArray(qf.also_known_as)) {
    for (const a of qf.also_known_as) {
      if (typeof a === 'string') raw.push(a)
    }
  }

  return dedupeKeep(raw)
}

function generateEvidenceRules(name: string): string[] {
  return [
    `The narrator describes a first-hand or close-witness encounter with or experience involving ${name}`,
    `The account includes specific details consistent with ${name} (visual description, characteristic behavior, location, or named identification)`,
    `NOT a generic mention, fictional plot, pop-culture reference, movie/TV/book/game recap, or second-hand discussion of ${name}`,
  ]
}

function trimTo(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n).replace(/\s+\S*$/, '').trim() + '…'
}

function generateDescription(phen: PhenRow): string {
  const blurb = (phen.display_blurb || '').trim()
  if (blurb.length >= 20 && blurb.length <= 280) return blurb
  const hook = (phen.feed_hook || '').trim()
  if (hook.length >= 20 && hook.length <= 280) return hook
  const summary = (phen.ai_summary || '').trim()
  if (summary.length >= 20) return trimTo(summary, 240)
  return `Reports involving ${phen.name}`
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const out: Record<string, AutoTarget[]> = {}
  let totalPhens = 0
  let totalKw = 0

  for (const cat of CATEGORIES) {
    const { data, error } = await sb
      .from('phenomena')
      .select('slug,name,aliases,ai_summary,display_blurb,feed_hook,ai_quick_facts')
      .eq('category', cat)
      .eq('status', 'active')

    if (error) {
      console.error(`ERROR ${cat}:`, error.message)
      continue
    }
    if (!data) continue

    const targets = (data as PhenRow[]).map(p => ({
      slug: p.slug,
      name: p.name,
      keywords: generateKeywords(p),
      evidenceRules: generateEvidenceRules(p.name),
      description: generateDescription(p),
    }))

    out[cat] = targets
    totalPhens += targets.length
    const kwCount = targets.reduce((s, t) => s + t.keywords.length, 0)
    totalKw += kwCount
    const avgKw = (kwCount / targets.length).toFixed(1)
    const minKw = Math.min(...targets.map(t => t.keywords.length))
    const maxKw = Math.max(...targets.map(t => t.keywords.length))
    console.log(`${cat.padEnd(20)} ${targets.length} phens   avg ${avgKw} kw/phen (min ${minKw}, max ${maxKw})`)
  }

  console.log(`total: ${totalPhens} phens, ${totalKw} keywords (avg ${(totalKw/totalPhens).toFixed(1)})`)

  const payload = {
    $schema_comment: 'V11.17.40 — auto-generated TARGETS entries for ufos_aliens, ghosts_hauntings, cryptids (1041 phens). Keywords derived from phenomena.name + slug + aliases column + ai_quick_facts.also_known_as. Generic 3-rule evidence template. Description from display_blurb → feed_hook → trimmed ai_summary. Re-generate via scripts/generate-auto-targets.ts whenever phenomena metadata changes.',
    $generated_at: new Date().toISOString(),
    targets: out,
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2))
  console.log(`wrote ${OUT_PATH}`)
}

main().catch(e => { console.error(e); process.exit(1) })

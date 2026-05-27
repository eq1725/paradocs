#!/usr/bin/env tsx
/**
 * Re-categorize reports mis-tagged as psychological_experiences.
 *
 * V11.17.39 (#107) — audit of category=psychological_experiences found
 * that 12% of reports (all from Reddit) are actually UFO or
 * ghost/hauntings content that got mis-categorized at ingestion time.
 * The 50-report sample showed:
 *   - 3 UFO reports (e.g. "Bright Neon Flash Witnessed Simultaneously",
 *     "Sky Turned Black for One Second")
 *   - 3 Ghost reports (e.g. "Video Rewinds Without Touch", "Invisible
 *     Touch Grazes Both Witnesses' Shins")
 *
 * This script does a Haiku pass over the FULL psychological_experiences
 * Reddit corpus (~6k rows), identifies obvious mis-tags, and updates
 * `category` to the correct value. The classifier sweep can then pick
 * them up in their new home.
 *
 * Conservative: only re-categorizes when Haiku's confidence is "high".
 * Anything ambiguous stays in psychological_experiences and gets
 * processed by the regular classifier with the new slugs added in the
 * 20260527 migration.
 *
 * Cost: ~6000 reports × $0.0002 ≈ $1.20 with Haiku.
 * Wall time: ~5min sequential, faster with --parallel.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/recategorize-mistagged-psychological.ts --limit 50    # smoke
 *   npx tsx scripts/recategorize-mistagged-psychological.ts --dry-run     # log only
 *   npx tsx scripts/recategorize-mistagged-psychological.ts               # full run
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

const RECAT_PROMPT = `You re-categorize a paranormal/anomalous report that was filed under "psychological_experiences" but may belong elsewhere.

Pick ONE of these target categories OR "keep":

- "ufos_aliens"        — PRIMARY phenomenon is a craft/object/light in the sky
- "ghosts_hauntings"   — PRIMARY phenomenon is a haunting, apparition, poltergeist, object movement attributed to spirits
- "cryptozoological"   — PRIMARY phenomenon is a physical creature (Bigfoot, Dogman, Mothman, lake monster, etc.)
- "keep"               — actually IS psychological/internal anomalous experience OR ambiguous

CRITICAL: only suggest moving if you are CONFIDENT (high confidence). If ambiguous, say "keep". We trust false-negatives more than false-positives here.

Respond with valid JSON only (no markdown):
{
  "target": "ufos_aliens" | "ghosts_hauntings" | "cryptozoological" | "keep",
  "confidence": "high" | "medium" | "low",
  "reason": string (one sentence)
}`

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    limit: parseInt(flag('--limit', '0')),
    dryRun: bool('--dry-run'),
  }
}

interface DecisionResult { target: string; confidence: string; reason: string }

async function classify(anth: Anthropic, title: string, summary: string): Promise<DecisionResult | null> {
  try {
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: RECAT_PROMPT,
      messages: [{ role: 'user', content: 'TITLE: ' + title + '\n\nSUMMARY: ' + summary.substring(0, 1500) }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (_e) {
    return null
  }
}

async function main() {
  const args = parseArgs()
  console.log('Recategorize mis-tagged psychological_experiences — V11.17.39 (#107)')
  console.log('args:', JSON.stringify(args), '\n')

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Only process Reddit reports — the audit showed all mis-tags came
  // from Reddit. NDERF/OBERF reports are reliably categorized.
  const { count: total } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('category', 'psychological_experiences')
    .eq('source_type', 'reddit')
  console.log('Total Reddit psychological_experiences reports:', total, '\n')

  const cap = args.limit > 0 ? args.limit : (total || 0)

  // Pull all rows. Even at 6k this fits comfortably; we'll iterate in
  // memory. For larger corpora we'd page through.
  let q = supabase.from('reports')
    .select('id, title, summary')
    .eq('status', 'approved')
    .eq('category', 'psychological_experiences')
    .eq('source_type', 'reddit')
    .order('id', { ascending: true })
  if (args.limit > 0) q = q.limit(args.limit) as any
  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('No rows to process.'); return }

  const moved: Record<string, number> = { ufos_aliens: 0, ghosts_hauntings: 0, cryptozoological: 0 }
  let kept = 0
  let failed = 0
  const startMs = Date.now()

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as any
    const result = await classify(anth, r.title || '', r.summary || '')
    if (!result) { failed++; continue }

    if (result.target === 'keep' || result.confidence !== 'high') {
      kept++
    } else if (result.target === 'ufos_aliens' || result.target === 'ghosts_hauntings' || result.target === 'cryptozoological') {
      if (args.dryRun) {
        console.log('  [DRY] ' + r.id.substring(0, 8) + ' → ' + result.target + ' (' + result.reason + ')')
      } else {
        const { error: upErr } = await supabase.from('reports').update({ category: result.target }).eq('id', r.id)
        if (upErr) { failed++; continue }
      }
      moved[result.target]++
    } else {
      kept++
    }

    if ((i + 1) % 100 === 0) {
      const elapsedSec = (Date.now() - startMs) / 1000
      const rate = (i + 1) / elapsedSec
      const eta = Math.floor((rows.length - i - 1) / rate)
      console.log('[+' + Math.floor(elapsedSec) + 's] ' + (i + 1) + '/' + rows.length +
        ' | moved ufos=' + moved.ufos_aliens + ' ghosts=' + moved.ghosts_hauntings +
        ' cryptid=' + moved.cryptozoological + ' kept=' + kept + ' failed=' + failed +
        ' rate=' + rate.toFixed(1) + '/s eta=' + Math.floor(eta / 60) + 'm')
    }
  }

  console.log('\n========== FINAL ==========')
  console.log('Processed:           ' + rows.length)
  console.log('→ ufos_aliens:       ' + moved.ufos_aliens)
  console.log('→ ghosts_hauntings:  ' + moved.ghosts_hauntings)
  console.log('→ cryptozoological:  ' + moved.cryptozoological)
  console.log('Kept (psychological):' + kept)
  console.log('Failed:              ' + failed)
  const movedTotal = moved.ufos_aliens + moved.ghosts_hauntings + moved.cryptozoological
  const pct = ((movedTotal / rows.length) * 100).toFixed(1)
  console.log('Mis-tag rate:        ' + pct + '%')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

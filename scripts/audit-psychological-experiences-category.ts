#!/usr/bin/env tsx
/**
 * Audit reports tagged category='psychological_experiences'.
 *
 * V11.17.39 (#107) — the classifier returned null for ALL 273 reports
 * in this category during a recent re-classification sweep. Initial
 * hypothesis was "classifier prompt too strict" — same shape as the
 * ouija-board 0-match (#71). But sampling shows the underlying
 * problem is different: many reports tagged psychological_experiences
 * are actually cryptid / UFO content that doesn't belong here.
 *
 * This script:
 *   1. Samples N reports from category=psychological_experiences.
 *   2. Uses Haiku to classify each into ONE of: matches-category,
 *      mis-categorized-as-X (cryptid/ufos/etc.), or genuinely-no-link.
 *   3. Reports a breakdown so we can decide between (a) prompt fix,
 *      (b) upstream category-assignment fix, or (c) both.
 *
 * Output is read-only — no DB writes. The fix comes after we
 * understand the shape.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-psychological-experiences-category.ts            # 50 sample
 *   npx tsx scripts/audit-psychological-experiences-category.ts --n 200    # bigger
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

const AUDIT_PROMPT = `You categorize paranormal/anomalous experience reports into one of FIVE buckets:

Bucket A — Genuinely psychological (matches the category): the report describes a primarily internal/subjective anomalous experience that fits one of: astral projection, out-of-body experience (OBE), near-death experience (NDE), deathbed vision, tulpamancy, anomalous memory, time slip, deja vu, dream experience, spiritually transformative experience, prayer experience, distressing NDE, shared death experience.

Bucket B — Cryptid creature sighting (mis-categorized): the report's PRIMARY phenomenon is a physical creature like Bigfoot/Sasquatch, Dogman, Wendigo, Mothman, lake monster, etc.

Bucket C — UFO/UAP encounter (mis-categorized): the report's PRIMARY phenomenon is a craft/object/light in the sky.

Bucket D — Ghost/hauntings/poltergeist (mis-categorized): the report's PRIMARY phenomenon is a haunting, apparition, or physical disturbance attributed to spirits.

Bucket E — Other / unclear: edge cases (meditation, channeling, ritual outcome, possession, etc.) or text too thin to classify.

Pick the SINGLE BEST bucket. Respond with valid JSON only (no markdown):
{
  "bucket": "A" | "B" | "C" | "D" | "E",
  "reason": string (one short sentence)
}`

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  return { n: parseInt(flag('--n', '50')) }
}

async function classify(anth: Anthropic, title: string, summary: string): Promise<{ bucket: string; reason: string } | null> {
  try {
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: AUDIT_PROMPT,
      messages: [{ role: 'user', content: 'TITLE: ' + title + '\n\nSUMMARY: ' + summary.substring(0, 1500) }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (e: any) {
    return null
  }
}

async function main() {
  const args = parseArgs()
  console.log('Audit psychological_experiences category — V11.17.39 (#107)')
  console.log('sample size:', args.n, '\n')

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const { count: total } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('category', 'psychological_experiences')
  console.log('Total approved reports in psychological_experiences:', total, '\n')

  // Pull a random-ish sample (we don't have RAND() via supabase JS,
  // so sort by id and skip a random offset for variety across runs).
  const offset = Math.floor(Math.random() * Math.max(1, (total || 0) - args.n))
  const { data: rows } = await supabase
    .from('reports')
    .select('id, title, summary, source_type, source_url')
    .eq('status', 'approved')
    .eq('category', 'psychological_experiences')
    .order('id', { ascending: true })
    .range(offset, offset + args.n - 1)
  if (!rows || rows.length === 0) { console.log('No rows.'); return }

  console.log('Classifying ' + rows.length + ' samples (offset=' + offset + ')...\n')

  const buckets: Record<string, { count: number; samples: string[] }> = {
    A: { count: 0, samples: [] },
    B: { count: 0, samples: [] },
    C: { count: 0, samples: [] },
    D: { count: 0, samples: [] },
    E: { count: 0, samples: [] },
  }
  const bySource: Record<string, Record<string, number>> = {}

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as any
    const result = await classify(anth, r.title || '', r.summary || '')
    if (!result) {
      console.log('  [' + (i + 1) + '/' + rows.length + '] ' + r.id.substring(0, 8) + ' → FAILED to classify')
      continue
    }
    buckets[result.bucket].count++
    if (buckets[result.bucket].samples.length < 3) {
      buckets[result.bucket].samples.push((r.title || '').substring(0, 80) + '  [' + (r.source_type || '?') + ']')
    }
    if (!bySource[r.source_type || 'unknown']) bySource[r.source_type || 'unknown'] = {}
    bySource[r.source_type || 'unknown'][result.bucket] = (bySource[r.source_type || 'unknown'][result.bucket] || 0) + 1

    process.stdout.write('.')
    if ((i + 1) % 20 === 0) process.stdout.write(' ' + (i + 1) + '\n')
  }
  console.log('\n')

  console.log('========== BUCKET BREAKDOWN ==========')
  const labels: Record<string, string> = {
    A: 'A — Genuinely psychological (correctly categorized)',
    B: 'B — Cryptid (MIS-CATEGORIZED)',
    C: 'C — UFO/UAP (MIS-CATEGORIZED)',
    D: 'D — Ghost/hauntings (MIS-CATEGORIZED)',
    E: 'E — Other / unclear',
  }
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    const pct = ((buckets[k].count / rows.length) * 100).toFixed(1)
    console.log()
    console.log(labels[k] + ': ' + buckets[k].count + ' (' + pct + '%)')
    for (const s of buckets[k].samples) console.log('  - ' + s)
  }

  console.log('\n========== BY SOURCE_TYPE ==========')
  for (const src of Object.keys(bySource).sort()) {
    const counts = bySource[src]
    const total = Object.values(counts).reduce((s, n) => s + n, 0)
    const breakdown = Object.entries(counts).map(([k, n]) => k + '=' + n).join(' ')
    console.log('  ' + src + ' (n=' + total + '): ' + breakdown)
  }

  const misCount = buckets.B.count + buckets.C.count + buckets.D.count
  const misPct = ((misCount / rows.length) * 100).toFixed(1)
  console.log('\n========== VERDICT ==========')
  console.log('Mis-categorized (B+C+D): ' + misCount + '/' + rows.length + ' (' + misPct + '%)')
  if (misCount > rows.length * 0.4) {
    console.log('→ DIAGNOSIS: heavy upstream category-assignment bug. The classifier 0-match was correct; these reports should not link to psychological_experiences phenomena.')
    console.log('→ FIX: investigate WHERE category gets set in the ingestion pipeline (Reddit subreddit map, YouTube channel→cat map, AI classifier prompt at ingest). Re-categorize the affected rows.')
  } else if (misCount > rows.length * 0.1) {
    console.log('→ DIAGNOSIS: mixed — some upstream mis-categorization + some genuinely psychological reports the classifier prompt is too strict on.')
    console.log('→ FIX: both — re-categorize the obvious mis-tags, and audit the classifier prompt for the remainder.')
  } else {
    console.log('→ DIAGNOSIS: classifier prompt likely too strict on legitimate psychological reports.')
    console.log('→ FIX: loosen the prompt (per #71 pattern). Sample the bucket-A rejections to find what vocabulary the prompt is missing.')
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

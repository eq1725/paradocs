#!/usr/bin/env tsx
/**
 * V11.17.40 — Vetting sample for auto-generated TARGETS.
 *
 * Runs a small per-category pull (top N phens by current report_count)
 * and prints actual candidate report titles. Lets the operator eyeball
 * pre-filter precision before authorizing the full sweep.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/sample-auto-target-candidates.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const TOP_PHENS_PER_CAT = 6
const SAMPLES_PER_PHEN = 4

interface AutoTarget {
  slug: string
  name: string
  keywords: string[]
  evidenceRules: string[]
  description: string
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const json = JSON.parse(fs.readFileSync(path.resolve('src/lib/ingestion/utils/auto-targets.json'), 'utf-8'))

  for (const cat of Object.keys(json.targets)) {
    const targets: AutoTarget[] = json.targets[cat]
    console.log(`\n========== ${cat} ==========`)

    // Pull all phens' current report_count to rank
    const slugs = targets.map(t => t.slug)
    const phenInfo = new Map<string, { name: string; report_count: number }>()
    for (let i = 0; i < slugs.length; i += 200) {
      const chunk = slugs.slice(i, i + 200)
      const { data } = await sb.from('phenomena').select('slug, name, report_count').in('slug', chunk)
      for (const r of (data || [])) phenInfo.set(r.slug, { name: r.name, report_count: r.report_count || 0 })
    }

    const ranked = targets
      .map(t => ({ ...t, report_count: phenInfo.get(t.slug)?.report_count || 0 }))
      .sort((a, b) => b.report_count - a.report_count)
      .slice(0, TOP_PHENS_PER_CAT)

    // For each top phen, pull up to SAMPLES_PER_PHEN candidate titles
    for (const t of ranked) {
      const seen = new Set<string>()
      const samples: Array<{ title: string; slug: string; kw: string }> = []
      for (const kw of t.keywords) {
        if (samples.length >= SAMPLES_PER_PHEN) break
        const pat = '%' + kw + '%'
        const { data } = await sb
          .from('reports')
          .select('id, slug, title')
          .eq('status', 'approved')
          .or('description.ilike.' + pat + ',title.ilike.' + pat)
          .limit(SAMPLES_PER_PHEN * 2)
        for (const r of (data || [])) {
          if (samples.length >= SAMPLES_PER_PHEN) break
          if (seen.has(r.id)) continue
          seen.add(r.id)
          samples.push({ title: r.title, slug: r.slug, kw })
        }
      }
      console.log(`\n  ▸ ${t.slug} (${t.name}) — existing ${t.report_count} links — ${t.keywords.length} kws`)
      console.log(`    keywords: ${t.keywords.join(', ')}`)
      console.log(`    sample matches (pre-Haiku):`)
      if (samples.length === 0) {
        console.log(`      (no pre-filter matches)`)
      } else {
        for (const s of samples) {
          console.log(`      [${s.kw}] ${s.title.slice(0, 95)}`)
        }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })

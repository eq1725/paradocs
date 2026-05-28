#!/usr/bin/env tsx
/**
 * V11.17.40 — Fast candidate-pool counter for auto-generated TARGETS.
 *
 * Skips the per-candidate already-linked + rejection-memo checks that
 * make the main script's dry-run slow. Just answers: given my keywords,
 * how many approved reports CONTAIN them? Per-phen aggregation gives a
 * sense of whether candidate pool sizes are sane.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/count-auto-target-pool.ts
 *   npx tsx scripts/count-auto-target-pool.ts --category cryptids
 *   npx tsx scripts/count-auto-target-pool.ts --top 30
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

interface Args {
  category: string | null
  top: number
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const flag = (n: string, d: string | null = null) => { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  return {
    category: flag('--category'),
    top: parseInt(flag('--top', '15') || '15'),
  }
}

async function main() {
  const args = parseArgs()
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const json = JSON.parse(fs.readFileSync(path.resolve('src/lib/ingestion/utils/auto-targets.json'), 'utf-8'))
  const cats: string[] = args.category
    ? [args.category]
    : Object.keys(json.targets)

  for (const cat of cats) {
    const targets = json.targets[cat]
    if (!targets) { console.warn(`no targets for ${cat}`); continue }

    console.log(`\n=== ${cat} (${targets.length} phens) ===`)

    // Run in parallel with a small concurrency cap to avoid overwhelming Supabase
    const results: Array<{ slug: string; name: string; pool: number; kw: string[] }> = []
    const concurrency = 12

    async function countOne(t: any) {
      // Build an OR clause for all keywords across title + description
      const orParts: string[] = []
      for (const k of t.keywords) {
        const pat = '%' + String(k).replace(/[%_]/g, '') + '%'
        orParts.push('title.ilike.' + pat)
        orParts.push('description.ilike.' + pat)
      }
      const orStr = orParts.join(',')
      const { count, error } = await sb
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .or(orStr)
      if (error) {
        results.push({ slug: t.slug, name: t.name, pool: -1, kw: t.keywords })
      } else {
        results.push({ slug: t.slug, name: t.name, pool: count || 0, kw: t.keywords })
      }
    }

    // pool with concurrency
    let idx = 0
    const inflight: Promise<void>[] = []
    while (idx < targets.length || inflight.length > 0) {
      while (inflight.length < concurrency && idx < targets.length) {
        const p = countOne(targets[idx++])
        const wrap = p.then(() => { inflight.splice(inflight.indexOf(wrap), 1) })
        inflight.push(wrap)
      }
      if (inflight.length > 0) await Promise.race(inflight)
    }

    results.sort((a, b) => b.pool - a.pool)
    const total = results.reduce((s, r) => s + Math.max(0, r.pool), 0)
    const nonZero = results.filter(r => r.pool > 0).length
    const huge = results.filter(r => r.pool >= 5000).length

    console.log(`  candidate-pool total: ${total.toLocaleString()} matches across ${nonZero}/${targets.length} non-empty phens`)
    console.log(`  phens with pool >= 5000: ${huge}`)
    console.log(`  top ${args.top} by pool size:`)
    for (const r of results.slice(0, args.top)) {
      const kwShort = r.kw.slice(0, 3).join(', ') + (r.kw.length > 3 ? '…' : '')
      console.log(`    ${String(r.pool).padStart(7)} | ${r.slug.padEnd(38)} | ${kwShort}`)
    }
    console.log(`  bottom 10 (non-zero):`)
    const nz = results.filter(r => r.pool > 0)
    for (const r of nz.slice(-10)) {
      console.log(`    ${String(r.pool).padStart(7)} | ${r.slug.padEnd(38)} | ${r.kw.slice(0, 3).join(', ')}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })

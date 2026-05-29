#!/usr/bin/env tsx
/**
 * V11.15.2 — Rule-based phenomenon classifier (sample run).
 *
 * 95k approved reports exist but only ~22 of 1,463 active phenomena
 * have ANY reports linked. Bulk ingestion sets reports.category but
 * never reports.phenomenon_type_id, so the encyclopedia browse view
 * shows almost no coverage.
 *
 * Approach: for each report, walk the phenomena in the same category
 * and look for an alias or the phenomenon name in the report's title
 * or summary/feed_hook. Match the highest-specificity hit (longer
 * names beat shorter, alias hits beat partial name hits).
 *
 * This run is sample-only — picks 1000 random approved reports,
 * shows match rate + top matches, does NOT write to DB. Used to
 * decide if rule-based coverage is good enough OR if we need to
 * layer in AI fallback.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/classify-phenomena-sample.ts
 *   tsx scripts/classify-phenomena-sample.ts --sample 5000
 *   tsx scripts/classify-phenomena-sample.ts --category cryptids
 */

import { createClient } from '@supabase/supabase-js'

interface Phenomenon {
  id: string
  phenomenon_type_id: string | null
  slug: string
  name: string
  category: string
  aliases: string[] | null
}

interface MatchCandidate {
  phenomenon: Phenomenon
  matchedTerm: string
  specificity: number  // length of matched term — longer = more specific
}

const argv = process.argv
const sampleArg = argv.indexOf('--sample')
const SAMPLE_SIZE = sampleArg >= 0 ? parseInt(argv[sampleArg + 1], 10) || 1000 : 1000
const categoryArg = argv.indexOf('--category')
const CATEGORY_FILTER = categoryArg >= 0 ? argv[categoryArg + 1] : null

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findBestMatch(
  text: string,
  phenomena: Phenomenon[],
): MatchCandidate | null {
  const lower = text.toLowerCase()
  let best: MatchCandidate | null = null

  for (const p of phenomena) {
    // Build candidate terms: name + aliases. Skip very short generic
    // terms ('vu', 'em', etc.) that would over-match.
    const terms: string[] = []
    if (p.name && p.name.length >= 4) terms.push(p.name)
    if (Array.isArray(p.aliases)) {
      for (const a of p.aliases) {
        if (a && a.length >= 4) terms.push(a)
      }
    }

    for (const term of terms) {
      const t = term.toLowerCase().trim()
      if (!t) continue
      // Use word-boundary regex so "near death" matches "near-death" etc.
      const re = new RegExp('\\b' + escapeRegex(t).replace(/\s+/g, '\\s+') + '\\b', 'i')
      if (re.test(lower)) {
        const spec = t.length
        if (!best || spec > best.specificity) {
          best = { phenomenon: p, matchedTerm: term, specificity: spec }
        }
        break  // first match per phenomenon is enough
      }
    }
  }
  return best
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== Phenomenon classifier — sample run ===')
  console.log('Sample size: ' + SAMPLE_SIZE)
  if (CATEGORY_FILTER) console.log('Category filter: ' + CATEGORY_FILTER)
  console.log('')

  // Fetch all active phenomena with aliases, organized by category.
  console.log('Loading phenomena catalog...')
  let phenomQuery = sb.from('phenomena')
    .select('id, phenomenon_type_id, slug, name, category, aliases')
    .eq('status', 'active')
  if (CATEGORY_FILTER) phenomQuery = phenomQuery.eq('category', CATEGORY_FILTER)
  // Supabase 1000-row cap — paginate.
  const phenomena: Phenomenon[] = []
  let pageStart = 0
  while (true) {
    const res = await phenomQuery.range(pageStart, pageStart + 999)
    if (res.error) { console.error(res.error.message); process.exit(1) }
    const rows = res.data || []
    phenomena.push(...(rows as any))
    if (rows.length < 1000) break
    pageStart += 1000
    if (pageStart > 10000) break
  }
  console.log('  loaded ' + phenomena.length + ' active phenomena')

  // Group by category for fast lookup
  const byCategory = new Map<string, Phenomenon[]>()
  for (const p of phenomena) {
    if (!p.category) continue
    if (!byCategory.has(p.category)) byCategory.set(p.category, [])
    byCategory.get(p.category)!.push(p)
  }
  console.log('  categories covered: ' + byCategory.size)
  Array.from(byCategory.entries()).forEach(function([cat, arr]) {
    console.log('    ' + cat + ': ' + arr.length + ' phenomena')
  })
  console.log('')

  // Sample approved reports
  console.log('Sampling ' + SAMPLE_SIZE + ' approved reports...')
  let repQuery = sb.from('reports')
    .select('id, title, summary, feed_hook, category, phenomenon_type_id')
    .eq('status', 'approved')
    .is('phenomenon_type_id', null)
  if (CATEGORY_FILTER) repQuery = repQuery.eq('category', CATEGORY_FILTER)
  // Random sample via Postgres random() — but Supabase doesn't expose
  // that directly. Use order by created_at desc and limit; close
  // enough for a hit-rate gauge.
  const reportsRes = await repQuery
    .order('created_at', { ascending: false })
    .limit(SAMPLE_SIZE)
  if (reportsRes.error) { console.error(reportsRes.error.message); process.exit(1) }
  const reports = reportsRes.data || []
  console.log('  loaded ' + reports.length + ' reports')
  console.log('')

  // Classify
  const stats = {
    matched: 0,
    unmatched: 0,
    byPhenomenon: new Map<string, number>(),
    byCategory: new Map<string, { matched: number; unmatched: number }>(),
  }
  const sampleMatches: Array<{ title: string; cat: string; matched: string }> = []
  const sampleUnmatched: Array<{ title: string; cat: string }> = []

  for (const r of reports) {
    const cat = (r as any).category
    const phenomList = byCategory.get(cat) || []
    if (!stats.byCategory.has(cat)) stats.byCategory.set(cat, { matched: 0, unmatched: 0 })
    const catStats = stats.byCategory.get(cat)!

    const text = ((r as any).title || '') + ' ' + ((r as any).summary || '') + ' ' + ((r as any).feed_hook || '')
    const match = findBestMatch(text, phenomList)

    if (match) {
      stats.matched++
      catStats.matched++
      const key = match.phenomenon.slug
      stats.byPhenomenon.set(key, (stats.byPhenomenon.get(key) || 0) + 1)
      if (sampleMatches.length < 30) {
        sampleMatches.push({
          title: ((r as any).title || '').substring(0, 70),
          cat: cat,
          matched: match.phenomenon.name + ' (' + match.matchedTerm + ')',
        })
      }
    } else {
      stats.unmatched++
      catStats.unmatched++
      if (sampleUnmatched.length < 20) {
        sampleUnmatched.push({ title: ((r as any).title || '').substring(0, 70), cat: cat })
      }
    }
  }

  // Report
  const total = stats.matched + stats.unmatched
  const matchPct = total > 0 ? Math.round((stats.matched / total) * 100) : 0
  console.log('═══════════════════════════════════════════════════')
  console.log('Hit rate: ' + stats.matched + '/' + total + ' (' + matchPct + '%)')
  console.log('═══════════════════════════════════════════════════')
  console.log('')

  console.log('Per-category hit rate:')
  Array.from(stats.byCategory.entries()).forEach(function([cat, s]) {
    const tot = s.matched + s.unmatched
    const pct = tot > 0 ? Math.round((s.matched / tot) * 100) : 0
    console.log('  ' + cat.padEnd(28) + s.matched + '/' + tot + ' (' + pct + '%)')
  })
  console.log('')

  console.log('Top 20 matched phenomena:')
  const sorted = Array.from(stats.byPhenomenon.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
  sorted.forEach(([slug, count]) => {
    console.log('  ' + count.toString().padStart(4) + '  ' + slug)
  })
  console.log('')

  console.log('Sample matches:')
  sampleMatches.slice(0, 15).forEach(m => {
    console.log('  [' + m.cat + '] ' + m.title + ' → ' + m.matched)
  })
  console.log('')

  console.log('Sample unmatched (need AI or alias additions):')
  sampleUnmatched.slice(0, 15).forEach(u => {
    console.log('  [' + u.cat + '] ' + u.title)
  })
}

main().catch((e) => { console.error('Fatal:', e?.message || e); process.exit(1) })

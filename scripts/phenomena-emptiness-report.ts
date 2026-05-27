#!/usr/bin/env tsx
/**
 * Phenomena taxonomy emptiness report — V11.17.39.
 *
 * Dumps all active phenomena ranked by emptiness (report_count + last
 * activity) so Chase can review which entries are unlikely to ever
 * receive a real report and should be archived.
 *
 * Output (phenomena-emptiness.csv) columns:
 *   - report_count           : current count from phenomena.report_count
 *   - junction_links         : actual count from report_phenomena (truth)
 *   - category               : phenomenon category
 *   - slug                   : phenomenon slug
 *   - name                   : display name
 *   - has_image              : whether primary_image_url is set
 *   - has_ai_summary         : whether ai_summary is non-trivial
 *   - aliases_count          : number of aliases (proxy for cultural reach)
 *   - days_since_created     : age of the phenomenon row
 *   - days_since_classified  : age of last AI generation
 *   - ai_summary_snippet     : first 200 chars
 *
 * Sorted by junction_links ascending then by has_image ascending then
 * by category. Lets you scan top-down and decide which entries to
 * archive in bulk.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/phenomena-emptiness-report.ts
 *   # then: open phenomena-emptiness.csv
 *
 * Companion script: phenomena-bulk-archive.ts (TBD — accepts a slug
 * list and sets status='archived' on each).
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function csvEscape(s: any): string {
  if (s == null) return ''
  const str = String(s)
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
  return str
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  console.log('Fetching all active phenomena...')
  const all: any[] = []
  let lastId = ''
  while (true) {
    let q = s.from('phenomena')
      .select('id, slug, name, category, aliases, ai_summary, primary_image_url, report_count, created_at, ai_generated_at')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    all.push(...data)
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  console.log('Loaded ' + all.length + ' active phenomena')

  console.log('Computing actual junction counts (this takes ~3-5 min)...')
  // Per-phenomenon junction count. Doing this serially with a small
  // throttle to avoid burning Supabase rate limits.
  const startMs = Date.now()
  for (let i = 0; i < all.length; i++) {
    const r = await s.from('report_phenomena').select('*', { count: 'exact', head: true }).eq('phenomenon_id', all[i].id)
    all[i].junction_links = r.count || 0
    if ((i + 1) % 100 === 0) {
      const elapsedSec = (Date.now() - startMs) / 1000
      const rate = (i + 1) / elapsedSec
      const eta = Math.floor((all.length - i - 1) / rate)
      console.log('[+' + Math.floor(elapsedSec) + 's] ' + (i + 1) + '/' + all.length + ' rate=' + rate.toFixed(0) + '/s eta=' + Math.floor(eta / 60) + 'm')
    }
  }

  // Sort: junction_links ASC, has_image ASC, category, name
  all.sort((a, b) => {
    if (a.junction_links !== b.junction_links) return a.junction_links - b.junction_links
    const aImg = a.primary_image_url ? 1 : 0
    const bImg = b.primary_image_url ? 1 : 0
    if (aImg !== bImg) return aImg - bImg
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.name.localeCompare(b.name)
  })

  const HEADERS = [
    'junction_links', 'report_count_cached', 'category', 'slug', 'name',
    'has_image', 'has_ai_summary', 'aliases_count',
    'days_since_created', 'days_since_classified',
    'ai_summary_snippet',
  ]
  const lines: string[] = [HEADERS.join(',')]
  for (const p of all) {
    const aliasesCount = Array.isArray(p.aliases) ? p.aliases.length : 0
    const summarySnippet = (p.ai_summary || '').substring(0, 200).replace(/\s+/g, ' ').trim()
    lines.push([
      csvEscape(p.junction_links),
      csvEscape(p.report_count || 0),
      csvEscape(p.category),
      csvEscape(p.slug),
      csvEscape(p.name),
      csvEscape(p.primary_image_url ? 'yes' : 'no'),
      csvEscape(p.ai_summary && p.ai_summary.length > 50 ? 'yes' : 'no'),
      csvEscape(aliasesCount),
      csvEscape(daysSince(p.created_at)),
      csvEscape(daysSince(p.ai_generated_at)),
      csvEscape(summarySnippet),
    ].join(','))
  }

  const outPath = 'phenomena-emptiness.csv'
  fs.writeFileSync(outPath, lines.join('\n') + '\n')

  // Print summary stats so Chase can pick thresholds
  console.log('\n========== SUMMARY ==========')
  console.log('Wrote ' + (lines.length - 1) + ' rows to ' + outPath)
  console.log()
  const empty = all.filter(p => p.junction_links === 0)
  const oneTen = all.filter(p => p.junction_links >= 1 && p.junction_links < 10)
  const tenHundred = all.filter(p => p.junction_links >= 10 && p.junction_links < 100)
  const hundredPlus = all.filter(p => p.junction_links >= 100)
  console.log('  0 junction links:      ' + empty.length + ' (candidates for archive)')
  console.log('  1-9 junction links:    ' + oneTen.length + ' (low-volume; review)')
  console.log('  10-99 junction links:  ' + tenHundred.length + ' (legit, keep)')
  console.log('  100+ junction links:   ' + hundredPlus.length + ' (high-volume, definitely keep)')
  console.log()
  console.log('Of the 0-link group, no-image breakdown:')
  const emptyNoImg = empty.filter(p => !p.primary_image_url)
  const emptyWithImg = empty.filter(p => p.primary_image_url)
  console.log('  with image (auto-adopted today): ' + emptyWithImg.length)
  console.log('  without image:                   ' + emptyNoImg.length)
  console.log()
  console.log('By category, 0-link count:')
  const catCounts: Record<string, number> = {}
  for (const p of empty) catCounts[p.category] = (catCounts[p.category] || 0) + 1
  for (const cat of Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a])) {
    console.log('  ' + cat.padEnd(28) + ' ' + catCounts[cat])
  }
  console.log()
  console.log('Open the CSV:')
  console.log('  open ' + outPath)
  console.log()
  console.log('To archive a list of slugs in bulk, save them to a text file and we can build the bulk-archive script when you have your cut list.')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

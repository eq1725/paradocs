#!/usr/bin/env tsx
/**
 * Export the still-missing phenomena images to CSV for manual sourcing.
 *
 * V11.17.39 — companion to adopt-phenomena-images.ts. After the
 * Wikimedia auto-adoption pass completes, the residual phenomena
 * without primary_image_url need human sourcing (video frame capture,
 * museum archives, BFRO/MUFON databases, etc.). This script dumps
 * everything you need to work through them manually.
 *
 * Output: missing-images.csv with columns:
 *   slug, name, category, aliases, description_summary,
 *   wikipedia_search_url, wikimedia_search_url, google_image_search_url,
 *   admin_edit_url
 *
 * The search URLs are pre-built so you can click straight from the
 * spreadsheet to start sourcing.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/export-missing-phenomena-images.ts                # all missing
 *   npx tsx scripts/export-missing-phenomena-images.ts --category cryptozoological
 *   npx tsx scripts/export-missing-phenomena-images.ts --out path.csv
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  return {
    category: flag('--category'),
    out: flag('--out', 'missing-images.csv')!,
  }
}

function csvEscape(s: string | null | undefined): string {
  if (s == null) return ''
  const str = String(s)
  // Quote if contains comma, newline, or quote
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

async function main() {
  const args = parseArgs()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let q = supabase.from('phenomena')
    .select('slug, name, category, aliases, ai_summary')
    .eq('status', 'active')
    .is('primary_image_url', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (args.category) q = q.eq('category', args.category) as any

  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) {
    console.log('No phenomena are missing images. Nothing to export.')
    return
  }

  console.log('Found ' + rows.length + ' phenomena missing images')

  const HEADERS = [
    'slug', 'name', 'category', 'aliases', 'description_snippet',
    'wikipedia_search', 'wikimedia_search', 'google_image_search',
    'admin_edit_url',
  ]

  const lines: string[] = [HEADERS.join(',')]

  for (const row of rows as any[]) {
    const name = row.name || ''
    const aliases = Array.isArray(row.aliases) ? row.aliases.join(' | ') : ''
    const snippet = (row.ai_summary || '').substring(0, 200).replace(/\s+/g, ' ').trim()
    // Pre-built search URLs that you can click straight from the CSV.
    const q1 = encodeURIComponent(name)
    const q2 = encodeURIComponent(name + ' paranormal')
    const wikiURL = 'https://en.wikipedia.org/w/index.php?search=' + q1
    const commonsURL = 'https://commons.wikimedia.org/w/index.php?search=' + q1 + '&title=Special:MediaSearch&go=Go&type=image'
    const gimgURL = 'https://www.google.com/search?tbm=isch&q=' + q2
    const adminURL = 'https://paradocs.app/admin/phenomena/' + row.slug

    lines.push([
      csvEscape(row.slug),
      csvEscape(name),
      csvEscape(row.category),
      csvEscape(aliases),
      csvEscape(snippet),
      csvEscape(wikiURL),
      csvEscape(commonsURL),
      csvEscape(gimgURL),
      csvEscape(adminURL),
    ].join(','))
  }

  fs.writeFileSync(args.out, lines.join('\n') + '\n')
  console.log('Wrote ' + lines.length + ' rows (incl. header) to ' + args.out)
  console.log()
  console.log('Open it in Numbers / Excel / Google Sheets:')
  console.log('  open ' + args.out)
  console.log()
  console.log('Breakdown by category:')
  const byCat: Record<string, number> = {}
  for (const r of rows as any[]) byCat[r.category] = (byCat[r.category] || 0) + 1
  for (const cat of Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])) {
    console.log('  ' + cat.padEnd(30) + ' ' + byCat[cat])
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

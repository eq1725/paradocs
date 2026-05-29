#!/usr/bin/env tsx
/**
 * Bulk-archive phenomena from a slug list.
 *
 * V11.17.39 — companion to phenomena-emptiness-report.ts. After
 * reviewing the emptiness CSV, save the slugs you want to archive
 * into a plain text file (one slug per line, # comments allowed),
 * then run this script.
 *
 * The archive is SOFT — sets phenomena.status='archived'. The row
 * stays in the DB so all junction links remain queryable for audit.
 * Archived phenomena:
 *   - Hidden from /phenomena/<slug> page (renders 404 or redirect)
 *   - Hidden from category browse pages
 *   - Skipped by classifier sweeps (reclassify-priority-categories
 *     already filters status='active' for TARGETS lookups)
 *   - Skipped by image-adoption pipeline
 *
 * To restore an archived phenomenon: UPDATE phenomena SET status='active'
 * WHERE slug = 'foo'.
 *
 * Slug list format:
 *   # Comment line (ignored)
 *   slug-one
 *   slug-two
 *   slug-three
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   # Save your slug list to ./archive-list.txt first
 *   npx tsx scripts/phenomena-bulk-archive.ts archive-list.txt --dry-run
 *   npx tsx scripts/phenomena-bulk-archive.ts archive-list.txt
 *   npx tsx scripts/phenomena-bulk-archive.ts archive-list.txt --note "round-1 taxonomy hygiene"
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  // First positional arg = slug list file
  const positionals = a.filter(x => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--note')
  return {
    file: positionals[0] || null,
    dryRun: bool('--dry-run'),
    note: flag('--note', 'V11.17.39 taxonomy hygiene — archived for low likelihood of receiving real reports'),
  }
}

async function main() {
  const args = parseArgs()
  if (!args.file) {
    console.error('Usage: phenomena-bulk-archive.ts <slug-list-file> [--dry-run] [--note "reason"]')
    process.exit(1)
  }
  if (!fs.existsSync(args.file)) {
    console.error('File not found:', args.file)
    process.exit(1)
  }

  console.log('Bulk archive phenomena — V11.17.39')
  console.log('File:', args.file)
  console.log('Mode:', args.dryRun ? 'DRY-RUN' : 'APPLY')
  console.log('Note: ', args.note)
  console.log()

  // Parse slug list: one per line, # comments allowed, blank lines OK
  const raw = fs.readFileSync(args.file, 'utf8')
  const slugs = raw.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    // Allow comma-separated lines too
    .flatMap(l => l.split(',').map(s => s.trim()))
    .filter(Boolean)

  if (slugs.length === 0) {
    console.error('No slugs found in file.')
    process.exit(1)
  }

  // Dedupe
  const uniq = Array.from(new Set(slugs))
  console.log('Parsed slugs: ' + uniq.length + ' unique')
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Pre-flight: which slugs exist? Which are already archived? Which
  // have non-trivial junction counts (sanity check — operator might
  // not realize they're archiving a phenomenon with 50 linked reports)?
  console.log('Pre-flight check...')
  const lookup = await s.from('phenomena')
    .select('id, slug, name, status, report_count')
    .in('slug', uniq) as any
  if (lookup.error) { console.error('lookup failed:', lookup.error.message); process.exit(1) }

  const byMostFound = new Map<string, any>()
  for (const r of (lookup.data || [])) byMostFound.set(r.slug, r)

  const notFound: string[] = []
  const alreadyArchived: string[] = []
  const willArchive: any[] = []
  let warnNonEmpty = 0

  for (const slug of uniq) {
    const row = byMostFound.get(slug)
    if (!row) { notFound.push(slug); continue }
    if (row.status === 'archived') { alreadyArchived.push(slug); continue }
    if ((row.report_count || 0) >= 10) warnNonEmpty++
    willArchive.push(row)
  }

  console.log()
  console.log('=== Pre-flight ===')
  console.log('Will archive:        ' + willArchive.length)
  console.log('Already archived:    ' + alreadyArchived.length)
  console.log('Not found in DB:     ' + notFound.length)
  console.log()
  if (warnNonEmpty > 0) {
    console.log('⚠ WARNING: ' + warnNonEmpty + ' of the to-archive phenomena have report_count >= 10.')
    console.log('  These will become invisible to users on /phenomena/<slug> pages.')
    console.log('  Their report links are preserved but hidden. Reversible.')
    console.log()
    for (const row of willArchive.filter(r => (r.report_count || 0) >= 10).slice(0, 20)) {
      console.log('    ' + row.slug.padEnd(40) + ' | ' + row.name.padEnd(40) + ' | report_count=' + row.report_count)
    }
    if (warnNonEmpty > 20) console.log('    ... and ' + (warnNonEmpty - 20) + ' more')
    console.log()
  }
  if (notFound.length > 0 && notFound.length < 30) {
    console.log('Not found:')
    for (const s of notFound.slice(0, 30)) console.log('  ' + s)
    console.log()
  }

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run without --dry-run to apply.')
    return
  }

  if (willArchive.length === 0) {
    console.log('Nothing to do (all already archived or not found).')
    return
  }

  // Apply in batches of 100 to avoid request-size issues.
  const BATCH = 100
  let archived = 0
  let errors = 0
  const startMs = Date.now()
  for (let i = 0; i < willArchive.length; i += BATCH) {
    const batch = willArchive.slice(i, i + BATCH)
    const ids = batch.map(r => r.id)
    const { error } = await s.from('phenomena').update({
      status: 'archived',
      // V11.17.39 — stash the operator note in ai_history (free-text
      // text field already exists). Keeps an audit trail without adding
      // a new column. Note the date so we know when this hygiene pass ran.
      ai_history: 'Archived ' + new Date().toISOString().substring(0, 10) + ': ' + args.note,
    }).in('id', ids)
    if (error) {
      errors += batch.length
      console.error('  batch ' + (i / BATCH) + ' failed: ' + error.message)
    } else {
      archived += batch.length
      console.log('  batch ' + (i / BATCH + 1) + ': ' + batch.length + ' archived (running total: ' + archived + ')')
    }
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log()
  console.log('========== FINAL ==========')
  console.log('Archived:     ' + archived)
  console.log('Errors:       ' + errors)
  console.log('Already-arch: ' + alreadyArchived.length + ' (no-op)')
  console.log('Not found:    ' + notFound.length)
  console.log('Elapsed:      ' + elapsedSec + 's')
  console.log()
  console.log('To restore any archived phenomenon:')
  console.log('  UPDATE phenomena SET status=\'active\' WHERE slug = \'<slug>\';')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

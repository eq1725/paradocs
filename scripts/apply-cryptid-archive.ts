#!/usr/bin/env tsx
/**
 * V11.17.61.1 — Apply approved cryptid archive list.
 *
 * Reads docs/CRYPTID_PRUNE_REVIEW.json and flips status='archived'
 * on each phen in the .archive array. Existing report_phenomena
 * rows are left intact — the data isn't lost, just hidden:
 *
 *   - /explore?view=phenomena filters status='active' → archived
 *     phens disappear from the encyclopedia
 *   - /phenomena/[slug] 404s for archived phens
 *   - The report still surfaces under its category + other tags
 *
 * Reversible at any time with:
 *   UPDATE phenomena SET status='active' WHERE slug='X'
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/apply-cryptid-archive.ts --dry-run
 *   npx tsx scripts/apply-cryptid-archive.ts --apply
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INPUT = 'docs/CRYPTID_PRUNE_REVIEW.json'

function parseArgs() {
  const a = process.argv.slice(2)
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Cryptid archive applier — V11.17.61.1')
  console.log('Mode: ' + (args.apply ? 'APPLY (will write to DB)' : 'DRY-RUN (preview only)'))

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const data = JSON.parse(readFileSync(INPUT, 'utf8'))
  const toArchive: Array<{ slug: string; name: string; rationale: string }> = data.archive || []
  if (toArchive.length === 0) {
    console.log('Nothing to archive.')
    return
  }

  console.log('Phens to archive: ' + toArchive.length)
  console.log()

  let archived = 0
  let alreadyArchived = 0
  let missing = 0
  let errors = 0

  for (const p of toArchive) {
    const cur = await sb.from('phenomena').select('id, status').eq('slug', p.slug).maybeSingle()
    if (!cur.data) {
      console.warn('  ! slug not found: ' + p.slug)
      missing++
      continue
    }
    if (cur.data.status === 'archived') {
      console.log('  · ' + p.slug.padEnd(36) + ' already archived')
      alreadyArchived++
      continue
    }
    if (args.dryRun) {
      console.log('  ✓ ' + p.slug.padEnd(36) + ' would archive (' + p.rationale.slice(0, 60) + ')')
      archived++
      continue
    }
    const upd = await sb.from('phenomena').update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    }).eq('id', cur.data.id)
    if (upd.error) {
      console.warn('  ! ' + p.slug + ' archive error: ' + upd.error.message)
      errors++
      continue
    }
    console.log('  ✓ ' + p.slug.padEnd(36) + ' archived')
    archived++
  }

  console.log()
  console.log('═══════════ DONE ═══════════')
  console.log('Archived:        ' + archived + (args.dryRun ? ' (dry-run)' : ''))
  console.log('Already archived: ' + alreadyArchived)
  console.log('Missing:         ' + missing)
  console.log('Errors:          ' + errors)
  if (args.dryRun) {
    console.log()
    console.log('Re-run with --apply to commit changes.')
  } else {
    console.log()
    console.log('Run `tsx scripts/recompute-phenomena-report-counts.ts` to sync category counts.')
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

#!/usr/bin/env tsx
/**
 * Audit approved reports whose AI-generated feed_hook self-confesses
 * as a non-experience (search-request, identity-speculation, or
 * commentary). Distinct from audit-meta-commentary-reports.ts in two
 * ways:
 *
 *   1. Pattern-driven, not Haiku-driven. The hooks that slipped past
 *      the new patterns are by definition the ones we missed — but
 *      the existing hooks that NEWLY match our V11.17.39 (2nd round)
 *      patterns are deterministic rejects, no AI needed.
 *
 *   2. Operates on `feed_hook` (the AI's 2-sentence distillation),
 *      not the raw source. The hook reflects the AI's understanding
 *      of what the post actually is — exactly the signal we want to
 *      catch slips against.
 *
 * Default DRY-RUN. Run with --apply to archive.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-self-confessing-hooks.ts --dry-run
 *   npx tsx scripts/audit-self-confessing-hooks.ts --apply
 *
 * V11.17.39 (2nd round) — Chase 2026-05-27 operator spot-check found:
 *   - "A user searches for a specific video showing a family in a
 *     car witnessing what appears to be military aircraft..."
 *   - "A Covington resident with oculocutaneous albinism and a
 *     maternal line of reported psychic practitioners wonders if
 *     their unusual genetic traits might signal descent from the
 *     'Tall Whites.'"
 * Both have explicit "rather than reporting a direct experience" or
 * "wonders if their" tells in the hook text the AI wrote.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { META_POST_PATTERNS } from '../src/lib/ingestion/filters/quality-filter'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
  }
}

function findMatchingPattern(text: string): RegExp | null {
  for (const pattern of META_POST_PATTERNS) {
    if (pattern.test(text)) return pattern
  }
  return null
}

async function main() {
  const args = parseArgs()
  console.log('Audit self-confessing feed_hooks — V11.17.39 (2nd round)')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Page through approved reports with id-cursor.
  const flagged: Array<{ id: string; title: string; feed_hook: string; pattern: string }> = []
  let lastId = ''
  let scanned = 0
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, feed_hook, status, source_type')
      .eq('status', 'approved')
      .not('feed_hook', 'is', null)
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data as any[]) {
      scanned++
      const hook: string = r.feed_hook || ''
      const matched = findMatchingPattern(hook)
      if (matched) {
        flagged.push({
          id: r.id,
          title: r.title || '',
          feed_hook: hook,
          pattern: matched.source.substring(0, 80),
        })
      }
    }
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
    if (scanned % 5000 === 0) console.log('  scanned: ' + scanned + ' / flagged: ' + flagged.length)
  }

  console.log()
  console.log('Total scanned: ' + scanned)
  console.log('Flagged for archive: ' + flagged.length)
  console.log()

  // Group by pattern so the operator can see which rules are firing.
  const byPattern = new Map<string, number>()
  for (const f of flagged) byPattern.set(f.pattern, (byPattern.get(f.pattern) || 0) + 1)
  const sorted = Array.from(byPattern.entries()).sort((a, b) => b[1] - a[1])
  console.log('By pattern:')
  for (const [p, n] of sorted) console.log('  ' + n + '\t' + p)
  console.log()

  console.log('Sample (first 30):')
  for (const f of flagged.slice(0, 30)) {
    console.log('  ' + f.id.substring(0, 8) + ' | ' + f.title.substring(0, 70))
    console.log('       hook: ' + f.feed_hook.substring(0, 140))
    console.log('       matched: ' + f.pattern)
  }
  console.log()

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --apply to archive ' + flagged.length + ' self-confessing reports.')
    return
  }
  if (flagged.length === 0) { console.log('Nothing to archive.'); return }

  const BATCH = 100
  let archived = 0
  let errors = 0
  for (let i = 0; i < flagged.length; i += BATCH) {
    const batch = flagged.slice(i, i + BATCH)
    const ids = batch.map(r => r.id)
    const { error } = await s.from('reports').update({
      status: 'archived',
      moderation_notes: 'V11.17.39 — feed_hook self-confession audit (search-request / speculation / commentary)',
    }).in('id', ids)
    if (error) { errors += batch.length; continue }
    archived += batch.length
    console.log('  batch ' + Math.floor(i / BATCH + 1) + ': ' + batch.length + ' archived')
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Archived: ' + archived)
  console.log('Errors:   ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

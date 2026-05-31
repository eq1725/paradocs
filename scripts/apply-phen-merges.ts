#!/usr/bin/env tsx
/**
 * V11.17.57.2 — Apply approved phenomenon merges + renames.
 *
 * Reads docs/PHEN_DEDUP_APPROVED.json (produced by the audit script +
 * _clean-dedup-review.mjs cleanup) and performs:
 *
 *   For each duplicate cluster:
 *     - Resolve canonical phen id from canonical_slug
 *     - For each non-canonical member:
 *       a. Copy any report_phenomena rows pointing at the member to
 *          point at the canonical (INSERT ... ON CONFLICT DO NOTHING).
 *       b. Delete the member's report_phenomena rows.
 *       c. Mark the member phen as status='merged' with
 *          merged_into_id=canonical_id (preserves slug for URL
 *          stability + supports future redirects).
 *     - Update canonical phen's name to canonical_name if it changed.
 *
 *   For each rename (rename_only):
 *     - Update phenomena.name to proposed_name on the slug.
 *
 * Slugs are NOT changed. Old URLs like /phenomena/abduction-phenomenon
 * stay alive (just resolve to the merged-into shell row) until a
 * follow-up adds 301 redirects from merged slugs → canonical slugs.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/apply-phen-merges.ts --dry-run    # preview
 *   npx tsx scripts/apply-phen-merges.ts --apply      # commit
 *
 *   # Limit by category for safer initial runs
 *   npx tsx scripts/apply-phen-merges.ts --apply --category cryptids
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INPUT = 'docs/PHEN_DEDUP_APPROVED.json'

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    category: flag('--category', ''),
  }
}

interface Cluster {
  canonical_slug: string
  canonical_name: string
  member_slugs: string[]
  rationale?: string
}
interface Rename {
  slug: string
  current_name: string
  proposed_name: string
  rationale?: string
}
interface CategoryAudit {
  category: string
  clusters: Cluster[]
  rename_only: Rename[]
}

interface Stats {
  clusters_processed: number
  merges_applied: number
  reports_repointed: number
  rows_deleted: number
  canonical_renames: number
  rename_only_applied: number
  missing_slugs: number
  errors: number
}

async function applyCluster(sb: any, cluster: Cluster, dryRun: boolean, stats: Stats) {
  // Resolve canonical id.
  const canRes = await sb.from('phenomena').select('id, name').eq('slug', cluster.canonical_slug).maybeSingle()
  if (!canRes.data) {
    console.warn('    ! canonical slug not found: ' + cluster.canonical_slug)
    stats.missing_slugs++
    return
  }
  const canonicalId = canRes.data.id
  const canonicalCurrentName = canRes.data.name

  const memberSlugs = cluster.member_slugs.filter(s => s !== cluster.canonical_slug)
  if (memberSlugs.length === 0) return

  // Resolve member ids.
  const memberRes = await sb.from('phenomena').select('id, slug').in('slug', memberSlugs)
  const members: Array<{ id: string; slug: string }> = memberRes.data || []
  const missing = memberSlugs.filter(s => !members.find(m => m.slug === s))
  if (missing.length > 0) {
    console.warn('    ! missing member slugs: ' + missing.join(', '))
    stats.missing_slugs += missing.length
  }
  if (members.length === 0) return

  for (const member of members) {
    // a. Copy any tags that don't already exist on canonical.
    const memberLinks = await sb.from('report_phenomena').select('id, report_id, confidence, tagged_by').eq('phenomenon_id', member.id)
    const memberRows = (memberLinks.data || []) as any[]
    let repointed = 0
    let deleted = 0
    for (const row of memberRows) {
      if (dryRun) { repointed++; continue }
      // Try to insert (canonical, report_id); on conflict, just delete the member row.
      const ins = await sb.from('report_phenomena').upsert({
        report_id: row.report_id,
        phenomenon_id: canonicalId,
        confidence: row.confidence,
        tagged_by: row.tagged_by,
      }, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true })
      if (ins.error) {
        console.warn('      ! repoint upsert error on report ' + row.report_id.substring(0, 8) + ': ' + ins.error.message)
        stats.errors++
        continue
      }
      repointed++
    }
    // b. Delete member's report_phenomena rows in bulk (idempotent;
    //    leftover rows after upsert are dupes since canonical now has them).
    if (!dryRun && memberRows.length > 0) {
      const del = await sb.from('report_phenomena').delete().eq('phenomenon_id', member.id)
      if (del.error) {
        console.warn('      ! delete error for ' + member.slug + ': ' + del.error.message)
        stats.errors++
      } else {
        deleted = memberRows.length
      }
    } else {
      deleted = memberRows.length
    }
    // c. Mark member as merged.
    if (!dryRun) {
      const upd = await sb.from('phenomena').update({
        status: 'merged',
        merged_into_id: canonicalId,
        updated_at: new Date().toISOString(),
      }).eq('id', member.id)
      if (upd.error) {
        console.warn('      ! status update error for ' + member.slug + ': ' + upd.error.message)
        stats.errors++
      }
    }

    stats.reports_repointed += repointed
    stats.rows_deleted += deleted
    stats.merges_applied++
    console.log('    ✓ merged ' + member.slug + ' → ' + cluster.canonical_slug + ' (' + repointed + ' rows repointed, ' + deleted + ' deleted)' + (dryRun ? ' [dry]' : ''))
  }

  // Rename canonical if needed.
  if (cluster.canonical_name && cluster.canonical_name !== canonicalCurrentName) {
    if (!dryRun) {
      const upd = await sb.from('phenomena').update({
        name: cluster.canonical_name,
        updated_at: new Date().toISOString(),
      }).eq('id', canonicalId)
      if (upd.error) {
        console.warn('    ! canonical rename error: ' + upd.error.message)
        stats.errors++
      }
    }
    stats.canonical_renames++
    console.log('    ⟲ canonical renamed: "' + canonicalCurrentName + '" → "' + cluster.canonical_name + '"' + (dryRun ? ' [dry]' : ''))
  }

  stats.clusters_processed++
}

async function applyRename(sb: any, rename: Rename, dryRun: boolean, stats: Stats) {
  const res = await sb.from('phenomena').select('id, name').eq('slug', rename.slug).maybeSingle()
  if (!res.data) {
    console.warn('    ! rename slug not found: ' + rename.slug)
    stats.missing_slugs++
    return
  }
  if (res.data.name === rename.proposed_name) {
    // No-op (already applied).
    return
  }
  if (!dryRun) {
    const upd = await sb.from('phenomena').update({
      name: rename.proposed_name,
      updated_at: new Date().toISOString(),
    }).eq('id', res.data.id)
    if (upd.error) {
      console.warn('    ! rename error for ' + rename.slug + ': ' + upd.error.message)
      stats.errors++
      return
    }
  }
  stats.rename_only_applied++
  console.log('    ⟲ ' + rename.slug + ': "' + res.data.name + '" → "' + rename.proposed_name + '"' + (dryRun ? ' [dry]' : ''))
}

async function main() {
  const args = parseArgs()
  console.log('Phenomenon merge applier — V11.17.57.2')
  console.log('Mode: ' + (args.apply ? 'APPLY (will write to DB)' : 'DRY-RUN (preview only)'))

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const data = JSON.parse(readFileSync(INPUT, 'utf8'))

  const stats: Stats = {
    clusters_processed: 0,
    merges_applied: 0,
    reports_repointed: 0,
    rows_deleted: 0,
    canonical_renames: 0,
    rename_only_applied: 0,
    missing_slugs: 0,
    errors: 0,
  }

  const startedMs = Date.now()
  for (const cat of data.categories) {
    if (args.category && cat.category !== args.category) continue
    if ((cat.clusters?.length || 0) === 0 && (cat.rename_only?.length || 0) === 0) continue
    console.log('═══ ' + cat.category + ' ═══')
    for (const cluster of (cat.clusters || [])) {
      console.log('  ' + cluster.canonical_slug + ' ← [' + cluster.member_slugs.filter((s: string) => s !== cluster.canonical_slug).join(', ') + ']')
      await applyCluster(sb, cluster, args.dryRun, stats)
    }
    for (const rename of (cat.rename_only || [])) {
      await applyRename(sb, rename, args.dryRun, stats)
    }
    console.log()
  }

  const elapsed = ((Date.now() - startedMs) / 1000).toFixed(1)
  console.log('═══════════ DONE ═══════════')
  console.log('Mode:                ' + (args.apply ? 'APPLY' : 'DRY-RUN'))
  console.log('Clusters processed:  ' + stats.clusters_processed)
  console.log('Members merged:      ' + stats.merges_applied)
  console.log('Reports repointed:   ' + stats.reports_repointed)
  console.log('Rows deleted:        ' + stats.rows_deleted)
  console.log('Canonical renames:   ' + stats.canonical_renames)
  console.log('Rename-only applied: ' + stats.rename_only_applied)
  console.log('Missing slugs:       ' + stats.missing_slugs)
  console.log('Errors:              ' + stats.errors)
  console.log('Time:                ' + elapsed + 's')
  if (args.dryRun) {
    console.log()
    console.log('Re-run with --apply to commit changes.')
  } else {
    console.log()
    console.log('Next: refresh phenomena.report_count via the existing cron')
    console.log('      (POST /api/cron/reconcile-phenomena-counts) or')
    console.log('      `tsx scripts/recompute-phenomena-report-counts.ts`.')
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

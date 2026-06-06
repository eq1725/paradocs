/**
 * Archive gate slips — V11.17.100 / V11.17.101
 *
 * Sweeps approved reports whose anomalous_content_check.anomalous='no'
 * (the Haiku gate confidently said NOT anomalous) and yet status is
 * still 'approved'. These are gate slips: either the V11.17.41 0.9
 * threshold was too strict at ingestion time, or the row was manually
 * re-approved after a pending_review pass without revisiting the gate.
 *
 * V11.17.100 baseline: dry-run sweep of approved rows. Reports count +
 * genre + confidence distribution. Reads paradocs_assessment JSONB.
 *
 * V11.17.101 ADDITIONS (this revision):
 *   --apply              Actually flip status='approved' → 'archived'
 *                        (was dry-run-only in V11.17.100). Adds the
 *                        moderation_notes audit string. Requires --yes
 *                        to skip the typed confirmation prompt.
 *   --yes                Skip the interactive confirm. Pair with --apply
 *                        in non-TTY contexts (cron, scripted runs).
 *   --pending            Switch target from status='approved' to
 *                        status='pending_review'. Same anomalous='no'
 *                        gate-result filter, but pulls undecided rows
 *                        rather than already-greenlit ones.
 *   --min-conf <float>   Floor on anomalous_content_check.confidence.
 *                        Default 0.75 (matches V11.17.100 approved
 *                        sweep). For --pending sweeps the operator
 *                        usually wants 0.85 or 0.9 — be deliberate.
 *   --limit <int>        Sample-print size in dry-run (default 20).
 *
 * Operator workflow (V11.17.101):
 *   1. Trinidad single-row apply — surgical archive of the one approved
 *      gate slip surfaced by the V11.17.100 dry-run. Uses --apply on the
 *      default (approved) target with the existing 0.75 floor. Idempotent.
 *   2. Pending sweep dry-run at min-conf 0.85 — survey how many
 *      pending_review rows the new threshold would auto-archive. Look at
 *      the confidence-bucket distribution + 10-title sample before
 *      committing.
 *   3. Pending sweep apply at min-conf 0.85 — flip the surveyed rows to
 *      archived. This bypasses normal moderator review for high-conf
 *      benign-gate hits, reclaiming the queue from the V11.17.41-era
 *      strict-floor backlog.
 *
 * Bulk-update path uses .range() pagination — PostgREST caps SELECT at
 * 5000 rows, so we page in 1000-row chunks to stay well under and to
 * keep memory bounded if the pending corpus is large.
 *
 * Idempotent: re-running on the same corpus is a no-op once applied
 * (the .eq("status", "approved" | "pending_review") filter excludes
 * already-archived rows).
 *
 * Usage:
 *   # V11.17.100 (still works):
 *   npx tsx scripts/archive-gate-slips.ts                              # dry-run on approved
 *   npx tsx scripts/archive-gate-slips.ts --limit 50                   # show first 50
 *
 *   # V11.17.101 — approved apply (Trinidad row):
 *   npx tsx scripts/archive-gate-slips.ts --apply --yes
 *
 *   # V11.17.101 — pending sweep:
 *   npx tsx scripts/archive-gate-slips.ts --pending --min-conf 0.85
 *   npx tsx scripts/archive-gate-slips.ts --pending --min-conf 0.85 --apply --yes
 *
 * Companion script: scripts/audit-youtube-anomaly-content.ts (older,
 * keyword-heuristic-based; this one is JSONB-gate-result driven).
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as readline from 'readline'
dotenv.config({ path: '.env.local' })

type ReportRow = {
  id: string
  slug: string | null
  title: string | null
  paradocs_assessment: any
  source_type: string | null
  source_label: string | null
  status?: string | null
}

function parseArgs() {
  const apply = process.argv.includes('--apply')
  const yes = process.argv.includes('--yes')
  const pending = process.argv.includes('--pending')
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 20 : 20
  const minConfIdx = process.argv.indexOf('--min-conf')
  const minConf =
    minConfIdx >= 0 ? parseFloat(process.argv[minConfIdx + 1]) || 0.75 : 0.75
  return { apply, yes, pending, limit, minConf }
}

function getAc(r: ReportRow) {
  return r.paradocs_assessment?.anomalous_content_check
}

function getConf(r: ReportRow): number {
  const ac = getAc(r)
  return typeof ac?.confidence === 'number' ? ac.confidence : 0
}

async function fetchAllPaged(
  sb: any,
  status: 'approved' | 'pending_review',
  minConf: number,
): Promise<ReportRow[]> {
  // PostgREST caps SELECT at 5000 by default — page in 1000-row chunks.
  const pageSize = 1000
  const out: ReportRow[] = []
  let from = 0
  // We can't filter (->>confidence)::numeric server-side via PostgREST
  // operator chain reliably, so we filter anomalous='no' server-side and
  // confidence client-side. Approved corpus + pending corpus are both
  // bounded by the anomalous='no' filter — small enough to page.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb
      .from('reports')
      .select(
        'id, slug, title, paradocs_assessment, source_type, source_label, status',
      )
      .eq('status', status)
      .filter(
        'paradocs_assessment->anomalous_content_check->>anomalous',
        'eq',
        'no',
      )
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error('Query failed at offset ' + from + ': ' + error.message)
    }
    const batch = (data || []) as unknown as ReportRow[]
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  // Client-side confidence floor.
  return out.filter((r) => getConf(r) >= minConf)
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close()
      resolve(ans)
    })
  })
}

function buildNote(r: ReportRow, sourceStatus: 'approved' | 'pending_review') {
  const ac = getAc(r) || {}
  const tag =
    sourceStatus === 'approved'
      ? 'V11.17.100 gate-slip sweep'
      : 'V11.17.101 pending gate-sweep'
  return (
    tag +
    ' — anomalous=' +
    (ac.anomalous || '?') +
    ' conf=' +
    (ac.confidence ?? '?') +
    ' genre=' +
    (ac.genre || 'unspecified')
  )
}

async function applyArchive(
  sb: any,
  rows: ReportRow[],
  sourceStatus: 'approved' | 'pending_review',
): Promise<{ ok: number; fail: number }> {
  let ok = 0
  let fail = 0
  for (const r of rows) {
    const note = buildNote(r, sourceStatus)
    console.log(
      '  -> ' +
        r.id +
        ' [conf=' +
        (getAc(r)?.confidence ?? '?') +
        '] ' +
        (r.slug || '?') +
        ' :: ' +
        (r.title || '?'),
    )
    const { error: updErr } = await (sb.from('reports') as any)
      .update({
        status: 'archived',
        moderation_notes: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id)
      .eq('status', sourceStatus)
    if (updErr) {
      console.warn('  ! ' + r.id + ' update failed: ' + updErr.message)
      fail++
    } else {
      ok++
    }
  }
  return { ok, fail }
}

function bucketize(rows: ReportRow[]) {
  const buckets = {
    '0.75-0.84': 0,
    '0.85-0.89': 0,
    '0.90-0.94': 0,
    '0.95+': 0,
  }
  for (const r of rows) {
    const c = getConf(r)
    if (c >= 0.95) buckets['0.95+']++
    else if (c >= 0.9) buckets['0.90-0.94']++
    else if (c >= 0.85) buckets['0.85-0.89']++
    else if (c >= 0.75) buckets['0.75-0.84']++
  }
  return buckets
}

async function main() {
  const { apply, yes, pending, limit, minConf } = parseArgs()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const sourceStatus: 'approved' | 'pending_review' = pending
    ? 'pending_review'
    : 'approved'

  console.log('Archive gate slips — V11.17.101')
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN')
  console.log('Target status:', sourceStatus)
  console.log('Min confidence:', minConf)
  console.log('---')

  const rows = await fetchAllPaged(sb, sourceStatus, minConf)
  console.log(
    'Total slip candidates (status=' +
      sourceStatus +
      ' AND anomalous=no AND conf>=' +
      minConf +
      '): ' +
      rows.length,
  )
  if (rows.length === 0) {
    console.log('No slips. Nothing to do.')
    return
  }

  // Confidence + genre distribution
  const genres: Record<string, number> = {}
  const confs: number[] = []
  for (const r of rows) {
    const ac = getAc(r)
    if (!ac) continue
    genres[ac.genre || '?'] = (genres[ac.genre || '?'] || 0) + 1
    if (typeof ac.confidence === 'number') confs.push(ac.confidence)
  }
  confs.sort((a, b) => a - b)
  const median = confs.length ? confs[Math.floor(confs.length / 2)] : 0
  console.log('Genre distribution:', genres)
  console.log('Confidence buckets:', bucketize(rows))
  console.log(
    'Confidence: min=' +
      (confs[0] || 0).toFixed(2) +
      ' median=' +
      median.toFixed(2) +
      ' max=' +
      (confs[confs.length - 1] || 0).toFixed(2),
  )
  console.log('---')

  // Sort by confidence desc and print first N (sample 10 for --pending dry-run)
  rows.sort((a, b) => getConf(b) - getConf(a))
  const sampleSize = pending && !apply ? Math.min(10, rows.length) : Math.min(limit, rows.length)

  console.log(
    'First ' + sampleSize + ' candidates (sorted by confidence desc):',
  )
  for (const r of rows.slice(0, sampleSize)) {
    const ac = getAc(r)
    const src = r.source_type || '?'
    console.log(
      '  [conf=' +
        (ac?.confidence ?? '?') +
        ' genre=' +
        (ac?.genre || '?') +
        ' src=' +
        src +
        '] ' +
        (r.title || '?') +
        ' (' +
        r.id +
        ')',
    )
  }
  console.log('---')

  if (!apply) {
    console.log(
      'DRY-RUN: would flip ' +
        rows.length +
        ' rows (status=' +
        sourceStatus +
        ' -> archived) with moderation_notes audit.',
    )
    console.log('Re-run with --apply (+ --yes to skip prompt) to commit.')
    return
  }

  // Confirm row count before applying.
  if (!yes) {
    const ans = await prompt(
      'About to archive ' +
        rows.length +
        ' rows (status=' +
        sourceStatus +
        ' -> archived). Type "yes" to proceed: ',
    )
    if (ans.trim().toLowerCase() !== 'yes') {
      console.log('Aborted by operator.')
      return
    }
  } else {
    console.log(
      '--yes given: skipping interactive confirm for ' +
        rows.length +
        ' rows.',
    )
  }

  console.log('Applying archive to ' + rows.length + ' rows...')
  const { ok, fail } = await applyArchive(sb, rows, sourceStatus)
  console.log('Done. Archived=' + ok + ' Failed=' + fail)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

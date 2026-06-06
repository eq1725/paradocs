#!/usr/bin/env tsx
/**
 * V11.17.41 — Backfill AI analysis for user submissions stuck without it.
 *
 * Surface: the operator's alpha tester landed on a /report/<slug> page
 * for "Bragg Light" that showed "Paradocs is analyzing this account…"
 * placeholder indefinitely. The /api/onboarding/submit handler used
 * to insert with status='approved' and never trigger AI generation
 * (the batch ingestion engine.ts AI path doesn't run on
 * source_type='user_submission' rows). V11.17.41 patched the handler
 * to run AI synchronously, but the historical pile needs this
 * backfill.
 *
 * Selection:
 *   source_type='user_submission'
 *   AND status='approved'
 *   AND paradocs_narrative IS NULL  (the load-bearing AI field)
 *
 * For each match: run the same AI service the patched handler uses
 * (consolidated when USE_CONSOLIDATED_AI is on, multi-call otherwise)
 * + the same demotion gate. Reports get one of:
 *   - filled       — AI populated all fields, stays 'approved'
 *   - pending      — narrative/pull_quote empty OR anomaly 0.7-0.89
 *   - auto_archive — anomaly >=0.9
 *   - error        — exception during generation
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-user-submission-ai.ts --dry-run
 *   npx tsx scripts/backfill-user-submission-ai.ts --apply
 *   npx tsx scripts/backfill-user-submission-ai.ts --apply --limit 10
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { generateAndSaveConsolidatedAI, isConsolidatedAIEnabled } from '@/lib/services/consolidated-ai.service'
import { generateAndSaveParadocsAnalysis } from '@/lib/services/paradocs-analysis.service'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

interface Args {
  dryRun: boolean
  apply: boolean
  limit: number | null
}

function parseArgs(): Args {
  var a = process.argv.slice(2)
  var flag = function (n: string, def: string | null = null) { var i = a.indexOf(n); return i < 0 ? def : a[i + 1] }
  var bool = function (n: string) { return a.indexOf(n) >= 0 }
  return {
    dryRun: bool('--dry-run') || !bool('--apply'),
    apply: bool('--apply'),
    limit: flag('--limit') ? parseInt(flag('--limit')!) : null,
  }
}

interface StuckReport {
  id: string
  slug: string
  title: string
  created_at: string
}

async function findStuck(sb: SupabaseClient, limit: number | null): Promise<StuckReport[]> {
  let q = sb
    .from('reports')
    .select('id, slug, title, created_at')
    .eq('source_type', 'user_submission')
    .eq('status', 'approved')
    .is('paradocs_narrative', null)
    .order('created_at', { ascending: true })
  if (limit) q = q.limit(limit)
  const { data, error } = await q
  if (error) throw new Error('findStuck: ' + error.message)
  return (data || []) as StuckReport[]
}

interface Outcome {
  filled: number
  pending: number
  auto_archive: number
  error: number
}

async function runOne(sb: SupabaseClient, r: StuckReport): Promise<keyof Outcome> {
  // Generate AI
  var aiOk = false
  try {
    var useConsolidated = isConsolidatedAIEnabled()
    if (useConsolidated) {
      var res = await generateAndSaveConsolidatedAI(r.id)
      aiOk = !!res.success
      if (!aiOk) {
        try { aiOk = !!(await generateAndSaveParadocsAnalysis(r.id)) } catch (_e) { aiOk = false }
      }
    } else {
      aiOk = !!(await generateAndSaveParadocsAnalysis(r.id))
    }
  } catch (e: any) {
    console.error('  AI threw for ' + r.id + ': ' + (e?.message || e))
    return 'error'
  }

  // Demotion check (mirror submit.ts + engine.ts)
  const { data: post } = await sb
    .from('reports')
    .select('paradocs_narrative, paradocs_assessment')
    .eq('id', r.id)
    .single()
  const assess: any = post ? (post as any).paradocs_assessment : null
  const hasNarrative = !!(post && (post as any).paradocs_narrative && (post as any).paradocs_narrative.trim().length > 0)
  const pullQuote = assess && typeof assess === 'object' ? assess.pull_quote : null
  const hasPullQuote = !!(pullQuote && typeof pullQuote === 'string' && pullQuote.trim().length > 0)
  const ac = assess && typeof assess === 'object' ? assess.anomalous_content_check : null
  let acAnomalous: string | null = null, acConfidence = 0, acGenre = ''
  if (ac && typeof ac === 'object') {
    acAnomalous = typeof ac.anomalous === 'string' ? ac.anomalous : null
    acConfidence = typeof ac.confidence === 'number' ? ac.confidence : 0
    acGenre = typeof ac.genre === 'string' ? ac.genre : ''
  }
  // V11.17.100 — auto-archive cutoff lowered 0.9 → 0.75 to match sharper
  // V11.17.100 ANOMALY GATE prompt calibration (Sedona-boom-style at ~0.85).
  const autoArchive = acAnomalous === 'no' && acConfidence >= 0.75
  const pending = acAnomalous === 'no' && acConfidence >= 0.7 && acConfidence < 0.75
  let target: 'pending_review' | 'archived' | null = null
  let reason = ''
  if (!aiOk) { target = 'pending_review'; reason = 'AI generation failed' }
  else if (!hasNarrative) { target = 'pending_review'; reason = 'narrative empty' }
  else if (!hasPullQuote) { target = 'pending_review'; reason = 'pull_quote empty' }
  else if (autoArchive) { target = 'archived'; reason = 'anomaly auto-archive genre=' + acGenre + ' conf=' + acConfidence.toFixed(2) }
  else if (pending) { target = 'pending_review'; reason = 'anomaly pending genre=' + acGenre + ' conf=' + acConfidence.toFixed(2) }

  if (target) {
    await sb.from('reports').update({ status: target, updated_at: new Date().toISOString() }).eq('id', r.id)
    console.log('  ' + r.id.slice(0, 8) + ' → ' + target + ' (' + reason + ')')
    return target === 'archived' ? 'auto_archive' : 'pending'
  }
  console.log('  ' + r.id.slice(0, 8) + ' → filled ✓ "' + r.title.slice(0, 60) + '"')
  return 'filled'
}

async function main() {
  const args = parseArgs()
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  console.log('User-submission AI backfill — V11.17.41')
  console.log('Mode: ' + (args.apply ? 'APPLY' : 'DRY-RUN'))

  const stuck = await findStuck(sb, args.limit)
  console.log('Found ' + stuck.length + ' user submissions stuck without AI analysis.')

  if (stuck.length === 0) { console.log('Nothing to do.'); return }

  if (args.dryRun) {
    console.log('\nDry-run — first 20:')
    for (const r of stuck.slice(0, 20)) {
      console.log('  ' + r.id.slice(0, 8) + '  ' + (r.title || '(untitled)').slice(0, 70))
    }
    console.log('\nRe-run with --apply to fill in AI analysis on all ' + stuck.length + '.')
    console.log('Estimated cost: ~$' + (stuck.length * 0.005).toFixed(2) + ' (consolidated) or ~$' + (stuck.length * 0.012).toFixed(2) + ' (multi-call).')
    return
  }

  const out: Outcome = { filled: 0, pending: 0, auto_archive: 0, error: 0 }
  for (let i = 0; i < stuck.length; i++) {
    console.log('\n[' + (i + 1) + '/' + stuck.length + '] ' + stuck[i].id.slice(0, 8) + ' "' + (stuck[i].title || '').slice(0, 50) + '"')
    try {
      const r = await runOne(sb, stuck[i])
      out[r]++
    } catch (e: any) {
      console.error('  uncaught error: ' + (e?.message || e))
      out.error++
    }
  }

  console.log('\n=== Backfill summary ===')
  console.log('  filled (publishable):    ' + out.filled)
  console.log('  demoted to pending:      ' + out.pending)
  console.log('  auto-archived (>=0.9):   ' + out.auto_archive)
  console.log('  errors:                  ' + out.error)
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })

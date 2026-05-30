#!/usr/bin/env tsx
/**
 * V11.17.54 — Audit ALL phenomenon tags across every active phen.
 *
 * Generalized version of scripts/audit-folkloric-tags.ts. Instead of
 * a hardcoded list of culturally-specific entities, this script
 * iterates every active phenomenon with at least one tagged report,
 * pulls all its report_phenomena rows, and runs the centralized
 * tag-verification service to verify each tag.
 *
 * 'no' verdicts → DELETE the report_phenomena row (the bad tag goes
 * away; the report stays intact with its other tags + category).
 * 'yes' and 'uncertain' verdicts → kept (conservative; prefer false
 * positives over false negatives).
 *
 * Estimated scope at session time:
 *   - ~661 active phens
 *   - ~tens of thousands of report_phenomena rows
 *   - ~$15-25 in Haiku costs at $0.0005/call
 *   - ~2-3 hours at --concurrency 12
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   # Dry-run the full sweep (no writes)
 *   npx tsx scripts/audit-all-phen-tags.ts --dry-run
 *
 *   # Apply for real
 *   npx tsx scripts/audit-all-phen-tags.ts --apply --concurrency 12
 *
 *   # One slug only (handy for spot-checks)
 *   npx tsx scripts/audit-all-phen-tags.ts --slug mothman --dry-run
 *
 *   # Cap per-phen tag count (cost control on initial runs)
 *   npx tsx scripts/audit-all-phen-tags.ts --apply --per-phen-limit 100
 *
 *   # Skip phens with fewer than N tagged reports (focus on volume)
 *   npx tsx scripts/audit-all-phen-tags.ts --apply --min-tags 5
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { verifyTag, PhenContext, ReportContext } from '../src/lib/services/tag-verification.service'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    slug: flag('--slug', ''),
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    perPhenLimit: parseInt(flag('--per-phen-limit', '0')),
    minTags: parseInt(flag('--min-tags', '1')),
    concurrency: Math.max(1, parseInt(flag('--concurrency', '12'))),
  }
}

interface PhenRow {
  id: string
  name: string
  slug: string
  category: string | null
  ai_summary: string | null
  report_count: number
}

interface AuditStats {
  total: number
  match_yes: number
  match_no: number
  match_uncertain: number
  haiku_failed: number
  untagged: number
}

async function auditPhen(
  supabase: any,
  anth: Anthropic,
  phen: PhenRow,
  args: ReturnType<typeof parseArgs>,
  globalNextIndex: { value: number },
): Promise<AuditStats> {
  const stats: AuditStats = { total: 0, match_yes: 0, match_no: 0, match_uncertain: 0, haiku_failed: 0, untagged: 0 }

  let q = supabase
    .from('report_phenomena')
    .select('id, report:reports(id, title, summary, description, city, state_province, country, status)')
    .eq('phenomenon_id', phen.id)
  if (args.perPhenLimit > 0) q = q.limit(args.perPhenLimit)
  const linksRes = await q
  if (linksRes.error) {
    console.warn('  ! fetch error:', linksRes.error.message)
    return stats
  }
  const links: any[] = linksRes.data || []
  stats.total = links.length

  if (links.length === 0) return stats

  const phenContext: PhenContext = {
    name: phen.name,
    slug: phen.slug,
    category: phen.category,
    ai_summary: phen.ai_summary,
  }

  // Bounded-concurrency worker pool over THIS phen's links.
  let nextIndex = 0
  async function processOne(link: any) {
    const report = link.report
    if (!report || report.status !== 'approved') return
    const reportContext: ReportContext = {
      title: report.title,
      summary: report.summary,
      description: report.description,
      city: report.city,
      state_province: report.state_province,
      country: report.country,
    }
    const v = await verifyTag(phenContext, reportContext, anth)
    if (v.match === 'yes') { stats.match_yes++; return }
    if (v.match === 'uncertain') {
      stats.match_uncertain++
      // Treat 'no API key' / 'haiku error' as failure, not uncertain.
      if (v.reasoning.indexOf('haiku error') >= 0 || v.reasoning.indexOf('unparseable') >= 0 || v.reasoning.indexOf('no API key') >= 0) {
        stats.match_uncertain--
        stats.haiku_failed++
      }
      return
    }
    // match === 'no' — candidate for untag
    stats.match_no++
    const titleStr = (report.title || '').slice(0, 60)
    console.log('    ✗ ' + report.id.substring(0, 8) + ' ' + titleStr.padEnd(62) + ' → ' + v.reasoning.slice(0, 80))
    if (args.apply) {
      const del = await supabase.from('report_phenomena').delete().eq('id', link.id)
      if (del.error) {
        console.warn('      ! untag failed: ' + del.error.message)
      } else {
        stats.untagged++
      }
    }
  }

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= links.length) return
      try { await processOne(links[i]) } catch (e: any) { console.warn('  ! err:', e?.message || e) }
    }
  }

  const workers = Array.from({ length: args.concurrency }, () => worker())
  await Promise.all(workers)
  return stats
}

async function main() {
  const args = parseArgs()
  console.log('All-phen tag audit — V11.17.54')
  console.log('args:', JSON.stringify(args))
  console.log('Mode:', args.apply ? 'APPLY (will delete report_phenomena rows)' : 'DRY-RUN (preview only)')
  console.log()

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Pull the phen list. Single-slug mode bypasses min_tags filter.
  let phenQuery = supabase
    .from('phenomena')
    .select('id, name, slug, category, ai_summary, report_count')
    .eq('status', 'active')
    .order('report_count', { ascending: false })
  if (args.slug) phenQuery = phenQuery.eq('slug', args.slug)
  else if (args.minTags > 1) phenQuery = phenQuery.gte('report_count', args.minTags)
  const phenRes = await phenQuery
  if (phenRes.error) { console.error('phen fetch failed:', phenRes.error.message); process.exit(1) }
  const phens = (phenRes.data || []) as PhenRow[]
  if (phens.length === 0) { console.log('No phens to audit.'); return }

  console.log('Phens to audit: ' + phens.length)
  const totalTags = phens.reduce((s, p) => s + (p.report_count || 0), 0)
  console.log('Total tagged reports (approx, from phenomena.report_count): ' + totalTags)
  console.log()

  const totals: AuditStats = { total: 0, match_yes: 0, match_no: 0, match_uncertain: 0, haiku_failed: 0, untagged: 0 }
  const startedMs = Date.now()
  const globalIdx = { value: 0 }

  for (let pi = 0; pi < phens.length; pi++) {
    const phen = phens[pi]
    const prefix = '[' + (pi + 1) + '/' + phens.length + '] ' + phen.slug.padEnd(40)
    process.stdout.write(prefix)
    const s = await auditPhen(supabase, anth, phen, args, globalIdx)
    const summary = ' total=' + s.total + ' yes=' + s.match_yes + ' no=' + s.match_no + ' unc=' + s.match_uncertain + ' untagged=' + s.untagged + (args.dryRun ? ' (dry)' : '')
    console.log(summary)
    totals.total += s.total
    totals.match_yes += s.match_yes
    totals.match_no += s.match_no
    totals.match_uncertain += s.match_uncertain
    totals.haiku_failed += s.haiku_failed
    totals.untagged += s.untagged

    // Lightweight overall progress every 25 phens.
    if ((pi + 1) % 25 === 0) {
      const el = (Date.now() - startedMs) / 1000
      const rate = (pi + 1) / el
      const eta = (phens.length - (pi + 1)) / rate
      console.log('--- progress: ' + (pi + 1) + '/' + phens.length + ' phens | rate ' + rate.toFixed(2) + ' phens/s | ETA ' + Math.round(eta / 60) + 'm ---')
    }
  }

  const elapsed = ((Date.now() - startedMs) / 1000 / 60).toFixed(1)
  console.log()
  console.log('═══════════ ALL DONE ═══════════')
  console.log('Phens audited:    ' + phens.length)
  console.log('Total tags:       ' + totals.total)
  console.log('Match yes (kept): ' + totals.match_yes)
  console.log('Match no (bad):   ' + totals.match_no)
  console.log('Uncertain (kept): ' + totals.match_uncertain)
  console.log('Haiku failed:     ' + totals.haiku_failed)
  console.log('Untagged:         ' + totals.untagged + (args.dryRun ? ' (DRY-RUN — no changes)' : ''))
  console.log('Time:             ' + elapsed + ' min')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

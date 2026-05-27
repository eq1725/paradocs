#!/usr/bin/env tsx
/**
 * Spot-check encyclopedia surfacing — V11.17.39 (#77).
 *
 * For each phenomenon of interest, samples a few linked reports and
 * verifies they're in a state that should render on /phenomena/<slug>:
 *   - phenomena.status='active'
 *   - report.status='approved'
 *   - report_phenomena junction exists
 *
 * Outputs URLs you can hand-check in browser. Doesn't make HTTP
 * calls to paradocs.app (sandbox can't reach it); the verification
 * is DB-side and the URL list is your manual checklist.
 *
 * Categories covered:
 *   - V11.17.39 classifier sweep wins (synchronicity, manifestation-
 *     experience, vanishing-object, NDE, STE, OBE, deja-vu, time-slip)
 *   - V11.17.x ADCRF mass-ingest reports (5 random samples)
 *   - V11.17.x OBERF reports
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/verify-encyclopedia-surfacing.ts
 *   npx tsx scripts/verify-encyclopedia-surfacing.ts --sample 5
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_BASE = 'https://paradocs.app'

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  return { sample: parseInt(flag('--sample', '3')) }
}

interface SpotCheck {
  label: string
  detail: string
  pageUrl: string
  reportUrls: string[]
  ok: boolean
  notes: string[]
}

async function checkPhenomenon(s: any, slug: string, sampleSize: number): Promise<SpotCheck> {
  const notes: string[] = []
  const phen = await s.from('phenomena').select('id, name, status, report_count').eq('slug', slug).maybeSingle()
  if (!phen.data) {
    return {
      label: 'phenomenon ' + slug,
      detail: 'NOT FOUND in phenomena table',
      pageUrl: APP_BASE + '/phenomena/' + slug,
      reportUrls: [],
      ok: false,
      notes: ['Migration may not have applied; check Supabase dashboard'],
    }
  }
  if (phen.data.status !== 'active') {
    notes.push('phenomenon status=' + phen.data.status + ' — page will not render')
  }
  const linkRes = await s.from('report_phenomena').select('report_id').eq('phenomenon_id', phen.data.id).limit(sampleSize)
  const reportIds = (linkRes.data || []).map((x: any) => x.report_id)
  if (reportIds.length === 0) {
    return {
      label: 'phenomenon ' + slug + ' (' + phen.data.name + ')',
      detail: 'no report links',
      pageUrl: APP_BASE + '/phenomena/' + slug,
      reportUrls: [],
      ok: false,
      notes: notes.concat(['No reports linked yet — classifier sweep may not have run for this slug']),
    }
  }
  const reports = await s.from('reports').select('slug, status, title').in('id', reportIds)
  const urls: string[] = []
  for (const r of (reports.data || []) as any[]) {
    if (r.status !== 'approved') notes.push('report ' + r.slug + ' has status=' + r.status)
    if (r.slug) urls.push(APP_BASE + '/report/' + r.slug)
  }
  return {
    label: 'phenomenon ' + slug + ' (' + phen.data.name + ')',
    detail: phen.data.report_count + ' linked reports',
    pageUrl: APP_BASE + '/phenomena/' + slug,
    reportUrls: urls,
    ok: notes.length === 0,
    notes,
  }
}

async function checkSource(s: any, sourceType: string, sampleSize: number): Promise<SpotCheck> {
  const notes: string[] = []
  const reports = await s.from('reports')
    .select('id, slug, title, status, created_at')
    .eq('source_type', sourceType)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(sampleSize)
  if (!reports.data || reports.data.length === 0) {
    return {
      label: 'source ' + sourceType,
      detail: 'no approved reports',
      pageUrl: '',
      reportUrls: [],
      ok: false,
      notes: ['No approved reports from this source'],
    }
  }
  const urls: string[] = []
  let withLinks = 0
  for (const r of reports.data as any[]) {
    const links = await s.from('report_phenomena').select('phenomenon_id').eq('report_id', r.id)
    if (!links.data || links.data.length === 0) {
      notes.push('report "' + r.title.substring(0, 50) + '" has no phenomenon links')
    } else {
      withLinks++
    }
    if (r.slug) urls.push(APP_BASE + '/report/' + r.slug)
  }
  return {
    label: 'source ' + sourceType,
    detail: withLinks + '/' + reports.data.length + ' samples have phenomenon links',
    pageUrl: '',
    reportUrls: urls,
    ok: withLinks === reports.data.length,
    notes,
  }
}

async function main() {
  const args = parseArgs()
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  console.log('Encyclopedia surfacing spot-check — V11.17.39 (#77)')
  console.log('sample size:', args.sample, '\n')

  const checks: SpotCheck[] = []

  // V11.17.39 classifier sweep targets
  const phenSlugs = [
    'synchronicity',
    'manifestation-experience',
    'vanishing-object',
    'near-death-experience',
    'sudden-obe',
    'spiritually-transformative-experience',
    'deja-vu',
    'time-slip',
    'anomalous-memory',
    'tulpamancy',
  ]
  for (const slug of phenSlugs) {
    checks.push(await checkPhenomenon(s, slug, args.sample))
  }

  // V11.17.x ingest sources
  for (const src of ['adcrf', 'oberf', 'nderf', 'nuforc', 'youtube']) {
    checks.push(await checkSource(s, src, args.sample))
  }

  // Render report
  let okCount = 0, warnCount = 0
  for (const c of checks) {
    const icon = c.ok ? '✓' : '⚠'
    if (c.ok) okCount++; else warnCount++
    console.log(icon + ' ' + c.label.padEnd(60) + ' — ' + c.detail)
    if (c.pageUrl) console.log('   page:    ' + c.pageUrl)
    for (const u of c.reportUrls.slice(0, args.sample)) {
      console.log('   report:  ' + u)
    }
    for (const n of c.notes) console.log('   ! ' + n)
    console.log()
  }
  console.log('=== SUMMARY ===')
  console.log('OK:   ' + okCount + '/' + checks.length)
  console.log('Warn: ' + warnCount + '/' + checks.length)
  console.log()
  console.log('Open the listed URLs in your browser. Each `page:` URL should show the')
  console.log('linked reports as cards. Each `report:` URL should render the report page')
  console.log('with the correct phenomenon badges + working back-link to the encyclopedia.')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

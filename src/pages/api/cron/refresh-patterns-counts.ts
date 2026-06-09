/**
 * GET/POST /api/cron/refresh-patterns-counts
 *
 * V11.18.4 — Sprint 1B (Hybrid freshness, Option C nightly counts pass).
 *
 * For every PUBLISHED Finding in `findings_catalogue`, recompute the
 * per-family counts + denominators + percentages from the live corpus
 * and write them back. Does NOT touch `interpretive_sentence` (that is
 * the weekly prose pass at `refresh-patterns-prose.ts`). Stamps
 * `refreshed_at` on every row whether anything changed or not.
 *
 * Cron schedule: nightly at 03:00 UTC (vercel.json).
 *
 * Cost: zero recurring Anthropic spend. Pure SQL.
 *
 * Auth: shares the `CRON_SECRET` convention used by every other Paradocs
 * cron route — checks `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Output JSON: { ok, refreshed, errors, duration_ms }.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  executeQuery,
  humanizeFamily,
} from '@/lib/lab/hints/data-query-executor'
import type {
  HintDataQuery,
  HintToken,
  DescriptorFamily,
} from '@/lib/lab/hints/data-query-types'
import type { HintCategory } from '@/lib/lab/hints/hint-schema'

interface FamilyBreakdown {
  family_slug: string
  family_label: string
  count: number
  total_in_family: number
  pct: number
}

interface FindingRow {
  id: string
  slug: string
  descriptor: string
  phen_families: any
}

async function countWitnessStateInFamily(
  svc: any,
  family: HintCategory,
  state: string,
): Promise<{ match: number; denom: number }> {
  try {
    var totalRes = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', family)
    var denom = Number((totalRes as any).count) || 0
    if (denom === 0) return { match: 0, denom: 0 }
    var matchRes = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', family)
      .eq('witness_state_at_event', state)
    var match = Number((matchRes as any).count) || 0
    return { match: match, denom: denom }
  } catch (_e) {
    return { match: 0, denom: 0 }
  }
}

async function refreshFinding(svc: any, row: FindingRow): Promise<{
  ok: boolean
  family_breakdowns?: FamilyBreakdown[]
  denominator_n?: number
  message?: string
}> {
  try {
    var existingFamilies: HintCategory[] = []
    if (Array.isArray(row.phen_families)) {
      for (var fi = 0; fi < row.phen_families.length; fi++) {
        var slug = (row.phen_families[fi] as any)?.family_slug
        if (slug) existingFamilies.push(slug as HintCategory)
      }
    }
    if (existingFamilies.length === 0) {
      return { ok: false, message: 'no family slugs in phen_families' }
    }

    // Branch — hypnagogic_state uses the witness_state_at_event direct
    // path; everything else goes through the keyword executor.
    var breakdowns: FamilyBreakdown[] = []
    if (row.descriptor === 'hypnagogic_state' || row.descriptor === 'witness_drowsy') {
      for (var i = 0; i < existingFamilies.length; i++) {
        var fam = existingFamilies[i]
        var r = await countWitnessStateInFamily(svc, fam, 'drowsy_falling_asleep')
        var pct = r.denom > 0 ? Math.round((r.match / r.denom) * 100) : 0
        breakdowns.push({
          family_slug: fam,
          family_label: humanizeFamily(fam),
          count: r.match,
          total_in_family: r.denom,
          pct: pct,
        })
      }
    } else {
      var query: HintDataQuery = {
        kind: 'cross_family_overlap_pct',
        descriptor_family: row.descriptor as DescriptorFamily,
        families: existingFamilies as any,
        bind_to: 'cross_family_set',
        min_denominator_per_family: 1,
      }
      var ctx = {
        user_id: '00000000-0000-0000-0000-000000000000',
        primary_report: null,
        all_reports: [],
      }
      var binding = await executeQuery(query, ctx as any, svc as any)
      var labelTokens: HintToken[] = [
        'cross_family_a_label', 'cross_family_b_label', 'cross_family_c_label',
      ]
      var pctTokens: HintToken[] = [
        'cross_family_a_pct', 'cross_family_b_pct', 'cross_family_c_pct',
      ]
      for (var fi2 = 0; fi2 < existingFamilies.length; fi2++) {
        var fam2 = existingFamilies[fi2]
        var totalRes = await svc
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .eq('category', fam2)
        var totalDenom = Number((totalRes as any).count) || 0
        var pct2 = binding.bindings ? Number(binding.bindings[pctTokens[fi2]]) || 0 : 0
        var label = binding.bindings
          ? String(binding.bindings[labelTokens[fi2]] || humanizeFamily(fam2))
          : humanizeFamily(fam2)
        var matchCount = Math.round((pct2 / 100) * totalDenom)
        breakdowns.push({
          family_slug: fam2,
          family_label: label,
          count: matchCount,
          total_in_family: totalDenom,
          pct: pct2,
        })
      }
    }

    var totalAccounts = breakdowns.reduce(function (a, b) { return a + b.total_in_family }, 0)
    var n = breakdowns.length
    var countWord = n === 2 ? 'two' : n === 3 ? 'three' : n === 4 ? 'four' : String(n)
    var denominator_n_label = 'Across ' + totalAccounts.toLocaleString('en-US') +
      ' accounts in ' + countWord + ' phen families.'

    var upd = await svc
      .from('findings_catalogue' as any)
      .update({
        phen_families: breakdowns,
        denominator_n: totalAccounts,
        denominator_n_label: denominator_n_label,
        refreshed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (upd.error) return { ok: false, message: upd.error.message }
    return { ok: true, family_breakdowns: breakdowns, denominator_n: totalAccounts }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'supabase_env_missing' })
  }

  var startedMs = Date.now()
  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    var listRes = await (supabase.from('findings_catalogue' as any) as any)
      .select('id, slug, descriptor, phen_families')
      .eq('published', true)
    if (listRes.error) {
      console.error('[CronRefreshPatternsCounts] list error: ' + listRes.error.message)
      return res.status(500).json({ error: listRes.error.message })
    }
    var rows: FindingRow[] = (listRes.data as FindingRow[]) || []
    var refreshed = 0
    var errors: { slug: string; message: string }[] = []
    for (var i = 0; i < rows.length; i++) {
      var r = await refreshFinding(supabase, rows[i])
      if (r.ok) {
        refreshed++
        console.log(
          '[CronRefreshPatternsCounts] ' + rows[i].slug + ' → ' +
          (r.family_breakdowns || []).map(function (f) {
            return f.family_slug + '=' + f.pct + '%'
          }).join(', '),
        )
      } else {
        errors.push({ slug: rows[i].slug, message: r.message || 'unknown' })
        console.warn('[CronRefreshPatternsCounts] ' + rows[i].slug + ' failed: ' + r.message)
      }
    }
    var duration_ms = Date.now() - startedMs
    var out = { ok: errors.length === 0, refreshed: refreshed, errors: errors, duration_ms: duration_ms }
    console.log('[CronRefreshPatternsCounts] ' + JSON.stringify(out))
    return res.status(200).json(out)
  } catch (e: any) {
    console.error('[CronRefreshPatternsCounts] error: ' + (e?.message || e))
    return res.status(500).json({ error: 'internal_error', message: e?.message || String(e) })
  }
}

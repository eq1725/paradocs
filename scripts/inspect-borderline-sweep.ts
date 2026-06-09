#!/usr/bin/env tsx
/**
 * One-shot inspection: pull 8 known borderline reports + 4 random
 * consciousness/perception reports from the current pending_review
 * anomalous='no' (conf 0.85-0.89) sweep set, so the founder can spot
 * check before auto-archiving 2,059.
 *
 * READ ONLY. No UPDATEs.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/inspect-borderline-sweep.ts
 */

import { createClient } from '@supabase/supabase-js'

const KNOWN_IDS = [
  '2524e88f-fd57-44a2-9c3e-1c3aacdfc0b7',
  '4e5003ea-f6f0-43a7-a41e-189a44f2e26d',
  '5ecddaf9-1797-4f99-8912-c51836cfbd36',
  '5ffa06eb-1748-4981-a5a5-b83e151b91e6',
  '779cdf14-9c44-48b0-8203-d7c5cbe633d1',
  '8f6573af-8057-4b82-b0f6-448134aeef38',
  '9549648d-b96e-4590-8374-df7451fd2aa1',
  '967c1f9d-c719-4f3d-a747-87bae9d9ec54',
]

const CANDIDATE_CATEGORIES = [
  'consciousness_practices',
  'consciousness_practice_outcome',
  'consciousness_practice_narrative',
  'consciousness_practice_reflection',
  'consciousness_practice_inquiry',
  'consciousness_practice_report',
  'perception_sensory',
  'perceptual_quirk',
]

const SELECT_COLS =
  'id, title, category, description, paradocs_assessment, status'

type Row = {
  id: string
  title: string
  category: string | null
  description: string | null
  paradocs_assessment: any
  status: string
}

function getAc(r: Row) {
  return r.paradocs_assessment?.anomalous_content_check || null
}

function fmtConf(c: any): string {
  if (typeof c !== 'number') return 'n/a'
  return c.toFixed(2)
}

function truncate(s: string | null, max = 1800): string {
  if (!s) return '(empty)'
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return t.slice(0, max) + ' …[truncated, ' + t.length + ' chars total]'
}

async function fetchKnown(sb: any): Promise<Row[]> {
  const { data, error } = await sb
    .from('reports')
    .select(SELECT_COLS)
    .in('id', KNOWN_IDS)
  if (error) throw new Error('Known fetch failed: ' + error.message)
  return (data || []) as Row[]
}

async function fetchRandomCandidates(sb: any, want = 4): Promise<Row[]> {
  // Pull the pending_review anomalous='no' candidates server-side
  // (anomalous string filter works, confidence numeric filter doesn't via
  // PostgREST operator chain), page in 1k chunks, filter conf 0.85-0.89
  // and candidate categories client-side, then sample.
  const pageSize = 1000
  const out: Row[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('reports')
      .select(SELECT_COLS)
      .eq('status', 'pending_review')
      .in('category', CANDIDATE_CATEGORIES)
      .filter(
        'paradocs_assessment->anomalous_content_check->>anomalous',
        'eq',
        'no',
      )
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error('Page ' + from + ' failed: ' + error.message)
    const batch = (data || []) as Row[]
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
    if (from > 50000) break // safety
  }
  const eligible = out.filter((r) => {
    if (KNOWN_IDS.includes(r.id)) return false
    const ac = getAc(r)
    const c = typeof ac?.confidence === 'number' ? ac.confidence : null
    return c !== null && c >= 0.85 && c <= 0.89
  })

  // Fisher-Yates
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[eligible[i], eligible[j]] = [eligible[j], eligible[i]]
  }
  console.error(
    '# eligible random pool size: ' +
      eligible.length +
      ' (across ' +
      out.length +
      ' candidate-category rows)',
  )
  return eligible.slice(0, want)
}

function emit(r: Row, group: 'KNOWN' | 'RANDOM') {
  const ac = getAc(r) || {}
  const conf = fmtConf(ac.confidence)
  // V11.17.102 — canonical field is "reasoning"; some historical rows still carry
  // the legacy "reason" key (renamed in the prompt+normalizer). A SQL backfill
  // copies .reason → .reasoning for old rows; this fallback is defensive in case
  // the audit runs before the backfill completes.
  const reasoningStr = ac.reasoning != null ? ac.reasoning : ac.reason
  const reasoning = reasoningStr ? String(reasoningStr) : '(no reasoning field)'
  console.log('\n\n========== [' + group + '] ' + r.id + ' ==========')
  console.log('TITLE: ' + (r.title || '(untitled)'))
  console.log('CATEGORY: ' + (r.category || '(null)'))
  console.log('STATUS: ' + r.status)
  console.log('AC.anomalous: ' + (ac.anomalous ?? 'n/a'))
  console.log('AC.confidence: ' + conf)
  console.log('AC.reasoning: ' + reasoning)
  console.log('--- DESCRIPTION ---')
  console.log(truncate(r.description, 2500))
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env',
    )
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.error('# Fetching 8 known IDs…')
  const known = await fetchKnown(sb)
  const byId = new Map(known.map((r) => [r.id, r]))

  console.log('=================================================')
  console.log(' KNOWN-ID BORDERLINE CANDIDATES (' + known.length + '/' + KNOWN_IDS.length + ' found)')
  console.log('=================================================')
  for (const id of KNOWN_IDS) {
    const r = byId.get(id)
    if (!r) {
      console.log('\n[KNOWN] ' + id + ' — NOT FOUND in DB')
      continue
    }
    emit(r, 'KNOWN')
  }

  console.error('# Fetching random candidates…')
  const random = await fetchRandomCandidates(sb, 4)
  console.log('\n\n=================================================')
  console.log(' RANDOM 4 (consciousness/perception, conf 0.85-0.89)')
  console.log('=================================================')
  for (const r of random) emit(r, 'RANDOM')

  console.log('\n# done')
}

main().catch((err) => {
  console.error('FATAL:', err.message || err)
  process.exit(1)
})

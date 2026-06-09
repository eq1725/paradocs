// V11.18.x — Diagnostic harness for the descriptor-extraction gap inside
// the Patterns surface (Sprint 1A-2 review).
//
// What this prints
// ----------------
// For each candidate Finding's (descriptor_family, phen_family) pair:
//   1. The TOTAL approved-report count in the family
//      (the executor's denominator)
//   2. The HINT-NARROW keyword set the live executor matches against
//      (data-query-executor.ts:96-117) — per-keyword hit counts on
//      `paradocs_narrative` so we can see which keywords carry the signal
//   3. A BROADER literature-derived keyword set — per-keyword hit counts
//      so we can quantify how much signal the narrow set is dropping
//   4. The implied gap (broad ratio vs narrow ratio)
//
// Read-only — no writes. Safe to run any time.
// Run: npx tsx scripts/diagnose-descriptor-gaps.ts
//
// Diagnosed by Cowork agent 2026-06-09 against 232,924 approved reports.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

interface Case {
  descriptor: string
  family: string
  hintNarrow: string[]     // mirrors data-query-executor.ts:96-117
  litBroad: string[]       // literature-grounded broader set
}

var CASES: Case[] = [
  {
    descriptor: 'electromagnetic_disturbance',
    family: 'ufos_aliens',
    hintNarrow: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
    litBroad: [
      'electromagnetic', 'emf', 'flicker', 'watch stopped', 'car stalled',
      'engine died', 'engine stopped', 'radio static', 'interference',
      'battery died', 'lights flicker', 'magnetic field', 'static-like',
    ],
  },
  {
    descriptor: 'electromagnetic_disturbance',
    family: 'ghosts_hauntings',
    hintNarrow: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
    litBroad: [
      'electromagnetic', 'emf', 'flicker', 'electronics', 'interference',
      'lights flicker', 'electrical', 'magnetic field',
    ],
  },
  {
    descriptor: 'electromagnetic_disturbance',
    family: 'cryptids',
    hintNarrow: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
    litBroad: [
      'electromagnetic', 'emf', 'flicker', 'interference', 'electronics',
      'electrical',
    ],
  },
  {
    descriptor: 'tunnel_imagery',
    family: 'consciousness_practices',
    hintNarrow: ['tunnel', 'corridor', 'passage'],
    litBroad: [
      'tunnel', 'corridor', 'passage', 'vortex', 'being pulled through',
      'light at the end', 'funnel', 'spiral',
    ],
  },
  {
    descriptor: 'tunnel_imagery',
    family: 'perception_sensory',
    hintNarrow: ['tunnel', 'corridor', 'passage'],
    litBroad: [
      'tunnel', 'corridor', 'passage', 'vortex', 'being pulled through',
      'spiral',
    ],
  },
  {
    descriptor: 'tunnel_imagery',
    family: 'psychological_experiences',
    hintNarrow: ['tunnel', 'corridor', 'passage'],
    litBroad: [
      'tunnel', 'corridor', 'passage', 'vortex', 'being pulled through',
      'light at the end', 'funnel', 'spiral',
    ],
  },
  {
    descriptor: 'static_electricity',
    family: 'cryptids',
    hintNarrow: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
    litBroad: [
      'hair stood', 'hair on end', 'hair stand', 'tingling', 'tingle',
      'prickling', 'static electricity', 'goosebump', 'electrical sensation',
    ],
  },
  {
    descriptor: 'static_electricity',
    family: 'ufos_aliens',
    hintNarrow: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
    litBroad: [
      'hair stood', 'hair on end', 'tingling', 'prickling',
      'static electricity', 'goosebump', 'electrical sensation',
    ],
  },
]

async function countKw(svc: any, family: string, col: string, kw: string): Promise<number> {
  var res = await svc
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('category', family)
    .ilike(col, '%' + kw + '%')
  return Number(res.count) || 0
}

async function totalIn(svc: any, family: string): Promise<number> {
  var res = await svc
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('category', family)
  return Number(res.count) || 0
}

async function main() {
  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  console.log('Diagnose descriptor-extraction gaps in the live Patterns pipeline.\n')
  console.log('Family totals cached at top of run; per-(col,kw) counts are exact.\n')

  for (var i = 0; i < CASES.length; i++) {
    var c = CASES[i]
    var total = await totalIn(svc, c.family)
    console.log('==== ' + c.descriptor + ' in ' + c.family + '   (total approved = ' + total.toLocaleString() + ') ====')

    console.log('  HINT-NARROW set:')
    var narrowMax = 0
    for (var k = 0; k < c.hintNarrow.length; k++) {
      var kw = c.hintNarrow[k]
      var n = await countKw(svc, c.family, 'paradocs_narrative', kw)
      var d = await countKw(svc, c.family, 'description', kw)
      console.log(('    "' + kw + '"').padEnd(28),
        'narrative=' + String(n).padStart(6),
        ' description=' + String(d).padStart(6))
      if (n > narrowMax) narrowMax = n
    }
    console.log('  LIT-BROAD set:')
    var broadMax = 0
    for (var b = 0; b < c.litBroad.length; b++) {
      var bk = c.litBroad[b]
      var bn = await countKw(svc, c.family, 'paradocs_narrative', bk)
      var bd = await countKw(svc, c.family, 'description', bk)
      console.log(('    "' + bk + '"').padEnd(28),
        'narrative=' + String(bn).padStart(6),
        ' description=' + String(bd).padStart(6))
      if (bn > broadMax) broadMax = bn
    }
    console.log('  approx narrow_max=' + narrowMax + ' / total=' + total +
      ' = ' + (total ? Math.round((narrowMax / total) * 1000) / 10 : 0) + '% (single-keyword upper bound)')
    console.log('  approx broad_max =' + broadMax + ' / total=' + total +
      ' = ' + (total ? Math.round((broadMax / total) * 1000) / 10 : 0) + '%\n')
  }
}

main().catch(function (e) {
  console.error('diagnose-descriptor-gaps fatal:', e)
  process.exit(1)
})

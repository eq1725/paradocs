#!/usr/bin/env tsx
/**
 * Re-categorize the 7 Haiku-rescued YouTube reports per Haiku's
 * category_hint from the V11.17.39 audit pass.
 *
 * V11.17.39 — companion to audit-existing-youtube-reports.ts. The
 * rescued reports are currently mis-tagged as ufos_aliens (the YouTube
 * adapter's default) but actually belong in other categories. Haiku
 * named the correct category for each; we apply those moves here.
 *
 * Hard-coded list because there are exactly 7 of them — over-engineering
 * a generic Haiku-driven recat script wasn't worth it at this volume.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/recategorize-haiku-rescued.ts             # apply
 *   npx tsx scripts/recategorize-haiku-rescued.ts --dry-run   # show plan
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Map: short-id (first 8 chars) → { target_category, why }
// The full UUID is looked up by prefix at runtime.
const MOVES: Array<{ shortId: string; toCategory: string; why: string }> = [
  { shortId: 'f634e907', toCategory: 'psychic_phenomena',           why: "Child's Nightmare Mirrors Parent's Crisis — telepathy/precog" },
  { shortId: 'd367b7fd', toCategory: 'perception_sensory',          why: 'Hunter Circles Back Through Dense Fog — spatial disorientation anomaly' },
  // 3fe1b7af stays ufos_aliens (Three Silent Objects — already correct)
  { shortId: '7696bc1c', toCategory: 'psychological_experiences',   why: 'Three Days Lost, Three Hours Remembered — missing time' },
  { shortId: '3c8a9a39', toCategory: 'perception_sensory',          why: 'Teepee Vanish from Childhood Road — apparition/anomaly' },
  { shortId: '85ae3a3a', toCategory: 'perception_sensory',          why: 'Child Lost in Woods, Found by Name-Calling Stranger — missing time' },
  // 9d654811 stays psychic_phenomena (Microprocessor Inventor — already correct)
]

const DRY = process.argv.indexOf('--dry-run') >= 0

async function main() {
  console.log('Recategorize Haiku-rescued YouTube reports — V11.17.39')
  console.log('Mode:', DRY ? 'DRY-RUN' : 'APPLY')
  console.log()
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  for (const m of MOVES) {
    // Look up the full row by short-id prefix (we don't ship full UUIDs
    // in this script; the audit output showed only short ids).
    const { data } = await s.from('reports')
      .select('id, title, category')
      .like('id', m.shortId + '%')
      .limit(1)
      .maybeSingle() as any
    if (!data) { console.log('  MISS ' + m.shortId + ' — no report found'); continue }
    if (data.category === m.toCategory) {
      console.log('  noop  ' + m.shortId + ' already ' + m.toCategory)
      continue
    }
    if (DRY) {
      console.log('  [DRY] ' + m.shortId + ' | ' + data.category + ' → ' + m.toCategory + ' | ' + data.title?.substring(0, 60))
      continue
    }
    const { error } = await s.from('reports').update({ category: m.toCategory }).eq('id', data.id)
    if (error) {
      console.log('  FAIL  ' + m.shortId + ' — ' + error.message)
      continue
    }
    console.log('  done  ' + m.shortId + ' | ' + data.category + ' → ' + m.toCategory + ' | ' + data.title?.substring(0, 60))
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

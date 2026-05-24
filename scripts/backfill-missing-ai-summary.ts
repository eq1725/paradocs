#!/usr/bin/env tsx
/**
 * V11.17.13 — Backfill ai_summary + display_blurb for the small handful
 * of phenomena (added during recent OBERF/ADCRF refactors) that were
 * created without an encyclopedia description.
 *
 * Drain-safe: UPDATE only on phenomena table, only writes ai_summary,
 * display_blurb, ai_summary_at, display_blurb_at when those fields are NULL.
 *
 * Audit query (returns 2 rows as of V11.17.13):
 *   SELECT slug, name, category, report_count FROM phenomena
 *   WHERE ai_summary IS NULL;
 *   --> meditation-experience (consciousness_practices, rc=37)
 *   --> elwetritsch (religion_mythology, rc=0)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Backfill {
  slug: string
  ai_summary: string
  display_blurb: string
}

const ENTRIES: Backfill[] = [
  {
    slug: 'meditation-experience',
    ai_summary:
      'Meditation experiences are reports of altered states of consciousness arising during contemplative practice — including vivid imagery, energetic sensations, sensed presences, time distortion, ego dissolution, or spontaneous insight — that go beyond ordinary mental quiet.',
    display_blurb:
      'Altered states of consciousness reported during contemplative practice, including imagery, sensed presence, time distortion, or spontaneous insight.',
  },
  {
    slug: 'elwetritsch',
    ai_summary:
      'The Elwetritsch is a folkloric creature from the Palatinate region of southwestern Germany — typically depicted as a chicken-like bird with antlers, scales, or other reptilian features — and the legendary quarry of traditional regional snipe-hunt pranks.',
    display_blurb:
      'Folkloric chicken-like cryptid from the German Palatinate, depicted with antlers or reptilian features and famous in regional snipe-hunt lore.',
  },
]

async function main() {
  let updated = 0
  let skipped = 0
  for (const e of ENTRIES) {
    const { data: existing, error: fetchErr } = await supabase
      .from('phenomena')
      .select('id, slug, ai_summary, display_blurb')
      .eq('slug', e.slug)
      .single()
    if (fetchErr || !existing) {
      console.log(`[skip] ${e.slug}: not found (${fetchErr?.message})`)
      skipped++
      continue
    }
    // Idempotent: only write where NULL
    const patch: Record<string, any> = {}
    const now = new Date().toISOString()
    if (!existing.ai_summary) {
      patch.ai_summary = e.ai_summary
      patch.ai_generated_at = now
    }
    if (!existing.display_blurb) {
      patch.display_blurb = e.display_blurb
      patch.display_blurb_at = now
    }
    if (Object.keys(patch).length === 0) {
      console.log(`[skip] ${e.slug}: both fields already populated`)
      skipped++
      continue
    }
    const { error: upErr } = await supabase
      .from('phenomena')
      .update(patch)
      .eq('id', existing.id)
    if (upErr) {
      console.error(`[err]  ${e.slug}: ${upErr.message}`)
      continue
    }
    console.log(`[ok]   ${e.slug}: wrote ${Object.keys(patch).join(', ')}`)
    updated++
  }
  console.log(`\nDone: ${updated} updated, ${skipped} skipped`)
}
main().catch(e => { console.error(e); process.exit(1) })

#!/usr/bin/env tsx
/**
 * Audit existing YouTube-sourced reports against the V11.17.39 (#22)
 * paranormal-bearing gate.
 *
 * Companion to the quality-filter.ts gate that rejects new YouTube
 * ingests without any anomalous-experience keywords. THIS script
 * applies the same gate retroactively to the ~48 YouTube reports
 * already in the database — they passed the older (looser) filter
 * but include non-paranormal content like:
 *   - "Lightning Strike Blindness During Havana Storm" (medical)
 *   - "Charging Bull Elephant Pursues Safari Vehicle" (wildlife)
 *   - "Pier Stargazing Shifts Perception of Space" (vague awe)
 *
 * Default mode is DRY-RUN: prints what would be archived without
 * touching the DB. Pass --apply to actually archive the failing
 * reports (sets status='archived' which hides them from the feed
 * and encyclopedia but preserves them for audit + reversal).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-existing-youtube-reports.ts          # dry-run
 *   npx tsx scripts/audit-existing-youtube-reports.ts --apply  # actually archive
 *   npx tsx scripts/audit-existing-youtube-reports.ts --csv out.csv  # export only
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// MUST match the regex in src/lib/ingestion/filters/quality-filter.ts
// V11.17.39 (#22). Keep these two in sync; future maintenance should
// extract the constant into a shared file.
const PARANORMAL_KEYWORDS = new RegExp(
  '\\b(' + [
    // UFO / craft / lights
    'ufo','uap','alien','extraterrestrial','abduct','implant','saucer','disc','orb','sphere',
    'ball.of.light','bright.ball','glowing.ball','glowing.sphere','silent.object',
    'triangle','cigar.shaped','tic.tac','craft','hover','hovered','hovering','silent.craft',
    'formation','light.formation','strange.light','strange.lights','bright.light.in.the.sky',
    // Ghosts / hauntings / apparitions
    'ghost','spirit','apparition','phantom','haunt','haunted','haunting','poltergeist',
    'shadow.figure','shadow.person','shadow.man','hat.man','dark.figure','black.figure',
    'silhouette','figure.at.the.foot','figure.in.the.corner','figure.standing','figure.vanished',
    'glowing.eyes','red.eyes','presence','sensed.presence','felt.watched','cold.spot',
    // Cryptids
    'cryptid','bigfoot','sasquatch','dogman','skinwalker','wendigo','mothman','chupacabra',
    'loch.ness','lake.monster','tall.figure','hairy.bipedal','upright.creature',
    // Consciousness / NDE / OBE
    'nde','near.death','out.of.body','astral','astral.projection','life.review','tunnel.of.light',
    'floated.above','floated.out','looking.down.at.myself','left.my.body','died.and.came.back',
    'consciousness.shift','expanded.consciousness','non.dual','dissolution.of.self','unity.experience',
    // Psychic / precognition / telepathy
    'precognit','premonit','telepath','telepathic','telekines','psychokines','clairvoyan','psychic',
    'knew.before.it.happened','dream.came.true','prophetic','foresaw','sensed.something',
    // Possession / religion
    'possession','possessed','exorcism','demon','djinn','entity','angel','deity','divine',
    // Generic anomaly
    'paranormal','supernatural','anomal','unexplain','unexplainable','strange.encounter','strange.experience',
    // Memory / time anomalies
    'synchronic','deja.vu','time.slip','missing.time','lost.time','hours.unaccounted','compressed.time',
    'time.stood.still','time.skipped','timeline.shift','mandela.effect',
    'shared.memory','identical.memory','mutual.memory','same.memory','diverge.*memory',
    // Manifestation / materialization
    'manifestation','manifested','apport','materializ','appeared.out.of.nowhere',
    'vanished','disappeared','vanish.*thin.air','wasnt.there.anymore',
    // Past life / reincarnation
    'reincarnat','past.life','past.lives','soul.before',
    // Esoteric practice
    'witchcraft','spell.work','spell.cast','ritual','sigil','ouija','spirit.board','seance',
    'medium(ship)?','channeling','automatic.writing','levitat','telepor','tulpa',
    // Sleep paralysis (bare term + variants)
    'sleep.paralysis','couldnt.move','couldn.t.move','pinned.to.bed','paralyzed.in.bed',
    'bed.paralysis','old.hag','hag.attack','incubus','succubus','sleep.paralysis',
    'pressed.down.on','weight.on.my.chest','presence.on.my.chest','paralysis.episode',
    // Glitch / reality shift
    'glitch','glitch.in.the.matrix','simulation','reality.shift','reality.glitch',
    'unrecognizable','familiar.place.became','place.changed.somehow',
    // Dream phenomena
    'recurring.dream','lucid.dream','prophetic.dream','mutual.dream','shared.dream',
    'dream.figure','dream.entity','dream.warning',
    // Shared / NDE adjacent
    'shared.death','deathbed.vision','crossed.over','met.deceased',
  ].join('|') + ')\\b',
  'i'
)

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    csv: flag('--csv'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Audit existing YouTube reports — V11.17.39 (#22)')
  console.log('Mode:', args.apply ? 'APPLY (will archive failing reports)' : 'DRY-RUN (no DB writes)')
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: rows, error } = await s.from('reports')
    .select('id, slug, title, description, summary, status, category, created_at')
    .eq('status', 'approved')
    .eq('source_type', 'youtube')
    .order('created_at', { ascending: false })

  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('No approved YouTube reports.'); return }

  console.log('Approved YouTube reports total:', rows.length, '\n')

  const passing: any[] = []
  const failing: any[] = []

  for (const r of rows as any[]) {
    const combined = (r.title || '') + ' ' + (r.description || '') + ' ' + (r.summary || '')
    if (PARANORMAL_KEYWORDS.test(combined)) {
      passing.push(r)
    } else {
      failing.push(r)
    }
  }

  console.log('=== Would PASS the new gate (paranormal keywords present) ===')
  console.log('Count:', passing.length)
  console.log()
  console.log('=== Would FAIL the new gate (no paranormal keywords) ===')
  console.log('Count:', failing.length)
  console.log()
  for (const r of failing) {
    const title = (r.title || '').substring(0, 90)
    const cat = (r.category || '?').substring(0, 20)
    console.log('  ' + r.id.substring(0, 8) + ' | ' + cat.padEnd(22) + ' | ' + title)
  }

  // Optional CSV export
  if (args.csv) {
    const lines = ['slug,id,category,title,wouldArchive']
    for (const r of failing) {
      lines.push([
        r.slug || '',
        r.id,
        r.category || '',
        '"' + (r.title || '').replace(/"/g, '""') + '"',
        'true',
      ].join(','))
    }
    for (const r of passing) {
      lines.push([
        r.slug || '',
        r.id,
        r.category || '',
        '"' + (r.title || '').replace(/"/g, '""') + '"',
        'false',
      ].join(','))
    }
    fs.writeFileSync(args.csv, lines.join('\n') + '\n')
    console.log('\nWrote ' + lines.length + ' rows to ' + args.csv)
  }

  if (args.apply && failing.length > 0) {
    console.log('\nArchiving ' + failing.length + ' failing reports...')
    let archived = 0
    let errs = 0
    for (const r of failing) {
      // V10.13 — reports use status='archived' for soft-delete (deleted_at
      // is for hard-delete trail). Setting status='archived' hides from
      // feeds + encyclopedia but preserves for reversal.
      const { error: upErr } = await s.from('reports')
        .update({
          status: 'archived',
          moderation_notes: 'V11.17.39 (#22) — failed paranormal-bearing gate retroactive audit: no anomalous keywords in title/description/summary',
        })
        .eq('id', r.id)
      if (upErr) { errs++; continue }
      archived++
    }
    console.log('Archived: ' + archived)
    console.log('Errors:   ' + errs)
  } else if (!args.apply) {
    console.log('\nDry-run complete. To actually archive these reports, re-run with --apply:')
    console.log('  npx tsx scripts/audit-existing-youtube-reports.ts --apply')
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

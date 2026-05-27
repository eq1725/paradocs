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
import Anthropic from '@anthropic-ai/sdk'
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
    haiku: bool('--haiku'),  // V11.17.39 — run Haiku verification on regex-failing reports
  }
}

const HAIKU_PROMPT = `You are auditing whether a report describes a paranormal, anomalous, or supernatural experience suitable for inclusion in the Paradocs encyclopedia.

PARADOCS COVERS: UFO/UAP sightings, ghost/spirit/apparition encounters, hauntings, poltergeists, cryptids (Bigfoot, Mothman, etc.), near-death and out-of-body experiences, premonitions and precognitive dreams, telepathy, psychokinesis, sleep paralysis with entity, possession, time slips, missing time, anomalous memory, synchronicity, manifestation, vanishing/appearing objects, mediumship, exorcism, shared death experiences, and similar.

PARADOCS DOES NOT COVER: medical incidents (lightning strikes, dental pain, hypothermia), wildlife encounters (charging animals, dangerous predators), severe weather (tornadoes, hurricanes), recreational drug experiences (mushroom trips, psilocybin), survival/navigation stories (lost in woods, found by stranger), historical tours, technological inventions, animal behavior observations, or generic dramatic personal stories without anomalous content.

Respond with ONLY a single-line JSON object (no markdown):
{
  "paranormal": true | false,
  "category_hint": "ufos_aliens" | "ghosts_hauntings" | "cryptids" | "psychological_experiences" | "psychic_phenomena" | "consciousness_practices" | "esoteric_practices" | "religion_mythology" | "perception_sensory" | null,
  "reason": "<one-sentence justification>"
}

Be conservative — when in doubt, say paranormal=true (we'd rather keep a borderline-anomalous report than archive a real one).`

async function haikuVerify(anth: Anthropic, title: string, description: string): Promise<{ paranormal: boolean; category_hint: string | null; reason: string } | null> {
  try {
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: HAIKU_PROMPT,
      messages: [{ role: 'user', content: 'TITLE: ' + title + '\n\nDESCRIPTION:\n' + (description || '').substring(0, 1500) }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (_e) {
    return null
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
  console.log('=== Would FAIL the regex gate (no paranormal keywords) ===')
  console.log('Count:', failing.length)
  console.log()
  for (const r of failing) {
    const title = (r.title || '').substring(0, 90)
    const cat = (r.category || '?').substring(0, 20)
    console.log('  ' + r.id.substring(0, 8) + ' | ' + cat.padEnd(22) + ' | ' + title)
  }

  // V11.17.39 — Haiku second-pass on regex-failing reports. Regex catches
  // explicit vocabulary but misses implicit paranormal content ("Three
  // Silent Objects" = UFO, "Teepee Vanish from Childhood Road" = apparition,
  // "Child's Nightmare Mirrors Parent's Crisis" = shared/telepathic dream).
  // Haiku reads the description and decides whether the report belongs on
  // Paradocs. Reports Haiku confirms as paranormal are MOVED OUT of the
  // archive list and into a "keep" list with optional category_hint.
  //
  // Cost: 27 reports × ~$0.0002 each = ~$0.005. Tiny.
  let haikuConfirmedFails: any[] = failing
  const haikuKeeps: any[] = []
  if (args.haiku && failing.length > 0) {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    if (!ANTHROPIC_API_KEY) {
      console.log('\n! --haiku requested but ANTHROPIC_API_KEY missing; skipping')
    } else {
      console.log('\n=== Running Haiku verification on ' + failing.length + ' regex-failing reports ===')
      const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
      const trueFails: any[] = []
      for (let i = 0; i < failing.length; i++) {
        const r = failing[i]
        const verdict = await haikuVerify(anth, r.title || '', r.description || r.summary || '')
        if (!verdict) {
          // Haiku failure → safer to keep
          haikuKeeps.push({ ...r, _verdict: { paranormal: true, reason: '(Haiku verify failed; defaulting to keep)' } })
          continue
        }
        if (verdict.paranormal) {
          haikuKeeps.push({ ...r, _verdict: verdict })
        } else {
          trueFails.push({ ...r, _verdict: verdict })
        }
        // Progress dot
        process.stdout.write(verdict.paranormal ? '·' : 'x')
      }
      console.log()
      haikuConfirmedFails = trueFails
      console.log()
      console.log('Haiku rescued (paranormal-but-regex-missed):')
      for (const r of haikuKeeps) {
        console.log('  KEEP ' + r.id.substring(0, 8) + ' | ' + (r._verdict?.category_hint || '?').padEnd(20) + ' | ' + (r.title || '').substring(0, 80))
        if (r._verdict?.reason) console.log('       reason: ' + r._verdict.reason.substring(0, 100))
      }
      console.log()
      console.log('Haiku confirmed non-paranormal (safe to archive):')
      for (const r of trueFails) {
        console.log('  ARCHIVE ' + r.id.substring(0, 8) + ' | ' + (r.category || '?').padEnd(20) + ' | ' + (r.title || '').substring(0, 80))
        if (r._verdict?.reason) console.log('          reason: ' + r._verdict.reason.substring(0, 100))
      }
      console.log()
      console.log('Final tally: ' + haikuKeeps.length + ' rescued / ' + trueFails.length + ' confirmed to archive')
    }
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

  // Pick the actual archive list:
  //   - If --haiku was used: only archive Haiku-confirmed non-paranormal
  //   - If --haiku wasn't used: archive everything that failed regex
  const archiveList = args.haiku ? haikuConfirmedFails : failing

  if (args.apply && archiveList.length > 0) {
    console.log('\nArchiving ' + archiveList.length + ' reports...')
    let archived = 0
    let errs = 0
    for (const r of archiveList) {
      const note = (r._verdict?.reason
        ? 'V11.17.39 (#22) — Haiku confirmed non-paranormal: ' + r._verdict.reason
        : 'V11.17.39 (#22) — failed paranormal-bearing regex gate retroactive audit'
      ).substring(0, 1000)
      // V10.13 — reports use status='archived' for soft-delete (deleted_at
      // is for hard-delete trail). Setting status='archived' hides from
      // feeds + encyclopedia but preserves for reversal.
      const { error: upErr } = await s.from('reports')
        .update({ status: 'archived', moderation_notes: note })
        .eq('id', r.id)
      if (upErr) { errs++; continue }
      archived++
    }
    console.log('Archived: ' + archived)
    console.log('Errors:   ' + errs)
  } else if (!args.apply) {
    console.log('\nDry-run complete.')
    if (!args.haiku) {
      console.log('Recommended next step: re-run with --haiku to verify regex-failures via AI:')
      console.log('  npx tsx scripts/audit-existing-youtube-reports.ts --haiku')
    } else {
      console.log('To archive the ' + haikuConfirmedFails.length + ' Haiku-confirmed non-paranormal reports:')
      console.log('  npx tsx scripts/audit-existing-youtube-reports.ts --haiku --apply')
    }
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

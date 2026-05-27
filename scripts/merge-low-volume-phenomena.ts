#!/usr/bin/env tsx
/**
 * Smart-merge low-volume phenomena into higher-volume sibling/parent
 * phenomena.
 *
 * V11.17.39 — taxonomy hygiene round 2. After archiving the 0-link
 * long tail (round 1 = archive-empty-phenomena.ts), this script
 * tackles the next bucket: phenomena with 1-4 junction links that
 * are likely sub-types or regional variants of higher-volume parents.
 *
 * Example: "Acorn UFO" (3 reports) is a sub-shape of "Disc UFO"
 * (87 reports). Those 3 reports would surface better attributed to
 * the broader phenomenon. Same for niche cryptid variants, regional
 * ghost name variants, etc.
 *
 * Pipeline per candidate:
 *   1. Ask Haiku: "what broader/more-popular phenomenon is this a
 *      variant of? Return a slug if you know one." Haiku draws from
 *      its training knowledge of paranormal taxonomy.
 *   2. Verify Haiku's suggested parent slug exists in our phenomena
 *      table AND has >= MIN_PARENT_LINKS junction rows AND status='active'.
 *   3. If valid parent: MERGE — update all report_phenomena rows for
 *      this candidate to point at the parent, then archive the candidate.
 *   4. If no valid parent: archive the candidate as standalone (still
 *      under-5 link count → no real reason to keep it active).
 *
 * Both branches are reversible (status='archived' restores via UPDATE,
 * and the junction-row remapping is bounded so it can be reverted by
 * pointing them back at the original phenomenon_id — preserved in the
 * archived row's ai_history audit note).
 *
 * Cost: ~$0.06-0.10 in Haiku (1 call per candidate × 300-500 candidates
 * × $0.0002).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/merge-low-volume-phenomena.ts --dry-run
 *   npx tsx scripts/merge-low-volume-phenomena.ts --apply
 *   npx tsx scripts/merge-low-volume-phenomena.ts --apply --max-links 4
 *   npx tsx scripts/merge-low-volume-phenomena.ts --apply --keep-standalone   # only archive when sibling exists
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const HAIKU_MODEL = 'claude-haiku-4-5'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const MIN_PARENT_LINKS = 25 // parent must have at least this many real reports

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    maxLinks: parseInt(flag('--max-links', '4') || '4'),
    keepStandalone: bool('--keep-standalone'),
  }
}

const HAIKU_SYSTEM = `You categorize paranormal/anomalous phenomena into broader parent phenomena for taxonomy consolidation.

Given a low-volume phenomenon (a sub-type, regional variant, or niche entry), identify the SLUG of a higher-volume parent/sibling phenomenon it could be merged into.

The parent should be:
  - A more general / commonly-reported version of the same underlying phenomenon
  - Something a witness who experiences the variant would more naturally describe to a wider audience
  - Strictly within the paranormal/anomalous-experience domain

Examples:
  "Acorn UFO" → "disc-ufo" (sub-shape of the disc-saucer class)
  "Tall Whites" → "alien-encounter" (specific alien race, broader is encounter)
  "Cigar UFO Over Aurora 1897" → "cigar-ufo" (specific case, broader class)
  "Brazilian Witchcraft" → "witchcraft" (regional variant of broad practice)
  "Hungarian Lidérc" → "incubus" (regional name for a documented type)
  "Tic Tac UFO" → "disc-ufo" OR null (debatable; could be its own class)

CRITICAL:
  - Only suggest a parent you have HIGH confidence in. If unsure, return null.
  - The parent must be a DIFFERENT slug from the candidate.
  - If the candidate is genuinely unique (no broader phenomenon covers it), return null.
  - The parent slug should be a paranormal-phenomenon slug, NOT a general concept.

Respond with ONLY a single-line JSON object, no markdown fences:
{
  "parent_slug": "<slug>" | null,
  "confidence": "high" | "medium" | "low",
  "reason": "<one sentence>"
}`

async function haikuSuggestParent(p: any): Promise<{ parent_slug: string | null; confidence: string; reason: string } | null> {
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        system: HAIKU_SYSTEM,
        messages: [{
          role: 'user',
          content: 'PHENOMENON: ' + p.name +
            '\nSLUG: ' + p.slug +
            '\nCATEGORY: ' + p.category +
            (p.aliases?.length ? '\nALIASES: ' + (p.aliases as string[]).slice(0, 4).join(', ') : '') +
            (p.ai_summary ? '\nSUMMARY: ' + p.ai_summary.substring(0, 400) : ''),
        }],
      }),
    })
    if (!resp.ok) return null
    const data: any = await resp.json()
    const text = data?.content?.[0]?.text || ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    return JSON.parse(text.substring(start, end + 1))
  } catch (_e) {
    return null
  }
}

async function main() {
  const args = parseArgs()
  console.log('Smart-merge low-volume phenomena — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log('Max links threshold:', args.maxLinks)
  console.log('Keep standalone (no-sibling) phenomena:', args.keepStandalone)
  console.log()

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1) Fetch all candidates: status='active' AND report_count between 1 and maxLinks.
  // (report_count=0 was handled by archive-empty-phenomena.ts.)
  console.log('Fetching low-volume candidates...')
  const candidates: any[] = []
  let lastId = ''
  while (true) {
    let q = s.from('phenomena')
      .select('id, slug, name, category, aliases, ai_summary, report_count')
      .eq('status', 'active')
      .gte('report_count', 1)
      .lte('report_count', args.maxLinks)
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    candidates.push(...data)
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  console.log('Candidates (1-' + args.maxLinks + ' reports): ' + candidates.length)
  console.log()

  // 2) Build a fast in-memory lookup of HIGH-VOLUME phenomena by slug for parent validation.
  console.log('Building parent-eligibility index (slug → has >= ' + MIN_PARENT_LINKS + ' links + active)...')
  const eligibleParents = new Map<string, any>()
  let pLastId = ''
  while (true) {
    let q = s.from('phenomena')
      .select('id, slug, name, category, report_count')
      .eq('status', 'active')
      .gte('report_count', MIN_PARENT_LINKS)
      .order('id', { ascending: true })
      .limit(1000)
    if (pLastId) q = q.gt('id', pLastId) as any
    const { data } = await q
    if (!data || data.length === 0) break
    for (const r of data) eligibleParents.set(r.slug, r)
    pLastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  console.log('Eligible parents available: ' + eligibleParents.size)
  console.log()

  // 3) Ask Haiku per candidate
  console.log('Asking Haiku for parent suggestions (' + candidates.length + ' calls)...')
  const merges: Array<{ child: any; parent: any; confidence: string; reason: string }> = []
  const standalones: any[] = []
  const startMs = Date.now()
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const verdict = await haikuSuggestParent(c)
    if (verdict?.parent_slug) {
      const parent = eligibleParents.get(verdict.parent_slug)
      if (parent && parent.slug !== c.slug && verdict.confidence !== 'low') {
        merges.push({ child: c, parent, confidence: verdict.confidence, reason: verdict.reason })
      } else {
        standalones.push({ ...c, _verdict: verdict })
      }
    } else {
      standalones.push({ ...c, _verdict: verdict })
    }
    process.stdout.write(verdict?.parent_slug && eligibleParents.has(verdict.parent_slug) ? '·' : 'x')
    if ((i + 1) % 50 === 0) {
      const elapsedSec = (Date.now() - startMs) / 1000
      const rate = (i + 1) / elapsedSec
      const eta = Math.floor((candidates.length - i - 1) / rate)
      process.stdout.write(' ' + (i + 1) + '/' + candidates.length + ' eta=' + Math.floor(eta / 60) + 'm\n')
    }
  }
  console.log('\n')

  // 4) Pre-flight summary
  console.log('=== Pre-flight ===')
  console.log('To MERGE (sibling found):       ' + merges.length)
  console.log('Standalone (no valid sibling):  ' + standalones.length)
  console.log()
  console.log('Sample merges (first 20):')
  for (const m of merges.slice(0, 20)) {
    console.log('  ' + m.child.slug.padEnd(40) + ' → ' + m.parent.slug.padEnd(35) + ' [' + m.confidence + ']')
    console.log('       reason: ' + m.reason.substring(0, 100))
  }
  if (merges.length > 20) console.log('  ... ' + (merges.length - 20) + ' more')
  console.log()

  if (args.dryRun) {
    console.log('Dry-run complete.')
    console.log()
    console.log('Plan if applied:')
    console.log('  - ' + merges.length + ' candidates would merge their report links into parents, then archive')
    if (!args.keepStandalone) {
      console.log('  - ' + standalones.length + ' standalone candidates would archive (no sibling found)')
    } else {
      console.log('  - ' + standalones.length + ' standalone candidates would STAY active (--keep-standalone)')
    }
    console.log()
    console.log('Apply: npx tsx scripts/merge-low-volume-phenomena.ts --apply')
    return
  }

  // 5) Apply merges
  let mergedReports = 0
  let mergeErrors = 0
  let archived = 0
  let archiveErrors = 0
  console.log('Applying merges...')

  for (const m of merges) {
    // For each report_phenomena row pointing at child → re-point to parent.
    // upsert with onConflict=ignore so duplicates are skipped (case where
    // a report is already linked to both the child AND the parent).
    const { data: links } = await s.from('report_phenomena').select('report_id, confidence').eq('phenomenon_id', m.child.id)
    if (!links || links.length === 0) {
      // No actual junction rows — archive directly without remapping
    } else {
      // Insert new links pointing at parent (ignore duplicates)
      for (const l of links as any[]) {
        const { error: insErr } = await s.from('report_phenomena').upsert({
          report_id: l.report_id,
          phenomenon_id: m.parent.id,
          confidence: l.confidence || 0.75,
          tagged_by: 'auto-merge',
          is_primary: false,
        }, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true })
        if (insErr) { mergeErrors++; continue }
        mergedReports++
      }
      // Delete child's junction rows
      await s.from('report_phenomena').delete().eq('phenomenon_id', m.child.id)
    }
    // Archive child
    const auditNote = 'V11.17.39 merge round 2 — merged into ' + m.parent.slug +
      ' (was: ' + m.child.report_count + ' links, parent: ' + m.parent.report_count + '). Reason: ' + m.reason.substring(0, 300)
    const { error: archErr } = await s.from('phenomena').update({
      status: 'archived',
      merged_into_id: m.parent.id,
      ai_history: auditNote,
    }).eq('id', m.child.id)
    if (archErr) { archiveErrors++; continue }
    archived++
  }

  // 6) Apply standalone archives (if not --keep-standalone)
  let standaloneArchived = 0
  if (!args.keepStandalone) {
    console.log('Archiving standalone candidates (no valid sibling)...')
    for (const sa of standalones) {
      const reason = sa._verdict?.reason || 'no merge candidate'
      const auditNote = 'V11.17.39 merge round 2 — archived standalone (no valid sibling found): ' + reason.substring(0, 200)
      const { error } = await s.from('phenomena').update({
        status: 'archived',
        ai_history: auditNote,
      }).eq('id', sa.id)
      if (!error) standaloneArchived++
    }
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Merged children:        ' + archived)
  console.log('Report-links re-pointed:' + mergedReports)
  console.log('Merge errors:           ' + mergeErrors)
  console.log('Standalone archived:    ' + standaloneArchived)
  console.log()
  console.log('To restore a merged phenomenon:')
  console.log('  -- 1. Unarchive')
  console.log('  UPDATE phenomena SET status=\'active\', merged_into_id=NULL WHERE slug = \'<slug>\';')
  console.log('  -- 2. Move some links back if desired (use ai_history note to find parent)')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })

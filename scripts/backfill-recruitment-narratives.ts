#!/usr/bin/env tsx
/**
 * V11.17.26 — Archive reports whose AI narrative explicitly identifies
 * them as recruitment/meta posts (Bug #13).
 *
 * The post-AI narrative generator describes content factually rather
 * than rejecting; when it produces text like "The source is a recruitment
 * post rather than an experience report", the report should never have
 * surfaced as approved. This script catches the already-ingested ones
 * and archives them (status='archived'), preserving the row + AI fields
 * for forensics. Drain-safe: UPDATE only, no DELETE.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-recruitment-narratives.ts --dry-run
 *   tsx scripts/backfill-recruitment-narratives.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const dryRun = process.argv.includes('--dry-run')

// Patterns the AI narrative uses when it correctly identifies non-experience content
const REJECT_NARRATIVE_PATTERNS = [
  'the source is a recruitment post',
  'the source is not a first-person',
  'the source is not an experience report',
  'the source is a meta-discussion',
  'the source is a meta discussion',
  'the source is a promotional',
  'the source is a community announcement',
  'the source is a solicitation',
  'the author describes an existing community',
  'this is a recruitment post',
  'this is a community-building',
  'this is a meta-discussion',
  'rather than an experience report',
  'rather than a first-person',
]

async function main() {
  const allMatches = new Map<string, { slug: string; title: string; snippet: string; pattern: string }>()
  for (const pat of REJECT_NARRATIVE_PATTERNS) {
    const { data, error } = await supabase
      .from('reports')
      .select('id, slug, title, paradocs_narrative, status')
      .eq('status', 'approved')
      .ilike('paradocs_narrative', '%' + pat + '%')
      .limit(500)
    if (error) { console.error('err for', pat, error); continue }
    for (const r of data || []) {
      if (!allMatches.has(r.id)) {
        const snippet = (r.paradocs_narrative || '').toLowerCase()
        const idx = snippet.indexOf(pat)
        const ctx = idx >= 0 ? snippet.substring(Math.max(0, idx-20), Math.min(snippet.length, idx+pat.length+30)) : ''
        allMatches.set(r.id, { slug: r.slug, title: r.title, snippet: ctx, pattern: pat })
      }
    }
  }
  console.log('Found ' + allMatches.size + ' approved reports whose narrative self-identifies as non-experience.\n')
  let i = 0
  for (const [, m] of allMatches) {
    if (i++ < 20) console.log('  ' + m.slug + ' [' + m.pattern + ']\n     "' + m.snippet + '"')
  }
  if (dryRun) {
    console.log('\n--dry-run: no changes written.')
    return
  }
  let archived = 0
  for (const [id] of allMatches) {
    const { error } = await supabase
      .from('reports')
      .update({ status: 'archived' })
      .eq('id', id)
    if (error) { console.error('  [err]', error.message); continue }
    archived++
  }
  console.log('\nArchived ' + archived + ' reports.')
  // Recompute report_count for any phenomena that had these reports linked
  const ids = Array.from(allMatches.keys())
  if (ids.length > 0) {
    console.log('Reverting junction-derived phenomenon counts for the archived rows...')
    const phenIds = new Set<string>()
    for (let j = 0; j < ids.length; j += 100) {
      const chunk = ids.slice(j, j+100)
      const { data: links } = await supabase
        .from('report_phenomena')
        .select('phenomenon_id')
        .in('report_id', chunk)
      for (const l of links || []) phenIds.add(l.phenomenon_id)
    }
    console.log('  affected phenomena: ' + phenIds.size + ' (recomputing report_count)')
    for (const pid of phenIds) {
      const { data: js } = await supabase.from('report_phenomena').select('report_id').eq('phenomenon_id', pid)
      const rIds = (js || []).map((r: any) => r.report_id)
      let approved = 0
      for (let k = 0; k < rIds.length; k += 500) {
        const chunk2 = rIds.slice(k, k+500)
        const { count } = await supabase.from('reports').select('*', { count: 'exact', head: true }).in('id', chunk2).eq('status', 'approved')
        approved += count || 0
      }
      await supabase.from('phenomena').update({ report_count: approved }).eq('id', pid)
    }
    console.log('  report_count recomputed for ' + phenIds.size + ' phenomena')
  }
}
main().catch(e => { console.error(e); process.exit(1) })

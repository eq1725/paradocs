#!/usr/bin/env node
/**
 * Diagnose how many reports are missing each of the key content fields:
 *   - title (weak/generic)
 *   - feed_hook
 *   - paradocs_narrative
 *   - paradocs_assessment
 *   - summary
 *
 * Also pulls the specific UFO report the user flagged so we can see its actual
 * field values.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('=== FLAGGED UFO REPORT ===')
  const { data: ufo, error: ufoErr } = await supabase
    .from('reports')
    .select('id, slug, title, source_type, status, feed_hook, paradocs_narrative, paradocs_assessment, summary, description')
    .eq('slug', 'ufo-encounter-2000-cu8xwc')
    .single()
  if (ufoErr) {
    console.log('  Not found:', ufoErr.message)
  } else {
    console.log('  slug:', ufo.slug)
    console.log('  title:', JSON.stringify(ufo.title))
    console.log('  source_type:', ufo.source_type)
    console.log('  status:', ufo.status)
    console.log('  feed_hook:', ufo.feed_hook ? `(${ufo.feed_hook.length} chars)` : 'NULL')
    console.log('  paradocs_narrative:', ufo.paradocs_narrative ? `(${ufo.paradocs_narrative.length} chars)` : 'NULL')
    console.log('  paradocs_assessment:', ufo.paradocs_assessment ? 'SET' : 'NULL')
    console.log('  summary:', ufo.summary ? `(${ufo.summary.length} chars)` : 'NULL')
    console.log('  description:', ufo.description ? `(${ufo.description.length} chars)` : 'NULL')
  }

  console.log('\n=== AGGREGATE COUNTS ===')

  const counts = {}

  const { count: totalApproved } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
  counts.totalApproved = totalApproved

  const { count: missingHook } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('feed_hook', null)
  counts.missingHook = missingHook

  const { count: missingNarrative } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('paradocs_narrative', null)
  counts.missingNarrative = missingNarrative

  const { count: missingAssessment } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('paradocs_assessment', null)
  counts.missingAssessment = missingAssessment

  const { count: missingSummary } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('summary', null)
  counts.missingSummary = missingSummary

  console.log('  total approved:', counts.totalApproved)
  console.log('  missing feed_hook:', counts.missingHook)
  console.log('  missing paradocs_narrative:', counts.missingNarrative)
  console.log('  missing paradocs_assessment:', counts.missingAssessment)
  console.log('  missing summary:', counts.missingSummary)

  console.log('\n=== WEAK-TITLE CANDIDATES (approved) ===')
  // Weak patterns: "<descriptor> (2000)", "<descriptor> - Jan 2020", title too short (<10 chars), generic category+year
  const { data: weakPatterns } = await supabase
    .from('reports')
    .select('title')
    .eq('status', 'approved')
    .or([
      'title.ilike.UFO Encounter (%',
      'title.ilike.UFO Sighting (%',
      'title.ilike.NDE Report (%',
      'title.ilike.Out-of-Body Experience%',
      'title.ilike.Near-Death Experience%',
      'title.ilike.Dream Experience%',
      'title.ilike.Deathbed Vision%',
      'title.ilike.Prayer Experience%',
      'title.ilike.Other Experience%',
      'title.ilike.Pre-Birth Memory%',
      'title.ilike.Spiritually Transformative Experience%',
      'title.ilike.Paranormal Experience%',
      'title.ilike.Creature Sighting%',
      'title.ilike.Strange Experience%',
    ].join(','))
    .limit(2000)

  const samples = (weakPatterns || []).slice(0, 20)
  console.log('  weak title pattern matches (sample of first 20 of', weakPatterns?.length || 0, '):')
  samples.forEach(r => console.log('    -', r.title))

  console.log('\n=== RECENT SMOKE-TEST REPORTS (last 25, approved) ===')
  const { data: recent } = await supabase
    .from('reports')
    .select('slug, title, source_type, feed_hook, paradocs_narrative')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(25)
  ;(recent || []).forEach(r => {
    const hookOk = r.feed_hook ? 'HOOK' : 'no-hook'
    const narrOk = r.paradocs_narrative ? 'NARR' : 'no-narr'
    console.log(`  [${hookOk}/${narrOk}] ${r.source_type} ${r.slug}: ${r.title}`)
  })
}

main().catch(e => { console.error(e); process.exit(1) })

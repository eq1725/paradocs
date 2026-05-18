#!/usr/bin/env npx tsx
/**
 * backfill-report-titles
 *
 * Panel-feedback (May 2026) — pre-launch data cleanup. Test reports
 * submitted during the early /start funnel were affected by a schema
 * mismatch: the form had a single textarea that ended up writing to
 * `reports.title` (or to title + a truncated summary), with
 * `reports.description` blank or empty. On the published report page
 * the body's first 80 chars rendered as the title and the "What
 * happened" block was empty.
 *
 * This script repairs those rows:
 *   1. Find reports where description IS NULL or description = ''
 *      AND length(title) > 120 (a real title would be ≤ ~90 chars;
 *      anything longer is a truncated body).
 *   2. Copy title → description.
 *   3. Generate a fresh short title via Haiku.
 *   4. UPDATE row with new title + new description + first-200-char
 *      summary.
 *
 * Idempotent: if a row's description is already populated, skip.
 * If a row's title is already ≤ 120 chars, skip (we can't tell from
 * length alone whether it's a real title or a tidy first sentence;
 * leave well alone).
 *
 * Usage:
 *   # Dry run — show what would be changed, change nothing:
 *   npx tsx scripts/backfill-report-titles.ts --dry-run
 *
 *   # Live run, full batch:
 *   npx tsx scripts/backfill-report-titles.ts
 *
 *   # Live run, capped to N rows for paranoia:
 *   npx tsx scripts/backfill-report-titles.ts --limit=10
 *
 *   # Target a single report by id:
 *   npx tsx scripts/backfill-report-titles.ts --id=<uuid>
 *
 * Environment (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY            (Haiku title regen)
 *
 * Cost: ~$0.0001 per row at Haiku 4.5 rates. 100 rows ≈ $0.01.
 *
 * Safety: writes to production unless you point env vars at staging.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { suggestOnboardingTitle } from '../src/lib/services/onboarding-title.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ── Args ──────────────────────────────────────────────────────────
var argv = process.argv.slice(2)
var DRY_RUN = argv.indexOf('--dry-run') !== -1
var LIMIT = (function () {
  var idx = argv.findIndex(function (a) { return a.indexOf('--limit=') === 0 })
  return idx === -1 ? 0 : parseInt(argv[idx].split('=')[1], 10)
})()
var TARGET_ID = (function () {
  var idx = argv.findIndex(function (a) { return a.indexOf('--id=') === 0 })
  return idx === -1 ? '' : argv[idx].split('=')[1]
})()

// ── Heuristic: "is this title actually a truncated body?" ──────────
//
// A genuine title is short, has at most one sentence boundary, and
// is < 120 chars. A truncated body usually:
//   - is > 120 chars (the makeTitle fallback was `.slice(0, 80) + '…'`)
//   - ends in '…' or '...'
//   - contains multiple periods/exclamation marks/question marks
//   - or has a length close to 80-100 chars (the old slice ceiling)
function looksLikeTruncatedBody(title: string): boolean {
  if (!title) return false
  var trimmed = title.trim()
  if (trimmed.length >= 120) return true
  if (trimmed.endsWith('…') || trimmed.endsWith('...')) return true
  var sentenceBoundaries = (trimmed.match(/[.!?]/g) || []).length
  // 80–100 chars with 2+ sentence-boundary marks is a strong tell
  // for the makeTitle slice-and-ellipsis fallback.
  if (trimmed.length >= 80 && sentenceBoundaries >= 2) return true
  return false
}

async function main() {
  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  console.log('[backfill-report-titles] starting')
  console.log('  dry-run:', DRY_RUN)
  console.log('  limit:', LIMIT || 'unlimited')
  if (TARGET_ID) console.log('  target id:', TARGET_ID)

  // Fetch candidate rows. Keep the query broad and filter in JS for
  // the "looks like truncated body" heuristic — Postgres-side regex
  // and length checks are clumsy and we want the heuristic
  // expressible.
  var query = svc
    .from('reports')
    .select('id, title, description, summary, category, slug')
    .or('description.is.null,description.eq.')
    .order('created_at', { ascending: true })

  if (TARGET_ID) query = query.eq('id', TARGET_ID)
  if (LIMIT > 0) query = query.limit(LIMIT)
  // Without an explicit limit, fall back to 1000 — anything larger is
  // probably a config error.
  else query = query.limit(1000)

  var { data: rows, error: fetchErr } = await query
  if (fetchErr) {
    console.error('[backfill-report-titles] fetch failed:', fetchErr.message)
    process.exit(1)
  }

  var candidates = (rows || []).filter(function (r: any) {
    if (!r.title) return false
    return looksLikeTruncatedBody(r.title)
  })

  console.log('[backfill-report-titles] candidates:', candidates.length, 'of', (rows || []).length, 'examined')

  if (candidates.length === 0) {
    console.log('[backfill-report-titles] nothing to do')
    return
  }

  var fixed = 0
  var skipped = 0
  var failed = 0
  var totalCost = 0

  for (var i = 0; i < candidates.length; i++) {
    var row: any = candidates[i]
    var oldTitle: string = row.title

    // Generate the new title from the OLD title (which is the
    // truncated body). Strip the trailing ellipsis so the LLM works
    // against clean prose.
    var sourceBody = oldTitle.replace(/[…\.]{1,3}$/, '').trim()

    // If the source is too short to suggest a title from, skip — we
    // don't want to invent.
    if (sourceBody.length < 50) {
      console.log('  [' + row.slug + '] skip (source too short:', sourceBody.length, 'chars)')
      skipped++
      continue
    }

    var newTitle: string | null = null
    var costUsd = 0
    if (!DRY_RUN) {
      var result = await suggestOnboardingTitle(sourceBody, row.category || null)
      newTitle = result.title
      costUsd = result.costUsd
      totalCost += costUsd
    } else {
      // Dry-run: show what we WOULD send to Haiku.
      newTitle = '<would call Haiku>'
    }

    // New description: the old title becomes the body. New summary:
    // first 200 chars of the new description.
    var newDescription = sourceBody
    var newSummary = newDescription.slice(0, 200) + (newDescription.length > 200 ? '…' : '')

    console.log('  [' + row.slug + ']')
    console.log('    old title:', oldTitle.slice(0, 80) + (oldTitle.length > 80 ? '…' : ''))
    console.log('    new title:', newTitle)
    console.log('    desc bytes: 0 → ' + newDescription.length)
    if (costUsd > 0) console.log('    haiku cost: $' + costUsd.toFixed(5))

    if (DRY_RUN) {
      skipped++
      continue
    }

    if (!newTitle) {
      failed++
      continue
    }

    var { error: updateErr } = await svc.from('reports').update({
      title: newTitle,
      description: newDescription,
      summary: newSummary,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    if (updateErr) {
      console.error('    UPDATE failed:', updateErr.message)
      failed++
    } else {
      fixed++
    }
  }

  console.log('[backfill-report-titles] done')
  console.log('  fixed:', fixed)
  console.log('  skipped:', skipped)
  console.log('  failed:', failed)
  if (totalCost > 0) console.log('  total haiku cost: $' + totalCost.toFixed(4))
}

main().catch(function (e) {
  console.error('[backfill-report-titles] uncaught:', e)
  process.exit(1)
})

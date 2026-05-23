#!/usr/bin/env node
// V11.17.11 — Poll a submitted Haiku blurb batch and persist results
// when it completes. Designed to be re-run repeatedly within the 45s
// bash window — each call checks status once and, if the batch is
// done, fetches results + writes to the DB.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/poll-display-blurb-batch.mjs            # uses saved batch_id
//   node scripts/poll-display-blurb-batch.mjs BATCH_ID   # explicit

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const apiKey = process.env.ANTHROPIC_API_KEY
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!apiKey || !url || !key) {
  console.error('Missing env')
  process.exit(1)
}
const supabase = createClient(url, key)

const batchId = process.argv[2] || (fs.existsSync('/tmp/display-blurb-batch-id.txt')
  ? fs.readFileSync('/tmp/display-blurb-batch-id.txt', 'utf-8').trim()
  : null)
if (!batchId) {
  console.error('No batch_id (pass as arg or run submit script first).')
  process.exit(1)
}

const MAX_BLURB_CHARS = 180

function normalizeBlurb(raw) {
  let s = (raw || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim()
  if (s.length <= MAX_BLURB_CHARS) return s
  const head = s.slice(0, MAX_BLURB_CHARS)
  const lastDot = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (lastDot > MAX_BLURB_CHARS * 0.5) return head.slice(0, lastDot + 1).trim()
  const lastSpace = head.lastIndexOf(' ')
  return (lastSpace > MAX_BLURB_CHARS * 0.4 ? head.slice(0, lastSpace) : head).trim()
}

async function main() {
  const statusRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!statusRes.ok) {
    console.error(`Status fetch failed: ${statusRes.status} ${await statusRes.text()}`)
    process.exit(1)
  }
  const status = await statusRes.json()
  const counts = status.request_counts || {}
  console.log(`Batch ${batchId.slice(0, 20)}…`)
  console.log(`  status:     ${status.processing_status}`)
  console.log(`  succeeded:  ${counts.succeeded || 0}`)
  console.log(`  processing: ${counts.processing || 0}`)
  console.log(`  errored:    ${counts.errored || 0}`)

  if (status.processing_status !== 'ended') {
    console.log(`\nNot done yet. Re-run this script in a minute to check again.`)
    return
  }

  console.log(`\nBatch complete. Fetching results…`)
  const resultsRes = await fetch(status.results_url, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!resultsRes.ok) {
    console.error(`Results fetch failed: ${resultsRes.status}`)
    process.exit(1)
  }
  const text = await resultsRes.text()

  const blurbs = []
  let parsed = 0
  let failed = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      const customId = obj.custom_id
      const result = obj.result
      if (result?.type !== 'succeeded') {
        failed++
        continue
      }
      const raw = result.message?.content?.[0]?.text || ''
      const blurb = normalizeBlurb(raw)
      if (blurb && customId) {
        blurbs.push({ id: customId, blurb })
        parsed++
      } else {
        failed++
      }
    } catch (e) {
      failed++
    }
  }
  console.log(`  parsed:  ${parsed}`)
  console.log(`  failed:  ${failed}`)

  if (blurbs.length === 0) {
    console.log('Nothing to persist.')
    return
  }

  console.log(`\nPersisting ${blurbs.length} blurbs…`)
  const now = new Date().toISOString()
  let persisted = 0
  let persistFailed = 0
  // Chunked updates: 100 at a time so we don't hammer with sequential round-trips too long.
  const CONCURRENCY = 20
  for (let i = 0; i < blurbs.length; i += CONCURRENCY) {
    const batch = blurbs.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async ({ id, blurb }) => {
      const { error } = await supabase
        .from('phenomena')
        .update({ display_blurb: blurb, display_blurb_at: now })
        .eq('id', id)
      return error ? { ok: false, id, msg: error.message } : { ok: true }
    }))
    results.forEach((r) => {
      if (r.ok) persisted++
      else { persistFailed++; console.error(`  ${r.id}: ${r.msg}`) }
    })
    if (i % 500 === 0 && i > 0) console.log(`    ${i + batch.length}/${blurbs.length}…`)
  }

  console.log(`\n========================================`)
  console.log(`Persistence done`)
  console.log(`  written:  ${persisted}`)
  console.log(`  failed:   ${persistFailed}`)
  console.log(`========================================`)

  // Clear the saved batch_id so re-runs don't pick it up by accident.
  try { fs.unlinkSync('/tmp/display-blurb-batch-id.txt') } catch (_) {}
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })

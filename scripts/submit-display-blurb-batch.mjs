#!/usr/bin/env node
// V11.17.11 — Submit a Haiku batch for display_blurb generation.
// Prints the batch_id and exits. Use poll-display-blurb-batch.mjs to
// check status and persist results when the batch completes.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/submit-display-blurb-batch.mjs           # all missing
//   node scripts/submit-display-blurb-batch.mjs --limit 50

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const apiKey = process.env.ANTHROPIC_API_KEY
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!apiKey || !url || !key) {
  console.error('Missing env: ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key)

const limitArgIdx = process.argv.indexOf('--limit')
const LIMIT = limitArgIdx > -1 ? parseInt(process.argv[limitArgIdx + 1], 10) : 0

const TARGET_BLURB_CHARS = 140
const MAX_BLURB_CHARS = 180

function buildPrompt(p) {
  const aliases = p.aliases?.length > 0 ? ` (also known as: ${p.aliases.slice(0, 3).join(', ')})` : ''
  const summary = p.ai_summary
    ? `\n\nReference (full encyclopedia summary, do NOT copy verbatim):\n"""${p.ai_summary.slice(0, 1200)}"""`
    : ''
  return `You write definitional one-sentence descriptors for an encyclopedia of paranormal phenomena. The descriptor appears on a small mobile card, so brevity and scannability matter more than completeness.

Phenomenon: ${p.name}${aliases}
Category: ${p.category}${summary}

Write ONE sentence that defines what ${p.name} is. Rules:
1. ≤${TARGET_BLURB_CHARS} characters (hard cap ${MAX_BLURB_CHARS}). Counted in characters, not words.
2. Defines the entity — what it IS, in encyclopedic neutral tone. Not "said to be" or "supposedly".
3. Lead with the type/class noun ("humanoid creature", "vampiric entity", "ritual practice"), then 1-2 distinctive details.
4. Avoid restating "${p.name}" at the start when natural — start with the descriptor noun where possible.
5. No marketing flourish, no exclamations, no hedging.
6. Plain text only. No markdown, no quotes, no leading/trailing whitespace.

Return ONLY the sentence. No preamble, no JSON, no labels.`
}

async function fetchPhenomena() {
  const rows = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('phenomena')
      .select('id, name, category, ai_summary, aliases')
      .eq('status', 'active')
      .is('display_blurb', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    if (LIMIT > 0 && rows.length >= LIMIT) break
    from += PAGE
  }
  if (LIMIT > 0 && rows.length > LIMIT) rows.length = LIMIT
  return rows
}

async function main() {
  console.log('Fetching phenomena needing blurbs…')
  const phenomena = await fetchPhenomena()
  console.log(`Found ${phenomena.length} rows.`)
  if (phenomena.length === 0) {
    console.log('Nothing to submit.')
    return
  }

  const requests = phenomena.map((p) => ({
    custom_id: p.id,
    params: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: 'user', content: buildPrompt(p) }],
    },
  }))

  console.log(`Submitting batch with ${requests.length} requests…`)
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) {
    console.error(`Batch submit failed: ${res.status}`)
    console.error(await res.text())
    process.exit(1)
  }
  const data = await res.json()
  console.log(`\n✓ Batch submitted: ${data.id}`)
  console.log(`  processing_status: ${data.processing_status}`)
  console.log(`  request count: ${requests.length}`)

  // Save batch_id to a file for the poll script to pick up.
  fs.writeFileSync('/tmp/display-blurb-batch-id.txt', data.id)
  console.log(`\n  Saved batch_id to /tmp/display-blurb-batch-id.txt`)
  console.log(`\nNext: poll with`)
  console.log(`  node scripts/poll-display-blurb-batch.mjs`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })

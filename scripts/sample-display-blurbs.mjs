#!/usr/bin/env node
// V11.17.11 — Synchronous sanity-check generator for display_blurb.
//
// Uses the regular Anthropic Messages API (not Batch) so it returns
// in ~5s instead of waiting 10-30 min for batch completion. Pulls
// the first N phenomena with NULL display_blurb, calls Haiku per row,
// prints the result, and optionally writes to the DB.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/sample-display-blurbs.mjs 5            # dry-run, print only
//   node scripts/sample-display-blurbs.mjs 5 --persist  # also UPDATE the rows

import { createClient } from '@supabase/supabase-js'

const N = parseInt(process.argv[2] || '5', 10)
const PERSIST = process.argv.includes('--persist')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const apiKey = process.env.ANTHROPIC_API_KEY
if (!url || !key || !apiKey) {
  console.error('Missing SUPABASE or ANTHROPIC env vars')
  process.exit(1)
}

const supabase = createClient(url, key)

const TARGET_BLURB_CHARS = 140
const MAX_BLURB_CHARS = 180

function buildPrompt(p) {
  const aliases = p.aliases && p.aliases.length > 0
    ? ` (also known as: ${p.aliases.slice(0, 3).join(', ')})`
    : ''
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

function normalizeBlurb(raw) {
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim()
  if (s.length <= MAX_BLURB_CHARS) return s
  const head = s.slice(0, MAX_BLURB_CHARS)
  const lastDot = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (lastDot > MAX_BLURB_CHARS * 0.5) return head.slice(0, lastDot + 1).trim()
  const lastSpace = head.lastIndexOf(' ')
  return (lastSpace > MAX_BLURB_CHARS * 0.4 ? head.slice(0, lastSpace) : head).trim()
}

async function callHaiku(p) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: 'user', content: buildPrompt(p) }],
    }),
  })
  if (!res.ok) throw new Error(`Haiku ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return normalizeBlurb(data.content?.[0]?.text || '')
}

async function main() {
  console.log(`Fetching ${N} phenomena with NULL display_blurb…`)
  const { data, error } = await supabase
    .from('phenomena')
    .select('id, name, category, ai_summary, aliases')
    .eq('status', 'active')
    .is('display_blurb', null)
    .order('name', { ascending: true })
    .limit(N)
  if (error) throw error
  if (!data || data.length === 0) {
    console.log('No phenomena found needing blurbs.')
    return
  }
  console.log(`Found ${data.length}. Generating blurbs…\n`)

  for (const p of data) {
    process.stdout.write(`  ${p.name} (${p.category})… `)
    try {
      const blurb = await callHaiku(p)
      console.log(`(${blurb.length}ch)`)
      console.log(`    "${blurb}"`)
      if (PERSIST) {
        const { error: updErr } = await supabase
          .from('phenomena')
          .update({ display_blurb: blurb, display_blurb_at: new Date().toISOString() })
          .eq('id', p.id)
        if (updErr) console.error(`    persist failed: ${updErr.message}`)
        else console.log('    persisted ✓')
      }
    } catch (e) {
      console.log(`FAILED: ${e.message}`)
    }
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })

#!/usr/bin/env node
/**
 * Backfill compelling newspaper-style titles for ALL approved reports.
 *
 * Drops in as a replacement for the older "Type - Setting, Key_Element"
 * formula. For each report we generate a 4-9 word headline grounded in
 * the witness description, then write it back as reports.title (the
 * previous title is preserved in reports.original_title for auditing).
 *
 * Usage:
 *   node scripts/backfill-compelling-titles.js                 # all approved reports
 *   node scripts/backfill-compelling-titles.js --dry-run       # show proposed titles, don't write
 *   node scripts/backfill-compelling-titles.js --limit 20      # cap how many we process
 *   node scripts/backfill-compelling-titles.js --weak-only     # only formulaic weak titles
 *
 * Notes:
 *  - Duplicates the prompt + validation logic from
 *    src/lib/services/compelling-title.service.ts so this script runs
 *    as pure Node without a TS loader.
 *  - Skips reports where the description is too short to safely derive
 *    a headline (< 80 chars). These keep their current title.
 */

require('dotenv').config({ path: '.env.local', override: true })
const { createClient } = require('@supabase/supabase-js')

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPA_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPA_URL, SERVICE_KEY)

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const WEAK_ONLY = argv.includes('--weak-only')
const limitIdx = argv.indexOf('--limit')
const LIMIT = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) : null
const CONCURRENCY = 4
const DELAY_BETWEEN_BATCHES_MS = 750

const MODEL_PRIMARY = 'claude-haiku-4-5-20251001'
const MODEL_FALLBACK = 'claude-sonnet-4-5-20250929'
const MIN_WORDS = 4
const MAX_WORDS = 10
const MAX_CHARS = 80
const REQUEST_TIMEOUT_MS = 25000
const MAX_RETRIES = 3

const SYSTEM_PROMPT = [
  'You write short, compelling, SPECIFIC titles for a paranormal research encyclopedia.',
  'Every title is a factual newspaper-style headline derived from the actual witness report.',
  '',
  'Rules:',
  '- 4 to 9 words total, title case',
  '- Name the most distinctive concrete element: the creature, craft shape, setting, entity,',
  '  or pivotal action from the report',
  '- Never invent names, places, dates, numbers, or creatures that are not in the source',
  '- No clickbait (no "You Won\'t Believe", no exclamation marks)',
  '- No ellipses, no quotation marks, no colons, no subtitles',
  '- Do not use the bare generic category as the full title (e.g., "UFO Encounter",',
  '  "NDE Report", "Out-of-Body Experience"). Always add the distinguishing element.',
  '- Prefer concrete nouns over abstractions',
  '- If the witness was a child, it is fine to say "Boy" / "Girl" / "Child"; do not invent ages',
  '',
  'Return ONLY the title. No quotes. No preamble. No trailing punctuation.'
].join('\n')

const WEAK_TITLE_PREFIXES = [
  /^UFO Encounter \(\d/i,
  /^UFO Sighting \(\d/i,
  /^NDE Report /i,
  /^Near-Death Experience/i,
  /^Out-of-Body Experience/i,
  /^Deathbed Vision/i,
  /^Dream Experience/i,
  /^Prayer Experience/i,
  /^Other Experience/i,
  /^Pre-Birth Memory/i,
  /^Spiritually Transformative Experience/i,
  /^Paranormal Experience/i,
  /^Creature Sighting/i,
  /^Strange Experience/i,
  /^NDE-Like Experience/i,
  /^After-Death Communication/i,
  /^Nearing End-of-Life Experience/i,
  /^Shared Death Experience/i,
  /^Sudden OBE/i,
  /^Premonition Experience/i,
]

function isWeakTitle(title) {
  if (!title || title.trim().length < 10) return true
  for (const p of WEAK_TITLE_PREFIXES) if (p.test(title)) return true
  // "Something (2000)" style
  if (/\(\d{4}\)\s*$/.test(title) && title.length < 40) return true
  return false
}

function formatDateStr(date) {
  if (!date) return null
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return null
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    return months[d.getMonth()] + ' ' + d.getFullYear()
  } catch (e) { return null }
}

function cleanTitle(raw) {
  let s = (raw || '').trim()
  s = s.replace(/^["'`\u201C\u201D\u2018\u2019*_]+/, '')
  s = s.replace(/["'`\u201C\u201D\u2018\u2019*_]+$/, '')
  s = s.replace(/^(title|headline|suggested title|answer)\s*:\s*/i, '')
  s = s.replace(/[.\u2026]+$/, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function toTitleCase(s) {
  const small = new Set(['a','an','the','and','but','or','nor','for','yet','so','at','by','in','of','on','to','up','as','vs','v','with','from','into','onto','over','under'])
  const words = s.split(' ')
  return words.map((word, i) => {
    if (!word) return word
    if (/^[A-Z]{2,}$/.test(word)) return word
    const lower = word.toLowerCase()
    if (i !== 0 && i !== words.length - 1 && small.has(lower)) return lower
    if (word.indexOf('-') !== -1) {
      return word.split('-').map(part => {
        if (/^[A-Z]{2,}$/.test(part)) return part
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      }).join('-')
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }).join(' ')
}

function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length
}

const BARE_CATEGORY = [
  /^UFO Encounter$/i, /^UFO Sighting$/i, /^NDE Report$/i,
  /^Near-Death Experience$/i, /^Out-of-Body Experience$/i, /^Dream Experience$/i,
  /^Deathbed Vision$/i, /^Prayer Experience$/i, /^Other Experience$/i,
  /^Pre-Birth Memory$/i, /^Spiritually Transformative Experience$/i,
  /^Paranormal Experience$/i, /^Creature Sighting$/i, /^Strange Experience$/i,
]

function validateTitle(title) {
  if (!title) return 'empty'
  if (title.length > MAX_CHARS) return 'too_long_chars'
  const wc = wordCount(title)
  if (wc < MIN_WORDS) return 'too_few_words'
  if (wc > MAX_WORDS) return 'too_many_words'
  if (/\u2026|\.\.\./.test(title)) return 'contains_ellipsis'
  if (/:/.test(title)) return 'contains_colon'
  if (/["\u201C\u201D]/.test(title)) return 'contains_quote'
  if (/^(here\s+is|here's|i\s+suggest|how\s+about)/i.test(title)) return 'contains_preamble'
  for (const p of BARE_CATEGORY) if (p.test(title.trim())) return 'bare_category'
  return null
}

async function callClaude(model, userPrompt) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 80,
        temperature: 0.4,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: controller.signal
    })
    if (!resp.ok) {
      const t = await resp.text()
      console.error('[api ' + resp.status + '] ' + t.substring(0, 150))
      return null
    }
    const data = await resp.json()
    const block = data && data.content && data.content[0]
    if (!block || block.type !== 'text') return null
    return block.text
  } catch (e) {
    if (e && e.name === 'AbortError') console.error('[timeout] ' + model)
    else console.error('[err] ' + (e && e.message ? e.message : String(e)))
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function buildUserPrompt(report) {
  const lines = []
  const phenomenonLabel = report.phenomenon_type && report.phenomenon_type.name
    ? report.phenomenon_type.name
    : null
  if (phenomenonLabel) lines.push('Phenomenon type: ' + phenomenonLabel)
  else if (report.category) lines.push('Category: ' + report.category)
  if (report.location_name) lines.push('Location: ' + report.location_name)
  const dateStr = formatDateStr(report.event_date)
  if (dateStr) lines.push('Date: ' + dateStr)

  let desc = (report.description || '').trim()
  if (desc.length > 3500) desc = desc.substring(0, 3500) + ' [...truncated]'

  lines.push('')
  lines.push('Witness report:')
  lines.push(desc)
  if (report.summary && report.summary.trim() && desc.indexOf(report.summary.trim()) === -1) {
    lines.push('')
    lines.push('Editor summary: ' + report.summary.trim())
  }
  lines.push('')
  lines.push('Write one compelling, specific, non-hallucinated title (4-9 words, title case, no punctuation at the end):')
  return lines.join('\n')
}

async function generateTitleForReport(report) {
  const userPrompt = buildUserPrompt(report)
  const models = [MODEL_PRIMARY, MODEL_FALLBACK]
  let lastProblem = null
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const raw = await callClaude(model, userPrompt)
      if (!raw) { lastProblem = 'api_error'; await new Promise(r => setTimeout(r, 400 + attempt * 400)); continue }
      const firstLine = raw.split('\n').map(l => l.trim()).filter(Boolean)[0] || ''
      let cleaned = cleanTitle(firstLine)
      cleaned = toTitleCase(cleaned)
      const problem = validateTitle(cleaned)
      if (!problem) return { title: cleaned, model, attempts: attempt + 1 }
      lastProblem = problem
      await new Promise(r => setTimeout(r, 200))
    }
  }
  return { title: null, model: null, attempts: MAX_RETRIES * models.length, problem: lastProblem }
}

async function main() {
  console.log('=== Compelling title backfill ===')
  console.log('  dry run   :', DRY_RUN)
  console.log('  weak only :', WEAK_ONLY)
  console.log('  limit     :', LIMIT)

  // Fetch reports
  let query = supabase
    .from('reports')
    .select('id, slug, title, description, summary, category, location_name, event_date, phenomenon_type:phenomenon_types(name, slug)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (LIMIT) query = query.limit(LIMIT)

  const { data: reports, error } = await query
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }

  console.log('  fetched ' + reports.length + ' approved reports')

  // Filter
  let pool = reports
  if (WEAK_ONLY) pool = pool.filter(r => isWeakTitle(r.title))
  // Skip reports with too-short descriptions
  pool = pool.filter(r => (r.description || '').length >= 80)
  console.log('  candidates: ' + pool.length + ' (after filtering)')

  // Process in chunks
  const stats = { updated: 0, skipped: 0, failed: 0 }
  const changes = []

  for (let i = 0; i < pool.length; i += CONCURRENCY) {
    const batch = pool.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async r => {
      const res = await generateTitleForReport(r)
      return { report: r, res }
    }))

    for (const { report, res } of results) {
      if (!res.title) {
        stats.failed++
        console.log('  [FAIL:' + res.problem + '] ' + report.slug + ' (keep: ' + report.title + ')')
        continue
      }
      if (res.title === report.title) {
        stats.skipped++
        continue
      }
      changes.push({ id: report.id, slug: report.slug, old: report.title, new: res.title })
      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from('reports')
          .update({ title: res.title, original_title: report.title })
          .eq('id', report.id)
        if (upErr) {
          stats.failed++
          console.log('  [DBERR] ' + report.slug + ': ' + upErr.message)
          continue
        }
      }
      stats.updated++
      console.log('  [OK]  ' + report.slug)
      console.log('        old: ' + report.title)
      console.log('        new: ' + res.title)
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
  }

  console.log('\n=== SUMMARY ===')
  console.log('  updated: ' + stats.updated)
  console.log('  skipped (unchanged): ' + stats.skipped)
  console.log('  failed : ' + stats.failed)
  if (DRY_RUN) console.log('\n  [dry run] no database writes performed')
}

main().catch(e => { console.error(e); process.exit(1) })

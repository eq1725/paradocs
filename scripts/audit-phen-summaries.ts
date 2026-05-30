#!/usr/bin/env tsx
/**
 * V11.17.46 — Phenomena ai_summary audit + rewrite.
 *
 * Background: the phen page (/phenomena/[slug]) renders
 * phenomenon.ai_summary as the headline description. Past Haiku
 * runs gave us debunking-skeptical voice ("may have conventional
 * scientific explanations", "rooted in neuroscience", "often the
 * result of"). That's off-brand for Paradocs's documentary,
 * witness-respectful register — the line implicitly tells the
 * witness their experience was probably nothing.
 *
 * This script:
 *   1. Scans `phenomena.ai_summary` for known skeptical-voice
 *      patterns and prints offenders (slug, category, the matched
 *      snippet, full summary).
 *   2. With --rewrite, regenerates each offender via Haiku using a
 *      strict documentary-voice prompt that bans causal claims and
 *      "scientific-explanation" framing.
 *   3. With --apply, persists the rewrites; otherwise prints
 *      before/after diffs for review.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   # Audit only — show the count + first N offenders
 *   tsx scripts/audit-phen-summaries.ts --audit
 *   tsx scripts/audit-phen-summaries.ts --audit --limit 20
 *
 *   # Show Haiku rewrites for offenders (no DB writes)
 *   tsx scripts/audit-phen-summaries.ts --rewrite --dry-run
 *
 *   # Apply rewrites for real
 *   tsx scripts/audit-phen-summaries.ts --rewrite --apply
 *
 *   # Restrict to one category or one slug
 *   tsx scripts/audit-phen-summaries.ts --rewrite --apply --category psychological_experiences
 *   tsx scripts/audit-phen-summaries.ts --rewrite --apply --slug anomalous-experience
 *
 * Cost: Haiku is ~$0.0005 per rewrite. If the audit surfaces ~500
 * offenders, total cost is ~$0.25.
 */

import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

// ─── CLI args ─────────────────────────────────────────────────────────
const argv = process.argv
function flag(name: string): boolean { return argv.indexOf(name) >= 0 }
function arg(name: string): string | null {
  const i = argv.indexOf(name)
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1]
  return null
}

const MODE_AUDIT = flag('--audit')
const MODE_REWRITE = flag('--rewrite')
const MODE_DRY = flag('--dry-run')
const MODE_APPLY = flag('--apply')
const CATEGORY = arg('--category')
const SLUG = arg('--slug')
const LIMIT_STR = arg('--limit')
const LIMIT = LIMIT_STR ? parseInt(LIMIT_STR, 10) || 0 : 0

if (!MODE_AUDIT && !MODE_REWRITE) {
  console.error('Specify --audit or --rewrite')
  process.exit(1)
}
if (MODE_REWRITE && !MODE_DRY && !MODE_APPLY) {
  console.error('--rewrite requires either --dry-run or --apply')
  process.exit(1)
}
if (MODE_REWRITE && !ANTHROPIC_API_KEY) {
  console.error('--rewrite requires ANTHROPIC_API_KEY in env')
  process.exit(1)
}

// ─── Skeptical pattern list ───────────────────────────────────────────
// Each pattern is a substring (case-insensitive). A summary is flagged
// when it contains ANY pattern. Easy to extend — add to the array and
// re-run --audit to see new hits.
const SKEPTICAL_PATTERNS: string[] = [
  // Causal-explanation framing — "actually X", "explained by Y"
  'may have conventional',
  'conventional scientific',
  'rooted in neuroscience',
  'rooted in psychology',
  'rooted in psychiatric',
  'often the result of',
  'often a result of',
  'often attributed to',
  'often the product of',
  'can be attributed to',
  'can be explained by',
  'scientifically explained',
  'natural explanation',
  'natural explanations',
  'neurological cause',
  'neurological condition',
  'psychological condition',
  'psychiatric condition',
  'mental health condition',
  'hallucination',
  'hallucinations',
  'misidentification',
  'misperception',
  'perceived as paranormal',
  'perceived as supernatural',
  'thought to be',
  // Hedging / dismissive framing
  'most cases',
  'studies suggest',
  'researchers believe',
  'scientists believe',
  'skeptics argue',
  'skeptics say',
  'no scientific evidence',
  'no credible evidence',
  // Implicit-debunk patterns
  'in reality',
  'actually due to',
  'really just',
  // Pseudo-objective framing
  'is associated with',
  'is linked to',
  'is thought to',
]

// ─── Types ────────────────────────────────────────────────────────────
interface PhenRow {
  id: string
  slug: string
  name: string
  category: string
  ai_summary: string | null
}

interface Match {
  row: PhenRow
  matched_patterns: string[]
}

// ─── Audit ────────────────────────────────────────────────────────────
function findMatchedPatterns(text: string): string[] {
  const t = text.toLowerCase()
  const hits: string[] = []
  for (const p of SKEPTICAL_PATTERNS) {
    if (t.indexOf(p.toLowerCase()) >= 0) hits.push(p)
  }
  return hits
}

async function loadOffenders(sb: any): Promise<Match[]> {
  let q = sb.from('phenomena')
    .select('id, slug, name, category, ai_summary')
    .eq('status', 'active')
    .not('ai_summary', 'is', null)
  if (CATEGORY) q = q.eq('category', CATEGORY)
  if (SLUG) q = q.eq('slug', SLUG)

  // Paginate so we get everything even at 10k+ phens.
  const all: PhenRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const res = await q.range(from, from + PAGE - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = (res.data || []) as PhenRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
    if (from > 50000) break
  }

  const matches: Match[] = []
  for (const r of all) {
    if (!r.ai_summary) continue
    const hits = findMatchedPatterns(r.ai_summary)
    if (hits.length > 0) matches.push({ row: r, matched_patterns: hits })
  }
  return matches
}

function printAuditReport(matches: Match[]) {
  console.log('=== ai_summary audit ===')
  console.log('Offending phenomena: ' + matches.length)
  console.log()
  // Per-category breakdown so we know the spread.
  const perCat: Record<string, number> = {}
  for (const m of matches) {
    perCat[m.row.category] = (perCat[m.row.category] || 0) + 1
  }
  console.log('Per category:')
  Object.entries(perCat).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
    console.log('  ' + cat.padEnd(28) + ' ' + n)
  })
  console.log()
  // Per-pattern frequency so we see which phrases are doing most of the damage.
  const perPattern: Record<string, number> = {}
  for (const m of matches) {
    for (const p of m.matched_patterns) {
      perPattern[p] = (perPattern[p] || 0) + 1
    }
  }
  console.log('Top patterns:')
  Object.entries(perPattern)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([p, n]) => {
      console.log('  ' + p.padEnd(40) + ' ' + n)
    })
  console.log()
  // Sample offenders.
  const sample = LIMIT > 0 ? matches.slice(0, LIMIT) : matches.slice(0, 10)
  console.log('Sample (' + sample.length + ' of ' + matches.length + '):')
  console.log()
  for (const m of sample) {
    console.log('• ' + m.row.slug + '  [' + m.row.category + ']')
    console.log('    matched: ' + m.matched_patterns.slice(0, 3).join(', ') + (m.matched_patterns.length > 3 ? ', …' : ''))
    console.log('    summary: ' + (m.row.ai_summary || '').slice(0, 220))
    console.log()
  }
}

// ─── Rewrite (Haiku) ──────────────────────────────────────────────────
const REWRITE_SYSTEM_PROMPT = [
  'You are an editorial voice for Paradocs, a documentary catalogue of paranormal and anomalous experiences.',
  'Your job: rewrite a one- to two-sentence description of a phenomenon in Paradocs voice.',
  '',
  'PARADOCS VOICE:',
  '  - Documentary, observational, witness-respectful.',
  '  - Treats the phenomenon as what witnesses report it to be. We catalogue accounts; we do not adjudicate them.',
  '  - Plain, restrained, declarative. No marketing tone. No sensationalism. No exclamations.',
  '',
  'HARD RULES — the rewrite MUST NOT contain any of these:',
  '  - "may have conventional / scientific explanations"',
  '  - "rooted in neuroscience / psychology / psychiatric"',
  '  - "often the result of", "often attributed to", "can be explained by"',
  '  - "natural explanation", "scientifically explained"',
  '  - "hallucination", "misperception", "misidentification"',
  '  - "perceived as paranormal", "perceived as supernatural"',
  '  - "studies suggest", "researchers believe", "scientists believe", "skeptics"',
  '  - "no scientific evidence", "no credible evidence"',
  '  - any phrasing that implicitly debunks the experience or attributes it to a natural cause.',
  '',
  'POSITIVE RULES:',
  '  - State plainly what the phenomenon IS — what the witness encounters or experiences.',
  '  - Where useful, note recurrence ("Reports span cultures and centuries", "Sightings cluster around the U.S. Pacific Northwest").',
  '  - 1-2 sentences. Max 50 words total.',
  '  - Present tense. Active voice where possible.',
  '',
  'EXAMPLES:',
  '  GOOD: "An anomalous experience is an event a witness cannot reconcile with the ordinary — something seen, heard, or felt that does not fit. Reports of these encounters span cultures and centuries."',
  '  GOOD: "Sleep paralysis is a brief state in which the witness wakes unable to move, often accompanied by the sense of a presence in the room. Reports are remarkably consistent across cultures, languages, and centuries."',
  '  BAD:  "Sleep paralysis is a sleep disorder that can be explained by neurological factors involving REM atonia."',
  '  BAD:  "Anomalous experiences may have conventional scientific explanations rooted in neuroscience and psychology."',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object: {"summary": "<sentence(s)>"}. No preamble, no markdown fences.',
].join('\n')

function buildRewriteUserPrompt(p: PhenRow, matchedPatterns: string[]): string {
  return [
    'PHENOMENON:',
    '  name: ' + p.name,
    '  slug: ' + p.slug,
    '  category: ' + p.category,
    '',
    'CURRENT SUMMARY (off-brand — needs rewriting):',
    '  ' + (p.ai_summary || ''),
    '',
    'OFFENDING PHRASES THIS SUMMARY USED: ' + matchedPatterns.slice(0, 5).join(', '),
    '',
    'Rewrite per Paradocs voice. JSON only.',
  ].join('\n')
}

async function callHaikuRewrite(p: PhenRow, matchedPatterns: string[]): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  try {
    const resp = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        temperature: 0.4,
        system: REWRITE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildRewriteUserPrompt(p, matchedPatterns) }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      console.warn('  Haiku ' + resp.status)
      return null
    }
    const data: any = await resp.json()
    const text = data?.content?.[0]?.text || ''
    // Parse JSON.
    const trimmed = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jStart = trimmed.indexOf('{')
    const jEnd = trimmed.lastIndexOf('}')
    if (jStart >= 0 && jEnd > jStart) {
      try {
        const parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
        if (typeof parsed.summary === 'string') return parsed.summary.trim()
      } catch { /* fall through */ }
    }
    // Fallback — first non-empty line.
    const firstLine = text.split('\n').map((s: string) => s.trim()).filter(Boolean)[0] || ''
    return firstLine || null
  } catch (e: any) {
    clearTimeout(timeoutId)
    console.warn('  Haiku threw: ' + (e?.message || e))
    return null
  }
}

// Validates that a proposed rewrite doesn't itself contain skeptical
// phrasing. If it does we don't apply it — better to leave the old
// (bad) copy than ship a different flavor of bad.
function rewritePassesGuard(text: string): { ok: true } | { ok: false; hits: string[] } {
  const hits = findMatchedPatterns(text)
  if (hits.length === 0) return { ok: true }
  return { ok: false, hits }
}

async function runRewrites(sb: any, matches: Match[]) {
  console.log('=== ai_summary rewrite ===')
  console.log('Mode: ' + (MODE_APPLY ? 'APPLY' : 'DRY-RUN'))
  console.log('Targets: ' + matches.length)
  console.log()

  let scoped = matches
  if (LIMIT > 0) scoped = scoped.slice(0, LIMIT)

  const stats = { applied: 0, would_apply: 0, guard_blocked: 0, haiku_failed: 0 }
  for (let i = 0; i < scoped.length; i++) {
    const m = scoped[i]
    process.stdout.write('[' + (i + 1) + '/' + scoped.length + '] ' + m.row.slug.padEnd(36) + ' ')
    const rewrite = await callHaikuRewrite(m.row, m.matched_patterns)
    if (!rewrite) {
      stats.haiku_failed++
      process.stdout.write('! haiku failed\n')
      continue
    }
    const guard = rewritePassesGuard(rewrite)
    if (!guard.ok) {
      stats.guard_blocked++
      process.stdout.write('✗ guard blocked (rewrite still contains: ' + guard.hits.slice(0, 3).join(', ') + ')\n')
      // Print so operator can see what Haiku produced.
      console.log('    rewrite: ' + rewrite.slice(0, 200))
      continue
    }
    if (MODE_APPLY) {
      const upd = await sb.from('phenomena').update({
        ai_summary: rewrite,
        ai_model_used: HAIKU_MODEL,
        ai_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', m.row.id)
      if (upd.error) {
        stats.haiku_failed++
        process.stdout.write('! db error: ' + upd.error.message + '\n')
        continue
      }
      stats.applied++
      process.stdout.write('✓ applied\n')
    } else {
      stats.would_apply++
      process.stdout.write('[dry] would apply\n')
    }
    console.log('    OLD: ' + (m.row.ai_summary || '').slice(0, 180))
    console.log('    NEW: ' + rewrite.slice(0, 180))
    // Polite pause between Haiku calls.
    await new Promise(r => setTimeout(r, 150))
  }

  console.log()
  console.log('══════════════════════════════════════════════════════════')
  console.log('Done.')
  console.log('  Applied:       ' + stats.applied)
  console.log('  Would-apply:   ' + stats.would_apply)
  console.log('  Guard blocked: ' + stats.guard_blocked + ' (Haiku produced more skeptical copy — left untouched)')
  console.log('  Failed:        ' + stats.haiku_failed)
}

// ─── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

  const matches = await loadOffenders(sb)

  if (MODE_AUDIT) {
    printAuditReport(matches)
    return
  }

  if (MODE_REWRITE) {
    if (matches.length === 0) { console.log('No offenders matched the patterns. Nothing to rewrite.'); return }
    await runRewrites(sb, matches)
    return
  }
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })

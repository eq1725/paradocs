/**
 * /api/admin/ai/repair-dates
 *
 * Re-extracts the actual historical first-reported date for each phenomenon
 * from the authoritative AI-generated text fields (ai_quick_facts.first_documented
 * + ai_history) and writes the result back to phenomena.first_reported_date.
 *
 * Background: the audit (CONTENT_QUALITY_PANEL_REVIEW.md) found that
 * first_reported_date is unreliable corpus-wide. ~270 phenomena are on
 * Jan 1 / May 1 placeholders. Many "plausible" dates are actually row-
 * creation timestamps (e.g. Bigfoot at 2022-10-25 when the AI text
 * correctly says 1958). The AI-generated narrative fields have the
 * correct historical dates; this job extracts and re-writes them.
 *
 * Strategy:
 *   1. Fetch a batch of phenomena with non-null ai_quick_facts.first_documented
 *      OR non-null ai_history.
 *   2. Send Claude Haiku a tight extraction prompt that returns one of:
 *      - "YYYY-MM-DD" (specific date)
 *      - "YYYY-MM" (year + month only)
 *      - "YYYY" (year only)
 *      - "century:YY" (e.g. "century:6" = 6th century)
 *      - "unknown"
 *   3. For YYYY-MM-DD: write directly.
 *   4. For YYYY-MM: write as YYYY-MM-15 (mid-month, conservative).
 *   5. For YYYY: write as NULL (year-only is too imprecise for OnThisDate;
 *      it'll fall back to the year display elsewhere).
 *   6. For century / unknown: write NULL.
 *
 * Returns NULL aggressively rather than guessing — the OnThisDate card
 * relies on month/day precision, and a wrong day is worse than no day.
 *
 * Auth: x-admin-api-key header.
 *
 * Query params:
 *   limit:     batch size (default 50, max 100)
 *   offset:    pagination offset
 *   dryRun:    'true' returns proposed updates without writing
 *   onlyPlaceholders: 'true' only repair phenomena where first_reported_date
 *                    is Jan 1 / May 1 (the worst offenders)
 *   force:     'true' repair even phenomena with plausible dates
 *
 * Example:
 *   curl -X POST 'https://beta.discoverparadocs.com/api/admin/ai/repair-dates?onlyPlaceholders=true&limit=50' \
 *     -H 'x-admin-api-key: $ADMIN_API_KEY'
 *
 * SWC: const at module top is fine; var/function expressions inside.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anthropicKey = process.env.ANTHROPIC_API_KEY
const adminApiKey = process.env.ADMIN_API_KEY || 'admin-secret-key'

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = (
  'You extract first-reported dates for paranormal phenomenon entries.\n\n'
  + 'You will be given a phenomenon name plus AI-authored narrative fields '
  + '(first_documented, ai_history). Your job: identify the most accurate, '
  + 'most specific date the phenomenon was FIRST documented or FIRST sighted '
  + 'in the modern (Western or scholarly) era — NOT pre-history, NOT oral '
  + 'tradition, NOT the date of a recent revival. Specifically:\n\n'
  + '- If the narrative says "First sighted September 22, 1722 by Grace '
  + 'Connolly..." → return "1722-09-22".\n'
  + '- If "Modern era sightings began with George Spicer\'s July 22, 1933 '
  + 'observation..." → return "1933-07-22".\n'
  + '- If "Discovered in 1958 by Jerry Crew at Bluff Creek..." → return "1958".\n'
  + '- If "Ancient Egypt circa 3000 BCE" only → return "unknown" (too vague).\n'
  + '- If conflicting dates given, prefer the most specific concrete event '
  + 'that has a named witness or named investigator.\n'
  + '- For phenomena rooted in oral tradition with no specific Western '
  + 'discovery date → return "unknown".\n\n'
  + 'OUTPUT FORMAT: Return ONLY a JSON object with one of these shapes:\n'
  + '  {"date": "YYYY-MM-DD"}     when day-precision is given\n'
  + '  {"date": "YYYY-MM"}        when month-precision is given\n'
  + '  {"date": "YYYY"}           when year-only is given\n'
  + '  {"date": "unknown"}        when no specific Western date is identifiable\n\n'
  + 'No explanation, no markdown, no extra fields. JSON object only.'
)

interface RepairResult {
  id: string
  slug: string
  name: string
  before: string | null
  proposed: string | null
  precision: 'day' | 'month' | 'year' | 'unknown' | 'error'
  reason?: string
}

function parseDateResponse(raw: string): { value: string | null; precision: RepairResult['precision'] } {
  // Strip markdown code fences if present
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

  // Try direct parse
  let json: any = null
  try { json = JSON.parse(text) } catch (_) {}

  // Try to extract the FIRST balanced {...} block (greedy across newlines)
  if (!json) {
    const m = text.match(/\{[\s\S]*?\}/)
    if (m) {
      try { json = JSON.parse(m[0]) } catch (_) {}
    }
  }

  // V6.3 fallback: if no JSON parsed but the text contains a recognizable
  // pattern like '"date": "..."' or 'date: ...', extract the value directly.
  let dateValue: string | null = null
  if (json && typeof json.date === 'string') {
    dateValue = json.date.trim()
  } else {
    // Look for "date": "VALUE" anywhere in the response (with or without
    // quoted key). Catches AI responses that wrap JSON in prose.
    const keyMatch = text.match(/["']?date["']?\s*:\s*["']([^"']+)["']/i)
    if (keyMatch) {
      dateValue = keyMatch[1].trim()
    } else if (/\bunknown\b/i.test(text) && !/\d{4}/.test(text.slice(0, 200))) {
      // Free-text "unknown" with no year mentioned
      dateValue = 'unknown'
    } else {
      // Last resort: pull a YYYY-MM-DD or YYYY-MM or YYYY out of free text
      const day = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
      if (day) { dateValue = day[1] + '-' + day[2] + '-' + day[3] }
      else {
        const monthOnly = text.match(/\b(\d{4})-(\d{2})\b/)
        if (monthOnly) { dateValue = monthOnly[1] + '-' + monthOnly[2] }
        else {
          const yearOnly = text.match(/\b(1[6789]\d{2}|20\d{2})\b/)
          if (yearOnly) { dateValue = yearOnly[1] }
        }
      }
    }
  }

  if (!dateValue) return { value: null, precision: 'error' }
  if (dateValue === 'unknown') return { value: null, precision: 'unknown' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return { value: dateValue, precision: 'day' }
  if (/^\d{4}-\d{2}$/.test(dateValue)) return { value: dateValue + '-15', precision: 'month' }
  if (/^\d{4}$/.test(dateValue)) return { value: null, precision: 'year' }
  return { value: null, precision: 'error' }
}

/** Enumerate every YYYY-MM-DD that matches our 4 known placeholder
 *  month-day patterns, across years 1700..2030. Used as an .in() filter
 *  so the server only returns placeholder rows when onlyPlaceholders=true. */
function generatePlaceholderDates(): string[] {
  const out: string[] = []
  const monthDays = ['01-01', '05-01', '03-08', '12-12']
  for (let y = 1700; y <= 2030; y++) {
    for (const md of monthDays) {
      out.push(y + '-' + md)
    }
  }
  return out
}

async function extractDate(p: any): Promise<{ value: string | null; precision: RepairResult['precision']; reason?: string }> {
  if (!anthropic) {
    return { value: null, precision: 'error', reason: 'anthropic_not_configured' }
  }
  const userPrompt = (
    'Phenomenon: ' + p.name + '\n\n'
    + (p.ai_quick_facts?.first_documented
      ? 'first_documented field: ' + p.ai_quick_facts.first_documented + '\n\n'
      : '')
    + (p.ai_history
      ? 'ai_history (first 1500 chars):\n' + (p.ai_history as string).slice(0, 1500)
      : '')
  )
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,    // raised from 60 — concept phenomena like
                          // "Christianity" produce a longer reasoning chain
                          // before the AI emits the JSON, so 60 was cutting
                          // them off mid-thought.
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const block = resp.content[0]
    const text = block && block.type === 'text' ? block.text : ''
    const parsed = parseDateResponse(text)
    return parsed
  } catch (err: any) {
    return { value: null, precision: 'error', reason: err?.message || 'anthropic_error' }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (req.headers['x-admin-api-key'] !== adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  const limit = Math.min(parseInt((req.query.limit as string) || '50') || 50, 100)
  const offset = Math.max(parseInt((req.query.offset as string) || '0') || 0, 0)
  const dryRun = req.query.dryRun === 'true'
  const onlyPlaceholders = req.query.onlyPlaceholders === 'true'
  const force = req.query.force === 'true'

  let query = supabase
    .from('phenomena')
    .select('id, slug, name, first_reported_date, ai_quick_facts, ai_history')
    .eq('status', 'active')

  if (onlyPlaceholders) {
    // Use OR filter to pull only the placeholder dates (Jan 1, May 1,
    // Mar 8, Dec 12 — identified in the May 2 audit). PostgREST supports
    // chained .in() over date strings.
    query = query.in('first_reported_date', [
      // Most common placeholder years × placeholder month-days. Generated
      // by enumerating known placeholder month-days (01-01, 05-01,
      // 03-08, 12-12) over the year range observed in the audit.
      // We pull a wide year range; non-existent rows are simply skipped.
      ...generatePlaceholderDates(),
    ] as any)
  }

  query = query.order('id', { ascending: true }).range(offset, offset + limit - 1)

  const { data: rows, error } = await query
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const eligible = (rows || []).filter((p: any) => {
    if (!p.ai_quick_facts && !p.ai_history) return false
    if (force) return true
    if (onlyPlaceholders) {
      // Server-side filter already restricted to placeholder dates; just
      // require at least some AI text to extract from.
      return !!(p.ai_quick_facts || p.ai_history)
    }
    // Default mode: only repair rows with no date OR placeholder dates
    if (!p.first_reported_date) return true
    const d = new Date(p.first_reported_date)
    const m = d.getUTCMonth() + 1
    const dd = d.getUTCDate()
    return (m === 1 && dd === 1) || (m === 5 && dd === 1) || (m === 3 && dd === 8) || (m === 12 && dd === 12)
  })

  const results: RepairResult[] = []

  for (const p of eligible) {
    const r = await extractDate(p)
    const result: RepairResult = {
      id: p.id,
      slug: p.slug,
      name: p.name,
      before: p.first_reported_date,
      proposed: r.value,
      precision: r.precision,
      reason: r.reason,
    }
    results.push(result)

    if (!dryRun && r.precision !== 'error' && r.value !== p.first_reported_date) {
      // Write the new date (or NULL when precision is 'unknown' / 'year').
      const newValue = r.value
      const { error: upErr } = await (supabase.from('phenomena') as any)
        .update({ first_reported_date: newValue })
        .eq('id', p.id)
      if (upErr) {
        result.reason = 'update_error: ' + upErr.message
        result.precision = 'error'
      }
    }
  }

  const summary = {
    scanned: rows?.length || 0,
    eligible: eligible.length,
    repaired: results.filter(r => r.precision === 'day' || r.precision === 'month').length,
    nullified: results.filter(r => r.precision === 'unknown' || r.precision === 'year').length,
    errors: results.filter(r => r.precision === 'error').length,
    dryRun,
    nextOffset: offset + limit,
  }

  return res.status(200).json({ summary, results })
}

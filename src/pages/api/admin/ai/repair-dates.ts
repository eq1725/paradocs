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
  // Try to pull a JSON blob out
  let json: any = null
  try {
    json = JSON.parse(raw.trim())
  } catch (_) {
    // Try to extract the first {...} block
    const m = raw.match(/\{[^}]+\}/)
    if (m) {
      try { json = JSON.parse(m[0]) } catch (_) {}
    }
  }
  if (!json || typeof json.date !== 'string') return { value: null, precision: 'error' }
  const date = json.date.trim()
  if (date === 'unknown') return { value: null, precision: 'unknown' }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return { value: date, precision: 'day' }
  // YYYY-MM → set to mid-month conservatively. Mid-month avoids surfacing
  // on the 1st (which is a placeholder magnet) while still being roughly
  // accurate.
  if (/^\d{4}-\d{2}$/.test(date)) return { value: date + '-15', precision: 'month' }
  // YYYY
  if (/^\d{4}$/.test(date)) return { value: null, precision: 'year' }
  return { value: null, precision: 'error' }
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
      max_tokens: 60,
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
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (onlyPlaceholders) {
    // Filter to phenomena whose date looks like a Jan 1 / May 1 placeholder.
    // Supabase doesn't support EXTRACT in .filter(), so we fetch all matching
    // status=active and filter client-side. For batches of 50–100, fine.
  }

  const { data: rows, error } = await query
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const eligible = (rows || []).filter((p: any) => {
    if (!p.ai_quick_facts && !p.ai_history) return false
    if (force) return true
    if (onlyPlaceholders) {
      if (!p.first_reported_date) return false
      const d = new Date(p.first_reported_date)
      const m = d.getUTCMonth() + 1
      const dd = d.getUTCDate()
      return (m === 1 && dd === 1) || (m === 5 && dd === 1)
    }
    // Default mode: only repair rows with no date OR placeholder dates
    if (!p.first_reported_date) return true
    const d = new Date(p.first_reported_date)
    const m = d.getUTCMonth() + 1
    const dd = d.getUTCDate()
    return (m === 1 && dd === 1) || (m === 5 && dd === 1)
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

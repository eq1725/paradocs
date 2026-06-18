/**
 * GET /api/discover/on-this-date — Historical events matching today's date.
 *
 * Returns phenomena with first_reported_date matching today's month/day.
 * Starts with phenomena only (reliable dates). Reports added later
 * after event_date_precision quality is verified.
 *
 * Cached 24 hours (only changes daily).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var supabase = getSupabase()
    var now = new Date()
    var month = now.getMonth() + 1 // JS months 0-indexed
    var day = now.getDate()

    // V9.0.1 — Honor active category filter from the Today feed. Without
    // this, the on-this-date card injection at position 1 could inject
    // a Lucid Dreaming entry while the user is filtering Cryptids,
    // breaking the topic-filter contract.
    var categoryFilter = (req.query && (req.query.category as string)) || null

    // Query phenomena where first_reported_date matches today's month/day
    // Supabase doesn't support EXTRACT in .filter(), so we fetch all with dates
    // and filter in JS. For a small table (phenomena), this is fine.
    var phenQuery = supabase
      .from('phenomena')
      .select('id, name, slug, category, ai_summary, first_reported_date, ai_quick_facts')
      .eq('status', 'active')
      .not('first_reported_date', 'is', null)
      .not('ai_summary', 'is', null)

    if (categoryFilter) phenQuery = phenQuery.eq('category', categoryFilter)

    var { data: phenomena, error } = await phenQuery

    if (error) {
      console.error('[OnThisDate] Query error:', error)
      return res.status(500).json({ error: 'Query failed' })
    }

    // V6.1 panel review fix: data audit revealed ~270 placeholder dates
    // (Jan 1, May 1, March 8, December 12) plus pervasive use of row-
    // creation timestamps as first_reported_date. The AI-generated text
    // in ai_quick_facts.first_documented is the authoritative source.
    //
    // New strategy: try to parse a real date out of ai_quick_facts.first_documented
    // FIRST. If that yields a day-precision date, use it. If it yields only
    // a year, skip (year-only doesn't surface on a specific day). Only fall
    // back to first_reported_date when AI text is missing AND the date
    // column doesn't look like a placeholder.
    var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']
    var parseAiDate = function (text: string): { month: number, day: number, year: number } | null {
      if (!text) return null
      var lower = text.toLowerCase()
      // Try "Month Day, YYYY" pattern first (e.g. "July 22, 1933")
      for (var i = 0; i < MONTHS.length; i++) {
        var pattern = new RegExp('\\b' + MONTHS[i] + '\\s+(\\d{1,2}),?\\s+(\\d{3,4})\\b', 'i')
        var m = lower.match(pattern)
        if (m) {
          return { month: i + 1, day: parseInt(m[1], 10), year: parseInt(m[2], 10) }
        }
      }
      // ISO format like "1933-07-22" inside text
      var iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
      if (iso) {
        return { year: parseInt(iso[1], 10), month: parseInt(iso[2], 10), day: parseInt(iso[3], 10) }
      }
      return null
    }
    var isPlaceholderDate = function (d: Date): boolean {
      var m = d.getUTCMonth() + 1
      var dd = d.getUTCDate()
      if (m === 1 && dd === 1) return true
      if (m === 5 && dd === 1) return true
      // March 8 / December 12 batch placeholders identified in audit
      if (m === 3 && dd === 8) return true
      if (m === 12 && dd === 12) return true
      return false
    }

    var matches = (phenomena || []).filter(function (p) {
      // Try AI-text-derived date first
      var qf = p.ai_quick_facts
      var aiText = (qf && typeof qf === 'object') ? (qf.first_documented || '') : ''
      var aiDate = parseAiDate(aiText)
      if (aiDate) {
        // AI text has a real day-precision date — use it
        if (aiDate.month === month && aiDate.day === day) {
          ;(p as any)._eventYear = aiDate.year
          ;(p as any)._eventDate = aiDate.year + '-' + String(aiDate.month).padStart(2, '0') + '-' + String(aiDate.day).padStart(2, '0')
          return true
        }
        // AI text has a date but it's not today — skip
        return false
      }
      // No AI date parseable. Fall back to first_reported_date IF it's not
      // a known placeholder.
      try {
        var d = new Date(p.first_reported_date)
        if (isPlaceholderDate(d)) return false
        if ((d.getUTCMonth() + 1) !== month || d.getUTCDate() !== day) return false
        ;(p as any)._eventYear = d.getUTCFullYear()
        ;(p as any)._eventDate = p.first_reported_date
        return true
      } catch (e) {
        return false
      }
    }).map(function (p) {
      // _eventYear / _eventDate were attached during the filter pass —
      // prefer them since they're already validated against AI text.
      var eventYear = (p as any)._eventYear || new Date(p.first_reported_date).getFullYear()
      var eventDate = (p as any)._eventDate || p.first_reported_date
      return {
        item_type: 'on_this_date',
        kind: 'phenomenon',
        id: 'otd-' + p.id,
        name: p.name,
        slug: p.slug,
        href: '/phenomena/' + p.slug,
        category: p.category,
        ai_summary: p.ai_summary,
        event_year: eventYear,
        first_reported_date: eventDate,
      }
    })

    // V11.18.59 — Reliability: phenomena matching today's exact MM-DD are rare
    // (most days = 0), so the card almost never appeared. Fall back to approved
    // REPORTS whose event_date is exactly today's MM-DD in any year — these exist
    // for virtually every calendar day, so the card now shows daily. Phenomena
    // still lead when present; reports fill otherwise.
    if (matches.length === 0) {
      var pad = function (n: number) { return String(n).padStart(2, '0') }
      var mmdd = '-' + pad(month) + '-' + pad(day)
      var dates: string[] = []
      for (var yr = 1800; yr <= now.getFullYear(); yr++) dates.push(yr + mmdd)
      var repQuery: any = supabase
        .from('reports')
        .select('id, slug, title, category, summary, paradocs_narrative, event_date, event_date_precision')
        .eq('status', 'approved')
        .eq('event_date_precision', 'exact')
        .in('event_date', dates)
        .order('event_date', { ascending: true })
        .limit(8)
      if (categoryFilter) repQuery = repQuery.eq('category', categoryFilter)
      var repRes: any = await repQuery
      var repItems = ((repRes && repRes.data) || []).map(function (r: any) {
        var narrative = String(r.paradocs_narrative || r.summary || '')
        var summary = narrative.length > 320 ? narrative.slice(0, 317).replace(/\s+\S*$/, '') + '…' : narrative
        var d = new Date(r.event_date)
        return {
          item_type: 'on_this_date',
          kind: 'report',
          id: 'otd-r-' + r.id,
          name: r.title,
          slug: r.slug,
          href: '/report/' + r.slug,
          category: r.category,
          ai_summary: summary,
          event_year: d.getUTCFullYear(),
          first_reported_date: r.event_date,
        }
      })
      for (var ri = 0; ri < repItems.length; ri++) matches.push(repItems[ri])
    }

    // Sort by year ascending (oldest first)
    matches.sort(function (a, b) { return a.event_year - b.event_year })

    // Cache 24 hours
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800')

    return res.status(200).json({ items: matches })
  } catch (error) {
    console.error('[OnThisDate] Error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}

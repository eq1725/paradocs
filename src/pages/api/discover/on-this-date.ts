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

    // Query phenomena where first_reported_date matches today's month/day
    // Supabase doesn't support EXTRACT in .filter(), so we fetch all with dates
    // and filter in JS. For a small table (phenomena), this is fine.
    var { data: phenomena, error } = await supabase
      .from('phenomena')
      .select('id, name, slug, category, ai_summary, first_reported_date, ai_quick_facts')
      .eq('status', 'active')
      .not('first_reported_date', 'is', null)
      .not('ai_summary', 'is', null)

    if (error) {
      console.error('[OnThisDate] Query error:', error)
      return res.status(500).json({ error: 'Query failed' })
    }

    // V6 panel review fix: filter out known placeholder dates.
    // Many phenomena have first_reported_date set to 1900-01-01 or
    // 1933-05-01 — placeholders from ingestion that surface incorrectly
    // on Jan 1 / May 1. Loch Ness is the canonical example: ai_history
    // and ai_quick_facts.first_documented correctly say "July 22, 1933"
    // but the date column says 1933-05-01.
    var looksLikePlaceholder = function (p: any): boolean {
      try {
        var d = new Date(p.first_reported_date)
        var m = d.getMonth() + 1
        var dd = d.getDate()
        if (m === 1 && dd === 1) return true
        if (m === 5 && dd === 1) return true
        var qf = p.ai_quick_facts
        if (qf && typeof qf === 'object') {
          var doc = (qf.first_documented || '').toString().toLowerCase()
          if (doc) {
            var months = ['january','february','march','april','may','june','july','august','september','october','november','december']
            for (var i = 0; i < months.length; i++) {
              if (doc.indexOf(months[i]) !== -1 && (i + 1) !== m) {
                return true
              }
            }
          }
        }
        return false
      } catch (e) {
        return true
      }
    }

    var matches = (phenomena || []).filter(function (p) {
      try {
        var d = new Date(p.first_reported_date)
        if ((d.getMonth() + 1) !== month || d.getDate() !== day) return false
        if (looksLikePlaceholder(p)) return false
        return true
      } catch (e) {
        return false
      }
    }).map(function (p) {
      var eventYear = new Date(p.first_reported_date).getFullYear()
      return {
        item_type: 'on_this_date',
        id: 'otd-' + p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        ai_summary: p.ai_summary,
        event_year: eventYear,
        first_reported_date: p.first_reported_date,
      }
    })

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

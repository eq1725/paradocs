/**
 * Backfill phenomenon_type_id for reports that are linked to phenomena
 * via report_phenomena but don't have phenomenon_type_id set.
 *
 * This uses the existing report_phenomena junction table data
 * (populated by the ingestion pipeline's pattern matcher) to set
 * phenomenon_type_id = the highest-confidence linked phenomenon.
 *
 * For reports with NO report_phenomena links, falls back to lightweight
 * pattern matching against phenomena names/aliases.
 *
 * POST /api/admin/backfill-phenomenon-types
 * Query params:
 *   limit - max reports to process (default 500)
 *   dry_run - if "true", don't write, just report what would change
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = getSupabaseAdmin()
  var limit = Math.min(parseInt(req.query.limit as string) || 500, 2000)
  var dryRun = req.query.dry_run === 'true'

  // Step 1: Get reports that have NO phenomenon_type_id
  var { data: reportsWithout, error: fetchErr } = await supabase
    .from('reports')
    .select('id, title, category, summary')
    .is('phenomenon_type_id', null)
    .in('status', ['approved', 'pending_review'])
    .limit(limit)

  if (fetchErr || !reportsWithout) {
    return res.status(500).json({ error: 'Failed to fetch reports', details: fetchErr })
  }

  if (reportsWithout.length === 0) {
    return res.status(200).json({ message: 'All reports already have phenomenon_type_id', updated: 0 })
  }

  var reportIds = reportsWithout.map(function(r) { return r.id })

  // Step 2: Check report_phenomena links for these reports
  var { data: existingLinks } = await supabase
    .from('report_phenomena')
    .select('report_id, phenomenon_id, confidence')
    .in('report_id', reportIds)
    .order('confidence', { ascending: false })

  // Build map: report_id -> best phenomenon_id
  var bestLinks: Record<string, { phenomenon_id: string; confidence: number }> = {}
  if (existingLinks) {
    existingLinks.forEach(function(link) {
      if (!bestLinks[link.report_id] || link.confidence > bestLinks[link.report_id].confidence) {
        bestLinks[link.report_id] = {
          phenomenon_id: link.phenomenon_id,
          confidence: link.confidence
        }
      }
    })
  }

  // Step 3: For reports without links, do pattern matching against phenomena
  var { data: allPhenomena } = await supabase
    .from('phenomena')
    .select('id, name, slug, aliases, category')

  if (!allPhenomena) {
    return res.status(500).json({ error: 'Failed to fetch phenomena' })
  }

  // Build patterns from phenomenon names and aliases
  var patterns: { id: string; terms: string[]; category: string }[] = allPhenomena.map(function(p) {
    var terms = [p.name.toLowerCase()]
    if (p.aliases && Array.isArray(p.aliases)) {
      p.aliases.forEach(function(a: string) { terms.push(a.toLowerCase()) })
    }
    return { id: p.id, terms: terms, category: p.category }
  })

  var updatedFromLinks = 0
  var updatedFromPatterns = 0
  var unmatched = 0
  var errors = 0

  for (var i = 0; i < reportsWithout.length; i++) {
    var report = reportsWithout[i]

    // Try existing junction table link first
    if (bestLinks[report.id]) {
      if (!dryRun) {
        var { error: updateErr } = await supabase
          .from('reports')
          .update({ phenomenon_type_id: bestLinks[report.id].phenomenon_id })
          .eq('id', report.id)

        if (updateErr) { errors++; continue }
      }
      updatedFromLinks++
      continue
    }

    // Fall back to pattern matching
    var searchText = [report.title || '', report.summary || ''].join(' ').toLowerCase()
    var bestMatch: { id: string; confidence: number } | null = null

    for (var j = 0; j < patterns.length; j++) {
      var p = patterns[j]
      for (var k = 0; k < p.terms.length; k++) {
        var term = p.terms[k]
        if (term.length < 3) continue
        try {
          var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          var regex = new RegExp('\\b' + escaped + '\\b', 'i')
          if (regex.test(searchText)) {
            var conf = 0.6
            if (regex.test((report.title || '').toLowerCase())) conf = 0.8
            // Category alignment bonus
            if (report.category && p.category && report.category === p.category) conf = Math.min(conf + 0.1, 0.95)
            if (!bestMatch || conf > bestMatch.confidence) {
              bestMatch = { id: p.id, confidence: conf }
            }
            break
          }
        } catch (e) {
          // Skip invalid regex patterns
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.6) {
      if (!dryRun) {
        var { error: updateErr2 } = await supabase
          .from('reports')
          .update({ phenomenon_type_id: bestMatch.id })
          .eq('id', report.id)

        if (updateErr2) { errors++; continue }

        // Also insert the link into report_phenomena for future consistency
        await supabase
          .from('report_phenomena')
          .upsert({
            report_id: report.id,
            phenomenon_id: bestMatch.id,
            confidence: bestMatch.confidence,
            tagged_by: 'backfill',
          }, {
            onConflict: 'report_id,phenomenon_id',
            ignoreDuplicates: true,
          })
      }
      updatedFromPatterns++
    } else {
      unmatched++
    }
  }

  return res.status(200).json({
    dry_run: dryRun,
    total_without_type: reportsWithout.length,
    updated_from_links: updatedFromLinks,
    updated_from_patterns: updatedFromPatterns,
    unmatched: unmatched,
    errors: errors,
  })
}

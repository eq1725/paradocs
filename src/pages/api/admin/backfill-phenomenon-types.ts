/**
 * Backfill phenomenon_type_id for reports that don't have one set.
 *
 * IMPORTANT: reports.phenomenon_type_id references the `phenomenon_types`
 * table (24 seeded classification types like "UFO Sighting", "Apparition").
 * NOT the `phenomena` table (encyclopedia entries like "Phoenix Lights").
 *
 * Strategy:
 * 1. For reports linked to phenomena via report_phenomena, look up that
 *    phenomenon's own phenomenon_type_id and assign it to the report.
 * 2. For unlinked reports, pattern-match against phenomenon_types names
 *    and the report's category to find the best classification.
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

// Map from report category enum to phenomenon_types category enum
// Reports use categories like 'ghosts_hauntings', phenomenon_types use 'ghost_haunting'
var CATEGORY_MAP: Record<string, string> = {
  ufos_aliens: 'ufo_uap',
  cryptids: 'cryptid',
  ghosts_hauntings: 'ghost_haunting',
  psychic_phenomena: 'psychic_paranormal',
  consciousness_practices: 'psychic_paranormal',
  psychological_experiences: 'unexplained_event',
  biological_factors: 'unexplained_event',
  perception_sensory: 'psychic_paranormal',
  religion_mythology: 'unexplained_event',
  esoteric_practices: 'psychic_paranormal',
  combination: 'other',
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

  // Step 2: Get the phenomenon_types table (the 24 classification types)
  var { data: phenomenonTypes } = await supabase
    .from('phenomenon_types')
    .select('id, name, slug, category, description')

  if (!phenomenonTypes || phenomenonTypes.length === 0) {
    return res.status(500).json({ error: 'No phenomenon_types found in database' })
  }

  // Step 3: Check report_phenomena links, and resolve each phenomenon's
  // phenomenon_type_id to get a valid FK for the report
  var { data: existingLinks } = await supabase
    .from('report_phenomena')
    .select('report_id, phenomenon_id, confidence')
    .in('report_id', reportIds)
    .order('confidence', { ascending: false })

  // Get the phenomena records to find their phenomenon_type_id
  var linkedPhenomenonIds: string[] = []
  if (existingLinks && existingLinks.length > 0) {
    linkedPhenomenonIds = Array.from(new Set(existingLinks.map(function(l) { return l.phenomenon_id })))
  }

  var phenomenaTypeMap: Record<string, string> = {} // phenomena.id -> phenomenon_types.id
  if (linkedPhenomenonIds.length > 0) {
    var { data: linkedPhenomena } = await supabase
      .from('phenomena')
      .select('id, phenomenon_type_id, category')
      .in('id', linkedPhenomenonIds)

    if (linkedPhenomena) {
      linkedPhenomena.forEach(function(p) {
        if (p.phenomenon_type_id) {
          phenomenaTypeMap[p.id] = p.phenomenon_type_id
        }
      })
    }
  }

  // Build map: report_id -> best phenomenon_type_id (from junction table)
  var bestLinksToType: Record<string, string> = {}
  if (existingLinks) {
    // Group by report, pick highest confidence that has a valid type mapping
    var linksByReport: Record<string, Array<{ phenomenon_id: string; confidence: number }>> = {}
    existingLinks.forEach(function(link) {
      if (!linksByReport[link.report_id]) linksByReport[link.report_id] = []
      linksByReport[link.report_id].push(link)
    })

    Object.keys(linksByReport).forEach(function(reportId) {
      var links = linksByReport[reportId]
      // Sort by confidence desc (already ordered but be safe)
      links.sort(function(a, b) { return b.confidence - a.confidence })
      for (var idx = 0; idx < links.length; idx++) {
        var typeId = phenomenaTypeMap[links[idx].phenomenon_id]
        if (typeId) {
          bestLinksToType[reportId] = typeId
          break
        }
      }
    })
  }

  // Step 4: Build pattern matching against phenomenon_types for unlinked reports
  // Keywords that indicate each type
  var typePatterns: Array<{ id: string; terms: string[]; category: string }> = phenomenonTypes.map(function(pt) {
    var terms = [pt.name.toLowerCase()]
    // Add common aliases/keywords for each type
    var slug = pt.slug || ''
    if (slug) terms.push(slug.replace(/-/g, ' '))
    // Add words from description
    if (pt.description) {
      var descWords = pt.description.toLowerCase().split(/\s+/).filter(function(w: string) { return w.length > 4 })
      descWords.forEach(function(w: string) { terms.push(w) })
    }
    return { id: pt.id, terms: terms, category: pt.category }
  })

  // Also build a simple category -> default type mapping (fallback)
  var categoryDefaults: Record<string, string> = {}
  phenomenonTypes.forEach(function(pt) {
    // Use the first type in each category as default
    if (!categoryDefaults[pt.category]) {
      categoryDefaults[pt.category] = pt.id
    }
  })

  var updatedFromLinks = 0
  var updatedFromPatterns = 0
  var updatedFromCategory = 0
  var unmatched = 0
  var errors = 0
  var sampleErrors: string[] = []

  for (var i = 0; i < reportsWithout.length; i++) {
    var report = reportsWithout[i]
    var assignedTypeId: string | null = null

    // Priority 1: From junction table link -> phenomenon -> phenomenon_type_id
    if (bestLinksToType[report.id]) {
      assignedTypeId = bestLinksToType[report.id]
      if (!dryRun) {
        var { error: err1 } = await supabase
          .from('reports')
          .update({ phenomenon_type_id: assignedTypeId })
          .eq('id', report.id)
        if (err1) {
          errors++
          if (sampleErrors.length < 3) sampleErrors.push(err1.message || JSON.stringify(err1))
          continue
        }
      }
      updatedFromLinks++
      continue
    }

    // Priority 2: Pattern match report title/summary against phenomenon_types
    var searchText = [report.title || '', report.summary || ''].join(' ').toLowerCase()
    var bestMatch: { id: string; score: number } | null = null

    for (var j = 0; j < typePatterns.length; j++) {
      var tp = typePatterns[j]
      for (var k = 0; k < tp.terms.length; k++) {
        var term = tp.terms[k]
        if (term.length < 3) continue
        try {
          var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          var regex = new RegExp('\\b' + escaped + '\\b', 'i')
          if (regex.test(searchText)) {
            var score = 0.6
            if (regex.test((report.title || '').toLowerCase())) score = 0.8
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { id: tp.id, score: score }
            }
            break
          }
        } catch (e) {
          // skip
        }
      }
    }

    if (bestMatch) {
      assignedTypeId = bestMatch.id
      if (!dryRun) {
        var { error: err2 } = await supabase
          .from('reports')
          .update({ phenomenon_type_id: assignedTypeId })
          .eq('id', report.id)
        if (err2) {
          errors++
          if (sampleErrors.length < 3) sampleErrors.push(err2.message || JSON.stringify(err2))
          continue
        }
      }
      updatedFromPatterns++
      continue
    }

    // Priority 3: Fall back to category default
    var mappedCategory = CATEGORY_MAP[report.category] || report.category
    var defaultTypeId = categoryDefaults[mappedCategory]
    if (defaultTypeId) {
      assignedTypeId = defaultTypeId
      if (!dryRun) {
        var { error: err3 } = await supabase
          .from('reports')
          .update({ phenomenon_type_id: assignedTypeId })
          .eq('id', report.id)
        if (err3) {
          errors++
          if (sampleErrors.length < 3) sampleErrors.push(err3.message || JSON.stringify(err3))
          continue
        }
      }
      updatedFromCategory++
      continue
    }

    unmatched++
  }

  return res.status(200).json({
    dry_run: dryRun,
    total_without_type: reportsWithout.length,
    updated_from_links: updatedFromLinks,
    updated_from_patterns: updatedFromPatterns,
    updated_from_category: updatedFromCategory,
    unmatched: unmatched,
    errors: errors,
    sample_errors: sampleErrors,
  })
}

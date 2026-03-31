/**
 * Backfill phenomenon_type_id for reports using smart keyword rules.
 *
 * reports.phenomenon_type_id FK -> phenomenon_types table.
 *
 * Uses title + category to classify each report into the correct type.
 * Priority: title keywords > category-based defaults.
 *
 * POST /api/admin/backfill-phenomenon-types
 * Query params:
 *   limit    - max reports (default 500)
 *   dry_run  - "true" to preview without writing
 *   reset    - "true" to clear ALL phenomenon_type_id first, then reclassify
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Title-based classification rules.
 * Each rule: { slugs: phenomenon_type slugs to match, patterns: regexes to test against title+summary }
 * Rules are checked in order — first match wins. Put specific rules before generic ones.
 */
/**
 * Classification rules using ACTUAL DB slugs from phenomenon_types table.
 * Rules checked in order — first match wins. Specific before generic.
 */
var CLASSIFICATION_RULES: Array<{ slug: string; patterns: RegExp[]; categoryGuard?: string[] }> = [
  // ── Cryptids (specific before generic) ──
  { slug: 'bigfoot', patterns: [/bigfoot/i, /sasquatch/i, /bfro/i, /large.*(bipedal|ape|primate)/i, /wood.?ape/i] },
  { slug: 'mothman', patterns: [/mothman/i] },
  { slug: 'chupacabra', patterns: [/chupacabra/i] },
  { slug: 'thunderbird', patterns: [/thunderbird/i] },
  { slug: 'dogman', patterns: [/dogman/i, /werewolf/i, /wolf.?man/i] },
  { slug: 'lake-monster', patterns: [/lake.?monster/i, /sea.?serpent/i, /nessie/i, /loch.?ness/i] },
  { slug: 'cryptid-eyewitness', patterns: [/cryptid/i, /unknown.*(creature|animal)/i, /strange.*(creature|animal)/i], categoryGuard: ['cryptids'] },

  // ── Ghosts/Hauntings ──
  { slug: 'poltergeist', patterns: [/poltergeist/i, /objects?.*(moving|thrown|flying)/i] },
  { slug: 'shadow-person', patterns: [/shadow.?(person|people|figure|man|being)/i] },
  { slug: 'evp', patterns: [/\bevp\b/i, /electronic.?voice/i, /disembodied.?voice/i] },
  { slug: 'apparition', patterns: [/apparition/i, /ghost/i, /spirit/i, /phantom/i, /spectral/i], categoryGuard: ['ghosts_hauntings'] },
  { slug: 'intelligent-haunting', patterns: [/haunted/i, /haunt/i], categoryGuard: ['ghosts_hauntings'] },

  // ── NDEs / OBEs (before generic psychic) ──
  { slug: 'nde', patterns: [/near.?death/i, /\bnde\b/i, /died.*(came|returned)/i, /clinical.?death/i, /flatlined/i] },
  { slug: 'obe', patterns: [/out.?of.?body/i, /\bobe\b/i, /astral.?project/i] },
  { slug: 'astral-projection', patterns: [/astral/i] },
  { slug: 'past-life-memory', patterns: [/past.?life/i, /reincarnation/i, /previous.?life/i] },
  { slug: 'time-slip', patterns: [/time.?slip/i, /temporal.?anomal/i, /glitch.?in/i] },

  // ── Psychic phenomena ──
  { slug: 'precognition', patterns: [/precognition/i, /premonition/i, /prophetic/i] },
  { slug: 'premonition-dream', patterns: [/premonition.*dream/i, /prophetic.*dream/i, /dream.*came.*true/i] },
  { slug: 'telepathy', patterns: [/telepathy/i, /telepathic/i, /mind.?read/i] },
  { slug: 'remote-viewing', patterns: [/remote.?view/i] },
  { slug: 'clairvoyance', patterns: [/clairvoyant/i, /clairvoyance/i] },

  // ── UFO subtypes (specific before generic) ──
  { slug: 'nhi-contact', patterns: [/abduct/i, /taken.*(aboard|ship|craft)/i, /alien.?(contact|encounter)/i, /entity.?(contact|encounter)/i, /being.?encounter/i] },
  { slug: 'uso', patterns: [/\buso\b/i, /underwater.*object/i, /submerged.*object/i] },
  { slug: 'mass-sighting', patterns: [/mass.*sighting/i, /multiple.*witness/i, /many.*saw/i] },
  { slug: 'notable-ufo-case', patterns: [/roswell/i, /phoenix.?lights/i, /rendlesham/i, /flatwoods/i, /kecksburg/i, /incident/i, /case/i] },
  { slug: 'historical-ufo-sighting', patterns: [/nuremberg/i, /puget.?sound/i, /cape.?girardeau/i, /\b1[89]\d{2}\b/], categoryGuard: ['ufos_aliens'] },
  // Generic UFO sighting (ce-1) — catches all remaining UFO/UAP reports
  { slug: 'ce-1', patterns: [/\bufo\b/i, /\buap\b/i, /\borb\b/i, /unidentified.*object/i, /flying.*object/i, /strange.?light/i, /luminous/i, /pulsating/i, /hovering/i, /silent.?craft/i, /black.?triangle/i, /caught.?on.?camera/i, /high.?speed/i, /craft/i, /sighting/i, /object/i, /lights/i], categoryGuard: ['ufos_aliens'] },

  // ── Religion/Mythology ──
  { slug: 'angel-encounter', patterns: [/angel/i] },
  { slug: 'demonic-encounter', patterns: [/demon/i, /demonic/i, /possession/i] },
  { slug: 'mystical-experience', patterns: [/mystical/i, /divine/i, /spiritual.*experience/i, /afterlife/i, /after.*death/i] },

  // ── Perception/Sensory ──
  { slug: 'infrasound-effect', patterns: [/infrasound/i] },
  { slug: 'emf-sensitivity', patterns: [/\bemf\b/i, /electromagnetic/i] },
  { slug: 'hypnagogic', patterns: [/hypnagog/i, /sleep.?paralysis/i] },

  // ── Esoteric ──
  { slug: 'ley-line', patterns: [/ley.?line/i] },
]

/**
 * Category-based default type mapping (last resort fallback).
 * Uses ACTUAL DB slugs.
 */
var CATEGORY_DEFAULTS: Record<string, string> = {
  ufos_aliens: 'ce-1',
  cryptids: 'other-cryptid',
  ghosts_hauntings: 'apparition',
  psychic_phenomena: 'precognition',
  consciousness_practices: 'meditation-experience',
  psychological_experiences: 'nde',
  biological_factors: 'psychophysiological',
  perception_sensory: 'anomalous-perception',
  religion_mythology: 'mystical-experience',
  esoteric_practices: 'occult-phenomenon',
  combination: 'multi-phenomena',
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = getSupabaseAdmin()
  var limit = Math.min(parseInt(req.query.limit as string) || 500, 2000)
  var dryRun = req.query.dry_run === 'true'
  var reset = req.query.reset === 'true'

  // Step 1: If reset mode, clear all phenomenon_type_id values first
  if (reset && !dryRun) {
    await supabase
      .from('reports')
      .update({ phenomenon_type_id: null })
      .not('phenomenon_type_id', 'is', null)
  }

  // Step 2: Get phenomenon_types and build slug -> id map
  var { data: phenomenonTypes } = await supabase
    .from('phenomenon_types')
    .select('id, name, slug, category')

  if (!phenomenonTypes || phenomenonTypes.length === 0) {
    return res.status(500).json({ error: 'No phenomenon_types found' })
  }

  var slugToId: Record<string, string> = {}
  var slugToName: Record<string, string> = {}
  phenomenonTypes.forEach(function(pt) {
    slugToId[pt.slug] = pt.id
    slugToName[pt.slug] = pt.name
  })

  // Step 3: Get reports that need classification
  var { data: reports, error: fetchErr } = await supabase
    .from('reports')
    .select('id, title, category, summary')
    .is('phenomenon_type_id', null)
    .in('status', ['approved', 'pending_review'])
    .limit(limit)

  if (fetchErr || !reports) {
    return res.status(500).json({ error: 'Failed to fetch reports', details: fetchErr })
  }

  if (reports.length === 0) {
    return res.status(200).json({ message: 'All reports already classified', updated: 0, reset: reset })
  }

  // Step 4: Classify each report
  var updated = 0
  var byType: Record<string, number> = {}
  var unmatched = 0
  var unmatchedSamples: string[] = []
  var errors = 0
  var sampleErrors: string[] = []
  var debugInfo: string[] = []

  // Log available slugs for debugging
  var availableSlugs = Object.keys(slugToId)
  debugInfo.push('available_slugs: ' + availableSlugs.join(', '))
  debugInfo.push('available_categories: ' + Object.keys(CATEGORY_DEFAULTS).join(', '))

  function classifyReport(title: string, summary: string, category: string): string | null {
    var searchText = (title || '') + ' ' + (summary || '')

    // Try classification rules in priority order
    for (var r = 0; r < CLASSIFICATION_RULES.length; r++) {
      var rule = CLASSIFICATION_RULES[r]

      // Category guard: skip rule if report category doesn't match
      // UNLESS the first (most specific) pattern matches the title directly
      if (rule.categoryGuard) {
        var guardMatches = false
        for (var c = 0; c < rule.categoryGuard.length; c++) {
          if (category === rule.categoryGuard[c]) { guardMatches = true; break }
        }
        if (!guardMatches) {
          if (!rule.patterns[0].test(title || '')) continue
        }
      }

      // Check all patterns against full text
      for (var p = 0; p < rule.patterns.length; p++) {
        if (rule.patterns[p].test(searchText)) {
          return rule.slug
        }
      }
    }

    // Fallback: category default
    return CATEGORY_DEFAULTS[category] || null
  }

  for (var i = 0; i < reports.length; i++) {
    var report = reports[i]
    var matchedSlug = classifyReport(report.title, report.summary, report.category)

    if (matchedSlug && slugToId[matchedSlug]) {
      if (!dryRun) {
        var { error: updateErr } = await supabase
          .from('reports')
          .update({ phenomenon_type_id: slugToId[matchedSlug] })
          .eq('id', report.id)

        if (updateErr) {
          errors++
          if (sampleErrors.length < 5) sampleErrors.push(updateErr.message + ' | slug=' + matchedSlug)
          continue
        }
      }
      updated++
      var displayName = slugToName[matchedSlug] || matchedSlug
      byType[displayName] = (byType[displayName] || 0) + 1
    } else {
      unmatched++
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push((report.title || '').substring(0, 60) + ' [cat=' + report.category + '] [slug=' + (matchedSlug || 'none') + ']')
      }
    }
  }

  return res.status(200).json({
    dry_run: dryRun,
    reset: reset,
    total_reports: reports.length,
    updated: updated,
    by_type: byType,
    unmatched: unmatched,
    unmatched_samples: unmatchedSamples,
    errors: errors,
    sample_errors: sampleErrors,
    debug: debugInfo,
  })
}

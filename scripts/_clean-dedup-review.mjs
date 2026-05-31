#!/usr/bin/env node
/**
 * V11.17.57.1 — One-off cleanup of docs/PHEN_DEDUP_REVIEW.json based
 * on operator's approved edits. Produces docs/PHEN_DEDUP_APPROVED.json
 * for the apply script.
 *
 * Edits applied per operator review:
 *   - Drop 5 clusters where Haiku itself admitted the merge was wrong
 *     or the entities are distinct (NDE/NDE-like, Spiritual Awakening,
 *     DPDR/Ego Death, Demonic Possession/Exorcism, Noppera-bo/Dalgyal,
 *     Phantom Armies/Phantom Soldier).
 *   - Drop overlapping/contradictory clusters in esoteric_practices
 *     (sympathetic-magic in 3 different roles) and ghosts_hauntings
 *     (bound-spirit ↔ trapped-spirit reciprocal pair), replace with
 *     correct merged clusters.
 *   - Flip Full Body Apparition cluster so apparition (broader) is
 *     the canonical instead of full-body-apparition (specific).
 *   - Drop all rename entries where proposed_name == current_name
 *     ("no rename needed" filler from Haiku).
 *
 * Usage:
 *   node scripts/_clean-dedup-review.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'

const IN = 'docs/PHEN_DEDUP_REVIEW.json'
const OUT = 'docs/PHEN_DEDUP_APPROVED.json'

// Clusters to drop — identified by canonical_slug + member_slugs match
// to disambiguate when the same canonical appears in multiple clusters.
const REJECTED_CLUSTERS = [
  // (canonical, members[]) — match by canonical + first-member
  { canonical_slug: 'sympathetic-magic', drop_reason: 'replaced by merged sympathetic-magic cluster below' },
  { canonical_slug: 'voodoo-dolls', drop_reason: 'wrong direction; sympathetic-magic should absorb voodoo-dolls' },
  { canonical_slug: 'candle-magic', drop_reason: 'replaced by merged sympathetic-magic cluster below' },
  { canonical_slug: 'bound-spirit', drop_reason: 'wrong direction; trapped-spirit should be canonical' },
  { canonical_slug: 'phantom-armies', drop_reason: 'Haiku itself said keep separate' },
  { canonical_slug: 'noppera-bo', drop_reason: 'Haiku itself said keep separate (distinct cultural entities)' },
  { canonical_slug: 'full-body-apparition', drop_reason: 'wrong direction; apparition should be canonical' },
  { canonical_slug: 'near-death-experience', drop_reason: 'Haiku itself said do not cluster (NDE-like is distinct)' },
  { canonical_slug: 'spiritual-awakening', drop_reason: 'Haiku itself said do not cluster (awakening vs crisis are distinct)' },
  { canonical_slug: 'depersonalization-derealization', drop_reason: 'Haiku itself said related but not the same' },
  { canonical_slug: 'demonic-possession', drop_reason: 'possession (phenomenon) ≠ exorcism (ritual response)' },
]

// Clusters to ADD (replacements for the dropped overlapping ones).
const REPLACEMENT_CLUSTERS = {
  esoteric_practices: [
    {
      canonical_slug: 'sympathetic-magic',
      canonical_name: 'Sympathetic Magic',
      member_slugs: ['sympathetic-magic', 'candle-magic', 'voodoo-dolls'],
      rationale: 'Operator review: sympathetic-magic is the foundational principle; candle-magic and voodoo-dolls are both specific applications. Single merged cluster supersedes Haikus three overlapping clusters.',
    },
  ],
  ghosts_hauntings: [
    {
      canonical_slug: 'trapped-spirit',
      canonical_name: 'Trapped Spirit',
      member_slugs: ['trapped-spirit', 'bound-spirit'],
      rationale: 'Operator review: trapped-spirit has higher report count (666 vs 156). Replaces Haikus reciprocal pair confusion.',
    },
    {
      canonical_slug: 'apparition',
      canonical_name: 'Apparition',
      member_slugs: ['apparition', 'full-body-apparition'],
      rationale: 'Operator review: apparition is the broader more established term (2812 reports vs 705). Inverted from Haikus original which had full-body-apparition canonical.',
    },
  ],
}

function clusterMatches(c, rejectSpec) {
  if (c.canonical_slug !== rejectSpec.canonical_slug) return false
  return true
}

function isNoopRename(r) {
  if (!r.current_name || !r.proposed_name) return true
  return r.current_name.trim() === r.proposed_name.trim()
}

function main() {
  const raw = readFileSync(IN, 'utf8')
  const data = JSON.parse(raw)

  let droppedClusters = 0
  let droppedRenames = 0
  let addedClusters = 0
  let kept_clusters = 0
  let kept_renames = 0

  for (const cat of data.categories) {
    // Drop rejected clusters.
    const before = cat.clusters.length
    cat.clusters = cat.clusters.filter(c => {
      const reject = REJECTED_CLUSTERS.find(r => clusterMatches(c, r))
      if (reject) {
        droppedClusters++
        return false
      }
      return true
    })

    // Add replacement clusters.
    const replacements = REPLACEMENT_CLUSTERS[cat.category] || []
    for (const repl of replacements) {
      cat.clusters.push(repl)
      addedClusters++
    }

    // Drop noop renames.
    const beforeRenames = cat.rename_only.length
    cat.rename_only = cat.rename_only.filter(r => {
      if (isNoopRename(r)) {
        droppedRenames++
        return false
      }
      return true
    })

    kept_clusters += cat.clusters.length
    kept_renames += cat.rename_only.length
  }

  // Recompute headline counts.
  data.total_clusters = kept_clusters
  data.total_phens_to_merge = data.categories.reduce(
    (s, c) => s + c.clusters.reduce((ss, cl) => ss + (cl.member_slugs.length - 1), 0),
    0,
  )
  data.total_renames = kept_renames
  data.cleaned_at = new Date().toISOString()
  data.cleanup_notes = {
    clusters_dropped: droppedClusters,
    clusters_added: addedClusters,
    renames_dropped: droppedRenames,
  }

  writeFileSync(OUT, JSON.stringify(data, null, 2))
  console.log('Wrote ' + OUT)
  console.log('  Clusters dropped: ' + droppedClusters)
  console.log('  Clusters added:   ' + addedClusters)
  console.log('  Renames dropped (noop): ' + droppedRenames)
  console.log('  Final clusters:   ' + kept_clusters)
  console.log('  Final renames:    ' + kept_renames)
  console.log('  Phens to merge:   ' + data.total_phens_to_merge)
}

main()

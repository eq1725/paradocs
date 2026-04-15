/**
 * Unified Case Profile model.
 *
 * Every adapter ingests reports with its own structured metadata shape
 * (NDERF/OBERF: near-death questionnaire; NUFORC: shape/duration; BFRO:
 * classification/witness_count; Erowid: substance/dose/route; Reddit:
 * score/comments…). Historically we only surfaced the NDERF/OBERF shape
 * on the detail + discover views via NDERFCaseProfile.
 *
 * This module normalises all of those heterogeneous metadata shapes into
 * a single { kind, headerLabel, facts[], phenomena[], emotions[] } record
 * that the shared CaseProfileChips component can render for any source.
 * Consumers call `deriveCaseProfile(report)` and forward the result.
 *
 * Per the QA/QC feedback (Apr 15 2026): "we might consider making this
 * profile box standard across all reports and adapters used to ingest".
 */
import type { EmotionToken, NDERFCaseProfile } from '@/components/discover/DiscoverCards'

export type CaseProfileKind =
  | 'nde'        // NDERF
  | 'obe'        // OBERF — out-of-body / STE / mystical
  | 'ufo'        // NUFORC
  | 'cryptid'    // BFRO
  | 'ghost'      // Ghosts of America / Shadowlands
  | 'psi'        // IANDS / psychic
  | 'substance'  // Erowid
  | 'community'  // Reddit
  | 'media'      // YouTube
  | 'archive'    // Wikipedia / news / curated
  | 'generic'

export interface CaseProfileFact {
  label: string
  value: string
}

export interface CaseProfilePhenomenon {
  label: string
  state: 'yes' | 'no' | 'unknown'
}

export interface CaseProfile {
  kind: CaseProfileKind
  /** Header label shown above the chip box (e.g. "NDE Case Profile"). */
  headerLabel: string
  /** Identity / context facts (gender, age, duration, shape, witness count, …). */
  facts: CaseProfileFact[]
  /** Yes/no binary phenomena, rendered as check/cross chips. */
  phenomena: CaseProfilePhenomenon[]
  /** Controlled-vocabulary emotion tokens (NDERF/OBERF only today). */
  emotions: EmotionToken[]
}

export interface CaseProfileSource {
  source_type: string | null
  metadata: Record<string, any> | null
  category?: string | null
  witness_count?: number | null
  has_photo_video?: boolean | null
  has_physical_evidence?: boolean | null
  event_date?: string | null
  event_date_precision?: string | null
  credibility?: string | null
}

// =========================================================================
//  Utilities
// =========================================================================

function trimStr(v: any): string | null {
  if (v == null) return null
  var s = String(v).trim()
  return s.length ? s : null
}

function yn(v: any): 'yes' | 'no' | 'unknown' {
  if (v === 'yes' || v === true) return 'yes'
  if (v === 'no' || v === false) return 'no'
  return 'unknown'
}

// =========================================================================
//  NDERF / OBERF — legacy-shape converter
//  Re-uses the big NDE questionnaire already stored on metadata.case_profile.
// =========================================================================

function nderfHeaderLabel(p: NDERFCaseProfile, sourceType: string | null): string {
  var t = (p.ndeType || '').trim()
  if (t) {
    var lower = t.toLowerCase()
    if (lower.indexOf('near-death') !== -1 || lower.indexOf('near death') !== -1 || /\bnde\b/.test(lower)) {
      return 'NDE Case Profile'
    }
    return t + ' Case Profile'
  }
  if (sourceType === 'nderf') return 'NDE Case Profile'
  return 'Case Profile'
}

function nderfKind(p: NDERFCaseProfile, sourceType: string | null): CaseProfileKind {
  if (sourceType === 'nderf') return 'nde'
  // OBERF covers OBE / STE / mystical — fall back to 'obe'
  return 'obe'
}

export function nderfToCaseProfile(
  p: NDERFCaseProfile,
  sourceType: string | null
): CaseProfile {
  var facts: CaseProfileFact[] = []
  if (p.trigger) facts.push({ label: 'Trigger', value: p.trigger })
  if (p.gender) facts.push({ label: 'Gender', value: p.gender })
  if (p.ageAtNDE) facts.push({ label: 'Age', value: p.ageAtNDE })

  var phenomena: CaseProfilePhenomenon[] = [
    { label: 'Out-of-body', state: p.outOfBody || 'unknown' },
    { label: 'Tunnel', state: p.tunnel || 'unknown' },
    { label: 'Brilliant light', state: p.light || 'unknown' },
    { label: 'Met beings', state: p.metBeings || 'unknown' },
    { label: 'Mystical being', state: p.mysticalBeing || 'unknown' },
    { label: 'Deceased present', state: p.deceasedPresent || 'unknown' },
    { label: 'Other realm', state: p.otherworldly || 'unknown' },
    { label: 'Life review', state: p.lifeReview || 'unknown' },
    { label: 'Special knowledge', state: p.specialKnowledge || 'unknown' },
    { label: 'Future scenes', state: p.futureScenes || 'unknown' },
    { label: 'Afterlife aware', state: p.afterlifeAware || 'unknown' },
    { label: 'Boundary', state: p.boundary || 'unknown' },
    { label: 'Altered time', state: p.alteredTime || 'unknown' },
    { label: 'Vivid memory', state: p.memoryAccuracy || 'unknown' },
    { label: 'Believes real', state: p.realityBelief || 'unknown' },
    { label: 'Life changed', state: (p.lifeChanged || p.aftereffectsChangedLife) || 'unknown' },
  ]

  var emotions: EmotionToken[] = Array.isArray(p.emotions) ? (p.emotions as EmotionToken[]) : []

  return {
    kind: nderfKind(p, sourceType),
    headerLabel: nderfHeaderLabel(p, sourceType),
    facts: facts,
    phenomena: phenomena,
    emotions: emotions,
  }
}

// =========================================================================
//  NUFORC — UFO sighting report
// =========================================================================

function deriveNuforc(r: CaseProfileSource): CaseProfile | null {
  var m = r.metadata || {}
  var facts: CaseProfileFact[] = []
  if (m.shape) facts.push({ label: 'Shape', value: String(m.shape) })
  if (m.color) facts.push({ label: 'Color', value: String(m.color) })
  if (m.duration) facts.push({ label: 'Duration', value: String(m.duration) })
  if (r.witness_count && r.witness_count > 0) {
    facts.push({ label: 'Observers', value: String(r.witness_count) })
  }
  if (m.estimatedSize) facts.push({ label: 'Estimated size', value: String(m.estimatedSize) })
  if (m.estimatedSpeed) facts.push({ label: 'Estimated speed', value: String(m.estimatedSpeed) })
  if (m.closestDistance) facts.push({ label: 'Closest distance', value: String(m.closestDistance) })
  if (m.directionFromViewer) facts.push({ label: 'Direction', value: String(m.directionFromViewer) })
  if (m.angleOfElevation) facts.push({ label: 'Elevation', value: String(m.angleOfElevation) })
  if (m.viewedFrom) facts.push({ label: 'Viewed from', value: String(m.viewedFrom) })

  var phenomena: CaseProfilePhenomenon[] = [
    { label: 'Photo / video', state: r.has_photo_video ? 'yes' : 'unknown' },
    { label: 'Multiple witnesses', state: (r.witness_count || 0) > 1 ? 'yes' : 'unknown' },
    { label: 'Official report', state: 'yes' }, // All NUFORC entries are official submissions
  ]
  if (m.characteristics && typeof m.characteristics === 'string') {
    var c = (m.characteristics as string).toLowerCase()
    if (c.indexOf('sound') !== -1) phenomena.push({ label: 'Sounds heard', state: 'yes' })
    if (c.indexOf('odor') !== -1) phenomena.push({ label: 'Odors', state: 'yes' })
    if (c.indexOf('emitted') !== -1 || c.indexOf('light') !== -1) {
      phenomena.push({ label: 'Emitted light', state: 'yes' })
    }
  }

  if (facts.length === 0 && phenomena.filter(function (p) { return p.state !== 'unknown' }).length === 0) {
    return null
  }

  return {
    kind: 'ufo',
    headerLabel: 'UFO Sighting Profile',
    facts: facts,
    phenomena: phenomena,
    emotions: [],
  }
}

// =========================================================================
//  BFRO — cryptid encounter
// =========================================================================

function deriveBfro(r: CaseProfileSource): CaseProfile | null {
  var m = r.metadata || {}
  var facts: CaseProfileFact[] = []
  if (m.bfroClass) facts.push({ label: 'BFRO class', value: String(m.bfroClass) })
  if (m.classification && !m.bfroClass) facts.push({ label: 'Classification', value: String(m.classification) })
  if (r.witness_count && r.witness_count > 0) {
    facts.push({ label: 'Witnesses', value: String(r.witness_count) })
  }
  if (m.nearestTown) facts.push({ label: 'Nearest town', value: String(m.nearestTown) })
  if (m.environment) facts.push({ label: 'Environment', value: String(m.environment) })
  if (m.timeAndConditions) facts.push({ label: 'Conditions', value: String(m.timeAndConditions) })

  var phenomena: CaseProfilePhenomenon[] = [
    { label: 'BFRO investigated', state: m.followUpInvestigation ? 'yes' : 'unknown' },
    { label: 'Other witnesses', state: m.otherWitnesses ? 'yes' : 'unknown' },
    { label: 'Other stories nearby', state: m.otherStories ? 'yes' : 'unknown' },
    { label: 'Physical evidence', state: r.has_physical_evidence ? 'yes' : 'unknown' },
    { label: 'Photo / video', state: r.has_photo_video ? 'yes' : 'unknown' },
  ]

  if (facts.length === 0 && phenomena.filter(function (p) { return p.state !== 'unknown' }).length === 0) {
    return null
  }

  return {
    kind: 'cryptid',
    headerLabel: 'Encounter Profile',
    facts: facts,
    phenomena: phenomena,
    emotions: [],
  }
}

// =========================================================================
//  Erowid — substance experience
// =========================================================================

function deriveErowid(r: CaseProfileSource): CaseProfile | null {
  var m = r.metadata || {}
  var cp = (m.case_profile || {}) as Record<string, any>
  var facts: CaseProfileFact[] = []
  if (cp.substance) facts.push({ label: 'Substance', value: String(cp.substance) })
  if (cp.doseAmount) facts.push({ label: 'Dose', value: String(cp.doseAmount) })
  if (cp.route) facts.push({ label: 'Route', value: String(cp.route) })
  if (cp.setting) facts.push({ label: 'Setting', value: String(cp.setting) })
  if (cp.gender) facts.push({ label: 'Gender', value: String(cp.gender) })
  if (cp.ageAtExperience) facts.push({ label: 'Age', value: String(cp.ageAtExperience) })
  if (cp.bodyWeight) facts.push({ label: 'Body weight', value: String(cp.bodyWeight) })
  if (cp.experienceYear) facts.push({ label: 'Year', value: String(cp.experienceYear) })
  if (Array.isArray(cp.coSubstances) && cp.coSubstances.length > 0) {
    facts.push({ label: 'Co-substances', value: cp.coSubstances.join(', ') })
  }
  // Fall back to adapter-level metadata
  if (!cp.substance && m.substance) facts.push({ label: 'Substance', value: String(m.substance) })
  if (m.experienceType) facts.push({ label: 'Experience type', value: String(m.experienceType) })

  var phenomena: CaseProfilePhenomenon[] = [
    { label: 'Group context', state: yn(cp.isGroupContext) },
  ]

  if (facts.length === 0 && phenomena.filter(function (p) { return p.state !== 'unknown' }).length === 0) {
    return null
  }

  return {
    kind: 'substance',
    headerLabel: 'Experience Profile',
    facts: facts,
    phenomena: phenomena,
    emotions: [],
  }
}

// =========================================================================
//  IANDS — psychic / NDE-adjacent accounts
// =========================================================================

function deriveIands(r: CaseProfileSource): CaseProfile | null {
  var m = r.metadata || {}
  var facts: CaseProfileFact[] = []
  if (m.accountType) facts.push({ label: 'Account type', value: String(m.accountType) })
  var characteristics = Array.isArray(m.characteristics) ? m.characteristics : []
  var phenomena: CaseProfilePhenomenon[] = []
  characteristics.forEach(function (c: any) {
    var label = trimStr(c)
    if (label) phenomena.push({ label: label, state: 'yes' })
  })

  if (facts.length === 0 && phenomena.length === 0) return null

  return {
    kind: 'psi',
    headerLabel: 'Account Profile',
    facts: facts,
    phenomena: phenomena,
    emotions: [],
  }
}

// =========================================================================
//  Ghosts of America / Shadowlands — haunting reports
// =========================================================================

function deriveGhost(r: CaseProfileSource): CaseProfile | null {
  var m = r.metadata || {}
  var facts: CaseProfileFact[] = []
  if (m.cityName) facts.push({ label: 'City', value: String(m.cityName) })
  if (m.stateName) facts.push({ label: 'State', value: String(m.stateName) })
  if (m.hauntingType) facts.push({ label: 'Type', value: String(m.hauntingType) })
  if (m.venue) facts.push({ label: 'Venue', value: String(m.venue) })

  var phenomena: CaseProfilePhenomenon[] = [
    { label: 'Specific location named', state: m.hasSpecificLocation ? 'yes' : 'unknown' },
    { label: 'Date reported', state: m.hasDate ? 'yes' : 'unknown' },
    { label: 'Photo / video', state: r.has_photo_video ? 'yes' : 'unknown' },
  ]

  if (facts.length === 0 && phenomena.filter(function (p) { return p.state !== 'unknown' }).length === 0) {
    return null
  }

  return {
    kind: 'ghost',
    headerLabel: 'Haunting Profile',
    facts: facts,
    phenomena: phenomena,
    emotions: [],
  }
}

// =========================================================================
//  Reddit — community post
// =========================================================================

function deriveReddit(r: CaseProfileSource): CaseProfile | null {
  var m = r.metadata || {}
  var facts: CaseProfileFact[] = []
  if (m.subreddit) facts.push({ label: 'Subreddit', value: 'r/' + String(m.subreddit) })
  if (typeof m.score === 'number') facts.push({ label: 'Upvotes', value: String(m.score) })
  if (typeof m.num_comments === 'number') facts.push({ label: 'Comments', value: String(m.num_comments) })
  if (m.link_flair_text) facts.push({ label: 'Flair', value: String(m.link_flair_text) })
  if (m.author && m.author !== '[deleted]') facts.push({ label: 'Author', value: 'u/' + String(m.author) })

  if (facts.length === 0) return null

  return {
    kind: 'community',
    headerLabel: 'Post Profile',
    facts: facts,
    phenomena: [],
    emotions: [],
  }
}

// =========================================================================
//  Generic / fallback — media (YouTube), wikipedia, curated, news
// =========================================================================

function deriveGeneric(r: CaseProfileSource, kind: CaseProfileKind, headerLabel: string): CaseProfile | null {
  var facts: CaseProfileFact[] = []
  if (r.witness_count && r.witness_count > 0) {
    facts.push({ label: 'Witnesses', value: String(r.witness_count) })
  }
  if (r.credibility) facts.push({ label: 'Credibility', value: r.credibility })
  if (r.category) {
    facts.push({ label: 'Category', value: r.category.replace(/_/g, ' ') })
  }

  var phenomena: CaseProfilePhenomenon[] = [
    { label: 'Photo / video', state: r.has_photo_video ? 'yes' : 'unknown' },
    { label: 'Physical evidence', state: r.has_physical_evidence ? 'yes' : 'unknown' },
  ]

  var answered = phenomena.filter(function (p) { return p.state !== 'unknown' })
  if (facts.length === 0 && answered.length === 0) return null

  return {
    kind: kind,
    headerLabel: headerLabel,
    facts: facts,
    phenomena: phenomena,
    emotions: [],
  }
}

// =========================================================================
//  Top-level dispatcher
// =========================================================================

export function deriveCaseProfile(report: CaseProfileSource | null | undefined): CaseProfile | null {
  if (!report) return null
  var src = (report.source_type || '').toLowerCase()
  var m = report.metadata || {}

  // NDERF/OBERF already carry a structured case_profile — re-use that path.
  if ((src === 'nderf' || src === 'oberf') && m.case_profile) {
    return nderfToCaseProfile(m.case_profile as NDERFCaseProfile, src)
  }

  if (src === 'nuforc') return deriveNuforc(report)
  if (src === 'bfro') return deriveBfro(report)
  if (src === 'erowid') return deriveErowid(report)
  if (src === 'iands') return deriveIands(report)
  if (src === 'ghostsofamerica' || src === 'shadowlands') return deriveGhost(report)
  if (src === 'reddit' || src === 'reddit-v2') return deriveReddit(report)

  if (src === 'youtube') return deriveGeneric(report, 'media', 'Media Profile')
  if (src === 'wikipedia' || src === 'news' || src === 'curated' || src === 'editorial' || src === 'historical_archive') {
    return deriveGeneric(report, 'archive', 'Case Profile')
  }

  // Default: try to build a generic profile from whatever is on the report.
  return deriveGeneric(report, 'generic', 'Case Profile')
}

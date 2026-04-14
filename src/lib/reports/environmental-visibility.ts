/**
 * Environmental Context visibility rules.
 *
 * The Environmental Context card (weather/moon phase/season/satellites at the
 * time of the event) only makes sense for reports whose setting actually
 * matters to the account — cryptid sightings, UFO encounters, outdoor
 * rituals/hauntings, and anything else where the witness was outside or the
 * physical environment is materially part of the experience.
 *
 * For indoor / inward-facing experiences (NDEs, OBEs, STEs, deathbed visions
 * experienced from a hospital bed, prayer experiences, dreams, etc.) the
 * environmental data is irrelevant at best and misleading at worst.
 *
 * This helper is the single source of truth for that decision. Report pages
 * should call it before rendering the EnvironmentalContext / Academic
 * Observation panels.
 */

type ReportLike = {
  source_type?: string | null
  category?: string | null
  tags?: string[] | null
  phenomenon_type?: { slug?: string | null } | null
  metadata?: Record<string, unknown> | null
}

const OUTDOOR_FIELD_SOURCES = new Set<string>([
  'bfro',        // Bigfoot Field Researchers
  'nuforc',      // UFO field sightings
  'mufon',       // UFO field sightings (when we ingest)
  'gcbro',       // Gulf Coast cryptid
])

const OUTDOOR_PHENOMENON_SLUGS = new Set<string>([
  'ufo-encounter',
  'cryptid-sighting',
  'bigfoot-sighting',
  'sasquatch-sighting',
  'lake-monster-sighting',
  'sea-serpent-sighting',
  'outdoor-apparition',
  'roadside-apparition',
  'wilderness-haunting',
  'outdoor-ritual',
  'outdoor-magic-ritual',
])

const INDOOR_PHENOMENON_SLUGS = new Set<string>([
  // NDE family — always indoor/medical or inward-facing
  'near-death-experience',
  'distressing-nde',
  'nde-like-experience',
  'shared-death-experience',
  'out-of-body-experience',
  'sudden-obe',
  'spiritually-transformative-experience',
  'deathbed-vision',
  'after-death-communication',
  'nearing-end-of-life-experience',
  'pre-birth-memory',
  'prayer-experience',
  'dream-experience',
  'premonition-experience',
  'other-experience',
])

const OUTDOOR_CATEGORIES = new Set<string>([
  'cryptid',
  'cryptids',
  'ufo',
  'ufos',
  'ufos_aliens',       // taxonomy category used across adapters
  'cryptozoology',
])

const OUTDOOR_TAG_CUES = [
  // Phenomenon-type tags that mean outdoor regardless of source dataset —
  // e.g., NDERF/OBERF entries whose actual content is a UFO encounter or
  // cryptid sighting (these carry the phenomenon as a tag instead of a
  // resolved phenomenon_type row).
  'ufo-encounter', 'ufo-sighting', 'ufo', 'uap',
  'cryptid-sighting', 'bigfoot-sighting', 'sasquatch-sighting',
  'cryptid', 'bigfoot', 'sasquatch',
  'outdoor-apparition', 'roadside-apparition', 'wilderness-haunting',
  // Environment cues
  'outdoors', 'outdoor', 'wilderness', 'forest', 'woods', 'woodland',
  'mountain', 'mountains', 'lake', 'river', 'creek', 'stream',
  'camping', 'camper', 'hiking', 'hiker', 'backpacking',
  'field', 'meadow', 'park', 'trail', 'swamp', 'marsh', 'desert',
  'beach', 'shoreline', 'coastline', 'ocean',
  'ritual-outdoor', 'outdoor-ritual', 'wilderness-paranormal',
  'driving', 'roadside', 'highway', 'rural',
  'hunting', 'fishing', 'farm', 'ranch',
]

/**
 * Should the Environmental Context panel render for this report?
 */
export function shouldShowEnvironmentalContext(report: ReportLike): boolean {
  if (!report) return false

  // 1. Field research sources are always outdoor/environmental by definition.
  const sourceType = (report.source_type || '').toLowerCase()
  if (OUTDOOR_FIELD_SOURCES.has(sourceType)) return true

  // 2. Explicit indoor/inward-facing phenomenon slugs — always hide.
  //    (Covers every NDERF/OBERF index report whose phenomenon_type got wired up
  //    by the NDE-family taxonomy migration.)
  const phenomenonSlug = (report.phenomenon_type?.slug || '').toLowerCase()
  if (INDOOR_PHENOMENON_SLUGS.has(phenomenonSlug)) return false

  // 3. Explicit outdoor phenomenon slugs — always show.
  if (OUTDOOR_PHENOMENON_SLUGS.has(phenomenonSlug)) return true

  // 4. Category-based whitelist for curated / user-submitted reports.
  const category = (report.category || '').toLowerCase()
  if (OUTDOOR_CATEGORIES.has(category)) return true

  // 5. Tag-based whitelist — look for outdoor/location cues. This runs
  //    BEFORE the NDERF/OBERF legacy fallback so that an OBERF report
  //    tagged as a UFO encounter or cryptid sighting still gets the
  //    environmental panel.
  const tags = Array.isArray(report.tags) ? report.tags : []
  const normalizedTags = tags.map(t => (t || '').toLowerCase())
  if (normalizedTags.some(t => OUTDOOR_TAG_CUES.includes(t))) return true

  // 6. Legacy fallback: NDERF/OBERF source reports without any outdoor
  //    signal. These are assumed inward-facing.
  if (sourceType === 'nderf' || sourceType === 'oberf') return false

  // 7. Default: don't render. Safer to hide than to show misleading context.
  return false
}

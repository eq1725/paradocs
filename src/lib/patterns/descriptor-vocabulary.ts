// V11.18.4 — Sprint 1B — centralized descriptor-keyword vocabulary.
//
// Single source of truth for the keyword lists the Patterns surface uses
// to count descriptor occurrences inside `paradocs_narrative` / `summary`
// / `description`. Replaces the two near-duplicate maps that used to
// live in:
//
//   - `src/lib/lab/hints/data-query-executor.ts:95-117`
//   - `src/pages/api/lab/patterns/list.ts:56-62`
//
// Drift between those two maps was the SPRINT_1A_2_NOTES drift-risk
// flag. Both files now import `DESCRIPTOR_VOCAB` from here.
//
// Per-descriptor entry shape
// --------------------------
//   keywords: required — case-insensitive substring tokens to OR across
//     reports.tags + paradocs_assessment.descriptors + a single combined
//     title+summary+description text token.
//   exclude_keywords: optional — substrings that veto a row even if
//     `keywords` matched. Defends against noise (`static-like` in cryptid
//     narratives, `figure of speech`, etc.). NOT YET USED by the runtime
//     executor — wired in Sprint 1C if the false-positive rate justifies
//     it; for now the cleaner path is to drop bare common-word keywords.
//   pretty_label: required — human label used in headlines / interpretive
//     prose. Documentary register.
//   phen_families_default: required — the phen-family slugs to feed to
//     `cross_family_overlap_pct` queries when the seed script needs a
//     default. Per PATTERNS_TAXONOMY.md §3 ("Family-mapping
//     recommendations").
//
// All keyword lists are derived from PATTERNS_TAXONOMY.md §2 (the
// linguistic-variants column) plus PATTERNS_GAPS_AND_FRESHNESS.md §4
// (the corpus-grounded gap additions). Where the taxonomy and the gap
// memo agreed, the keyword set is the union of both with bare
// common-word noise dropped (`figure`, `static`, `light`, `presence`,
// `standing` — see PATTERNS_TAXONOMY.md §5).

import type { DescriptorFamily } from '@/lib/lab/hints/data-query-types'
import type { HintCategory } from '@/lib/lab/hints/hint-schema'

export interface DescriptorEntry {
  keywords: string[]
  exclude_keywords?: string[]
  pretty_label: string
  phen_families_default: HintCategory[]
}

export type DescriptorVocabulary = Record<string, DescriptorEntry>

/**
 * The shipped vocabulary. Keyed by the descriptor slug — these are
 * the slugs that appear in `findings_catalogue.descriptor`. Most are
 * `DescriptorFamily` enum members; the slug is the same string.
 *
 * Sprint 1B covers the 10 priority publish patterns from
 * PATTERNS_TAXONOMY.md §4 plus the 12 leftover legacy descriptors
 * the Hints surface still references. Adding a new descriptor: append
 * an entry here AND extend `DescriptorFamily` in data-query-types.ts.
 */
export var DESCRIPTOR_VOCAB: DescriptorVocabulary = {
  /* ===================================================================== */
  /* Sprint 1B priority publish list (10 patterns)                          */
  /* ===================================================================== */

  // 1. Shadow figure / dark humanoid presence — already shipped (V11.18.1+).
  //    Keep the V11.18.1 keyword set verbatim. The bare 'figure' / 'presence'
  //    / 'standing' keywords are dropped here per PATTERNS_TAXONOMY §5.3
  //    recommendation, but we leave them in the legacy entry below so the
  //    shipped shadow_figure Finding's recorded counts don't shift.
  shadow_figure: {
    keywords: ['shadow', 'figure', 'presence', 'standing'],
    pretty_label: 'shadow figure',
    phen_families_default: ['perception_sensory', 'ghosts_hauntings', 'ufos_aliens'],
  },

  // 2. Tunnel imagery — corrected family mapping per gap memo §2.2.
  //    The NDE-family corpus (tunnel, vortex, being-pulled-through)
  //    lives in psychological_experiences. PATTERNS_TAXONOMY §3 lists
  //    psych_exp as the primary family.
  tunnel_imagery: {
    keywords: [
      'tunnel', 'dark tunnel', 'long tunnel', 'corridor', 'passage',
      'passageway', 'funnel', 'vortex', 'spiral', 'dark cave', 'dark well',
      'conduit', 'dark cylinder', 'being pulled through', 'drawn through',
      'light at the end', 'end of the tunnel',
    ],
    pretty_label: 'tunnel imagery',
    phen_families_default: ['psychological_experiences', 'consciousness_practices', 'perception_sensory'],
  },

  // 3. Electromagnetic disturbance — expanded per gap memo Fix 1.
  electromagnetic_disturbance: {
    keywords: [
      'electromagnetic', 'emf', 'magnetic field', 'electrical interference',
      'interference', 'radio static', 'radio cut out',
      'lights flickered', 'flickering', 'lights dimmed', 'lights brightened',
      'power outage', 'flicker', 'stopped watch', 'watch stopped',
      'hands of my watch', 'electronics', 'electronics dead',
      'electronics malfunctioned', 'electronics behaved strangely',
      'car stalled', 'engine died', 'engine stopped', 'engine cut out',
      'ignition died', 'headlights dimmed', 'battery died',
      'batteries drained', 'phone died', 'compass spun', 'electrical sensation',
    ],
    pretty_label: 'electromagnetic disturbance',
    phen_families_default: ['ufos_aliens', 'ghosts_hauntings', 'cryptids'],
  },

  // 4. OBE / observer-from-above — expanded from the legacy
  //    `observed_from_above` set per PATTERNS_TAXONOMY §5.7.
  obe_observer_from_above: {
    keywords: [
      'out of body', 'out-of-body', 'obe', 'floated above',
      'looking down on myself', 'hovering above', 'ceiling view',
      'view from above', 'watched myself', 'saw my body',
      'looking at my own body', 'separated from my body', 'above my body',
      'looking down', 'from above',
    ],
    pretty_label: 'out-of-body observer perspective',
    phen_families_default: ['psychological_experiences', 'consciousness_practices', 'perception_sensory'],
  },

  // 5. Paralysis / inability to move — PATTERNS_TAXONOMY C3.
  paralysis: {
    keywords: [
      'sleep paralysis', "couldn't move", "can't move", "couldn't speak",
      'frozen', 'paralyzed', 'body locked', 'locked in place', 'unable to move',
      'pinned', 'pinned down', 'held down', 'held in place',
      'weight on my chest', 'pressure on my chest',
    ],
    pretty_label: 'paralysis at onset',
    phen_families_default: ['perception_sensory', 'psychological_experiences', 'ufos_aliens'],
  },

  // 6. Time dilation — PATTERNS_TAXONOMY D2. Distinct from D1 missing-time;
  //    this is the subjective-stretch flavor.
  time_dilation: {
    keywords: [
      'time slowed', 'time stopped', 'time stood still', 'time froze',
      'slow motion', 'in slow motion', 'felt like hours', 'felt like minutes',
      'lost track of time', 'time dilated', 'time was different',
    ],
    pretty_label: 'time dilation',
    phen_families_default: ['psychological_experiences', 'consciousness_practices', 'ufos_aliens'],
  },

  // 7. Hypnagogic state — PATTERNS_TAXONOMY C5. The keyword fallback is
  //    retained; the seed script SHOULD prefer `witness_state_pct` against
  //    reports.witness_state_at_event = 'drowsy_falling_asleep' (see
  //    PATTERNS_GAPS Fix 4). Keywords only fire if the structured-field
  //    path is unavailable.
  hypnagogic_state: {
    keywords: [
      'hypnagogic', 'hypnopompic', 'half asleep', 'half-asleep',
      'falling asleep', 'just falling asleep', 'drifting off', 'drowsy',
      'just before sleep', 'as i was waking', 'just as i woke',
      'between sleep and waking', 'in that in-between state',
      'drowsing off', 'nodding off',
    ],
    pretty_label: 'hypnagogic (drowsy / falling-asleep) state',
    phen_families_default: ['perception_sensory', 'consciousness_practices', 'psychological_experiences'],
  },

  // 8. Sensed presence — PATTERNS_TAXONOMY E1.
  sensed_presence: {
    keywords: [
      'sensed presence', 'felt presence', 'felt watched', 'being watched',
      'presence in the room', 'someone there', 'something there',
      'not alone', 'knew someone was there', 'eyes on me', 'felt observed',
    ],
    pretty_label: 'sensed presence',
    phen_families_default: ['ghosts_hauntings', 'perception_sensory', 'cryptids'],
  },

  // 9. Reunion with deceased — PATTERNS_TAXONOMY E2. WOO PATTERN —
  //    seed-patterns-v1.ts flags this for Helena copy-pass.
  reunion_with_deceased: {
    keywords: [
      'met my mother', 'met my father', 'saw my grandmother',
      'saw my grandfather', 'deceased relative', 'dead loved one',
      'deceased loved one', 'reunion with', 'came to greet me',
      'was there to greet me', 'welcomed me', 'my late',
      'was waiting for me', 'my passed', 'deceased mother',
      'deceased father',
    ],
    pretty_label: 'reunion with deceased',
    phen_families_default: ['psychological_experiences', 'ghosts_hauntings', 'psychic_phenomena'],
  },

  // 10. Animal-witness reaction — PATTERNS_TAXONOMY F3.
  animal_witness_reaction: {
    keywords: [
      'dog barked', "dog wouldn't stop barking", 'dogs went wild',
      'dog growled', 'horse spooked', 'horse refused', 'cat hiding',
      'cat stared at', 'cattle fled', 'birds went silent', 'no birdsong',
      'dead silence in the woods', 'animal sensed it', 'the animals knew',
      'dog barking', 'cat ran',
    ],
    pretty_label: 'animal-witness reaction',
    phen_families_default: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
  },

  /* ===================================================================== */
  /* Sprint 1B taxonomy additions, not on the publish-now list             */
  /* ===================================================================== */

  // Piloerection — the cleaned-up cousin of the legacy `static_electricity`
  // entry. Drops bare 'static' (per gap memo §2.3 — catches static-like /
  // static vigil / stationary noise). Sprint 1B retains both names so the
  // legacy Hint keeps compiling; new Findings should use `piloerection`.
  piloerection: {
    keywords: [
      'static electricity', 'hair stood on end', 'hair stood up',
      'hair on end', 'hair stand on end', 'hair raised',
      'prickling sensation', 'prickled', 'tingling sensation',
      'electrical sensation', 'goosebumps', 'goose bumps', 'gooseflesh',
      'raised the hair on my arms', 'skin crawled', 'piloerection',
      'tingling', 'hair stood',
    ],
    pretty_label: 'piloerection (hair-raising / static sensation)',
    phen_families_default: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
  },

  /* ===================================================================== */
  /* Legacy entries — preserved so existing Hint matchers keep compiling   */
  /* against the old DescriptorFamily slugs. Sprint 1B does NOT publish    */
  /* a Finding for any of these; they remain Hint-only.                    */
  /* ===================================================================== */

  static_electricity: {
    // DEPRECATED — see `piloerection` above. Keep the V11.18.1 set verbatim
    // because existing seed-hints + tests reference it.
    keywords: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
    pretty_label: 'static-electricity sensation',
    phen_families_default: ['cryptids', 'ufos_aliens'],
  },

  low_hum: {
    keywords: ['low hum', 'throbbing', 'vibration', 'drone'],
    pretty_label: 'low hum',
    phen_families_default: ['cryptids', 'ufos_aliens'],
  },

  whoop_vocalization: {
    keywords: ['whoop', 'howl', 'call', 'vocalization'],
    pretty_label: 'whoop / howl vocalization',
    phen_families_default: ['cryptids'],
  },

  being_of_light: {
    keywords: ['light', 'luminous', 'radiant'],
    pretty_label: 'being of light',
    phen_families_default: ['psychological_experiences', 'consciousness_practices', 'ufos_aliens'],
  },

  time_distortion: {
    keywords: ['time slowed', 'time stopped', 'missing time'],
    pretty_label: 'time distortion',
    phen_families_default: ['ufos_aliens', 'psychological_experiences', 'consciousness_practices'],
  },

  metallic_taste: {
    keywords: ['metal taste', 'copper tongue', 'metallic'],
    pretty_label: 'metallic taste',
    phen_families_default: ['ufos_aliens', 'cryptids'],
  },

  odor_sulphur: {
    keywords: ['sulphur', 'sulfur', 'rotten eggs', 'burning smell'],
    pretty_label: 'sulphur / rotten-egg odor',
    phen_families_default: ['ufos_aliens', 'cryptids', 'ghosts_hauntings'],
  },

  paralysis_onset: {
    keywords: ["can't move", 'frozen', 'locked', 'paralyzed'],
    pretty_label: 'paralysis at onset',
    phen_families_default: ['perception_sensory', 'psychological_experiences', 'ufos_aliens'],
  },

  observed_from_above: {
    keywords: ['looking down', 'above body', 'ceiling view', 'from above'],
    pretty_label: 'observed from above',
    phen_families_default: ['psychological_experiences', 'consciousness_practices', 'perception_sensory'],
  },

  animal_reaction: {
    keywords: ['dog barking', 'horse spooked', 'cat hiding', 'animal'],
    pretty_label: 'animal reaction',
    phen_families_default: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
  },

  three_note_pattern: {
    keywords: ['three-tone', 'triadic', 'groups-of-three'],
    pretty_label: 'three-note pattern',
    phen_families_default: ['cryptids'],
  },

  craft_shape_triangle: {
    keywords: ['triangle', 'v-formation', 'boomerang'],
    pretty_label: 'triangle craft',
    phen_families_default: ['ufos_aliens'],
  },

  craft_shape_disc: {
    keywords: ['disc', 'saucer', 'plate'],
    pretty_label: 'disc craft',
    phen_families_default: ['ufos_aliens'],
  },

  craft_shape_orb: {
    keywords: ['orb', 'sphere', 'ball-of-light'],
    pretty_label: 'orb craft',
    phen_families_default: ['ufos_aliens'],
  },

  witness_drowsy: {
    keywords: ['hypnagogic', 'half-asleep', 'falling-asleep', 'drowsy'],
    pretty_label: 'drowsy witness state',
    phen_families_default: ['perception_sensory', 'consciousness_practices', 'psychological_experiences'],
  },

  witness_paired_or_more: {
    keywords: ['shared event', 'family-witnessed'],
    pretty_label: 'paired or group witness',
    phen_families_default: ['ufos_aliens', 'ghosts_hauntings'],
  },

  apparition_residential: {
    keywords: ['home', 'house', 'bedroom'],
    pretty_label: 'residential apparition',
    phen_families_default: ['ghosts_hauntings'],
  },

  recurring_location: {
    keywords: ['happens again', 'same place', 'same room'],
    pretty_label: 'recurring location',
    phen_families_default: ['ghosts_hauntings'],
  },
}

/**
 * Lookup helper — returns the keyword list for a descriptor slug, or an
 * empty list if the slug is unknown. Lowercased to keep the substring
 * match case-insensitive.
 */
export function getDescriptorKeywords(descriptor: string): string[] {
  var entry = DESCRIPTOR_VOCAB[descriptor]
  if (!entry) return []
  return entry.keywords.map(function (k) { return k.toLowerCase() })
}

/**
 * Lookup helper — pretty label for a descriptor slug. Falls back to the
 * slug with underscores swapped for spaces when unknown.
 */
export function getDescriptorPrettyLabel(descriptor: string): string {
  var entry = DESCRIPTOR_VOCAB[descriptor]
  if (entry) return entry.pretty_label
  return descriptor.replace(/_/g, ' ')
}

/**
 * Lookup helper — default phen-family slugs for a descriptor. The seed
 * script uses this when extending the catalogue to new patterns; the
 * existing seed-hints in seed-hints.ts retain their own explicit
 * `families` arrays.
 */
export function getDescriptorDefaultFamilies(descriptor: string): HintCategory[] {
  var entry = DESCRIPTOR_VOCAB[descriptor]
  if (!entry) return []
  return entry.phen_families_default.slice()
}

/**
 * Build the legacy `Record<DescriptorFamily, string[]>` shape the
 * runtime executor expects. Constructed once at module load.
 *
 * NB — DescriptorFamily is a closed enum; this helper deliberately
 * coerces via `as any` because the union members are produced from
 * the same vocabulary file.
 */
export function buildLegacyKeywordMap(): Record<DescriptorFamily, string[]> {
  var out: any = {}
  var slugs = Object.keys(DESCRIPTOR_VOCAB)
  for (var i = 0; i < slugs.length; i++) {
    var slug = slugs[i]
    out[slug] = DESCRIPTOR_VOCAB[slug].keywords.map(function (k) {
      return k.toLowerCase()
    })
  }
  return out as Record<DescriptorFamily, string[]>
}

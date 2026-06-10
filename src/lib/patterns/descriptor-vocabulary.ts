// V11.18.6 — Sprint 1C — centralized descriptor-keyword vocabulary.
//
// Sprint 1C expansion notes
// -------------------------
//   - animal_witness_reaction: greatly expanded keyword set per
//     Hynek's CE2 effect (species-specific phrasings beyond
//     dog/cat/horse; possessive narrator forms; plural + singular).
//     Sprint 1B yielded 0/0/0; Sprint 1C should register signal.
//   - piloerection: bare 'static' and 'static electricity' dropped
//     (too noisy in audit). Possessive narrator forms added
//     ("the hairs on my arm", "hairs on my neck").
//   - paralysis: expanded to cover abduction-literature phrasings
//     ("as if paralyzed", "something held me", "limbs wouldn't move",
//     "frozen in place / solid / still", "immobilized"). UFO family
//     should rise from 0% → 5–15% post re-seed.
//   - time_dilation: added Mack's "missing time" canonical form +
//     abduction phrasings ("hours felt like minutes", "no recollection
//     of", "woke up later than", "the clock skipped"). UFO family
//     should rise from 0% → 5–10% post re-seed.
//   - static_electricity entry DROPPED. The enum value remains for
//     backwards-compat with seed-hints.ts; no keywords means zero
//     matches at runtime (which is correct — it was deprecated).
//
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
  //
  // V11.18.6 — Sprint 1C. Expanded keyword set so UFO-family registers
  // the abduction-paralysis signal that Mack documents (was 0% in
  // Sprint 1B because the vocabulary skewed toward sleep-paralysis-only
  // phrasing). Added "as if paralyzed", "like I was paralyzed",
  // "couldn't move at all", "frozen in place / solid / still",
  // "immobilized", "body wouldn't respond", "limbs/arms/legs wouldn't
  // move", "something held me", "held in place". Kept the perception-
  // sensory-driving "sleep paralysis" + "weight on my chest" entries
  // so the existing 93% match is preserved.
  paralysis: {
    keywords: [
      // canonical
      'paralysis', 'paralyzed', 'as if paralyzed', 'like i was paralyzed',
      "couldn't move", 'could not move', "couldn't move at all", 'unable to move',
      'frozen', 'froze', 'frozen in place', 'frozen solid', 'frozen still',
      'immobilized', "body wouldn't respond", "my body wouldn't",
      'trapped in my body', 'felt locked', 'locked in place',
      "limbs wouldn't move", "arms wouldn't move", "legs wouldn't move",
      'something held me', 'held in place', 'pinned', 'pinned down',
      'sleep paralysis',
      // preserved from Sprint 1B for perception-sensory continuity
      "can't move", "couldn't speak", 'body locked', 'held down',
      'weight on my chest', 'pressure on my chest',
    ],
    pretty_label: 'paralysis at onset',
    phen_families_default: ['perception_sensory', 'psychological_experiences', 'ufos_aliens'],
  },

  // 6. Time dilation — PATTERNS_TAXONOMY D2. Mack's "missing time" is
  //    the canonical UFO-abduction marker.
  //
  // V11.18.6 — Sprint 1C. Added "missing time", "lost time", "time was
  //    lost", "no recollection of", "woke up later than", "came to in",
  //    "hours felt like minutes / minutes felt like hours", "lasted
  //    forever / felt like an eternity / felt like seconds",
  //    "everything went in slow motion", "the clock skipped", and the
  //    "time stood still" canonical form. Sprint 1B's narrow set
  //    produced 3/1/0% — these additions are the literature-grounded
  //    abduction phrasings that should lift UFO to 5–10%.
  time_dilation: {
    keywords: [
      // subjective stretch
      'time stood still', 'time stopped', 'time slowed', 'time slowing',
      'lost track of time', 'time was lost', 'lost time', 'missing time',
      'hours felt like minutes', 'minutes felt like hours',
      'felt like seconds', 'felt like an eternity', 'lasted forever',
      'everything went in slow motion', 'in slow motion',
      'the clock skipped', 'clock skipped ahead', 'no recollection of',
      'woke up later than', 'when i came to', 'came to in',
      'frozen moment', 'time-frozen', 'time froze',
      // preserved from Sprint 1B
      'felt like hours', 'felt like minutes', 'time dilated',
      'time was different', 'slow motion',
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

  // 10. Animal-witness reaction — PATTERNS_TAXONOMY F3. Hynek's CE2
  //     effect. The Sprint 1B set was too narrow — produced 0/0/0
  //     because the literature documents this in a wide spread of
  //     species-specific phrasings ("horse bolted", "cattle in
  //     distress", "deer fled", "chickens panicked") that the narrow
  //     "dog barked / horse spooked / cat hiding" trio missed.
  //
  // V11.18.6 — Sprint 1C. Greatly expanded set per the Sprint 1C brief.
  //     Covers plural + singular forms ("dogs barked", "the dog
  //     barked"), refusal/fleeing/silence variants, and species
  //     beyond dog/cat ("horse", "horses", "cattle", "livestock",
  //     "birds", "deer", "chickens", "sheep", "wildlife"). Also
  //     covers the possessive-narrator forms ("my dog refused", "my
  //     horse refused") which read as Hynek's exact literary marker.
  //
  // V11.18.7 — Sprint 1D. Sprint 1C's expansion only lifted cryptid to
  //     1% (still 0 in ghost + UFO). The taxonomy says it should also
  //     land 2-5% in UFO + ghost. Sprint 1D adds Hynek-CE2 phrasings
  //     that surface in NUFORC-style short-form narratives — "the
  //     dog wouldn't go near", "the birds went quiet", "my pet
  //     acted", "horses neighed", "cattle bellowed", "deer froze",
  //     "the cat puffed up", "all the dogs in the neighborhood".
  //     Net new ~36 phrasings.
  animal_witness_reaction: {
    keywords: [
      // generic
      'animals fled', 'animals scattered', 'animals refused', 'animals panicked',
      // horses
      'horse spooked', 'horse bolted', 'horses bolted', 'horses scattered',
      'spooked the horses',
      // cattle / livestock
      'cattle fled', 'cattle panicked', 'cattle in distress', 'livestock panicked',
      // birds
      'birds went silent', 'birds stopped singing', 'birds fell silent',
      'sudden silence in the trees',
      // dogs
      'dogs barked', 'dogs barking', 'dog whined', 'dogs whining',
      'dog whimpered', 'dogs howled', 'spooked the dog',
      // cats
      'cat fled', 'cats fled', 'cat hid', 'cats hid', 'cat refused',
      // other species
      'chickens panicked', 'sheep ran', 'deer fled', 'deer scattered',
      'wildlife disappeared',
      // possessive narrator
      "the dog wouldn't", "the cat wouldn't", 'my dog refused', 'my horse refused',
      // preserved from Sprint 1B
      'dog barked', "dog wouldn't stop barking", 'dogs went wild',
      'dog growled', 'horse refused', 'cat hiding', 'cat stared at',
      'no birdsong', 'dead silence in the woods', 'animal sensed it',
      'the animals knew', 'dog barking', 'cat ran',
      // V11.18.7 — Sprint 1D additions. Hynek CE2 phrasings tuned to
      //     short-form NUFORC + ghost-report registers. Targeting
      //     UFO ≥1% and ghost ≥1% (Sprint 1C left both at 0).
      'animals reacted', 'animal reaction', 'animals were spooked',
      'livestock disturbed', 'livestock fled', 'livestock ran',
      "the dog wouldn't go near", 'the dog refused to enter', "dog wouldn't approach",
      'animals avoided', 'animals stayed away', 'animals refused to',
      'horses neighed', 'horse neighed', 'cattle bellowed', 'cows bellowed',
      'nervous animals', 'agitated animals', 'panicked animals',
      'all the dogs in the neighborhood', 'every dog within',
      'unusual animal behavior', 'strange animal behavior',
      'the cat puffed up', 'cat puffed', 'fur stood up on the dog',
      'my pet acted', 'my dog acted', 'my cat acted',
      'the chickens scattered', 'the goats panicked',
      'deer froze', 'deer ran', 'deer scattered into',
      'the birds went quiet', 'birds suddenly stopped', 'sudden bird silence',
    ],
    pretty_label: 'animal-witness reaction',
    phen_families_default: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
  },

  /* ===================================================================== */
  /* Sprint 1B taxonomy additions, not on the publish-now list             */
  /* ===================================================================== */

  // Piloerection — Hynek's "the hair on my arm stood up" pattern.
  //
  // V11.18.6 — Sprint 1C. Replaces the deprecated `static_electricity`
  // entry entirely (which has been dropped from the vocabulary below).
  // Drops bare 'static' and bare 'static electricity' per Sprint 1C
  // brief — both keywords were too noisy (catch "static-like",
  // "stationary", "static vigil", "static-line"). Adds the canonical
  // "hair stood on end" / "hair-raising" / possessive-narrator forms
  // ("the hairs on my arm", "hairs on my neck", "hairs on my arms
  // stood") that the literature flags as the cross-family marker for
  // cryptid + UFO + ghost encounters.
  piloerection: {
    keywords: [
      // hair-raising
      'hair stood on end', 'hair stood', 'hair on end', 'hair raising',
      'hair-raising',
      // goosebumps
      'goosebumps', 'goose bumps', 'goose-bumps',
      // prickling / tingling
      'prickling', 'prickling sensation', 'electrical sensation on skin',
      'tingling', 'tingling sensation',
      // possessive narrator (Hynek's literary marker)
      'the hairs on my arm', 'hairs on my neck', 'hairs on my arms stood',
      // canonical
      'piloerection',
    ],
    pretty_label: 'piloerection (hair-raising sensation)',
    phen_families_default: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
  },

  /* ===================================================================== */
  /* Legacy entries — preserved so existing Hint matchers keep compiling   */
  /* against the old DescriptorFamily slugs. Sprint 1B does NOT publish    */
  /* a Finding for any of these; they remain Hint-only.                    */
  /* ===================================================================== */

  // static_electricity — DROPPED in V11.18.6 (Sprint 1C).
  //
  // The bare 'static' keyword was the single largest false-positive source
  // in the Sprint 1B audit (matched "static vigil", "stationary",
  // "static-line", "static-like noise" — none of which describe a
  // piloerection / static-electricity sensation). The DescriptorFamily
  // enum value 'static_electricity' is preserved for backwards-compat
  // with seed-hints.ts references, but the vocabulary entry is removed
  // so that any code path scanning for it returns zero matches. New
  // code should use `piloerection` (which carries the cleaned-up
  // keyword set targeting the Hynek "hair stood on end" marker).

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

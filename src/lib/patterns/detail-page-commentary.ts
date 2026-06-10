// V11.18.8 — Sprint 1D fixes — Scholarly commentary for the detail page.
//
// Per-descriptor static prose for `/lab/patterns/[slug]`. The voice
// here is the scholarly-companion register (NYT-data-journalism +
// footnote). Sources are paraphrased from PATTERNS_TAXONOMY.md §2
// — no direct quotes from primary works (we cite the taxonomy memo
// which is the citable secondary source). Where the taxonomy memo
// names a researcher and a finding (e.g., "Cheyne documented felt-
// presence as a stable SP feature"), we restate the relationship
// neutrally without inventing quoted material.
//
// Editorial guardrail — this is the click-down layer; lay-person
// glosses are required only on FIRST mention of a taxonomy term
// (e.g., "sleep paralysis (SP)", "near-death experience (NDE)").
// Subsequent uses can use the term unglossed.
//
// V11.18.8 — Sprint 1D AUDIT corrections. Every entry below was
// audited claim-by-claim against PATTERNS_TAXONOMY.md §2 and (where
// the memo summarised a primary work without quoting it) WebSearch-
// verified against the actual paper. The following corrections were
// applied:
//
//   shadow_figure:
//     - "three stable hallucinatory features — alongside felt presence
//       and pressure on the chest" → REMOVED. Cheyne's three factors
//       are Intruder / Incubus / Vestibular-Motor (factor-level
//       groupings, NOT three individual symptoms). The shadow figure
//       is one element WITHIN the Intruder factor. Rewritten to track
//       the taxonomy directly.
//     - "single most consistent visual element" → SOFTENED. Hufford
//       1982 documents the bedroom figure but does not single it out
//       as "the single most consistent" visual.
//
//   tunnel_imagery:
//     - "tunnel passage as one of the four canonical phenomenological
//       clusters" → CORRECTED. Greyson's four "components" are
//       Cognitive / Affective / Paranormal / Transcendental. The
//       tunnel is one ITEM within the Transcendental component, not
//       a component itself.
//
//   obe_observer_from_above:
//     - "Parnia et al.'s AWARE I and II prospective resuscitation
//       studies attempted to falsify the self-from-above account
//       empirically with bedside visual targets" → KEPT (verified
//       against the AWARE design — they used ceiling-shelf images
//       invisible from the bed; none of the recalled OBEs identified
//       the image).
//     - "Blanke et al. ... temporo-parietal-junction stimulation
//       reliably produces the observer-from-above perspective"
//       → SOFTENED to "documented an autoscopy-class experience in a
//       single case via temporo-parietal-junction stimulation." Blanke
//       2004 was a single-case study, not a reliable-produces claim.
//
//   paralysis:
//     - Hopkins/Missing-Time paralysis attribution → KEPT (verified;
//       Hopkins documented paralysis-at-onset as a recurrent symptom
//       across his case files).
//
//   sensed_presence:
//     - Cheyne 2001 paper title given as "Felt Presence: Paranoid
//       Delusions and the Nature of Spatial Imagery" → FABRICATED
//       subtitle. CORRECTED to the actual title: "The ominous
//       numinous: Sensed presence and 'other' hallucinations"
//       (Journal of Consciousness Studies, 2001).
//     - "Persinger ... reliably produced felt-presence sensations in
//       laboratory subjects" → SOFTENED. Persinger reported the
//       effect but the Granqvist 2005 double-blind replication
//       failed to reproduce it; "reliably produced" is contested.
//       Rewritten to "reported" (Persinger's claim) with the
//       replication-disputed framing implicit in the documentary
//       register.
//
//   reunion_with_deceased:
//     - "Stevenson's 1982 JASPR paper on apparitions catalogues the
//       same descriptor in the deathbed-vision and after-death-
//       communication (ADC) literature" → OVERREACH. Stevenson 1982
//       was specifically about apparitions and survival evidence,
//       NOT deathbed visions (that literature is Barrett / Osis &
//       Haraldsson). REMOVED the deathbed-vision attribution; kept
//       the apparition framing with the correct paper scope.
//
//   piloerection:
//     - "Hynek's CE2 case files document piloerection as a precursor
//       cue" → FABRICATED. Taxonomy A8 cites Tyrrell, SPR, Coleman
//       for piloerection — NOT Hynek. REMOVED.
//     - "Strieber's 1987 Communion describes the same descriptor
//       inside the abduction-onset narrative" → REMOVED. Strieber is
//       not cited for A8 in the taxonomy; the Communion text does
//       describe sensory anomalies, but the specific piloerection
//       attribution isn't anchored to the taxonomy memo.

import { getDescriptorKeywords, getDescriptorPrettyLabel } from './descriptor-vocabulary'
import type { DescriptorCommentary } from '@/components/patterns/finding-detail-types'

/**
 * The shipped commentary set — keyed by descriptor slug. Each entry
 * names the keyword set + 2-3 paragraphs of scholarly framing. Entries
 * mirror the publish list in scripts/seed-patterns-v1.ts. Unknown
 * descriptors fall back to a generic template generated at runtime
 * by `buildDescriptorCommentary()`.
 */
var COMMENTARY: Record<string, DescriptorCommentary> = {
  shadow_figure: {
    measuring:
      "Paradocs counts an account as describing a shadow figure when the witness mentions a dark, " +
      "humanoid-shaped presence — shadow person, shadow man, hatted figure, dark form, dark silhouette, " +
      "a figure in the doorway or at the foot of the bed. The keyword set is intentionally phrase-length " +
      "and excludes the bare word 'figure' (which would otherwise match every 'the figure of the craft' " +
      "or 'a small figure on the horizon' false positive in the UFO corpus).",
    literature: [
      "Cheyne and Girard's 2007 prospective study of sleep-paralysis (SP) episodes documents a dark " +
      "humanoid presence as a recurring element of what they call the Intruder factor — one of three " +
      "factor-level clusters (Intruder, Incubus, Vestibular-Motor) their work identifies in the structure " +
      "of SP hallucinations.",
      "David Hufford's 1982 fieldwork on the Newfoundland 'Old Hag' tradition — published as " +
      "The Terror That Comes in the Night — argued that the SP experience is structurally consistent " +
      "across centuries and cultures, with a dark figure at or near the bed appearing as a recurring " +
      "visual element. The ghost-haunting literature describes similar figures under different labels.",
      "Cardeña, Lynn, and Krippner's Varieties of Anomalous Experience (APA, 2nd ed., 2014) reviews " +
      "the shadow-figure pattern across SP, hauntings, and abduction-onset reports and treats the " +
      "cross-context recurrence as a notable convergence in the survey literature.",
    ],
  },

  tunnel_imagery: {
    measuring:
      "Paradocs counts an account as describing tunnel imagery when the witness mentions being pulled " +
      "through a dark passage — tunnel, corridor, vortex, funnel, spiral, dark cylinder, light at the " +
      "end, end of the tunnel. The keyword set is built around phrase-length variants so that bare " +
      "'tunnel' substrings inside literal architecture descriptions (a real road tunnel, a subway " +
      "tunnel) are not the primary match.",
    literature: [
      "Raymond Moody's 1975 Life After Life laid down the original 15-element near-death-experience " +
      "(NDE) template; tunnel imagery appears as the third element of the sequence Moody catalogued. " +
      "Bruce Greyson's 16-item NDE Scale (Journal of Nervous and Mental Disease, 1983) — organised " +
      "into four components (Cognitive, Affective, Paranormal, Transcendental) — incorporates the " +
      "tunnel motif within the Transcendental component.",
      "Pim van Lommel's 2001 Lancet study and his 2010 monograph Consciousness Beyond Life report the " +
      "tunnel as a feature of cardiac-arrest NDE accounts that recurs across the Dutch prospective " +
      "cohort. The AWARE I and II resuscitation studies (Parnia et al., 2014; 2023) describe similar " +
      "phenomenology in multi-center samples.",
      "The tunnel also appears in a thinner subset of out-of-body-experience (OBE) onset reports and " +
      "in meditation-induced altered-state accounts; Cardeña 2014 places it in the broader category of " +
      "dissolution-of-spatial-boundary experiences rather than treating it as an NDE-only motif.",
    ],
  },

  electromagnetic_disturbance: {
    measuring:
      "Paradocs counts an account as describing electromagnetic disturbance when the witness mentions " +
      "instruments behaving abnormally during the encounter — watches stopping, batteries draining, " +
      "engines stalling, headlights dimming, radios cutting out, lights flickering, ignitions dying. " +
      "Hynek's Close Encounters of the Second Kind (CE2) taxonomy is the original frame for this " +
      "cluster; the keyword set adds the contemporary equivalents (phones dying, electronics " +
      "malfunctioning) drawn from the modern corpus.",
    literature: [
      "J. Allen Hynek's 1972 The UFO Experience introduced the Close Encounters classification and " +
      "named CE2 cases — encounters with physical or electromagnetic effects on the environment — as " +
      "a distinct evidentiary tier. Jacques Vallée's 1990 Confrontations extended the catalog of " +
      "physical-correlate cases in the global UFO record.",
      "William Roll's 1972 The Poltergeist documents an analogous family of electromagnetic effects " +
      "in the haunting / recurrent-spontaneous-psychokinesis (RSPK) literature, treating focal-person " +
      "anomalies around electrical equipment as a structural feature of those cases. John Keel's 1975 " +
      "The Mothman Prophecies catalogued similar effects in cryptid encounters around the West Virginia " +
      "'window areas.'",
      "The Paradocs corpus reports the descriptor at meaningfully different per-family rates (UFO, " +
      "ghost, cryptid). The cross-family persistence — not the absolute rate in any single family — " +
      "is what makes the pattern interesting against the editorial baseline.",
    ],
  },

  obe_observer_from_above: {
    measuring:
      "Paradocs counts an account as describing an out-of-body-experience (OBE) observer-from-above " +
      "perspective when the witness mentions watching themselves from above, looking down on their " +
      "own body, separation from the body, or a ceiling-view of the scene. The keyword set targets " +
      "the canonical NDE phrasing ('I was looking down at my own body') and the meditation / lucid- " +
      "dream variant ('floated above myself').",
    literature: [
      "The observer-from-above perspective is item 14 on Bruce Greyson's NDE Scale (1983), and Moody " +
      "1975 lists 'out of the body' as the fourth element of his NDE template. Both the NDE and the " +
      "OBE literatures treat the perspective as a canonical phenomenological marker.",
      "Parnia et al.'s AWARE I (2014) and AWARE II (2023) prospective resuscitation studies tested " +
      "the self-from-above account empirically by placing visual targets on high shelves invisible " +
      "from the bed; no recalled OBE in the AWARE samples identified the target image. Cardeña 2014's " +
      "chapter on OBE phenomenology reviews the same family of reports inside meditation-induced and " +
      "sleep-paralysis-induced contexts.",
      "Blanke et al. (Brain, 2004) reported an autoscopy-class experience in a single case during " +
      "temporo-parietal-junction stimulation, contributing to the neurological-origin framing of " +
      "the OBE perspective. The Paradocs corpus does not adjudicate between the neurological and the " +
      "phenomenological framings — it tracks the descriptor's prevalence across phen families.",
    ],
  },

  paralysis: {
    measuring:
      "Paradocs counts an account as describing paralysis at onset when the witness mentions being " +
      "unable to move at the start of the experience — paralyzed, frozen, couldn't move, body wouldn't " +
      "respond, pinned, immobilized, limbs wouldn't move, something held them in place. The keyword " +
      "set excludes metaphorical 'frozen in time' uses by requiring the phrase to anchor to a body- " +
      "state subject (limbs, body, arms, legs).",
    literature: [
      "Cheyne et al.'s sleep-paralysis (SP) work — most prominently the 1999 Consciousness and " +
      "Cognition paper on hypnagogic and hypnopompic hallucinations during sleep paralysis — " +
      "establishes paralysis at onset as the defining feature of SP. David Hufford's 1982 The Terror " +
      "That Comes in the Night argued from folkloric evidence that the SP paralysis is the same " +
      "experience the Newfoundland 'Old Hag' tradition described centuries before the clinical " +
      "literature named it.",
      "John Mack's 1994 Abduction documents paralysis at onset as a recurring marker of the UFO- " +
      "abduction phenomenology — what the experiencer reports as 'I couldn't move,' often preceded by " +
      "a buzzing sound. Budd Hopkins's 1981 Missing Time documents the same opening symptom across " +
      "his abduction case files.",
      "The Paradocs corpus shows paralysis at near-saturation inside the sleep-paralysis-coded " +
      "subfamily of perception_sensory — a tautology, not a finding. The Finding tracks where the " +
      "same opening symptom appears in accounts that were NOT diagnosed as SP — the NDE / OBE cluster " +
      "and the UFO encounters that report the locked-in onset as their entry point.",
    ],
  },

  time_dilation: {
    measuring:
      "Paradocs counts an account as describing time dilation when the witness mentions time slowing, " +
      "stopping, stretching, or compressing during the experience — time stood still, time stopped, " +
      "minutes felt like hours, hours felt like minutes, lost track of time, missing time, the clock " +
      "skipped, came to later. The keyword set spans the subjective-stretch variants (NDE / meditation) " +
      "and the missing-time abduction-discontinuity variants (Hopkins / Mack).",
    literature: [
      "Time distortion is item 1 of Bruce Greyson's NDE Scale (1983) and a recurrent feature of van " +
      "Lommel's 2001 Lancet cardiac-arrest cohort. Cardeña 2014's chapter on altered states treats " +
      "subjective time dilation as one of the most frequently reported phenomenological markers of " +
      "meditative and mystical experience.",
      "Budd Hopkins's 1981 Missing Time established the abduction-time-loss pattern as a distinct " +
      "structural feature — an unaccounted-for interval the witness could not reconstruct. Mack's " +
      "1994 Abduction and Bullard's 1987 UFO Abductions: The Measure of a Mystery both treat the " +
      "missing-time interval as a canonical element of the abduction-narrative episode structure.",
      "The Paradocs surface tracks the same descriptor across the subjective-stretch and the missing- " +
      "time variants without committing to any thesis that the two are evidence of a single " +
      "underlying phenomenon. The corpus reports the rate; the reader infers the relationship.",
    ],
  },

  hypnagogic_state: {
    measuring:
      "Paradocs counts an account as describing the hypnagogic (drowsy / falling-asleep) onset state " +
      "using the structured `reports.witness_state_at_event = 'drowsy_falling_asleep'` enum field — " +
      "not a keyword scan. The enum is set during ingestion when the witness describes drifting off, " +
      "being half-asleep, the moment of waking, or the in-between state at the boundary of sleep " +
      "and consciousness.",
    literature: [
      "Cheyne et al.'s sleep-paralysis (SP) papers — across the 1999, 2002, 2005, and 2007 sequence — " +
      "establish the hypnagogic and hypnopompic onset as the canonical context for SP. Hufford's 1982 " +
      "fieldwork on the Old Hag tradition documents the same onset state across pre-clinical folklore.",
      "Cardeña 2014's chapter on lucid dreaming and SP treats the boundary between sleep and waking " +
      "as a unifying onset state across SP, OBE-induction practices, and the bedroom-onset variant " +
      "of the UFO-abduction literature. The same liminal state appears across families that " +
      "otherwise share little.",
      "The descriptor is one of the few in the Paradocs catalogue sourced from a structured enum " +
      "rather than a keyword scan, which gives it a tighter denominator floor than the text-scan " +
      "descriptors.",
    ],
  },

  sensed_presence: {
    measuring:
      "Paradocs counts an account as describing a sensed presence when the witness mentions feeling " +
      "watched, accompanied, or observed without seeing or hearing anything — felt presence, presence " +
      "in the room, eyes on me, someone there, not alone. The keyword set excludes mention of a " +
      "visible figure (which routes to the shadow-figure descriptor instead); a sensed presence is " +
      "the explicitly invisible / unconfirmed-by-sight variant.",
    literature: [
      "J. Allan Cheyne's 2001 paper 'The ominous numinous: Sensed presence and other hallucinations' " +
      "(Journal of Consciousness Studies) treats the sensed presence as a recurring feature of sleep " +
      "paralysis and argues it draws on the same body-schema / extrapersonal-space machinery the " +
      "brain uses for normal social perception.",
      "Michael Persinger's 1987 Neuropsychological Bases of God Beliefs reported temporal-lobe " +
      "stimulation that he characterised as producing felt-presence sensations in laboratory " +
      "subjects, framing the descriptor in neurological terms. SPR apparition surveys back to " +
      "Tyrrell's 1953 Apparitions catalogue the same descriptor across the ghost-encounter literature " +
      "without the laboratory frame.",
      "BFRO field surveys and Loren Coleman's 2002 Mothman and Other Curious Encounters document " +
      "the same descriptor in cryptid-encounter reports — the witness reports the sense of being " +
      "watched in the forest before the visual encounter. The Paradocs surface tracks the cross- " +
      "family persistence rather than committing to a single explanatory frame.",
    ],
  },

  reunion_with_deceased: {
    measuring:
      "Paradocs counts an account as describing a reunion with a deceased loved one when the witness " +
      "mentions encountering a relative or friend who had died — met my mother, saw my grandfather, " +
      "deceased relative, came to greet me, welcomed me, was waiting for me, my late grandmother. " +
      "The keyword set is intentionally relational (possessive narrator + kinship term) to filter " +
      "out generic encounters with unspecified figures.",
    literature: [
      "Moody's 1975 Life After Life lists meeting deceased relatives as element 9 of the near-death- " +
      "experience template, and Greyson's NDE Scale (1983) carries it as item 13. Van Lommel's 2001 " +
      "Lancet cohort and Greyson's After (2021) report the descriptor at stable rates inside the " +
      "NDE-family subset of the cardiac-arrest population.",
      "Ian Stevenson's 1982 Journal of the American Society for Psychical Research paper, 'The " +
      "Contribution of Apparitions to the Evidence for Survival,' analysed apparition cases drawn " +
      "from the 1886 SPR collection Phantasms of the Living and treated encounters with deceased " +
      "agents as a structural element of the apparition record. The deathbed-vision and after-death- " +
      "communication (ADC) literatures (Barrett; Osis & Haraldsson) describe related but distinct " +
      "encounter classes.",
      "The Paradocs surface treats the descriptor as a corpus pattern, not a survival-of-consciousness " +
      "claim. The Finding reports the recurrence; the editorial register avoids the woo-framing the " +
      "popular literature reaches for.",
    ],
  },

  animal_witness_reaction: {
    measuring:
      "Paradocs counts an account as describing an animal-witness reaction when the witness mentions " +
      "an animal — dog, cat, horse, cattle, deer, bird — behaving unusually before or during the " +
      "encounter. The keyword set spans plural and singular forms, species-specific reactions " +
      "(horses neighed, cattle bellowed, the chickens scattered), refusal / fleeing / silence variants " +
      "(the dog wouldn't go near, birds went quiet), and the Hynek-canonical possessive narrator " +
      "form ('my dog refused', 'all the dogs in the neighborhood').",
    literature: [
      "J. Allen Hynek's 1972 CE2 (Close Encounters of the Second Kind) tier named animal-witness " +
      "reactions — dogs barking, livestock fleeing, horses spooking — among the physical correlates " +
      "of UFO encounters. Hynek's case files document the descriptor as a precursor cue rather " +
      "than as a post-hoc inference.",
      "SPR ghost reports back to Gurney, Myers, and Podmore's 1886 Phantasms of the Living record " +
      "the same descriptor in haunting accounts. Loren Coleman's 2002 Mothman and Other Curious " +
      "Encounters catalogues animal-reaction precursors across the cryptid-encounter literature, and " +
      "BFRO field surveys treat the descriptor as a recurring precursor signal in their case notes.",
      "The descriptor is structurally hard to detect at scale: NUFORC-style short-form reports tend " +
      "to be witness-centered and skip the environmental context. The Paradocs corpus expansion " +
      "across Sprint 1C and Sprint 1D aimed to surface the literary register Hynek's case files " +
      "preserve while keeping the false-positive rate low.",
    ],
  },

  piloerection: {
    measuring:
      "Paradocs counts an account as describing piloerection (the hair-raising sensation) when the " +
      "witness mentions hair standing on end, goosebumps (US / UK spellings), gooseflesh, a prickling " +
      "or tingling sensation on the skin, an electrical sensation, or the canonical phrase 'hair " +
      "stood on end.' The keyword set excludes bare 'static' — which was the single largest false- " +
      "positive source in earlier sprints (matching 'static vigil,' 'stationary,' 'static-like') — " +
      "and bare 'skin crawled,' which reads as disgust rather than sympathetic-nervous arousal.",
    literature: [
      "G. N. M. Tyrrell's 1953 SPR survey Apparitions catalogues piloerection-class precursor " +
      "sensations in apparition and ghost-encounter accounts; the Society for Psychical Research " +
      "case files treat it as part of the cold-spot / temperature-drop / pressure cluster of " +
      "precursor effects that recur in haunting reports.",
      "Loren Coleman's 2002 Mothman and Other Curious Encounters and the BFRO Bigfoot-encounter " +
      "literature describe the descriptor in cryptid-encounter precursor moments — the hiker reports " +
      "the sensation of the hair on their neck standing up shortly before the visual encounter.",
      "The Paradocs surface tracks the cross-family overlap; PATTERNS_TAXONOMY.md §2.A8 places the " +
      "descriptor in the perceptual / sensory anomaly domain across ghost, UFO, and cryptid " +
      "encounter families. The three traditions converge on a similar sympathetic-nervous-system " +
      "signature as a precursor element.",
    ],
  },
}

/**
 * Look up the static commentary for a descriptor. Falls back to a
 * generated template if the descriptor is unknown.
 */
export function getDescriptorCommentary(descriptor: string): DescriptorCommentary {
  var entry = COMMENTARY[descriptor]
  if (entry) return entry
  return buildFallbackCommentary(descriptor)
}

/**
 * Generic fallback. Renders a paragraph that names the keyword set
 * and one paragraph that points the reader to PATTERNS_TAXONOMY.md
 * (the citable secondary source) — so an unknown descriptor never
 * crashes the page or surfaces empty.
 */
function buildFallbackCommentary(descriptor: string): DescriptorCommentary {
  var label = getDescriptorPrettyLabel(descriptor)
  var keywords = getDescriptorKeywords(descriptor)
  var kwSample = keywords.slice(0, 8).join(', ')
  return {
    measuring:
      "Paradocs counts an account as describing " + label + " when the witness mentions any of a " +
      "documented keyword set including: " + (kwSample || '(no keywords on file)') + ".",
    literature: [
      "This descriptor is catalogued in the Paradocs cross-phenomenon pattern taxonomy " +
      "(PATTERNS_TAXONOMY.md), drawn from the survey and field literatures on the corresponding " +
      "phenomenon families. The Finding tracks the corpus-level recurrence of the descriptor across " +
      "those families.",
    ],
  }
}

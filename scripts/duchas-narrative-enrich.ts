#!/usr/bin/env npx tsx
/**
 * Dúchas clean-room narrative enrichment — HARD-GATED, DO NOT ENABLE.
 *
 * Status: DISABLED pending written permission from NFC/Gaois (same pattern as
 * the erowid adapter). Permission email draft: docs/DUCHAS_ADAPTER_NOTES.md.
 * Gate: requires DUCHAS_NARRATIVE_PERMISSION=granted in the environment AND
 * a dated permission reference in the PERMISSION_RECORD constant below.
 *
 * Why this exists now: this file is the reviewable specification of the
 * clean-room two-step we are asking NFC/Gaois to bless. It is intentionally
 * complete on prompts and incomplete on wiring.
 *
 * The clean-room two-step:
 *   Step 1 (FACT EXTRACTION): Haiku reads the CC BY-NC transcript text
 *     transiently and emits a structured FACT SHEET — entities, places, motif,
 *     claimed events, informant role, outcome. JSON only. No prose carried over.
 *     The transcript text is then discarded; only sha256(original) is kept,
 *     matching the existing source_body_sha256 audit-trail posture.
 *   Step 2 (NARRATIVE): A second Haiku call writes an original Gaia-voice
 *     narrative FROM THE FACT SHEET ONLY. It never sees the source prose, so
 *     it cannot reproduce the source's expression (clean-room separation).
 *
 * Cost (at current Haiku batch rates): ~$0.0008/report for both steps.
 */

const PERMISSION_RECORD: { granted: boolean; reference: string | null } = {
  granted: false,
  reference: null, // e.g. "Email from gaois@dcu.ie, 2026-06-XX, see docs/DUCHAS_PERMISSION.pdf"
};

if (process.env.DUCHAS_NARRATIVE_PERMISSION !== 'granted' || !PERMISSION_RECORD.granted) {
  console.error(
    '[duchas-narrative-enrich] DISABLED.\n' +
      'Dúchas transcripts are CC BY-NC 4.0 (© National Folklore Collection, UCD).\n' +
      'This pipeline must not run until NFC/Gaois grant written permission.\n' +
      'See docs/DUCHAS_ADAPTER_NOTES.md for the permission email draft and posture.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1 prompt — transcript → fact sheet (transcript is transient input)
// ---------------------------------------------------------------------------
export const FACT_SHEET_PROMPT = `You are extracting structured facts from a 1937-39 Irish Schools' Collection folklore transcript. Output ONLY JSON matching this schema — no prose, no quotations, no phrases copied from the source:

{
  "motif": string,              // e.g. "banshee heralds family death"
  "entities": string[],         // supernatural beings/figures, generic terms only
  "claimed_events": string[],   // each a short factual clause IN YOUR OWN WORDS
  "place_names": string[],      // proper nouns are facts; include as written
  "time_markers": string[],     // e.g. "one night", "around 1890", "every November"
  "informant_role": string,     // e.g. "elderly neighbour", "the pupil's grandmother" — NO NAMES
  "outcome": string,            // how the account ends, in your own words
  "beliefs_practices": string[] // folk beliefs/practices mentioned
}

Rules: never include personal names of informants, collectors, or living persons. Never copy a sentence, clause, or distinctive phrase from the transcript. Place names and factual events are facts and are fine.`;

// ---------------------------------------------------------------------------
// Step 2 prompt — fact sheet → original narrative (never sees the transcript)
// ---------------------------------------------------------------------------
export const NARRATIVE_PROMPT = `You are writing a short original narrative for Paradocs from a structured fact sheet describing an Irish folklore account collected for the Schools' Collection (1937-39). You have NOT seen the original text and must not imitate any source.

Voice: documentary register, Gaia-aligned — lead with the qualitative finding, plain-English settings, close with a two-clause line about what the account means within the wider pattern. 90-140 words. Present the account as what was told/believed, not as verified fact ("Locals held that…", "The story goes…"). No personal names. End by noting the account is preserved in the National Folklore Collection.

Input fact sheet follows as JSON.`;

// ---------------------------------------------------------------------------
// Pipeline wiring — TODO once permission lands:
//  1. Select reports WHERE source_type='duchas' AND metadata->>'hasTranscript'='true'
//     AND metadata->>'factsOnly'='true'
//  2. Re-fetch volume pages via duchasFetch, join page.Transcripts on metadata.itemId
//  3. sha256(transcript text) → source_body_sha256 (existing column/posture)
//  4. Haiku batch: FACT_SHEET_PROMPT (transcript transient, never persisted)
//  5. Haiku batch: NARRATIVE_PROMPT (fact sheet only)
//  6. Update reports.description with the narrative; set metadata.factsOnly=false,
//     metadata.narrativeMethod='clean-room-two-step', metadata.permissionRef=PERMISSION_RECORD.reference
//  7. Cost-cap + heartbeat per nuforc-mass-ingest.ts conventions
// ---------------------------------------------------------------------------

console.log('Wiring not implemented — see TODO block. This file is a gated specification.');
process.exit(0);

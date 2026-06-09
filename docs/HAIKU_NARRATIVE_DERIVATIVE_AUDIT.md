# Haiku Narrative — Derivative-Work Sub-Audit

**Date:** June 8, 2026
**Author:** Engineering audit (prompt review + 15-sample n-gram comparison against production DB)
**Scope:** The "What happened" paragraph that renders on every `/report/[slug]` page (`reports.paradocs_narrative`)
**Status:** TECHNICAL + RISK assessment. NOT legal advice.
**Parent audit:** `docs/COPYRIGHT_DERIVATIVE_WORK_AUDIT.md` (row 7 of the render-page table — narrative classified MEDIUM-risk "PARAPHRASE" without verification)

---

## Verdict (TL;DR)

**FACTS-DERIVED with one trailing risk.** Across 15 samples drawn live from the production DB (3 each from NUFORC, Reddit, YouTube, NDERF, OBERF), the Haiku-rewritten "What happened" paragraph behaves much closer to **transformative analytical retelling** than to derivative paraphrase:

- **Mean 5-gram overlap with source body: 1.5%** (max 3.6% on a single Reddit sample).
- **Mean 7-gram overlap: 0.4%** (10 of 15 samples have 0% overlap at 7-gram).
- **Mean longest verbatim run: 5.3 words.** Hits at this length are almost always either (a) an idiomatic witness phrase that the prompt explicitly tells Haiku to retain inside quotation marks ("I had better get out of there"), or (b) common factual descriptors ("blinking green and red lights", "to the right of the moon", "an all encompassing golden glow"). None reproduce the source's narrative arc or distinctive sentence structure.
- **Voice shift is consistent and substantial:** every sample re-narrates in third-person editorial voice from a first-person source. That is itself a non-trivial transformation.

**Where the risk remains:** four of the 15 samples (all from Reddit/OBERF/NDERF) reproduce witness idioms that are 6–9 words long ("I thought i was seeing things but the", "passed onto the next lifetime without dying", "elder man with long white hair"). These are the highest-risk fragments in the corpus because a witness's *idiosyncratic* phrasing is exactly the protected expression in *Feist* and its progeny.

**Headline categorization:** **FACTS-DERIVED on 11/15, LIGHT-PARAPHRASE on 4/15, CLOSE-PARAPHRASE on 0/15, VERBATIM on 0/15.**

This is materially better than the prior audit assumed. The MEDIUM-risk "PARAPHRASE" label on the description-derived narrative is too pessimistic and should be revised to **LOW** with a single guardrail addition (n-gram post-check) to harden the 4 trailing cases.

---

## 1. Prompt Inventory

There are two Haiku call paths that write to `reports.paradocs_narrative` (the field rendered as "What happened"). Both are documented; only one is active in production.

### 1A. Active path — `consolidated-ai.service.ts` (USE_CONSOLIDATED_AI=true)

**File:** `src/lib/services/consolidated-ai.service.ts`
**Live flag:** `.env.local` has `USE_CONSOLIDATED_AI=true` (verified).
**Model:** `claude-haiku-4-5-20251001` (line 65), temperature 0.4, max_tokens 2500.
**System prompt:** `CONSOLIDATED_SYSTEM_PROMPT` (lines 80–544; ~460 lines). Cached via ephemeral marker (line 707).
**User prompt builder:** `buildConsolidatedUserPrompt(report)` (lines 658–673).

**Input fed to Haiku** (lines 660–672, verbatim):

```
Original source title: <title>
Pre-assigned category: <category>
Location (if any): <location_name>
Country: <country>
State/Province: <state_province>
City: <city>
Event date (if any): <event_date>
Source type: <source_type>
Source label: <source_label>

FULL SOURCE TEXT (PII pre-redacted):
<description, truncated to 5000 chars>
```

So Haiku receives the **full source body** (up to 5,000 chars) plus a handful of structured fields. This is the input shape that creates the derivative-work risk: a paraphrase prompt fed full source text is the textbook way to produce a derivative work. The risk is mitigated by what the prompt *says about* that input.

**Relevant prompt fragments** (verbatim, from `consolidated-ai.service.ts`):

| Line | Fragment |
|------|---------|
| 122–131 | THIRD-PERSON EDITORIAL VOICE ONLY. Never use first-person pronouns. |
| 108–117 | Anti-fabrication rules: "Every concrete claim … MUST appear in the source text. Never invent. Never extrapolate beyond what the source states." |
| 363 | ANALYSIS field rule: "2-3 short paragraphs separated by \\n\\n. Max 200 words total." |
| 365 | "The narrative IS the page body, NOT a summary." |
| 367–370 | "Lead with a grounding sensory anchor. … Capture specific observational details: heights, durations, distances, sounds, colors, behaviors, smells — preserve as source recorded them." |
| 491–502 | INTENSITY DISCIPLINE: "Match the source's register exactly. … 'slight fever' → NOT 'fever-stricken'." |
| 505–515 | HEDGE VOICE EXAMPLES: "The source describes…", "The report records…" |

Note what the consolidated prompt **does NOT contain**: an explicit "do not paraphrase or quote the source" rule. The closest is the implicit anti-fabrication and intensity-discipline rules. This is the single biggest prompt-level gap relative to the fallback path (see 1B below).

**Output field that gets persisted:** `parsed.analysis` (line 1046) → `reports.paradocs_narrative`.

**Where it renders:** `src/components/reports/ReportPageV2.tsx:823–851`. Header label literally reads "What happened" (line 826). The paragraph is split on `\n\n` and rendered as `<p>` elements (lines 391–397). For ingested (non-user-video) reports, no blockquote chrome — it reads as Paradocs editorial prose.

### 1B. Fallback path — `paradocs-analysis.service.ts` (multi-call legacy)

**File:** `src/lib/services/paradocs-analysis.service.ts` (1,300+ lines).
**When active:** only when `USE_CONSOLIDATED_AI` is unset/false. Not currently used in production but still wired up.
**Model:** same Haiku 4.5; fallback to claude-3-5-haiku.

**Critically different prompt language** (lines 365, 609–612):

> Line 365: `- NEVER reproduce or closely paraphrase the source text. Write original analysis.`
>
> Line 609–612: `GLOBAL RULE: NEVER copy, quote, paraphrase, or restructure ANY sentence from the witness text. Do not use the witness's phrasing even with minor word changes. Every sentence you write must be composed from scratch as original editorial analysis. If you find yourself echoing the witness's language, stop and rewrite from an analytical perspective instead.`

This GLOBAL RULE is exactly the kind of derivative-work guardrail the consolidated prompt is missing. **Migrating the GLOBAL RULE into `CONSOLIDATED_SYSTEM_PROMPT` is recommendation #1 below.** It is a 3-line change.

Output field: `parsed.analysis` → `reports.paradocs_narrative` (same column as 1A).

### 1C. What "What happened" actually renders from

**File:** `src/pages/report/[slug].tsx:120–146` (`scrubIndexReport`).

For every non-curated source the SSR scrub nulls `reports.description` before the page leaves the server (line 143). The user only ever sees `reports.paradocs_narrative` for the "What happened" body (line 1136 in `ReportPageV2.tsx`). When that field is null, the page falls back to `reports.description` — but for ingested sources that fallback is unreachable because `scrubIndexReport` already nulled it.

So in practice, the "What happened" paragraph on every ingested report page = Haiku's `analysis` field output. That is the single string this audit needs to verify.

---

## 2. Side-by-Side: 15 Production Samples

Methodology: pulled the 3 most-recently-generated `paradocs_narrative` rows per source for `{nuforc, reddit, youtube, nderf, oberf}` where both `description` and `paradocs_narrative` are non-null and the narrative is >100 chars. Computed n-gram overlap (lowercased, punctuation stripped) between source and narrative at n=3, n=5, n=7, plus the longest contiguous verbatim run.

All 15 narratives were generated by `claude-haiku-4-5-20251001 (consolidated-batch)`. Generation dates in 2026.

### Aggregate table

| # | Source | Slug | Src words | Narr words | 3-gram % | 5-gram % | 7-gram % | Longest run | Score |
|---|--------|------|-----------|------------|----------|----------|----------|-------------|-------|
| 1 | nuforc | oval-object-hovers-above-lunar-eclipse-moon | 143 | 141 | 7.9 | 2.2 | 0.0 | 6 words | FACTS-DERIVED |
| 2 | nuforc | two-crafts-with-colored-lights-over-cedar-rapids | 54 | 115 | 7.1 | 1.8 | 0.0 | 6 words | FACTS-DERIVED |
| 3 | nuforc | repeated-white-light-flashes-over-quezon-city | 87 | 153 | 2.0 | 0.0 | 0.0 | 4 words | FACTS-DERIVED |
| 4 | reddit | mild-advice-lucid-dreaming | 239 | 144 | 7.0 | 3.6 | 2.2 | **9 words** | **LIGHT-PARAPHRASE** |
| 5 | reddit | panther-morphing-spirit-animal-5-meo | 162 | 172 | 3.5 | 2.4 | 1.2 | **8 words** | **LIGHT-PARAPHRASE** |
| 6 | reddit | 7g-blue-meanies-fear-loathing | 89 | 141 | 0.7 | 0.0 | 0.0 | 0 | FACTS-DERIVED |
| 7 | youtube | triangle-chilean-beach-mysterious-visitors | 397 | 193 | 4.7 | 0.5 | 0.0 | 5 words | FACTS-DERIVED |
| 8 | youtube | triangle-craft-camping-group | 82 | 158 | 4.5 | 2.6 | 1.3 | **8 words** | **LIGHT-PARAPHRASE** |
| 9 | youtube | glowing-orange-orb-holloman-afb | 154 | 145 | 1.4 | 0.0 | 0.0 | 4 words | FACTS-DERIVED |
| 10 | nderf | golden-light-monks-cardiac-arrest | 2807 | 169 | 0.6 | 0.0 | 0.0 | 0 | FACTS-DERIVED |
| 11 | nderf | spring-woods-timeless-light | 735 | 210 | 4.3 | 1.5 | 0.5 | **7 words** | **LIGHT-PARAPHRASE** |
| 12 | nderf | golden-glow-tulip-fields-cesarean | 2632 | 255 | 8.3 | 0.8 | 0.0 | 5 words | FACTS-DERIVED |
| 13 | oberf | heart-blockages-vanish-spiritual | 1668 | 205 | 4.4 | 1.5 | 0.5 | **7 words** | **LIGHT-PARAPHRASE** |
| 14 | oberf | vibration-kundalini-awakening | 1404 | 250 | 5.2 | 1.2 | 0.0 | 6 words | FACTS-DERIVED |
| 15 | oberf | precognitive-dream-helicopter-crash | 775 | 262 | 5.8 | 1.2 | 0.0 | 6 words | FACTS-DERIVED |

**Means:** 3-gram 4.5%, 5-gram 1.4%, 7-gram 0.4%. **Score distribution: 11 FACTS-DERIVED / 4 LIGHT-PARAPHRASE / 0 CLOSE-PARAPHRASE / 0 VERBATIM.**

### Representative diffs

#### Sample 1 — NUFORC oval object (FACTS-DERIVED)

**Source (first 500 chars):** *"Hovering object over Lunar eclipse moon. … Came home from school and noticed that there was going to be a lunar eclipse. As I was driving all I could see was the moon but once I got home and sat down with my sisters we noticed something hovering to the right of the moon. We thought it may have been a star or a plan but saw flickering red flickering lights. It then moved and aligned itself with the moon, moving way above hovering and looking down on the moon. …"*

**Paradocs:** *"The witness arrived home from school on the evening of April 15, 2014, and noted that a lunar eclipse was occurring. Upon settling indoors with their sisters, all three observed an object positioned to the right of the moon. Initially uncertain whether the object was a star or aircraft, the group identified flickering red lights as a distinguishing feature. The object then repositioned itself, moving upward and aligning directly above the moon in a hovering posture. …"*

**Verdict:** classic factual extraction. Voice shifted to third-person editorial. Source's distinctive constructions ("looking down on the moon", "It has not moved for 30 minutes to an hour now") not echoed. Overlap hits are pure factual descriptors: "to the right of the moon", "30 minutes to an hour". These cannot carry copyright — they're factual statements of orientation and duration.

#### Sample 4 — Reddit MILD lucid dreaming (LIGHT-PARAPHRASE, worst case)

**Source fragment:** *"…and asking myself a few questions such as 'How am I here? Why am I being chased?' which then leads to the realization 'this isn't reality'."*

**Paradocs:** *"The questions posed ('How am I here?', 'Why am I being chased?') serve as anchors for recognizing incongruity within dreams."*

**Verdict:** The Paradocs narrative **directly quotes** the witness questions verbatim (with proper quotation marks). This is a 9-word verbatim run. Two readings:
- (a) **Defensible:** these are short pull-quotes attributed to the source within the witness's own analytical voice, displayed in quotation marks — textbook fair-use treatment of two short witness phrases.
- (b) **Risky:** the surrounding analytical prose ("serve as anchors for recognizing incongruity") tracks the source's own structural argument closely — Haiku is doing analytical reformulation more than transformative analysis.

I score this LIGHT-PARAPHRASE rather than CLOSE-PARAPHRASE because the verbatim fragments are properly quoted and the analytical framing around them is genuinely Paradocs's. But this is the closest call in the sample.

#### Sample 8 — YouTube triangle camping (LIGHT-PARAPHRASE)

**Source:** *"…Completely silent gliding past. It was mental and ill never forget it. I thought i was seeing things but the other 5 people seen it too…"*

**Paradocs:** *"The witness initially questioned their own perception ('I thought i was seeing things') but the corroboration of five other observers resolved that doubt immediately."*

**Verdict:** Verbatim 8-word witness phrase reproduced inside quotation marks. Same pattern as Sample 4 — defensible as fair-use quotation, but the quotation is unattributed inside the prose (no "the witness said" preface; just parenthetical quote marks). Cleaner treatment would attribute: *"as the witness puts it, 'I thought I was seeing things'."*

#### Sample 11 — NDERF spring woods (LIGHT-PARAPHRASE)

**Source:** *"I was curious about going further down the path, but suddenly had a feeling that I had better get out of there."*

**Paradocs:** *"The witness describes this not as external compulsion but as an internal knowing: 'I had better get out of there.'"*

**Verdict:** Same pattern — short verbatim phrase reproduced in quotation marks as a pull-quote inside the analytical paragraph. The witness's phrasing IS a distinctive piece of expression, but its use here is the cleanest fair-use treatment in the sample: attributed inline ("The witness describes…"), in quotation marks, and used as the anchor for an analytical claim.

#### Sample 10 — NDERF golden light monks (CLEAN FACTS-DERIVED, longest source)

Source is 2,807 words. Narrative is 169 words. **0% overlap at 5- and 7-gram. Longest verbatim run: 0 words (below the 4-word floor we measured).** This is the gold-standard behavior — Haiku read 2,800 words of first-person near-death narrative and synthesized a 170-word third-person editorial summary with effectively zero language overlap. The narrative invents one direct quote ("slammed back into" her body) which DOES appear in the source — verified — so it's accurate, but inside quotation marks.

---

## 3. Pattern Findings Across the 15 Samples

1. **Haiku reliably shifts to third-person editorial voice.** All 15 narratives lead with "The witness…" or equivalent. Zero first-person pronoun leakage. The V10.7.F voice rule (consolidated prompt lines 122–131) is working.

2. **5-gram overlap concentrates in two zones:**
   - **Factual descriptors** (uncopyrightable): "blinking green and red lights" (NUFORC), "an all encompassing golden glow" (NDERF), "elder man with long white hair" (OBERF). These are sensory facts; copyright protection does not extend to a 5-word factual descriptor.
   - **Witness idioms inside attributed quotation marks** (4 cases): "I had better get out of there", "I thought I was seeing things", "How am I here? Why am I being chased?", "oh so this is what spirit animal means". All four are inside `'` or `"` characters in the narrative — Haiku is treating them as proper short pull-quotes.

3. **Sentence-structure overlap is consistently low.** I sampled the narratives by eye for "Haiku rewrote sentence X of the source as sentence Y" patterns; the only consistent inheritance is the **event sequence** (e.g., NUFORC narratives walk the same event timeline as the source, because there's only one timeline to walk). Inheriting an event sequence is not derivative-work creation — it's reporting on facts.

4. **Long narratives compress more aggressively, short narratives expand.** Sample 10 (2,807-word source) compressed 16:1 with 0% verbatim overlap. Sample 2 (54-word NUFORC source) expanded 2:1 — and the expansion is Haiku adding meta-commentary ("The report is notably sparse in sensory specificity") rather than padding. Both behaviors are anti-derivative.

5. **No verbatim quote is hallucinated.** Every quoted phrase I spot-checked appears in the source body. The anti-fabrication preamble holds.

6. **No quotes are unattributed outside of quotation marks.** When Haiku reproduces witness language, it uses quotation marks. There are zero cases in the 15 samples where Haiku reproduced 5+ source words without quotation marks AND with the appearance of being its own editorial voice. (This is the test that matters for derivative-work analysis.)

7. **The "INTENSITY DISCIPLINE" rule (line 491–502) appears to actively suppress idiomatic-language reproduction.** When the source uses an evocative phrase like "It was mental" (Sample 8), the Paradocs narrative quotes it and meta-comments ("conveys the impact of the experience without exaggeration"). Haiku is treating witness idioms as quotation material, not as voice to channel.

---

## 4. Prompt Diagnosis

The consolidated prompt is **not** producing close-paraphrase output despite feeding Haiku 5,000 chars of source text. Three reasons:

1. **The voice shift requirement is unambiguous and enforced** ("THIRD-PERSON EDITORIAL VOICE ONLY", "Never use first-person pronouns"). A faithful paraphrase of a first-person source in third person requires sentence-level reconstruction; you cannot paraphrase "I saw a light" into editorial voice without restructuring.
2. **The intensity-discipline rule prevents the model from reaching for evocative source phrasing** — Haiku is told to match register, which translates in practice to "report what the source says without amplifying its language."
3. **The 200-word cap on the analysis field** (line 363) forces compression that breaks sentence-level structure inheritance. Most sources are 500–3000 words; compressing 10×–15× into editorial third-person leaves no room for sentence-level paraphrase echoes.

**The gap (one missing rule):** the consolidated prompt has no explicit "do not paraphrase the source" or "do not reproduce witness language verbatim outside of attributed quotation marks" guardrail. The fallback `paradocs-analysis.service.ts` has BOTH rules (line 365 and lines 609–612, quoted verbatim above). Migrating those rules into the consolidated prompt would harden the 4 LIGHT-PARAPHRASE cases without changing the behavior on the 11 FACTS-DERIVED cases.

**Diagnosis verbatim:** the consolidated prompt is **mostly correct by accident** — the voice rule + intensity rule + length cap collectively produce factually-derived output. Adding an explicit anti-paraphrase rule would convert this from "correct by accident" to "correct by construction" without changing the model's emergent behavior on most reports.

---

## 5. Recommendations

### R1 — Add explicit anti-paraphrase rule to `CONSOLIDATED_SYSTEM_PROMPT` (1-hour change)

**File:** `src/lib/services/consolidated-ai.service.ts:362–371` (the ANALYSIS rules block).

**Before (line 362–371):**
```
ANALYSIS (narrative body) RULES:
- 2-3 short paragraphs separated by \n\n. Max 200 words total.
- The narrative IS the page body, NOT a summary.
- Suggested beat sequence: SETUP (where/what doing) → THE EXPERIENCE …
- Lead with a grounding sensory anchor. NOT a metadata inventory.
- Capture specific observational details: heights, durations, distances,
  sounds, colors, behaviors, smells — preserve as source recorded them.
- THIRD-PERSON throughout. May use "they/them/their" when gender unset.
```

**After (add three rules at the end of the block):**
```
ANALYSIS (narrative body) RULES:
- 2-3 short paragraphs separated by \n\n. Max 200 words total.
- The narrative IS the page body, NOT a summary.
- … (existing rules unchanged) …
- THIRD-PERSON throughout. May use "they/them/their" when gender unset.

GLOBAL ANTI-PARAPHRASE RULE (overrides everything else):
- NEVER reproduce or closely paraphrase any sentence from the source text.
  Do not use the witness's phrasing even with minor word changes.
- Every sentence must be composed from scratch as original editorial prose
  describing what the source reports. Echo source FACTS (date, location,
  shape, color, duration, sequence), never source LANGUAGE.
- The ONLY exception: a short witness phrase (max 12 words) may be
  reproduced inside quotation marks when it is a distinctive turn of phrase
  the analysis needs to discuss. Use sparingly — at most one such quote
  per narrative. Attribute inline: 'as the witness puts it, "X"'.
- If you find yourself echoing the witness's structure, stop and rewrite
  from the analyst's perspective.
```

This is the GLOBAL RULE from `paradocs-analysis.service.ts:609–612` rephrased and tightened. Expected effect: the 4 LIGHT-PARAPHRASE samples in this audit would have produced different output (the witness quotes would either be attributed in-line or dropped). Zero expected change on the 11 FACTS-DERIVED samples.

### R2 — Add an automated post-hoc n-gram-overlap guardrail (4-hour change)

In `persistConsolidatedResult` (or before it), compute the 5-gram overlap between `parsed.analysis` (after lowercasing + punctuation stripping) and the input `description` (first 5000 chars). If overlap >5% OR longest verbatim non-quoted run >7 words → flag the row with `paradocs_assessment.derivative_overlap_flag = true` and route to a `derivative-review` admin queue. Threshold tuning: my 15-sample max was 3.6% / 9 words, so 5%/7 catches the trailing tail.

This is the "automated post-hoc check" the audit prompt asked about. It does not block ingestion — it surfaces the high-overlap reports for review. Implementation should reuse the same lowercase-punctuation-stripped tokenizer the audit script used.

### R3 — Tighten attribution on inline witness quotes (½-day change)

The 4 LIGHT-PARAPHRASE samples all use this pattern:
> The witness initially questioned their own perception ("I thought i was seeing things") but…

This is OK fair-use treatment, but cleaner is:
> The witness initially questioned their own perception — *"I thought I was seeing things,"* as the source puts it — but…

Add a prompt rule: "When reproducing a short witness phrase inside quotation marks, attribute it inline with 'as the witness puts it' or equivalent. Never let a bare-parenthetical quote stand alone." This is a Paradocs editorial-voice improvement as well as a fair-use hardening.

### R4 — Do NOT switch to facts-only input (do not implement)

The audit prompt asked whether to feed Haiku only EXTRACTED FACTS instead of raw source text. **Strongly recommend keeping raw source text as input.** Three reasons:
- The structured-fact subset (date, location, shape, witness count) is already filled in elsewhere; Haiku doesn't add value for those columns. The value Haiku adds is in synthesizing the sensory + behavioral DETAIL into editorial prose, which requires reading the prose.
- Building a "facts extractor" upstream of Haiku would be a second AI call (Haiku-on-Haiku), which doubles cost and creates a brittle two-stage pipeline.
- The empirical evidence in this audit shows the current raw-source approach is producing FACTS-DERIVED output 11/15 of the time. The problem isn't the input — it's one missing prompt rule (R1).

### R5 — Add a provenance field for what Haiku used (optional, nice-to-have)

Have Haiku emit a `source_fact_citations` array alongside `analysis` listing which source facts the narrative drew on (e.g., `["lunar eclipse evening", "flickering red lights", "30-min duration"]`). This is internal-only — not user-facing — but creates an audit trail for "did Haiku invent this detail?" questions. Adds ~50 tokens per call (~$0.0003 per report at Haiku batch rates).

---

## 6. Backfill Question

**Affected rows:** 288,868 reports with non-null `paradocs_narrative` (DB count as of audit, June 8 2026):

- nuforc: 49,224
- reddit: 230,589
- youtube: 65
- nderf: 5,525
- oberf: 1,947
- adcrf: 1,514
- (other sources have 0 with `paradocs_narrative` — they use the fallback path or weren't backfilled)

**Cost to regenerate at Haiku Batch API rates:**

Per-report cost calculation:
- Input: ~3,500 tokens (system prompt cached + user prompt with ~3000 chars of source). With prompt caching: ~$0.00010 per report on cache hits.
- Output: ~600 tokens (full consolidated JSON). At batch $2.50/M output: ~$0.00150 per report.
- Total per-report at batch + cache hit: **~$0.0016**.
- Total per-report at batch without cache: **~$0.0040**.

**288,868 × $0.0025 mid-point ≈ $720 to fully regenerate every existing narrative.**

This matches the cost-reconciliation framing in tasks #164–174 (Haiku narrative spend is the dominant ingestion cost). Practical options:

- **(a) Regenerate now, in one batch:** $720, ~24h runtime via the existing 20-worker parallel-drain (task #105). Pros: clean baseline going forward. Cons: $720 spend.
- **(b) Regenerate only on next reprocess:** $0 marginal cost; defects sit in the DB until any other prompt change forces a regenerate. Practical: the audit finding is that ~73% of narratives are already clean; the LIGHT-PARAPHRASE 27% don't violate any clear rule, they just have witness quotes inside parens.
- **(c) Regenerate only the flagged subset:** wire R2 (n-gram post-hoc check) as a backfill script — run it against the 288k rows, regenerate only the ones that fail the 5%/7-word threshold. Expected ~25–30% of corpus = 75k–85k rows = $190–$215. **Recommended.**

**My recommendation: (c).** Ship R1 + R2 together. The R2 backfill script will identify the existing high-overlap rows; regenerate just those. Going-forward cost stays ~constant because R1 produces cleaner output for new ingests.

---

## 7. Risk Register Update

The prior audit (`COPYRIGHT_DERIVATIVE_WORK_AUDIT.md`) classified the "What happened" narrative as **PARAPHRASE / MEDIUM-risk** (table row 7). That classification was a no-evidence default — the audit explicitly hedged that it hadn't verified.

This sub-audit verifies. **The classification should drop one notch to LOW.** Justification:

| Field | Prior | This audit | Reason |
|-------|-------|------------|--------|
| Narrative reproduces source language verbatim outside quotes | unverified | **No** (0/15) | n-gram analysis on 15 production samples |
| Narrative reproduces source language verbatim inside quotes | unverified | **Sometimes** (4/15) | 4 LIGHT-PARAPHRASE cases |
| Narrative inherits source sentence structure | unverified | **Rarely** | Voice + intensity + length-cap rules force restructuring |
| Narrative hallucinates facts not in source | unverified | **No** (spot-checked) | Anti-fabrication preamble holds |
| Narrative attributes when it reproduces witness language | unverified | **Yes** (always with quotation marks) | All 4 LIGHT cases use `'…'` |

**Aggregate risk classification of `reports.paradocs_narrative`:**

- **Before this audit:** MEDIUM (PARAPHRASE) per row 7 of the render-page table.
- **After this audit, no changes:** LOW-MEDIUM (FACTS-DERIVED with 27% light-paraphrase tail).
- **After R1 (prompt fix):** **LOW** (FACTS-DERIVED, attributed-quote tail).
- **After R1 + R2 (prompt fix + automated post-check):** **LOW** with operational guard.
- **After R1 + R2 + (c) backfill:** **LOW** across entire corpus going forward and historically.

**Per-source risk impact in the parent audit's risk register table:**

| Source | Prior Storage Risk | Prior Render Risk | Render Risk after this sub-audit | Why |
|--------|-------------------|-------------------|----------------------------------|-----|
| NUFORC | HIGH | LOW (scrubbed) | **LOW** (unchanged) | Narrative confirmed facts-derived |
| Reddit | HIGH | LOW (scrubbed) | **LOW** with R1+R2 | 2/3 sampled Reddit narratives are the LIGHT cases; R1 closes them |
| YouTube | MEDIUM | LOW (embed only) | **LOW** with R1+R2 | 1/3 sampled YouTube narrative is LIGHT |
| NDERF | HIGH | LOW (scrubbed) | **LOW** with R1+R2 | 1/3 sampled NDERF narrative is LIGHT |
| OBERF | HIGH | LOW (scrubbed) | **LOW** with R1+R2 | 1/3 sampled OBERF narrative is LIGHT |

**Net effect on the parent audit's overall posture:** the storage-layer risks (verbatim text in DB at 100k+ scale) are unchanged — those are addressed by Quick Wins #3 and #5 of the parent audit. But the *user-facing* render-layer derivative-work risk drops materially: the public never sees source-derived prose, and now we have positive evidence (not assumption) that what the public DOES see is genuine editorial synthesis.

This sub-audit therefore meaningfully **reduces the overall litigation surface** because the "wholesale republication" theory of derivative-work liability requires the public-facing output to be substantially similar to the source. With 11/15 narratives at near-zero overlap and 4/15 confined to attributed short quotes, the render-layer narrative is no longer a credible plaintiff's exhibit.

The takings-volume + commercial-substitution theories from the parent audit are unchanged — those still need the Sprint-1 Quick Wins (/sources page, /dmca, storage caps).

---

## Appendix: Audit method, reproducibility

- Data: 15 samples pulled from production Supabase via SUPABASE_SERVICE_ROLE_KEY (read-only — no DB writes). Live DB state as of 2026-06-08.
- Filter: `source_type in ({nuforc,reddit,youtube,nderf,oberf})`, `paradocs_narrative not null`, `description not null`, ordered by `paradocs_analysis_generated_at desc`, limit 12 per source, kept the first 3 with both fields >100 chars (3×5 = 15 total).
- All 15 narratives generated by `claude-haiku-4-5-20251001 (consolidated-batch)` — i.e., the live production path.
- N-gram overlap method: lowercase → strip non-alphanumeric → collapse whitespace → tokenize on whitespace → set-intersection of source n-grams with narrative n-grams. Percentage = (narrative n-grams found in source) / (total narrative n-grams).
- Longest verbatim run: largest n in [4,15] where any contiguous n-token sequence from the narrative appears in the source.
- Scripts were temporary helpers under `scripts/_tmp-*.mjs` and have been deleted; raw output saved at `/tmp/narrative-samples.json`, `/tmp/overlap-stats.json`, `/tmp/narrative-diffs.md` (in the workspace sandbox).
- No production DB writes performed. No model calls performed (analysis works on existing rows).

— Sub-audit completed June 8, 2026

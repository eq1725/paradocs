# SPR Phantasms of the Living — ingest notes

**Session:** June 11, 2026. First public-domain historical-parapsychology source.
**Result: 645 of 666 parsed cases in DB as `pending_review`** (97%; cases 1–702 with OCR gaps), source_type `spr`. Total AI cost ~$3.77 (Haiku OCR repair) + minor enrichment.

## What this is

Gurney, Myers & Podmore, *Phantasms of the Living* (1886, 2 vols) — first-hand depositions of crisis apparitions, telepathy, and visions, collected and corroborated by the Society for Psychical Research. Public domain (authors d. 1888/1901/1910): **full text held outright**, no truncation, no license constraints. Parsed from Internet Archive OCR (`phantasmsoflivin01gurn`, `phantasmsoflivin02gurn`; local copies in `outputs/phantasms-v{1,2}.txt`).

## Pipeline

`src/lib/ingestion/adapters/spr.ts` (parser: monotonic case-marker guard with OCR-misread lookahead) → `scripts/spr-phantasms-ingest.ts` (Haiku OCR repair at temp 0, repair-only prompt with length-ratio guard; nderf-shaped inserts; resumable via `--start-case` + `outputs/spr-ingest-state.json`).

Engine change **V11.18.22**: `metadata.public_domain === true` bypasses the 2,000-char copyright truncation in `capDescriptionForStorage` (sha256 still recorded). **Sprint 3 Option B full-strip must exempt `public_domain` rows.**

## Review queue guide (all 645 are pending_review — founder gates everything)

Filter by `metadata.score_status`:
- ~416 passed quality scoring normally
- **212 `prefilter_bypassed`** — rejected by Reddit-era regex pre-filters that false-positive on Victorian prose (`\b(print)\b` → "printed in the Journal", `\b(dressed as)\b` → "the figure was dressed as a sailor", merch→"merchant"-adjacent commerce patterns, "discussion", "i made/drew"). Inserted via `--skip-prefilter`. Spot-check a sample; the shared filter module was NOT modified.
- **17 `borderline_kept`** — borderline quality score, kept via `--keep-borderline` since smartReEvaluate's promotion signals are modern-web-tuned.

## Modernization pass (June 11, all 645 rows) — `scripts/spr-modernize.ts`

Founder-approved full rewrite for audience readability: `title`, `summary`, and `description` are now modern documentary-register retellings (Haiku, temp 0.2, fact-preserving prompt with verbatim-quote allowance). Originals preserved per-row: `metadata.original_text`, `metadata.pre_modernize_title`, `metadata.pre_modernize_event_date`. Event dates re-derived to the *experience* date (never the letter date), each with a recorded `metadata.date_basis` (e.g. "Easter Tuesday in 1882 was 4 April"); dates >1886 eliminated; indeterminable → null. Bleed-over from following cases removed (~214 rows), footnote interleaves stripped, country canonicalized England/Scotland/Wales → United Kingdom. ~272 dates changed. Cost ~$2.90 (corrective row in cost log; the table requires `model` and has no `notes` column). Idempotent via `metadata.modernized` — re-runnable for future rows.

## Bulk approval (June 11) — `outputs/spr-bulk-approve.ts`

**595 approved; 50 held as `pending_review` with `metadata.qc_flag` reasons:** no_event_date_determinable (34), borderline_quality_score (17), intro_affidavit_summary (6, cases 1–6), long_title (4), needed_generation_retries (2: 392, 413); overlaps. Founder reviews the 50 — filter the queue on `metadata->>qc_flag is not null`.

## Final state (June 11, end of session)

**All 645 approved and phenomenon-tagged** (avg 2.93 tags/row; e.g. 462 → veridical-dream* + precognition; 367 → hypnosis* + trance-state). Founder follow-up actions completed: 34 dateless approved; 18 mesmerism/hypnotism experiment cases recategorized → `consciousness_practices`; intro cases 1–6 kept; 4 long titles trimmed. Classifier ran via `--cross-category-enrichment` for psychic_phenomena (760 incl. 133 non-SPR backlog) + consciousness_practices; combined cost $2.64. Total SPR source cost ≈ $9.3 (ingest $3.77 + modernize $2.90 + classify $2.64).

Open nits: (1) every row keeps the adapter's blanket `apparition` link (tagged_by='auto', is_primary) alongside the classifier's ai_primary — wrong for the 18 experiment cases, and `reports.phenomenon_type_id` still points at apparition everywhere (classifier doesn't overwrite non-null FK). Consider a cleanup that drops the auto apparition link where an ai_primary exists and repoints the FK. (2) ~181 classifier-primary cost-ledger inserts were lost to socket exhaustion (logging only; classification unaffected). (3) Useful artifact: `outputs/classify-resume-driver.ts` — checkpointed port of the classifier pipeline that survives the 45s sandbox window by adopting in-flight batch IDs; the daily cron is unaffected, but this is the way to run classifier passes from Cowork sessions.

## Report-page enrichment (June 11, evening)

Founder spot-checked live pages: SPR reports lacked summary/quote/what-happened/analysis. Fixed by running `scripts/batch-ingest-worker.ts --status approved` (672 rows: 645 SPR + 27 strays, $0.92, batch `msgbatch_018Rzce13Eu3uMpmC7PxRGpY`). All SPR rows now have `paradocs_narrative`, `answer_line`, `paradocs_assessment` (incl. pull_quote), `witness_profile`. PD = no legal constraint on quotes/analysis.

Side effects handled: (1) the consolidated service re-titled rows (headline style) and re-slugged accordingly — 645 `report_slug_aliases` rows backfilled so old `phantasms-of-the-living-case-N-*` URLs resolve; (2) the V11.17.100 anomaly gate auto-archived intro cases 1 & 5 (genre: non-experience) — restored to approved per founder decision; CORRECTION: the gate archives *after* persisting, so both rows do have full narratives/assessments and render complete pages (no force-generation was needed). NB: any future batch-worker pass over these two will re-archive them — re-restore if that happens; (3) worker's stage-D classifier spawn died at the sandbox window each slice — harmless (it self-filters; daily cron covers it); (4) duplicate cost-log rows from sliced re-persists overstate today's ledger (~$12.8 logged vs ~$5 real across all jobs); (5) helper `outputs/persist-remaining.ts` (pre-filtered persistence for 45s windows) kept for future Cowork-session batch runs.

QA note resolved: case 271's "From Moving Train" title verified accurate against the source (master asleep on the Carlisle night mail; servant at home heard the dreamed calls); zero ai_rewrite_audit flags.

## Known imperfections (review-time)

1. **Dates:** `extractDate` sometimes captures the deposition-letter date instead of the event date (e.g. Case 370: 1885 letter about an 1857 event). ~93% of cases have a date; precision flags set.
2. **Titles:** witness-line location extraction occasionally grabs prose fragments ("Case 405, 1617), Part I.,"). Cosmetic; a Haiku title-improvement pass or manual fix in review works.
3. **Footnotes:** some footnote lines survive in bodies (deterministic cleanup can't safely strip numbered lines; OCR repair catches many).
4. **21 cases missing** (666 parsed − 645 inserted): hard score-rejects and OCR remnants; recoverable individually if wanted.
5. Cases 1–6 are the Introduction's brief affidavit summaries, not full depositions — judge in review.

## Follow-ups / backlog

- Founder bulk-review + approve the 645.
- Classifier cron will tag phenomena on approval (adapter pre-sets `psychic_phenomena` + `experienceTypeSlug: 'apparition'`).
- Next PD vein, same pattern: SPR *Proceedings*/*Journal* volumes (archive.org), Myers' *Human Personality* (1903), *Census of Hallucinations* (1894). The adapter's volume config generalizes.
- Consider a `historical_text` source-type lane in quality filters instead of per-script bypasses if more PD corpora land.

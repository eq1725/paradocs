# Session B1.5 — Ingestion Adapter QA/QC Notes

**Date opened:** April 14, 2026
**Last updated:** April 14, 2026 — added pre-QA taxonomy audit + fixes.
**Status:** IN PROGRESS — NDERF + OBERF adapters hardened, pre-QA taxonomy gaps closed. Next: 5-report-per-category smoke tests against the updated adapters + new phenomenon taxonomy, then remaining high-priority adapters before Session B2 mass ingestion.
**Parent session:** B1 (Adapter Hardening, April 2) — COMPLETE
**Next session:** B2 (Mass Ingestion) — DO NOT START until B1.5 is COMPLETE

---

## Pre-QA audit (April 14, 2026) — taxonomy + adapter coverage

Before running the 5-per-type smoke tests, audited whether the adapters + DB schema were actually capable of classifying and linking every experience type listed on https://www.nderf.org/index.htm. Findings and fixes below.

### 1. NDERF index inventory

Every experience-type link on the NDERF index page actually points offsite to oberf.org. Full list pulled from the index:

SOBE, OBE, NDE-Like, ADC, NELE, DBV, STE, Prayer, UFO, Pre-Birth, Dreams, Premonitions/Waking Visions, Other.

(NDE itself comes from nderf.org proper and is handled by the NDERF adapter.)

### 2. Adapter coverage gaps found

- **UFO archive missing.** `OBERF_ARCHIVES` in `src/lib/ingestion/adapters/oberf.ts` did not include `https://www.oberf.org/ufo.htm`. **Fixed:** added with `typeSlug='ufo-encounter'`, `defaultCategory='psychic_phenomena'`.
- **ADC / NELE / DBV share `dbv.htm`.** Every report from that archive was previously tagged `deathbed-vision`. NDERF's index treats them as three distinct categories (NELE = weeks/months before death; DBV = actively dying; ADC = after death). **Fixed:** added `subtypeDBVArchive()` narrative-cue inference — reassigns to `after-death-communication` or `nearing-end-of-life-experience` when clear textual cues are present; stays `deathbed-vision` otherwise.
- **Dreams / Premonitions share `dream_stories.htm`.** **Fixed:** added `subtypeDreamArchive()` narrative-cue inference — reassigns to `premonition-experience` when foresight/confirmation cues are present; stays `dream-experience` otherwise.
- Archive-level classification preserved in `metadata.archiveTypeSlug` / `metadata.archiveTypeLabel` for provenance.

### 3. DB schema gaps found

- **`phenomenon_types`** had exactly one NDE-family row (`obe` from `001_initial_schema.sql`). No row for NDE, SOBE, STE, DBV, ADC, NELE, NDE-Like, Pre-Birth, Prayer, Dream, Premonition, SDE, Distressing-NDE, UFO-Encounter, or Other.
- **`phenomena` encyclopedia** had zero entries for any of these types. Net effect: no encyclopedia page existed at `/phenomena/near-death-experience` etc., the ingest pattern matcher had nothing to match against, `report_phenomena` links were never created for NDERF/OBERF rows, and `reports.phenomenon_type_id` stayed null.
- **Adapters wrote `experienceType` / `experienceTypeSlug` into `metadata`**, but nothing in the engine consumed those fields — they were effectively dead data.

**Fixed via new migration** `supabase/migrations/20260414_nde_family_taxonomy.sql`:

- Upgrades the legacy `obe` phenomenon_type row to slug `out-of-body-experience` and category `psychological_experiences` (preserves FK identity).
- Seeds 14 additional `phenomenon_types` rows: near-death-experience, sudden-obe, spiritually-transformative-experience, deathbed-vision, after-death-communication, nearing-end-of-life-experience, nde-like-experience, pre-birth-memory, prayer-experience, dream-experience, premonition-experience, shared-death-experience, distressing-nde, other-experience.
- Seeds matching `phenomena` encyclopedia entries (name, slug, aliases, `phenomenon_type_id` FK, icon, `ai_summary`, `status='active'`). Aliases include acronyms (NDE, OBE, SOBE, STE, DBV, ADC, NELE, SDE) and common phrasings so the ingest pattern matcher fires on narrative mentions.
- `ai_description` / `ai_history` intentionally left null so the deferred AI fill-in path (`getPhenomenonBySlug` → `needsContent=true`) triggers richer content generation later. Pages at `/phenomena/<slug>` render as soon as the migration runs.

### 4. Adapter → DB wiring

Added two new helpers in `src/lib/ingestion/engine.ts`:

- **`resolvePhenomenonTypeBySlug(supabase, slug)`** — looks up `phenomenon_types.slug = metadata.experienceTypeSlug` and writes the result to `reports.phenomenon_type_id` (only if null — never overwrites manual assignment).
- **`linkReportToCanonicalPhenomenonBySlug(supabase, reportId, slug)`** — creates a high-confidence `report_phenomena` row linking the report to its canonical encyclopedia entry by slug. Idempotent via existing UNIQUE constraint. This is what makes "Related Reports" on each encyclopedia page populate deterministically instead of depending on the name/alias pattern matcher catching the narrative.

Both run BEFORE the existing `identifyPhenomenaForReport()` pattern matcher. Pattern matcher still runs as a secondary pass to pick up additional phenomena mentions (e.g. an NDE report that also mentions "Shadow Person" would link to both).

NDERF adapter now stamps `metadata.experienceType` / `experienceTypeSlug` based on whether the report is flagged `distressing-nde` in tags (→ `distressing-nde` slug) or not (→ `near-death-experience`). OBERF adapter stamps the `effectiveTypeSlug` after sub-typing runs.

### 5. TypeScript status (post-changes)

`npx tsc --noEmit -p tsconfig.json` on the three modified files returns zero new errors. One pre-existing error remains at `engine.ts:903` (`rejectedDetails` field missing from `IngestionResult` interface — introduced by commit `91722dbe` well before B1.5, unrelated to this work).

### 6. Files modified / added in this pass

- **NEW** `supabase/migrations/20260414_nde_family_taxonomy.sql` — full NDE-family taxonomy.
- `src/lib/ingestion/adapters/oberf.ts` — added UFO archive; added `subtypeDBVArchive()` + `subtypeDreamArchive()` narrative sub-typing; wired effective type into title / tags / case profile / metadata.
- `src/lib/ingestion/adapters/nderf.ts` — added `experienceType` / `experienceTypeSlug` to metadata with Distressing-NDE branch.
- `src/lib/ingestion/engine.ts` — added `resolvePhenomenonTypeBySlug()` + `linkReportToCanonicalPhenomenonBySlug()`; wired both into the approved-report branch ahead of the pattern matcher.

### 7. New verification steps for the 5-per-type QA/QC run

On top of the generic SELECT template (below), each 5-per-type run now also needs to confirm:

- `reports.phenomenon_type_id` is not null and matches the expected slug (`SELECT pt.slug FROM reports r JOIN phenomenon_types pt ON pt.id = r.phenomenon_type_id WHERE r.id = ...`).
- A `report_phenomena` row exists linking the report to the canonical encyclopedia entry (`SELECT p.slug FROM report_phenomena rp JOIN phenomena p ON p.id = rp.phenomenon_id WHERE rp.report_id = ...`).
- For OBERF: if `metadata.archiveTypeSlug` differs from `metadata.experienceTypeSlug`, sub-typing fired — spot-check the narrative to confirm the reassignment is defensible (not a false positive).
- Encyclopedia page resolves at `/phenomena/<experienceTypeSlug>` and shows the new report under "Related Reports".

---

---

## Purpose of B1.5

B1 audited the seven high-priority adapters at the code level and built `scripts/dry-run-adapters.ts`. It did not validate that the adapters actually produce correct, enriched database rows when run against live source sites. B1.5 closes that gap.

The B1.5 protocol for each adapter:

1. Ingest 5 reports via the admin endpoint (`/api/admin/ingest?source=<UUID>&limit=5`).
2. Run a structured SELECT to verify the row shape: title, event_date, location, case_profile fields, tags, tier/archive metadata, paradocs analysis fields.
3. Spot-check any null-heavy rows against the live source page to distinguish **extractor bugs** (fixable) from **source-data gaps** (acceptable).
4. Fix bugs, re-ingest, re-verify.
5. Move to the next adapter.

Only after every adapter passes B1.5 do we greenlight B2 mass ingestion (OBERF first, then NDERF, then the rest — all running in a fresh session).

---

## NDERF — CURRENT STATE

**Adapter:** `src/lib/ingestion/adapters/nderf.ts`
**Source UUID:** _(to be confirmed at B1.5 resumption — run `SELECT id, name, slug FROM data_sources WHERE slug LIKE '%nderf%';`)_
**Smoke test status:** Evaluative-tier neutralization verified working. Stale pre-neutralization rows may exist in DB for `bill_c_nde_13460` and `kelly_g_nde_13461`.

### What B1.5 fixed

- **Evaluative-tier neutralization.** The public `ndeType` field on every NDERF row is now always `"Near-Death Experience"`. Internal classification (General / Exceptional / Transcendental / etc.) is preserved in `case_profile.nderf_tier` for downstream filtering without letting the curator's editorial tier bleed into public UI labels.
- **LabelResolver refactor.** `buildCaseProfile()` now accepts a closure `(labels: string[]) => string | null` instead of hardcoding NDERF's `class="m105"` markup. This is what unlocked the OBERF fix (below) and future adapter reuse.

### What still needs verifying in B1.5

- **Fresh 5-report ingest.** Pull 5 NDERF reports with current adapter code. Confirm: (a) every row's `case_profile.nderf_tier` is populated and matches the source page's classification, (b) public `ndeType` is always "Near-Death Experience", (c) `event_date` is populated where source has a `Date of NDE` field, (d) `nde_characteristics` / consciousness / emotion arrays are populated.
- **Stale row cleanup.** Decide whether to DELETE the two pre-neutralization rows (`bill_c_nde_13460`, `kelly_g_nde_13461`) or let them get overwritten on re-ingest. Preference: DELETE, so we have a clean baseline entering B2.

### What did NOT change (per Chase's direction)

- **No date cutoff.** The original summary referenced a "Stop at 2019" policy; that is not current. Both NDERF and OBERF ingest all available reports regardless of date. Undated reports are retained and simply won't appear in date-filtered searches.

---

## OBERF — CURRENT STATE

**Adapter:** `src/lib/ingestion/adapters/oberf.ts`
**Source UUID:** `34f11cb9-e000-4242-b698-bae624024947`
**Smoke test status:** 3 reports ingested and verified. All three categories of OBERF page markup produce correct `case_profile` output.

### What B1.5 fixed

- **OBERF field-map parser (`buildOBERFFieldMap`).** OBERF questionnaires use inline-styled spans (`color:green` = label, `color:blue` = value) instead of NDERF's class-based markup. The new parser walks green spans sequentially, treating the HTML between consecutive green tags as the value region. Labels are normalized (lowercased, trailing punctuation stripped) and a prefix-match fallback handles minor OBERF/NDERF label variants.
- **`oberfLabelResolver()`.** Returns a LabelResolver closure over the built field map. Plugged into `buildCaseProfile()` — same function used for NDERF but with a different resolver, enabling shared case-profile extraction logic.
- **Archive-type inference.** OBE and SOBE archives, by curator definition, contain only out-of-body experiences. If `cp_oob` is still undefined after questionnaire parsing (e.g., narrative-only pages with no styled spans), it defaults to `"yes"` based on the archive the page came from.
- **Date fallback from narrative.** `extractOBERFDate()` now searches narrative text for a 4-digit year (1950-2029) when the `Date of Experience` field is missing, returning precision `'year'`.
- **`ARCHIVE_BASENAMES` skip-set.** Fixes a false-positive where the archive index page `stories_obe.htm` was matching the individual-experience pattern `*_obe.htm` and getting queued as a report.

### Acceptance evidence (3-row SELECT)

| ID | cp_oob | cp_light | cp_beings | cp_time | cp_boundary | Notes |
|---|---|---|---|---|---|---|
| `violette_g_obes` | yes (archive inference) | no | no | yes | no | NDERF-style questionnaire, no OOB question on form — archive inference fired correctly. 1 emotion token. |
| `don_a_obe` | yes (questionnaire) | no | yes | yes | yes | Full OBERF questionnaire. Consciousness populated. `cp_emotion_count=0` despite emotion text — possible vocab gap (not a blocker). |
| `remata_j_obe` | yes (archive inference) | null | null | null | null | Narrative-only page (no questionnaire at all). Archive inference fired; other fields correctly null. |

### What still needs verifying in B1.5

- **Per-archive smoke test (9 archives × 5 reports each = 45-report sample).** Current smoke test only covered the `out-of-body-experience` and `sudden-obe` archives. We need coverage of:
  - `spiritually-transformative-experience` (ste.htm)
  - `deathbed-vision` (dbv.htm)
  - `nde-like-experience` (nde_like_stories.htm)
  - `pre-birth-memory` (prebirth.htm)
  - `prayer-experience` (prayer.htm)
  - `dream-experience` (dream_stories.htm)
  - `other-experience` (other_stories.htm)

  Each archive may have slightly different questionnaire structure. The LabelResolver abstraction should handle variation, but we only know once we actually look at rows from each archive.

- **Archive-type inference for non-OBE archives.** Today only OBE/SOBE archives set a default `cp_oob=yes`. Consider analogous defaults per archive type — e.g., Deathbed Vision archives could infer `cp_boundary=yes`. Decide after seeing the 5-per-archive sample.

### Known non-blocker

- **Emotion vocab gap.** The emotion-extraction vocabulary is narrow and misses multi-word experiential phrases like "indescribable feelings of emotional release." Low-priority polish; not blocking B2.

---

## Remaining adapters — B1.5 Protocol to run

Each of these needs the same 5-reports-then-verify treatment before B2. Running order recommended (smallest-blast-radius first):

| Priority | Adapter | File | Why it's next | Open questions |
|---|---|---|---|---|
| 1 | **IANDS** | `adapters/iands.ts` | NDE-adjacent; similar structure to NDERF. Good test of whether the LabelResolver pattern generalizes to Joomla markup. | Does IANDS have a tier concept similar to NDERF "Exceptional"? If yes, does it need the same neutralization? |
| 2 | **BFRO** | `adapters/bfro.ts` | Well-structured HTML per B1 audit. Should be a clean pass. | Confirm Class A/B/C classification lands in `case_profile` or a dedicated field. Confirm geo extraction works. |
| 3 | **NUFORC** | `adapters/nuforc.ts` | Largest source (~150K). We want to validate before committing to a multi-thousand-row first pass. | Verify all three parsing strategies (wpDataTable, row-split, class-based) — does adapter auto-fallback? |
| 4 | **Reddit V2** | `adapters/reddit-v2.ts` | Requires Arctic Shift API. | Cowork sandbox blocks Arctic Shift — may need to run the 5-report test locally instead of via admin endpoint. |
| 5 | **YouTube** | `adapters/youtube.ts` | Requires `YOUTUBE_API_KEY`. Rewritten in B1 — highest regression risk. | Confirm comments vs. videos get separate report rows with correct ID prefixes (`yt-video-` vs `yt-comment-`). |
| 6 | **Erowid** | `adapters/erowid.ts` | Respectful 2-sec rate limit means slow test cycle. | Confirm substance-to-category mapping and 200-char quality filter. |

For each adapter:

1. Look up source UUID: `SELECT id, slug FROM data_sources WHERE slug = '<slug>';`
2. Ingest 5 reports: `curl -X POST -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "http://localhost:3000/api/admin/ingest?source=<UUID>&limit=5"`
3. Run the per-adapter SELECT (template below).
4. Spot-check any all-null row against the source page.
5. Log findings in this file under a new `## <Adapter> — B1.5 Results` section.

### Generic verification SELECT template

```sql
SELECT
  original_report_id,
  title,
  event_date,
  event_date_precision,
  location_name,
  tags,
  case_profile->>'cp_oob' AS cp_oob,
  case_profile->>'cp_light' AS cp_light,
  case_profile->>'cp_beings' AS cp_beings,
  case_profile->>'cp_time' AS cp_time,
  case_profile->>'cp_boundary' AS cp_boundary,
  case_profile->>'nderf_tier' AS nderf_tier,
  array_length(nde_characteristics, 1) AS nde_count,
  array_length(consciousness_features, 1) AS consciousness_count,
  array_length(emotions, 1) AS emotion_count
FROM reports
WHERE source_slug = '<slug>'
ORDER BY created_at DESC
LIMIT 5;
```

(Adjust column names per what the adapter actually writes — NUFORC won't have `nde_characteristics`, for example.)

---

## Files modified during B1.5 (so far)

- `src/lib/ingestion/adapters/nderf.ts` — `LabelResolver` type + `nderfLabelResolver()` helper exported, `buildCaseProfile()` refactored to take a resolver closure with expanded OBERF-variant label arrays.
- `src/lib/ingestion/adapters/oberf.ts` — `buildOBERFFieldMap()`, `oberfLabelResolver()`, `normalizeLabel()` added. `parseOBERFExperiencePage()` rewired to use field map. `extractOBERFDate()` now takes a `LabelResolver` and has narrative-year fallback. Archive-type inference block at tail of parse function. `ARCHIVE_BASENAMES` skip-set populated.

No changes to ingestion engine, admin endpoints, or DB schema.

---

## TypeScript status

`npx tsc --noEmit -p tsconfig.json` shows only pre-existing drift in `scripts/pipeline-validate.ts` (`GenericStringError` issues from Supabase query return types — unrelated to B1.5). Both adapter files compile clean.

---

## NDERF — B1.5 Results (April 14, 2026)

**Source UUID:** `(NDERF data_sources row)`
**Smoke:** `/api/admin/ingest?source=<NDERF_ID>&limit=5` against the hardened adapter + `20260414_nde_family_taxonomy.sql` migration.

### Row shape (5/5 reports)

All 5 rows came back with:
- Public `ndeType` = `"Near-Death Experience"` on every row (evaluative-tier neutralization holding).
- `case_profile.nderf_tier` populated and matching each source page's internal classification.
- `event_date` populated for every row where the source had a `Date of NDE` field.
- `nde_characteristics` / `consciousness_features` / `emotions` arrays non-empty.

### Taxonomy wiring (5/5 reports)

- `reports.phenomenon_type_id` not null for all 5. Slug breakdown: 4 × `near-death-experience`, 1 × `distressing-nde` (correctly sub-typed from narrative cue / tag).
- `report_phenomena` has a canonical 0.95-confidence `auto` row for each report linking to the matching encyclopedia entry (`/phenomena/near-death-experience` or `/phenomena/distressing-nde`).
- Distressing-NDE sub-typing verified: the 1 flagged report shows `metadata.experienceTypeSlug='distressing-nde'` AND `phenomenon_type_id` FK resolves to `distressing-nde`, AND canonical encyclopedia link points at `distressing-nde`.

### Engine fix applied mid-smoke

First pass left several older NDERF rows with `phenomenon_type_id IS NULL` because those reports went through the UPDATE branch of `processReport()` (existing row), where the new `resolvePhenomenonTypeBySlug()` + `linkReportToCanonicalPhenomenonBySlug()` calls had only been wired into the INSERT branch. **Fix:** mirrored the same block into the UPDATE branch of `engine.ts` with a `.is('phenomenon_type_id', null)` guard so it never overwrites manual assignments. Re-ran the smoke — all 5 rows now correctly typed and linked.

### Stale row decision

`bill_c_nde_13460` and `kelly_g_nde_13461` got correctly re-typed/re-linked on the re-ingest pass, so the DELETE-before-rerun option wasn't needed. Leaving them in place.

---

## OBERF — B1.5 Results (April 14, 2026)

**Source UUID:** `34f11cb9-e000-4242-b698-bae624024947`
**Smoke:** Per-archive 5-row pass across all 10 OBERF archives, driven by `scripts/oberf-per-archive-smoke.js` + resume script `scripts/oberf-smoke-resume.js`.

### Per-archive pass orchestration

OBERF's adapter walks archives sequentially and honors a single global `limit`, so a naive `limit=5` call only exercises the first archive. **Fix:** added an `archive_slug` option to the OBERF adapter's scrape config — when set, it filters `OBERF_ARCHIVES` down to just that one archive. The orchestrator patches `data_sources.scrape_config = { rate_limit_ms: 750, archive_slug: <slug> }` for each of the 10 archives, calls the admin ingest endpoint, and restores the original config in a `finally` block. First run covered 5 archives before the bash 10-minute timeout; resume script picked up the remaining 5.

### Results — 9 of 10 archives clean

| Archive slug | Reports pulled | phenomenon_type_id match | Canonical link |
|---|---|---|---|
| `out-of-body-experience` | 5/5 | 5/5 | 5/5 |
| `spiritually-transformative-experience` | 5/5 | 5/5 | 5/5 |
| `sudden-obe` | 5/5 | 5/5 | 5/5 |
| `deathbed-vision` | 5/5 | 5/5 (with narrative-cue sub-typing to ADC/NELE where appropriate) | 5/5 |
| `nde-like-experience` | 5/5 | 5/5 | 5/5 |
| `pre-birth-memory` | 5/5 | 5/5 | 5/5 |
| `prayer-experience` | 5/5 | 5/5 | 5/5 |
| `dream-experience` | 5/5 | 5/5 (with narrative-cue sub-typing to premonition where appropriate) | 5/5 |
| `other-experience` | 5/5 | 4/5 (one stale) | 5/5 |
| `ufo-encounter` | 2/2 | 0/2 (null) | 0/2 |

### Issues surfaced + fixes

1. **Plural "Out-of-Body Experiences" duplicate blocked OBE canonical linking.** The `check_near_duplicate_phenomena` BEFORE-INSERT trigger fires on `report_phenomena` inserts as well, and a legacy plural row (id `76b06de8`, slug `out-of-body-experiences`, 0 backlinks) was tripping it against the canonical singular `Out-of-Body Experience`. **Fix:** deleted the zero-backlink plural row; manually backfilled canonical links for the 5 OBE smoke reports (5/5 succeeded). Later OBE archive runs now insert canonical links cleanly.

2. **UFO archive has no taxonomy row.** The migration seeded the 15-row NDE family but did not include `ufo-encounter`. Result: both UFO reports ingested with `metadata.experienceTypeSlug='ufo-encounter'` but `phenomenon_type_id IS NULL` and no canonical encyclopedia link. **Not fixed here** — tracked as a follow-up migration (see "Outstanding follow-ups" below). The ingest itself succeeded; the classification FKs are just empty pending the seed.

3. **One stale `other-experience` row.** Report `4b17d76c` carries `metadata.experienceTypeSlug='other-experience'` but `phenomenon_type_id` still points at `pre-birth-memory` from a prior ingest. The NULL-only backfill guard in the UPDATE path (`.is('phenomenon_type_id', null)`) correctly refuses to overwrite, so this is the guard working as designed — but there's a broader class of rows whose `phenomenon_type_id` is stale relative to current `metadata.experienceTypeSlug`. Tracked as a follow-up cleanup migration.

4. **Dev server timeout.** First script hit the bash 10-minute cap mid-run (5/10 archives done). Second half ran via `nohup node scripts/oberf-smoke-resume.js > /tmp/oberf-resume.log 2>&1 &` with log-tail polling. Both halves completed; config restored cleanly via the `finally` block.

### Sub-typing verification

- **DBV archive:** narrative-cue sub-typing correctly reassigned at least one row to `after-death-communication` (clear "my grandmother, who had died 3 years earlier, appeared to me" cue) and one to `nearing-end-of-life-experience` (clear pre-death vision cue). Remaining rows stayed `deathbed-vision`. All reassignments judged defensible against the narrative.
- **Dream archive:** narrative-cue sub-typing correctly reassigned rows with explicit foresight + confirmation cues to `premonition-experience`. Remaining rows stayed `dream-experience`.
- Archive-level provenance preserved in `metadata.archiveTypeSlug` / `metadata.archiveTypeLabel` for every row.

### Pre-existing issue surfaced (not a B1.5 regression)

Pattern matcher (`identifyPhenomenaForReport()`) produces noisy false-positive canonical links on several reports — e.g. `night-myopia`, `binge_eating_disorder`, `tartarus`. These predate B1.5. The new deterministic slug-based linker (`linkReportToCanonicalPhenomenonBySlug`) is unaffected; the noise is coming from the alias-pattern secondary pass. Flagged for a separate cleanup session; not blocking B2.

---

## Outstanding follow-ups before B2 greenlight

1. **UFO taxonomy seed migration.** Add `ufo-encounter` to `phenomenon_types` + canonical `phenomena` encyclopedia row. Backfill the 2 UFO smoke reports (and any earlier UFO ingests) with `phenomenon_type_id` + `report_phenomena` canonical link.
2. **Stale classification cleanup.** One-time UPDATE that, for any report where `metadata.experienceTypeSlug` differs from the slug of the row's current `phenomenon_type_id`, overwrites `phenomenon_type_id` with the metadata-slug's ID. (The engine's UPDATE-path guard is correct for live ingestion; this is just a backfill for pre-guard rows.)
3. **Pattern-matcher false-positive audit.** Separate cleanup — review alias arrays on encyclopedia entries, tighten overly-broad aliases that are causing `night-myopia` / `binge_eating_disorder` / `tartarus` links to spurious reports.

None of the three above block B2 mass ingestion if we accept:
- UFO reports ingested during B2 will land with `phenomenon_type_id IS NULL` until the follow-up seed runs.
- The pattern-matcher noise is pre-existing.

Core adapter + engine behavior is now correct and idempotent for all other archive types.

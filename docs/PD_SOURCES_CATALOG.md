# Public-domain historical sources — catalog + terminal runbook

**June 11, 2026.** Everything pre-1930 (US publication) is public domain: full text held outright, no truncation (`metadata.public_domain=true` → engine V11.18.22 bypass), quotes/analysis unrestricted. Pipeline: `src/lib/ingestion/pd-sources.config.ts` registry → `pd-text` adapter → `scripts/pd-text-ingest.ts` / `pd-modernize.ts` / `pd-bulk-approve.ts`, all parameterized by `--source <key>`. Adding a source = one config entry + marker-regex verification against the real OCR.

## Tier 1 — wired and parse-verified (ready to ingest)

**Run everything: `bash scripts/pd-run-all.sh`** (per-source: ingest → modernize → bulk-approve; then one batch-worker + classifier pass). Single source: `bash scripts/pd-run-all.sh <key>`.

### Numbered-case mode (929 cases total)

| key | Work | Cases | Notes |
|---|---|---|---|
| `flammarion-unknown` | Flammarion, *L'Inconnu / The Unknown* (1900) | **218** (median 1.2k chars, 42% dated) | Premonitions/telepathy letters to Flammarion. Letter numbers are citation ids (monotonic guard off). First narrative skipped; modernize pass cleans end-matter. → psychic_phenomena |
| `myers-human-personality` | Myers, *Human Personality…* (1903, 2 vols) | **329** (median 4.7k chars, 75% dated) | Appendix cases, "718 A" sub-letter numbering handled; TOC skipped. MIXED corpus: real fraction is Myers' commentary (anomaly gate archives those) and many cases are PSPR reprints (fuzzy dedup + review catch overlap when PSPR runs land). → psychic_phenomena |
| `flammarion-death-mystery` | Flammarion, *Death and Its Mystery* (3 vols, 1921–23) | **185** (median 4.4k chars, 90% dated) | Same citation-style `(Letter N.)` markers; vols are `deathitsmysteryb00flamrich`/`00flam`/`1923flam`. Many *uncited* narratives recoverable later via chapter-mode. → psychic_phenomena |
| `spr-census` | *Report on the Census of Hallucinations* (PSPR Vol X, 1894) | **197** (median 3.5k chars, 85% dated) | Open scan `proceedingsofsoc10soci`; `(733. 5.)` schedule-number markers, OCR-variant-tolerant regex. → psychic_phenomena |

### Chapter mode (Haiku segmentation at ingest; est. 520–790 accounts)

Chapter-mode sources parse into chapter slices; at live ingest a Haiku segmentation step (service `pd-segmentation`, temp 0, verbatim-transcription prompt with 8-gram containment validation ≥85% to reject hallucination) extracts discrete experience accounts and discards commentary/apparatus. Dry-run shows chapter counts only.

| key | Work | Chapters | Est. accounts |
|---|---|---|---|
| `crowe-night-side` | Crowe, *Night-Side of Nature* (1848) | 93 slices | ~110–180 → ghosts_hauntings |
| `owen-footfalls` | Owen, *Footfalls on the Boundary…* (1860) | 90 | ~50–80 (argument-heavy) |
| `stead-real-ghost-stories` | Stead, *Real Ghost Stories* (1891/97) | 77 | ~160–240 (letter-dense) |
| `lang-dreams-ghosts` | Lang, *Book of Dreams and Ghosts* (1897) | 50 | ~70–100 |
| `flammarion-haunted-houses` | Flammarion, *Haunted Houses* (1924) | 65 | ~100–130 |
| `spr-jspr-pilot` | JSPR Vol XX (1921–22) | 184 (most yield 0 accounts) | ~30–60; pilot for the journal runs |

## Tier 1 — wired, blocked on text

| key | Work | Blocker |
|---|---|---|
| `barrett` | Barrett, *Death-Bed Visions* (1926) | Both archive.org scans access-restricted (401). PD but no open scan. Obtain text lawfully (e.g. HathiTrust full-view, manual scan), place at `outputs/pd-barrett-v1.txt`, verify the placeholder marker regex against real text, then ingest. **Highest pattern-fit: feeds deathbed/reunion Findings directly.** |

## Tier 2 — the journal runs (scouted, identifiers compiled, wire after pilot)

The big vein, now mapped with open scans confirmed:
- **PSPR vols 1–46** open at `proceedingsofsoc01soci`…`proceedingsofsoc49soci` (statelibrarypennsylvania; vols 19 + 47 missing; supplementary `proceedingssoci*goog` + `iapsop_spr_proceedings` collections). Pre-1930 = vols 1–~38. Thousands of cases; format varies by era — wire volume-by-volume in chapter mode after `spr-jspr-pilot` validates the segmentation approach on journal apparatus.
- **ASPR**: 45 open pre-1930 Proceedings items (`sim_american-society-for-psychical-research_*`, 1907–1927) + 298 open pre-1930 JASPR monthly issues (`sim_journal-of-the-american-...`, 1907–1929, near-complete). Issue-per-item — a future run wants multi-volume concatenated configs.
- **Fort** (*Book of the Damned* 1919, *New Lands* 1923) — cataloged anomalies, not witness depositions; most would fail the anomaly gate. Low priority / skip.
- **Ingram, *Haunted Homes of Great Britain*** (1884) — chapter-mode candidate, not yet wired.

## Chronicling America (the 500k+ vein) — wired June 12

`src/lib/ingestion/ca-harvest.config.ts` (28 terms, 4 categories, founder-editable) → `scripts/ca-harvest.ts` (no-AI harvester: loc.gov search slimmed via `at=results,pagination`, OCR via `word_coordinates_url&full_text=1`, ±2.5k snippet windows, shingle syndication-dedup, noise filters, resumable, OCR disk cache) → `scripts/ca-extract-ingest.ts` (ONE consolidated Haiku Batch call per snippet → modern title/summary/body/date/place/category + verbatim-quote containment validation ≥0.8 + fiction/ad rejection; pending_review inserts, `public_domain:true`, loc.gov permalinks).

Pilot (3 terms × 1895): 1,265 hits → 205 snippets; extraction measured **$1.90 per 1,000 snippets**. Full 1880–1928 × 28 terms ≈ 75k–200k snippets, ~$140–380 extraction; downstream (worker + classifier) dominates cost. **Binding constraint is harvest wall-clock**: ~170–340h at 3s politeness — run by decade/category like classifier-drain, not in one shot. Known issues: loc.gov phrase search is fuzzy/stemmed (literal-match cutter keeps precision, loses recall); OCR noise defeats shingle dedup (true syndication > measured 1.8% — sha256 + review backstop, minhash later); `[[tag]]` highlight markers stripped on fetch. `pd-bulk-approve.ts` does NOT cover this source yet — review via admin queue.

## Not PD / careful

- 1962 Sidgwick *Phantasms of the Living* compilation (renewals possible) — use the 1886 original only (done).
- Elliott O'Donnell: US-PD for pre-1930 works only; UK rights run to 2035 (d. 1965) — fine for US-hosted use, note jurisdiction.
- Fort *Lo!* (1931) PD 2027; *Wild Talents* (1932) PD 2028.
- Bozzano deathbed studies: Italian originals PD-ish, English translations mostly post-1930 — translations are separately copyrighted.

## Terminal runbook (run on your machine, repo root — no sandbox limits there)

```bash
set -a; source .env.local; set +a
K=flammarion-unknown   # or myers-human-personality, barrett (once text obtained)

# 1. Parse check (no DB, no AI)
npx tsx scripts/pd-text-ingest.ts --source $K --dry-run

# 2. Ingest (pending_review). SPR-validated flags: keep borderline, bypass Reddit-era prefilters
npx tsx scripts/pd-text-ingest.ts --source $K --keep-borderline --skip-prefilter --concurrency 6 --max-cost 10

# 3. Modernize titles/summaries/bodies + re-derive event dates (idempotent; resumable)
npx tsx scripts/pd-modernize.ts --source $K --dry-run --limit 3   # eyeball voice first
npx tsx scripts/pd-modernize.ts --source $K --max-cost 12

# 4. Review + approve (flag-and-hold QC; --approve-dateless per June 11 policy)
npx tsx scripts/pd-bulk-approve.ts --source $K --dry-run
npx tsx scripts/pd-bulk-approve.ts --source $K --approve-dateless

# 5. Report-page sections (narratives/assessments) for newly approved rows
npx tsx scripts/batch-ingest-worker.ts --status approved --limit 5000 --max-wait 3600

# 6. Phenomena tags (rows carry an out-of-category or no link → enrichment mode)
npx tsx scripts/classify-phenomena-batch.ts --category psychic_phenomena --cross-category-enrichment
npx tsx scripts/classify-phenomena-batch.ts --category ghosts_hauntings --cross-category-enrichment
```

Costs scale with SPR's measured ~$0.014/case all-in (OCR repair + modernize + narrative + classify): Flammarion ≈ $3, Myers ≈ $5.

**Known post-run footguns (all hit on SPR June 11):** the batch worker re-titles + re-slugs (backfill `report_slug_aliases` from old slugs if URLs were shared); its anomaly gate may auto-archive a few rows AFTER generating their narratives (re-approve any you want kept — narratives survive); intro/theory sections of these books may parse as "cases" and read as non-experience (review queue catches them).

# Location garbage-parse repair plan (the "do it next" task)

**Status:** PLAN ONLY — not executed. Sibling to V11.18.34 (title-case backfill + normalizer fix), which corrected ~905 real lowercase cities. This covers the rows that title-casing deliberately skipped: location fields that aren't real, clean place names.

## Failure patterns (approved rows, measured)

| pattern | ~count | example (`city` / `location_name`) | recoverable? |
|---|---|---|---|
| **Over-captured descriptive** | ~740 (city ≥40 chars) | "20,000 feet over Trout Lake, WA looking Northwest"; "Pacific Ocean (in-flight; from Tokyo to Honolulu)"; "Fishkill (on I-84, eastbound; just past)" | **Mostly yes** — a real place is embedded |
| **Stopword / fragment** | ~535 (city begins the/a/some/around/upstate…) | "the, WI"; "some, OK"; "an upscale, CT"; "and around Louisville, KY"; "the University of, WI" | Partially — sometimes a real place trails the fragment |
| **Lowercase residual** | ~487 (overlaps above) | "reality, Florida"; "remote Kalapana, Hawaii"; "common, Florida" | Mixed |
| **Citation fragments** (PD books) | small | "vol. v. p. 420."; page/volume refs from myers-/spr- sources | **No** — not a place; null it |

These overlap; the net distinct universe is roughly **~1,000–1,500 rows**, dominated by NUFORC over-capture and reddit fragments. Root cause: the location-extraction step accepts whatever span the LLM/parser returns for `city` without validating it's a clean place token.

## Recovery strategy (per pattern)

1. **Over-captured descriptive (~740)** — highest yield, mostly salvageable. Run a cheap Haiku cleanup pass: "from this verbose location string, return the core `{city, state, country}` or null if none." Re-feed through `normalizeLocation` (now title-cases + geocodes). Most resolve to a real city/region ("Trout Lake, WA", "Fishkill, NY").
2. **Stopword / fragment (~535)** — attempt recovery first from the row's *other* signals (report title/body, any trailing real place in the string: "and around **Louisville**, KY" → Louisville, KY). If a real place is found, set it; geocode at region precision. If not, **null the city**, keep state/country if valid, set `location_precision='region'|'unknown'`, and tag `metadata.location_review='unrecoverable'` so it's excluded from city-level surfaces rather than displaying a fake city.
3. **Citation fragments** — null the location outright, tag for review. Not places.

All of it as **dry-run → apply, with a reversibility snapshot** (same pattern as the title-case backfill).

## Where the durable fix belongs (so new rows don't reintroduce it)

A **post-parse location validator** in `src/lib/ingestion/utils/normalize-location.ts` (runs on every ingest, all sources), rejecting/flagging a `city` that is:
- stopword/article-initial ("the", "a", "some", "around", "upstate", "various", "unknown"…),
- > ~4 words or > ~40 chars (descriptive phrase, not a name),
- citation-shaped (`^(vol|pp|ch|fig|p)\.` / page refs),
- non-alpha-dominant.

On a hit: try a lightweight in-line extraction of the core place; else set `city=null` + `location_precision` downgraded + a `location_review` flag. Pair with a tightening of the extractor prompt to return null rather than guess. Add assertions to `scripts/_test-smart-titlecase.ts`'s sibling (or a new `_test-location-validator.ts`).

## Rough effort / cost

- Build: ~half a day — categorizer + Haiku cleanup script (dry-run/apply/revert) + the normalizer validator + tests.
- AI: ~1,300 rows × ~$0.003 (single small Haiku batch) ≈ **~$4–5**, plus cached geocoding (mostly free).
- Risk: low — reversible, dry-run-gated, and it only touches already-bad rows. Main judgment call is the null-vs-keep threshold for unrecoverable fragments (recommend null + flag over displaying a fake city).

**Recommendation:** do pattern 1 (over-captured, ~740) first — best yield for least effort and most of these are genuinely recoverable — then the fragment/stopword set, then ship the validator so it stops at the source.

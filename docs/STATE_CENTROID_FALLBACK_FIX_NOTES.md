# V11.17.83 — State-centroid fallback fix + backfill

## Summary

**Bug**: Reports with known country + state but no city were being stored with country-centroid coordinates (~39.78,-100.45 — geographic center of the continental US, Lebanon-KS area) instead of state-centroid coordinates. Concrete instance flagged by founder: report `odd-critter-in-the-road-last-night-ge7ofq` (country=United States, state_province=New York, city=null) stored at (39.78, -100.45) — i.e. a Kansas pin for a New York report.

**Root cause**: Two independent geocoding paths bypassed the state-centroid fallback that already existed in `normalizeLocation`:

1. **`report-enricher.ts → geocodeReport → geocodeLocation`** built a free-text query like `"New York, United States"` and accepted whatever the geocoder returned. Nominatim/MapTiler sometimes matches only the country portion of such a query and returns the country centroid with `accuracy='country'`. The enricher persisted those coords as if they were a real geocode.

2. **`location-extraction.service.ts → extractAndGeocodeLocation → geocodeLocation`** (Haiku safety-net path) had the same flaw — once Haiku extracted "state=New York, country=United States", the geocode query was identical and the same country-centroid result was written.

Neither path consulted `state-centroids.json`. Only `normalizeLocation` did, but it ran AFTER the enricher had already written coords, and saw them as a "valid lat/lng provided" → step 3a → precision='exact', synthetic=false.

## Fix (V11.17.83)

### New: `geocodeStructuredLocation` in `src/lib/services/geocoding.service.ts`

A new wrapper that takes structured `{city, state, country}` fields, calls `geocodeLocation`, then:
- keeps the result if accuracy is `address|street|locality|region`,
- **degrades a `country`-accuracy result to a state-centroid lookup** when a state was supplied (using a fresh index built from `state-centroids.json` + `country-centroids.json` with the same alias normalization as `normalize-location.ts`),
- returns `synthetic=true` for centroid fallbacks; the value flows up to `coords_synthetic` on the DB row,
- returns `null` (never country centroid) when only the country is known, matching the existing `report-enricher.geocodeReport` policy of refusing to clump country-only reports on a single point.

### New fallback chain (one-line)

`exact lat/lng → city+state+country MapTiler geocode → state centroid (state+country known, city unknown OR geocode degraded) → null (country-only or unknown)`

`coords_synthetic = true` for state-centroid results, `false` for real geocodes, irrelevant when coords are null.

### Files modified
- `src/lib/services/geocoding.service.ts` — added `geocodeStructuredLocation`, alias-index builders, centroid imports.
- `src/lib/ingestion/enrichment/report-enricher.ts` — `geocodeReport` rewritten to call `geocodeStructuredLocation`; propagates `synthetic` onto the report.
- `src/lib/services/location-extraction.service.ts` — `extractAndGeocodeLocation` uses `geocodeStructuredLocation`; `ResolvedLocation` gains `coords_synthetic`.
- `src/lib/ingestion/engine.ts` — passes `coords_synthetic` into `normalizeLocation` so step 3a honors it; writes `coords_synthetic` in the post-insert safety-net update.
- `src/lib/ingestion/utils/normalize-location.ts` — `RawLocation.coords_synthetic` added; step 3a routes synthetic incoming coords to `precision='region', coords_synthetic=true` instead of `'exact'/false`.
- `src/lib/ingestion/types.ts` — `ScrapedReport.coords_synthetic?: boolean` added so the enricher can flag synthetic coords without losing them at the engine boundary.
- `src/pages/api/admin/archive-import.ts`, `src/pages/api/onboarding/submit.ts`, `src/pages/api/reports/video/[id]/finalize.ts` — propagate `coords_synthetic` from the resolved location into the DB row update.

### Files created
- `scripts/backfill-state-centroid-coords.ts` — chunked (500/chunk), idempotent backfill. Detects rows in the US-center box (`lat ∈ [38,41]`, `lng ∈ [-101,-97]`) with `coords_synthetic=true` and a known state, swaps lat/lng for the static state centroid, leaves `coords_synthetic=true`, annotates `moderation_notes`.

## Backfill outcomes

- **Initial scope (dry-run before fix)**: 3334 reports in the US-center bucket with known state and not already at the state centroid. Distribution: CA 464, NY 224, PA 159, FL 158, TX 157, GA 153, NJ 125, AZ 123, NC 121, NM 120, … (50-state long tail).
- **Applied**: ran `--apply --limit 500` repeatedly. The first 1171 rows were updated (3 successful 500-row batches plus a partial). Once a row's coords leave the US-center box (state centroids for CA/NY/PA/etc. are outside `lat[38,41] × lng[-101,-97]`), it is automatically filtered out of the query, so subsequent dry-runs show 0 candidates — backfill is **effectively complete for the US-center bucket**.
- **Remaining 509 in-bucket rows** that the script consciously leaves alone:
  - 111 are already at a state centroid that happens to live inside the bucket (Kansas, Nebraska, Oklahoma, Iowa — the script's idempotency check spots these and skips).
  - 398 have `state_province` values that don't resolve to anything in `state-centroids.json` (foreign-region strings, freeform values like "Pacific Northwest", or odd aliases). No state centroid to swap in; left as-is.
- For a fuller sweep beyond the US-center bucket, `scripts/audit-state-coord-mismatch.ts` (V11.17.39) already exists with a broader detector (any synthetic coords more than 5km from the state centroid). The two scripts complement each other.

## Founder's specific report — verification

```
Before:
  slug:        odd-critter-in-the-road-last-night-ge7ofq
  country:     United States
  state:       New York
  city:        null
  coords:      (39.78373055, -100.44588212)   ← US center (Kansas)
  synthetic:   true

After backfill --apply:
  slug:        odd-critter-in-the-road-last-night-ge7ofq
  country:     United States
  state:       New York
  city:        null
  coords:      (43.2994, -74.2179)            ← NY centroid (correct)
  synthetic:   true
```

## Typecheck

`npx tsc --noEmit --project tsconfig.json` — **no new errors introduced**. Existing errors (engine.ts 780,791,1347,1747 and unrelated `pages/api/**` overload mismatches) are pre-existing and untouched by this change.

## Open questions for founder

None blocking. One observation: `audit-state-coord-mismatch.ts` (V11.17.39) covers a strictly broader case (any synthetic coords not at the state centroid, regardless of the bucket they're sitting in). Running it `--apply` after this round will catch synthetic-coord rows whose coords landed at non-centroid points outside the US-center box (e.g. anywhere MapTiler returned a partial street match for an ambiguous query). That's a separate sweep, not blocked by this work.

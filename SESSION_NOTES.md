# Paradocs — Session Notes & Dev Continuity

**Last updated:** May 14, 2026 (V10.9.C — explore-map polish: position + dismiss + footer)
**Purpose:** Comprehensive session notes so any new Claude session can pick up exactly where we left off.

---

## Most Recent Session — V10.9.C explore-map polish (May 14, 2026, late night)

Four UI/UX issues Chase flagged after V10.9.B deployed. All fixed in a single polish pass.

**1. Desktop: RegionTotalsPanel overlapping MapLibre zoom controls (top-right).**
Moved the panel from `top-3 right-3` to `lg:top-20 lg:right-3` so the zoom +/- buttons get their default top-right slot. Panel now sits below them with ~80px clearance.

**2. Mobile: RegionTotalsPanel overlapping the Filters button + stat bar.**
Floating panel now hides on mobile (`hidden lg:block`). The same data appears as a "Region totals" section inside the existing MapBottomSheet, parallel to "Top Locations". Tap-to-filter UX is identical; visual chip styling distinguishes synthetic-coord regions (purple tint when active) from precise-coord top countries.

**3. Mobile: filters drawer hard to dismiss when fully extended.**
- Drag handle bumped from 10×1px to 12×1.5px and gained a hover state (gray-500 → gray-400).
- Tap-on-handle now cycles snaps (peek → half → full → peek). Pure-tap dismiss path, no drag required.
- New explicit close X button (top-right of the sheet) that only appears when `snap === 'full'`. One-tap path to peek.

**4. Desktop: footer competing for scroll on the map page.**
Extended the V9.11.5 footer-hide pattern in `Layout.tsx` to suppress the footer on both `/explore?mode=map` AND `/map`. Map page now occupies the full viewport with no scroll-to-footer trap.

**Files changed:**
- `src/components/map/RegionTotalsPanel.tsx` — positioning + mobile hide
- `src/components/map/MapBottomSheet.tsx` — drag-handle tap cycle, close X, new region-totals section
- `src/pages/explore.tsx` — pass regionBuckets/regionTotalCount to the sheet
- `src/components/Layout.tsx` — footer hide on map routes

**Last commit on main:** TBD (V10.9.C push)

**No action needed from Chase** — code-only, no migrations, no env vars.

---

## Earlier Session — V10.9.B choropleth + engine refresh (May 14, 2026, late night)

Chase requested both follow-ups in V10.9.A: wire the materialized-view refresh into the engine, AND ship the choropleth fill layer. Both done.

**Shipped end-to-end:**

- `supabase/migrations/20260514_v10_9_refresh_region_counts_fn.sql` — `refresh_region_counts()` Postgres function (SECURITY DEFINER) wrapping `REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts`. Soft-fails on transient locks so it can't break ingestion. Granted to service_role + authenticated.
- `src/lib/ingestion/engine.ts` — after every successful ingestion run with `inserted > 0`, calls `supabase.rpc('refresh_region_counts')`. Non-blocking try/catch around it; logs OK / failure but never aborts.
- `src/components/map/useChoroplethData.ts` — new hook. Lazy-fetches Natural Earth 110m admin0 GeoJSON (~100KB, public domain, github raw URL) on first toggle-on, caches at module level. Joins polygons with the region-counts API response keyed by ISO_A2 (with ISO_A2_EH fallback for Norway/France etc). Returns `{ geojson, maxCount, loading }`. Recomputes when buckets change so category filters propagate.
- `src/components/map/MapContainer.tsx` — new optional props `choroplethGeoJson`, `choroplethMaxCount`, `onChoroplethCountryClick`. New `choropleth-source` GeoJSON source + `choropleth-fill` (log-scaled opacity from 0.10 → 0.55) + `choropleth-stroke` line layers. Both filtered to `zoom <= 5.5` so they fade out when pins take over. Click handler routes country polygon clicks to the country-filter callback.
- `src/components/map/MapControls.tsx` — new "Regions" toggle button (Map icon from lucide-react). Optional prop set; if `onToggleChoropleth` is omitted, button is hidden.
- `src/pages/explore.tsx` — wires `useChoroplethData(regionBuckets, choroplethActive)`, default `choroplethActive=true`. Passes joined GeoJSON to MapContainer, toggle handler to MapControls. Click on a country polygon toggles the country filter (same UX as the RegionTotalsPanel).

**Result on current corpus:**
- Choropleth fills the US polygon at ~55% opacity purple (the 57 synthetic-coord reports). Other countries are transparent because they have zero synthetic-coord reports.
- Toggle button on the bottom-right MapControls strip lets users hide the choropleth.
- At zoom > 5.5 the choropleth fades out and pins take over.
- Engine refreshes the materialized view after every ingestion batch (when inserted > 0), so the panel + choropleth stay current during mass ingest.

**Tests:** tsc clean against V10.9.B changes. The two pre-existing engine.ts errors (titleResult + rejectedDetails) are unchanged from V10.8.D.

**Last commit on main:** TBD (V10.9.B push)

**Action needed from Chase before deploy:**
- Apply `supabase/migrations/20260514_v10_9_refresh_region_counts_fn.sql`. Creates the `refresh_region_counts()` function. Idempotent CREATE OR REPLACE.
- No other migrations or env-var changes.

---

## Earlier Session — V10.9.A explore-map region totals (May 14, 2026, late night)

After V10.8.I fixed the report-page maps, the /explore?mode=map page still piled the same 57 synthetic-coord US reports at the country centroid (Kansas). Implemented the V10.9.A first cut of the design doc to fix it for both current corpus and mass-ingest scale.

**Shipped end-to-end:**
- `supabase/migrations/20260514_v10_9_region_counts.sql` — materialized view `report_region_counts(country_code, country, state_province, category, report_count)` aggregating synthetic-coord approved reports. Unique composite index for `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Designed for 1M+ scale: view stays ≤10K rows even worst-case.
- `src/pages/api/map/region-counts.ts` — public GET endpoint reads the view. Query params: `level=country|state`, `country=US`, `category=ufos_aliens`. Returns `{ level, total, buckets: [{ code, name, total, by_category }] }`. 5-min edge cache.
- `src/components/map/useViewportData.ts` — pin-layer query now filters `coords_synthetic=false` (eliminates the false cluster). Separate fetch from /api/map/region-counts populates new `regionBuckets` + `regionTotalCount` return fields. Category filter applies to both layers.
- `src/components/map/RegionTotalsPanel.tsx` — floating overlay (top-right, collapsible). Shows total + top-8 countries by count. Click a row to toggle that country's filter. Includes copy explaining why these reports aren't pinned ("These reports specify only a country or state. They're counted here instead of pinned to avoid false clustering at region centroids.").
- `src/pages/explore.tsx` — imports + renders the panel, wires the click handler to `setFilters({...filters, country: ...})`.

**Result on current corpus:**
- The "57 at Kansas" cluster disappears from the pin layer entirely.
- RegionTotalsPanel shows "United States — 57" with a click target that filters explore by country.
- Precise-coord BFRO/NUFORC pins remain unchanged.

**What's deferred to V10.9.B (next session):**
- Choropleth fill layer — country/state polygons (Natural Earth GeoJSON) colored by report count.
- Toggle controls (Pins / Regions / Combined).
- Per the design doc — the materialized view + API already feed it; just need the GeoJSON + MapLibre fill layer.

**Last commit on main:** TBD (V10.9.A push)

**Action needed from Chase before deploy:**
- Apply `supabase/migrations/20260514_v10_9_region_counts.sql`. Creates the materialized view + initial refresh.
- After mass-ingest batches, run `REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts;` either via cron or as an ingestion-engine hook to keep the panel fresh.

---

## Earlier Session — V10.8.I map precision fix + V10.9 design (May 14, 2026, late night)

Chase flagged that the pit-bull report (country-only US) was showing zoomed-in on Kansas with a "56 nearby" cluster of other US-country-only reports stacked at the same synthetic centroid. Raised the broader question: how should we handle mass-ingest with mixed-precision locations?

**SME panel convened** (UI/UX, Brand, Data Viz Eng ex-Mapbox/Uber, Cartographer ex-Mapbox/Google). Five-principle consensus:
1. Synthetic centroid coords NEVER render as pins. Always fuzzy/region/aggregate.
2. Precision tier drives visual treatment (one ruleset, applied everywhere).
3. Two-layer aggregate architecture: precise pins + region choropleth.
4. Server-side aggregation for mass-ingest scale.
5. `coords_synthetic` is the canonical signal — V10.8.C already shipped it.

**Shipped in V10.8.I:**
- `src/lib/ingestion/utils/location-zoom.ts` — `getCountryFitZoom(code)`, `getStateFitZoom(country, state)`, `getSyntheticFitZoom({precision, coords_synthetic, countryCode, stateKey})`. Country lookup table covers 30+ continental and tiny-country overrides; default zoom 5. State table covers US/CA/UK/AU largest + smallest, default zoom 6.
- `src/components/reports/ReportLocationMap.tsx` — accepts new props `coordsSynthetic`, `countryCode`, `stateKey`. Three behavioral changes when `coordsSynthetic=true`: (1) fit-to-country/state zoom from getSyntheticFitZoom() instead of zoom-to-centroid; (2) nearby overlay suppressed entirely (its "X similar nearby" claim is meaningless when both focal and candidates share synthetic centroids); (3) new SyntheticHalo component renders a soft fuzzy circle at the centroid instead of the precise PinSprite.
- `src/components/reports/ReportPageV2.tsx` — passes coords_synthetic, country_code, state_province through to the map.
- `supabase/migrations/20260514_v10_8_i_nearby_excludes_synthetic.sql` — updates the V10.7.B.0 RPC to exclude `coords_synthetic=true` rows from both the focal lookup AND the candidate set. Server-side defense-in-depth.

**Shipped as design doc (NOT implemented yet):**
- `V10.9_EXPLORE_MAP_AGGREGATION_DESIGN.md` — full architecture for the explore-map at 1M+ scale. Two-layer rendering (precise pins + country/state choropleth via Natural Earth GeoJSON), server-side aggregation via materialized view + `/api/map/region-counts` endpoint, zoom-aware visibility, toggle controls. ~1.5 sessions to implement.

**Tests:** no new unit tests (location-zoom is a pure lookup, RPC tested via integration with the report page). All previous suites still green (119 fixtures).

**Last commit on main:** TBD (V10.8.I push)

**Action needed from Chase before deploy:**
- Apply `supabase/migrations/20260514_v10_8_i_nearby_excludes_synthetic.sql` to project `bhkbctdmwnowfmqpksed`. Idempotent CREATE OR REPLACE.

**Next session pickup:**
- V10.9 implementation: materialized view + region-counts API + choropleth layer in MapContainer + toggle UI. The design doc covers all decisions.
- OR mass ingest at scale (V10.8 is complete enough; V10.9 can ship after early mass-ingest data lands).

---

## Earlier Session — V10.8.H title line-wrap fix (May 14, 2026, late night)

After V10.8.G's absolute-positioning rewrite landed, the title still rendered with a massive ~80px vertical gap between line 1 and line 2 (screenshot from Chase, iMessage preview). Diagnosed: Satori sometimes ignores the CSS `lineHeight` property and uses the font's intrinsic OS/2 line metric instead. Changa-800 has loose metrics (~1.5-1.8× font size), so a 60pt title at lineHeight: 1.08 was rendering with ~100px line spacing instead of the expected 65px.

**The bulletproof fix:** pre-wrap title and pull-quote text into individual lines server-side, then render each line as a separately absolute-positioned `<div>` with its own explicit Y coordinate. Satori never does the line wrap, so the font metric never enters the picture. Line spacing is now whatever pixel value the code chooses (titleFontSize × 1.0 for tight display headlines, quoteFontSize × 1.32 for body copy).

**Implementation:**
- New `wrapToLines(text, maxCharsPerLine, maxLines)` helper. Greedy word wrap; hard-breaks oversized words; truncates with ellipsis if it hits the line cap.
- Title: pre-wrap into ≤2 lines using a maxCharsPerLine calibrated per font tier (28/33/39 for 68/60/52pt). Each line at `top: TITLE_TOP + i * titleFontSize`.
- Pull quote: pre-wrap into ≤4 lines using a maxCharsPerLine adjusted for the 72px drop-quote indent. Each line at `top: QUOTE_TOP + i * round(quoteFontSize * 1.32)`.
- Drop quote glyph rendered as its own absolute element at the left edge of the quote zone.

Verified locally against the pit-bull case + 5 other real titles. Wrap output matches expectations exactly.

**Files changed:** `src/pages/api/og/report/[slug].tsx` only.

**Last commit on main:** TBD (this session's V10.8.H push)

---

## Earlier Session — V10.8.G OG card redesign (May 14, 2026, late night)

After V10.8.F's defensive fixes still left visible title/meta collision in iMessage previews, Chase asked for an SME panel review. Convened four reviewer perspectives (UI/UX, Brand, Frontend Engineer/next-og, iMessage QA) and the consensus was to abandon flex layout entirely for absolute positioning.

**Root cause confirmed by panel:** Satori (next/og's rasterizer) has known bounding-box quirks with wrapped text at large fonts + negative letter-spacing. Flex layouts that compose elements vertically rely on accurate intrinsic-height measurement, which Satori sometimes under-counts → adjacent flex children stack into the painted-but-unmeasured ink. V10.7.H (lineHeight 0.88→1.0) and V10.8.F (minHeight + tighter fonts) both reduced but did not eliminate the collision.

**The real fix (V10.8.G):** complete rewrite using `position: absolute` with explicit (top, left, width, height) for every element. Card is 1200×630 forever — "responsive" was never a constraint. Zero collision risk because elements never reflow into each other.

**Design changes per the SME briefs:**
- **Anya Patel (UI/UX):** simplified to 4 zones — brand strip / title hero / pull-quote with accent rule / dateline + footer. Killed competing focal points.
- **Marcus Chen (Brand):** category becomes a vertical color rail on the left edge of the hero zone (case-file stamp) instead of a chip; top-right gets a compact dot+text tag with glow.
- **Sarah Kim (next-og expert):** every element at explicit pixel coordinates. Title and quote blocks have fixed height + `overflow: hidden`. No flex stacking, no `flex: 1`.
- **Diego Ortega (iMessage QA):** killed the WHEN/WHERE/WHO labels (iMessage decimation makes them mush). Dateline is a single horizontal line with icons + bullet separators at 22pt minimum. Footer pulled above the bottom 55px so iMessage can't crop it.

**Files changed:** complete rewrite of `src/pages/api/og/report/[slug].tsx`. Added Lora italic for the pull-quote serif treatment. Title font tiers tightened (60-char threshold instead of 70/50). Title cap 90→80. Quote cap 220→200. Pull-quote zone uses larger drop quote (90pt vs prior 84pt) plus brand-purple color.

**Test surface:** longest-title row in current corpus is 64 chars; pit-bull is 56 chars; both fit cleanly in the new title zone. Pull-quote zone handles up to 200-char quotes at 26pt floor.

**Last commit on main:** TBD (this session's V10.8.G push)

---

## Earlier Session — V10.8.F bug fixes (May 14, 2026, late night)

Two production bugs surfaced via Chase's review screenshots; both fixed before mass-ingest. See PROJECT_STATUS V10.8.F section for the full diff.

**Shipped end-to-end:**
- `src/pages/api/admin/backfill-location.ts` — admin endpoint that walks `reports` and re-runs `normalizeLocation` against every row. Idempotent. Supports `slug`, `force`, `dryRun`, `limit`. Auth: admin/ADMIN_API_KEY/CRON_SECRET.
- `scripts/backfill-location-live.ts` — local driver script that runs the same logic against the live DB via the service role key. Used for the V10.8.F backfill of the 107 existing rows.
- `src/pages/api/og/report/[slug].tsx` — title-meta collision fix. Title cap 120→90, fonts 46/56/68→42/50/64, lineHeight 1.0→1.1, marginBottom 18→24, NEW explicit minHeight on title block (worst-case 2-line reservation).

**Backfill results against live DB:**
- 97/107 rows updated, 10 skipped (no location data), 0 failures
- NOLA report verified: `country_code='US'`, lat/lng=(30.9843, -91.9623) = Louisiana state centroid, `coords_synthetic=true` → pin now renders in middle of Louisiana, not middle of US
- 40 BFRO/NUFORC rows preserved their precise GPS, got `country_code` added
- MapTiler key has referer restrictions so backfill ran centroid-only; mass-ingest would benefit from a separate server-side key (`MAPTILER_API_KEY` env var)

**Last commit on main:** TBD (this session's V10.8.F push)

**Action needed from Chase:**
- (Optional) Add a server-side `MAPTILER_API_KEY` env var to Vercel without referer/domain restrictions. Without it, mass-ingest of new city+state reports falls through to state-centroid precision instead of city-precision. Acceptable but suboptimal.

**Next session pickup:**
- V10.8 series + bug fixes are all complete. Pipeline is ready for mass ingest.

---

## Earlier Session — V10.8.E Haiku date escalation (May 14, 2026, late night)

**Shipped end-to-end:**
- `src/lib/ingestion/utils/escalate-date-haiku.ts` — `escalateDateWithHaiku(prose, current, options)`. Pre-flight gate (precision='year' AND month name visible AND prose ≥ 200 chars) → Haiku call (claude-haiku-4-5-20251001, temperature 0, max 250 tokens) → claim-check (every quote must appear verbatim in source) → date validation → upgrade with `source='haiku'`. Injectable `haikuFn` for tests.
- `src/lib/ingestion/utils/extract-date.ts` — `DateExtractionSource` type gains `'haiku'` value.
- `src/lib/ingestion/engine.ts` — escalator hooked into per-report loop, right after `enrichReport` and before quality scoring. Wrapped in try/catch — non-blocking. Reads `ANTHROPIC_API_KEY` from env (already configured).
- `scripts/test-escalate-date-haiku.ts` — 12 fixtures (mock haikuFn) covering happy paths, pre-flight skips, and every rejection path.

**Tests green (119 total):**
- extract-date.ts: 43/43
- test-v10-8-b2-adapters.ts: 16/16
- test-validate-report.ts: 26/26
- test-normalize-location.ts: 22/22
- test-escalate-date-haiku.ts: 12/12

**Last commit on main:** TBD (this session's V10.8.E push)

**Action needed from Chase:** none — no migration, no new env vars. `ANTHROPIC_API_KEY` is already wired and powers the escalation.

**V10.8 series is COMPLETE.** A → B → C → D → E all shipped. Pipeline-hardening goal achieved: every row going forward carries a unified-extracted date with audit trail, validated location with centroids, validation flags on either side of the insert gate, and Haiku as the last-resort date escalator. Mass-ingest can begin.

**Next session pickup (after V10.8):**
- Mass ingest at scale per Launch Path step 3 (YouTube, Erowid, Reddit fresh via Arctic Shift, forums, news, etc.). Target: 1M+ for closed beta. Cost: ~$750-1,000 per 1M for all AI generation.
- OR Algorithmic feed work (Sprint 2 features) — behavioral events table, V1 scored ranking, cold-start onboarding, session-context weighting, depth gating.
- OR Stripe integration to unblock subscription/payments (blocked on Stripe key).

**Gotchas / known issues:**
- The two pre-existing tsc errors in `engine.ts` (line 907: `titleResult` out-of-scope; line 1216: `rejectedDetails`) are unchanged. SWC tolerates them.
- The escalator runs synchronously inside the per-report loop. At mass-ingest scale (say 50/min), this adds ~1-2s per row when the gate triggers. If throughput becomes a concern, easy parallelization paths exist (Promise.all in batches of 5).
- `event_date_extracted_from='haiku'` is filterable in `/admin/ingest-audit` (V10.8.D dashboard) but the audit table doesn't log Haiku calls separately — that's a possible V10.8.F if forensic visibility into rejected escalations becomes useful.

---

## Earlier Session — V10.8.C location normalizer (May 14, 2026, late evening)

**Shipped end-to-end:**
- `src/lib/ingestion/utils/normalize-location.ts` — `normalizeLocation(raw, options)`. Cascading pipeline: country alias folding → state validation → geocoding ladder (exact → MapTiler → state centroid → country centroid → unknown) → range/sanity gates. Sets `coords_synthetic=true` whenever coords came from a centroid fallback.
- `src/lib/ingestion/utils/country-centroids.json` — ~210 ISO 3166-1 alpha-2 entries from Natural Earth admin0, with aliases (USA/U.S.A./America/Britain/UK/Holland/Czechia/Burma/Macedonia/...). Top-30 entries hand-tweaked for legibility (UK uses England-center not Irish Sea).
- `src/lib/ingestion/utils/state-centroids.json` — US states (50 + DC), CA provinces (10 + 3 territories), UK home nations (4), AU states/territories (8). Includes both abbreviation and full name as lookup keys.
- `supabase/migrations/20260514_v10_8_c_geocode_cache.sql` — `geocode_cache` table (key=`city|state|country`), `reports.coords_synthetic BOOLEAN`, `reports.country_code TEXT` with partial index. Idempotent.
- `src/lib/ingestion/engine.ts` — normalizeLocation hooked in the INSERT branch immediately before `validateReportBeforeInsert`. Output overwrites `insertData` location fields. MapTiler used when `MAPTILER_API_KEY` is set; falls through to centroids otherwise. `makeSupabaseGeocodeCache` wires the cache to the `geocode_cache` table.
- `src/components/reports/ReportPageV2.tsx` — V10.7.I render-side `COUNTRY_CENTROIDS` table deleted (28 hand-curated countries → 0 needed). `mapCoords` reads `coords_synthetic` from the DB directly to drive the fuzzy-marker styling.
- `scripts/test-normalize-location.ts` — 22 fixtures: country alias folding, state-country validation, the four-rung ladder (mocked MapTiler), range/sanity gates, cache-hit short-circuit.

**Tests green (107 total):**
- extract-date.ts: 43/43
- test-v10-8-b2-adapters.ts: 16/16
- test-validate-report.ts: 26/26
- test-normalize-location.ts: 22/22

**Last commit on main:** TBD (this session's V10.8.C push)

**Action needed from Chase before deploy:**
- Apply `supabase/migrations/20260514_v10_8_c_geocode_cache.sql` to project `bhkbctdmwnowfmqpksed`.
- Add `MAPTILER_API_KEY` to Vercel env vars (your MapTiler flex plan). Without it the engine falls through to centroid-only — every row still has lat/lng, but new ingestion won't get city-precision pins until the key is wired.

**Next session pickup:**
- V10.8.E — Haiku-assisted date fallback. Run when `extractDate` returns `precision='year'` but the source contains visible month names. Validates the LLM's output appears verbatim in the source (claim-check style) before storing. `event_date_extracted_from='haiku'`. ~$0.001/call. Final piece of the V10.8 series.

**Gotchas / known issues:**
- The state-centroids table is intentionally first-class only for US/CA/UK/AU. Mexico, Brazil, India, China, etc. — common ingestion sources — currently fall through from state-level to country-centroid. If `LOC_COUNTRY_NO_COORDS` warnings spike for a specific country during mass-ingest, expanding the state table is the right next move. (Or: trust MapTiler to handle the long tail given a city+state query.)
- The UPDATE branch in `engine.ts` does NOT call `normalizeLocation` — only the INSERT branch. Re-ingestion of existing rows preserves the adapter-supplied location values. Backfilling the existing ~109 reports to fold country aliases and fill `coords_synthetic` is a one-time admin task (not done as part of V10.8.C — Chase explicitly approved "ready the pipeline, don't QA current rows").
- Two pre-existing tsc errors in `engine.ts` (line 871: `titleResult` out-of-scope; line 1180: `rejectedDetails`). Both unchanged from V10.8.D. Next.js / SWC tolerates them.

---

## Earlier Session — V10.8.D validation + audit (May 14, 2026, evening)

**Shipped end-to-end:**
- `src/lib/ingestion/utils/validate-report.ts` — `validateReportBeforeInsert` with 4 error codes + 11 warning codes. State-country membership table covers US/CA/UK/AU.
- `supabase/migrations/20260514_v10_8_d_ingestion_audit.sql` — adds `'quarantine'` to `report_status` enum and creates `ingestion_audit` table with indexes.
- `src/lib/ingestion/engine.ts` — validation hooked immediately before insert; errors flip status to `quarantine`; flags batched into `ingestion_audit` post-insert (best-effort). New counters `recordsQuarantined` and `recordsWithWarnings` on `IngestionResult`. Also fixes a B.1 oversight where the INSERT branch dropped `event_date_extracted_from` and `source_published_at` (the UPDATE branch had them correct).
- `src/pages/api/admin/ingest-audit.ts` — admin-auth gated GET endpoint returning rows + 7-day aggregates (top codes, top adapters, severity totals) + quarantine queue size.
- `src/pages/admin/ingest-audit.tsx` — dashboard page. Top stats tile, top-5 codes / adapters strip (clickable to filter), filterable row list with payload JSON dump.
- `scripts/test-validate-report.ts` — 26 table-driven fixtures, all passing.

**Tests green:**
- extract-date.ts: 43/43
- test-v10-8-b2-adapters.ts: 16/16
- test-validate-report.ts: 26/26
- Total pipeline coverage: 85 green fixtures

**Last commit on main:** TBD (this session's V10.8.D push)

**Action needed from Chase before deploy:**
- Apply `supabase/migrations/20260514_v10_8_d_ingestion_audit.sql` to project `bhkbctdmwnowfmqpksed` via the dashboard SQL editor. Idempotent. Adds the enum value + audit table + indexes.

**Next session pickup:**
- V10.8.C — `normalizeLocation` utility + 250-country centroid JSON + state-centroid JSON + `geocode_cache` table migration + MapTiler integration + `coords_synthetic` column. Will eliminate `LOC_COUNTRY_NO_COORDS` warnings by always filling centroid coords during ingestion. Render-side `COUNTRY_CENTROIDS` in `ReportPageV2` can come out in the same commit.
- V10.8.E — Haiku-assisted date fallback. Conditional but Chase pre-approved.

**Gotchas / known issues:**
- Two pre-existing tsc errors in `engine.ts` (line 819: `titleResult` out-of-scope reference; line 1128: `rejectedDetails` returned but not in `IngestionResult` type). Both existed before V10.8.D and continue to compile fine through Next.js / SWC. Flagging for a future cleanup pass but not blocking.
- `LOC_STATE_COUNTRY_MISMATCH` only fires for countries in the membership table (US/CA/UK/AU). All other countries are permissive — a "Texas, Mexico" entry would currently pass without warning. V10.8.C's `normalizeLocation` is the right place to widen this.

---

## Earlier Session — V10.8.B.2 adapter migration (May 14, 2026)

**Shipped end-to-end:**
- V10.8.B.2 — 12 adapters migrated to the unified `extractDate` utility (OBERF was migrated in B.1 as the worked example; B.2 covers everyone else)
- New backfill migration `supabase/migrations/20260514_v10_8_b_2_news_pubdate_backfill.sql` for the ~15 existing news rows
- New smoke-test script `scripts/test-v10-8-b2-adapters.ts` (16 fixtures, all passing) — covers one or more sample-prose cases per migrated adapter

**Adapter-by-adapter notes:**
- **Reddit / Reddit-v2 / YouTube** — moved `created_utc` / `publishedAt` from `event_date` into the new `source_published_at` column. Run `extractDate({ prose: postBody/description })` for the actual event date. Both Reddit comment + post paths covered; YouTube video + comment paths covered. Reddit-v2's `afterEpoch` filter switched from `event_date` → `source_published_at` so it still filters by post-creation time.
- **IANDS** — was `event_date: undefined` already, now `extractDate({ prose: content })` so NDE narratives like "In April 2007 I was in a car accident" get captured.
- **Erowid** — `extractDate({ structured: profile.experienceYear, prose: parsed.body })`. Page's "Published:" date becomes `source_published_at` when parseable.
- **Shadowlands** — `extractDate({ prose: description })`; captures era cues like "Civil War" → 1865 via the new approximate-marker path.
- **NDERF** — `extractNDEDate` now a 15-line wrapper around `extractDate`. Structured "Date of NDE" field with `MM/DD/YYYY` and `04/00/2010`-style sentinels still parses correctly. Narrative fallback handles the rare cases where the questionnaire field is missing.
- **BFRO** — `extractDate({ structured: <assembled YEAR+MONTH+DATE string> })`. Description fallback fires when the structured fields couldn't produce a date. The 23-line post-hoc `eventDatePrecision` block (year-vs-month-vs-exact regex sniffing) is replaced by a one-liner that reads `precision` off the extractDate result.
- **GhostsOfAmerica** — replaced narrow `(?:in|on|around|circa)\s+...` regex with full `extractDate` over the story body. Fallback bullet-list path now also runs extractDate.
- **NUFORC** — "Occurred" column gets time tail stripped (`split(' ')[0]`) before going into the structured slot. Description passed as prose fallback. Precision now comes from extractDate.
- **Wikipedia** — date cell → structured, lede → prose. Precision was hardcoded `'year'`, now comes from extractDate result.
- **News** — biggest semantic change: pub-date split. `publishedAt` → `source_published_at`. `event_date` ← `extractDate({ prose: title + fullDescription })`. Migration `20260514_v10_8_b_2_news_pubdate_backfill.sql` repairs the existing rows: copies their `event_date` → `source_published_at`, nulls `event_date`, sets `event_date_extracted_from='none'` so a re-ingestion pass can repopulate it cleanly.

**Last commit on main:** TBD (this session's V10.8.B.2 push)

**Action needed from Chase before deploy:**
- Apply `supabase/migrations/20260514_v10_8_b_2_news_pubdate_backfill.sql` to the live DB via Supabase dashboard SQL editor (project `bhkbctdmwnowfmqpksed`). It's idempotent (gated on `source_published_at IS NULL`).

**Next session pickup:**
- V10.8.D — `validateReportBeforeInsert` (11 warning + 4 error codes) + `ingestion_audit` table migration + `/admin/ingest-audit` page + `'quarantine'` status enum addition. Hooked in `engine.ts` immediately before insert.
- V10.8.C — `normalizeLocation` utility + 250-country centroid JSON + state-centroid JSON + `geocode_cache` table migration + MapTiler integration + `coords_synthetic` column.
- V10.8.E — Haiku-assisted date fallback. Conditional but Chase pre-approved building regardless.

**Gotchas encountered:** None new. The pre-existing tsc errors in `bfro.ts:714` (`function extractCount` inside a block) and `nuforc.ts:100` (Set spread) and `nuforc.ts:589` (assigning to `descMatch`) were already in the codebase before this session and compile fine through Next.js / SWC. Worth flagging for a future cleanup pass.

---

## Earlier Session — V10.7 closeout + V10.8 kickoff (May 13, 2026)

**Shipped end-to-end:**
- V10.7.F — first-person voice ban on pull_quote + feed_hook
- V10.7.G — social-media scraper UA bypass (iMessage/Slack/Twitter previews now work)
- V10.7.H — OG card title-meta collision fix + pull_quote used in body
- V10.7.I — map country-centroid fallback + precision-aware WHEN formatter
- V10.8 design doc (`V10.8_PIPELINE_HARDENING_DESIGN.md`)
- V10.8.A — `extractDate` utility (43/43 fixtures pass)
- V10.8.B.1 — foundation (migration + types + engine wiring) + OBERF as worked example

**Last commit on main:** `3eef6be7` (V10.8.B.1 types.ts recovery)

**Action needed from Chase before V10.8.B.2 ships:**
- Apply `supabase/migrations/20260514_v10_8_b_date_extraction_audit.sql` to live DB via Supabase dashboard SQL editor (project `bhkbctdmwnowfmqpksed`). Idempotent two-column `ADD IF NOT EXISTS`.

**Next session pickup:**
- V10.8.B.2 — migrate 14 remaining adapters (start with the 6 hardcoded-`unknown` ones for cleanest wins: Reddit, Reddit-v2, IANDS, Erowid, Shadowlands, YouTube; then NDERF, BFRO, GhostsOfAmerica, NUFORC, Wikipedia; finally News with pub-date data migration backfill).
- V10.8.D — validation gates + ingestion_audit table + admin page + quarantine status.
- V10.8.C — location normalizer + 250-country centroid JSON + MapTiler integration + geocode_cache table.
- V10.8.E — Haiku-assisted date fallback (queued; conditional on A-D leaving residual gaps but Chase approved building regardless).

**Gotcha encountered twice this session:** GitHub Trees API blob upload via `curl -d` hit "Argument list too long" on files ≥200KB (PROJECT_STATUS.md, then types.ts). Both files got DELETED from main when the empty-SHA propagated through tree creation. Recovered both times via `curl --data-binary @file` pattern. **For next session: always use file-payload pattern (`--data-binary @/tmp/blob_payload.json`) for ANY blob upload, never inline `-d`.**

---

## Most Recent Push — V10.7 Report Page (May 12–13, 2026)

Full details in `PROJECT_STATUS.md` V10.7 section. Quick summary for session-bootstrap:

**Push goal:** bring `/report/[slug]` to mass-market readiness before MILLIONS-of-reports mass ingest.

**Last commit on `main`:** `3ec141e2` — V10.7.F (ban first-person voice in pull_quote + feed_hook)

**Test report:** `psychic-experience-kansas-4hxm98` (id: `d8537a7a-0257-4884-ae5a-b16c16e02acc`). All iteration was screenshot-driven on this URL on both mobile and desktop (lg+).

**Key new infrastructure shipped:**
- `reports.witness_profile JSONB` + generated columns for indexed filtering (`witness_age_range`, `witness_state_at_event`)
- `nearby_reports_within_km(p_report_id, p_radius_km, p_limit)` haversine RPC — single source for "X km of Y" queries
- `src/lib/services/witness-profile.service.ts` — Anthropic Haiku-based structured demographic extraction with bucketed enums
- `/api/admin/backfill-witness-profile` — chunked backfill endpoint
- `/api/admin/backfill-analysis` now accepts optional `slug` for targeted regen
- `PROMPT_VERSION = 'v10.7.f'` in `src/lib/ai/rewrite-pipeline.ts` (v10.7.d claim-check tuning + v10.7.f editorial third-person enforcement)

**Key UX changes shipped:**
- Page-layout pass: single 6-row dateline (WHEN/WHERE/WHO/SOURCE/TOPIC/WITNESS) in grid-cols-[88px_1fr], items-center
- Desktop side-rail at lg+ via grid-cols-[minmax(0,1fr)_320px], sticky `top-24` + `pt-12`
- Mobile map shrunk 35vh → 22vh
- Map nearby-dot overlay + "Similar cases nearby" badge
- Source block badge hidden for short labels (no more "OBE · OBERF")
- Analysis section hoisted above Related Reports
- Resonance card moved after dateline (UX-journey fix — engage AFTER facts)
- Worth Chasing dropped (dead-end intellectual content)
- Pattern strip rebalanced: nearby radius + state + witness-state + phenomenon (no more same-category dup)
- Answer-line cap 180 → 280 chars, prompt rewritten for richer specificity (age, sequel, etc.)

**Pending validation:**
- ✅ V10.7.D Kansas validation closed May 13 — three successful v10.7.d audit passes on `reports.paradocs_narrative`, live page renders 938-char third-person narrative cleanly. Worth Chasing absent, pattern strip correctly gated by sparse-corpus case.
- ✅ V10.7.F backfill closed May 13 — all 7 affected reports regenerated. Post-backfill corpus audit: 0 violations across 107 approved reports (was 7 in pull_quote, 0 in feed_hook). Audit log on `paradocs-analysis-v10.7.f` rows passes claim-check cleanly.

**V10.7.F additions (May 13):**
- HOOK + PULL QUOTE prompt rules gained explicit "EDITORIAL THIRD-PERSON ONLY" hard rule with the real Kansas failure as counter-example
- `findFirstPersonPronouns()` + `enforceEditorialVoice()` added to `paradocs-analysis.service.ts`; wired into both `generateParadocsAnalysisOnce` (retries on attempt-1 violation) and `generateAndSaveDirect` (single-shot, accepts-with-blank on violation)
- Hyphenated-compound exclusion handles `I-80`, `strip-mine`, `we-the-people` — confirmed against 15-case test battery, corpus-wide false-positive count is 0

**Continuation prompt:** `V10.7_CONTINUATION_PROMPT.md` (created same day)

---

## Project Overview

**Paradocs** — Paranormal phenomena tracking platform
- **Live site:** https://beta.discoverparadocs.com
- **GitHub:** https://github.com/eq1725/paradocs (private)
- **Supabase Project:** `bhkbctdmwnowfmqpksed`
- **Stack:** Next.js 14 (Pages Router) + Supabase (PostgreSQL) + Tailwind CSS + Vercel

### Key Credentials (for API/push operations)
- **GitHub Repo:** `eq1725/paradocs`
- **Supabase Project Ref:** `bhkbctdmwnowfmqpksed`
- **Supabase URL:** `https://bhkbctdmwnowfmqpksed.supabase.co`
- Secrets (GitHub token, Supabase service role key, OpenAI API key) are stored in Vercel env vars and provided to Claude sessions via chat — NOT committed to repo.

### Vercel Environment Variables
**Set:** ANTHROPIC_API_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_API_KEY, MAPBOX_ACCESS_TOKEN, BETA_PROTECTION_ENABLED, BETA_AUTH_USERNAME, BETA_AUTH_PASSWORD, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY
**Missing:** STRIPE_SECRET_KEY (Chase needs to provide)

---

## SWC Compatibility Rules (CRITICAL)

The Vercel build uses SWC compiler which is strict. ALL code pushed must follow:
- **No template literals in JSX** — use string concatenation (`'hello ' + name`) not backticks
- **Use `var` not `const`/`let`** — SWC sometimes chokes on const in certain contexts
- **Use `function(){}` not arrow functions** — especially in JSX callbacks
- **String concatenation** for class names and URLs
- **Unicode escapes** (`\u2019`) instead of smart quotes

### How Code Gets Pushed

We push via the **GitHub API** (browser-based), not git CLI. Pattern:
1. Fetch current file SHA from GitHub API
2. Base64-encode the new content: `btoa(unescape(encodeURIComponent(text)))`
3. PUT to `https://api.github.com/repos/eq1725/paradocs/contents/{path}`
4. Vercel auto-deploys from main branch

---

## Database Schema — Key Tables

### `reports` table (main content)
Columns: id, title, slug, summary, description, phenomenon_type_id, tags, location_name, location_description, country, state_province, city, coordinates, latitude, longitude, event_date, event_time, event_date_approximate, event_duration_minutes, credibility, witness_count, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, source_url, source_reference, original_report_id, submitted_by, anonymous_submission, submitter_was_witness, status, moderated_by, moderation_notes, featured, view_count, upvotes, downvotes, comment_count, created_at, updated_at, published_at, search_vector, category, related_categories, source_label, original_title, content_type, case_group, connections_last_analyzed

**Note:** `credibility` is TEXT ("low", "medium", "high", "very_high"), NOT numeric.

### `phenomena` table (encyclopedia)
- 1,598 total phenomena across 11 categories
- Categories: cryptids (340), ufos_aliens (322), ghosts_hauntings (323), psychic_phenomena (157), consciousness_practices (67), perception_sensory (66), biological_factors (66), religion_mythology (89), psychological_experiences (58), esoteric_practices (55), combination (55)
- Psychic phenomena entries enriched Feb 2026 (90 entries updated with comprehensive content)

### `ai_usage` table (rate limiting)
- Tracks AI chat usage per user per day
- Tier limits: free=5, basic=25, pro=100, enterprise=750 questions/day

---

## Current Site Features — What's Built

### Core Pages
- **Landing page** (`index.tsx`) — 8-section AllTrails-tier homepage: Hero (animated typewriter search, A/B headlines) → Category Slideshow (full-width crossfade, WebP images) → AI Pattern Insight (4 rotating insights + share button) → Feed Phone Showcase (realistic vector phone frame, mock feed cards, App Store badges + QR) → Map Phone Showcase (phone frame with dark map + report dots, compact platform CTA) → Lab Laptop Showcase (dark charcoal laptop frame, mock Lab workspace) → How It Works + FAQ (3-step process + 5-question accordion) → Data Proof CTA (animated counters, dynamic location count from API)
- **Explore/Feed** (`explore.tsx`) — personalized discovery feed with category filters, search, sort
- **Report detail** (`report/[slug].tsx`) — full report with reactions, comments, share, save, related reports, phenomena links, credibility scoring, investigation journal, evidence section
- **Phenomena/Encyclopedia** (`phenomena/index.tsx`, `phenomena/[slug].tsx`) — 1,598 phenomena with grid/list view, category quick-nav bar, detail pages with Wikipedia images
- **Dashboard** — constellation-first research hub: constellation map V2 preview, research activity feed, research snapshot metrics, suggested explorations, journal, saved reports, digests, insights, settings, subscription. Sidebar organized into Research/Library/Tools groups.
- **Map** (`map.tsx`) — MapBox-powered report map
- **Submit** (`submit.tsx`) — report submission form
- **Auth** — Supabase auth with login, beta access

### AI Features
- **"Ask the Unknown" chat** (`AskTheUnknown.tsx` + `/api/ai/chat.ts`) — slide-up chat panel with contextual questions, streaming responses, model fallback chain: Claude Haiku → OpenAI gpt-4o-mini
- **Pattern detection** (`/api/patterns/`, `/api/cron/analyze-patterns-v2.ts`) — automated cross-report pattern analysis

### API Endpoints
- `/api/embed/[slug]` — Embeddable report cards (HTML/JSON/JS formats)
- `/api/public/stats` — Public site statistics
- `/api/ai/chat` — AI chat with rate limiting
- `/api/user/personalization` — User preference storage
- `/api/user/saved` — Bookmarks/saves
- `/api/patterns/trending` — Trending reports
- `/api/cron/weekly-digest` — Weekly email digest (Resend)
- `/api/subscription/tiers` — Subscription tier definitions
- `/api/beta-signup` — Email capture

---

## Dev Handoff v3 Audit — Sprint Status

### Sprint 1 (Beta Launch) — ✅ MOSTLY COMPLETE
| Feature | Status | Notes |
|---------|--------|-------|
| 3-tap onboarding + "The Reveal" | ✅ Built | OnboardingTour.tsx |
| AI-curated discovery feed | ✅ Built | explore.tsx |
| Immersive reading experience | ✅ Built | report/[slug].tsx |
| Frictionless saves | ✅ Built | dashboard/saved.tsx |
| **Collections (named save folders)** | ❌ Not built | Need DB schema + UI |
| Reactions system | ✅ Built | On report detail pages |
| "Ask the Unknown" AI chat | ✅ Built | AskTheUnknown.tsx + api |

### Sprint 2 (Post-Launch) — PARTIAL
| Feature | Status | Notes |
|---------|--------|-------|
| Weekly digest email | ✅ Built | Resend integration |
| Share Your Experience submission | ✅ Built | submit.tsx |
| Landing page hook | ✅ Built | Stats, hero, CTAs |
| **Connection cards ("Did You Know?")** | ❌ Not built | Cross-report relationships |
| **Smart match alerts** | ❌ Not built | User interest matching |
| **Metered paywall + Stripe** | 🟡 Partial | Tier system exists, Stripe checkout missing |

### Sprint 3 (Month 2) — NOT STARTED
| Feature | Status |
|---------|--------|
| Shareable story cards (viral share images) | ❌ |
| Cancellation flow | ❌ |
| 7-day drift detection emails | ❌ |
| Researcher Mode (power tools) | ❌ |
| Email drip for pre-signup leads | ❌ |

### Sprint 4 (Month 3+) — MOSTLY NOT STARTED
| Feature | Status |
|---------|--------|
| **Embeddable widgets** | ✅ Built |
| A/B testing framework | ✅ Built (5 hero headline variants, useABTest hook) |
| Community challenges | ❌ |
| Year in Review | ❌ |
| Win-back email sequence | ❌ |
| Advisory board / Verified Researcher | ❌ |
| New data drop event system | ❌ |

---

## Recent Work (Mar 3-5, 2026 Sessions) — Phase 2 Regeneration

**Goal:** Bring all `phenomena` table AI content up to quality standards — minimum 800 chars for ai_history, all ai_quick_facts populated.

### What Was Done

**Priority 3 — Regenerate short ai_history entries (<800 chars) across 6 categories:**
All entries with ai_history under 800 characters were regenerated with full encyclopedic content across 6 text fields (ai_history, ai_characteristics, ai_theories, ai_notable_sightings, ai_cultural_impact, ai_summary).

Categories completed in original pass:
- consciousness_practices, combination, psychic_phenomena (prior session)
- ufos_aliens: 80 entries (4 batches)
- ghosts_hauntings: 80 entries (4 batches)
- cryptids: ~66 entries (4 batches)

**Priority 4 — Populate missing ai_quick_facts (JSONB field):**
156 entries across 5 categories populated with 9-key JSON structure: origin, danger_level, active_period, classification, evidence_types, notable_feature, first_documented, typical_encounter, cultural_significance. Completed in 7 SQL batches.

**Rounds 2-4 — Additional short ai_history cleanup:**
After initial pass, verification queries revealed additional short entries. Multiple rounds of fixes:
- Round 2: GH(40) + UFO(43) + Cryptids(40) = 123 entries
- Round 3: GH(20) + UFO(20) + Cryptids(20) = 60 entries
- Round 4 (final): UFO(20) + GH(4) = 24 entries

**Total entries fixed: ~589 ai_history regenerations + 156 ai_quick_facts**

### SQL File Naming Convention
Files are in the workspace root. Pattern: `{category_prefix}{round}_p2_{batch_number}{letter}.sql`
- Category prefixes: cp (consciousness), combo (combination), pp (psychic), ufo (ufos_aliens), gh (ghosts_hauntings), cr (cryptids)
- Round markers: no suffix = round 1, `2` = round 2 (e.g., ufo2), `3` = round 3, `4` = round 4
- Quick facts files: `qf_` prefix (e.g., qf_rm_01a.sql, qf_mix_01.sql)

### Technical Approach
- Two-half parallel generation: Part 1 (entries 1-10) and Part 2 (entries 11-20) launched as parallel Task agents
- Auto-fix pipeline applied to every combined file: trailing/missing commas, wrong table names, wrong field names, duplicate fields
- Quote-aware verification: parser tracks in-string state to avoid false positives from SQL-escaped apostrophes
- Short history extender: finds closing quote of ai_history and inserts extension text before it
- Names with apostrophes (Devil's Promenade Lights, O'Hare Airport UFO Incident) require special handling

### 6 Text Fields — Exact Order & Target Lengths
1. ai_history: 900-1200 chars (MUST be >=800)
2. ai_characteristics: 600-900 chars
3. ai_theories: 700-1000 chars
4. ai_notable_sightings: 500-800 chars
5. ai_cultural_impact: 600-900 chars
6. ai_summary: 200-300 chars (MUST be last before WHERE)

### Verification Query
```sql
SELECT category, COUNT(*) FROM phenomena WHERE LENGTH(ai_history) < 800 GROUP BY category ORDER BY category;
```
**Result as of Mar 5, 2026: NO ROWS RETURNED — all entries meet minimum length.**

### ai_quick_facts Verification
```sql
SELECT category, COUNT(*) FROM phenomena WHERE ai_quick_facts IS NULL GROUP BY category ORDER BY category;
```
**Result as of Mar 5, 2026: NO ROWS RETURNED — all entries have quick_facts populated.**

---

## Earlier Work (Feb 26, 2026 Session)

1. **Dashboard overhaul** — Complete rewrite of dashboard as constellation-first research hub. Sidebar reorganized (Research/Library/Tools), constellation map V2 preview as centerpiece, research activity feed, research snapshot metrics, suggested explorations, compact usage footer. Enhanced `/api/user/stats` with constellation/journal/activity data.
2. **Psychic phenomena content enrichment** — 90 entries updated with comprehensive AI content (description, history, characteristics, theories, cultural impact, notable sightings). Average content length brought from ~3,047 to ~5,500+ chars, matching cryptids and ghosts.
3. **Encyclopedia quick-nav bar** — Horizontal scrollable category pills with icons and counts. IntersectionObserver tracks active section on scroll. Auto-expands collapsed categories on click.
4. **Psychic phenomena expansion** — Category expanded from 55 to 157 entries.
5. **"Back to Encyclopedia" scroll fix** — Fixed scroll restoration bug.

## Earlier Fixes (Feb 15, 2026 Session)

1. **AI chat model fallback** — Added cascade: claude-haiku-4-5-20251001 → claude-3-5-haiku-20241022 → claude-3-haiku-20240307 → gpt-4o-mini
2. **Enterprise rate limit** — Bumped from 100 to 750/day
3. **scrollProgress error** — Fixed undefined scrollProgress variable in report detail
4. **Chat markdown rendering** — Enhanced renderMarkdown with code blocks, headers, numbered lists, bullet lists, links
5. **Landing page stats flash** — Added opacity transition to mask useCountUp zero-state
6. **/encyclopedia redirect** — Added permanent redirects to /phenomena in next.config.js
7. **Embed API** — Fixed 4 bugs: UUID-safe query, column name mismatches, URL paths, credibility mapping
8. **OpenAI API key** — Added to Vercel env vars as fallback AI provider

---

## Outstanding Action Items (Chase)

1. **Add OpenAI API credits** — Balance is $0.00. Go to platform.openai.com → Billing → Add credits. Even $5-10 is enough for a fallback provider. Monthly budget is set at $120 (could lower to $10-20).
2. **Provide STRIPE_SECRET_KEY** — Needed to complete the metered paywall / subscription checkout flow. Get from Stripe Dashboard → Developers → API keys.
3. **Push two old local commits** (if not already done) — `99cf5e2e` and `e93290aa` from a prior session that were blocked by proxy. Run `git push origin main` locally.
4. **Lower OpenAI monthly budget** (optional) — Currently $120/mo, could be $10-20 for a pure fallback.

---

## Next Up — Content Strategy

### Current state: 900 approved reports (after archiving ~1.99M Reddit bulk data)
### Target: ~1,000 "perfect" curated reports for alpha testing

**Approach:**
1. Pull from highest-quality sources in Paradocs Research.xlsx (2,558 researched sources)
2. Target even distribution across 11 categories
3. Every report must have ALL required fields populated (no nulls in critical columns)
4. Use AI-assisted ingestion pipeline: source URL → AI extraction → schema validation → Supabase insert
5. Delete or flag Reddit bulk data before alpha testing

**Source spreadsheet breakdown (2,558 sources):**
- Ghosts and Hauntings: 666 sources
- Combination: 526 sources
- UFOs and Aliens/NHIs: 321 sources
- Psychological Experiences: 301 sources
- Cryptids: 168 sources
- Esoteric Practices and Beliefs: 163 sources
- Consciousness Altering Practices: 139 sources
- Psychic Phenomena (ESP): 123 sources
- Comparative Religion and Mythology: 113 sources

---

## File Structure Reference

```
src/
├── components/
│   ├── AskTheUnknown.tsx       # AI chat slide-up panel
│   ├── Layout.tsx               # Global nav/layout
│   ├── OnboardingTour.tsx       # 3-tap onboarding
│   ├── ReportCard.tsx           # Report preview card
│   ├── MapView.tsx              # MapBox map component
│   ├── homepage/                # Homepage showcase components (PhoneMockup, LaptopMockup, FeedShowcase, MapShowcase, LabShowcase, AIInsight, HowItWorks, AppStoreBadges, QuickNavStrip, DataProofCTA)
│   ├── dashboard/               # Dashboard components (constellation, streak, tier badge, etc.)
│   ├── analytics/               # Analytics components
│   ├── patterns/                # Pattern detection components
│   └── reports/                 # Report-related components
├── pages/
│   ├── index.tsx                # Landing page (8 sections, animated search, A/B headlines)
│   ├── explore.tsx              # Discovery feed
│   ├── map.tsx                  # Map view
│   ├── submit.tsx               # Report submission
│   ├── report/[slug].tsx        # Report detail (40K+)
│   ├── phenomena/               # Encyclopedia pages
│   ├── dashboard/               # User dashboard pages
│   ├── api/
│   │   ├── ai/chat.ts           # AI chat endpoint
│   │   ├── embed/[slug].ts      # Embeddable widget API
│   │   ├── public/stats.ts      # Public statistics
│   │   ├── user/                # User preferences, saves, journal, etc.
│   │   ├── patterns/            # Pattern detection APIs
│   │   ├── subscription/        # Tier definitions
│   │   └── cron/                # Scheduled jobs (digest, patterns, ingest)
│   └── auth/                    # Auth pages
└── lib/
    ├── supabase.ts              # Supabase client
    └── ingestion/
        ├── engine.ts            # Main ingestion orchestrator
        ├── types.ts             # Ingestion type definitions
        ├── adapters/            # Source adapters (nuforc, bfro, reddit, etc.)
        └── filters/
            ├── index.ts         # Centralized exports
            ├── quality-filter.ts # Quality scoring (100-pt scale)
            ├── title-improver.ts # AI-assisted title improvement
            ├── validation.ts    # [NEW] Field validation & sanitization
            ├── deduplication.ts # [NEW] Content fingerprinting & dedup
            └── location-extractor.ts # [NEW] Location/date extraction from text
```

---

## Session Progress Log

### May 2, 2026 — Today (/discover) V3-V6 polish, date repair, V6 hook regen
**Status:** COMPLETE (deployed; admin key rotated)

Continuation of the May 1 panel review work. Six iterative passes through
the Today feed addressing visual mass-market readiness, content quality,
and a major data audit + repair.

**V3 (commit 6c56e31f):** Lifted sticky CTA above the mobile bottom-tab nav
(was hidden behind it). Capped headlines at 4 lines (8-line Pali Canon
shrinks to 4). Heavier hero scrim (0.55 → 0.78 → 0.95) for legibility on
imagery-heavy cards. Special cards (OnThisDate, Cluster, Promo) re-balanced
to top-third layout. Replaced Research Hub blurred placeholder with three
concrete benefit chips ('Cross-reference', 'Pattern detection', 'Build
constellations') + sharper headline.

**V4 (commit 1328d0b3):** Bookmark toggle (was save-only). Killed
progress/X/total counter — anti-feature for the Gaia cohort, reads as
homework not exploration. Removed Constellation widget from card
expansions and rabbit-hole panel (kept the file in codebase for future
use). Fixed the '0' rendering bug in TodayHeader (streakDays falsy check
returning 0 instead of false). Removed the dot above active mobile nav
icon. Centered special cards justify-center within the available card
area (V3's pt-22vh was leaving content too low).

**V5 (commit 168f59bb):** Killed iOS rubberband on /discover by adding
overscrollBehavior: 'none' on the OUTER card pane (V3 only contained the
inner body). Tightened bottom buffer 144px → 100px now that V3 math is
verified. Switched Tailwind arbitrary `bottom-[calc(...)]` class to a CSS
class `today-cta-anchor` with media query — Tailwind JIT was unreliable
with nested env() commas. Comprehensive desktop panel review document
written to `TODAY_PANEL_REVIEW_V5.md`.

**V5-next (commit ebb4ed3a):** Bookmark/share/(i) icons grouped in single
backdrop-blur pill. Streak chip is now a Link to /lab?tab=streak. Pull-to-
refresh at idx=0 (drag-down past 80px reseeds + reloads). Hero image
attribution rendered bottom-right of cards. Adaptive line-clamp (4 lines
with hero, 6 lines text-only). Card pane height-capped at min(720px,
viewport-9rem) on md+ — desktop card now reads as a discrete object,
not a tall lonely pane. Connected Cases sidebar lifted from xl: → lg:
(major win for iPad-landscape Gaia cohort). Edge chevrons expand on hover
into 'Dismiss / Save' labeled pills. '?' shortcut toggle pulses once per
session via sessionStorage. Headline hover state on desktop. Grid mode
overlay (TodayGridMode component, 3-4 column card preview, lg+ only,
toggled via LayoutGrid icon in header). Today's Lead badge enriched with
streak context ('Today's lead · day 5').

**V6 (commit dd724957):** Lead-with-identification prompt rewrites for
both phenomena hooks (`generate-phenomena-hooks.ts`) and report hooks
(`feed-hook.service.ts`). Sentence 1 = plain-language identification
('Scotland's most famous lake monster, reported from Loch Ness since
1933.'); Sentence 2 = unresolved tension. CONTENT_QUALITY_PANEL_REVIEW.md
documents the panel observations + audit SQL + comparable products
(Apple News, Atlantic, Wikipedia ledes, NYT Cooking, Pocket Discover).
OnThisDate API placeholder guard added to skip Jan 1 / May 1 / Mar 8 /
Dec 12 (placeholder dump days identified in the audit).

**V6.1 (commit 2251f4a3):** Audit revealed 230 phenomena on Jan 1
(placeholder dump), 12 on May 1 (Loch Ness wrongly here at 1933-05-02),
plus pervasive use of row-creation timestamps as first_reported_date
(Bigfoot at 2022-10-25, NDE at 1945-01-01). OnThisDate API rewritten to
parse 'Month Day, YYYY' patterns out of `ai_quick_facts.first_documented`
FIRST, falling back to first_reported_date only when AI text has no
parseable date AND the column isn't a known placeholder. New
`/api/admin/ai/repair-dates` endpoint that re-extracts dates from AI
narrative fields via Claude Haiku (returns YYYY-MM-DD / YYYY-MM / YYYY
/ unknown; nullifies aggressively for year-only and unknown).

**V6.2-V6.5 (commits 3213a4fb, 3f99a94b, 13b920fa, aee74055):** Iterative
hardening of the repair-dates endpoint and the phenomena-hooks endpoint:
server-side placeholder filter (V6.2), parser hardening + raised
max_tokens (V6.3), retryErrors flag (V6.4), force_all action +
query-param support for phenomena-hooks (V6.5 — this was a critical bug:
the endpoint only read action from req.body, so all earlier curl loops
with ?action=force_all were silently no-op'ing through batch_missing,
which only generates hooks for phenomena WITHOUT an existing one).

**Data ops executed:**
1. Date repair: full corpus sweep via repair-dates endpoint. ~190
   day/month-precision repairs (Loch Ness 1933-05-02 → 1933-07-22,
   Mothman 1966-01-01 → 1966-11-15, Dover Demon 1977-01-01 →
   1977-04-21, etc.). ~4,500 nullified (concept-rooted phenomena
   without specific Western discovery dates — encyclopedia year display
   still works via ai_quick_facts.first_documented). Placeholder
   distribution dropped from 230 on Jan 1 to 14 on Jan 1.
2. Hook regeneration with V6 prompt: 4,753 phenomena + 25 reports.
   Zero failures across 48 batches. Verified spot-check: every checked
   phenomenon (Loch Ness, Bigfoot, Mothman, NDE, Tulpa, Astral
   Projection, Grey Alien, Lucid Dreaming, etc.) leads with plain-
   language identification before the engagement angle.
3. ADMIN_API_KEY rotated in Vercel post-session (was exposed in chat
   logs during the data ops phase).

**New files:**
- `src/components/discover/TodayCardShell.tsx` — viewport-fit chrome
- `src/components/discover/TodayGridMode.tsx` — desktop grid overlay
- `src/components/discover/TodayHeader.tsx` — sticky header, simplified
- `src/components/discover/GestureTutorial.tsx` — first-run swipe tutorial
- `src/components/discover/EndOfFeedCard.tsx` — celebration card
- `src/components/discover/SkeletonCard.tsx` — dossier-styled loading
- `src/components/discover/BackToTodayBar.tsx` — return-from-detail bar
- `src/lib/hooks/useTodaySaves.ts` — save persistence + dispatch by type
- `src/lib/hooks/useTodayReturn.ts` — sessionStorage marker
- `src/pages/api/admin/ai/repair-dates.ts` — date extraction endpoint
- `src/pages/api/user/saved-phenomena.ts` — parallel saves for phenomena
- `supabase/migrations/20260501_saved_phenomena.sql` — saved_phenomena table
- Three review documents:
  - `REPORTS_DISCOVER_PANEL_REVIEW.md` (V0)
  - `TODAY_LAUNCH_DECISION_MATRIX.md` (cohort-calibrated roadmap)
  - `TODAY_PANEL_REVIEW_V5.md` (mobile + desktop pass)
  - `TODAY_VISUAL_PANEL_REVIEW_V2.md` (mass-market readiness)
  - `CONTENT_QUALITY_PANEL_REVIEW.md` (V6 lead-with-identification)

**Booked for V7+ (separate sprints):**
- Robert Stack documentary-voice narrative regeneration (paradocs_narrative
  + ai_description) with mandatory skeptical-perspective paragraph
- Manual curation of top-50 phenomena (Roswell, Rendlesham, Loch Ness,
  Bell Witch, etc.) — needs human review
- 'Today's Lead Case' push notification infrastructure (highest single
  retention lever per V2 panel; in-app badge already shipped)
- Year in Review / Wrapped feature (V6 spend per phenomena coverage
  is now sufficient to support this)
- Light theme variant
- Sound design pass
- Tablet-specific layout refinement
- Fix .in() URL-length bug in repair-dates if a clean placeholder-only
  re-run is ever needed (force=true sweep handled the same outcome)

---

### May 1, 2026 (PM) — Reports/Discover Panel Review + Full Implementation
**Status:** COMPLETE (TS clean; pending push + deploy)

Five-expert panel review of `/discover` (UX, mobile, engagement, product, IA)
saved to `REPORTS_DISCOVER_PANEL_REVIEW.md`. All 23 prioritized recommendations
plus the "out of scope" peripherals were implemented in one pass.

**Renamed "Reports" → "Today" everywhere** — bottom nav (`MobileBottomTabs.tsx`),
desktop nav (`Layout.tsx`), `<title>`, footer Community column. Footer
"Investigate" → "Lab" cleanup at the same time.

**New components:**
- `src/components/discover/TodayHeader.tsx` — sticky page header with sr-only
  h1, lens chip strip (All / Trending / On this day / Photo + Video / Recent),
  scrollable category chip strip, 8-segment progress bar, "View as list →"
  link, aria-live feedback zone, "?" shortcut toggle.
- `src/components/discover/GestureTutorial.tsx` — first-run interactive overlay
  teaching swipe up/right/left/down. Replays via shortcut bar.
- `src/components/discover/EndOfFeedCard.tsx` — celebration card with streak
  pull from `/api/user/streak` and 3 outbound CTAs.
- `src/components/discover/SkeletonCard.tsx` — dossier-styled loading
  placeholder. Replaces "Loading stories…" spinner.
- `src/components/discover/BackToTodayBar.tsx` — sticky bar shown on
  `/report/[slug]` and `/phenomena/[slug]` when user came from /discover.

**New hooks:**
- `src/lib/hooks/useTodaySaves.ts` — save persistence (localStorage for
  anonymous; POST `/api/user/saved` with `collection_name='Today'` for auth).
- `src/lib/hooks/useTodayReturn.ts` — sessionStorage marker for back-to-Today.

**`/src/pages/discover.tsx` — full refactor** preserving all infrastructure
(feed-v2, onboarding, special cards, gating, behavioral events). New:
TodayHeader, URL-driven `?lens=`/`?category=`, touch handler gated on
`expanded`, long-press = "More like this" (heart pulse), keyboard `H` and `?`,
A/B test `today_auto_expand_v1` (variant 'on' auto-expands at 4s dwell), edge
chevrons replace 6%-opacity vertical text, persistent saves via useTodaySaves,
EndOfFeedCard at !hasMore, tier-aware promo (Pro skipped, position ±3 jitter,
≥2 dismissals → suppressed), Constellation consolidated to single placement,
desktop shortcut bar default-collapsed, contextual signup prompt at idx=5,
auto setTodayReturnMarker on /report/* + /phenomena/* link clicks.

**`DiscoverCards.tsx`:** new `CollapseButton`, `onCollapse` prop on all three
card variants, `role="article"` + aria-labels, single-paywall comment marker.

**Special cards self-identify:** "Cluster pattern" pill on ClusteringCard,
"From Paradocs" pill on ResearchHubPromo. OnThisDateCard already had its own
"On This Date" badge.

**`/explore`** honors `?lens=` from /discover's "View as list →" link.

**`Layout.tsx`** drops `pb-20` on `/discover` to fix the double-bottom-padding
finding (~80px of dead space recovered).

**`globals.css`** adds: `today-skeleton`, `today-chevron-pulse`,
`today-heart-pulse`, `today-tutorial-arrow`, `today-streak-glow`.

**Homepage `DiscoverPreview`** section heading → "Today on Paradocs" with an
"Open Today →" link inline.

**Verification:** `tsc --noEmit -p tsconfig.json` shows zero new errors from
any file I created or modified. Pre-existing errors in `DiscoverCards.tsx`
(`source_url`) and `report/[slug].tsx` (voting code) are unrelated.

**Pending:** push to GitHub API + Vercel deploy; live mobile/desktop QA of
tutorial flow, save persistence across refresh, back-to-Today bar, lens chip
filtering, end-of-feed celebration, shortcut bar toggle.

---

### May 1, 2026 — Radar/Lab Polish Continuation (Toast, Footer, Legal, Naming, Sticky Tabs)
**Status:** COMPLETE

Continuation of the Radar/Lab polish pass. Five targeted fixes:

1. **Toast centering fix** (`src/components/dashboard/LabConstellationTab.tsx`) — The "Notify me" toast was not centering on mobile or desktop. Root cause: the `cv2FadeUp` CSS animation's final `transform: translateY(0)` was overriding the inline `transform: translateX(-50%)` used for centering. Fix: restructured toast to use `left:0; right:0` with flexbox centering on an outer container, so the animation transform on the inner pill doesn't conflict with centering.

2. **Hide footer on mobile** (`src/components/Layout.tsx`) — Added `hidden md:block` to the `<footer>` element. The bottom tab nav replaces the footer on mobile, so the website footer only shows on desktop now.

3. **Added legal/about links to Profile page** (`src/pages/profile.tsx`) — Added About, Privacy Policy, and Terms of Service links in a mobile-only "About & Legal" section on the Profile page (above Sign Out), so those links remain accessible after hiding the footer on mobile.

4. **Unified naming: "Investigate" to "Lab"** (`src/components/mobile/MobileBottomTabs.tsx`) — Changed the mobile bottom tab label from "Investigate" to "Lab" for consistency with desktop nav, page heading, and URL.

5. **Sticky tab bars** (`src/styles/globals.css`, `src/pages/lab.tsx`, `src/pages/explore.tsx`) — Made tab bars sticky on both Lab and Explore pages:
   - Created `.sticky-below-header` CSS utility class in globals.css that accounts for `safe-area-inset-top` (Dynamic Island/notch)
   - Lab: split header into scrolling title row + sticky tab bar
   - Explore: replaced hardcoded `top-14` with `sticky-below-header` class to fix mobile safe-area gap

**Files modified:**
- `src/components/dashboard/LabConstellationTab.tsx`
- `src/components/Layout.tsx`
- `src/pages/profile.tsx`
- `src/components/mobile/MobileBottomTabs.tsx`
- `src/styles/globals.css`
- `src/pages/lab.tsx`
- `src/pages/explore.tsx`

### April 27-29, 2026 — Homepage Redesign (AllTrails Benchmark)
**Status:** IN PROGRESS — iterating with Chase

- Complete homepage overhaul benchmarked against AllTrails.com for world-class visual quality
- 8 new homepage components built: PhoneMockup, LaptopMockup, FeedShowcase, MapShowcase, LabShowcase, AIInsight (rebuilt with 4 rotating insights + share), HowItWorks (new FAQ section), AppStoreBadges
- Realistic vector device frames (SVG with evenodd transparent screen cutouts) for both phone and laptop
- Phone frame extracted from purchased vector asset, laptop darkened to charcoal to reduce distraction
- Animated typewriter search placeholder cycling through 7 real example queries
- Category slideshow images converted to WebP (80-87% file size savings) with `<picture>` fallback
- AI Insight moved before phone sections (strongest differentiator hits earlier in scroll)
- Feed section: full App Store badges + QR; Map section: compact "Available on iOS, Android & Web" (varied treatment)
- How It Works (3-step process) + FAQ accordion added above final CTA for SEO and user clarity
- Multiple expert panel reviews (up to 12 panelists including domain SMEs) drove iterative improvements
- Section layout: top-aligned text with pt-16 offset, tighter gap (56px), aggressive device breakout (-my-16)
- Brand fonts: Changa (display), Changa One (wordmark), Inter (body). Brand color: #9000F0
- All changes pushed to main, auto-deployed on Vercel
- **Pending:** Replace static mockup content with looped video recordings, connect AI insights to real pipeline, mobile viewport testing

### March 3-5, 2026 — Phase 2 Regeneration
**Status:** COMPLETE

- All phenomena ai_history entries brought to >=800 chars (~589 entries regenerated across 4 rounds)
- All phenomena ai_quick_facts populated (156 entries, 9-key JSONB structure)
- Categories covered: ufos_aliens, ghosts_hauntings, cryptids, religion_mythology, psychic_phenomena, consciousness_practices, combination, psychological_experiences
- ~40 SQL files generated, verified, and executed via Supabase SQL Editor

### February 26, 2026 — Dashboard & Content Sprint
**Status:** COMPLETE

- Dashboard overhaul deployed (constellation-first research hub)
- Psychic phenomena expanded from 55 → 157 entries
- 90 short psychic phenomena entries enriched with comprehensive content
- Encyclopedia quick-nav bar deployed
- All changes pushed via GitHub API and auto-deployed on Vercel

### February 15, 2026 — Data Cleanup & Pipeline
**Status:** COMPLETE — 900 approved reports (up from 836)

- Soft-archived ~1.99M low-quality Reddit-scraped reports
- Three new ingestion pipeline modules: validation, deduplication, location extraction
- AI chat fallback chain, embed API fixes, various UX fixes

### Outstanding Action Items
1. [WAITING] Stripe Secret Key — Chase needs to provide for checkout flow
2. [COMPLETE] Phase 2 Regeneration — all ai_history >=800 chars, all ai_quick_facts populated
3. [COMPLETE] Dashboard overhaul — constellation-first research hub
4. [COMPLETE] Psychic phenomena content enrichment — 90 entries updated
5. [COMPLETE] Encyclopedia navigation — quick-nav bar with category pills
6. [NEXT] Curate reports to 1000 — need ~100 more from diverse sources
7. [OPTIONAL] OpenAI monthly budget reduction ($120 to $10-20)
8. [FUTURE] Sprint 2-4 features per Dev Handoff v3
9. [IN PROGRESS] Homepage redesign — AllTrails-tier visual overhaul (April 27-29, 2026). 8 sections built. Pending: replace static mockups with video recordings, connect AI insights to pipeline, mobile testing.
10. [NEXT] Replace static phone/laptop mockup content with looped demo video recordings
11. [NEXT] Connect rotating AI insights to real pipeline results post-mass-ingestion
12. [NOTE] Apple JWT secret expires September 18, 2026
13. [PENDING] Task #55: Handle incomplete encyclopedia pages gracefully
14. [PENDING] Task #62: POST-INGESTION: Replace hardcoded 2.3M with real database count
15. [NEXT] Expert panel review and redesign of Reports tab (discover page) on desktop and mobile

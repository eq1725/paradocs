# V11.17.82 — Date extractor architectural-context guard

## The bug

Founder-flagged report: `last-night-i-rode-out-the-vibrations-gl6dd5`

- Title: "Gold Cord and Warehouse Extraction During Sleep Paralysis"
- Slug clearly says "last night"
- `event_date: 1902-01-01`, `event_date_extracted_from: prose-year`
- Body: "I drank a 40 oz a couple hours before bed... I got pulled out into the front of some old early 1900s warehouse looking building."

The "1900s" in the prose describes the AGE OF THE BUILDING in the dream,
not when the experience happened. The extractor's `detectApproximate`
naively pulled "1900s" → 1902-01-01.

## The fix

One single point of change: `src/lib/ingestion/utils/extract-date.ts`.
All 15 adapters delegate to the shared `extractDate()` utility, so the
guard fires across every ingest path.

### `hasArchitecturalContext(text, matchStart, matchedText)`

Returns `true` (REJECT the year) when the year mention is bound within
~30 chars to architectural / object-age context. Three trigger paths:

1. **Architectural / object-age noun AFTER the year** (within 30 chars):
   building, house, cottage, cabin, shack, barn, farmhouse, warehouse,
   factory, mill, church, chapel, cathedral, fort, mansion, manor,
   asylum, sanitarium, hospital, hotel, motel, inn, theater, school,
   prison, jail, cemetery, gravestone, tombstone, tomb, crypt, monument,
   bridge, tunnel, station, depot, lighthouse, windmill, castle, palace,
   ruin, car, truck, pickup, van, bus, tractor, plane, biplane,
   locomotive, train, wagon, carriage, buggy, motorcycle, boat, ship,
   dress, suit, uniform, coat, hat, gown, attire, clothing, furniture,
   lamp, radio, phonograph, style, era, looking, fashion, design,
   vintage, period, aesthetic.

2. **Construction verb BEFORE the year** (within 30 chars):
   built, constructed, erected, founded, established, opened, dating,
   dates, dated, circa, c., ca., made, manufactured, painted, restored,
   renovated.

3. **"Turn of the [century]" idiom**: when the BEFORE window ends with
   "turn of the".

### Refactored extractor paths

All three year-emitting paths now WALK the regex (rather than firstMatch)
so a guarded match doesn't poison the whole text. If the first match is
architectural-bound, we keep walking; only if every match is rejected
does the extractor fall through.

- `extractProseYear` — contextual + punctuation paths
- `detectApproximate` — early/mid/late decade phrases, "the 1970s"
- NEW: bare `<decade>s` (e.g. "1900s", "1800s") — was previously not
  matched at all; now matched but ALWAYS guard-checked. Without the
  leading "early/mid/late/the" and without a clear binding context,
  bare decade phrases produce no date (too noisy to trust as a
  free-standing event year).

### Reddit-v2 + YouTube — pass `referenceDate`

Both adapters now pass `referenceDate` (the post's `created_utc` /
`publishedAt`) to `extractDate`, so the prose-relative layer can resolve
"last night", "yesterday", "3 days ago" against the actual post
timestamp. Reddit-v2 also now feeds title + selftext to the extractor
(was selftext only), so titles like "Last night I saw..." get caught.

## Smoke test results

`scripts/test-extract-date-v11-17-82.ts` — 12/12 passing.

| Input | Expected | Got |
|---|---|---|
| "old early 1900s warehouse looking building" | unknown | unknown |
| "last night I rode out the vibrations..." + ref 2025-06-04 | exact 2025-06-03 | exact 2025-06-03 (prose-relative) |
| "1970s style truck" | unknown | unknown |
| "built in 1865" | unknown | unknown |
| "1800s farmhouse" | unknown | unknown |
| "circa 1920 mansion" | unknown | unknown |
| "I saw a ghost in 1995" | year 1995 | year 1995 (prose-year) |
| "in the late 90s" | year 1997 approximate | year 1997 |
| "On April 28th 2007" | exact 2007-04-28 | exact 2007-04-28 (prose-monthname) |
| "in 1996" | year 1996 | year 1996 (prose-year) |
| "1970s truck ... happened in 2018" | year 2018 | year 2018 |

Existing regression suite (`scripts/test-extract-date.ts`): 43/43 still
passing.

## Backfill — `scripts/backfill-suspect-event-dates.ts`

Scope: `event_date_extracted_from='prose-year'` AND `event_date<1980-01-01`
AND `source_type IN ('reddit','youtube')` — the highest-signal slice
(modern internet posts with old "year" extractions).

**Apply-run results**:

```
scanned:                1608
unchanged (same result): 1351
cleared to NULL:         200
reassigned to new date:   57
errors:                    0
Wrote 257 updates.
```

Idempotent — re-running produces the same result against already-updated
rows. Drain-safe — UPDATE only, never DELETE.

The founder's gl6dd5 report is now:
```
event_date:              null
event_date_precision:    unknown
event_date_extracted_from: none
```

## Files

**Modified**
- `src/lib/ingestion/utils/extract-date.ts` — added
  `hasArchitecturalContext` guard + reworked year-emitting paths to walk
  all matches. V11.17.82 stamps throughout.
- `src/lib/ingestion/adapters/reddit-v2.ts` — pass `referenceDate` and
  feed title+selftext to the extractor.
- `src/lib/ingestion/adapters/youtube.ts` — pass `referenceDate` (video
  publishedAt for videos, comment publishedAt for comments).

**Created**
- `scripts/test-extract-date-v11-17-82.ts` — 12-case smoke test pinning
  the guard and the negative controls.
- `scripts/backfill-suspect-event-dates.ts` — idempotent backfill.

## Open questions

- Should we extend the backfill scope to NUFORC + structured-field
  prose-year false positives? Probably not — those came through the
  `structured` path not `prose-year`, so they're not in the eligible set.
- Should we backfill `event_date_extracted_from='prose-year'` rows with
  `event_date >= 1980` too? Possibly — there are likely false positives
  there (e.g. "2010s style truck"), but the signal/noise is much worse
  because legitimate modern event years live in that range. Recommend
  shipping V11.17.82 to ingest first, then revisiting if dashboards show
  date-precision degradation.

## Pre-existing typecheck noise (NOT introduced)

`src/lib/ingestion/adapters/oberf.ts` and `adcrf.ts` have narrow return
type unions for date extraction that omit `'prose-relative'`. This
predates V11.17.82 (the unions never included `'prose-relative'` since
the feature was added in V11.14). My changes did not modify those files.

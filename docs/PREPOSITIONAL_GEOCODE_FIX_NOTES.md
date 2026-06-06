# V11.17.99 — Prepositional-Prefix Geocode Fix

## TL;DR

Reports whose `location_name` or `city` begins with a prepositional phrase
("Over X", "Near X", "South of X", "Between X and Y") were geocoded by
asking MapTiler to parse the literal phrase. MapTiler can't, so it either
fuzzy-matched a similarly-named feature far from the user's intent
(founder's flagged Toledo Bend Lake report pinned 150mi south at Beaumont)
or picked the wrong half of a "Between A and B" pair.

Fix:

1. `geocoding.service.ts` — new `stripPrepositionalPrefix()` pure helper +
   prefix-detection wired into `geocodeStructuredLocation()` before the
   live geocode. When a prefix was stripped, we also distrust
   `address`/`street`-precision hits as fabricated specificity and fall
   back to the state centroid (synthetic=true) instead of inventing
   coordinates.
2. `scripts/backfill-prepositional-locations.ts` — sweeps existing rows
   matching any of the 14 prepositional patterns, re-runs through the new
   structured geocoder, and updates lat/lng + coords_synthetic +
   location_name when results differ. Idempotent with `--dry-run`.

## Bug confirmation

Flagged report
`triangle-sighting-in-over-toledo-bend-lake-texas-2022-08-07-dthoah`:

| Field             | Before                         | Reality                       |
| ----------------- | ------------------------------ | ----------------------------- |
| `location_name`   | `Over Toledo bend lake, Texas` | (Toledo Bend Reservoir, TX/LA border) |
| `latitude`        | `30.07428449`                  | ~31.57                        |
| `longitude`       | `-93.89537564`                 | ~-93.79                       |
| `coords_synthetic`| `false`                        |                               |

Pin was at Port Arthur/Beaumont area on the Gulf, ~150 mi south of
the actual reservoir.

Direct MapTiler probe confirmed the misfire:
- Query `Over Toledo bend lake, Texas` → top result `Toledo Bend, Texas`
  (`major_landform`) at `[-93.8954, 30.0743]` — Beaumont area.
- Query `Toledo Bend Reservoir` via Nominatim → correct
  `[31.5690, -93.7891]`.

MapTiler keeps misplacing this particular feature even when the prefix
is stripped — it returns "Toledo Bend Drive" addresses in Denton/Kyle.
So for this specific report the safe answer is the state centroid
(coords_synthetic=true), which is what V11.17.99 now does.

## Audit

48 unique reports across `location_name` and `city` columns prefixed
with one of:

| Prefix           | Approx count (location_name) |
| ---------------- | ---------------------------- |
| Over             | 2                            |
| Above            | 2                            |
| Near             | 18                           |
| Outside          | 3                            |
| South of         | 3                            |
| North of         | 3                            |
| East of          | 0                            |
| West of          | 3                            |
| Between          | 13                           |
| Just outside/etc.| 1                            |

Total unique candidates (union of `city` + `location_name` matches): 48.

## Code path

- `src/lib/services/geocoding.service.ts`
  - `stripPrepositionalPrefix()` — new pure helper, lines ~313–357.
  - `geocodeStructuredLocation()` — new prefix-handling block lines
    ~485–515 (clean phrase before query) + overspecified detection
    lines ~535–558 (distrust address/street precision when prefix was
    stripped → fall through to state centroid).
- `src/lib/ingestion/enrichment/report-enricher.ts` (`geocodeReport`,
  lines 329–380) — unchanged; it already calls
  `geocodeStructuredLocation`, so it inherits the V11.17.99 fix.
- `src/lib/services/location-extraction.service.ts` — unchanged; same
  reason.
- `scripts/backfill-prepositional-locations.ts` — new.

## Regex

```
/^\s*(over|above|near|outside|just\s+outside|just\s+(?:north|south|east|west)\s+of|south\s+of|north\s+of|east\s+of|west\s+of|between)\s+/i
```

Mandatory trailing space prevents false positives like "Overland Park"
or "Nearpoint, Alaska".

## Backfill results

```
Found 48 candidate reports.
Re-geocoded:
  25 changed
    -> 13 moved to a new specific match (prefix stripped, locality-precision hit)
    -> 12 cleared to state centroid (coords_synthetic=true)
  22 unchanged (new result matched existing within ~111m)
   1 returned null (Antarctica edge case — no state-centroid table entry; left alone)

Updated 25 of 25 reports (0 errors).
```

### Sample before/after

| Slug                                              | Before                | After (synth)                  |
| ------------------------------------------------- | --------------------- | ------------------------------ |
| `…over-toledo-bend-lake-texas…dthoah`             | (30.07, -93.90)       | (31.97, -99.90) Texas centroid (true) |
| `…above-nature-protected-area-chko-k-ivokl-t…`    | (66.00, 169.49)       | (49.96, 14.07) — actual Czechia (false) |
| `…near-cortez-colorado…dtxkqk`                    | (40.55, -105.07)      | (37.35, -108.58) — actual Cortez (false) |
| `…outside-la-california…dty4ra`                   | (38.25, -122.14)      | (34.05, -118.24) — actual LA (false) |
| `…south-of-waterloo-iowa…dthjsh`                  | (41.66, -91.53)       | (41.88, -93.10) Iowa centroid (true) |
| `…near-muhlenburg-airport-kentucky…dtyqye`        | (37.20, -87.14)       | (37.84, -84.27) Kentucky centroid (true) |
| `…near-san-diego-california…dtgwmw`               | (32.71, -116.98)      | (32.72, -117.16) — actual San Diego (false) |
| `…near-fareham…dtd4an`                            | (53.99, -7.36) (Ireland) | (50.85, -1.18) — actual Fareham UK (false) |

## Spot-checks for founder

1. **Toledo Bend** — `discoverparadocs.com/report/triangle-sighting-in-over-toledo-bend-lake-texas-2022-08-07-dthoah`
   Pin now at Texas state-centroid (~31.97, -99.90) rather than Beaumont.
   The actual reservoir is at (31.57, -93.79); we don't pin to the lake
   itself because MapTiler still won't resolve it (returns Denton/Kyle
   addresses for the cleaned phrase). State centroid is the honest
   fallback. Map header will show "Texas" with synthetic=true.

2. **Near Cortez, Colorado** —
   `discoverparadocs.com/report/light-sighting-in-near-cortez-colorado-2022-04-01-dtxkqk`
   Was at Fort Collins (40.55, -105.07). Now at Cortez (37.35, -108.58).
   Real fix — MapTiler nailed the city after we stripped "Near".

3. **Near Fareham** —
   `discoverparadocs.com/report/fireball-sighting-in-near-fareham-2023-10-04-dtd4an`
   Was at (53.99, -7.36) — middle of Ireland. Now at (50.85, -1.18) —
   actual Fareham, Hampshire UK. The "Near" prefix had pushed the
   geocoder onto "Fareham House" or similar.

## Open question

- The "Above nature protected area CHKO Křivoklátsko, Beroun District"
  report had `state_province` set to "Beroun District" but the original
  bad coords (66°N, 169°E) were *Russian Arctic*. The fix re-geocoded
  it to actual Czechia at (49.96, 14.07), which matches its actual
  location_name. The Antarctica report
  (`…near-deception-island-in-antarctica-…`) couldn't be re-fixed
  because Antarctica has no state-centroid entry — its existing wrong
  coords (Washington state at 48.41, -122.67) remain. Should I add
  Antarctica to the state-centroid table, or just clear coords on those
  Antarctica reports? Founder call.

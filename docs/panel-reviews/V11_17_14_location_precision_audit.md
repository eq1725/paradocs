# Location Precision Audit + Refinement Plan

**Date:** May 24, 2026
**Trigger:** Bug #2 in V11.17.14 bug-hunting session — Chase observed inconsistency between "rural Pennsylvania" and "East Stroudsburg, PA" labeling on map cluster popup
**Scope:** Audit + recommendation, not a one-night code fix

---

## Findings

### Overall precision distribution (approved reports, n=101,137)

| Precision | Count | % of corpus |
|---|---|---|
| `unknown` | 92,986 | 91% |
| `country` | 5,681 | 5.6% |
| `exact` | 2,539 | 2.5% |
| `region` | 1,891 | 1.9% |
| `city` | 26 | 0.03% |
| `locality` | 0 | 0% |
| `missing` | 14 | 0.01% |

### Per-source breakdown

| Source | Total | Fine (exact+locality+city) | Coarse (region+country) | Unknown |
|---|---|---|---|---|
| reddit | 98,046 | 1,837 (2%) | 7,247 (7%) | 88,962 (91%) |
| nderf | 5,086 | 727 (14%) | 324 (6%) | 4,035 (79%) |
| nuforc | 2 | 1 (50%) | 1 (50%) | 0 |
| user_submission | 3 | 0 | 0 | 3 |

### Vague-location-name prefixes

Reports where `location_name` opens with vague preamble:

| Prefix | Count |
|---|---|
| `"rural "` (e.g., "rural Pennsylvania") | 201 |
| `"somewhere in "` | 0 |
| `"just outside "` | 0 |
| `"near "` (after first word) | 0 |

---

## Root cause analysis

**The 91% `unknown` is historical, not active.** Pre-V11.14 ingestion didn't set the `metadata.location_precision` field at all. NUFORC and NDERF orchestrators (built this session) DO set it. So:

- New ingestion: precision is being tracked
- Historical bulk imports (Reddit Arctic Shift): no precision metadata

This is not a regression. It's a backfill opportunity.

---

## What Chase actually saw (the screenshot)

The map cluster popup showed both "East Stroudsburg, PA" AND "rural Pennsylvania" in the same cluster. Both ARE valid representations of the underlying data:

- "East Stroudsburg, PA" — witness shared a specific town
- "rural Pennsylvania" — witness said "happened in rural PA somewhere"

The platform is correctly preserving each witness's own specificity. The UX issue is that both look like "location labels" with equal visual weight, even though they represent very different confidence levels.

---

## Recommendations (in priority order)

### Recommendation 1 — Add precision badges to location displays (1-2 days dev)

Where location_name shows on a report card or report page, render with a small precision indicator:

```
📍 East Stroudsburg, PA           ← exact (no badge needed, default)
📍 Pennsylvania · Approximate     ← region
📍 United States · Country only   ← country
📍 Rural Pennsylvania · Witness only* ← unknown / witness-stated-only
```

Map view: vary the marker style — exact-precision dots vs region-fade ovals vs country-blob.

This conveys data honesty without losing the underlying records.

### Recommendation 2 — Backfill `metadata.location_precision` for the 92,986 unknown-precision reports (1 day)

Use a deterministic rule based on what fields are populated:

| Has city? | Has state? | Has country? | Inferred precision |
|---|---|---|---|
| ✓ | ✓ | ✓ | `exact` (assume city geocoded — verify by checking `coords_synthetic`) |
| ✗ | ✓ | ✓ | `region` |
| ✗ | ✗ | ✓ | `country` |
| ✗ | ✗ | ✗ | `unknown` |
| Has "rural"/"somewhere" prefix in location_name | (override) | | `region` |

Drain-safe: only updates metadata, no DELETE.

Cost: zero (no AI involved, pure SQL/Node iteration).

### Recommendation 3 — Tighten extraction-time location sanitizer (2-3 hours)

The current `extractLocation` in adapters preserves vague descriptors but doesn't tag them. Improvements:

1. Detect vague prefixes ("rural", "somewhere in", "just outside", "near", "around") at extraction time
2. When present, set `metadata.location_precision = 'witness_approximate'` (new bucket)
3. Strip the prefix for display purposes (location_name → "Pennsylvania" not "rural Pennsylvania") — keep the prefix in metadata for context
4. Geocode to state/region centroid only, never claim city

### Recommendation 4 — Map clustering policy (1 day)

On map view, when zooming OUT past a precision threshold:

- Show exact-precision dots normally
- Show region-precision dots as a faded ring or hatched area, not a sharp pin
- Show country-precision reports as a single "N reports somewhere in this country" overlay, NOT a pin at centroid (the centroid pin is misleading)

This eliminates the "Atlantic Ocean pin for a US-centroid Reddit post" type bug entirely.

### Recommendation 5 — Witness-stated specificity in card UI

Add to report card / report page metadata block:

```
Location · East Stroudsburg, PA
            ⓘ Witness shared specific town
```

vs

```
Location · Pennsylvania
            ⓘ Witness described as "rural PA"
```

Conveys what the SOURCE provided, separately from what the platform's geocoder did with it.

---

## What I'd skip

**Don't try to AI-infer more-specific locations from narrative text.** The temptation is to run Haiku over each report's description with a prompt like "extract the most specific location mentioned." This invents specificity that wasn't in the source. Stays out of the trust model.

**Don't reclassify Reddit reports as having "exact" precision when they have a city populated.** Many of those city values were extracted by the Reddit adapter from imprecise narrative text and may be wrong. Mark them `region` until proven otherwise (Recommendation 2's `coords_synthetic` check).

---

## Open questions for Chase

1. Should "rural Pennsylvania" type reports be visible on the map at all (as region overlays), or only on category/search surfaces?
2. Map cluster popup behavior — do you want regional-precision reports grouped separately ("12 specific cities" + "23 region-only reports") or mixed?
3. Backfill priority — is location-precision precision worth the 1-day-ish investment now, or after launch?

---

## Recommended next step

If we have ~2 days of frontend+data work to invest, the sequence:

1. **Day 1**: Backfill location_precision metadata (Rec 2) + add precision badges to report display (Rec 1)
2. **Day 2**: Map clustering policy (Rec 4) + the witness-stated UI (Rec 5)

Recommendation 3 (sanitizer tightening) happens incrementally as we ingest new sources (NUFORC/OBERF/etc.) — not a discrete project.

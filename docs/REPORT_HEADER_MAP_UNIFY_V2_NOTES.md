# V11.17.88 — Report Header Map Unify v2 (Option B)

## Context

V11.17.87 unified both report-header map paths on `streets-v2-dark`. Founder
review rejected: the cyan ocean labels and "atlas" feel of `streets-v2-dark`
fight the documentary register. The Colombia screenshot the founder labeled
"GOOD" was actually `dataviz-dark` (clean, dark land + dark ocean,
brand-purple pulse).

V11.17.88 reverses direction: unify both paths on `dataviz-dark` (the clean
Colombia aesthetic), and add a brand-purple continent-visibility paint
layer to the no-location global header so continents still read against
the dark ocean at zoom ~1.1.

## Files modified

1. `src/components/reports/ReportLocationMap.tsx` — `MAP_STYLE` reverted
   `streets-v2-dark` → `dataviz-dark`. V11.17.87 rationale block rewritten
   to record the V11.17.88 revert + Option B reasoning. Inline V10.8.M
   overlay comment that referenced streets-v2-dark flipped back.
2. `src/components/reports/WorldMapBackdrop.tsx` — `MAP_STYLE` switched
   `streets-v2-dark` → `dataviz-dark`. `addAdminBorderOverlays()` now also
   adds a brand-purple continent-visibility paint layer inserted BELOW the
   first water layer (located by scanning `style.layers` for id or
   source-layer containing "water"). Header docstring bumped V11.17.41
   rev-3 → V11.17.88 rev-11.
3. `src/components/reports/ReportPageV2.tsx` — V11.17.39 comment above
   the `WorldMapBackdrop` dynamic import flipped from
   "streets-v2-dark per V11.17.87" → "dataviz-dark per V11.17.88" with a
   note about the visibility paint.

## Paint layers in WorldMapBackdrop (post V11.17.88)

### `paradocs-global-land-fill` (NEW in V11.17.88)
- type: `background`
- inserted BEFORE the first water layer (so water masks the tint on
  ocean tiles; land tiles bleed the tint through)
- `background-color`: `#9000F0` (brand purple)
- `background-opacity` zoom-interpolated: `0 → 0.14, 2 → 0.12, 4 → 0.06, 6+ → 0.0`
- Effect: continents read as subtle purple region at global zoom, fully
  transparent by city zoom

### `paradocs-admin1-overlay` (UNCHANGED from rev-7)
- State / province borders, `#c4b5fd`, line-width 0.6 → 3.0 (zoom 1 → 10)

### `paradocs-admin0-overlay` (UNCHANGED from rev-7)
- Country borders, `#ddd6fe`, opacity 1.0, line-width 1.4 → 3.4 (zoom 1 → 10)

`dataviz-dark` ships without place-name labels by default, so no
`water_label` hide layer was needed.

## Continent-visibility confidence: medium-high

At zoom 1.1 with 0.12 brand-purple background + admin0 / admin1 lines,
continents should read as a subtle purple region against the dark ocean
with clear country edges. Picked the upper end of the safe 0.10–0.15 band.

Why not "high":
- Tint masking depends on `dataviz-dark`'s water fill being fully opaque
  (it should be; not yet verified at the rendered-pixel level)
- Layer-scan logic assumes a water layer exists with "water" in id or
  source-layer; wrapped in try/catch + console.warn so a regression
  surfaces if MapTiler renames it

Escalation knobs if continents don't read:
1. Bump `background-opacity` zoom-2 stop `0.12` → `0.18`
2. Add a `water` source-layer fill at `#0a0414` opacity 0.4 (requires
   confirming `water` is a valid source-layer in maptiler_planet)

## Typecheck + ESLint

- `tsc --noEmit` on the 3 modified files: clean (no new errors)
- `next lint`: pre-existing exhaustive-deps warnings unchanged

## Open question

Should the brand-purple land tint also fire on located-report pages?
V11.17.88 leaves located reports untouched on the theory that fit-bound
country/state framing already shows continents, the pin/halo carries the
brand-purple register, and a faint wash on top of Colombia or Kansas
could subtly desaturate the "actual ground" feel. Trivial to copy
`paradocs-global-land-fill` into `ReportLocationMap` if visual symmetry
is preferred — the zoom-interpolated opacity already drops to 0 by zoom 6
so it'd be a no-op at city precision anyway.

## Commit message draft

```
V11.17.88 - Report header map: unify on dataviz-dark + global-view brand-purple visibility paint

V11.17.87 unified on streets-v2-dark which surfaced cyan ocean labels
fighting the documentary register. Founder picked Option B: revert
located reports to the clean dataviz-dark aesthetic AND switch the
no-location header to dataviz-dark too, with a brand-purple paint layer
that keeps continents visible at global zoom. 3 files modified; new
paint layer `paradocs-global-land-fill` inserted below water layer with
zoom-interpolated opacity 0.14→0.0 by zoom 6.
```

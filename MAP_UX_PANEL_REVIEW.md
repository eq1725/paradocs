# V11.15 — Map UX Panel Review

**Goal:** Designed-for-scale redesign of `/explore?mode=map` ahead of the 100k → 1M+ report corpus.

**Author/owner:** Chase + Claude
**Status:** Draft for Chase approval. Implementation phased across V11.15.0 → V11.15.3.
**Context corpus:** 22k approved live; 85k draining; 6.4k orchestrator shards available; ~1M+ in 2-3 mass runs.

---

## 1. Current State Snapshot (May 2026)

### Layers, in render order

1. **Country choropleth fill** — purple log-scaled opacity tied to `report_count`. Visible at zoom ≤ 5.5.
2. **Heatmap** (optional toggle) — KDE on all raw points.
3. **Cluster pins** — supercluster aggregation of city/state-precision reports. Numbered bubble shows count; size scales mildly.
4. **Coincident-pin popup** — for reports sharing the same centroid (country-precision), tap opens a scrollable list.
5. **Choropleth stroke** — country borders at zoom ≤ 5.5.
6. **MapTiler basemap** — dark terrain.

### Controls

- **Top toolbar:** Mode tabs (Map / Browse / Search).
- **Right vertical toolbar:** Zoom in/out, basemap switcher (3rd icon), heatmap toggle (flame), choropleth toggle (map icon), locate-me, fullscreen.
- **Left side (desktop) / bottom sheet (mobile):** Filter panel — search input, category chips (8 categories), country dropdown, has-evidence checkbox, reset button at bottom.
- **Top of map area:** Filters button (mobile shows it; desktop has the panel always available).
- **Bottom of map area:** Time-range chips (All Time / Pre-Modern / 1900–1950 / 1950–2000 / 2000+) + a numeric date slider 1400 → 2026.

### Data shape after V11.14.8.1

- Top countries: US 4,190 / GB 378 / CA 341 / AU 249 / MX 214 / CN 158 / BR 148 / DE 135 / FR 111 / RU 103
- 268 (country, state, category) buckets across 87 countries with reports.
- 7,405 reports counted in the choropleth.
- Roughly 14,000 reports have city/state-precision coords showing as cluster pins; 8,000 only have country-level info.

---

## 2. Findings

### F1 — Choropleth color differentiation is weak (Chase-flagged)
The log-scale opacity ramp compresses everything below ~500 reports into a near-uniform faint purple. US looks distinct from the next 80 countries because of one extreme outlier (US at 4,190 vs. UK at 378 — a 10× gap that gets log-flattened). Users can't visually rank Brazil vs. France vs. Mexico vs. Japan at a glance.

**Root cause:** linear interpolation of `ln(report_count)` over a fixed range from 1 to maxCount. At extreme skew (1 country dominates), the curve degenerates.

### F2 — Country-filter and choropleth conflict (Chase-flagged)
Clicking on an empty area of a country polygon toggles a country filter. Pins for other countries vanish. BUT the FILL tints on those countries remain unchanged — Brazil still looks like a high-data country even when filtered out.

**Root cause:** the choropleth source has no awareness of the active filter. It reads from the materialized view and renders regardless of what's actually on the map.

### F3 — Reset Filters button is bottom-buried (Chase-flagged)
The Reset Filters button only appears at the bottom of the filter panel, conditional on `hasActiveFilters`. Users actively filtering have to scroll to find it. Common pattern is to put primary reset/clear at the top.

### F4 — No legend explaining what colors mean
No on-map legend tells the user that "darker purple = more reports". Even cartographically-literate users have to guess at the encoding. Critical at scale.

### F5 — Heatmap + choropleth + clusters all on by default = visual noise
With choropleth on (default), purple country fills + purple cluster pins + (if user enables heatmap) red KDE all use the SAME color family. They blur together at low zoom.

### F6 — Cluster popup vs. country fill click ambiguity (now fixed but ergonomic)
V11.14.8.1 added cluster-priority — clicking a pin always wins over the polygon underneath. But users have no way to know that polygon-clicking is a separate action ("filter to this country") vs. cluster-clicking ("expand this group"). It's invisible UX.

### F7 — Zoom-level transitions feel abrupt
- At zoom 5.5 exactly, choropleth disappears (filter is `['<=', ['zoom'], 5.5]`).
- Cluster pins persist all the way to street level.
- Heatmap doesn't fade.

There's no transition animation, no overlap, no hint that "more detail is available if you zoom further". Users get a hard-cut surprise.

### F8 — Mobile filter UX is a long scroll
The bottom sheet renders the entire filter panel — 8 category chips, country dropdown with 200+ entries, checkbox, reset. On a mobile screen, scrolling past 8 chips to find country dropdown is friction. Default state should be more visible (filter chips compact-collapsed, country as searchable autocomplete).

### F9 — No empty-state when filters return zero
If a user filters to (e.g.) "Cryptids in Greenland", the map just shows... no pins. No message. No "no results — try widening your filter" affordance. Users assume the site is broken.

### F10 — Accessibility gaps
- Color-only encoding for density (failing for ~8% of users with deuteranopia/protanopia).
- No keyboard shortcut to toggle layers.
- Pin clusters announced by maplibre's default ARIA — generic, not contextual.
- Color contrast on faint country fills (~10% opacity) fails WCAG AA against dark basemap.

### F11 — Performance at scale (preventive)
At 1M+ reports:
- Cluster source loading all pins into the browser becomes a hot bottleneck. Currently `useViewportData` loads ALL approved reports up-front (`.eq('status', 'approved')` with no spatial filter).
- Supercluster radius/maxZoom defaults may not cope.
- Heatmap rendering 1M points unprojected = WebGL ceiling hit.

### F12 — Click-to-explore loop is invisible to first-time users
There's no onboarding hint for "click a cluster to expand, click a country to filter, drag to pan, scroll to zoom". Users learn by accident. At 1M reports, this is critical — the map IS the product for most arrivals.

---

## 3. Expert Panel

Six personas, each weighing in from their specialty. Persona names are illustrative; recommendations are real.

### Persona A — Senior Cartographer (15 yrs at Esri/Mapbox)
*Focus: choropleth encoding, projection accuracy, color theory.*

> "The log-scale opacity is the wrong choice for this data distribution. You have one outlier (US at 4,190) and a long tail. Either:
>
> 1. **Switch to quantile classification** — divide countries into 5 bins by report rank (top 20% / next 20% / etc.). Each bin gets a discrete color step. Cartography classic; users instantly grok 'darker = more.' Implementation: 5-step ColorBrewer purple ramp, choose-by-rank.
> 2. **Switch to hue + lightness** — yellow (low) → orange → red → darkpurple (high). Gives way more visual range than opacity-of-single-hue. Industry pattern for choropleths.
>
> Recommend (1) for editorial cleanliness. The cluster pins are already purple; sharing a hue family lets the eye focus on density. Add a discrete on-map legend.
>
> Also — choropleth disappearing exactly at zoom 5.5 is harsh. Use a `step` expression to fade opacity from 100%→0% across zoom 5.0→6.5. Smooth handoff to cluster view."

### Persona B — Data Viz Designer (NYT Graphics dept, 8 yrs)
*Focus: encoding choices, perceptual accuracy, narrative.*

> "Two encoding choices to fix:
>
> 1. **The choropleth is showing density per country, but cluster pins are showing density per city/state.** Two different things, same color. Use a different color for choropleth (cool — blue/teal) and clusters (warm — purple/magenta). Eye separates them instantly.
> 2. **The choropleth doesn't update with filters.** If user filters to 'cryptids', the country fills should re-tint to show density of CRYPTID reports per country, not all reports. That's the choropleth's job. Currently it's static and decorative.
>
> Smaller things:
>
> - The 'All Time / Pre-Modern / etc.' time chips at the bottom — make sure they have hover states showing the resulting count. 'Pre-Modern (12 reports)'.
> - When user clicks a country fill to filter, fade OTHER countries' fills to 5% opacity (vs. fully visible). 'This is your selection' becomes obvious."

### Persona C — Mobile-first UX Designer (ex-Airbnb maps team)
*Focus: touch interaction, bottom sheet patterns, single-thumb use.*

> "The filter sheet is too dense for mobile. Patterns from Airbnb/Zillow:
>
> 1. **Category chips collapse to a 2-line horizontal scroll** with the most-used 3-4 visible, 'More' chip expands to full grid.
> 2. **Country picker** — not a 200-option dropdown. A searchable typeahead input ('Search countries…') filtered by user input. Top results = countries with most reports.
> 3. **Reset button** — pinned to the BOTTOM of the bottom sheet as a sticky footer (always visible regardless of scroll). Don't move it to top — that's where users LEAVE the panel. Bottom-pinned is correct mobile pattern. (Counter to F3 — Chase, panel disagrees with you on placement, agrees on visibility. Pin it as a sticky bottom action bar.)
> 4. **Snap points** — bottom sheet currently has peek/full. Add a 'mid' snap (40% screen height) showing filter chips + count badge only — like Apple Maps. Lets user scan filters without losing the map.
> 5. **Cluster tap** — on mobile, the popup is below the tap finger. Anchor it ABOVE the finger by default."

### Persona D — Accessibility Specialist
*Focus: WCAG, color blindness, screen readers, keyboard.*

> "Three blockers + several improvements:
>
> **Blockers:**
> 1. Density encoded by color ONLY. Add a hatching pattern overlay for the top-tier countries (top quintile in quantile classification) so deuteranopes can distinguish high from low. Or use a divergent color scheme that maintains lightness contrast (viridis instead of single-hue purple).
> 2. WCAG AA contrast fails on faint country fills against dark basemap. The lowest tier (10% purple over near-black) measures ~1.4:1 against 4.5:1 minimum. Switch to a discrete classification with the lowest tier still hitting AA — that means a minimum opacity of ~30% or use a fully different fill family.
> 3. Keyboard nav. The map is currently mouse-only. Implement: Tab through cluster pins by report count rank. Enter expands. Escape closes popup. Arrow keys pan. + / - zoom.
>
> **Improvements:**
> - ARIA labels on each cluster: 'Cluster of 2,200 reports centered on United States. Press Enter to expand.'
> - Filter panel: clearly label '0 results' state with retry suggestions, NOT just an empty map (F9).
> - Bottom-of-screen 'showing X of Y reports' status announcement on filter change."

### Persona E — Performance Engineer (large-scale data viz)
*Focus: WebGL, virtualization, server-side aggregation.*

> "Current architecture won't scale past ~50k pins in the browser. At 100k+ you'll see frame drops on pan/zoom. At 1M you'll OOM the tab.
>
> Required by V11.15:
>
> 1. **Server-side clustering** — replace client supercluster with a Supabase-backed materialized view that returns clusters by viewport. Materialized view: `report_clusters_by_zoom` keyed on (zoom_level, lon_bin, lat_bin, category). API returns pre-aggregated clusters for the current bbox.
> 2. **Spatial bbox filter on report query** — currently fetches ALL approved reports. Replace with a `viewport_intersects(bbox)` PostGIS query. Add a GIST index on (latitude, longitude). Most-clustered viewports return 200-500 reports max.
> 3. **Heatmap layer** — generate from the same server-side clusters. Don't ship raw points to the browser.
> 4. **Lazy choropleth fetch** — already implemented (V10.9.B). Keep this pattern.
> 5. **Image-based country labels (sprites)** — render country name overlays via a sprite atlas so MapLibre's label layer isn't fighting with the choropleth fill.
>
> Migration order: implement (2) first — biggest immediate win without breaking existing UX."

### Persona F — Growth / Conversion UX (consumer products)
*Focus: first-time-user activation, exploration flow, conversion.*

> "The map is your hero. First-time users see this and decide whether Paradocs is worth bookmarking. Three things missing:
>
> 1. **Onboarding hint** — on first visit, a dismissible toast at top: 'Click a cluster to explore. Drag to pan. Pinch to zoom.' Persists for 5 seconds, dismisses on first interaction.
> 2. **Anchored CTA** — once they've expanded their first cluster and opened a report, the bottom sheet should show 'See more reports like this' with category/location-similar suggestions. Conversion is the click-into-a-report rate.
> 3. **Initial framing matters** — current map opens at zoom 2.2 (whole world). Most users won't see anything compelling — clusters look like scattered dots. Open at zoom 3.5 fitted to actual data bounds (US + Europe by default). Or: open zoomed to user's geolocation (if available) so they see local reports first.
>
> Also worth measuring: time-to-first-cluster-click as the activation metric. Currently no event tracking on map interactions. Add basic analytics: cluster click, country filter, time range change, mode switch."

---

## 4. Synthesis — Prioritized Recommendations

### P0 — Ship in V11.15.0 (this week)
1. **Quantile choropleth + on-map legend** (F1, F4). Discrete 5-step purple ramp by rank. Tiny legend in bottom-right showing 5 buckets with counts.
2. **Country filter ↔ choropleth coordination** (F2). When `filters.country` is non-null, fade non-matching country fills to 5% opacity.
3. **Choropleth zoom transition** (F7). Replace hard zoom filter with `step` expression fading 5.0→6.5.
4. **Empty-state on filtered map** (F9). When `filteredReports.length === 0`, show centered card with 'No reports match these filters' + 'Reset filters' CTA.

### P1 — Ship in V11.15.1 (next 1-2 weeks)
5. **Server-side spatial filter** (F11). Replace `select('*').eq('status', 'approved')` with `viewport_intersects(bbox)` PostGIS query + GIST index. Materialized server-side clustering deferred to V11.15.2.
6. **Mobile filter sheet redesign** (F8, Persona C). Searchable country typeahead, category chips collapse pattern, sticky bottom Reset.
7. **Onboarding hint** (F12). Dismissible toast on first visit.
8. **Filter-aware choropleth** (F2 Persona B). When `filters.category` is non-null, recompute choropleth from filtered counts not totals. Requires API rework to accept category param.

### P2 — Ship in V11.15.2 (within 3-4 weeks)
9. **Server-side clustering** (F11 Persona E). Materialized view + zoom-level pre-aggregation. Necessary before 250k+ reports.
10. **Accessibility blockers** (F10). Hatching for top quintile, keyboard nav, ARIA labels.
11. **Map analytics** (Persona F). Track cluster clicks, country filters, time-range, sub-1s activation timing.
12. **Initial map framing** (Persona F). Open zoomed to data bounds OR user geo.

### P3 — Future / monitor
13. **Hue separation** (Persona B) — moving cluster pins from purple to a contrasting hue. Risk of breaking brand consistency; consider in next design refresh.
14. **Sprite-based country labels** (Persona E) — only if rendering perf becomes an issue.

---

## 5. Open Questions for Chase

1. **Brand color for clusters vs. choropleth** — Persona B recommends decoupling hues (blue choropleth, purple pins). Does that conflict with Paradocs brand identity? Or are you open?
2. **Initial map zoom** — open at world view (current), data-bounds (US + Europe filling viewport), or user geolocation? Each has tradeoffs.
3. **Onboarding hint** — dismissible toast on first visit? Persistent help icon? Or no onboarding (let users discover)?
4. **Analytics provider** — do we have a chosen analytics tool (PostHog, Plausible, Mixpanel)? If not, what's your budget tolerance?
5. **Accessibility commitment** — WCAG AA target or AAA? AAA is harder but signals seriousness for a research/historical-corpus product.
6. **Filter persistence** — should user's filter state persist across sessions (localStorage) or reset to defaults on each visit?

---

## 6. Implementation Plan

### V11.15.0 (P0, this week)
**Files touched:**
- `src/components/map/MapContainer.tsx` — quantile choropleth paint expression, legend component, zoom transition.
- `src/components/map/useChoroplethData.ts` — compute quantile thresholds from buckets.
- `src/components/map/EmptyState.tsx` — new component for filtered-empty state.
- `src/pages/explore.tsx` — wire EmptyState, pass active-country to choropleth for fade.

**Tests:**
- Unit: quantile computation handles edge cases (1 country, all-same count).
- Visual: hand-test on staging with current data + a sample category filter.

**Estimated effort:** 4-6 hours implementation + 1 hour QA.

### V11.15.1 (P1, next sprint)
**Files touched:**
- New PostGIS migration for GIST index on (latitude, longitude).
- `src/components/map/useViewportData.ts` — bbox query instead of select-all.
- `src/components/map/MapFilterPanel.tsx` — searchable typeahead country picker, sticky reset.
- `src/components/map/MapBottomSheet.tsx` — mid snap point.
- `src/components/map/OnboardingHint.tsx` — new component, first-visit toast.
- `src/pages/api/map/region-counts.ts` — accept category filter param.

**Tests:**
- Integration: bbox query returns expected pin counts at various zooms.
- E2E: filter changes update choropleth tints.

**Estimated effort:** 12-16 hours.

### V11.15.2 (P2, within month)
**Files touched:**
- Major new server-side clustering migration (`report_clusters_by_zoom` materialized view).
- `src/components/map/useViewportData.ts` — switch from supercluster to server cluster fetch.
- Accessibility pass across all map components.
- New analytics module + map-event hooks.

**Estimated effort:** 30-40 hours.

---

## 7. Risk + Open Decisions

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Quantile classification looks bad with only 87 countries having data | Low | Test on staging; fall back to log-scale if quantile is visually flat |
| Filter-aware choropleth requires API rework that breaks existing callers | Med | Add new `?category=` param as opt-in; old callers default to total |
| Server-side clustering requires schema design we haven't done | High (delay) | P2 — buys us time to design; if 100k drain finishes by then we'll have real load to test against |
| Decoupling cluster + choropleth hues breaks brand | Med | Defer to P3; gather user feedback first |
| Onboarding hint annoys returning users | Low | Use localStorage flag to dismiss permanently |

---

## 8. Decision Log

Chase + Claude, May 22, 2026.
- **Approved P0?** [ ] yes [ ] no [ ] revise
- **Approved P1?** [ ] yes [ ] no [ ] revise
- **Approved P2?** [ ] yes [ ] no [ ] revise
- **Brand hue separation (P3)?** [ ] yes [ ] no [ ] revisit later
- **Initial zoom strategy?** [ ] world [ ] data-bounds [ ] user geo
- **Onboarding hint approach?** [ ] toast [ ] help icon [ ] none
- **WCAG target?** [ ] AA [ ] AAA
- **Filter persistence?** [ ] yes [ ] no

---

*End of panel review. Implementation kicks off after Chase signs the decision log above.*

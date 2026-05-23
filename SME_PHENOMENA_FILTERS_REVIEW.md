# V11.15.3 — SME Panel Review: Filters on /phenomena/[slug]

## Context

Post-classifier, phenomenon detail pages have 100-1,500+ tagged reports each (bigfoot=1,215, mothman=several hundred, etc.). Currently the page shows the first 20 by confidence with a "Load more" button — no way to slice by date, region, or text. User wants in-page filters so this surface is actually navigable.

Existing API surface: `/api/phenomena/[slug]/reports` already supports `search`, `country`, `credibility`, `sort` query params and returns paginated results. It just isn't wired into the UI, and has one scaling bug (loads all junction IDs then does `.in()`, which fails past ~100 reports).

This review covers: which filters belong, the mobile-first interaction model, accessibility, and performance.

---

## Panel

- **Maya** — Mobile-first UX lead. Filter density on 375px viewport.
- **Devi** — Information architect. What's the user actually asking when they "filter"?
- **Theo** — Senior product engineer. Implementation, perf, server cost.
- **Priya** — Accessibility specialist (WCAG AA). Keyboard, screen reader, contrast, touch targets.
- **Joon** — Analytics/PM. What filters do users actually use, and what we measure.

---

## Maya — Mobile-first UX

**The default frame is wrong for 1,000+ rows.** Right now bigfoot's page is "infinite-scroll a list of cards." That works fine when you're browsing 20 results. With 1,215 it's a list-too-long anti-pattern — the user has no orientation, no "where am I in the list," and Load More is just pagination with extra steps.

**What I'd ship:** a sticky filter bar that sits below the hero and stays pinned while the user scrolls the report grid. On mobile (≤640px) it shows a single row of chips: `Sort ▾` · `Country ▾` · `Decade ▾` · `🔍`. Tapping any chip opens a bottom sheet (not a dropdown — dropdowns get clipped by viewport boundaries on phones). Selecting a value closes the sheet, applies the filter, and updates the chip to reflect the active value (e.g., `Country: USA`).

The text search is the odd one out — on tap, the magnifying glass slides out into a full-width input. Hitting "Search" or pressing return on the keyboard applies it; clearing the field removes the filter. Don't make people open a sheet just to type.

**Active filter state must be visible without scrolling.** Filtered chips render with a filled background (cyan/purple per category), not just changed text. Plus a `Clear all` link appears in the chip row when any filter is active.

**One thing not to do:** the desktop pattern of a sidebar with always-expanded filter sections. On mobile, that pattern devolves into the entire viewport being filter UI before you see your first result. Chips + bottom sheets keep the report grid above the fold.

---

## Devi — Information architecture

When someone lands on `/phenomena/bigfoot`, the filters they actually need are answers to specific questions. I'd back each filter from a user question:

1. *"Bigfoot sightings near me / in my country"* → **Country**.
2. *"Modern bigfoot reports, not historical ones"* → **Time period** (last 5y / 10y / 20y / earlier).
3. *"Show me the well-evidenced ones, not internet anecdotes"* → **Has evidence** (photo/video/audio attached).
4. *"I'm looking for a specific incident I half-remember"* → **Search** (title + summary).
5. *"Sort by..."* → **Sort** (most recent, most discussed, highest confidence).

I'd cut **credibility** from V1 — it's already a filter in the API but credibility scores are noisy enough that exposing them to non-experts misleads more than it helps. Internal tool, not a public filter.

I'd also cut **category** — every report on this page is in the same category as the phenomenon by definition. Useless.

**Critical:** show counts inside the filter chips ("Country (12)" "Decade (1990s • 47)"). Filters without counts feel like they'll fail. Counts also tell users "yes, there's something there" before they invest a tap.

**Sort default should be Confidence DESC**, not date. Confidence sort = "Haiku's best matches first" which surfaces the most thematically representative reports. Date sort buries the iconic cases under bot-ingested noise from 2024-2025.

---

## Theo — Implementation & perf

Three things the existing `/api/phenomena/[slug]/reports` endpoint gets wrong at scale:

**1. The IN(reportIds) pattern doesn't scale.** Line 58 loads every linked report_id, then line 96 does `.in('id', reportIds)`. PostgREST builds the URL inline — past ~100 UUIDs you hit URL-length limits. We've already hit this in the classifier. Rewrite as a junction-inner-join:

```ts
supabase.from('report_phenomena')
  .select('confidence, report:reports!inner(...)', { count: 'exact' })
  .eq('phenomenon_id', phenomenonId)
  .eq('report.status', 'approved')
  // filters applied as report.col
  .order(..., { foreignTable: 'report' })
  .range(offset, offset + limit - 1)
```

This is one query, server-side joined, paginated at the SQL level. No URL bloat regardless of how many tagged reports exist.

**2. Counts behind filter chips need a separate query.** Don't compute country/decade counts client-side from the displayed rows — they only reflect what's loaded. Either expose a `/api/phenomena/[slug]/reports/facets` endpoint that returns `{country: {US: 847, UK: 142, ...}, decade: {2020s: 312, ...}}` or denormalize once at classifier-end-of-run. For V1 do the facet endpoint, edge-cached 5 min — facets only change on classifier runs.

**3. Don't refetch on every keystroke.** Search input must debounce (250ms feels right). All other filter changes are click-applied, no debounce needed. Cancel in-flight requests when a new filter applies — show stale results during transition, replace on success, suppress empty-state during transition (we already learned this lesson on the map).

**Edge caching:** all filter combinations should hit Vercel's edge cache with a 60s TTL. The data only changes when classifier or drain writes new junction rows. Stale-while-revalidate is fine.

**One more thing:** URL state. Filter values should serialize to query params (`?country=US&decade=2020s&sort=confidence`) so users can share filtered views and back-button works. The existing endpoint already accepts these param names — wire the UI to push/replace them in the URL too.

---

## Priya — Accessibility (WCAG AA)

The chip-bar-with-bottom-sheets pattern is workable but the details matter:

**Touch targets:** chips must be ≥44×44px tappable area. They can look smaller visually (the chip itself can be ~32px tall) but the hit area must extend. On the current map filter chips this is already done correctly — copy that.

**Keyboard:**
- Tab through chips left-to-right
- Enter/Space opens the bottom sheet
- Inside the sheet: arrow keys navigate options, Enter selects, Escape closes
- The text search chip Tab-stops to the input directly, not the chip
- The Clear-all link must be Tab-reachable from the chip bar

**Screen reader:**
- Each chip needs an `aria-label` that includes the active value: `"Filter by country, current value: USA"` not just `"Country"`
- The result count below the chips must be a polite live region (`aria-live="polite"`) so it announces "127 reports" when filters change
- Loading state needs explicit `aria-busy` on the report grid

**Contrast:** active filled chips need 4.5:1 against the bg. The cyan-on-dark we use elsewhere clears this; don't introduce a new "active filter color" that doesn't pass.

**Reduced motion:** the bottom sheet slide-up animation must respect `prefers-reduced-motion: reduce` — instant appearance instead.

**Empty-state:** when filters return 0 results, the empty state must say *which* filter is too restrictive, not just "no results." Give the user a specific "Try removing Country: USA" link, not a vague "Try adjusting your filters" line.

---

## Joon — Analytics & rollout

**Instrument from day one.** Three events per filter interaction:
- `phenomenon_filter_opened` — which filter chip was tapped
- `phenomenon_filter_applied` — which filter, which value, current other-filters
- `phenomenon_filter_cleared` — which filter (or "all")

If we don't measure this we're guessing on V2. After two weeks we'll know which filters drive engagement and which are dead weight.

**Don't add filters we won't use.** I'd cut "Has evidence" from V1 — it's a real signal but adoption-rate-unknown and it requires a backfill pass to populate (most reports don't have `has_media` set). Add it in V2 if Country/Decade/Sort prove undersized.

**Mobile rollout:** ship to 10% via cookie-based gating for 24 hours before going to 100%. Easy to do — feature flag the entire filter bar component.

**Browser back behavior:** the URL-state recommendation is also analytics-friendly — referrer logs will show which filter combinations are shared/linked.

---

## Recommended V1 scope

What ships in V11.15.3:

1. **Sticky filter bar** below hero, above report grid
2. **Four filter chips** + one search input:
   - `Sort` (default: Confidence DESC; options: Newest, Oldest, Most Viewed, Most Discussed)
   - `Country` (with counts; populated from facets endpoint)
   - `Decade` (last 5y / last 10y / last 20y / earlier; with counts)
   - `🔍 Search` (debounced 250ms, searches title + summary)
3. **Mobile-first interaction:** chips → bottom sheet; search → inline input expand
4. **URL state:** filter values serialize to `?` query params
5. **API rewrite:** `/api/phenomena/[slug]/reports` switches from IN-list to junction inner-join
6. **New facets endpoint:** `/api/phenomena/[slug]/reports/facets` returns counts for chip labels
7. **Accessibility:** keyboard nav, aria-live result count, reduced motion
8. **Analytics:** three filter events instrumented

**Cut from V1 (revisit later):**
- Credibility filter (too noisy for public surface)
- Category filter (always the same as phenomenon's category)
- Has-evidence filter (needs backfill before launching)
- Saved filter presets (user-account scope creep)
- Combined map view (different surface)

**Time estimate:** ~3-4 hours including the API rewrite.

---

## Decision needed

Before I start: confirm the V1 scope above. The two specific calls to confirm:

1. **Default sort** = Confidence DESC (Haiku's best matches first), not date. Agree?
2. **Has-evidence filter cut from V1** — agree, or do you want it now despite the backfill cost?

Reply with the answers and I'll start the build. The `--all` classifier run is still on hold until this ships and you verify on mobile.

# Today Header — Expert Panel Review (V7.3)

**Context:** The `/discover` (Today) header consumes ~210px on iPhone — roughly 25% of viewport before the first card appears. Chase asked the panel to review and recommend optimizations.

**Cohort:** Gaia subscribers + Contact in the Desert booth attendees. Curious-adult audience expecting an Apple-News / Substack-quality reading experience, not a power-user filter cockpit.

---

## Current header anatomy (top → bottom, mobile)

| Layer | Height | Content |
|---|---|---|
| App bar (Layout) | ~56px | Paradocs wordmark, Search icon, Sign in button |
| Safe area top inset | ~50px | Dynamic Island |
| Lens chip strip | ~36px | All / Trending / On this day / With Evidence / Recent |
| Category chip strip | ~32px | All categories / UFOs & Aliens / Cryptids / Ghosts / … (11 chips) |
| Utility row | ~28px | Feedback flash, streak chip, search icon, "View as list", "?" |
| **Total chrome** | **~202px** | **24% of 6.1" iPhone viewport** |

For comparison: Apple News uses ~100px (12%), Substack ~88px (10%), TikTok ~60px (7%). Paradocs is **2× the chrome budget** of best-in-class content apps.

---

## Panelists

1. **Mobile UX Lead** — ex–Apple News. Lens: "How fast does the user reach signal?"
2. **Information Architect** — ex-Reddit. Lens: "Are these two filter axes really independent?"
3. **Visual Designer** — ex-Substack & Spotify. Lens: "Where does the eye go first?"
4. **Product Strategist** — ex-Pinterest. Lens: "What does this header do for retention?"
5. **Accessibility Engineer** — ex-Microsoft. Lens: "Is every control discoverable and operable?"

---

## What each panelist said

### Mobile UX Lead

> "The user is here for the **case**, not the filter. Three rows of chrome before the headline is a homework feeling. Apple News solved this by hiding the chrome on scroll — when the user lands they see one row plus the masthead, and as they swipe down the masthead collapses. You're paying full chrome cost for every card swipe, not just the first."

**Recommendations:**
- Auto-hide app bar on scroll, reveal on pull-down (`scroll-direction-aware sticky`)
- Lens + category strip stays sticky but collapses to a single horizontal strip
- Move "View as list →" out of the header entirely — it belongs in the user menu

### Information Architect

> "Lens and category aren't independent axes — the user picks **one filter** at a time, 95% of sessions. Showing them as parallel strips implies they multiply (lens × category = N×M states), which is overwhelming and rarely what people want. Reddit went through this with 'sort + community' and ended up merging them into one ordered chip strip with the most-used at left."

**Recommendations:**
- Collapse to **one strip** with this order: `All • Trending • On this day • With Evidence • Recent • —divider— • UFOs • Cryptids • Ghosts • NDE • Psychic • …`
- The em-dash divider visually separates "what kind of view" from "what topic"
- Selecting a category auto-resets lens to "All" (and vice versa) — eliminates the "1 in 4,853" filter-trap

### Visual Designer

> "There are **5 typographic weights and 3 chip styles** in the current header. The eye has nowhere to land. The category chips are also fighting the lens chips for color attention — both use the same `bg-white/[0.03]` resting state, both pop the same way when active. The user can't tell which axis they're filtering by without reading."

**Recommendations:**
- One chip style. Lens chips get a **subtle category-color tint when active** (matches the card accent); category chips get a stronger fill
- Drop the per-chip border — use only `bg + opacity` for state
- The "Sign in" pill in the top bar is competing with the wordmark for attention — make it a tiny icon (User+arrow) or move it into the Profile tab

### Product Strategist

> "Every pixel of header is a pixel that didn't show a story. Instagram and TikTok ruthlessly minimize chrome because every additional row reduces the **time-to-content** metric, which correlates 1:1 with D7 retention. The streak chip is the only header element with retention value — keep it. Everything else is filter exhaust."

**Recommendations:**
- Move streak chip into **the card itself** (top-right cluster, next to bookmark) — it's content-adjacent there, not chrome
- Kill the utility row entirely on mobile — feedback flash becomes a transient toast above the CTA, "?" becomes desktop-only floating button
- Promote "On this day" to a **default opening lens** when there's a strong-match — it's the killer feature for a paranormal app and currently buried in chip 3

### Accessibility Engineer

> "The current header has good aria-live for feedback flash, sr-only h1, and proper button labels — credit there. But: **two horizontal scroll strips** in close proximity create a 'where am I?' problem for screen reader users. There's also no skip-link to jump past chrome straight to cards. The chip strips don't announce 'horizontal scroll' to assistive tech."

**Recommendations:**
- Add a "Skip to cards" link as the first focusable element
- Single chip strip naturally fixes the dual-scroll confusion
- Add `role="tablist"` to the unified strip with proper `role="tab"` + `aria-selected` semantics — current chips are buttons, which is fine but loses the "this is a filter selector" semantic

---

## Convergent recommendations (all 5 panelists agreed)

1. **Collapse the two chip rows into one** — biggest single win, saves ~36px
2. **Drop the utility row from mobile entirely** — saves ~28px (streak moves to card chrome, search icon already exists in app bar, "View as list" moves to user menu, "?" desktop-only)
3. **Auto-hide app bar on scroll** — reveals on pull-down. Saves ~56px during reading
4. **One chip style, color-coded by selection state** — visual cleanup
5. **Selecting a category resets lens to "All"** — eliminates lens × category multiplication

---

## Proposed header (after changes)

| Layer | Height | Content | Notes |
|---|---|---|---|
| App bar | ~56px → 0 (auto-hide on scroll) | Paradocs wordmark + Sign in icon | Visible at top, hides as user swipes |
| Safe area top inset | ~50px | (Dynamic Island unavoidable) | |
| Unified chip strip | ~38px | All • Trending • On this day • With Evidence • Recent | UFOs • Cryptids • Ghosts • NDE • Psychic • Consciousness • Occult | Single row, fade-mask, em-dash divider |
| **Total chrome** | **~88px (resting) → ~144px (top)** | **10–17% of viewport** | **40-55% reduction from 202px** |

This puts Paradocs in the same territory as Apple News (~12%) and Substack (~10%).

---

## Implementation tiers

### Tier 1 — Quick wins (no structural changes, ~30 min)

- [ ] Drop utility row on mobile (`hidden md:flex`)
- [ ] Move streak chip into TodayCardShell top-right cluster
- [ ] Tighten lens + category strip padding `py-2 → py-1.5`
- [ ] Drop "View as list →" link (move into user menu — separate ticket)

**Saves:** ~30px header chrome
**Risk:** Low. Pure removal/repositioning.

### Tier 2 — Unified chip strip (1 hr)

- [ ] Merge LENSES + CATEGORY_KEYS into one ordered array with a divider sentinel
- [ ] Single mapping in TodayHeader render
- [ ] Selecting a category resets lens to 'all'; selecting a lens preserves category
- [ ] Active-state styling: lens chips → category-tinted fill; category chips → bold white fill
- [ ] Add `role="tablist"` + `role="tab"` semantics

**Saves:** ~36px chrome + cognitive load reduction
**Risk:** Medium. Cohort needs to discover the divider; could surface a one-time tooltip ("Browse by topic →") if click-through on right-half drops.

### Tier 3 — Auto-hide app bar (2 hr)

- [ ] Layout app bar wraps in scroll-direction-aware container
- [ ] Translate-Y on scroll-down, restore on scroll-up (Apple News pattern)
- [ ] Maintain chip strip sticky position
- [ ] Add "Skip to cards" sr-only link as first focusable

**Saves:** ~56px during card reading (most of the session time)
**Risk:** Medium-high. Requires touching `Layout.tsx` which affects every page. Worth it if /discover is the highest-traffic surface.

---

## Recommendation

**Ship Tier 1 + Tier 2 in one V7.4 commit.** They compose cleanly, both have low blast-radius, and together hit the "Apple News-tier chrome budget" target. Tier 3 is worth its own commit — it touches Layout and deserves a careful regression pass on every other page.

**Defer:** App bar auto-hide (Tier 3) until after V7.4 ships and we can measure the chrome reduction on its own.

---

## What we're NOT changing

- The ⓘ (why-you-see-this), share, and bookmark cluster on each card — those are working, panelists love them
- The card-shell hero scrim, category gradient, next-card peek — also working
- The CTA bar position and content — V7.2 fix landed correctly per Chase's screenshot
- The bottom tab nav — separate concern

---

## Open questions for Chase

1. Comfort level with **auto-hide app bar** (Tier 3)? It's the biggest visual change but also the biggest UX win on the swipe loop. Some users find auto-hiding chrome disorienting; others love the clean reading mode.
2. **Drop "Sign in" button** entirely from /discover and rely on the Profile tab + first-paywall hit instead? The panel split 3-2 in favor; Mobile UX Lead and Strategist were yes, IA and a11y were neutral, Visual was hesitant.
3. **Promote "On this day" as default opening lens** when there's a strong match (>= 1 high-credibility phenomenon dated today)? Strategist's pitch — turns Paradocs into a daily-ritual app. Adds ~30 lines to discover.tsx bootstrap.

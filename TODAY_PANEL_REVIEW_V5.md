# Today (/discover) — V5 Panel Review

**Status:** Mobile build is functionally solid. Desktop has not had a focused review since V0.
**Cohort:** Gaia + Contact-in-the-Desert paranormal-curious adults.
**Method:** Two screenshots from the latest mobile build (REM Sleep / Lucid Dreaming card, scrolled and unscrolled). Desktop reviewed against the running implementation.

---

## What was just fixed in V5

**Rubberband / "play" issue.** Pulling the card content down past its natural bottom was elastically lifting the sticky CTA and momentarily pushing it under the tab nav. Cause: missing `overscroll-behavior` containment on the outer card pane (V3 only contained the inner body). Fixed by adding `overscrollBehavior: 'none'` to the outer container. Tightened the bottom buffer from 144px → 100px since V3 math is now verified, and tightened the CTA bar's vertical padding (pt-2 pb-3 → pt-1.5 pb-2). Net effect: ~20px of vertical chrome reclaimed and zero "give" on pull-down.

Also fixed the Tailwind arbitrary-value bug — `bottom-[calc(...)]` with nested env() commas wasn't compiling reliably. Switched to a CSS class (`today-cta-anchor`) defined in globals.css with a clean media query for the mobile vs desktop variant.

---

## Mobile — additional improvements panel suggests

### Tier A: ship next pass

**1. The `4-line headline clamp` is hiding interesting content with `…`.** "REM sleep shows prefrontal cortex activation patterns identical to waking consciousness, yet the sleeper remains asleep. Practitioners maintain full cognitive control over dream…" — the actual hook ends "...over dream content while in a sleeping state." Truncating at 4 lines preserves visual rhythm but loses the punchline. Two options:
   - Keep the 4-line cap but ensure `feed_hook` is generated to fit ≤ 200 chars from the start (regenerate prompt constraint at ingestion).
   - Allow up to 6 lines on cards with no hero image (text-only cards), 4 lines with hero. The hero adds visual weight that compensates for shorter text; pure-text cards need the headline to do more.

**2. The category badge "CONSCIOUSNESS PRACTICES · 2007" is doing the year work but loses location.** Lucid Dreaming has no specific location, but for many phenomena the `primary_regions[0]` is meaningful. Consider: when no specific year, swap year for location. When no location, swap for first-reported-year. The badge always carries 2-3 dimensions.

**3. The hero image attribution is missing.** This card uses what looks like a Tibetan deity statue. No credit visible. For Wikimedia-sourced images we should display attribution (small italic "via Wikimedia / [Author]" at the bottom edge of the hero scrim). Otherwise we're building bad licensing habits before scale.

**4. The "5 reports" stat is fine but isolated.** Replace the small chip with a richer "report meter" — a small horizontal bar showing how this case ranks vs. category average ("More documented than 73% of consciousness phenomena"). Spotify's "% of plays" pattern. Lifts the stat from a number into a comparison.

**5. The bookmark + share + (i) icons are floating in the upper-right corner of every card.** When the hero image is busy, they get lost. Add a subtle `bg-black/30` blur backdrop pill to group them. Same z-index, just visually grounded.

### Tier B: polish over the next 2 weeks

**6. Pull-to-refresh for the feed.** Mass-market expectation; not implemented. iOS native pattern is a stretchable circular indicator at the top of a scrollable list. Adapt for the swipe feed: pull down at the FIRST card to refresh the algorithm.

**7. Expand the in-card action affordances.** Right now the only in-card action is "Read Case." Mass-market apps surface 3-5 actions per card (TikTok: like/comment/share/save/follow). Paradocs could add: "Add note", "Discuss with Ask the Unknown", "Add to case file". Keep them consolidated under a "..." menu so they don't crowd the chrome.

**8. Better empty-state for "On this day" lens with no results.** Currently shows a generic empty state. Could surface 3-5 phenomena that happened on adjacent dates ("Nothing today, but here's what happened May 1, 2 and 3 in past years"). Keeps the lens active.

**9. Pin a "Last seen" marker on returning users.** When you return to /discover, the algorithm picks up roughly where you left off but doesn't tell you. A small "You left off here" badge on the first new card surfaced reinforces the daily-rhythm metaphor.

**10. Streak chip needs a tap target.** Right now it's a static label. Tapping it could open Lab → Streak history. Mass-market gamification expectation.

### Tier C: post-launch / experimental

**11. Audio narration toggle.** A Gaia subscriber's lean-back mode is "press play, listen while doing something else." Generate audio versions of the `feed_hook` + `paradocs_narrative` via TTS (ElevenLabs / OpenAI TTS). Add a small audio icon to the badge row. This is a phase-2 product (engineering effort + voice cost), but for the cohort it's nearly the killer feature.

**12. Magnetic snap to next card.** Right now swipe-up triggers a 230ms slide animation. Adding a subtle progressive snap (the next card is partially visible mid-swipe and "magnets" into place at the snap threshold) feels more premium. Spring physics.

---

## Desktop — first focused review

The desktop experience hasn't had a panel pass since the original work. Now's the time.

### Current state

- Card pane is centered, capped at `lg:max-w-2xl xl:max-w-3xl` (≈ 720–900px wide).
- TodayHeader spans full width above the card.
- Mouse wheel = next/prev card.
- Keyboard W/A/S/D + arrow keys + space + Enter + Esc.
- Edge chevrons (left/right) for tap navigation, gated to `md:block`.
- "↓ Connected cases" pill at bottom = opens rabbit-hole panel.
- "Connected cases" sidebar at `xl:` shows related items.
- DetailView modal opens when a related item is tapped from the sidebar.
- Today's Lead, share, bookmark, why-icon, all visible.
- The fixed bottom keyboard-shortcuts bar is collapsed by default and toggled via "?".

### What's working

The card-pane width is well-chosen. Headlines render at a comfortable line length (60–70ch) which is the sweet spot for serious reading. Mouse-wheel navigation is smooth. The Connected Cases sidebar at `xl:` adds genuine product value — research-mode users can scan related cases without leaving the current card.

### Issues — desktop-specific

**D1: The viewport-fit contract assumes mobile.** On desktop, the card pane fills the entire space below TodayHeader, which on a 1440×900 monitor is huge. The CTA bar is anchored at `bottom: 0` (correctly, since no tab nav), but the empty space ABOVE the card content is now too generous — there's vertical breathing room equivalent to ~40% of the viewport. Cards feel small and lonely in their pane.

**Recommendation:** Cap the card pane HEIGHT at ~720px on desktop, center it vertically. Treat each card as a distinct page in a stack rather than a full-viewport object. This is the Apple News / Pocket Discover desktop pattern.

**D2: Edge chevrons (the dim left/right arrows) are not discoverable enough on desktop.** Desktop users don't know the chevrons are tappable from a glance. On hover, they should expand into proper "Previous" / "Next" buttons with a label. Mass-market pattern (NYT, Washington Post, Bloomberg).

**D3: The Connected Cases sidebar at xl: is genuinely good, but the trigger is hidden.** A user has to either (a) be on a viewport ≥1280px to see it (sidebar is xl:flex), or (b) swipe down on a smaller viewport to find the rabbit-hole panel. There's no visual cue at the lg: breakpoint that connected cases exist at all.

**Recommendation:** Show the Connected Cases sidebar at `lg:` (1024px+) instead of `xl:`. Most laptops are in this range. iPad landscape is 1180. Move the breakpoint down.

**D4: The "Connected cases" sidebar items don't reveal where the user is in the flow.** Each item is a tappable button that opens a DetailView modal. But after tapping, the user sees a modal centered over the card — they can't see what they came from. The modal needs a "← back" link or breadcrumb showing the originating card.

**D5: Keyboard shortcuts are good but undiscoverable.** The "?" toggle in the header opens the shortcut bar, but until you discover that, the keyboard nav is invisible. On every page first-load (or once per session), pulse the "?" briefly to draw the eye.

**D6: Scroll behavior on long cards.** When the card body overflows on desktop, the user scrolls inside the card. Mouse wheel inside the body = scroll content. Mouse wheel OUTSIDE the body (in the empty side margins) = next card. This is correct but unintuitive — a user mousing in the side gutters expecting to scroll text instead jumps to the next card. Add a visual gutter cue on hover.

**D7: Hover states are minimal.** Hovering over the headline doesn't change anything visually. Tap-to-expand should have a subtle hover cue (color shift, underline) so it reads as interactive on desktop.

**D8: No multi-card view option.** Power users on desktop might want to see 2-3 cards at once. A "grid mode" toggle (icon next to the search button) that shows 6-9 cards in a 3×3 grid, each clickable to jump to that card in the swipe view, would unlock a research-archive feel.

### Issues — desktop / mobile parity

**P1: Search overlay only shows on mobile.** The search button on desktop opens the same overlay; that's actually fine. But the overlay covers the lens chips when open, which is awkward. Either render search in the existing chip area as an inline input (dropdown style) or shrink the overlay.

**P2: Today's Lead badge is well-placed on mobile but redundant on desktop.** On a 1440px viewport with a 720px card centered, the badge sits at top-left of the card. There's room to expand it to "Today's Lead Case · Day 23 of your streak" with richer context. Currently it's just "Today's Lead."

**P3: The swipe-down rabbit hole on desktop opens an overlay.** On mobile this is necessary. On desktop where the sidebar already shows connected cases, swipe-down/click-down should highlight the sidebar instead of opening a modal. Reduce duplicate UI.

### Comparable benchmarks

| Product | Desktop pattern | What Paradocs could borrow |
|---------|-----------------|---------------------------|
| Apple News (web) | Card stacked vertically, sidebar with related stories, full-bleed hero on hover | Card height cap, sidebar at lg, hero hover effect |
| Substack (web reader) | Single-column long-form with sticky author byline and reactions on side | Sticky reactions sidebar |
| Bloomberg Terminal | Multi-pane data + news, no animation, dense | Multi-card grid mode for power users |
| NYT Now (deprecated) | Single-card-per-screen with edge nav | Edge chevron expansion on hover |
| Pocket (desktop) | Tile grid + reader view modal | Grid-mode toggle |

---

## Roadmap — V5 next pass

### Mobile (focused, ~2 days)

- **Regenerate `feed_hook` content with a max-200-char constraint** so the 4-line clamp doesn't truncate. Or relax to 6 lines on no-hero cards.
- **Bookmark/share/(i) chrome backdrop pill** — group with `bg-black/30 backdrop-blur` so the trio reads as a cluster.
- **Streak chip becomes tappable** — opens Lab → Streak.
- **Pull-to-refresh** at idx=0.
- **Hero image attribution** for Wikimedia content.

### Desktop (focused, ~3 days)

- **Cap card pane height** at ~720px, center vertically.
- **Sidebar at lg:** instead of xl:.
- **Edge chevrons expand on hover** to "← Previous" / "Next →".
- **Pulse "?" once per session** to advertise keyboard shortcuts.
- **Hover state on headline** — subtle underline / color shift.
- **Grid mode toggle** in TodayHeader (icon next to search) — opens a 3×3 grid view.

### Cross-cutting (~1 day)

- **Today's Lead badge enrichment** with streak-context copy.
- **Rabbit-hole sidebar parity** — on lg+, swipe-down highlights the sidebar instead of opening the panel modal.
- **Sticky reactions column** on desktop (Substack pattern).

---

## What V5 just shipped

| Item | File | Rationale |
|------|------|-----------|
| `overscrollBehavior: 'none'` on outer card pane | `discover.tsx` | Eliminates iOS rubberband entirely |
| Inner body `overscrollBehavior: 'none'` (was `overscroll-contain`) | `TodayCardShell.tsx` | Stronger containment |
| Bottom buffer: 144 → 100 (mobile) | `TodayCardShell.tsx` | Tighter feel, V3 math now verified |
| CTA padding: `pt-2 pb-3` → `pt-1.5 pb-2` | `TodayCardShell.tsx` | Reclaim ~12px |
| `today-cta-anchor` CSS class | `globals.css` | Reliable mobile→desktop variant via media query |

---

## Recommended next conversation

If you want me to ship the mobile V5-next items as a single pass (~2 days of work), I can do all 5 in one commit. If you want to also kick off the desktop work (~3 days) in parallel, that's a second commit on top.

The desktop work is the bigger unlock for the Gaia cohort — many of them are reading on iPads in landscape (1180px = lg:) and would directly benefit from the sidebar-at-lg change + height-capped card. That single change makes the desktop experience feel like a different product.

Which set do you want next?

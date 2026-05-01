# Reports / Discover Page — Expert Panel Review

**Subject:** `/discover` (mobile bottom tab "Reports", desktop nav "Reports")
**Reviewed against:** `src/pages/discover.tsx`, `src/components/discover/DiscoverCards.tsx`, `src/components/homepage/DiscoverPreview.tsx`, `src/components/Layout.tsx`, `src/components/mobile/MobileBottomTabs.tsx`, `src/styles/globals.css`
**Reviewers:** UX Design, Mobile Design, User Engagement, Product Design, Information Architecture
**Date:** May 1, 2026
**Status:** Recommendations — not yet implemented

---

## Executive summary

The `/discover` page is the most ambitious surface on Paradocs. It runs a custom four-direction gesture grammar (up = next, down = rabbit hole, left = dismiss, right = save) layered on a sophisticated algorithmic feed (scored ranking, behavioral signals, depth gating, special card injection, cold-start onboarding). The card system itself is mature: dossier-style typography, category-tinted accents, hook-first copy, NDERF-aware case profile chips, and three card templates (PhenomenonCard, TextReportCard, MediaReportCard) plus three special types (Cluster, OnThisDate, Promo).

The bones are excellent. The page's biggest issues are not technical — they're that **a lot of intricate machinery is hidden behind invisible affordances and an ambiguous label**. Five themes recur across the panel:

1. **The gesture grammar is unteachable as currently presented.** The on-card hint text is rendered at ~6% opacity on three out of four directions and only on the first three cards. Users will discover only the up-swipe (TikTok muscle memory) and miss save / dismiss / rabbit hole entirely.
2. **"Reports" is the wrong tab label for what the feed actually serves.** The tab is named "Reports", but the feed mixes phenomena, eyewitness reports, on-this-date callbacks, geographic clusters, and Research Hub promos. The page `<title>` says "Discover", the footer says "Discover", the bottom nav says "Reports" — three names for one thing.
3. **The /discover and /explore tabs are not differentiated enough.** Both surface a mix of phenomena and reports. The conceptual difference (gesture vs. browse) is not visible in the tab labels or the page chrome.
4. **Saves and reactions are partially fictional.** Right-swipe flashes "✦ Saved" and updates a local `Set`, but never persists. A logged-in user who saves on /discover, refreshes, and goes to Lab → Saved will not find their item there.
5. **Desktop layout transformations happen at the wrong breakpoint.** The "Connected cases" sidebar appears only at `xl:` (≥1280px). Most laptops sit in 1280–1440 land — fine — but anyone on a 1024–1279 viewport (very common, including iPad landscape) loses the entire side panel and the page collapses to a single centered column with no warning.

The rest of this document expands those themes through five specialist lenses and ends with a prioritized implementation roadmap.

---

## 1. UX Design — Gesture system & flow

### What's working

The four-direction gesture grammar is genuinely novel for a research-heavy product. Up/down/left/right creates a deeper interaction surface than TikTok's single-axis swipe. Touch handlers are clean (`handleTouchStart` / `handleTouchEnd` in `discover.tsx:362–401`), the 230 ms swipe animation uses a tasteful cubic-bezier, and the gestures are mirrored on keyboard (W / A / S / D and arrows) and mouse wheel.

The expanded "Read Case" pattern is also a strong choice — it keeps the user in the feed rhythm while allowing one extra layer of depth before forcing a route change.

### Issues

**Hidden gesture vocabulary.** The mobile gesture hints (`discover.tsx:743–755`) use `text-white/[0.06]` — that is roughly 6% opacity on a dark background. They render only when `idx < 3`, in 8px text, oriented vertically along the edges. Even a careful user will not see them; a casual one will not look. The risk is that 80%+ of users discover only the up-swipe and conclude the page is "just TikTok for ghost stories" — missing the save, dismiss, and rabbit-hole behaviors entirely.

**Gestures are still active inside the expanded view.** `handleTouchEnd` early-returns on `rabbitOpen` and `detailCard` but **not** on `expanded`. A user reading inside an expanded card who flicks left to scroll will trigger `nextCard()` and lose their place. (Wheel + keyboard handlers do gate on `expanded`; only touch is unguarded.)

**No way to collapse an expanded card on mobile.** The Read Case button transforms the card into a scrollable narrative + Constellation paywall, but there's no visible "↑ Collapse" or "✕ Done" affordance to return to the feed. Desktop users can press Esc; mobile users have to navigate away.

**Saves and dismisses leave no permanent trace.** `setSaved(...)` writes to component state only. No backend write, no localStorage. The same is true for dismisses — `feedEvents.trackDismiss` ships a behavioral event, but there's no UI surface where a user can later see "things I dismissed" or "things I saved on Reports."

**Loading state breaks rhythm.** The first paint is a generic spinner ("Loading stories…"). Subsequent prefetches land silently as the user keeps swiping. A skeleton card matched to the dossier visual language would preserve the feed's pulse and signal "more is coming."

**Feedback flashes are not announced.** `setFeedbackLabel('✦ Saved')` renders as a regular `<span>`. Screen reader users get no signal. The whole gesture system is invisible to assistive tech.

### Recommendations

Surface the gesture vocabulary via an interactive first-run tutorial overlay (3 cards, animated chevrons demonstrating up/down/left/right with single-tap "got it" dismissals), separate from the topic onboarding. Persist completion in localStorage. Offer a "show shortcuts again" link in the kebab/profile menu for repeat discovery.

Replace the 6% on-card hints with persistent low-saturation chevrons at the four edges that pulse subtly during the first 5 cards and fade to ghost-state thereafter. They should be tappable as a fallback for users who reject gestures (one tap = "next", long-press chevron = "save"/"dismiss"). This removes the cliff between "knows the gestures" and "doesn't" and gives a list-mode escape hatch without a separate toggle.

Gate the touch handler on `expanded` so swipes don't accidentally fire while the user is reading. Add a "✕ Collapse" button that replaces "Read Case" once expanded — symmetric, discoverable, and works on both surfaces.

Persist saves to `saved_reports` and the user's `feed_events`. For anonymous users, mirror to localStorage so the saved-flash doesn't lie. The save button on the bookmark icon in regular feed cards already follows this pattern (`HANDOFF_EXPLORE.md:53`); /discover should adopt the same path.

Add an `aria-live="polite"` region for the feedback label and announce both the action and the item title ("Saved: Black Triangle UFOs"). Add `role="article"` and `aria-label` on each card. Make the W/A/S/D + arrow shortcuts discoverable on first arrival (short toast or expanded shortcut overlay tied to the same first-run tutorial).

Replace the loading spinner with a skeleton dossier card (badge bar + title block + chip strip + bottom stats) so the rhythm doesn't break when fetching more.

---

## 2. Mobile Design

### What's working

The card layout adapts well from `text-lg` at base to `text-[1.7rem]` at lg. Padding scales (`px-5 sm:px-6 md:px-8 lg:px-10`). Safe-area insets are honored via `mobile-content-pb` and the `safe-area-pt` class on the header. The bottom-tab nav has been recently tightened (24 px icons, 56 px min-height). The hidden footer on mobile (May 1 polish pass) is correct.

### Issues

**The page has no header of its own.** Above the card area there is only the global Layout header and a 36 px counter strip with a 0.5 px progress bar. The progress bar is so thin (`h-0.5`) that it's almost decorative. There is no "I'm on Reports" indicator other than the bottom-tab highlight, no day/date context, no filter affordance, no surface for the user to do anything except passively consume.

**Meta strip can wrap.** On a 360–390 px viewport, "City, State, Country · Mar 14 1976 · NUFORC · UFO Sighting" plus a SourceBadge can wrap to two lines, eating headline real estate. Source-type badges add visual weight that competes with the headline.

**Body text contrast.** `text-gray-500` (`#6B7280`) on `#0a0a14` is borderline AA. The 11 px / 9 px label sizes amplify the issue. WCAG AA wants ≥4.5:1 for body and ≥3:1 for large text — gray-500 on the dark background measures roughly 4.0:1 in practice. Bump body labels to `text-gray-400` (`#9CA3AF`) and reserve `text-gray-500/600/700` for chrome/separators.

**Double bottom padding.** Layout's `<main>` adds `pb-20` on mobile (80 px) to clear the tab bar, and the inner card pane adds `mobile-content-pb` (~88 px). The result is ~168 px of dead vertical space below the card on mobile, pushing the bottom-bar stats out of the natural thumb zone and making the card feel "too tall" relative to viewport height.

**Vertical text gesture hints don't read on small phones.** Even ignoring the opacity issue, vertical text inside an 8 px font on a 392 px viewport is very hard to parse. Same content as a center-pulse chevron animation would communicate the same idea in 1/10th the visual budget.

**Rabbit-hole entry is invisible at first encounter.** A user who has never used /discover before will not know that swiping down does anything special. Pulling down triggers the panel; pulling up to over-scroll a card just bumps. Consider a subtle "↓ More like this" pill above the bottom stats bar that gradient-fades in after 2 s of dwell — communicates the affordance without disrupting the dossier aesthetic.

**FAB collision risk.** The page no longer has the AskTheUnknown FAB (good — it would conflict with right-swipe gesture territory). Verify that this is intentional and consistent with /explore, /report/, etc.

**Onboarding overlay does not respect viewport-fit=cover.** The `<meta>` includes `viewport-fit=cover`, so the page can extend behind the Dynamic Island. `TopicOnboarding` (not reviewed in detail) should also honor `safe-area-pt`/`safe-area-pb` so the close affordance and the topic tiles are not occluded.

### Recommendations

Replace the flat 36 px counter strip with a richer page header on mobile that includes: (a) page name ("Today" or "Reports", per IA recommendations below), (b) a chip strip lens picker (Trending / On This Date / Photo & Video / Recent), (c) a thicker, segmented progress bar (4 px, primary-500 fill, dim segments per card seen). Total header height should not exceed 84 px including safe-area.

Reduce double padding: pick one. Either let Layout `<main>` pad the bottom on mobile and remove `mobile-content-pb` from the inner card, or vice versa. Recommend keeping `mobile-content-pb` only and changing Layout's `<main>` to `pb-0 md:pb-0` on /discover (treat it like a standalone-feel page within the Layout).

Bump body label contrast (`text-gray-500` → `text-gray-400` for content text; keep gray-500 for chrome).

Replace the 6% vertical edge text with a one-time animated tutorial card (the "first run" recommendation from the UX panel above) — single source of truth for gesture education.

Add explicit safe-area handling to the onboarding overlay if missing; same for the signup prompt (which currently uses `inset-0` with no safe-area accommodation).

Move the desktop keyboard shortcut bar (`md:block fixed bottom-0`) off the mobile breakpoint entirely — it's already gated to `md+`, but the persistent bottom-fixed strip eats vertical space at md (typically tablet portrait). Move it to a "?" toggle in the page header on `lg+` only, and remove from `md` (tablet) entirely, since tablets rarely have keyboards.

---

## 3. User Engagement

### What's working

The North Star metric (Session Depth) is the right one. The feed-v2 scoring formula (`base_engagement * W_engagement + recency * W_recency + affinity * W_affinity + explore * W_explore`) is sound, weights are tunable from the `feed_config` table, and `useFeedEvents` collects the right events (impression, dwell, tap, save, share, scroll_depth, swipe_related). Cold-start onboarding ("pick 3 topics") and the 60/40 session-vs-long-term affinity blend are best-in-class.

The signup prompt at idx === 5 is well-placed (matches the 3-soft-walls research finding from `HANDOFF_EXPLORE.md:51–55`).

### Issues

**Single-bit reactions lose signal.** Save and dismiss are the only positive/negative gestures. There is no equivalent of "more like this" / "less like this" / "strong interest" / "save for later." Behavioral analytics gain accuracy when reactions span at least three intensities (skip, mild interest, strong interest). Right now, the system can't distinguish "I bookmarked because the headline was great but I'm not sure I'll come back" from "this is exactly my flavor of paranormal — feed me more of these."

**No completion celebration.** When `idx >= items.length` and `!hasMore`, the user just hits a wall. The feed-v2 API returns `totalAvailable`, so there is a known endpoint, but the page doesn't say "You've seen all 132 reports tonight — come back tomorrow." Streak/retention work needs an end-of-feed moment.

**Saves are not actionable downstream.** Even if saves were persisted, there's no obvious surfacing of saved /discover cards in the rest of the product. Lab → Saved exists but is currently scoped to the older save flow. Bridge: every save on /discover should appear in Lab → Saved with an indicator "Saved from Today's feed."

**The Constellation paywall appears in three places at once.** Inline at the bottom of the expanded card (`DiscoverCards.tsx:607, 758, 918`), again in the desktop sidebar (`discover.tsx:836`), and again in the desktop detail modal (`discover.tsx:881`). When a user expands a card on a desktop view, they can see the same paywall component three times in roughly the same scroll. This dilutes its effectiveness and risks paywall-fatigue. Consolidate to a single canonical placement.

**Promo card insertion is rigid.** Always at idx 14, always "research_hub". A user who has already subscribed to Pro should not see the Research Hub promo at all. A user who has dismissed it twice should see it less often. Gate the promo by `user.tier` (skip if Pro) and by recent dismissal events from `feed_events`.

**No rotation in special card variety.** OnThisDate at 2, Cluster at 8, Promo at 14 — same on every visit. Add a small randomization: e.g., promo position shifts within a 12–18 window; OnThisDate has a 30% chance of being skipped if a higher-priority special card is available.

**The Read Case → View Full Report → leave-the-feed funnel has a friction step too many.** A user has to (1) tap Read Case, (2) read in-place, (3) tap View Full Report, (4) leave the gesture flow entirely. The middle expanded state often duplicates what's on the report detail page. Consider auto-expanding after 3–4 seconds of dwell on a card, OR (preferable) replacing the expanded state with a swipe-up-to-read transition that goes straight to the report detail, with a "× back to feed" button persistent on the report page.

### Recommendations

Add a third reaction gesture: tap-and-hold for 400 ms to "more like this" (pulls a heart), distinct from save (right swipe). Ship the event as a new `feed_event_type` and weight it higher than dwell in the affinity formula. This gives users a low-friction way to upweight without committing to a save.

Build an end-of-feed celebration card: today's count, streak indicator ("4 days in a row exploring UFOs"), 2–3 outbound CTAs (Map, Encyclopedia, Submit your own). Use the same `Constellation`-adjacent visual language but make it warm, not transactional.

Persist saves and bridge to Lab → Saved. Add a "Saved from Reports" filter on the Lab Saves tab. (Coordinate with Session 8 / Lab session.)

Consolidate the Constellation paywall into a single canonical placement: only inside the expanded body of the active card, never duplicated in sidebar + modal. Remove `<Constellation />` from the desktop sidebar and from the detail modal.

Gate the Research Hub promo on tier + recent-dismissal. Skip for Pro users. Shift the position by ±3 cards based on a session seed for variety.

Test "auto-expand on dwell" as an A/B against the explicit Read Case tap (treatment: cards expand at t=3s of stable view; control: tap-to-expand). Hypothesis: lower mid-funnel friction lifts View Full Report click-through by 15%+.

Test removing the expanded state entirely: card → tap → /report/[slug] with a sticky "← back to today" bar. Lab can A/B this against the current expand-then-leave flow.

---

## 4. Product Design — Strategy & positioning

### What's working

The strategic intent is right: anonymous users get the rich feed (gate depth, not breadth), authenticated users get personalization, paid users get the Research Hub. Content mixing is right too — phenomena cards anchor authority while reports cards create emotional resonance.

### Issues

**The "Reports" tab name does not match the surface's role.** The flame icon and the name "Reports" suggest "user-generated firsthand accounts." In practice, the gesture feed is a hybrid storytelling surface — closer to "today's interesting paranormal item, regardless of source type." Naming it "Reports" creates cognitive dissonance: encyclopedia entries feel out of place ("why is a 4 KB Bigfoot summary here when I tapped Reports?") and clusters/on-this-date cards feel like ads.

**/discover and /explore are not strategically distinct.** Both render mixed content. Both gate at the same depth. Both have the same category set. The interaction model differs (gesture vs. scroll), but the user-facing labels ("Reports" / "Phenomena") imply the *content* differs, not the mode. The product wants to claim "you can browse the same world two ways" — but it's not clear that's the intent or that it's the right intent. If yes, make the distinction explicit; if no, fold one into the other.

**Multiple bottom-of-funnel exits compete.** Read Case → View Full Report → /report/[slug] is one path. Constellation paywall → /lab is another. Rabbit hole → DetailView → "View Full Report" is a third. Each is independently reasonable, but they cannibalize each other. A user pulled into the rabbit hole detail rarely returns to the feed.

**Save state contradicts the save promise.** As noted, the save flash is not backed by persistence. From a product positioning standpoint, undermining a free interaction (save) before users have hit a paywall sets the wrong tone — they'll trust the upgrade pitch less.

**The expanded view shows Paradocs Analysis or "Analysis coming soon."** That fallback copy is a tell that the analysis layer is uneven across the corpus. For a free user evaluating whether to subscribe to Core ($5.99) for analysis, encountering "coming soon" in the free tier is fine; encountering it three or four times in a session reads as "the product is half-built." Either suppress the placeholder when no analysis is available, or hide cards without analysis from the feed entirely (filter at the API level).

### Recommendations

Pick one of two strategic stances and commit:

**Option A — collapse the duality.** /discover becomes the only entry point for "the feed." /explore becomes a power-user surface (browse, filter, search, map). The bottom nav has "Today" (replaces "Reports"), "Browse" (replaces "Phenomena", consolidates filtering + search + map), "Lab", "Profile." Saves the cognitive overhead.

**Option B — sharpen the distinction.** /discover stays the gesture-feed flagship; /explore becomes specifically *list-mode browsing of the same content set*. The label switch makes this explicit: bottom nav reads "Today" / "Browse" / "Lab" / "Profile." The page chrome on /discover gets a "View as list →" link that swaps to /explore preserving the current category lens.

Either way, **rename "Reports" to "Today"** in the nav, page title, footer, and `<head>`. The case for "Today": (a) implies freshness, encouraging daily return; (b) maps cleanly to the OnThisDate card type; (c) is mode-neutral (works whether content is reports, phenomena, or special cards); (d) avoids the cognitive mismatch of "Reports = encyclopedia entries."

Remove the "Analysis coming soon" placeholder. Either hide the expanded analysis section when empty, or push that as a server-side filter so the feed only surfaces cards with `paradocs_narrative IS NOT NULL` (when the user is in a tier that gets analysis).

Define a single "primary outbound" per card: View Full Report. Demote the Constellation paywall and the rabbit-hole-deep-link CTAs to secondary visual weight (smaller, less primary color).

Build a Pro-tier-aware version of the page that turns off promos and shows a "Pro Today" badge. Subscribers should feel the upgrade in the surface they use most.

---

## 5. Information Architecture

### What's working

Routes are stable: `/discover` for the gesture feed, `/explore` for list-mode browse, `/lab` for the dashboard, `/profile` for account. Tab → URL mapping in `MobileBottomTabs.tsx:58–78` is clean.

### Issues

**Three names for one place.**
- Bottom-tab label: **Reports**
- Desktop nav label: **Reports**
- Page `<title>`: **Discover - Paradocs**
- Footer link in Layout: **"Reports"** in the Community column, but **"Discover"** is also referenced
- Old prompts and historical content still call it "Stories"

A user who deep-links into `/discover`, sees a `<title>` of "Discover", and then taps "Reports" in the nav is going to feel briefly disoriented.

**The page lacks an h1.** There is no semantic page heading on `/discover`. The only on-page title is the `<title>` element. SEO and accessibility both want a real `<h1>` here — even if visually hidden via `sr-only`, it should announce "Reports" or "Today" to screen readers and crawlers.

**Special cards lack labels.** Cluster, OnThisDate, and Promo cards visually take a feed slot but render their own full-screen layouts. There's no breadcrumb or pill that says "On this day" / "Cluster pattern" / "From Paradocs." A user thinks they're swiping through one type of content and is suddenly looking at a colored gradient with a date callout. Adding a small top-corner pill ("On this day in 1969", "Cluster · 7 reports near Roswell", "Sponsored by Paradocs Pro") restores continuity.

**Footer's Community column lists "Reports" pointing to `/discover` and "Investigate" pointing to `/lab`.** The latter is the old name (Lab is the new name). Audit: `Layout.tsx:251–256` still says "Investigate."

**The encyclopedia/phenomenon distinction in the URL is invisible to most users.** /discover serves both phenomena (encyclopedia entries) and reports. When a user taps View Full Case → /phenomena/[slug] vs. View Full Report → /report/[slug], they're crossing an IA boundary mid-flow. There's no header or breadcrumb on the destination page that says "from Today's feed" or that frames the entry ("This is an encyclopedia entry" vs. "This is an eyewitness report").

**Lens / filter affordances are missing.** A user who wants only UFO content has to back out to /explore, set a filter, and use that surface — but the filter doesn't carry across to /discover. Compare: Spotify lets you change your radio station mid-listen; the Reports page should let you change your station too.

### Recommendations

Pick one canonical name (recommend **Today**) and apply everywhere: `<title>`, MobileBottomTabs, Layout desktop nav, Layout footer, `<h1>` (sr-only or visible). Add a redirect alias from old names if needed. Update PROJECT_STATUS.md and HANDOFF_EXPLORE.md to reflect.

Add a visible page header (recommended height 56–64 px) including h1, the lens chip strip, and the segmented progress indicator. This solves the IA complaint, the page-identity issue, and gives the engagement panel its filter affordance in one move.

Label every special card type with a top-corner pill that names its kind: "On this day", "Cluster pattern", "From Paradocs", etc. Three lines of code per card, immediate clarity gain.

Audit `Layout.tsx:251–256` (footer Community column): rename "Investigate" → "Lab" and "Reports" → "Today" (or whatever name wins), point at the same canonical URLs.

Wire a category lens filter that persists across /explore and /discover via URL query (`?category=ufos_aliens`). The /discover page should pre-filter the feed-v2 query when the param is set, and the lens chip strip should reflect the active state. This unifies the two surfaces' filter logic.

When a user follows View Full Case or View Full Report from /discover, set a session marker (sessionStorage) so the destination page shows a "← back to Today" link in its top-left, returning the user to roughly their last position in the feed (use `idx` + `sessionSeed` to attempt restoration).

---

## Cross-cutting recommendations — prioritized

The following list is ordered by ratio of (engagement / IA / trust impact) ÷ (engineering effort). Highest leverage first.

**Tier 1 — ship next sprint, days of work each**

1. **Rename "Reports" → "Today"** across nav, title, footer, and page `<h1>`. Resolves the three-names-for-one-place problem and aligns the page label with what users see (`MobileBottomTabs.tsx:31`, `Layout.tsx:81`, `discover.tsx:643/667`, footer `Layout.tsx:251–256`).
2. **Persist saves on /discover.** Mirror the existing save path on /explore: anonymous → localStorage + redirect-to-login on bookmark; authenticated → POST to saved_reports. Bridge to Lab → Saved.
3. **Gate touch handler on `expanded`** so the user can read without accidentally next-carding. One-line fix.
4. **Add a "✕ Collapse" affordance** on expanded cards that replaces "Read Case." Symmetric, discoverable.
5. **Add `aria-live` for the save/dismiss flash** and `role="article"` + `aria-label` per card.
6. **Audit footer labels.** "Investigate" → "Lab", "Reports" → "Today" (or canonical name), update internal references (`Layout.tsx:251–256`).
7. **Label special cards.** Top-corner pill: "On this day", "Cluster pattern", "From Paradocs."
8. **Fix double bottom padding** by removing `pb-20` from `<main>` on /discover (treat as opt-out of the global pad) or removing `mobile-content-pb` from the inner pane — pick one, gain 70–90 px of usable card height.
9. **Bump body text contrast** (`text-gray-500` → `text-gray-400` for content text).

**Tier 2 — ship in two sprints**

10. **Replace the gesture-hint vertical text with a first-run interactive tutorial overlay.** Persist completion in localStorage. Add a "show shortcuts" link in profile menu.
11. **Replace the 36 px counter strip with a real page header** (h1 + lens chip strip + segmented progress bar). Resolves IA, mobile-design, and engagement panel concerns simultaneously.
12. **Skeleton card loading state** matching the dossier visual language.
13. **Wire the rabbit-hole sidebar at `lg:` (1024 px+)** instead of only `xl:`. Most laptop users live in this band.
14. **Cap card-pane width at ~720 px even at xl** so headlines don't exceed comfortable line length.
15. **Tier-aware Research Hub promo** (skip for Pro, dismiss-aware).
16. **End-of-feed celebration card.**
17. **"Less like this" / "More like this" reaction beyond binary save.** Long-press or double-tap maps to a heart; weight in affinity formula.
18. **Constellation paywall consolidation** — single canonical placement.

**Tier 3 — research / experimentation**

19. **A/B test auto-expand on dwell** vs. tap-to-expand.
20. **A/B test removing the expanded state entirely** in favor of direct tap → /report/[slug] with persistent "← back to Today."
21. **A/B test the strategic stance** (Option A: collapse /discover and /explore into a single "Today" + "Browse" pair; Option B: sharpen the distinction with mode toggles). Run as a 4-week study.
22. **Lens filter unification across /discover and /explore.** URL-driven, persists across surfaces.
23. **Streak visualization on the end-of-feed card.** Connects to the existing constellation theme.

---

## Files most likely to change

| File | Reason |
|------|--------|
| `src/pages/discover.tsx` | Page header rebuild, gesture handler `expanded` guard, saves persistence, end-of-feed card, special-card pill labels |
| `src/components/discover/DiscoverCards.tsx` | Collapse button, contrast bumps, optional Constellation removal in non-canonical placements |
| `src/components/Layout.tsx` | Rename Reports → Today across nav + footer; remove `pb-20` for /discover, or move that decision to the page |
| `src/components/mobile/MobileBottomTabs.tsx` | Rename TABS[0].label "Reports" → canonical |
| `src/styles/globals.css` | Possibly a new `.skeleton-card-shimmer` keyframe; review `.mobile-content-pb` |
| New: `src/components/discover/GestureTutorial.tsx` | First-run tutorial overlay (replaces low-contrast hints) |
| New: `src/components/discover/EndOfFeedCard.tsx` | Celebration / streak / suggestions |

---

## Out of scope but worth flagging

- The `DiscoverPreview` component on the homepage (the rotating "Eyewitness accounts" carousel) shares the dossier visual language with /discover cards. Any rename or pill-labeling changes should propagate. The carousel itself is well-tuned and was deliberately re-randomized in Phase 4 (March 31).
- The signup prompt at idx 5 is correctly placed but could benefit from referencing the actual content the user just saw ("You've been reading about UFOs in Iran — save this and 4 other recent UFO reports for free").
- The desktop fixed-bottom keyboard shortcut bar is genuinely useful for power users on laptops but should be opt-in (default off) or moved to a `?` button in the page header. Right now it eats real estate by default.
- The DetailView modal (desktop only, opens from rabbit hole) is functional but visually disconnected from the main feed dossier language. Either match its styling more closely or transition into the report page directly.

---

## Closing note

The instinct to push beyond the TikTok pattern (four-direction gestures, rabbit-hole panels, dossier typography, hook-first copy) is the right one. Paradocs has more to say than a single-axis swipe can carry. The work below is mostly about closing the gap between **what the page can do** and **what users will discover that it does**.

The biggest single win available, by a wide margin, is renaming "Reports" → "Today" and adding a real page header with a lens chip strip. That one change resolves the three-names-for-one-place IA problem, gives the engagement panel its filter affordance, and finally communicates to a first-time visitor what they're looking at — all without touching the feed algorithm or any of the impressive Phase 3 / Phase 4 plumbing.

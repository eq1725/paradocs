# Today (/discover) — Mass-Market Readiness Review

**Subject:** `/discover` (Today) on iOS Safari, post-deploy May 1 2026
**Reviewers:** Visual Design (vs. mass-market benchmarks), Card Composition & Layout, Interaction & Motion, Engagement & Retention (case studies), Mass-Market Readiness
**Method:** Three live-build screenshots (Pali Canon phenomenon card, Connected Cases panel, Motion Illusion / On This Date card), benchmarked against TikTok, Pocket, Apple News, Pinterest, Flipboard, BeReal, Spotify, and the New York Times Now app.
**Date:** May 1, 2026 (PM)

---

## Executive summary

The system has graduated from "this works" to "this is plausible." Gestures fire correctly, lens filtering is functional, the rename to "Today" landed cleanly, and the dossier aesthetic is mature enough to be recognizably a product. There are screenshots from this build that, taken in isolation, look better than most paranormal-content apps on the App Store.

But "better than what's out there" is a different bar than "ready for millions." The screenshots reveal two structural issues and a constellation of polish gaps that, together, would limit the ceiling of this product:

1. **The viewport-fit contract is broken.** The OnThisDate card visibly clips its primary CTA ("Read the full story") below the fold. Cards must always fit — every primary action visible without scrolling — or the swipe rhythm collapses.
2. **The card composition is too dense.** The Pali Canon card stacks badge + meta + headline (6 lines) + 2 oversized chips + small chip + stats row + button + bottom bar. Comparable mass-market feeds (TikTok, Pocket Discover, Apple News+) use ~3 elements per card max with strict hierarchy.
3. **Color and imagery are radically underused.** The category-tinted gradient I shipped at 14% alpha is essentially invisible on the live build. Comparable apps deploy color from imagery (Spotify), full-bleed thumbnails (Pinterest), or aggressive category tints (Apple News). Paradocs is sitting on an 11-color palette and an encyclopedia of imagery and using neither.
4. **The Connected Cases panel is the strongest thing on this build** (screenshot 2). It has clearer hierarchy than the main card, feels less crowded, and the green accent reads as a confident category signal. It accidentally outclasses the primary surface.

Five panels follow, each with comparable-product callouts. The closing roadmap is ranked by mass-market impact, not engineering effort — the lowest-effort items are not always the highest-leverage.

---

## Panel 1 — Visual Design Maturity (vs. mass-market apps)

### What's working

The starfield background is one of the strongest moves in this product. It gives the page an ambient, exploratory mood that matches the subject matter. Nothing in TikTok, Pocket, or Apple News has anything like it — and shipping it as a transparent canvas behind dark cards means it never competes with content. Keep this. Defend it.

The dossier visual language is right. Uppercase tracking-widest category badges, monospaced-feeling stat readouts, geometric corner markers — this is a confident editorial voice that "ParanormalDB" or "GhostFlix" would never have shipped. The choice to lean into "case file" over "social media" is an asset.

The Connected Cases panel (screenshot 2) is design-mature: each related case is its own enclosed card with a clear category accent stripe, full body copy, and a quiet supporting paragraph below. It feels like flipping through a research archive. This is what the main feed should aspire to.

### What needs to change

**The category gradient is not visible.** I shipped a `rgba(catColor, 14%)` radial gradient anchored top-right. On the Pali Canon card I can see a faint amber wash; on the Motion Illusion card the page is essentially monochrome. At 14% alpha against a `#0a0a14` page background with a starfield, the signal is below noise floor.

Look at how mass-market apps deploy color:

- **Spotify** color-grades the entire screen from the album art (10–25% alpha, but full-bleed). The "now playing" card has a 70%+ saturation tint extending across the viewport.
- **Apple News+** uses aggressive section accents — a Bloomberg story has full-bleed turquoise; a Vogue feature has full-bleed magenta. Categories are unambiguous at a glance.
- **Pinterest** lets the image carry the color and uses subtle 4–6% white overlays only as scrim for text legibility.
- **TikTok** doesn't tint cards because they're full-bleed video, but the bottom UI overlay uses heavy gradient masks (90%+ opacity at the edge).

**Recommendation:** Bump the category gradient from 14% to 22–28% in the upper third, fading to transparent. Use a linear gradient from top, not a radial — radial fights with the natural top-down reading direction. Consider a second subtle gradient at the bottom for visual closure (Pinterest pattern). The starfield should still be visible behind it.

**Imagery is absent from text-only cards.** The Pali Canon card has zero imagery. For an entry on Buddhism, the database almost certainly has Wikipedia-attributed images of the Pali Canon manuscripts, the Buddha himself (countless), historical depictions, etc. Apple News articles always lead with imagery. So do Pocket cards, Flipboard, NYT Now, even Substack's iOS app.

**Recommendation:** When `primary_image_url` exists on a phenomenon, use it as a background layer at 30–40% opacity behind the card content with a heavy bottom-up gradient mask. Text legibility is preserved; the card gains immediate emotional weight. For phenomena without imagery, lean harder into the category icon as a watermark glyph (300px, 6–10% opacity, top-right corner, slight rotation) — a typographic move that costs nothing at scale.

**Typography needs a clearer label/value rhythm.** Right now the meta strip (`Global · Religious and philosophical figure...`) and the chip pills both use the same Inter sans at similar weights. The eye doesn't know what's "label" and what's "value." Apple News uses a small caps + condensed treatment for metadata; Bloomberg uses a serif for headlines and a sans for chrome; NYT uses a 10–11px monospace for timestamp/byline.

**Recommendation:** Switch meta strip and chip text to a tabular feature font (font-feature-settings: "tnum") or a slightly condensed sans. Reserve Changa One for the headline only. The headline already does the heavy lifting — let it be the only place display-font is in play.

### Comparable benchmarks at a glance

| Product | Card style | Imagery | Color strategy | Density |
|---------|-----------|---------|----------------|---------|
| TikTok | Full-bleed video | Always (the content IS the image) | None — content carries it | 1 element + chrome |
| Pocket Discover | Hero image + title + 2-line dek | Always | Subtle source-color accent | 3 elements |
| Apple News+ | Hero image + title + dek + section badge | Always | Aggressive section tint, full-bleed | 4 elements |
| Pinterest | Full-bleed image + 1-line caption | Always (image-first) | From image | 1 element |
| Flipboard | Magazine-style flip, hero image + headline | Always | From image | 2 elements |
| **Paradocs Today** | **Dossier text + tiny accent + no image** | **Rarely** | **3px stripe + 14% gradient** | **7+ elements** |

The mass-market floor for content cards is "imagery + 2-3 elements." Paradocs is two standard deviations more text-dense than its peers. That's a defensible editorial choice for the curated case-file mode (and Connected Cases reads exactly that way), but it's a problem for the swipe-feed mode where users decide in 2 seconds whether to engage.

---

## Panel 2 — Card Composition & Layout

### The screenshot evidence

**Pali Canon (screenshot 1)** stacks, top to bottom: starfield ambient, header chrome (~140px), category badge row (~24px), meta strip (~48px), 6-line headline (~240px), two oversized chips (~76px), small chip (~28px), stats row (~80px), Read Case button (~52px), bottom stats bar (~24px). Total card content: ~712px. iPhone 16 Pro Max usable height: ~750px after header + nav. **This card barely fits.** On any smaller phone it overflows.

**Motion Illusion / OnThisDate (screenshot 3)** stacks, top to bottom: header chrome (~140px), large amber gradient field (~400px), "On This Date" pill (~36px), big year (~120px), date subtitle (~24px), title (~36px), category line (~24px), 4-line description (~120px), orange CTA button (~60px). The orange CTA is **partially clipped at the bottom** — Chase's specific complaint. Total content: ~960px against ~750px viewport.

**Connected Cases (screenshot 2)** is doing the right thing: each card is enclosed (rounded border, 1px dim line), has its own breathing room, body content scrolls within the panel, and supporting paragraphs are visually distinct from the headline.

### The problems

**There is no viewport-fit contract.** Mass-market swipe feeds have a strict invariant: every card must show its primary action above the fold, and every fold-of-fold must be reachable by an obvious gesture. TikTok, Reels, and BeReal all enforce this rigidly. Paradocs cards can exceed viewport height silently, hiding the primary CTA below the fold. Users don't know to scroll inside the card; they swipe to the next one and miss the action entirely.

**The element count is too high.** Pali Canon has 9 distinct elements stacked vertically. The Connected Cases panel has 4 (badge, location, headline, dek). The user's eye needs to finish processing one card in roughly 2 seconds at swipe speed. With 9 elements that's 222ms per element — below the perceptual chunking threshold (~300ms) for non-trivial content.

**The Read Case button is bottom-anchored to the content stack, not the viewport.** When content overflows, the button leaves the viewport. This is the immediate cause of the OnThisDate clip.

### What mass-market does

- **TikTok**: video fills entire viewport. Caption + buttons sit on top in a fixed bottom-right column. The action column is *always* in the same screen position regardless of video length. Users learn it's there because it never moves.
- **Pocket Discover**: card is a fixed 480px tall, content stack always fits, no scrolling within cards. Tap target = entire card.
- **Apple News+**: card is full viewport but designed against a strict 6-element template (image, section, headline, dek, byline, CTA) that always fits.
- **BeReal**: dual-image card always exactly viewport height, no overflow tolerated.

### Recommendations

**Adopt a viewport-fit contract.** Every card must be exactly viewport height. Never overflow. Below are the architectural moves to make that real:

1. **Pin the Read Case CTA to the bottom of the card pane**, not the bottom of the content stack. Use `position: sticky; bottom: 0` or absolute-bottom with `flex-grow: 1` on the body so it gets squeezed before the CTA does. The button is *always* visible.
2. **Cap the body content area** to `viewport - chrome - cta - 24px breathing` and let it scroll internally. The user sees a hint of "more below" via a soft bottom fade-mask. This is exactly what Pocket's article preview does.
3. **Reduce the element count from 9 to ≤5**: badge (combined with meta in one row), headline, single tension chip strip, stats row (or remove — see below), Read Case CTA.
4. **Kill the bottom stats bar** when expanded view is reached via Read Case. The redundant `♡ 20 reports` + `1969` strip duplicates information already in the badge and stats row.

**Specific layout for the unified card:**

```
┌─────────────────────────────────────┐
│ [bg layer: gradient + image @ 35%]  │
│                                     │
│ CRYPTIDS · 1976 · IRAN     ⊙ trending│  ← badge row (24px)
│                                     │
│ Headline of the case in a single    │
│ confident two-line treatment that   │  ← headline (96–144px max)
│ wraps gracefully.                   │
│                                     │
│ ┌──────┐ ┌──────┐ ┌──────┐         │  ← chip strip (32px)
│ │ MIL  │ │ RADAR│ │ 3 wit│         │
│ └──────┘ └──────┘ └──────┘         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ [optional: 1 quick stat with    │ │  ← optional stats (40px)
│ │  big number, accent-colored]    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [body excerpt, 2–4 lines max]       │  ← excerpt area (80–120px)
│                                     │
│ ─── flex-grow spacer ───            │
│                                     │
│ ▼ Read full case             ✦ Save │  ← sticky CTA bar (52px)
└─────────────────────────────────────┘
```

The right side of the CTA bar absorbs the save action so right-swipe has a visual anchor — the button itself "lights up" on swipe-right. This is the BeReal photo-flip pattern.

**Variants per content type:**

- **Phenomenon card (encyclopedia)**: hero glyph + name + region + 1-line `feed_hook` excerpt + "open encyclopedia" CTA. The card is denser at 3–4 elements. Tap = `/phenomena/[slug]`.
- **Report card**: same shape, replace name with phenomenon_type + year + location, plus a credibility chip strip if present. Tap = `/report/[slug]`.
- **OnThisDate card**: this template already works visually (big year, amber gradient) — it just needs the viewport-fit contract enforced. Move "Read the full story" to a sticky bottom bar.
- **Cluster card**: headline-first ("17 NDE reports this week from the Southeast"), big number callout, supporting region/timeframe, "explore cluster" CTA.
- **Promo card**: keep as-is; it's already viewport-fit by design.

---

## Panel 3 — Interaction & Motion

### What's working now

Gestures are firing on iOS post-c7e2967f. The 230ms cubic-bezier card transition feels snappy without being jarring. The "Connected Cases" pill at the bottom is doing real affordance work and the screenshot 2 evidence shows users do find their way to it.

### What's missing or broken

**Save and dismiss have no visual anchor.** TikTok's right-side action column lights up when you tap (heart fills, share button pulses) so the user gets confirmation in their peripheral vision. Paradocs flashes a small "✦ Saved" or "Dismissed" toast in the top-right header, which the user isn't looking at. The eye is on the card center where the headline lives.

**Recommendation:** Add a save state to the card itself — a bookmark icon that animates from outline to filled, anchored top-right of the card. Same for dismiss: the card itself briefly tints red-ish (say, `rgba(244, 63, 94, 0.08)`) before sliding out left. Users see *the thing they touched* respond, not a distant header label.

**The swipe-down ↓ Connected cases pill is doing two jobs.** It's a static label saying "swipe down for more" AND a tap-to-open button. Mass-market apps would split these: a subtle persistent affordance (small chevron or pulled-down handle) that says "there's more below" + a swipe gesture that opens it. The current pill is roughly a 3-second discovery problem because it doesn't move/glow on entry.

**Recommendation:** Replace the pill with a small bottom drawer handle (like the iOS Maps bottom sheet) that pulses subtly on first appearance, then settles. Tappable to open, swipeable to drag open progressively. Pinterest's "more like this" tray uses exactly this affordance.

**Long-press timing is non-discoverable.** The "More like this" gesture fires after 600ms hold. Users will find this by accident if at all. Compare to TikTok where holding a video pauses it (every user discovers within 5 sessions because they accidentally pause). The action needs to be more discoverable.

**Recommendation:** Add an explicit ♡ "More like this" button in the card chrome (top-right next to save?) with a tooltip on long-press that reveals "tip: long-press the card to do this faster." Visible affordance + power-user shortcut.

**Card-to-card transitions could be richer.** Current: 230ms translateY + opacity fade. TikTok and Reels use a continuous-edge transition (the next card is already partially visible at the bottom edge during scroll). BeReal does a hard cut. Spotify does a card-stack metaphor.

**Recommendation:** Show the next card's category-color stripe peeking 4–6px from the bottom edge of the current card, so users always know "another card is queued." Reduces the perceived friction of "did my swipe register?" — the next card is visibly already loading.

### Comparable benchmarks

| Action | TikTok | Reels | BeReal | Pocket | Paradocs (now) |
|--------|--------|-------|--------|--------|----------------|
| Save | Bottom-right column, fills with color | Same | N/A | Top-right bookmark | Header toast |
| Dismiss | Vertical scroll only | Same | Tap "delete" | Long-press menu | Left swipe |
| Like | Heart pulse + counter | Same | N/A | N/A | None visual |
| Next | Full vertical scroll | Same | Tap | Tap (web), swipe (app) | Up swipe |
| Related | None native | None | None | "Related" inline | Down swipe |
| Tap card | Pause video | Pause | None | Open article | "Read Case" expand |

Paradocs is doing more than its peers — left-swipe-to-dismiss is genuinely novel for content apps, swipe-down-to-rabbit-hole is a real research-product feature. But novelty without instruction is invisibility. The first-run tutorial helps; the persistent affordances need to do more work.

---

## Panel 4 — Engagement & Retention (case studies)

### The retention problem

Paradocs Today is a content-discovery surface for a *research* product. The retention model can't be pure dopamine (TikTok); it has to combine "I'm fascinated" (BeReal/Pocket-style appointment retention) with "I'm collecting evidence" (Pinterest board-style accumulation). The North Star metric in the original handoff is Session Depth, which is right.

### What works in comparable products

**TikTok's algorithmic supply.** Users open TikTok because the next video might be incredible. Paradocs' equivalent is "the next case might rewrite my model of the world" — but that promise is fragile. If 4 cards in a row are encyclopedia entries about Buddhist philosophy, the user concludes the feed is dry. The mix is everything.

**Pocket's "saved for later" identity.** Pocket users self-identify as "the kind of person who saves things to read later." That identity is reinforced by the saved-count, the streak, the "you have X unread items." Paradocs Lab → SAVES already does this, but the connection from /discover save → Lab celebration is weak. Compare to Strava: every workout you finish gets a celebration screen with badges, kudos, and stats — Paradocs save → silent toast → maybe see in Lab later.

**BeReal's notification-driven appointment model.** "It's time to BeReal" is the killer mechanic. Paradocs could ship "Today's case has dropped" as a daily notification, leaning into the "Today" name. Users open the app at 9am because they want to know what today's lead case is.

**Pinterest's board-building flow.** The act of saving builds toward a personal collection that becomes shareable, browsable, sharable as identity. Paradocs' Lab → SAVES is the same primitive but lacks the visceral ownership feel. Boards have covers; collections have moods; saves have themed chrome. Paradocs collections are text labels.

**Spotify's Year in Review / Wrapped.** Annual celebration of accumulated behavior. Paradocs has the data infrastructure (`feed_events`, `user_streaks`, `category_engagement`) to ship a Year in Review. It's not built yet (per HANDOFF roadmap).

### Recommendations

**Build a "Today's Lead Case" notification system.** Each day, surface one curated case as the day's headline. Notification at 9am local. Card carries a "Today's lead" badge. Once the user has read it, they're hooked into the regular feed. This is the BeReal mechanic adapted for research content. **Effort:** medium (push notification infra + curation rule); **leverage:** very high.

**Strengthen the save → Lab celebration loop.** When a user saves a card on /discover, briefly show a "Added to your case files (12 saved this week)" tooltip referencing their accumulating count. After every 5 saves, show a transient celebration ("You're building a UFO archive — 5 cases saved this week"). Strava + Duolingo both do this. **Effort:** small; **leverage:** medium-high.

**Personalized "Why you're seeing this" affordance.** TikTok's "not interested" menu reveals *why* the algorithm chose a video. Paradocs could surface a small "i" icon next to the category badge that, on tap, reveals "We surfaced this because you saved 3 UFO cases this month." Users feel the algorithm is working for them. **Effort:** medium; **leverage:** medium.

**Ship the streak chip on every relevant surface.** It's already on EndOfFeedCard; put a quiet streak indicator in the TodayHeader top-right too. A daily-engaged user sees their `🔥 7-day streak` chip and feels invested. **Effort:** small; **leverage:** medium.

**Build a shareable card export.** Tapping share on a card generates an Instagram-Story-formatted image (square or 9:16) with the headline, category badge, and Paradocs branding. Users share = free distribution. Pinterest, Reddit, NYT all have this. **Effort:** medium-large; **leverage:** very high (long term).

**Start measuring tap-through rate per category.** The infrastructure (`category_engagement` materialized view) exists. Build the admin dashboard. Use the data to dynamically adjust the lens chip ordering — if "On this day" has 3x the tap rate of "With Evidence," put it first. **Effort:** small (dashboard already scaffolded per HANDOFF); **leverage:** high.

### Cohort-mapping target

| User type | Hook | Retain | Convert to paid |
|-----------|------|--------|-----------------|
| Casual paranormal-curious | "Today's lead case" notification | Daily streak + algorithmic feed | "Read 50 case files free; subscribe for unlimited" |
| Active researcher | Save → Lab board-building | Connected Cases panel + saved count | Constellation paywall (already gated) |
| Skeptic visitor | "Verified Evidence" lens (renamed With Evidence) | Photo/video reports + Paradocs Analysis | "Pro Researcher" tier |
| Returning lapsed user | Win-back email referencing saved cases | "12 new cases match your saves" prompt | Tier upsell on second login |

The infrastructure for most of this exists. The orchestration is what's missing.

---

## Panel 5 — Mass-Market Readiness Gaps

These are the items that, if shipped to a million users tomorrow, would generate the most support tickets. Ranked by user-visible severity.

### Severity 1 — must-fix before scale

**OnThisDate card clips its CTA.** The orange "Read the full story" button is below the viewport on the 6.7" iPhone screenshot. Smaller phones make this worse. Users who don't know to scroll inside the card will swipe past, never realizing there was a CTA. This is the viewport-fit contract violation discussed in Panel 2.

**No empty state for empty lens.** If a user picks `On this day` on a date with no matching content, the page shows nothing or freezes. This needs an empty state ("No cases matched today's date in 1976. Try a different lens.") with a chip to clear the filter.

**No first-day cohort safety net.** A user signing up at 11pm has 1 hour to "use" the app before "today" rolls over. Tomorrow's content is hidden. They should still get a meaningful first session — surface 5–10 evergreen featured cases as the bootstrap feed.

**Inconsistent sticky-header height across devices.** On the screenshots, the TodayHeader is ~140px (header + chips + chips + progress). On smaller iPhones (iPhone SE, iPhone 13 mini) this is ~22% of the viewport. Bigger problem on landscape orientation — chip strips dominate.

### Severity 2 — pre-launch polish

**The category chip strip overflow is hidden.** "Ghosts & Hauntings" is clipped on the right edge of the screenshot. On screen, the user sees a partial label and may not know there are more chips to scroll to. Add a soft right-edge fade-mask + "→" arrow at the strip end signaling more content.

**No haptic feedback on save/dismiss.** iOS supports `UIImpactFeedbackGenerator` (or `navigator.vibrate(50)` on the web). Saves should pulse a haptic. TikTok, BeReal, Pinterest all do this. The cost is one line of code, the engagement gain is real.

**The "Read Case" expansion modality is unclear.** After expanding, the user reads the analysis. To swipe to the next card, they have to tap "Collapse" first (intentional gating). But the tutorial doesn't teach this and the feedback is silent. Many users will think the app is stuck. Add a one-time tooltip over Collapse on first expansion.

**The rabbit hole's "Constellation / Full case files & connections" footer (screenshot 2) reads as a section divider, not an upsell.** Color, spacing, and copy all suggest "this is a section break," not "subscribe for more." If it's a paywall it needs to look like one — accent color, lock icon, button.

**Search icon in the top-right header is unanchored to /discover's UX.** Tapping it routes to `/explore?mode=search`, which leaves the gesture feed. Users searching for something specific (e.g., "Roswell") should get a "search Today" overlay that filters the feed in place, not navigate away. Long-form retention demands you don't blow up someone's session over a single keyword.

### Severity 3 — post-launch enhancement

**No sound design.** Mass-market apps ship with subtle sound: TikTok scroll has a tiny cardboard-flip sound; Spotify has tab clicks; Apple News has a paper-rustle on swipe. Paradocs is silent. A muted-by-default option for ambient sound + per-action UI sounds would be a major polish lift.

**No dark/light theme toggle.** Today is dark-only. That's fine for the dossier aesthetic but locks out 20–30% of users who prefer light mode for accessibility (screen reflections, certain visual sensitivities). A light variant doesn't have to be primary; it just has to exist.

**No reduced-motion support.** The card slide animations (230ms transform) don't respect `prefers-reduced-motion`. WCAG and platform UX guidelines require it. Add a media query check and disable transforms when the OS setting is on.

**Skeleton card never shows on second-batch fetch.** Initial load shows the new SkeletonCard; the prefetch-at-idx-N-5 fetches happen silently. On slow connections, users hit the end of the buffered cards and see nothing for 1–3s while the next page loads. Show a skeleton card during pagination too.

**No "share this case" as a top-level action.** Users can share via OS share sheet only by leaving the app to the report page. A native share button on each card with pre-formatted content (Story image, link, hashtag) would unlock organic distribution. Reddit, NYT, Apple News all ship this.

---

## Specific screenshot-driven recommendations

| Screenshot | Issue | Fix |
|-----------|-------|-----|
| 1 (Pali Canon) | 9 elements stacked, headline 6 lines | Reduce to ≤5 elements per Panel 2 layout. Cap headline at 3 lines, push rest to expanded view. |
| 1 (Pali Canon) | Category gradient invisible | Bump alpha to 22–28%, switch radial → linear top-down. |
| 1 (Pali Canon) | Both chips truncated to ≈40 chars + ellipsis | Good — that fix worked. Keep. |
| 2 (Connected Cases) | This is the strongest screen | Use as design reference for the main feed cards. |
| 2 (Connected Cases) | "Constellation / Full case files & connections" reads as divider not paywall | Add lock icon, button styling, accent border. |
| 3 (OnThisDate) | "Read the full story" CTA cut off below viewport | Sticky-bottom CTA on all cards; viewport-fit contract. |
| 3 (OnThisDate) | Body text truncated mid-word ("spatiotempor...") | Truncate at sentence boundary, not character count. |
| 3 (OnThisDate) | Big amber gradient field is ~55% of card with no content | Move "On This Date" pill higher (top of viewport, not center), use that vertical real estate for context. |

---

## Roadmap — ranked by mass-market impact

This list assumes the priority is "ready for millions of users" rather than "ready for the next sprint." The first three items unlock the next 6.

### Now — viewport-fit contract + visual mass-market floor

1. **Implement viewport-fit contract on all card types.** Sticky-bottom CTA. Body content scrolls inside card, never below. No element-stack overflow. (Severity 1 fix for the OnThisDate clip + structural correctness for all device sizes.) **2 days.**
2. **Reduce card element count to ≤5.** Restructure PhenomenonCard, TextReportCard, MediaReportCard per Panel 2 layout. Bottom stats bar removed; tension stats consolidated into a single chip strip; meta strip merged into badge row. **1.5 days.**
3. **Pump category color from 14% → 22–28% alpha.** Switch radial → linear top-down gradient. Add a subtle bottom gradient for closure. (Visible color, not subliminal.) **2 hours.**
4. **Add hero imagery to phenomenon cards when `primary_image_url` exists.** 30–40% opacity backdrop + bottom-up scrim for legibility. **1 day.**
5. **Add empty state for filtered-zero-result lens.** "No cases matched On this day. Try a different lens." with a Clear button. **2 hours.**

### Next — engagement loops

6. **Save state animation on the card itself**, not just toast. Bookmark icon top-right fills on save. **1 day.**
7. **Haptic feedback on save/dismiss/long-press**. Single line per gesture. **2 hours.**
8. **Card → next-card peek (4–6px of next card's accent at bottom).** Reduces "did my swipe register?" anxiety. **3 hours.**
9. **Lens chip strip — fade-mask + arrow on right edge**. Communicates "scrollable; more chips below." **1 hour.**
10. **Streak chip in TodayHeader (small, top-right).** Reinforces daily-return identity. **2 hours.**

### Next+1 — distribution & retention

11. **"Today's Lead Case" daily notification.** Curated, push-delivered, badge-marked in feed. **3 days (push infra + curation rules).**
12. **Shareable card export (Instagram-Story-formatted PNG).** Tap share → render → share sheet. **3 days.**
13. **Save → Lab celebration loop (every 5 saves, transient toast).** Reinforces collection identity. **1 day.**
14. **Native search overlay on /discover** instead of navigating to /explore. Filter feed in place. **2 days.**
15. **First-day bootstrap feed of 10 evergreen featured cases**. Safety net for late-night signups. **1 day curation + admin work.**

### Long tail — pre-mass-market

16. **Light theme variant.** Not primary, but accessible. **3–5 days.**
17. **`prefers-reduced-motion` support.** WCAG correctness. **1 day.**
18. **Skeleton card during pagination, not just initial load.** **2 hours.**
19. **Sound design pass.** Subtle, opt-out. **1 sprint.**
20. **Year in Review + Win-back emails.** Annual + lapsed. **2 sprints.**

### "Don't ship" / actively-debated

- **Auto-expand on dwell.** Already removed. If we re-introduce, it must be as a settings toggle, default off. The retention math doesn't support it; the gesture conflict cost is too high.
- **Remove the expanded state entirely (option from V1 review).** Keep the option open, but the Connected Cases panel + Read Case modal do enough work for now. Re-evaluate after first 1k users.
- **Color-grade card backdrop from imagery (Spotify pattern).** Gorgeous but expensive — requires per-image color extraction at ingestion time. Phase 2.

---

## Recommended next conversation

The single most-impactful work is items 1–4 above (viewport-fit + element reduction + visible color + hero imagery). They make the same product look 50% more mass-market-ready without changing what it does. Together they're roughly 4 days of focused implementation.

If you want to ship those four as the next pass, I can implement them and we benchmark against another set of screenshots. The OnThisDate card clip is genuinely a Severity 1 issue — that one alone justifies an immediate fix even if the rest waits.

After that the engagement-loop items (5–10) are quick polish, and the distribution items (11–15) are the work that takes Paradocs from "real product" to "thing that compounds via word of mouth." Those are bigger commitments.

Worth asking before any of this: who is the first 1000? If it's research-paranormal-curious adults, the dossier aesthetic and density are largely fine and we should mostly polish. If it's social-discovery TikTok refugees, we need to materially reduce density and add imagery aggressively. The right answer for the visual changes depends on the cohort.

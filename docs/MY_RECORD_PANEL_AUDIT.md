# My Record — Multidisciplinary Panel Audit

**To:** Chase
**From:** The Panel (eight voices, convened June 2026)
**Re:** Full audit of the My Record surface as currently shipped — current state, founder's four concerns, prioritized backlog
**Scope:** `src/pages/lab.tsx` and every component it mounts; `src/lib/lab/dossier/*` (PDF + share render); `src/pages/api/lab/dossier/*`; `src/pages/pricing.tsx`
**Built on:** `docs/LAB_PANEL_REVIEW_V3.md`, `docs/PRO_TIER_VALIDATION_V3.md`, `docs/TIER3C_NAMED_MATCH_BUILD_NOTES.md`, `docs/MY_RECORD_SUBMISSIONS_PANEL.md`. We do not relitigate the rename, the gating matrix, the sentiment-baseline framing, or the two-flagship Pro stack — those are settled.

---

## 1. Executive summary

### Top 5 findings

1. **The page is a 10-section vertical scroll with no internal hierarchy.** Eleven independent sections (DossierHeader → CrossExperience → Hints → Temporal → Geographic → Paywall → NamedMatch toggle → Offers → DMs → Radar → MatchList → ManageSubmissions → Pro Dossier → Watchlists) stack down a single 3xl-max column. On mobile that is a 6,000-pixel scroll with no anchors; on desktop it is the same scroll wasting 60% of the viewport in side gutters. The page does not respect what the founder asked the v3 panel to deliver: *the n=1 dossier as the spine, with everything else feeling additive*. The spine is buried in the middle.
2. **Named-match is built end-to-end but reads as a "feature" in search of a use case.** The product surface (`NamedMatchOffersRail.tsx`, `NamedMatchOfferCard.tsx`, `DMThreadsList`, `DiscoverabilityToggle`) carefully scrubs identity, requires mutual opt-in, and gates DM behind handshake. That work is correct. But the *user benefit story* on the card is "another contributor shares N of 8 signals" — that is the engineer's language, not the user's. The founder's instinct is right: **the actual emotional payoff is being able to compare what each of you saw**. The current card does not say that; it says "share your account with them?" which is too abstract to convert.
3. **The Pro Dossier "PDF" is not a PDF.** `src/pages/api/lab/dossier/[id]/export-pdf.ts:45` returns `Content-Type: text/html`. The user clicks "Export PDF" and gets an HTML page they must then Cmd+P → Save as PDF themselves. Worse, the print stylesheet has a body `max-width: 480px; margin: 24px auto` (`dossier-render.ts:247`) competing with `@page { size: A5; margin: 18mm; }` — printed in A5 it renders an 80mm column on a 148mm page (half the paper blank) because the print sheet honors the screen `max-width`. This is the source of "PDF dossier is awful."
4. **Basic and Pro signals do not surface on the Free page.** A Free user scrolling /lab sees one paywall card for named-match and one for the Dossier preview. They do not see the *shape* of the artifact they would get. The PDF book, the share card, the watchlists rail, the cross-experience header — none of these have a visual teaser inline on the Free experience. We are asking the user to buy a category they have never seen.
5. **The match list is the single biggest contributor to scroll length and the lowest contributor to action.** `MatchList.tsx` renders up to 12 inline-expandable cards beneath the Radar with witness-adjacency callout, new-match alerts opt-in, filter chips, per-dimension match bars, and "View full report" links. On the n=1 case this is 4-7 viewport-heights of "here are 12 strangers' UFO reports" before the user reaches the Pro Dossier preview. The founder's instinct is correct: this should be collapsed.

### Top 5 recommendations (prioritized)

| # | Recommendation | Tier |
|---|---|---|
| 1 | **Cut the match list from a full-bleed inline list to a "Top 3 + see all" sticky strip.** Move the rest behind a "View all 47 related accounts" link that opens a focused list page. Reclaim ~4 viewport-heights. | **MVP** |
| 2 | **Ship a real PDF.** Add `puppeteer-core + @sparticuz/chromium` to the API route (the code's own comment admits this is a follow-up). Fix the print stylesheet's `max-width` conflict. Rebuild the layout in A5 print-grid (not screen-grid). | **MVP** |
| 3 | **Rename "named-match" to "Compare Notes" everywhere user-visible.** Reframe the offer card from "share your account with them" to "Two of you saw something with 6 of 8 signals in common. Open a comparison." | **MVP** |
| 4 | **Add "Pro Dossier preview" inline rendering on Free.** Show the first 2 of the 7 dossier sections fully rendered with the user's real data, then a soft gradient mask + "Read the full dossier — Upgrade to Pro." Lets the Free user feel the artifact. | **Should-do** |
| 5 | **Introduce a single anchor nav at the top of My Record** (Dossier / Patterns / People / Pro) — desktop only sticky right rail, mobile bottom-sheet chip. Resolves the 10-section vertical scroll. | **Should-do** |

---

## 2. Current surface inventory

What renders when a logged-in user with n=1 experience opens `/lab` (top to bottom, with file refs):

| # | Section | Component | Tier gate | File |
|---|---|---|---|---|
| 1 | Page header (Telescope icon, "My Record", "Submit Report", bell, settings) | inline | none | `src/pages/lab.tsx:524-562` |
| 2 | DossierHeader (full-bleed verbatim card + synthesized paragraph + video poster + ownership chrome + experience switcher) | `DossierHeader.tsx` | none | `lab.tsx:577-582` |
| 3 | CrossExperienceHeader (n≥2 only) | `CrossExperienceHeader.tsx` | depth-gated | `lab.tsx:585-593` |
| 4 | HintsRail | `HintsRail.tsx` | depth-gated | `lab.tsx:599-601` |
| 5 | TemporalStrip (24h dial + decade band) | `TemporalStrip.tsx` | depth-gated | `lab.tsx:607-617` |
| 6 | GeographicSurface (real MapLibre, 50mi ring) | `GeographicSurface.tsx` | depth-gated | `lab.tsx:622-635` |
| 7a | Named-match paywall (Free) | `LabPaywallSurface.tsx` | Free only | `lab.tsx:643-655` |
| 7b | Discoverability toggle + NamedMatchOffersRail + DMThreadsList (Basic+) | three components | Basic/Pro | `lab.tsx:661-680` |
| 8 | RadarSurface (categorical lens) | `RadarSurface.tsx` | none | `lab.tsx:685-695` |
| 9 | **MatchList** (12 inline-expandable cards + filter chips + alerts opt-in + witness-adjacency callout) | `MatchList.tsx` | none | `lab.tsx:712-723` |
| 10 | ManageSubmissionsPanel | `ManageSubmissionsPanel.tsx` | none | `lab.tsx:724-748` |
| 11a | ProDossier (Pro) | `ProDossier.tsx` | Pro | `lab.tsx:754-758` |
| 11b | Pro Dossier paywall (Free/Basic) | `LabPaywallSurface.tsx` | Free/Basic | `lab.tsx:759-770` |
| 12a | WatchlistsRail (Pro) | `WatchlistsRail.tsx` | Pro | `lab.tsx:776-780` |
| 12b | Watchlists paywall (Free/Basic) | `LabPaywallSurface.tsx` | Free/Basic | `lab.tsx:781-792` |

Approximate measured scroll length, n=1 Free user on iPhone 15 viewport: **~6,400px** (≈ 8 viewport heights). On the same content at desktop 1440px: same scroll, with ~600px of empty gutter to the left and right of every section.

---

## 3. Per-section audit

### 3.1 DossierHeader (the spine)

**Mobile UI/UX designer (Strava/BeReal background):** "This is the strongest piece on the page. The verbatim excerpt, the synthesized paragraph, the location/date facts, the optional video poster — it earns its full-bleed treatment. Tap targets are correct (≥44px), the experience switcher pills work. *Keep this exactly as it is.*"

**Editorial lead:** "The header is right. The phen-family humanization in `phenFamilyLabel` (`lab.tsx:208`) — "UFO-shape", "apparition", "cryptid" — sits in the documentary register. No change."

**Recommendation:** No changes. This is the spine and it works.

### 3.2 CrossExperienceHeader

**Retention expert:** "Renders at n≥2. Most users are n=1, so most users never see it. That is fine — it is the artifact you earn by submitting a second experience. Currently a 'body-of-work' Haiku sentence above the strip. The diff-from-last-visit hook is missing — the user comes back next month and there is no 'here's what shifted since you were here last.' That is the n=2+ retention loop, and it is not built."

**Recommendation (V2):** Add a "Since you were last here…" line above the body-of-work sentence. Pulls from corpus-growth + new-match-detection. Cite-able from existing `/api/lab/temporal-distribution` and the watchlists match detector.

### 3.3 HintsRail

**Consumer psychologist:** "The Hints rail is the page's best engagement hook because it gives the user one thing to read and one optional click — completion bias rewards a definite action. Currently sits in slot 4. *It should be slot 2 immediately under the dossier* so the first content the user sees after their own card is a curated observation from the catalogue."

**Conversion expert:** "Disagree. Slot 2 risks burying the temporal/geographic comparative surfaces that make the *paid tiers* visible. The user must see depth before they meet a Hint, or the Hint feels like the whole product."

**Synthesis:** Hints stays in slot 4. But the rail's *visual weight* should drop — currently it renders 6 cards stacked; reduce to 1 prominent card + a "More from the catalogue" link.

### 3.4 TemporalStrip + GeographicSurface

**Desktop designer:** "Both are valuable, both are well-sized on mobile, both *waste vertical real estate on desktop*. On a 1440px screen they each take a full row when they could be side-by-side. Today: 2 viewport-heights. With side-by-side at md+: 1 viewport-height."

**Editorial lead:** "These two are doing the right work — 'your dot against the cloud.' Don't touch the copy."

**Recommendation (MVP):** `md:grid-cols-2` wrapper for TemporalStrip + GeographicSurface on desktop. Mobile stays stacked.

### 3.5 Named-match teaser / Offers / DMs

See full analysis in §4.

### 3.6 RadarSurface + MatchList

This is concern #2. See full analysis in §5.

### 3.7 ManageSubmissionsPanel

**Mobile designer:** "This is a small inline pill that exists to surface edit/delete. It is fine. But it lives below the match list — anyone wanting to manage their submissions has to scroll past 12 strangers' UFO reports to get there. Move it to a kebab menu on the DossierHeader pill row."

**Recommendation (V2):** Collapse into a "···" menu on the DossierHeader; remove the standalone section.

### 3.8 ProDossier (Pro flagship)

**Subscription expert:** "The 7-section structure, the section anchors, the 'last refreshed' timestamp — this is built right. The issue is everything *after* it: the Export PDF button (broken — see §6), the Share modal (works but social card composition is naive — see §6.4)."

**Conversion expert:** "What is missing on the Free experience is any sense of what the Dossier *is*. The paywall card at `lab.tsx:759-770` is two sentences and a button. The user has no visual reference. **Inline-render the first one or two sections (Closest Reports, Phenomenology Lineage) using the user's real data, then gradient-mask the rest with the upgrade CTA.** This is the single highest-leverage Free→Pro conversion move on the page."

### 3.9 WatchlistsRail + paywall

**Retention expert:** "Watchlists is the right retention surface — 'I told the Archive what I care about; the Archive comes back to me when something matches.' But for Free/Basic users, the paywall is one body sentence. They cannot picture what a watchlist *is* until they see one. Same recommendation as ProDossier: render a single example watchlist (e.g., 'Triangle UFO within 100mi of you, last 30 days — 2 matches') as a faux-active card with an upgrade CTA on the action button."

---

## 4. Founder concern #1 — Named-match

### 4.1 Does this feature deserve to be MVP?

**Mass-market GTM:** "The median user has watched a Netflix docuseries and submitted one experience. They are not joining a forum; they will not click 'message a stranger about a UFO sighting' cold. The named-match flow as implemented requires the user to (1) opt in to be discoverable per experience, (2) wait for cron, (3) receive an anonymous 'share your account?' card, (4) accept, (5) wait for the other person to accept, (6) open a DM thread. That is a six-step handshake to *maybe* DM a stranger. For 95% of users that ceiling is too high to be worth the engineering."

**Consumer psychologist:** "There is a real psychological draw — *'somebody else saw what I saw'* — but the current copy on `NamedMatchOfferCard.tsx:106-110` does not name it. The card says 'Another account shares 6 of 8 signals' and asks 'Share your account with them?' That is engineering language. The emotional act is **comparing what each of you saw**. The card should lead with *what you would learn from the comparison*, not the cryptography of mutual opt-in."

**Retention expert:** "Disagree — partly. The named-match offer is exactly the kind of event that, when it fires, brings someone back. The bug is not the feature; the bug is the discovery surface. Most users will never have a strong match fire because they have one experience. We need a path for those users too."

**Synthesis (panel majority, 6-2):** Keep named-match in MVP, but **reframe and reposition**. Reframe as "Compare Notes." Reposition so that the offer card is the *consequence* of the user understanding what the comparison gives them — and so that Free users see what compare-notes would feel like via an editorial example (a real but anonymized pre-built comparison from the founder's own seeded eval set).

### 4.2 Rename "named-match offer" everywhere

The phrase "named-match offer" is panel-jargon that leaked into the UI. Replace:

| Current copy | Replacement |
|---|---|
| "Named-Match Offer" (eyebrow) | "Compare Notes" |
| "Another account shares 6 of 8 signals" | "Another contributor saw something similar" |
| "Share your account with them?" | "Open a side-by-side comparison?" |
| "Awaiting the other contributor" | "Waiting for them to accept" |
| "Match accepted — thread open" | "Comparison open — read theirs, share yours" |

### 4.3 What the value prop should actually surface

The founder's instinct is the right one: **DM is a beneficial side effect, not the value.** The value is the comparison itself.

Concrete redesign of the post-acceptance state: instead of immediately opening a DM thread, open a **side-by-side comparison view** — the user's verbatim account on the left, the other contributor's verbatim account on the right, with the 8 shared signals highlighted between them. A small "Send a note" composer lives below the comparison, off by default. Reading is the act; messaging is the optional follow-up.

This is *categorically different* from "a DM with strangers about UFOs" — it is "I get to see how their account compares to mine, signal-by-signal, with my own report on the page." It earns the $5.99.

### 4.4 Free-tier preview

Bake one **editorial Compare Notes example** into the Free experience — a hand-curated, real, anonymized side-by-side from the founder's seeded eval set. Surface it inline in slot 6 instead of the current text-only paywall. Caption: *"This is what a Compare Notes session looks like. Basic surfaces these when the matcher finds another contributor whose account shares strong signal with yours."*

### 4.5 Dissents

- **Subscription strategist:** "Inline-rendering a real Compare Notes example consumes one of your strongest paid surfaces for free conversion. If users can read other people's experiences side-by-side without paying, why pay? *Reply:* the example is hand-curated and static; the live, your-own version is what Basic unlocks. Show one to sell many."
- **Editorial lead:** "Verify with the founder that the side-by-side comparison view is on-brand. It risks pulling the product toward 'social network' if it becomes the dominant interaction. *Reply:* the documentary register is preserved by composition — verbatim accounts on the page, no avatars, no 'reactions,' no thread chrome."

---

## 5. Founder concern #2 — Match list under RADAR

### 5.1 What is wrong

`MatchList.tsx` is the page's largest section by pixel count. On n=1 with 47 returned matches, it renders:

1. Two filter chips (All reports / Nearby)
2. Match-count line ("47 matches · across 200,341 reports")
3. Witness-adjacency callout (when ≥3 corroborated)
4. NewMatchAlertsCard (toggle + expandable preview)
5. Up to 12 inline-expandable cards (each card is ~120px collapsed, ~360px expanded)

This is doing the work of *three different surfaces* — a list browser, a notification opt-in, and a corroboration callout — all stacked vertically. The result is the longest section on the page and the one with the lowest engagement payoff (the user is reading 12 strangers' reports inside their own dossier page).

### 5.2 Layout alternatives

**Option A — "Top 3 + see all" (MVP recommendation):**

```
┌─────────────────────────────────────────────────────────┐
│ Related accounts                          47 in total   │
│                                                         │
│   ● 1998 · Lumberton, NC — 11 mi · 6/8 signals    →    │
│   ● 1997 · Robeson Co., NC — 23 mi · 5/8 signals  →    │
│   ● 1999 · Wilmington, NC — 91 mi · 5/8 signals   →    │
│                                                         │
│ [   View all 47 related accounts   ]   (button)         │
└─────────────────────────────────────────────────────────┘
```

Three rows, no filter chips, no inline expansion. Tap a row → opens the report. Tap "View all" → routes to `/lab/related/<reportId>` (a focused list page that owns the filter chips, the alerts toggle, the witness callout, and the pagination). Page-vs-section split is well-established UX.

**Option B — Sticky right-rail (desktop only):**

On desktop ≥1024px, the match list collapses into a 320px right rail that scrolls independently of the main column. The main column reclaims its full attention on the dossier + comparative surfaces; the match list becomes glanceable rather than wall-blocking.

**Option C — Tabbed bottom dock:**

A persistent bottom strip with "3 strong · 14 nearby · 30 in archive" counts. Tap to expand into a half-sheet overlay. Most aggressive option; biggest behavior change.

**Panel verdict:** **Option A is MVP.** Option B is the desktop addition in V2. Option C is too invasive for MVP — revisit if engagement metrics show users want the list more present.

### 5.3 Ranking change

The current ranking is "overall similarity descending" via `match_score` from the constellation RPC. Two changes:

1. **Demote "all 47" to "top by composite + diversity"** — the top 3 surfaced should be one strong-by-geography, one strong-by-temporal, one strong-by-descriptor when possible. The current ranking surfaces three near-duplicate matches at the top, which feels redundant.
2. **Surface "New since you were last here" first** when applicable. This is the retention hook.

### 5.4 Witness-adjacency callout

The callout ("3 other people have described something like this. None of you knew each other.") is one of the strongest emotional payoffs on the page — keep it, but **move it to slot 2**, immediately under the DossierHeader. Currently it is buried at slot 9 inside the MatchList. The witness-adjacency *feeling* deserves to land before the comparative surfaces, not after.

### 5.5 NewMatchAlertsCard

This belongs on the focused-list page (the "View all 47" destination), not inline on the dossier scroll. Move it.

---

## 6. Founder concern #3 — Basic + Pro value not landing

### 6.1 Why it doesn't land today

The Free experience shows **two paywall surfaces** total (named-match teaser at `lab.tsx:643`, Pro Dossier paywall at `lab.tsx:760`, plus Watchlists paywall at `lab.tsx:781` — three) and each is the same `LabPaywallSurface` component: a kicker eyebrow, two sentences of body, a button. The user is being asked to believe a 2-sentence pitch.

**Conversion expert:** "The whole product has a Show-Don't-Tell problem on the paid tiers. Users buy what they can see; right now we are telling them what they would buy."

### 6.2 Concrete signals that would change Free→Basic conversion

1. **Pre-rendered Compare Notes example** (see §4.4) — one editorial side-by-side using the user's real category, hand-curated to be evocative.
2. **A real "5 people in your county" count** rendered live on the Free experience: *"5 other people in central North Carolina have logged triangle sightings. 2 of them this year. [unlock to see them]"* — the count is real, the names are gated.
3. **Watchlist demo card** showing one pre-built watchlist matching the user's experience: *"Triangle UFO within 100mi of [your location], last 12 months — 4 matches. [unlock]"*
4. **A live "edition number" on the dossier preview** — "Your Dossier would be Edition I. Pro contributors here are on Edition VII." Sets the user's expectation that this is a thing that accumulates.

### 6.3 Concrete signals that would change Basic→Pro conversion

The Basic user already sees the Dossier paywall and the Watchlists paywall, but they have no in-product touchpoint with either. Two specific moves:

1. **The Pro Dossier teaser, when shown to a Basic user, should render the first two sections fully (Closest Reports + Phenomenology Lineage) using the Basic user's real data**, then mask the remaining five with a soft gradient and an inline upgrade CTA. The user *sees* their own Dossier in progress. They are not buying a category; they are buying the rest of the artifact they can already see.
2. **Watchlist preview should surface a single auto-generated watchlist** based on the Basic user's submitted experience, marked "Sample — Pro unlocks edit + alerts": *"Triangle UFO within 100mi of Lumberton, NC."* They see what the surface looks like.

### 6.4 The PDF and share card as conversion artifacts

The PDF and share card are not just *features* — they are the user's external evidence of having paid. Treat them as such:

- The share card (currently 1080×1350, generated server-side at `dossier-render.ts:41-97`) should appear *inline on the Pro Dossier viewer*, not behind a "Share" modal button. A user looking at their Dossier should see, mid-page, "Here is your shareable card" with the rendered image — so they can imagine posting it.
- The PDF should have a clear cover preview thumbnail above the "Export PDF" button — a 200×280 mini render of the first page so the user knows what they're about to download.

### 6.5 Dissents

- **Editorial lead:** "Show-don't-tell can collapse into pitch-y in a documentary product. Be sparing — three inline previews max, not seven. Otherwise the page reads like a sales sheet."
- **Mass-market GTM:** "Free→Basic at $5.99 is the conversion that matters. Basic→Pro at $14.99 will be ≤10% of Basics. Don't over-invest in Basic→Pro Show-Don't-Tell; do invest in Free→Basic."

---

## 7. Founder concern #4 — The PDF dossier

### 7.1 What we found

The export route at `src/pages/api/lab/dossier/[id]/export-pdf.ts:45` returns:

```
Content-Type: text/html; charset=utf-8
Content-Disposition: inline; filename="paradocs-dossier-<id>.html"
```

It is HTML, not a PDF. The user clicks "Export PDF" in the Pro Dossier viewer; the browser opens an HTML tab; the user must manually Cmd+P → "Save as PDF." That is a broken promise on a $14.99/mo flagship.

The rendered HTML in `src/lib/lab/dossier/dossier-render.ts:240-309` further suffers from three layout bugs:

1. **`max-width: 480px; margin: 24px auto`** on `body` (line 247) competes with `@page { size: A5; margin: 18mm; }` (line 246). When printed to A5, the body is locked to 480px wide — about 80mm — leaving the right half of every A5 page blank.
2. **Section dividers use `page-break-after: always`** on every `.page` (line 252), so every single subsection gets its own page. With 7 sections + title + TOC, the document is **9 pages minimum**, most of them with under 1/3 of the page filled.
3. **`.big-stat` at `48pt`** (line 262) for the rarity percentile is jarring beside a body sized at default ~13pt. The hierarchy isn't documentary; it's PowerPoint.

Beyond layout: the document carries no imagery, no map tile, no histogram. It is a wall of citations and prose. For a "museum acquisition report" register, that is wrong — the museum tag is the *image* of the artifact alongside the catalogue text.

### 7.2 Specific fixes

**MVP — make it a real PDF:**

1. Add `puppeteer-core` + `@sparticuz/chromium` to `package.json` (the code's own comment at `export-pdf.ts:10-14` already plans this). Bump the Vercel function timeout to 30s. Render the HTML through headless Chrome to a Buffer, return as `application/pdf`. Standard pattern; ~150 LOC.
2. Fix the print stylesheet: drop the screen `max-width: 480px` entirely. Use `@media screen { body { max-width: 720px; ... } }` and `@media print { body { max-width: none; ... } }`. The A5 page geometry then controls width.
3. Drop `page-break-after: always` from `.page` — use it only on the title page, TOC, and section boundaries that actually need it. Let sections flow.

**MVP — typographic rebuild:**

The current stylesheet is at `dossier-render.ts:245-267`. Replacements:

- Body: Garamond / EB Garamond (the documentary serif) at 10.5pt with 1.45 line-height — feels like a monograph.
- Section heads: Trajan-substitute (small-caps Cinzel from Google Fonts is free) at 14pt centered, with a thin rule below. Drop Changa One in print — Changa One is screen-display brand chrome, wrong register for a printed book.
- Drop brand purple from the print stylesheet entirely or reduce to a single accent at title-page and footers. Print serif documents in two-color (black + a single muted accent) read as documentary; full brand purple reads as marketing.
- Citations in 9pt Garamond italic, not monospace Courier. Monospace is a code register, not a documentary one.
- Folio numbers: Trajan small-caps roman numerals on the title block, arabic numerals in the body. This is a small detail but it earns the "book" promise.

**MVP — add the map tile + temporal histogram:**

The Pro Dossier has the data — `geographic_neighbors` and `temporal_neighbors` are full payloads. Render each into a small SVG inline in the PDF (use the same `renderShareCardSvg` SVG-builder pattern, or a `d3-geo` static render for the map). A documentary print page with text + a small map plate is the standard register.

**Should-do — switch to React-PDF or a templated approach:**

The current hand-built HTML string in `renderDossierPrintHtml` is fragile (every layout change is a string concat) and gives you nothing for free. The panel split 4-4 on whether to ship Puppeteer (fix in place) or migrate to `@react-pdf/renderer`:

- **Puppeteer (Subscription, Conversion, Mass-market, Editorial):** Fastest MVP path. Re-use the HTML rendering work. Get a real PDF this sprint.
- **React-PDF (Mobile, Desktop, Retention, Consumer-psych):** Component model maps to the 7 sections cleanly. No layout bugs from CSS print mode. Better long-term ergonomics. Slower MVP (~1 week port).

**Panel verdict:** **Puppeteer for MVP** (this is the explicit "fix the broken promise" sprint). **Plan the React-PDF migration as a V3 follow-up** once the layout has stabilized.

### 7.3 Cover page redesign

Currently the cover page is just an h1 + a colophon line on page 1 of body content (`dossier-render.ts:271-278`) — there is no visual. Replace with:

- Full-bleed title page with no body text.
- Top third: small-caps "FROM THE PARADOCS ARCHIVE" eyebrow (10pt, letter-spaced).
- Center: the experience title in 28pt Cinzel small-caps, location and year beneath in 14pt italic.
- Bottom third: a thin pen-line rule, then the colophon ("Dossier computed [date] from the Paradocs Archive of [N] reports") in 9pt italic.
- No purple, no icons, no Changa One. White-on-cream is acceptable for the title page; the body returns to black-on-white.
- Generation date and edition number in roman numerals at the bottom of the title page.

### 7.4 Page count budget

Target: **6-10 pages for a real n=1 experience**. Title + TOC + 7 sections × ~1 page each, with one section spilling to 2 pages when the closest-reports list is long. Currently we are emitting 9 pages of mostly-blank A5 because of the page-break and max-width bugs; a real PDF with the fixes above should be the same page count *full of content*.

### 7.5 Share card

The 1080×1350 share card at `dossier-render.ts:41-97` works as raw SVG but the composition has two specific weaknesses:

1. **`wrapSvgText` is naive** (line 99) — approximates 12px per char and word-wraps. For long rarity-text strings it produces awkward line breaks. Use the actual SVG `<foreignObject>` with an inline HTML span (Sharp + librsvg supports it) or pre-compute line breaks server-side with a real text-metrics library.
2. **The "180pt percentile number" centered** (line 80) reads as a sports stat, not a documentary fact. Smaller (110pt), with the explainer wrapped *around* it rather than below. Or: drop the giant percentile and lead with the closest-report distance ("11 mi · 1998") — that is the emotional fact, not the percentile.

---

## 8. Mobile vs. desktop divergence

### 8.1 Mobile (≤640px)

**Mobile UI/UX designer:**

- **Scroll length is the dominant issue.** 6,400px is too long. Implementing the §5.2 Option A match-list collapse alone reclaims ~3,000px.
- **No bottom-sheet nav.** The page header has Submit Report + Settings only; there is no jump-to-section affordance. Add a small floating chip at the bottom-right ("Jump to: Patterns / People / Pro") that opens a bottom sheet with section anchors.
- **DiscoverabilityToggle is on a row by itself** (`lab.tsx:664-672`) — that whole row is one toggle with a tiny eyebrow label. Move it into the DossierHeader's overflow menu; it does not deserve a full row.
- **The "Yes, share" / "Not now" CTAs on NamedMatchOfferCard** are correctly sized (≥44px). Keep.
- **GeographicSurface map height** — verify the map is not stuck at a height that creates a vertical scroll trap inside the parent scroll (this has historically been a MapLibre footgun).

### 8.2 Desktop (≥1024px)

**Desktop UI/UX designer:**

- **Single-column 3xl-max layout wastes 60% of horizontal viewport.** Recommend a two-column layout above lg: DossierHeader spans both columns; below it the left column holds the comparative surfaces (Temporal + Geographic side-by-side), the right column (320px) holds Hints + collapsed Match List + Manage menu, sticky.
- **Hover affordances are absent.** Match cards on hover should preview the full report inline rather than expand-to-open. Reduces the scroll cost of browsing matches.
- **The CrossExperienceHeader, when present, should pin** to a sub-nav strip on desktop scroll, not stay at the top of the dossier.
- **The Pro Dossier section anchors** (left rail per `PRO_TIER_VALIDATION_V3` §3.2) are *not* currently implemented. They should be on desktop only.

---

## 9. Open questions for the founder

1. **Compare Notes side-by-side view — on-brand or off-brand?** The panel's reframe in §4 introduces a new surface (the verbatim-on-verbatim comparison view). It is a categorically different surface from the current "DM with a stranger" path. Verify this is the right product direction before we build it.
2. **PDF: Puppeteer (this sprint) or React-PDF (next sprint)?** Panel split 4-4. Both ship a real PDF; Puppeteer is faster, React-PDF is more durable.
3. **Free-tier inline previews — how many and how prominent?** The panel recommends three (Compare Notes example, Dossier inline preview, Watchlists demo card). Editorial dissent flagged this as risking a sales-sheet register. Founder taste call on the count.
4. **Witness-adjacency callout — move to slot 2 or keep in MatchList?** Currently buried at slot 9. Promoting it to slot 2 changes the emotional shape of the page. Recommended yes; flagging because it is a notable composition change.
5. **Match list — soft destination page (`/lab/related/<reportId>`) or modal sheet?** The panel recommends a destination page (better URL, shareable, indexable). Modal sheet is faster to build. Founder call.
6. **Cross-experience "Since you were last here" line — what's the minimum data freshness?** Recommend daily corpus delta; nightly cron already exists. Confirm the cadence.

---

## 10. Prioritized backlog

### MVP (ship this sprint, ≤2 weeks)

1. **PDF: make it real.** Add puppeteer-core + @sparticuz/chromium, render server-side, fix the print stylesheet (kill the 480px max-width, fix page-break logic, restyle typography to documentary register, add cover page, add map tile + temporal histogram inlines). `src/pages/api/lab/dossier/[id]/export-pdf.ts`, `src/lib/lab/dossier/dossier-render.ts`.
2. **MatchList collapse to "Top 3 + see all" with a focused destination page.** Move the witness-adjacency callout to slot 2 under DossierHeader. Move NewMatchAlertsCard to the destination page. `src/pages/lab.tsx`, `src/components/lab/MatchList.tsx`, new `src/pages/lab/related/[reportId].tsx`.
3. **Rename "named-match" → "Compare Notes" everywhere user-visible.** Update copy in `NamedMatchOfferCard.tsx`, `NamedMatchOffersRail.tsx`, `LabPaywallSurface.tsx` callsites in `lab.tsx`, the inline label on the discoverability toggle.
4. **Reframe the Compare Notes card body** from engineering language to "you'll be able to read each other's accounts side-by-side." Anchor the value on the comparison, not the DM.
5. **Side-by-side comparison view at the accepted state.** When both parties accept, the surface opens to a two-column read-both view rather than a DM thread. DM lives in a collapsed composer below. `NamedMatchOfferCard.tsx`, `DMThreadView.tsx` (rework), possibly a new `CompareNotesView` component.
6. **TemporalStrip + GeographicSurface side-by-side on md+** via grid wrapper. `src/pages/lab.tsx`.
7. **Move DiscoverabilityToggle into a "···" menu on the DossierHeader.** Remove the standalone row. `lab.tsx:664-672`, `DossierHeader.tsx`.

### V2 (next sprint, ~1 month)

1. **Free-tier inline previews:** one Compare Notes editorial example, one Pro Dossier preview (Sections 1+2 rendered, rest masked), one auto-generated Watchlist demo card.
2. **Single anchor nav at top of My Record** (desktop right rail, mobile bottom-sheet chip).
3. **Desktop two-column layout above lg.**
4. **Pro Dossier section anchor rail (left rail, desktop only).**
5. **CrossExperienceHeader "Since you were last here" line.**
6. **Hints rail: visual weight reduction** — 1 prominent card + "More from the catalogue" link.
7. **Inline share-card render on Pro Dossier viewer** (currently behind a modal).
8. **Cover thumbnail preview** above the PDF Export button.

### V3 (next quarter)

1. **React-PDF migration** for the Dossier export (replaces puppeteer; more durable architecture).
2. **Witness-adjacency expansion:** when ≥5 corroborate, surface a small clustered map on the witness-adjacency card showing all corroborators' locations as anonymized dots.
3. **Hover-preview affordances** on match-list cards (desktop).
4. **Compare Notes "thread snapshot"** — the user can save a side-by-side comparison as a private artifact in their Record, separate from the DM thread.
5. **PDF edition diff page** — when Edition VIII is generated, the cover page lists "What changed since Edition VII" using the existing edition-diff logic from `PRO_TIER_VALIDATION_V3` §3.5.

---

*— The Panel*

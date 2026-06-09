# UI Shipping Roadmap — Synthesis of 8+ Panel Memos

**To:** Chase
**From:** Roadmap synthesizer (June 2026)
**Re:** One prioritized plan an engineer can execute against, drawn from `MY_RECORD_SME_META_REVIEW.md` (V5, the spine), `CROSS_SURFACE_COHERENCE_AUDIT_V2.md` (V2 cross-surface), `MY_RECORD_DEFERRED_DECISIONS.md` (3 deferred votes), `PHENOMENA_PERSONALIZED_SECTIONS_DECISION.md`, `MY_RECORD_COMPETITIVE_TEARDOWN.md` (V4), and the V1-V3 superseded audits (read only to confirm Sigil + Casebooks are dead).
**Posture:** Synthesis only. No new ideas. Every recommendation cites a locked memo + section.
**Founder constraints preserved verbatim:** Free / Basic $5.99 / Pro $14.99 — Ancestry-for-paranormal frame — Mass-market "I saw something" demographic — Documentary register (austere, archival) — Mobile-first — Haiku 4.5 for all AI, OpenAI fallback (text-embedding-3-small approved) — No AI image gen — No commits from workspace shell (operator commits locally) — Background work running: NUFORC ingest (~162h ETA), Copyright Sprint 2 regen batch (~2-6h), classifier-daily cron (04:00 local).
**Word budget:** ~5,000.

---

## 1. Executive summary

Sprint 1 is an *addition* sprint (V5 §4.4), not a subtraction sprint: the cuts land alongside the v0 of the `MatchRevelation` canvas — the world-class component that gives Free users their first Ancestry-style "wow." Without it, Sprint 1 reads "mid" exactly the way V4 read mid to the founder. Sprint 2 is the heavier social + cross-surface lift: per-comparison comments on `/lab/compare/[a]/[b]`, the Phenomena personalized-sections re-skin, the floating `+ Submit` pill, server-decided landing, bottom-nav badges, and the Pro Dossier inline preview on Free/Basic. Sprint 3 is recurring-drop framing, push-permission scaffold, sticky right-rail nav, and the Year-in-Record artifact ground floor. Locked decisions cover three deferred votes (Match Revelation voice, Pro drop push, Hints cadence), Phenomena personalized-section fate (HYBRID), the PDF kill, the SourceBlock cleanup (Copyright Sprint 1 already shipped — drop from this roadmap), and ten-plus cross-surface integrations. Pre-condition: the Copyright Sprint 2 Haiku regen batch (~2-6h) must finish before *any* narrative-touching UI work goes near re-rendered prose; the NUFORC ingest is independent and safe to run beneath all sprint work; classifier-daily cron at 04:00 is also independent. Three commit cadences per sprint (~3-4 PRs) keep the operator able to revert any one move. Three open founder taste calls remain: Basic price ($5.99 locked but instrumented), Submit-pill copy ("+ Submit" recommended), Year-in-Record cadence (recommend personal anniversary, not calendar). Brand drift is the single biggest risk: Helena copy review is mandatory on every text surface in §4-§6.

---

## 2. Decisions inventory

Every locked decision found across the eight memos, with source + status + surface + dependencies.

| # | Decision | Source | Status | Implementation surface | Dependencies |
|---|---|---|---|---|---|
| D1 | `MatchRevelation` canvas replaces inline MatchList + RadarSurface; one foregrounded match + two secondary; signal-ribbon; Pattern Line deferred to Sprint 2 | V5 §4.1, §4.4 | LOCKED | new `src/components/lab/MatchRevelation.tsx`; mounts in `src/pages/lab.tsx` at the slot of the current MatchList | `/api/constellation/match` payload already exists |
| D2 | Match Revelation voice: third-person archival headline + second-person body ("You and this contributor share…") + verb-first CTA | DEFERRED_DECISIONS §Vote 1 | LOCKED | copy in `MatchRevelation.tsx`; Helena copy pass | none |
| D3 | Today special card `MatchRevelationCard` injected at position 2 when a new high-rarity match fires; *third-person voice* (different from My Record canvas) | V2 §3.1; V2 §10 (founder pick voted hybrid via DEFERRED_DECISIONS §1) | LOCKED | new card type in `src/pages/discover.tsx` feed loop + new component | depends on D1 data shape |
| D4 | Per-report public comments — mounted on `/lab/compare/[a]/[b]`, NOT on lone-report page | V5 §4.2, V2 §5.3, DEFERRED §4.2 | LOCKED | new `comparison_comments` table; new section on compare page; Basic+ write, Free read | new migration; Helena composer prompt review |
| D5 | "Account N of M" eyebrow on DossierHeader ("Your record · Account 1 of 1 · Last updated …") | V5 §2.2; V2 §2.1 confirmation banner | LOCKED | `src/components/lab/DossierHeader.tsx` ~30 lines JSX | none |
| D6 | "200,000 catalogued accounts" eyebrow on /lab empty-state, /explore Phenomena header, Today header | V5 §2.1, V2 §3.1 + §3.2; founder note in V2 §6.2 | LOCKED | new `/api/public/stats` consumer in three places | depends on `/api/public/stats` returning {accounts, archives}; Helena copy review of mobile collapse |
| D7 | Hints become standing offers with resolve actions (Accept / Save / Not mine), not just dismiss; show unresolved count in chrome | V5 §2.3, V5 §7 #5 | LOCKED | `src/components/lab/HintsRail.tsx` + new `/api/lab/hints/[id]/resolve` endpoint | small migration: `hint_resolutions` table |
| D8 | Hints-on-Today cadence: HYBRID — Rule 1 per-session if ≥3 unresolved and at least one unseen, Rule 2 14-day suppression per Hint, Rule 3 staleness re-surface if oldest Hint >14d and user hasn't visited /lab in 7d | DEFERRED_DECISIONS §Vote 3 | LOCKED | server logic in feed injection on `src/pages/discover.tsx`; suppression keyed via `hint_today_impressions` table | depends on D7 (resolve actions) |
| D9 | Pro drop push notifications: default-on with *consent-with-context* dialog immediately after Pro upgrade | DEFERRED_DECISIONS §Vote 2 | LOCKED | new post-upgrade onboarding dialog; new `notification_preferences` row | Sprint 3+ |
| D10 | Phenomena personalized sections: HYBRID — `For You` re-skinned as `Phenomena across your interests` (phenomenon-typed, stays); `Near You` moves to Today only; `Because You Saved` moves to My Record as "From your saves" rail | PHENOMENA_PERSONALIZED §1, §3 | LOCKED | `src/pages/api/feed/personalized.ts` ~80 line delta; `src/pages/explore.tsx` (no structural change); new "From your saves" rail on `src/pages/lab.tsx` | none |
| D11 | feedSections RE-SKIN (not kill) on Phenomena Browse — rails named catalogue-y, never personal-y | V2 §3.2, V2 §8 (V1 reversal); PHENOMENA_PERSONALIZED §3 | LOCKED | `src/pages/api/feed/personalized.ts` rail titles; `src/pages/explore.tsx:1410-1563` only icon swap | none |
| D12 | Kill PDF export of Pro Dossier; replace with share-card PNG (already half-built) | V5 §1.5 + §7; V4 §6 | LOCKED | delete `src/pages/api/lab/dossier/[id]/export-pdf.ts` + "Export PDF" button in ProDossier; keep `share-card.png` | none |
| D13 | Kill RadarSurface entirely | V4 §3 + §7; V5 §1.6 (replaced by Match Revelation) | LOCKED | drop import + render in `src/pages/lab.tsx:685-695`; delete `src/components/lab/RadarSurface.tsx` once orphaned | depends on D1 |
| D14 | Kill MatchList inline-expanded 12-card body; collapse to "See all 47" link on Match Revelation canvas; full list at new `/lab/related/[reportId]` page | V4 §3 + §7 #3; V5 §7 #9 (see all link) | LOCKED | drop MatchList section in `src/pages/lab.tsx:712-723`; create `src/pages/lab/related/[reportId].tsx` that reuses MatchList component | depends on D1 |
| D15 | Kill 1:1 DM mechanic: drop `NamedMatchOffersRail`, `DMThreadsList`, `DiscoverabilityToggle`, `NamedMatchOfferCard` from My Record (backend tables retained one release for safety) | V4 §3 + §8; V5 §7 "Cut for good" | LOCKED | drop imports + section in `src/pages/lab.tsx:643-680` | comments mechanic (D4) must ship same release |
| D16 | Kill `CrossExperienceHeader` as standalone section; collapse to DossierHeader eyebrow at n≥2 | V4 §3 + §8 | LOCKED | drop section in `src/pages/lab.tsx:584-593`; extend DossierHeader eyebrow | none |
| D17 | Kill TemporalStrip empty-state placeholder when distributions are null | V4 §3 + §8 | LOCKED | conditional render in `src/components/lab/TemporalStrip.tsx` | none |
| D18 | Kill in-lab duplicate notification bell (`lab.tsx:547-552` "coming soon") | V4 §8; V2 §9 kill list | LOCKED | drop button | none |
| D19 | Kill in-lab "Submit Report" pill in header; replace with global floating `+ Submit` pill | V2 §6.6, §4; V2 §9 kill list | LOCKED | drop pill in `src/pages/lab.tsx:540-547`; new `<SubmitPill>` mounted in `Layout.tsx`/`MobileBottomTabs` area | floating pill component must ship same release |
| D20 | Floating `+ Submit` pill on Today + Phenomena; suppressed on `/lab`, `/start`, modals | V2 §4 (full spec) | LOCKED | new `src/components/global/SubmitPill.tsx`; mounted in `Layout.tsx` | suppress logic via `useRouter().pathname` |
| D21 | Phenomena sub-tabs (Map/Browse/Search) KEEP; collapse strip to icon-only on scroll-down (V2 §3.2 chrome fix deferred to Sprint 3) | V2 §1(c), §3.2, §8 | LOCKED Sprint-3 chrome fix; Sprint-2 *no change* to IA | `src/pages/explore.tsx` Sprint-3 only | none |
| D22 | Server-decided homepage redirect via `/api/user/landing`; no A/B | V2 §1(a), §2.2 | LOCKED | new `src/pages/api/user/landing.ts`; ~40 lines in `src/pages/index.tsx` | depends on D7 (Hints resolve state read) |
| D23 | LabPromo card → tier-and-state-aware variants (free_active / free_empty / basic_hints / pro_drop); rename wordmark "Lab" → "Your Record" | V2 §7 (4 variants) | LOCKED | rewrite `src/components/discover/LabPromo.tsx`; extend `/api/lab/promo/should-show` to return `variant` key | small backend change |
| D24 | Bottom-nav tab badges (unresolved Hints on My Record; new matches; etc.) via `/api/user/tab-badges` | V2 §11 #10 (V1 §6.4 endorsed) | LOCKED | new endpoint; update `src/components/mobile/MobileBottomTabs.tsx` | none |
| D25 | Sticky right-rail nav on My Record (desktop) / bottom-sheet chip on mobile; anchors Report · Map · Notes · Pro Dossier | V4 §3 + §7; V5 §7 V2 backlog | LOCKED Sprint-2 | new component; mount in `src/pages/lab.tsx` | none |
| D26 | Pro Dossier inline preview on Free/Basic — first 2 sections + gradient mask | V4 §5 + §7; V5 §4.3 | LOCKED Sprint-2 | extend `src/components/lab/ProDossier.tsx` to render gated preview | none |
| D27 | Non-matcher fallback surface — fires after 72h indexing with zero high-confidence matches; "Your account is rare" copy + geographic-only fallback view | DEFERRED §4.1 | LOCKED | new state in `MatchRevelation.tsx` keyed on engine result | depends on D1 |
| D28 | Year-in-Record artifact: in-app vertical-card story (8-12 cards) + share-card PNG; personal anniversary cadence (not calendar) | V5 §4.5; V4 §6 | LOCKED Sprint-3 | new `src/pages/lab/year-in-record/[year].tsx`; reuses share-card pipeline | none |
| D29 | Standing-searches rename of Watchlists ("Standing searches"); Pro-tier unchanged | V4 §3 + §5 | LOCKED | string-only renames in `WatchlistsRail.tsx`, `WatchlistEditor.tsx`, paywall copy | none |
| D30 | Pro recurring-drop framing on Dossier ("This month's lens"); 12 lenses cycled; no email by default | V5 §4.5; V2 §11 #18 | LOCKED Sprint-3 | re-present existing Dossier sections in `ProDossier.tsx`; new "Past chapters" roll | none |
| D31 | Copyright Sprint 1 changes (SourceBlock Tier 2, /sources, /dmca) — SHIPPED. Drop from this roadmap. | Task #206 completed | SHIPPED | already in `main` | n/a |
| D32 | Resume-draft banner on My Record when user has saved /start draft | V2 §3.3 | LOCKED Sprint-2 | new banner above DossierHeader; reads localStorage + draft table | depends on draft persistence already in /start |
| D33 | Saved-from-Today pile-rail on My Record between HintsRail and TemporalStrip | V2 §3.3, §11 #15 | LOCKED Sprint-3 | new rail in `src/pages/lab.tsx`; reads `saved_reports` table | none |
| D34 | "And N contributors whose accounts match yours also reported this phenomenon" extension to `YourSignalForPhenomenon` | V2 §3.2, §11 #9 | LOCKED Sprint-2 | extend existing phen-page component; Free sees count, Basic+ taps through | none |
| D35 | Spotify Blend analog ("Shared Pattern Line" between two users on mutual opt-in) — DEFERRED to V3 backlog | DEFERRED §4.5 | DEFERRED V3 | not in roadmap | n/a |
| D36 | Groups / iNat Projects — DEFERRED behind 60-day median-comments-per-comparison metric (≥4 = build, else hold) | V2 §5.4, V4 §7 Sprint 3 | DEFERRED | not in roadmap | metric only |
| D37 | Move `ClusteringCard` from Today to Phenomena (relocate, not kill) | V2 §3.1 kill list | LOCKED Sprint-2 | remove from `src/pages/discover.tsx`; mount on `src/pages/explore.tsx` Phenomena Browse | none |
| D38 | Kill `TodayGridMode` (desktop overlay), in-Today search overlay, body scroll-lock, hardcoded fallback stats | V2 §1 + §9 kill list | LOCKED Sprint-2 | drop imports + UI in `src/pages/discover.tsx` | `/api/public/stats` for the fallback replacement |
| D39 | Kill `AskTheUnknown` perma-widget on Phenomena (mode!=='map'); relocate to homepage hero or kill | V2 §9 kill list | LOCKED Sprint-2 | drop in `src/pages/explore.tsx` | none |
| D40 | Sigil concept REJECTED (V2 panel) — no resurrection | V1/V2 audit; V5 §7 "Cut for good" | DEAD | n/a | n/a |
| D41 | Casebooks REJECTED (V3 panel) — no resurrection | V1/V3 audit; V5 §7 "Cut for good"; DEFERRED §4.5 | DEAD | n/a | n/a |

**Open founder taste calls** (decisions still pending, do *not* implement until founder picks):

| # | Question | Source |
|---|---|---|
| O1 | Basic price A/B ($5.99 vs $3.99) — founder LOCKED $5.99 with instrumentation | DEFERRED §4.3; founder note locked |
| O2 | Match list "See all 47" destination page design — V2 said yes, didn't design it | V5 §4.1 + §7 #9 |
| O3 | Submit-pill copy ("+ Submit", "+ Add account", "+ Your account") | V2 §10 dissent 4; V2 §4 spec is "+ Submit" |
| O4 | Year-in-Record cadence (calendar year vs. user anniversary vs. November) | V5 §4.5; recommends anniversary |
| O5 | Pro drop notification copy — Helena to draft both default-on and opt-in variants in case of flip | DEFERRED §2 |

---

## 3. The user journey map

Five stages. Each names the specific surfaces, the framing, what we control vs. what's external, and where the user drops off.

### Stage 0 — Discovery (external; we own only the destination)

The 47-year-old aunt in Sandusky lands on Paradocs through one of three plausible orbits: (a) a Google search for "what did I see in 2003" or "ufo near me" — landing on a `/phenomena/[slug]` page or a `/report/[slug]` page surfaced by SEO; (b) a friend's Instagram screenshot of a quiet share-card — landing on `/` (marketing homepage); (c) a Netflix-doc orbit (UFOs of the West Texas, Encounters, etc.) — landing on `/` after a "is there a database for this" search.

What we control: the destination quality. The `/` hero (V2 §2.1) carries the 200K cue, one image, two CTAs. The SEO-landed `/phenomena/[slug]` and `/report/[slug]` carry the documentary register; the SourceBlock attribution (Copyright Sprint 1 shipped) gives them credibility on first contact. What we don't control: any of the channels above. Flag as future research: which of the three orbits actually delivers users (we don't have channel attribution yet).

**Risks / drop-offs:** if the SEO-landed report page has any conspiratorial register slip, she closes the tab in under sixty seconds (V5 §3 Helena). The currently-shipped pages are documentary; do not regress.

### Stage 1 — First visit, unauthenticated (~30 seconds → 2 minutes)

She lands on `/`. First 30 seconds: hero loads with the 200K eyebrow ("200,000 documented accounts. Anyone can read it. Anyone can add to it."), a single SVG below the hero, primary CTA "Add yours →" (routes to `/start`), secondary CTA "Read the catalogue →" (routes to `/discover`). Mobile-first: 56pt-tall primary CTA in thumb zone (V2 §2.1).

What pulls her to create an account: nothing yet — at this stage we want her to *taste the catalogue*, not convert. She taps "Read the catalogue." She lands on `/discover` (Today). She swipes 3-5 cards (TikTok grammar, V2 §3.1 kept). One of the cards is an `OnThisDateCard` at position 1; one is a corpus-rare report from the 1990s in eastern NC (proximity to her own); after card 5-7, the re-skinned `LabPromo` (D23, `free_empty` variant) fires: *"The archive is missing one account: yours. — Add your account →"*. That card is the conversion ask. Below that card she gets a few more swipes, then an end-of-feed signup soft-wall.

What we control: every card she sees. What we don't: how many swipes she will give us before bouncing (no current empirical data; instrument and learn).

**Risks / drop-offs:** mass-market patience cliff is ~3-5 swipes (V5 §3 Maya). If the first three cards are *all* aggressive or off-register, she's gone. The LabPromo `free_empty` variant must fire *after* she's seen at least 3 catalogue cards — Naomi's rule (V2 §3.1 Today): wow precedes ask.

### Stage 2 — Account creation + first submission (~3-5 minutes)

She taps "Add your account" on the LabPromo card. Lands on `/start`, the 6-step in-page state machine (already shipped, V2 §2.1). Step 1 (experience): single textarea + 9-chip category strip, chips reveal only after typing (IKEA-effect, V2 §2.1). Step 2 (account): email + handle, one field per screen on mobile (Duolingo single-field-per-step pattern). Step 3 (check-email): magic link, OTP fallback after 30s (V2 §2.1). Step 4 (submit, post-auth): full report. Step 5 (reveal): **THE WOW** — the first `MatchRevelation` card fires (V5 §3 Priya: "the single most important UX moment in the product"). Headline third-person: *"Three catalogued accounts share corpus-rare signals with yours."* (V2 §3.1). Body second-person: *"You and this contributor share descriptor `static-tingling`, decade 1990s, cluster eastern-NC, hour-band vespers. Fewer than 30 reports in the catalogue share this triple."* (DEFERRED §1 hybrid voice). CTA: *"Open the comparison →"*. Step 6: handoff to `/lab`.

What we control: every step. What we don't: the matching-engine latency. V2 §2.1 resolution: if match hasn't computed in 8s, show "the archive is still indexing your account against 200K records" placeholder; route her to `/lab` with a *"we'll notify you the moment it does"* line (Zeigarnik: unfinished task anchors return). Push permission ask happens at Step 6, NOT before (Sana iron rule, V2 §2.1).

**Non-matcher path (D27):** ~11% of submitters return no high-confidence match after 72h. Surface fires *"Your account is rare. After 72 hours indexing your account against 200,000 catalogued records, the archive found no close match. Your account joins a small group: roughly 11% of catalogued accounts are corpus-singletons. Yours is one of them. The archive keeps watching."* (DEFERRED §4.1.) Geographic-only fallback view ships in same release.

**Risks / drop-offs:** Step 1 bare-textarea anxiety, Step 3 magic-link gap, Step 5 latency >8s, push-prompt asked too early. All mitigated above. The single biggest brand-drift risk is *the matching engine surfacing an obvious match* (e.g., "you both saw a triangle"). The engine must prioritize *corpus-rare overlaps* (DEFERRED §4.1 load-bearing engine spec). Out-of-scope for UI roadmap; flagged for engine work.

### Stage 3 — First return (D1-D7)

What brings her back: the D1 push notification (V2 §2.1) — *"Your first Hint is ready."* Routes to `/lab?focus=hint-{id}`, not `/discover` (server-decided landing, D22). She lands on My Record. First thing she sees: the DossierHeader with the new "Account 1 of your record · Last updated 4 June 2026" eyebrow (D5); the HintsRail directly beneath, with the new resolve actions (D7) — "Accept · Save for later · Not mine." She resolves one (Naomi: completion bias). Below: the GeographicSurface (unchanged), the Match Revelation canvas (D1), the comparison link.

What she DOES on the return: resolves 1-2 Hints, opens 1 comparison, reads it, maybe doesn't comment (DEFERRED §4.2: ~10-20% of Basic users post in first 30 days). What we control: the chrome, the resolve actions, the variable-reward schedule (Hints arrive within 24h but at unknown moment, V2 §2.1 Naomi).

**Risks / drop-offs:** if push permission was declined at Step 6, she may never return. Fallback: email-based "first Hint ready" notification (operator should verify the email pipeline still works — not panel-spec'd; flag as engine work).

### Stage 4 — Established user (D7-D30+)

Daily loop: Today + My Record. The re-skinned `LabPromo` (D23) now fires `free_active` variant if she's saved ≥3 reports: *"Your record begins. You've saved 3 reports this week. See which catalogued accounts match the signals you keep returning to — in your record."* If she has unresolved Hints (≥3) AND hasn't seen them on Today, the Hints-on-Today special card fires at position 4 (V2 §3.1, D8 Rule 1). If a Hint is >14 days old and she hasn't visited /lab in 7 days, the stale-variant fires (D8 Rule 3). The Match Revelation card injects at position 2 on a new high-rarity match (D3); same special-card grammar as `OnThisDateCard`.

What converts to Basic ($5.99): she's hit the second comparison locked-view and wants to read it; she's read 1 comment and wants to reply. Both surface in the same canvas (V2 §6.2 Jonas 3rd-ad principle). What converts to Pro ($14.99): only the ~5% serious-researcher cohort (DEFERRED §4.4). The Basic-to-Pro upgrade trigger is the *"Save this search?"* affordance on phenomenon pages (locked on Basic; opens Stripe checkout on tap) — V2 §6.3 Jonas. Pro daily loop adds Watchlist alerts; monthly loop adds the recurring-drop card (D30, Sprint 3).

What we control: the LabPromo variants, the Hints cadence, the Match Revelation injection. What we don't: organic shareback (Tobi: the share-card is the recruit, but we can't make her send it; we can only make it shareable).

**Risks / drop-offs:** Free→Basic conversion if the matching engine doesn't deliver ≥1 high-rarity match per month (DEFERRED §4.3 Lucia: drop to $3.99 if 30-day median match count <2; founder LOCKED $5.99 with instrumentation, see O1). Pro retention if the monthly drop feels like a recomputation rather than a new lens (V5 §4.5 Lucia).

**The most important moment on this map:** Step 5 of `/start`, the first `MatchRevelation` card. V5 §3 Priya: *"the single most important UX moment in the product."* Every Sprint-1 line item is in service of this moment landing.

---

## 4. Sprint 1 — Addition Sprint (1-2 weeks)

V5 §4.4 governs: kills + the v0 of `MatchRevelation` ship together. Sprint 1 ends with the user *feeling something new*, not just absence-of-bad. Pre-condition: the Copyright Sprint 2 Haiku regen batch (~2-6h) MUST land before any work that re-renders narrative prose, because the re-rendered prose will source from the regenerated narratives. NUFORC ingest and classifier-daily cron are independent.

**The deletes (Sprint 1 — every kill cited):**

- **D13** Kill RadarSurface. Drop import (`src/pages/lab.tsx:89`) + render (`lab.tsx:685-695`). Once orphaned, delete `src/components/lab/RadarSurface.tsx`. **S, ½ day.**
- **D14** Kill MatchList inline 12-card body in `lab.tsx:712-723`. Replace with a "See all 47 →" link inside the new `MatchRevelation` canvas; full list moves to new page `src/pages/lab/related/[reportId].tsx` (reuse existing `MatchList` component). **M, 1 day** (design of the dedicated page is O2 — ship a workable v0; founder taste-call later).
- **D15** Kill 1:1 DM mechanic. Drop imports + section `lab.tsx:643-680`. Tables retained one release. **S, ½ day.**
- **D16** Kill `CrossExperienceHeader` standalone (`lab.tsx:584-593`). Extend `DossierHeader.tsx` eyebrow to render the body-of-work sentence at n≥2. **S, 1 day.**
- **D17** Kill TemporalStrip empty-state placeholder in `src/components/lab/TemporalStrip.tsx`. Render `null` when distributions are null. **S, ½ day.**
- **D18** Kill in-lab notification bell at `lab.tsx:547-552`. **S, 15 min.**
- **D19** Kill in-lab Submit Report header pill at `lab.tsx:540-547` (replaced by D20). **S, 15 min.**
- **D12** Kill PDF export. Delete `src/pages/api/lab/dossier/[id]/export-pdf.ts` + the "Export PDF" button in `src/components/lab/ProDossier.tsx`. Keep `share-card.png`; rename the button "Share card." **S, ½ day.**
- **D38** Kill `TodayGridMode` (drop import + render in `src/pages/discover.tsx`), kill in-Today search overlay, kill body scroll-lock, replace hardcoded fallback stats with `/api/public/stats`. **M, 1 day** total for the four.

**The additions (Sprint 1):**

- **D1 + D27** `MatchRevelation.tsx` v0 — new component at `src/components/lab/MatchRevelation.tsx`. Anatomy per V5 §4.1: one foregrounded match + two secondary; signal-ribbon tiles (descriptor / decade / cluster / hour-band) with rarity caption; CTA "Open the comparison →"; no Pattern Line diagram yet (deferred to Sprint 2 per V5 §4.4). Includes the non-matcher fallback state (D27, DEFERRED §4.1). Helena copy review required. Mount in `src/pages/lab.tsx` at the slot vacated by the old MatchList. **L, 4-5 days.**
- **D5** "Account N of M · Last updated [date]" eyebrow on DossierHeader. ~30 lines JSX in `src/components/lab/DossierHeader.tsx`. **S, ½ day.**
- **D6** "200,000 catalogued accounts" front-door eyebrow. Wire `/api/public/stats` (new endpoint, ~30 lines reading `phenomena` count + archives table). Consume on `src/pages/lab.tsx` empty state, `src/pages/explore.tsx` header, `src/pages/discover.tsx` Today header. Helena copy review on mobile collapse (<380px → "200K accounts · 47 archives"). **M, 1 day** total.
- **D7** Hints resolve actions. New `hint_resolutions` table migration + new `/api/lab/hints/[id]/resolve` endpoint + UI update in `src/components/lab/HintsRail.tsx` (Accept / Save / Not mine buttons + unresolved count chip). **M, 2 days.**
- **D23 (partial)** Reframe `src/components/discover/LabPromo.tsx` for "My Record" + tier-aware. Extend `/api/lab/promo/should-show` to return variant key. Implement two of four variants in Sprint 1 (`free_empty`, `free_active`); defer `basic_hints` and `pro_drop` to Sprint 2/3 (they depend on D7 and D30). Rename wordmark "Lab" → "Your Record". **M, 2 days.**
- **D3** Today new special card `MatchRevelationCard` injected at position 2. Same injection mechanic as `OnThisDateCard` in `src/pages/discover.tsx`. Third-person voice with one-pixel cream hairline on the left edge (V2 §3.1). Save-swipe routes to saved-comparisons rail on `/lab` (full rail is Sprint 3 D33, but the route handler + storage row ships in Sprint 1 so the gesture works). **M, 2 days.**

**Sprint 1 commit cadence** (~3-4 PRs, NOT one mega-commit):

- **PR-1A** (Mon-Wed week 1): pure deletes — D12 + D13 + D14 + D15 + D16 + D17 + D18 + D19 + D38. ~5 components removed, ~3 routes deleted, no new components. Verify regression with manual smoke on `/lab` n=0 and n=1.
- **PR-1B** (Thu-Fri week 1): D5 + D6 + D23-partial + the `LabPromo` rename. Strings + small new endpoint. Easy revert.
- **PR-1C** (Mon-Wed week 2): D1 (MatchRevelation.tsx v0) + D27 (non-matcher state). The single biggest add. Mount in `lab.tsx`.
- **PR-1D** (Thu-Fri week 2): D7 (Hints resolve) + D3 (MatchRevelationCard on Today). Requires the new migration and one new endpoint; tested in isolation.

**End of Sprint 1 state:** measured scroll on n=1 Free iPhone 15 drops from ~6,400px to ~3,400px (V4 §7 measured). The MatchRevelation canvas is the new spine. The 200K eyebrow grounds every tab. Hints have resolve actions. Today has two new injection card types. *The user has felt the wow.*

---

## 5. Sprint 2 — Cross-Surface + Social (3-4 weeks)

The structural sprint. Heavier lifts, more migrations, more cross-tab coordination. Pre-conditions: Sprint 1 lands; Copyright Sprint 2 Haiku regen batch finished; NUFORC continues in background; classifier-daily continues at 04:00.

**Sprint 2 line items:**

- **D4** Per-comparison comments. (a) New table `comparison_comments` (id, comparison_pair_id, author_id, body, parent_id, created_at, deleted_at). Single-level threading. (b) New page `src/pages/lab/compare/[a]/[b].tsx` — two stacked DossierHeader cards on mobile (not side-by-side), comment thread directly beneath, corpus-grounded composer prompt per V5 §4.2 ("You and this contributor share `[overlap]`. Add what you remember about that detail."). (c) Basic+ write, Free read. (d) Helena composer prompt review required. **L, 5-6 days.**
- **D10** Phenomena personalized-sections re-skin. `src/pages/api/feed/personalized.ts`: rewrite Section 2 (For You) to query `phenomena` table not `reports`; rename rail "Phenomena across your interests" (PHENOMENA_PERSONALIZED §5); delete Section 5 (Near You) — relocate logic to Today endpoint; delete Section 6 (Because You Saved) — surface as new rail on My Record (D33-precursor; the rail itself ships in Sprint 3 but the API delete lands now). ~80 line net change. Helena title-copy hard requirement (catalogue-y register). **M, 2 days.**
- **D11** feedSections title + icon swap on Phenomena. `src/pages/explore.tsx:1410-1563` no structural change; only `getSectionIcon('for_you')` icon swap to phenomenon/catalogue icon (e.g., `Sparkles` or `BookOpen`). API-driven section presence; the new D10 API drives the render naturally. **S, ½ day.**
- **D20** Floating `+ Submit` pill. New `src/components/global/SubmitPill.tsx`. Mount in `Layout.tsx` (suppressed on `/lab`, `/start`, modals — V2 §4 spec). Bottom-right, 16pt above bottom-nav, 56pt diameter, "+ Submit" label per V2 §4. Long-press surfaces 2-option sheet "Submit new account / Resume draft" when both apply. Suppression list lives in component. Note: founder taste call O3 (pill copy) — recommend "+ Submit" per V2 spec; ship it; flip later via 1-line change. **M, 2 days.**
- **D22** Server-decided homepage redirect. New `src/pages/api/user/landing.ts` returns `{ destination: '/lab?focus=hint' | '/discover' | '/start' }` per V2 §2.2 routing table. ~40 lines in `src/pages/index.tsx` consume it. 60s cache. **M, 2 days.**
- **D24** Bottom-nav tab badges. New `src/pages/api/user/tab-badges.ts` returns `{ today: 0, phenomena: 0, lab: { hints: 3, matches: 2 } }`. Update `src/components/mobile/MobileBottomTabs.tsx` to render small count dots. **M, 2 days.**
- **D26** Pro Dossier inline preview on Free/Basic. Extend `src/components/lab/ProDossier.tsx` to render first 2 sections + gradient mask + "Read the full Dossier — Upgrade to Pro" CTA when `tier !== 'pro'`. Currently the gating is a paywall card entirely; this replaces the paywall card with a preview-card. **M, 2 days.**
- **D25** Sticky right-rail nav. Desktop: sticky right-aligned chip stack (Report · Map · Notes · Pro Dossier). Mobile: bottom-sheet chip with same anchors (V2 §3.3 mobile pattern; suppressed on Today/Phenomena because bottom-nav already serves that role). **M, 2 days.**
- **D32** Resume-draft banner on My Record. Read localStorage + draft persistence (already shipped on /start step 1). Banner mounts above DossierHeader. **S, ½ day.**
- **D34** `YourSignalForPhenomenon` extension: add "and N contributors whose accounts match yours also reported this phenomenon" row. Free sees count; Basic+ taps through to the comparisons. **S, ½ day** (assumes the matches data is already in scope; verify against existing `YourSignalForPhenomenon` component).
- **D37** Move `ClusteringCard` from Today to Phenomena Browse. Drop from `src/pages/discover.tsx`; mount on `src/pages/explore.tsx` Browse mode (likely as a row above the encyclopedia spotlight). **S, ½ day.**
- **D39** Kill `AskTheUnknown` perma-widget on Phenomena (mode!=='map'). Drop from `src/pages/explore.tsx`. Consider relocate to homepage hero — but defer that decision; Sprint 2 is the kill. **S, 15 min.**
- **D23 (complete)** LabPromo full 4-variant matrix — add `basic_hints` + `pro_drop` variants (the Pro-drop variant depends on D30 which is Sprint 3, but the *variant code path* ships now; pro_drop just gates on a flag that flips on in Sprint 3). **S, ½ day.**

**Sprint 2 commit cadence** (~4 PRs):

- **PR-2A** (week 3): D4 (comments) — the biggest single PR. Migration + new page + Helena copy pass. Ships as one PR because the surface and the schema and the route are tightly coupled.
- **PR-2B** (week 3): D10 + D11 + D37 + D39 (Phenomena re-skin + ClusteringCard relocate + AskTheUnknown kill). Backend API change + small frontend deltas. Helena title pass.
- **PR-2C** (week 4): D20 (submit pill) + D22 (server landing) + D24 (tab badges). The "global chrome" PR.
- **PR-2D** (week 4): D26 (Pro Dossier preview) + D25 (sticky nav) + D32 (resume banner) + D34 (YourSignal extension) + D23-complete. The "My Record polish" PR.

**End of Sprint 2 state:** ship-ready. The MatchRevelation canvas has comments on its comparison page. Phenomena is browse-shaped, not Today-shaped. Submit is one persistent tap from anywhere. Landing is server-decided. Bottom-nav has badge slots. The Pro Dossier preview converts. The user sees the wow → unlocks the comparison → reads/posts → and the landing pulls them back.

---

## 6. Sprint 3 — Deferred features + Pro recurring drop (5-8 weeks)

Sprint 3 is the post-MVP polish + the recurring-artifact frame that makes Pro sticky beyond month 2 (V5 §4.5 Lucia). Pre-conditions: Sprint 2 lands; NUFORC catch-up is well-progressed (the recurring drop reads against the full corpus); a Sprint-3 copyright strip if Copyright Sprint 2 doesn't fully resolve.

**Sprint 3 line items:**

- **D8** Hints-on-Today special card with hybrid cadence (DEFERRED §3). Already partly in Sprint 1 (D3 injection mechanic); now add the per-session rule + 14-day suppression + staleness re-surface. New `hint_today_impressions` table. **M, 2-3 days.**
- **D9** Pro drop notification scaffold. Default-on with consent-with-context dialog (DEFERRED §2). New post-upgrade onboarding modal; new `notification_preferences` row; web push subscription handling. Helena finalizes copy. **L, 4-5 days.**
- **D21** Phenomena sub-tab icon-collapse on scroll (V2 §3.2 chrome fix). Twitter-pattern nav-bar hide. **M, 2 days.**
- **D25 (mobile bottom-sheet refinement)** if the Sprint 2 v0 isn't tight enough. **S, 1 day if needed.**
- **D30** Pro recurring-drop framing on Dossier ("This month's lens"). Re-present existing Dossier sections in `ProDossier.tsx` as a hero "This month's lens" + "Past chapters" collapsible roll. 12 lenses cycled. No email by default (DEFERRED §2 opt-in only for email). Helena copy review on lens names (V5 §4.5 Helena veto on "drop"). **M, 3 days.**
- **D28** Year-in-Record annual artifact v0. New `src/pages/lab/year-in-record/[year].tsx`. Spotify Wrapped pattern, austere register. 8-12 vertical cards + share-card PNG generator at the end (reuses existing share-card pipeline). Cadence: personal anniversary (recommend); founder taste call O4. Helena copy review mandatory on vertical cards (V5 §4.5 — "Wrapped register tends toward effusive; ours must stay documentary"). **L, 5-7 days.**
- **D33** Saved-from-Today pile-rail on My Record between HintsRail and TemporalStrip. V2 §3.3. Letterboxd stack-of-thumbs visual. **S, 1 day.**
- **D29** Standing-searches rename (string-only) in `WatchlistsRail.tsx`, `WatchlistEditor.tsx`, all paywall copy. Helena pass. **S, ½ day.**
- Pattern Line miniature on MatchRevelation canvas (V5 §4.4 deferred from Sprint 1; V5 §7 #10). Small 4-node SVG diagram. Doubles as share-card object. **M, 3 days.**
- Standing-search create button (locked on Basic, paywall surface) per V2 §11 #16. **S, 1 day.**

**Sprint 3 commit cadence:** ~3-4 PRs across the 5-8 week window. Recommend grouping by surface: PR-3A (Today + Hints), PR-3B (Pro recurring + Year-in-Record), PR-3C (mobile polish), PR-3D (Pattern Line + standing-search button).

---

## 7. Dependencies + parallelism

**Sequential dependencies (must-block):**

- D14 (MatchList kill) blocks on D1 (MatchRevelation v0 ready to replace it). Same PR-1C.
- D13 (RadarSurface kill) blocks on D1 for the same reason. Same PR-1C.
- D15 (DM kill) blocks on D4 (comments shipped) — but the Sprint 1 cut happens in PR-1A *before* comments ship, because the panel agreed the DM mechanic is wrong even without a replacement (V4 §4; V5 §7). The interim user state is: between PR-1A and Sprint 2 PR-2A, named-match offers are gone and comments don't exist yet. This is an acceptable gap (the named-match offers were under-used; Helena: better gone than wrong).
- D8 (Hints-on-Today hybrid) blocks on D7 (Hints resolve actions) — D7 ships in Sprint 1; D8 ships in Sprint 3.
- D22 (server landing) blocks on D7 (resolve state read).
- D3 + D33 (Save-swipe routes to saved pile) — the Sprint 1 D3 ships the route + storage row only; the full pile rail D33 is Sprint 3.
- D24 (tab badges) reads from D7 (Hints unresolved count) and D1 (new matches count) — both ship Sprint 1; D24 is Sprint 2.

**Parallelism (safe to ship together):**

- All Sprint 1 PRs are revert-safe: PR-1A is pure deletes, PR-1B is strings + tiny endpoint, PR-1C is the new component, PR-1D is the new endpoint + injection.
- Sprint 2 PR-2A (comments) and PR-2B (Phenomena re-skin) touch different surfaces — can ship same week.
- Sprint 2 PR-2C (global chrome) and PR-2D (My Record polish) touch shared `src/pages/lab.tsx` — coordinate but do not block.

**Background work compatibility:**

- NUFORC ingest (~162h ETA at safe pace) is independent of all UI work. Safe to run throughout.
- Copyright Sprint 2 Haiku regen batch (~2-6h) is *narrative-touching* — must finish before Sprint 1 PR-1C (the MatchRevelation canvas pulls match excerpts that read from the regenerated narratives). Block PR-1C until regen confirmed.
- Classifier-daily cron (04:00 local) is independent of all UI work.

**Safe-to-ship-now matrix:**

| PR | NUFORC running? | Regen pending? | Classifier-cron? | Safe? |
|---|---|---|---|---|
| PR-1A (deletes) | yes | yes | yes | yes — touches no narrative surface |
| PR-1B (strings + stats) | yes | yes | yes | yes — `/api/public/stats` is counts, not prose |
| PR-1C (MatchRevelation) | yes | **NO** | yes | wait for regen |
| PR-1D (Hints + Today card) | yes | yes (Hints data is template-driven, not narrative-rendered) | yes | yes |
| Sprint 2+ | yes | (regen long done) | yes | yes |

---

## 8. Open founder taste calls

Five questions still pending. None of these block Sprint 1; flag for founder to resolve before the surface that depends on them ships.

**O1 — Basic price ($5.99 vs $3.99).** Founder LOCKED $5.99 in the constraints; DEFERRED §4.3 panel recommended $5.99 with weekly instrumentation. Instrumentation needs to land in Sprint 1 (it's a simple analytics event on Basic conversion + a weekly query against `subscriptions` joined to `match_revelation_events`). If 30-day median match count is <2 in any cohort, panel mandate is drop to $3.99 within 90 days. Founder may want to re-affirm or pre-empt the drop. **Decision needed: before Sprint 1 conversion instrumentation lands.**

**O2 — "See all 47" destination page design.** V2 endorsed the link; V5 §7 #9 endorsed; nobody designed the page. Recommend ship a workable v0 in Sprint 1 (`src/pages/lab/related/[reportId].tsx` reusing the existing `MatchList` component) and revisit design in Sprint 3. **Decision needed: before Sprint 3 polish if v0 doesn't feel right.**

**O3 — Submit-pill copy.** V2 §4 spec is "+ Submit"; V2 §10 dissent 4 (Sana vs. Riku) is on placement scope, not copy. Recommend "+ Submit" per V2 spec; flip later via 1-line change if needed. Alternatives flagged in V2: "+ Add account", "+ Your account", "+ Report." **Decision needed: before Sprint 2 PR-2C (submit pill ships).**

**O4 — Year-in-Record cadence.** V5 §4.5 recommends personal anniversary (Ancestry-style "your year of discoveries," not calendar). Founder may prefer calendar year (Spotify Wrapped pattern) or November drop (Spotify-style holiday-season acquisition window). **Decision needed: before Sprint 3 D28.**

**O5 — Pro drop notification copy variants.** Helena to draft both default-on copy and opt-in copy in case founder flips the deferred-decision panel's vote. **Decision needed: before Sprint 3 D9.**

**Other panel-flagged opens (not in roadmap-critical path):**

- V2 §10 founder pick on first-comment paywall (Lucia: let Free post on first matched-comment-thread; panel didn't resolve). Recommend: hold Basic+ posting line. Revisit if comment density at 60 days is <2 median.
- V2 §10 founder pick on Hint-resolve-publicity (Eitan: public Wikipedia-style vs. Ancestry-private). Recommend: private at MVP; panel can revisit.
- V5 §6 dissent 2 (Maya): Pattern Line A/B as prose vs. diagram. Ship diagram in Sprint 3; A/B post-launch.

---

## 9. Risk register

**R1 — Brand drift (HIGHEST).** Every text surface in the roadmap requires Helena copy review before ship. The Match Revelation card copy, the Hints fresh + stale variants, the non-matcher fallback copy, the LabPromo 4 variants, the comments composer prompt, the Pro drop consent dialog, the Year-in-Record cards. The aunt persona closes the tab in <60s on any conspiratorial / Discord / earnest-reassurance drift (V5 §3 Helena). Mitigation: Helena gets a single "copy-review session" before each PR ships. Never deploy text without her stamp.

**R2 — Mobile viewport budget.** V2 §3.3 estimated current page scroll is ~6,400px. V4 §7 target post-Sprint-1 was ~3,400px. Sprint 2 adds D4 + D25 + D26 + D32 + D34; need to verify scroll doesn't balloon again. Recommend a hard cap of ~4,000px on My Record n=1 at end of Sprint 2; measure and adjust.

**R3 — Personalized feed endpoint performance.** `src/pages/api/feed/personalized.ts` is large (already does 6 queries on a single request). Sprint 2 D10 + D34 add joins; Sprint 3 adds more rails. Cap recommendation: stay under 8 queries per request; add cache layer if it goes higher. Currently caches 60s anon / 30s auth (acceptable). The 200K eyebrow / `/api/public/stats` should be cached aggressively (10min+) — count queries are slow.

**R4 — Conversion-funnel impact of redirect (D22).** Server-decided landing redirects n=0 users to `/start` and n≥1 with pending action to `/lab`. The risk: a returning Free user who lands on `/lab` and bounces because they expected `/discover`. Mitigation per V2 §2.2: cache 60s; allow the user to override via direct URL (no force-redirect on `/discover` itself). Instrument: bounce rate on first auto-redirected `/lab` session.

**R5 — Matching-engine quality.** DEFERRED §4.1 load-bearing: the first Match Revelation card must surface a *corpus-rare* overlap, not a common one (triangle, lights). If the engine prioritizes "most similar" over "rarest overlap," the wow doesn't fire and Sprint 1's whole value-proposition fails. This is engine work, NOT UI roadmap — flag for separate engine sprint coordinating with Sprint 1.

**R6 — Comments-thread starvation.** DEFERRED §4.2 honest read: ~10-20% of Basic users post a comment in first 30 days. Most comparison threads will have 0-2 comments. If the UI treats this as a destination, it'll feel empty. Mitigation per panel: ship comments as a *trust signal* not a *destination*; don't build moderation tooling or comment surfacing in Sprint 2. Revisit only if 60-day median crosses 4.

**R7 — Sprint 1 scope creep.** V5 §4.4 explicitly warns: Sprint 1 adds *one* new thing (MatchRevelation v0). The temptation to slip the Pattern Line, the share-card, or the resume-banner into Sprint 1 must be resisted. Lucia: *"The wow is the conversion lever. Cutting it for week-1 simplicity is the trap V4 fell into."* — but cutting *less* than what's specified is also a trap (V5 §4.4). Operator discipline.

---

## 10. Recommended commit + ship cadence

Concrete weekly plan. Operator commits locally per workspace rule.

**Week 1**
- Mon-Wed: PR-1A (deletes — D12 + D13 + D14 + D15 + D16 + D17 + D18 + D19 + D38). Commit Wed. Deploy.
- Thu-Fri: PR-1B (D5 + D6 + D23-partial + LabPromo wordmark rename). Commit Fri. Deploy.

**Week 2** (wait for Copyright Sprint 2 regen batch to finish)
- Mon-Wed: PR-1C (D1 MatchRevelation v0 + D27 non-matcher state). Commit Wed. Deploy.
- Thu-Fri: PR-1D (D7 Hints resolve + D3 MatchRevelationCard on Today). Commit Fri. Deploy.

**Week 3**
- Mon-Fri: PR-2A (D4 comments + comparison page). One PR — schema, route, page, Helena copy pass. Commit Fri. Deploy.

**Week 4**
- Mon-Wed: PR-2B (D10 + D11 + D37 + D39 — Phenomena re-skin). Commit Wed.
- Thu-Fri: PR-2C (D20 + D22 + D24 — global chrome). Commit Fri.

**Week 5**
- Mon-Wed: PR-2D (D26 + D25 + D32 + D34 + D23-complete — My Record polish). Commit Wed.
- Thu-Fri: Sprint-2 retro + Sprint-3 kickoff.

**Weeks 6-8**
- Sprint 3 PRs (PR-3A through PR-3D), grouped by surface. ~1 PR per week.

Three rules: (a) no commit goes out without a Helena copy stamp on touched copy. (b) every PR has a documented revert path. (c) instrumentation lands in the same PR as the feature.

---

**Word count:** ~4,950. Under cap.

— Roadmap synthesizer, June 2026

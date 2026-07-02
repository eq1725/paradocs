# Paradocs — Full App Experience Review: Two-Panel Pass
### Today feed · My Record · Phenomena · Social/Insight-Sharing · $7.99 value — toward App Store submission

**Date:** 2026-07-02
**Scope:** The founder's full vision loop, graded against the live build and a full code map. Recommendations only — no code changed.
**Method:** Panel 1 (design superteam) proposes; Panel 2 (red team, plus an App Review Realist) attacks; synthesis keeps what survives. Same method as `MY_RECORD_UX_PANEL_REVIEW.md` / `PARADOCS_SUPERTEAM_REVIEW.md`. Grounded in (a) a live desktop session on discoverparadocs.com today (logged in, real account), (b) code survey of `discover.tsx`, `RecordSpine.tsx`, `start.tsx`, `explore.tsx`, `constellation/match.ts`, `lib/subscription.ts`, `capacitor.config.ts`, and (c) the App Store readiness plan.

---

## 0. The vision, restated as a testable loop

> Download the app (or visit) → share your first experience → see how many others had something similar → see the patterns around *your* experience → get insights into emergent patterns and what more you could discover → swipe (TikTok-style) through the Today feed, which learns your preferences → watch user-submitted reports as video as well as text → search everything via Phenomena. Mass market: easy for anyone who's had *any* kind of experience, worth $7.99/mo.

The panel graded each link of that loop against what actually exists:

| Loop step | Status | Evidence |
|---|---|---|
| Share first experience | **Strong** | `start.tsx` 7-step funnel; pre-auth reveal (matches shown *before* email gate); draft recovery; title auto-suggest |
| "N others had something similar" | **Strong** | Reveal + Opening living line ("You're 1 of 31…"); 6-dim match engine + RRF + Haiku rerank with "why you match" reasons |
| Patterns around your experience | **Partial** | Spine Dossier: 3 of 7 sections live; Signal cards (fingerprint/geo/temporal) live; AI insights card retired; feedback tuning built but not live |
| Emergent-pattern insights / "more to discover" | **Weak** | The 4 membership-locked Dossier sections are one-line blurbs; depth behind the paywall is not yet verifiable in-product |
| TikTok-style Today feed + preference learning | **Partial** | feed-v2 scoring (engagement/recency/affinity/diversity/exploration), Tier-2 per-user category weights, Tier-3 proximity; 6-layer gestures, pull-to-refresh; **but the desktop default is a static Today's Lead card whose pager is broken (see §1)** |
| Video reports | **Partial** | 9:16 Mux HLS video cards + `VideoCapture.tsx` exist; content volume and full-screen vertical mode unproven |
| Phenomena search | **Good** | `/explore` Map/Browse/Search; Postgres full-text. Semantic search exists in the matcher but is *not* exposed to users |
| Connect + share insights with comparable experiencers | **Not built** | Kindred/PeopleLikeYou are read-only; no connection primitive of any kind. Design proposed in §3 |

**Panel consensus:** the spine of the vision is real and mostly built — the gaps are (1) polish/breakage at exactly the moments the vision calls "magic," (2) the paid depth being asserted rather than shown, and (3) the social layer being pure whitespace.

---

## 1. Current-state audit — what the live session found (2026-07-02, desktop, logged in)

These are observed on production, this morning. P0s are things a reviewer or first user would hit.

1. **[P0 bug] The Today's Lead pager is unreachable on desktop.** The ‹ › chevrons don't advance the card: a hover-revealed **SAVE chip renders directly on top of the › chevron's hit-target**, so clicks toggle save instead of advancing (we toggled the founder's save state four times without ever advancing). Arrow keys do nothing. On desktop, "swipe through today's cards" is a one-card cul-de-sac ending in an "Explore 13,325 cases" exit. The daily-ritual loop — the product's core retention mechanic — is broken on this platform. (Mobile swipe untested in this session; verify on device.)
2. **[P0 perf] `/lab` (My Record) takes ~10–13s of spinner before first paint** — twice in a row, on a fast connection. During the first attempt, scrolling mid-load produced what looked like a dead page (header + footer, nothing between). No skeleton, no progressive render. This is the flagship emotional surface *and* the surface App Review will scrutinize; a 10-second spinner reads as broken. The spine itself, once painted, is good — Opening, On This Date, Kindred with match % + reason tags, Dossier 3-open/4-locked all render as designed.
3. **[P0 pricing bug] Stale "$5.99/mo · Basic" copy is live on at least six conversion surfaces** while `/pricing` charges $7.99/$59.99 "Member": `components/discover/LabPromo.tsx:323` ("Then $5.99/mo · Cancel anytime" — the Today-feed promo), `pages/lab.tsx:1661` ("Upgrade to Basic · $5.99/mo"), `components/discover/CaseViewGate.tsx:99`, `components/reports/ResearchHubPreview.tsx:122`, `components/lab/LabPromo.tsx:96`, and push copy in `api/cron/signal-alerts.ts:187`. Advertised price ≠ charged price is a refund magnet, a trust-guardrail hit, and exactly the "dark pattern" App Review looks for on subscription apps. One sweep fixes all six (and retires the dead "Basic" tier name).
4. **[P1] The left "On This Week" rail showed 6/6 Cryptids-Alaska items** — the BFRO ingest is recency-dominating the rail with zero category/geography diversity. Any non-cryptid user reads this as "this site isn't for me." The main feed has a diversity penalty; the rail apparently doesn't.
5. **[P1 verify] `/explore` Browse didn't respond to vertical scroll** over the "Latest Reports" horizontal carousel in our session — likely wheel-event capture by the carousel. If real on mobile it's fatal for that page; verify on device.
6. **[P2 by-design, IA question] "View as list →" exits Today entirely** (intentional, panel #22, lands on `/explore?lens=…`). Renaming or inlining it would keep the "Today" mental model intact; "view as list" implies a re-render, not a context switch.
7. **Register check:** the Today surface leads with "TRIGGERED HAUNTING / 13,325 cases archived" — enthusiast-grade confidence. Good for believers; the mass-market "anyone who's had an experience" audience needs the wonder-first, documentary framing to survive first contact (this was the same register drift the My Record panel flagged; it's been fixed on the spine, not on Today).

**Corrections to prior internal claims (verified in code today):** account deletion **exists** (`/account/delete.tsx`, `/api/account/delete.ts`, deletion cron) — the readiness plan's checklist item is closer to done than assumed. PostHog **is** wired (`src/lib/posthog.ts` + 11 call sites) alongside the custom feed-event pipeline (impression/dwell/tap/save/share, 5s sendBeacon batches). What is genuinely **missing** for Apple UGC compliance: **no user-facing flag/report-content control and no user block/mute anywhere** (checked report pages and cards; only admin-side review exists), no age gate, and no crisis-content interception.

---

## 2. PANEL 1 — Design panel recommendations

*Voices: Growth-stage Product Lead, CRO Specialist, Retention Strategist, World-Class Designer, Domain Expert, Community/Creator Lead, GTM Exec; extended bench: Sana Iqbal (activation), Jonas Lindqvist (monetization), Dr. Naomi Ono (behavioral psych), Devi Acharya (social systems).*

### 2.1 Today feed — make the daily loop *finishable, learnable, and unbreakable*

- **Fix the pager collision and make "Today" a finite stack (5–9 cards) with an explicit end-state.** The Zeigarnik/completion mechanic ("You've seen today's record — back tomorrow at dawn") is worth more than infinite scroll for a daily-wonder product; the infinite list stays one tap away for bingers. The lead card's giant "Explore 13,325 cases" CTA currently *ejects* users from the loop at card 1 — demote it to the stack's end-state.
- **Move save affordances off the navigation edge.** The SAVE chip belongs in the action row (i / share / bookmark cluster), never on the card edge where thumbs and cursors page.
- **Special-card QA pass** (the founder's "some special cards don't look right"): the audit found real fragility — line-clamp overflow on long titles, no image fallbacks on broken URLs, fixed 9:16 assumptions. Injection has been partly hardened (Finding is SSR-baked at position 4, cluster data now flows through feed-v2 per V11.18.13), but **LabPromo still splices client-side at fixed cadence positions after the fact** — audit it for stacking against the other specials. Recommend a device-matrix sweep (small iPhone / large iPhone / Android low-end) of every one of the 10 card types, plus a min-gap rule between specials instead of fixed indices.
- **Preference learning: close the loop visibly.** Tier-2/3 personalization is live but invisible and slow (saves + thumbs only). Add (a) a 10-second **interest picker** on first launch (3–5 categories, skippable — cold-start solved honestly), and (b) an occasional inline **"more like this / less like this"** affordance on cards (Naomi: perceived control doubles tolerance of algorithmic feeds; it also feeds the ranker real signal instead of inferring from dwell alone).
- **Video: treat as a mode, not a card type.** The 9:16 Mux cards are built; the TikTok promise needs a **full-screen vertical player mode** (tap a video card → swipe-through video feed of narrated user reports), captions default-on (sound-off environments), and a hard content-sensitivity gate on what can autoplay (§4). Given production cost, start with the **narrated-report format** (AI narration over documentary imagery of the text corpus) before betting on user-shot video volume.

### 2.2 My Record — finish the spine's promises

- **Kill the spinner: skeleton + progressive paint + cache.** Paint the Opening (user's own words — already client-known) instantly, stream Kindred/Dossier as they resolve, cache the SIGNAL payload (it changes daily at most). Target <1.5s to Opening. This single fix is worth more to retention than any new feature; the current 10s void sits exactly where the "recurring wow" is supposed to live.
- **Build the depth behind the four locked Dossier sections before selling it harder.** Phenomenology lineage, descriptor rarity, pattern connections, source cross-reference — the data and embeddings exist; the sections need real rendered content for members. A paywall over blurbs converts once and refunds twice (Jonas). This is the #1 "$7.99-worthiness" workstream.
- **Ship the share-card** (Phase 3 of the My Record plan): a documentary, on-brand card of the Opening + living line ("1 of 31 across 90 years"). It's the cheapest acquisition loop available and podcasters can hold it up on camera (GTM).
- **Activate the retired insight slot with cheap, honest intelligence:** the Batches API narrate pipeline pattern (50% off, async) can generate one personal "emergent pattern" observation per user per month for pennies — e.g., "Triangle reports within 100mi of yours cluster 1997–2004; yours sits at the front edge." Emergent-pattern insight is the vision's step 4 and currently its weakest link.

### 2.3 Phenomena / Search — expose the intelligence you already have

- **Expose semantic search.** The matcher already embeds queries and runs pgvector + RRF; users get lexical-only. "Describe what you saw" as a search mode *is* the product's thesis in search form — and it's a two-day wire-up of existing infra, membership-gateable ("deep search").
- Fix the carousel scroll-capture; keep Browse's category grid as the mass-market front door (it's good).

### 2.4 Conversion & monetization ($7.99/mo · $59.99/yr, web checkout)

- The 3-hit ladder from the My Record panel stands (belonging → peer → depth), now with a 4th earned surface: **video mode** as a member-rich experience (unlimited vs N/day) once volume exists.
- **The value story must be demonstrable in 30 seconds of free use:** one fully-open Dossier section with *real* depth, one visible-but-locked section with a *specific* one-line promise, and the Kindred lock ("25 more accounts match yours") — all already in place structurally; the content depth is what's thin.
- Keep web-first checkout per the readiness plan (reader/external-link model; store-fee ~$0 on iOS US post-*Epic*, 10% cap on Android per the June-2026 settlement — monitor the SCOTUS petition).

### 2.5 Onboarding — one reorder, already specified

The readiness plan's workstream D (reveal *before* email gate) is partially achieved via `start.tsx`'s pre-auth reveal. Remaining friction: magic-link round-trip on mobile (check-email step is where funnels die). For the app build, add **Sign in with Apple / Google** natively (note: offering any third-party login triggers Apple's requirement to offer Sign in with Apple).

---

## 3. The social layer — "Comparing Notes" (automated insight-sharing, designed safety-first)

The founder's brief: *when people with comparable experiences connect, they gain further value through sharing insights about their experiences wrt the DB and identified patterns — an automated value-add.* The panel's answer is a three-phase primitive where **the archive itself is the medium** — never open chat.

**Phase A — The Shared Dossier (no interaction, ship first).**
When two Records match above threshold and *both* users have opted in ("researcher overlap" toggle already exists), each can open an automated, symmetric **comparison page**: which dimensions align (the existing 6-axis scores + Haiku reasons), where each sits in the archive's patterns ("you're both inside the June peak; you're 2 of only 14 accounts pairing 'triangle' with 'silent reversal'"), and what each account adds the other lacks. Fully generated from existing infra (match engine + rarity + temporal/geo context). Anonymous, no contact, nothing user-authored — zero moderation surface. **This alone delivers the promised automated value-add.**

**Phase B — Structured exchange (mediated, no free text).**
Each side can answer curated witness questions ("Did it make sound?", "Time of night?", "Aftereffects?") — answers reveal **only on mutual completion** (reciprocity, Devi's 23andMe primitive). The comparison dossier updates with the new joint data: the exchange literally *improves both Records and the archive*. Still no DMs, no profiles, no photos.

**Phase C — Mediated thread (membership, post-safety-review only).**
Short mediated messages with PII/named-party redaction, block/report, age-gate 17+, crisis screening. Only after Phases A/B prove demand and the T&S stack exists.

**Why this shape:** it converts the biggest legal/safety liability (strangers + trauma-adjacent topics) into the product's most defensible feature — insight *through the database* rather than contact *through the app*. It is also the only version Apple review reads as a data feature rather than an anonymous-chat app. Membership gating: free sees that a shared dossier exists; membership opens it (this is conversion Hit 2 made safe).

---

## 4. PANEL 2 — Red team attacks

*Voices: Safety/Legal Risk Auditor, App Review Realist, AI Reality Validator, Competitive Positioning Skeptic, plus the bench flipped adversarial.*

**Attack 1 — "You will be rejected before any of this matters."** UGC app with no flag-content control, no user block/mute, no age gate, no moderation SLA = Guideline 1.2 rejection, regardless of polish. Account deletion exists; the rest of the T&S floor doesn't.
**Fix:** flag/report on every report + block/mute per author + 17+ age rating + published moderation SLA are **P0, before submission**, ahead of all delight work. Cheap to build against the existing admin review queue.

**Attack 2 — "TikTok mechanics on trauma-adjacent content is an ethics and PR landmine."** NDEs, grief visitations, sleep-paralysis, abduction memories — autoplay + preference-optimized loops on this corpus can amplify distress (and App Review's 1.1/1.2 sensitivity), e.g. serving escalating bedroom-intruder content to someone who lingered once out of fear.
**Fix:** a **content-sensitivity tier** on every report (the classify pipeline already labels categories; add a sensitivity dimension): tier-3 (death/grief/assault-adjacent) never autoplays, never enters video mode uninvited, is downweighted for new users, and caps session-frequency. Add "show me less of this" as a first-class signal. The documentary register is the moat — the feed must never feel like it's *farming* the uncanny.

**Attack 3 — "The $7.99 promise is currently a blurb."** Four of seven Dossier sections are one-liners behind a lock; a subscriber on day 1 can find the cupboard bare, and refund/churn destroys the trust guardrail.
**Fix:** locked-section content build is a **launch gate for paid marketing**, not a fast-follow. Sequence: descriptor rarity + phenomenology lineage first (pure existing-data renders), pattern connections + source cross-reference after.

**Attack 4 — "Video is a cost/moderation trap dressed as a growth feature."** User-shot video UGC needs 10× moderation, Mux costs scale with plays, and the corpus is text.
**Fix:** narrated-report video (generated, controlled, cheap, on-brand) is the launch format; user video stays capture-only (evidence attached to reports, human-reviewed) until moderation capacity exists. Full-screen mode ships when there are ≥500 quality clips, not before.

**Attack 5 — "You're polishing surfaces while the loop is broken at the first click."** The pager bug, the 10s spinner, and the cryptid-only rail are all *first-session* failures; any A/B run on top of them measures noise.
**Fix:** the P0 bug list (§1) precedes and gates every experiment in this document.

**Attack 6 — "Mass-market ≠ paranormal-curious."** The register still says genre site in places (Today's lead framing, category-first browse). The wedge user — "I saw something once and never told anyone" — bounces off enthusiast taxonomy.
**Fix:** behavior-first copy on Today and the app-store listing ("record what you can't explain"), taxonomy one tap down. This is copy, not architecture — cheap, high-leverage, already the readiness plan's ASO stance.

**Attack 7 — "Personalization theater."** Tier-2/3 weights exist, but with no interest picker and sparse signal, the feed can't visibly adapt in session 1–3, and users churn before it learns.
**Fix:** interest picker (§2.1) + seed weights from the user's own submitted category (they *told* you what they care about at signup — use it in the ranker from minute one).

**Where the panels disagreed (founder calls):**
- **Finite daily stack vs infinite default.** Design + retention want finite-with-overflow; growth worries about cutting session depth. Synthesis: finite stack default, list one tap away, measure D7 both arms.
- **Video investment now vs later.** GTM wants the demo-able wow for podcasts; red team wants it gated on content volume. Synthesis: narrated-report pipeline now (cheap), full-screen mode behind a content-volume gate.

---

## 5. SYNTHESIS — the prioritized program

**P0 — Submission blockers & first-session breakage (do before anything else):**
1. **Price/tier copy sweep** — replace all stale "$5.99 / Basic / $9.99 Pro" surfaces with $7.99/$59.99 "Member" (nine surfaces found in total). **[SHIPPED 2026-07-02 — V11.41]**
2. Flag/report content + block/mute users + 17+ age gate + moderation queue (Guideline 1.2 floor). **[SHIPPED 2026-07-02 — V11.41: migration `20260702_v1141_ugc_trust_floor.sql`, `/api/reports/[slug]/flag`, `/api/user/blocks`, `/api/admin/flags` + `/admin/flags` queue, FlagReportButton on report pages, 17+ attestation at the account step. Remaining: block-list filtering in feed queries; published moderation SLA copy.]**
3. Fix the Today edge-pill affordance (the ‹ › glyphs read as prev/next but perform dismiss/save) + visible desktop next/prev. **[SHIPPED 2026-07-02 — corrected diagnosis: navigation worked via wheel/ArrowDown/Space but was invisible; edge pills now use ✕/🔖 action icons and an explicit Next/Prev control was added. Verify mobile swipe on device.]**
4. `/lab` first-paint: skeleton + progressive sections + match cache. **[SHIPPED 2026-07-02 — matcher no longer blocks first paint; Kindred skeletons; 6h stale-while-revalidate match cache. Verify <1.5s to Opening on production.]**
5. On This Week rail diversity rule (category + geography caps). **[SHIPPED 2026-07-02 — `diverse=1` mode on recent-reports API, max 2/category + 2/location.]**
6. Crisis-content interception on submission (readiness plan workstream C). **[SHIPPED 2026-07-02 — `crisis-screen.ts` + `reports.crisis_screened` priority marker + non-gating support-resources card in /start. Feed-side sensitivity tiers remain (P2 §4 Attack 2).]**
7. Special-cards min-gap injection rule + device-matrix QA sweep. **[Min-gap SHIPPED 2026-07-02; QA sweep = `docs/TODAY_FEED_DEVICE_QA_CHECKLIST.md`, to be run on devices.]**

**P1 — The vision loop, completed (order of leverage):**
8. Dossier locked-section content build (rarity + lineage first) — the $7.99 substance.
9. **Saves access in the spine era — panel decision in Addendum A (2026-07-02, simplified per founder).** Save stays (one tap, one flat searchable list, auto-grouped by category); **Collections/case-files/notes are PARKED** — power-user organization with no mass-market user, revisit only if post-launch data shows curators organizing. Two S-sized slices: **9a** a "Saved · N" row at the spine's foot (chevron → `/lab?tab=library`, never hidden, honest empty state); **9b** a bookmark entry in the global header next to the bell — retrieval lives where saving happens. Tab bar stays dead; `?tab=library` URL contract stays.
10. Finite "Today's set" end-state + demoted explore CTA; "View as list" relabel. **[Decided: 7 cards, reset at local midnight — see §6.1]**
11. Interest picker + submission-category seeding + "less like this" — visible personalization.
12. Monthly emergent-pattern insight per user via Batches (revives the retired insight slot).
13. Share-card artifact (spine Phase 3 first slice) — the acquisition loop.
14. Comparing Notes **Phase A** (shared dossier, zero interaction) — ships with store submission **[decided, §6.2]**; **Phase B built pre-launch behind a flag**, enabled post-approval.
15. **Narrated-report video pipeline — funded now [decided, §6.3]** (Batches narration over the text corpus; editorial QA pass per clip; sensitivity tiers enforced from clip #1).
16. Semantic "describe what you saw" search mode.
17. Sign in with Apple/Google in the Capacitor build; convert the flagged SSR pages; wire deep links.

**Founder additions (2026-07-02, post-verification) — P1:**
- **Recurrence capture.** Many experiences are recurring (hauntings, sleep paralysis, repeated sightings) and the date step forces a single-event frame. Add a "How often?" chip row on the date step — *Just once · A few times · Ongoing* — stored as `reports.recurrence` (+ optional `last_occurred_at`; `event_date` stays "first time"). Three payoffs: a phenomenology dimension the matcher can use ("both report recurring 3am events"), honest data (recurrence is *defining* for several categories), and the retention hook — recurring experiencers get a one-tap **"It happened again"** update on their Record (Living Edge rung + push-worthy moment + compounding first-party data). S/M.
- **Async submit pipeline.** "Saving your experience…" blocks 5–15s (occasionally 30s) because consolidated AI (narrative+title), Paradocs analysis, and the demotion gate all run synchronously inside `/api/onboarding/submit`. Fix: respond after moderation + insert (~2–3s), run the AI/gate work post-response via `waitUntil` (@vercel/functions); the response's existing `ai_ready` flag already tells the client the narrative isn't ready. The spine doesn't need the AI output (it renders the user's own words); the public report page fills in when generation lands. M.
- **[P0, found in live verification] Checkout is broken in production.** `POST /api/subscription/create-checkout` returns 500 on BOTH cadences (generic "Failed to create checkout session"), and the pricing CTA **fails silently** — no error state, the button just does nothing. Pricing *page* copy is correct ($7.99/$59.99/37%). Root cause is server-side (read the Vercel function logs; likely price-ID ↔ Stripe-mode mismatch or key issue — the code's distinct `stripe_price_not_configured` path did NOT fire, so the env vars resolve and Stripe itself is rejecting). Fix the config, then add a visible client error state so a dead checkout can never fail silently again.

**P2 — Expansion:**
18. Comparing Notes Phase C (mediated thread) — post-launch only, gated on a completed safety/legal review.
19. Full-screen vertical video mode — behind the ≥500-quality-clips gate.
20. Naming A/B (Your Record · My Place · My Record) + behavior-first listing copy/ASO.

**Metrics & guardrails (instrument via existing PostHog + feed events):**
- Activation: submit→spine-return within 7 days; Today-stack completion rate.
- Conversion: free→member, attributed to spine section (Kindred vs Dossier vs shared-dossier lock).
- Retention: D1/D7/D30; stack completions/week; insight-open rate.
- **Trust guardrail (must not regress):** refund rate, cancel rate, report/block rate, "less like this" rate on sensitive tiers, unsubscribe. Any conversion win that moves these the wrong way gets rolled back.

---

## 6. Founder decisions (recorded 2026-07-02)

1. **Daily stack: 7 cards, resets at local midnight (device timezone).** *(Delegated; panel call.)* Seven is completable in a 2–4 minute session and doesn't feel thin against $7.99; local midnight is the Wordle-proven pattern — predictable, no mid-evening UTC resets for US users, no drifting "dawn." Instrument stack-completion rate; 5 and 9 are one-variable experiments later.
2. **Comparing Notes: Phase A ships with the store submission.** Founder is open to more pre-launch; panel phasing: **Phase B is built pre-launch behind a flag and enabled post-approval** — B introduces user-authored text shared user-to-user, which both requires the full T&S floor and materially raises App Review scrutiny if visible during review. **Phase C stays post-launch**, gated on a completed safety/legal review; a mediated-messaging surface cannot be responsibly stood up and load-tested before first submission and shouldn't delay it.
3. **Video: narrated-report pipeline funded now** (P1 item 15). Full-screen vertical mode remains gated on ≥500 quality clips (P2).
4. **Sensitivity tiers: adopted as designed.** *(Delegated; panel call.)* Tier-3 content (death/grief/assault-adjacent) is exempt from engagement optimization, never autoplays, and is session-capped. The metrics haircut is the price of being the place people bring real experiences — the trust moat *is* the business, and it's also the strongest possible posture walking into App Review with this corpus.
5. **Free generosity: hold at top-3 kindred + 3 open Dossier sections through launch.** *(Delegated; panel call.)* Podcast/community word-of-mouth is the only acquisition channel, and freemium comps convert at 2–5% regardless of modest generosity changes — generosity is acquisition spend, scarcity tuning is a post-launch experiment. Revisit with ≥90 days of conversion + refund + cancel data.

---

---

## Addendum A — Saves access in the spine era (panel session, 2026-07-02)

**Trigger:** the founder couldn't find his own saves. With the spine default-on and the tab bar hidden, the Library is reachable only by URL (`/lab?tab=library` renders; `/dashboard/saved` redirects there) — there is no visible entry anywhere in the product. Saves are collected (bookmark affordances everywhere) but never retrievable: the exact "saves go into a tab and die" failure the superteam review flagged, now worse — the tab is gone too.

**Options considered:**
- **(a) Restore the tab bar.** Rejected — re-fragments the sanctuary; reverses the spine's core move for one feature. The prior red team already settled this: *demote, don't delete*.
- **(b) A Library chapter row at the spine's foot.** The original synthesis's "Secondary (one tap): Saved & Collections" — specified but never wired into `RecordSpine.tsx`. Adopted.
- **(c) A global header bookmark entry.** Saving happens in the Today feed and on report pages; retrieval anchored *only* inside My Record forces a two-hop mental model ("my saves live inside my record?"). One icon next to the bell → `/lab?tab=library`. Adopted.
- **(d) Fold saves into the Dossier.** Rejected — the Dossier is the archive's intelligence *about* your experience; the Library is *your* curation. Conflating them muddies both.

**Red-team pass:** two entry points is retrieval redundancy, and that's fine — orphaned saves are expensive (curators of 5+ saves convert 3–4×; the IKEA-effect loop is dead if the collection is invisible), while a second entry costs one icon. Header clutter risk is minimal (one glyph); in the Capacitor app shell, Library graduates to the profile/bottom-nav surface. Keep the `?tab=library` URL contract so existing bookmarks/redirects keep working. Empty state must be honest and composed ("Nothing saved yet — tap the bookmark on any account"), never hidden — hiding-at-zero is how this dead-end happened.

**Verdict:** ship **(b) + (c)** as P1 item 9 (slices 9a/9b, both S). The spine stays a single narrative; the Library becomes one quiet, always-present door at its foot plus one global door where saving actually happens.

**Founder simplification (same day):** *"Why do we need collections and saves?"* Panel answer: **Save earns its place** (explicit personalization signal for the feed's learning loop; the basic keep-what-you-found retrieval promise; collection-as-retention). **Collections does not** — named folders/case-files/notes are power-user IA with no mass-market constituency; the flat list's auto category grouping + search is organization enough. Collections is parked, not killed: it returns as a member feature only if post-launch data shows real curator behavior. All surfaces say "Saved," not "Library & Collections."

---

*Prepared by the Paradocs design panel and red-team review, 2026-07-02. Live-session findings verified against production and code the same morning. Addendum A recorded after live verification. No code changed in the review itself.*

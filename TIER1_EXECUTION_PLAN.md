# Tier 1 Execution Plan — Pre-Launch Sprint

**Status:** IN PROGRESS · Started May 16, 2026
**Predecessor:** Expert panel review + encyclopedia cull (passes 1–4) + GTM pivot
**Successor:** Tier 2 (post-launch 30-day list) + Mass-ingestion Phase 2 (B2)
**Single-source doc:** this file. Any divergence between this and a session prompt — this wins.

---

## Strategic context (locked, do not relitigate)

### The pivot that defined this sprint

The encyclopedia (4,525 phenomena entries) has been culled to **1,463 active entries** across 4 passes, then re-framed: encyclopedia entries are now a **controlled tag vocabulary** for classifying ingested reports, NOT a Wikipedia-style content library. The AI-generated descriptive copy on each entry (ai_summary, ai_description, ai_history, ai_characteristics, ai_theories, ai_paradocs_analysis, ai_quick_facts, etc.) **stays in the DB but is no longer rendered publicly**. Phenomena entries surface in `/explore` only when at least one report is tagged with them (`report_count > 0`).

### What this changed

- **DROPPED:** per-entry content fact-checking, editorial copy review tool, /phenomena/[slug] descriptive content, /phenomena index as primary nav surface
- **KEPT:** the 1,463-entry tag vocabulary, image auto-sourcing (now lazy/on-demand), category structure
- **SIMPLIFIED:** /phenomena/[slug] → thin "Reports tagged [X]" page (route preserved for SEO)
- **NEW:** Today feed "Encyclopedia Spotlight" pivots from copy-driven to data-driven (icon + name + report_count + image)

### Locked decisions

- **Q1=b** — `/phenomena/[slug]` route preserved as thin page (not 301-killed)
- **Q2=b** — Image auto-sourcing is lazy: queue search only when phenomenon's first tagged report lands
- **Q3=a** — All `ai_*` fields preserved in DB (for possible v2 revival)
- **Onboarding:** account-first, ship directly (no A/B), per Reddit/Discord pattern. Skip Tier 3 A/B test #21.
- **Mass ingestion sources prioritized:** Reddit archived (millions via Arctic Shift), YouTube comments, NUFORC, NDERF (all 14 experience types). Reference B1_5_QA_QC_NOTES.md for adapter state.
- **Attribution model:** index-with-attribution + original Paradocs-voice narrative (paradocs_narrative via Haiku) — never republish source content. Current report-page attribution UI is sufficient.
- **Ingested vs submitted display divergence:** `report_type` enum (`submitted | ingested`), badge on card "Indexed from [source]", author-DM affordance disabled on ingested, reactions still enabled. Privacy: never expose OP real name for ingested; for submitted, only show display_name if `share_anonymously=false` (already in start.tsx funnel).
- **Capacitor app store:** Apple Developer ✓ ready; Google Play Console signup pending ($25 one-time at play.google.com/console/signup).

---

## Encyclopedia state snapshot

| Category | Hand | Auto | Total |
|---|---:|---:|---:|
| religion_mythology | 111 | 168 | 279 |
| ufos_aliens | 194 | 27 | 221 |
| ghosts_hauntings | 182 | 33 | 215 |
| cryptids | 99 | 112 | 211 |
| esoteric_practices | 42 | 126 | 168 |
| consciousness_practices | 47 | 108 | 155 |
| psychic_phenomena | 45 | 87 | 132 |
| psychological_experiences | 45 | 37 | 82 |
| **TOTAL** | **765** | **698** | **1,463** |

Archived: 3,062 entries (status='archived').
report_count drift fixed (Shadow Person was 9,675, now 0). 80 active entries have nonzero counts; 322 total tagged links across 107 approved reports.

---

## TRACK A — Tier 1 task ladder

Execute in order. Each task is independently shippable.

### ✅ T1.1 — report_count reconciliation + nightly safety-net cron (DONE)

- Reconciled all 1,463 active phenomena: counts now reflect approved reports only
- Created `src/pages/api/cron/reconcile-phenomena-counts.ts` (auth via Bearer CRON_SECRET or x-admin-key)
- Wired into `vercel.json` cron at 03:00 UTC daily
- Existing INSERT/DELETE trigger on `report_phenomena` (from 012_phenomena_encyclopedia.sql) maintains live counts; cron is the safety net against status-change drift

### ✅ T1.2 — /phenomena index deprecation (DONE)

- Added 301 redirect in `next.config.js`: `/phenomena` → `/explore?view=categories`
- Updated 2 internal links in `src/pages/explore.tsx` ("See all" + "Browse Encyclopedia" pill) to point to `/explore?view=categories`
- `/phenomena/index.tsx` file still exists but is unreachable via the redirect — can be deleted in a future cleanup pass (T1.3 may also kill the standalone index pattern entirely)

### ⏭️ T1.3 — /phenomena/[slug] simplified to thin "Reports tagged [X]" page

**Goal:** strip the descriptive copy rendering. Route preserved.

- File: `src/pages/phenomena/[slug].tsx` (~700+ lines currently)
- KEEP rendering: phenomenon name (H1), icon, image (primary_image_url) as small hero, "N reports tagged" subheader, list of tagged reports using existing report-card component
- REMOVE rendering: ai_description, ai_history, ai_characteristics, ai_theories, ai_paradocs_analysis, ai_quick_facts, ai_cultural_impact, anchor_case_hook, feed_hook (the descriptive text fields)
- KEEP in DB: all `ai_*` fields preserved (Q3=a)
- Use `report_count` (now reconciled) for the count display + filter
- Empty state: if `report_count === 0`, show "No reports tagged yet" with CTA to /explore
- SEO: keep meta tags using phenomenon name + category; H1 + report list is enough for ranking

### ⏭️ T1.4 — /explore category drill-down filter (report_count > 0)

**Goal:** in `/explore` Browse-by-Category, when drilling into a category, only show phenomenon cards where `report_count > 0`. Pre-mass-ingestion this means cards are sparse — by design.

- File: `src/pages/explore.tsx` (~1700 lines)
- Update the category-drill query to add `.gt('report_count', 0)`
- Card click → `/phenomena/[slug]` (the T1.3 thin reports page)
- Each card shows: phenomenon name, icon, image (if present, else icon placeholder), report count

### ⏭️ T1.5 — Today feed Encyclopedia Spotlight pivots to data-driven cards

**Goal:** remove dependency on `ai_summary`. Show icon + name + count + image instead.

- File: `src/pages/api/feed/personalized.ts` (~lines 72-95 currently)
- Current query requires `.not('ai_summary', 'is', null)` + `.not('primary_image_url', 'is', null)`
- Replace with: order by `report_count` DESC, take top 8 (regardless of ai_summary or image presence; image-less cards render with category icon)
- Display component: probably in `src/components/feed/` — find and update to not depend on `ai_summary` for headline (use `name` instead)
- Keep section heading "Encyclopedia Spotlight" or rename to "Top Phenomena Right Now"

### ⏭️ T1.6 — Lazy image auto-sourcing hook on first report-tag

**Goal:** when a phenomenon's `report_count` transitions 0 → 1, auto-queue an image search for it.

- Option A: Postgres trigger that calls a webhook (`pg_net` extension) → triggers `auto-search-profile-images` endpoint with batch_size=1 for that phenomenon
- Option B: In the ingestion engine (`src/lib/ingestion/engine.ts`), after `linkReportToCanonicalPhenomenonBySlug()` succeeds, check if phenomenon had no image and trigger search
- Recommended: Option B (cleaner, no trigger plumbing). Add `enqueueImageSearchIfNeeded(phenomenon_id)` call after each successful tag link.
- Image lands in `/admin/media-review` with `profile_review_status='unreviewed'` for Chase to approve.

### ⏭️ T1.7 — Dual-label categories on /explore + chip surfaces

**Goal:** mass-market accessibility. Add plain-language gloss next to acronym categories.

- File: `src/lib/constants.ts` — CATEGORY_CONFIG labels
- Update labels: ufos_aliens → "UAP (UFOs & aliens)", ghosts_hauntings → "Ghost (apparitions & hauntings)", cryptids → "Cryptid (Bigfoot, Mothman, etc.)", consciousness_practices → "OBE / NDE / Meditation", psychic_phenomena → "Psychic Phenomena", religion_mythology → "Religion & Mythology", esoteric_practices → "Esoteric & Occult", psychological_experiences → "Psychological Experiences"
- Affects: `/explore` category cards, category chips on report cards, filter dropdowns, Today feed category headers
- Keep SEO meta tags using the acronym primary

### ⏭️ T1.8 — Account-first onboarding flip

**Goal:** flip /start flow from story-first → account-first. Email captured before any submission work begins.

- File: `src/pages/start.tsx` (~2700 lines)
- Current flow: land on `/start` → multi-step submission form → at end, prompt for account creation
- New flow: land on `/start` → modal "Sign up to share your experience" → email/password or OAuth → after auth, multi-step submission form
- Preserve existing `share_anonymously` + `display_name` capture in the auth step
- Track funnel impact via PostHog events: `signup_intent`, `signup_complete`, `submit_started`, `submit_complete`
- Skip A/B test per Chase decision — ship directly

### ⏭️ T1.9 — Notifications center MVP

**Goal:** add bell icon to top header that surfaces what reactivation channels already notify about.

- File: `src/components/Layout.tsx` (or wherever the top header lives) — add bell icon
- New component: `src/components/NotificationsBell.tsx` with dropdown
- New API: `src/pages/api/notifications/recent.ts` returns last 10 notifications for user
- Data source: query existing `user_notifications` table OR derive from signal_alert_state + signal_digest_email logs
- MVP: read-only, no unread state
- Bell badge with count if helpful; if not, skip badge for MVP

### ⏭️ T1.10 — Hero card carousel on Story tab

**Goal:** replace single hero card with 4-card swipeable carousel (cluster · fingerprint · context · peer questions).

- File: `src/components/dashboard/LabConstellationTab.tsx` (or wherever the Story tab hero lives)
- Use existing `signal-hero-pick-strategy` feature flag to A/B between single hero (current) and 4-card carousel (new)
- Pattern: snap-x mandatory horizontal scroll, ~80% width with edge-peek showing neighbor cards, pagination dots below
- All 4 cards already exist as data — pull them all into the carousel rather than the current single-pick

### ⏭️ T1.11 — Soft delta-line elevation for digest-referred sessions

**Goal:** when URL has `?from=digest` or `?from=push`, elevate the SIGNAL delta line above RADAR for that visit only.

- File: `src/components/dashboard/LabConstellationTab.tsx`
- Read URL param via router/searchParams
- If `from === 'digest' || from === 'push'`: render delta-line component BEFORE RADAR
- Else: render in current position (below RADAR)
- One-visit-only behavior; no persistence

### ⏭️ T1.12 — PostHog session replay re-enable with Private Relay safeguards

**Goal:** re-enable session replay (disabled per V10.10.2 hotfix) without re-triggering Private Relay issues.

- File: `src/lib/posthog.ts` + `src/pages/_app.tsx`
- (a) Reverse-proxy PostHog through paradocs.com: add `/_posthog/*` route in `next.config.js` rewrites → posthog.com
- (b) Health-check ping before `posthog.startSessionRecording()` — if endpoint unreachable, skip recording for that session
- (c) Keep existing defensive try/catch wrap from V10.10.2
- (d) Stricter `blockSelector`: textareas with PII, the Ask form, comments, report description fields, email inputs, password fields
- (e) QA test on Private-Relay-enabled Mac before merging

### ⏭️ T1.13 — E2E test suite for critical paths (Playwright)

**Goal:** pre-launch insurance against regressions.

- Install Playwright: `npm i -D @playwright/test`
- New: `tests/e2e/` directory
- Tests for: (1) signup → submit → reveal flow, (2) delete-own-report, (3) push notification opt-in, (4) email digest opt-in/out
- CI hook: add `npm run test:e2e` to GitHub Actions or Vercel build

---

## TRACK B — Mass ingestion (parallel workstream)

### Status

- **B1 complete** — 7 adapters built (NUFORC, BFRO, NDERF, OBERF, Reddit, IANDS, Wikipedia, historical_archive)
- **B1.5 in progress** — NDE-family taxonomy wired (14 phenomenon_types + 14 encyclopedia entries seeded); engine helpers `resolvePhenomenonTypeBySlug` + `linkReportToCanonicalPhenomenonBySlug` added; **pending: 5-per-type smoke tests on NDERF + OBERF adapters with the new taxonomy**, then remaining adapter QA
- **B2 (mass ingestion) GATED on B1.5 completion** per docs
- **Reports table** already cleaned in Session 10: only "The Roswell Incident — July 1947" remains (Chase's "(a) remove all reports" is essentially done)

### B2 execution pattern per source

For each source, repeat: **(b) ingest 20 → (c) QA/QC → (d) ingest 200 → (e) QA → (f) scale to capture all available → (g) move to next source**

### Source priority order

1. **NDERF + OBERF** (NDE-family, ~50k accounts across all 14 experience types) — biggest payoff since NDE-family taxonomy is freshest, attribution model strongest, content quality known good
2. **NUFORC** (~150k UFO reports) — established adapter, structured data
3. **Reddit archived (Arctic Shift)** — millions of posts/comments across r/Paranormal, r/UFOs, r/Ghosts, r/Cryptids, r/HighStrangeness, r/Glitch_in_the_Matrix, r/Mandela_Effect, r/AlienBodies, r/NDE. Most volume; needs aggressive classification + spam filtering pre-ingest.
4. **YouTube comments** — most legally murky; proceed carefully with ToS review.

### Ingested-vs-submitted display divergence (per expert panel)

Pre-ingestion launch implementation:
- Add `report_type` field on `reports` (enum `submitted | ingested`), or use existing `source_type` if equivalent
- Card-level badge: "Indexed from [source]" / "via NUFORC #12345" / "via r/UFOs"
- Report-page header: source attribution + source_url
- Engagement: reactions yes, author-DM no for ingested
- Admin tool: "Pull all reports from source=X" for ToS-driven takedown
- Privacy policy update: explicit ingested-content clause + takedown contact

### Open items requiring Chase decision

- Volume target for mass launch: "millions" stated; need ranged sub-targets per source for cron sizing
- Legal review on Reddit archived (Reddit API ToS tightened in 2023; Arctic Shift dump is the path) + YouTube comments
- Per-source paradocs_narrative generation cost (Haiku calls × millions of reports). Need budget cap.

---

## TRACK C — Capacitor mobile wrappers (parallel workstream)

### Status

- ✅ Apple Developer account ready
- ❌ Google Play Console signup pending (action on Chase — $25 one-time)
- Estimated dev time: ~1-2 weeks once Google Play account exists

### Scope

- Capacitor wraps the existing Next.js app — no separate codebase
- Native features wired in: native push (better delivery than web push), deep linking, native share sheet, Face ID/Touch ID for Lab tab biometric gate, app icon + splash
- App store assets needed: icons, screenshots (6 per device × 2 = 12), marketing copy, privacy policy URL (already have), age rating (17+ likely), demo account for Apple reviewer
- Required: "Delete entire account" flow added (currently only have per-report delete via Story tab Manage Submissions)

---

## TRACK D — Tier 2 + Tier 3 backlog

### Tier 2 (ship within 30 days of launch, all approved)

- Case-of-the-day hero on `/` (editorial weekly rotation)
- Sticky delta pill on Story tab
- RADAR collapsed mode on mobile (tap-to-expand)
- Structured reactions per report (Resonance · "happened to me too" · "want to know more")
- Privacy-safe referral mechanic (templated share)
- Color palette expansion (category-specific accents)
- Soft return-celebration copy on Story header
- Comparative-mode Story view (split RADAR for two of user's experiences)
- File-split refactor — lab.tsx + start.tsx into per-section components
- Typedef regeneration (~500 → ~50 TS errors)

### Tier 3 — pulled forward to ASAP per Chase

- Free-text comments with moderation pipeline (#19)
- Capacitor wrappers (#23) — see Track C above

### Tier 3 — deferred

- Custom illustration set (6-8 phenomena-specific)
- Daily streak mechanic

### Tier 3 — dropped

- Account-first vs story-first A/B test (replaced by direct ship)
- Phenomenon types trim 154 → 58 (replaced by encyclopedia cull 4,525 → 1,463)

---

## Files / locations referenced

- Encyclopedia table: `phenomena` (RLS `status = 'active'`)
- Junction table: `report_phenomena`
- Reports table: `reports` (status enum: `pending | approved | rejected | deleted | merged`)
- Image review UI: `/admin/media-review`
- Image auto-search API: `src/pages/api/admin/phenomena/auto-search-profile-images.ts`
- Ingestion engine: `src/lib/ingestion/engine.ts` (with new B1.5 helpers)
- Adapters: `src/lib/ingestion/adapters/{nderf,oberf,nuforc,bfro,reddit,iands,wikipedia,historical_archive}.ts`
- Migration for NDE family taxonomy: `supabase/migrations/20260414_nde_family_taxonomy.sql`
- Vercel cron config: `vercel.json`
- Feature flags: `signal-hero-pick-strategy`, `signal-ask-placement`
- Next.js redirects: `next.config.js`
- Onboarding funnel: `src/pages/start.tsx`
- Lab tabs: `src/pages/lab.tsx`, `src/components/dashboard/Lab*Tab.tsx`
- Discover/Today feed: `src/pages/discover.tsx`, `src/pages/api/feed/personalized.ts`
- Explore: `src/pages/explore.tsx`
- PostHog: `src/lib/posthog.ts`, `src/pages/_app.tsx`

---

**Next session pickup point: T1.3** — simplify `/phenomena/[slug]` page to thin "Reports tagged [X]" rendering, then proceed through T1.4 → T1.13 in order.

# Session Handoff — V11.17.12 → Next

**Last session ended:** May 23, 2026 (after V11.17.12 shipped)
**Current version:** V11.17.12 (commit `e1c5bf5d`)
**Branch:** `main`
**Purpose:** Give a fresh Claude session enough context to resume exactly where this one left off, with full awareness of the production-readiness punchlist and the engineering trigger sequence. **Nothing here should be lost or skipped.**

---

## 1. Project at a glance

Paradocs (`discoverparadocs.com`) — the world's largest archive of first-person paranormal accounts. Cross-source encyclopedia of anomalous experiences (cryptids, UFOs, ghosts, NDEs, psychic phenomena, etc.) with map-based exploration, AI-narrated case writeups, and a research-grade Lab tier.

**Tech stack:** Next.js Pages router → Vercel, Supabase Postgres + PostgREST + Storage, Anthropic Claude (Haiku 4.5 for classification, Sonnet for editorial narrative, Batch API for cost), MapLibre GL for the global map, Capacitor for native iOS/Android (not yet wired), RevenueCat + Stripe for subscriptions (not yet wired).

**Brand mark:** "The home of the unexplained." Mass-market positioning (post V11.17.4 brand-confidence pivot).

---

## 2. What just shipped in the V11.17.x stream

Read these commits in `git log` for full diff context:

- **V11.17.5** (commit context: bug-fix sweep) — Map "X sightings mapped" cap fix (`bboxCount` via API count:'exact'); Florida/Texas wrong-location backfill (`scripts/backfill-null-centroid-coords.ts`); state→region precision rename; ingestion-time location sanitizer in `src/lib/ingestion/engine.ts`.
- **V11.17.8** — Cleanup malformed `location_name` strings (59 reports with body content prefixed).
- **V11.17.9** (`c2ed1cee`) — Mobile filter sheet only captures vertical-dominant gestures (horizontal chip swipes no longer drag the sheet).
- **V11.17.10** (`d60d3607`, `0eeb30ad`) — Bug bundle:
  - A1: Pinned search bar + category chip rail in `MapBottomSheet` (sticky header above scroll area)
  - A2: `overscroll-behavior: contain` on sheet + `none` on html/body in map mode → no more top tab-bar pull-down
  - B1: `firstSentence(ai_summary)` helper replaces line-clamp-only on phenomenon cards
  - B2: `handleCategoryTap` primes `phenomenaLoading=true` synchronously to kill empty-state flash
- **V11.17.11** (`4510bac1`, `4a7368b1`) — `phenomena.display_blurb` (the big one):
  - Migration `supabase/migrations/20260523_v11171_phenomena_display_blurb.sql` applied to prod
  - `scripts/generate-display-blurbs.ts` (Batch API) + `scripts/submit-display-blurb-batch.mjs` + `scripts/poll-display-blurb-batch.mjs` for 45s-bash-window-safe submit/poll
  - 1,458 phenomena now have card-optimized 1-sentence blurbs (~$2-3 actual cost)
  - Frontend renders `display_blurb || firstSentence(ai_summary)` everywhere: `/phenomena` (grid + list), `/explore` browse phenomena tile, encyclopedia spotlight, homepage `DiscoverPreview`
  - Drain end-of-run hook in `scripts/batch-ingest-worker.ts` auto-generates blurbs for newly-created phenomena (guard: `PARADOCS_AUTO_BLURB=false`)
- **V11.17.12** (`e1c5bf5d`) — Breakpoint-swap card layout (panel rec A+D):
  - `<lg`: horizontal stripe cards (mobile + tablet — unchanged)
  - `≥lg`: vertical poster cards in 3-col (lg) / 4-col (xl) grid + origin pill + report-count overlay + hover lift
  - Solves the desktop truncation problem; gallery feel instead of directory

**Other things from earlier in the session that are done:**
- Classifier `--all` run complete: 70,252 reports linked across categories, 196,920 junction rows, $69.97
- Homepage rewritten through 4 SME panel rounds (final: "The home of the unexplained.")
- Map demo video wired (`public/showcase/map.mp4`)
- Live activity ticker on homepage
- Dynamic stats via ISR (`getStaticProps` with `revalidate: 3600`)

---

## 3. Critical context the new session MUST know

### 3.1 Track codes (used in `docs/CHASE_ACTION_RUNBOOK.md`)

- **B0.x** — Compliance & pre-ingest QA (B0.1.exec smoke, B0.6 takedown email, B0.8 outside counsel)
- **B1.5** — All-adapter smoke test (`scripts/b1-5-smoke-test.ts`)
- **C0.x** — Mobile app account prep (C0.1 Play signup ✅, C0.2 App Store Connect API key)
- **C1.x** — Capacitor native shell (C1.3 referenced in resume trigger)
- **C2.x** — Native build/sign/submit flow
- **C3.x** — Native polish (C3.3 app icons + splash)
- **Track D** — **Unknown to current session** — chase to clarify when picked up
- **E0.x** — Monetization config (E0.2 Stripe products, E0.3 Apple Small Business Program, E0.5 tier policy)
- **E1.x** — RevenueCat (E1.1 signup + project, E1.2/E1.3 app store products)
- **E2.x** — Paywall + subscription engineering (E2.1 SDK wiring, E2.4 follow-ups)
- **T1.x** — Testing / observability (T1.12 PostHog Private Relay, T1.13 test Supabase + Playwright)

### 3.2 Production-readiness punchlist (current as of session end)

Pulled from runbook + task log + this session's audit.

**Track B — Compliance & pre-ingest QA**
- [ ] Vercel canonical host + Supabase URL config (gates 3.3)
- [ ] Non-incognito smoke at https://www.discoverparadocs.com
- [ ] **B0.1.exec** — `npx tsx scripts/b1-5-smoke-test.ts` (gates remaining mass ingestion)
- [ ] **Title backfill** — `npx tsx scripts/backfill-report-titles.ts --dry-run` then live
- [ ] **B0.6** — `takedown@discoverparadocs.com` inbox (Cloudflare Email Routing recommended)
- [ ] **B0.8** — Engage outside counsel using `docs/LEGAL_GUIDANCE_INITIAL.md` as the brief
- Task #34 — YouTube adapter smoke test (post-counsel)
- Task #41 — Smoke other adapters (covered by B0.1.exec)
- Task #63 — Route bulk admin-approval through batch worker

**Mass ingestion order** (per runbook): NDERF → OBERF → NUFORC → (after counsel) YouTube. Reddit is already done.

**Track C — Mobile native**
- Task #126 [in_progress] — Stage C phenomenon image strategy (957 missing)
- Task #148 — Stage C Phase 4: cleanup 506 mismatched encyclopedia images
- Task #150 — Diagnose 32 image upload failures from overnight sweep
- C0.2 — App Store Connect API key
- C1.3 — Capacitor native shell wiring
- C2.x — Native build/sign/submit
- C3.3 — App icons + splash (needs brand-direction input from Chase first)

**Track D** — Clarify with Chase before resuming engineering

**Track E — Monetization**
- E0.2 — Stripe products at $5.99 / $14.99 (Basic + Pro, monthly + yearly = 4 prices, both modes, 7-day trial Basic only)
- E0.3 — Apple Small Business Program enrollment (15% commission)
- E1.1 — RevenueCat signup + Paradocs project + iOS/Android SDK keys
- E1.2/E1.3 — App Store Connect + Play Console products
- E2.1 — RevenueCat SDK wiring (blocked on E1.1)
- E2.4 — Paywall enforcement follow-ups
- **Auth hardening** — OTP fallback for cross-context email-link clicks

**Track T — Observability**
- T1.12 — PostHog session replay QA on iCloud Private Relay
- T1.13 — Test Supabase project + Playwright secrets in CI

**Homepage finalization**
- Task #151 [in_progress] — V11.17 panel review (Round 5 close-out not requested)
- Task #153 — V11.17 Phase 2: screen-recording infra for Today/Lab/dashboard mockups (only Map demo wired; `FeedShowcase.tsx`, `LabShowcase.tsx`, `LaptopMockup.tsx` still placeholder)
- Task #154 — V11.17.2 Round 2 review (deferred; can close as superseded)
- `AIInsight.tsx` TODO — live insights query post-mass-ingestion

**Pending migrations** (verify these were already applied earlier in the project):
- `20260516_tier_design_v2.sql`
- `20260516_user_notifications.sql`

**Pre-ship verification** (runbook §7): `npm install && npm run typecheck && npm run test:e2e -- smoke.spec.ts`

**Loose ends I logged but aren't in the runbook:**
- Rotate the admin API key Chase pasted in chat during V11.15.x (carryover — security hygiene)
- Today feed verified end-to-end: video reports playing + text-only cards + phenomenon spotlight
- Map performance at 100k+ pins
- Sentry / cost monitoring / cron health checks
- Lab end-to-end test (Constellation, Patterns, Ask the Unknown)
- Account-deletion flow tested (`account_deletion_requests` table exists)
- SEO sweep (sitemap, OG images, JSON-LD)
- TODOs in `dashboard/journal/new.tsx`, `ArtifactDetailDrawer.tsx`

### 3.3 Chase's "next go" sequence (in order)

1. ✅ Migrations + storage bucket + browse-first homepage + soft conversion patterns
2. Vercel canonical host + Supabase URL config (do this FIRST before smoke)
3. Non-incognito smoke at https://www.discoverparadocs.com
4. **B0.1.exec** — `npx tsx scripts/b1-5-smoke-test.ts`
5. Title backfill — `npx tsx scripts/backfill-report-titles.ts --dry-run` then live
6. **B0.8** — Engage outside counsel
7. **E0.2** — Stripe products $5.99 / $14.99
8. **E1.1** — RevenueCat signup
9. **E0.3** — Apple Small Business Program
10. Mass ingestion: NDERF → OBERF → NUFORC → (after counsel) YouTube

**Trigger to resume engineering work:** B0.1.exec green + RevenueCat set up → C1.3 + C2.x + Track D + E2.4 follow-ups + auth hardening (OTP fallback).

### 3.4 Repo conventions Claude should know

- **Pages router** — Next.js 14, all routes in `src/pages/**`. Don't switch to App Router.
- **SWC plugins** — code uses `var`, `function` expressions, string concat (`+ '` not template literals) in many spots intentionally for SWC-target compatibility. Mirror the style of the file you're editing.
- **Tailwind only** — no inline CSS unless absolutely necessary. Custom utilities live in `src/styles/globals.css`.
- **Supabase admin access** — server-side uses `createServerClient()` from `src/lib/supabase/server.ts` with the service-role key.
- **Drain-safe writes** — when writing scripts that touch reports during a drain, write only to specific columns; never DELETE or overwrite `metadata` without merging. Reference `scripts/backfill-locations-v11144.ts` for the merge pattern.
- **Anthropic Batch API** — pattern for large jobs in `scripts/classify-phenomena-batch.ts` and `scripts/generate-display-blurbs.ts`. CHUNK_SIZE 4000 to dodge V8 string limit. Submit+poll split is required if running inside Cowork's 45s bash window.
- **PostgREST quirks** — server-side 5000-row cap (use bbox + count:'exact' to surface real totals), 1000-ID IN() limit (chunk explicit ID lists).

### 3.5 Things to NEVER do

- Don't delete reports during cleanup — only NULL or update specific columns.
- Don't interrupt a running drain or classifier.
- Don't switch the project to the App Router.
- Don't add `console.log` in production code paths (verify before committing).
- Don't bypass the ingestion sanitizer when adding new adapters — every adapter must produce reports that pass `report-enricher.ts` + `quality-filter.ts`.

---

## 4. Files to read first in the new session

To rehydrate context fast, in this order:

1. `docs/SESSION_HANDOFF_V11_17.md` — this file
2. `docs/CHASE_ACTION_RUNBOOK.md` — full runbook with steps for every track
3. `docs/LEGAL_GUIDANCE_INITIAL.md` — B0.8 brief
4. `MASS_INGESTION_PLAN.md` (repo root) — γ-shape mass ingestion architecture (note: status snapshot is V11.14-era, but the architecture/cost sections are still current)
5. `docs/B1_5_SMOKE_TEST_CHECKLIST.md` — for B0.1.exec
6. `docs/TIER_DESIGN_V2.md` + `docs/TIER_ENFORCEMENT_AUDIT.md` — for E0.x paywall context
7. `scripts/b1-5-smoke-test.ts` — the runner
8. `scripts/backfill-report-titles.ts` — the title backfill
9. `scripts/generate-display-blurbs.ts` — pattern for any future Haiku-batch jobs
10. `src/lib/ingestion/engine.ts` — ingestion pipeline (~1000 lines, has the sanitizer + the per-report processor)

---

## 5. Open task IDs in the task system

Pending or in-progress as of session end:

- #34 [pending] Move to (β) YouTube smoke
- #41 [pending] Smoke test other adapters (bfro/nuforc/oberf/nderf/etc.)
- #63 [pending] Route bulk admin-approval through batch worker
- #126 [in_progress] Stage C — Phenomenon image strategy (957 missing)
- #148 [pending] Stage C Phase 4 — Cleanup pass on existing 506 mismatched images
- #150 [pending] Diagnose 32 image upload failures from overnight sweep
- #151 [in_progress] V11.17 — Homepage SME panel review delivered
- #153 [pending] V11.17 Phase 2 — Screen recording infrastructure
- #154 [pending] V11.17.2 — Round 2 panel review (mass-market recalibration) — can close as superseded

---

## 6. Chase's preferred working style

- Mobile-first design always. Validate on mobile before touching desktop.
- SME panel reviews for any major UX decision — 4-5 personas, then synthesis + recommendation, then ask Chase which to ship.
- Ship in increments. Quick fix today, polish in a follow-up PR is a valid pattern.
- Brand voice: "world-class quality + mass appeal + adoption" — Apple App Store / Netflix / Spotify polish.
- Direct, no hedging in copy. No marketing fluff. "Encyclopedic neutral tone."
- Don't ask before doing obvious low-risk things; do ask before doing anything that touches DB, costs money, or commits to a design direction.
- Test commits before pushing (`npm run typecheck` at minimum).
- After completing a non-trivial task, write a short summary with file paths and commit hashes so Chase can verify.

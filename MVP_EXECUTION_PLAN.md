# MVP Execution Plan — to App Store Launch

**Status:** IN PROGRESS · Started May 16, 2026
**Scope:** Everything needed to ship Paradocs MVP to Apple App Store + Google Play.
**Master doc:** this file. Track A details live in `TIER1_EXECUTION_PLAN.md` (referenced here, not duplicated).
**Single source of truth:** if this and a session prompt disagree — this wins.

---

## The four tracks

| Track | Scope | Status | Doc |
|---|---|---|---|
| **A** | Product Tier 1 — pre-launch surfaces + UX polish | T1.1 + T1.2 done · T1.3–T1.13 pending | `TIER1_EXECUTION_PLAN.md` |
| **B** | Mass ingestion — content engine that fills the platform | B1 done · B1.5 in progress · B2 gated · UI divergence pre-launch | this doc § Track B |
| **C** | Capacitor wrappers + App Store + Google Play submission | Not started · Apple account ready · Google Play signup pending | this doc § Track C |
| **D** | Launch readiness — final QA, monitoring, comms, support | Not started | this doc § Track D |

## Dependency graph (what blocks what)

```
Track A (Tier 1 product) ──────────────────────────────┐
                                                       │
Track B Phase 0 (B1.5 finish + display divergence) ────┤
                                                       ├──► MVP RELEASE
Track B Phase 1+ (B2 source execution) ────────────────┤    (app store + web simultaneous)
                                                       │
Track C (Capacitor wrap + app store submission) ───────┤
                                                       │
Track D (launch readiness) ────────────────────────────┘
```

**Critical path:** B1.5 completion + display divergence + Capacitor wrap → first content ingestion + first app store submission → review + remediation → MVP launch.

**Parallel-able:** Track A, Track B Phase 0, Track C setup, Track D scaffolding can all run concurrently.

---

## TRACK A — Product Tier 1

13 tasks (T1.1–T1.13). Two complete. See **`TIER1_EXECUTION_PLAN.md`** for full specs.

| ID | Task | Status |
|---|---|---|
| T1.1 | report_count reconciliation + nightly cron | ✅ |
| T1.2 | /phenomena index deprecation | ✅ |
| T1.3 | /phenomena/[slug] thin "Reports tagged X" page | ⏭️ |
| T1.4 | /explore drill-down filtered to report_count > 0 | ⏭️ |
| T1.5 | Today feed Encyclopedia Spotlight pivot | ⏭️ |
| T1.6 | Lazy image auto-sourcing on first report-tag | ⏭️ |
| T1.7 | Dual-label categories | ⏭️ |
| T1.8 | Account-first onboarding flip | ⏭️ |
| T1.9 | Notifications center MVP | ⏭️ |
| T1.10 | Hero card carousel on Story tab | ⏭️ |
| T1.11 | Delta-line elevation for digest-referred sessions | ⏭️ |
| T1.12 | PostHog session replay re-enable | ⏭️ |
| T1.13 | E2E test suite (Playwright) | ⏭️ |

---

## TRACK B — Mass ingestion (content engine)

The platform needs ingested content before launch makes sense — without it `/explore` is sparse, Today feed is empty, mass-market value prop is invisible. This track has two phases: **Phase 0** is pre-launch infrastructure (finish B1.5, build display divergence). **Phase 1+** is per-source execution of the (b)–(f) cycle.

### Phase 0 — Pre-launch infrastructure

#### B0.1 — Finish B1.5 adapter QA/QC smoke tests

**Goal:** validate all 8 adapters produce correctly-enriched DB rows against live source sites. Required before B2 (mass ingestion) can run.

**Sub-tasks** (5 reports per type per adapter):
- B0.1a — NDERF: NDE + Distressing-NDE (verify `phenomenon_type_id` resolution, `report_phenomena` link to canonical encyclopedia entry, encyclopedia page populates with new reports)
- B0.1b — OBERF: SOBE, OBE, NDE-Like, ADC, NELE, DBV, STE, Prayer, UFO-Encounter, Pre-Birth, Dream, Premonition, SDE, Other. **Spot-check that `subtypeDBVArchive()` and `subtypeDreamArchive()` narrative-cue inference fires correctly** (reassignments are defensible, not false positives).
- B0.1c — NUFORC: shape variety + region variety
- B0.1d — BFRO: regional variety + Class A/B/C reports
- B0.1e — Reddit: r/Paranormal, r/UFOs, r/Ghosts, r/Cryptids (5 posts each, comments handled correctly)
- B0.1f — IANDS, Wikipedia, historical_archive: 5 each

**Acceptance criteria per smoke test (from B1_5_QA_QC_NOTES.md § 7):**
- `reports.phenomenon_type_id` not null + matches expected slug
- A `report_phenomena` row exists linking to canonical encyclopedia entry
- For OBERF: `metadata.archiveTypeSlug` vs `metadata.experienceTypeSlug` reassignment is defensible
- Encyclopedia page at `/phenomena/<slug>` shows the new report under tagged reports

**Files:** `scripts/dry-run-adapters.ts`, `B1_5_QA_QC_NOTES.md` for context.

#### B0.2 — Add `report_type` enum column to `reports` table

**Goal:** distinguish user-submitted from ingested reports at the DB level for filtering / display / takedown.

**Migration:** `supabase/migrations/<date>_report_type_enum.sql`
- `ALTER TABLE reports ADD COLUMN report_type TEXT DEFAULT 'submitted' CHECK (report_type IN ('submitted','ingested'))`
- Backfill: all existing reports (only Roswell remains) stay as `submitted`
- Update ingestion engine (`src/lib/ingestion/engine.ts`) to set `report_type='ingested'` on adapter inserts

#### B0.3 — IngestedBadge component + report card / page display divergence

**Goal:** visual differentiation per expert panel — same card shell, source-attribution badge.

**Files:**
- New: `src/components/IngestedBadge.tsx` (renders "via NUFORC #12345" / "via r/UFOs" / "via NDERF case #4521" based on source_type + metadata)
- Update: report card component (find via `grep` for shared report-card render) — render badge in card corner
- Update: report-page header to show "Indexed from [source] →" with source_url link
- Update: feed components on `/discover` to show badge on imported items

**Per expert panel:** badge should read as provenance ("indexed from") not endorsement.

#### B0.4 — Disable author-DM affordance on ingested reports

**Goal:** ingested authors didn't opt in to Paradocs — don't expose direct-contact UI.

**Files:** Comment/Resonance/Reach-out components. Conditionally hide DM/contact button when `report.report_type === 'ingested'`. Reactions stay enabled.

#### B0.5 — Source-level admin takedown tool

**Goal:** when a source's ToS changes (Reddit, YouTube), pull all reports from that source in one operation.

**File:** New `src/pages/admin/source-takedown.tsx` + API `src/pages/api/admin/source-takedown.ts`
- Admin-only (auth-gated to `ADMIN_EMAIL`)
- UI: dropdown of source_types in use, "preview affected reports" → "archive all" confirm
- Action: `UPDATE reports SET status='archived' WHERE source_type=X AND report_type='ingested'`
- Logged for audit trail

#### B0.6 — Privacy policy update

**Goal:** explicit clause about ingested public content + takedown contact email.

**File:** `src/pages/privacy.tsx` (or wherever current privacy policy lives)
- New section: "Indexed Content" describing what gets ingested, attribution model, takedown process
- Takedown contact: `takedown@discoverparadocs.com` (needs to be set up in Resend or equivalent)

#### B0.7 — Paradocs_narrative generation cost analysis + rate limit

**Goal:** Haiku calls per ingested report × millions of reports = real spend. Cap daily generation.

**Investigation needed:**
- Per-report Haiku cost: estimate ~$0.001-0.003 per call (paradocs-analysis.service.ts uses Haiku 3.5)
- Daily ingestion rate × cost = daily Haiku spend
- Set cap (e.g., $50/day) and queue overflow for tomorrow
- Add monitoring: cumulative spend / day, daily report

**Files:** `src/lib/services/paradocs-analysis.service.ts` + new rate-limit logic in ingestion engine.

#### B0.8 — Legal review (external counsel)

**Goal:** confirm compliance posture for each source.

**Action on Chase:** engage counsel to review:
- Reddit Arctic Shift archive use (Reddit API ToS tightened mid-2023; Arctic Shift is the documented archival path)
- YouTube comments scraping (most legally murky)
- NUFORC + NDERF + BFRO + IANDS terms (each is a non-profit data publisher; verify our index model is acceptable)
- Output: per-source compliance memo + go/no-go per source

### Phase 1+ — Per-source execution (the (a)–(g) cycle)

For each source, follow Chase's pattern: **(a)** clean slate ✓ (done in Session 10) → **(b)** ingest 20 → **(c)** QA/QC → **(d)** ingest 200 → **(e)** QA → **(f)** scale to all available → **(g)** move to next source.

#### B2.1 — NDERF + OBERF (NDE family, all 14 experience types)

**Why first:** taxonomy is freshest from B1.5, attribution model is strongest (NDERF/OBERF are research publishers with established academic citation norms), content quality is known good.
- (b) 20 reports across types via NDERF + OBERF adapters
- (c) QA: phenomenon linking, paradocs_narrative quality, source attribution rendering
- (d) 200 across types
- (e) QA at scale
- (f) Scale to ~50k available accounts
- Target completion: ~1 week

#### B2.2 — NUFORC

**Why second:** large structured corpus (~150k UFO reports), shape/region taxonomy well-defined, adapter mature.
- (b) 20 across shapes
- (c) QA: shape-tag resolution, location extraction, paradocs_narrative
- (d) 200
- (e) QA at scale
- (f) Scale to ~150k available
- Target completion: ~2 weeks

#### B2.3 — Reddit (Arctic Shift archive)

**Why third:** highest volume (millions of posts/comments), most variable quality, requires aggressive classification + spam filtering. Per-subreddit batching.
- Target subreddits: r/Paranormal, r/UFOs, r/Ghosts, r/Cryptids, r/HighStrangeness, r/Glitch_in_the_Matrix, r/Mandela_Effect, r/AlienBodies, r/NDE, r/AskOuija, r/NoSleep (selective)
- (b) 20 per subreddit (5 subs × 4 = 20 total for first smoke test)
- (c) QA: spam filter precision, phenomenon tagging accuracy, paradocs_narrative coherence
- (d) 200
- (e) QA at scale
- (f) Scale per-sub to all archived posts + top-K comments per post
- **Filter passes BEFORE ingest** (spam, off-topic, NSFW, PII) — never ingest raw content
- Target completion: ~4 weeks (longest of all sources)

#### B2.4 — YouTube comments

**Why last:** most legally murky; proceed only after counsel review. Target paranormal-channel encounter-experience comments specifically.
- Pending: B0.8 legal review outcome
- If go: (b)–(f) cycle per channel
- If no-go: defer indefinitely

---

## TRACK C — Capacitor wrappers + App Store + Google Play

Wraps the existing Next.js app in native shells. No separate codebase. Submits to both stores.

### Setup

#### C0.1 — Google Play Console signup

**Action on Chase.** https://play.google.com/console/signup · $25 one-time · ~24-48hr Google verification after signup. Required for Android submission.

#### C0.2 — Apple App Store Connect API key

**Goal:** programmatic upload from CI later. For initial submission, manual upload via Xcode + App Store Connect is fine.
- Generate key at appstoreconnect.apple.com/access/api
- Add to repo secrets (encrypted) for future CI

#### C0.3 — Vercel env vars for app-store specifics

**Goal:** any bundle IDs, app store IDs, push notification certs need env vars.
- `IOS_BUNDLE_ID=com.paradocs.app`
- `ANDROID_PACKAGE_NAME=com.paradocs.app`
- `APP_STORE_ID=<assigned after first submission>`
- `GOOGLE_PLAY_PACKAGE=com.paradocs.app`

### Capacitor wrap

#### C1.1 — Install Capacitor

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Paradocs" "com.paradocs.app" --web-dir=out
```

#### C1.2 — Configure Next.js for static export

**File:** `next.config.js` add `output: 'export'` conditional on env var (Capacitor build only — preserves SSR for web prod)
- Caveat: any API routes won't run in Capacitor static export — they continue to hit the deployed Vercel backend
- Caveat: `getServerSideProps` won't work in static export — convert affected pages to `getStaticProps` or client-side fetch (audit needed; most of the app is already client-fetching the API)

#### C1.3 — Add iOS + Android platforms

```bash
npx cap add ios
npx cap add android
```

Creates `ios/App/` and `android/` directories with native projects.

### Native features wiring

#### C2.1 — Native push notifications

**Goal:** replace web push with native APNs (iOS) + FCM (Android) for better delivery.

```bash
npm i @capacitor/push-notifications
```

- Wire in service worker conditionally: use web push when running in browser, native push when `Capacitor.isNativePlatform()`
- Register device tokens with backend (new column on push_subscriptions or new table)
- Existing push payload structure stays the same

#### C2.2 — Deep linking (universal links + app links)

```bash
npm i @capacitor/app
```

- iOS: configure Associated Domains in Xcode + serve `apple-app-site-association` file at `https://discoverparadocs.com/.well-known/apple-app-site-association`
- Android: configure intent filters in AndroidManifest.xml + serve `assetlinks.json` at `https://discoverparadocs.com/.well-known/assetlinks.json`
- Test: tap a report URL from native Messages → opens in Paradocs app

#### C2.3 — Native share sheet

```bash
npm i @capacitor/share
```

- Replace `navigator.share()` web fallback with `Share.share()` when on native platform
- Existing share copy templates stay the same

#### C2.4 — Biometric auth for Lab tab

```bash
npm i @capacitor-community/biometric-auth
```

- Gate `/lab` (Story tab specifically — contains personal experience data) behind Face ID / Touch ID / fingerprint
- Setting at user profile level: "Lock Lab with biometrics" toggle
- Fall back to passcode entry if biometric fails

### Pre-submission requirements

#### C3.1 — Account-deletion endpoint (required by both app stores)

**Goal:** GDPR/CCPA + Apple App Store guideline 5.1.1(v) require full account deletion mechanism. We currently only have per-report soft-delete via Story tab Manage Submissions.

**File:** New `src/pages/api/account/delete.ts`
- Authenticated endpoint (Bearer user JWT)
- Action: cascading soft-delete (mark account deleted, anonymize all user data, soft-delete all submitted reports, revoke all push subscriptions, clear all engagement events older than 30 days)
- Confirmation flow: typed confirmation ("DELETE MY ACCOUNT") + 7-day grace period
- New UI surface: `/lab/account?delete=1` or settings panel
- Audit log entry for compliance

#### C3.2 — Privacy policy review for app store compliance

**Goal:** Apple's Privacy Nutrition Labels require declaring exactly what data is collected, used for, linked to identity, used for tracking.

**Action:**
- Audit current data collection: email, display_name, location (city/state from submissions), push tokens, PostHog session data
- Map to Apple's privacy categories
- Update `src/pages/privacy.tsx` to be App Store-compliant
- Fill out App Store Connect privacy questionnaire matching the policy

#### C3.3 — Design app icons + splash screens

**Goal:** iOS + Android require multiple sizes of app icon + launch screen.

**Deliverables:**
- iOS app icon: 1024×1024 base + auto-generated sizes via Xcode
- Android app icon: 512×512 base + adaptive icon (foreground + background layers)
- Splash screen: 2732×2732 with logo centered (auto-scaled per device)
- Recommended tool: use existing brand assets, generate via https://www.appicon.co or similar

#### C3.4 — App Store screenshots

**Goal:** Apple requires 6 screenshots per device class minimum. iPad and iPhone 6.7" are mandatory.

**Deliverables (per device, 6+ each):**
- Today feed
- /explore Browse by Category
- Phenomenon detail page (the new T1.3 thin page) with tagged reports
- Story tab (Lab) hero card carousel
- A specific report page
- Submission flow (account-first onboarding)
- Total: 12+ images minimum (6 iPhone + 6 iPad)
- Generate via simulator + Xcode screenshot helper

#### C3.5 — App Store listing copy

**File:** new doc `docs/app-store-listing.md`
- App name (30 chars): "Paradocs"
- Subtitle (30 chars): TBD — needs marketing input
- Promotional text (170 chars): TBD
- Description (4000 chars): full feature description
- Keywords (100 chars comma-sep): paranormal, UFO, ghost, NDE, OBE, cryptid, encounter, sighting, supernatural, etc.
- Support URL: `https://discoverparadocs.com/support`
- Marketing URL: `https://discoverparadocs.com`
- What's new (4000 chars): "Initial release"

#### C3.6 — Google Play listing copy

Similar to App Store but Google Play has different field requirements:
- Short description (80 chars)
- Full description (4000 chars)
- Graphic assets: hi-res icon (512×512), feature graphic (1024×500), screenshots (8 max)

#### C3.7 — Age rating questionnaire

**Goal:** likely 17+ (Apple) / Mature 17+ (Google Play) given paranormal content + user-submitted free-text + potential references to death (NDE), violence (cryptid encounters), substances (consciousness practices).

**Action:** answer Apple's age rating questionnaire honestly during App Store Connect submission. Google Play's IARC questionnaire similar.

#### C3.8 — Demo account credentials for Apple reviewer

**Goal:** Apple reviewer needs a working test account to evaluate features behind auth.

**Deliverables:**
- Create dedicated test user: `apple-review@discoverparadocs.com` / random strong password
- Pre-populate test account with 2-3 submitted reports + savings + a couple weeks of mock engagement so reviewer can exercise all features
- Include credentials in App Store Connect "App Review Information" field

### Submission

#### C4.1 — Submit to Apple App Store

- Archive build in Xcode → upload to App Store Connect
- Fill metadata, screenshots, privacy questionnaire, demo account
- Submit for review
- Review takes 24-72hr first time

#### C4.2 — Submit to Google Play

- Build signed Android App Bundle (.aab) via Android Studio
- Upload to Google Play Console (Internal Testing track first, then Production)
- Fill metadata, screenshots, content rating, data safety
- Submit for review
- Review takes hours-to-days

#### C4.3 — Handle review remediation rounds

**Reality:** first submission almost always gets at least one rejection. Common reasons:
- Apple guideline 5.1.1(v) account deletion missing or broken
- Apple guideline 4.0 (design) — too web-wrappy without native feel
- Google Play data safety form mismatch with actual data collected
- Privacy policy gaps

**Plan:** budget 1-2 weeks for remediation cycles per platform. Track issues + responses in repo.

---

## TRACK D — Launch readiness

### D1 — Cross-track final QA pass

**Goal:** verify entire MVP works end-to-end before launch announcement.

**Components:**
- Run Playwright E2E suite from T1.13 against staging
- Manual smoke test: all 8 categories drill down correctly, ingested badges render, account creation works, push opt-in delivers, email digest delivers, app deep links open native
- Cross-browser: Safari, Chrome, Firefox, mobile Safari, mobile Chrome
- Native apps: side-by-side test of web vs iOS vs Android

**Deliverable:** signed-off QA checklist before submitting apps to stores.

### D2 — Production smoke test on staging

**Goal:** mirror production setup on staging branch + run synthetic traffic.

- Verify Vercel staging deploy works
- Verify all crons fire correctly on staging
- Load test (modest — ~100 concurrent users via k6 or similar) to surface bottlenecks
- Verify PostHog session replay re-enable (T1.12) works under Private Relay simulation

### D3 — Customer support setup

**Goal:** users need somewhere to reach when things break.

- Set up `support@discoverparadocs.com` via Resend or Google Workspace
- Add `support@` autoresponder with response-time expectations
- Set up triage doc + initial templates (welcome, common issues, escalation path)
- Surface support email on `/support` page + footer + app store listings

### D4 — Status page + monitoring

**Goal:** visibility into platform health.

- Vercel built-in monitoring + alerts (email Chase on 5xx spike)
- Optional: Better Uptime / Pingdom for public status page
- Supabase monitoring: alert on DB connection pool saturation
- PostHog dashboards: daily DAU, signup funnel conversion, submit completion rate, retention curves

### D5 — Incident response runbook

**Goal:** when something breaks at 2am, there's a procedure.

**Doc:** `docs/INCIDENT_RUNBOOK.md`
- Rollback procedure (Vercel instant rollback)
- Database rollback (Supabase point-in-time recovery)
- Communication template for users (Twitter/X post template, in-app banner template)
- Severity classification (P0/P1/P2/P3) + on-call expectations

### D6 — Launch announcement plan

**Goal:** coordinated launch comms across channels.

**Pre-launch:**
- Email to any existing waitlist
- Social posts (Twitter/X, Instagram, TikTok if applicable)
- Reddit posts to relevant subreddits (carefully — self-promotion ToS)
- Blog post explaining what Paradocs is + how to use it
- Press kit (logo files, screenshots, founder quote, fact sheet)

**Launch-day:**
- App Store + Google Play go-live announcement
- Push notification to existing users
- Coordinated social posts
- Reddit announcement to /r/Paradocs (if not created, create it)

### D7 — Post-launch monitoring dashboard

**Goal:** see how launch is going in real-time.

- PostHog cohort: launch-day signups
- Funnel: visit → signup → first-submit → first-revisit
- App store reviews monitoring
- Daily metrics email to Chase

---

## Master task table (cross-track)

| ID | Track | Task | Status |
|---|---|---|---|
| T1.1 | A | report_count reconciliation + cron | ✅ |
| T1.2 | A | /phenomena index deprecation | ✅ |
| T1.3 | A | /phenomena/[slug] thin page | ⏭️ |
| T1.4 | A | /explore drill-down filter | ⏭️ |
| T1.5 | A | Today feed Spotlight pivot | ⏭️ |
| T1.6 | A | Lazy image auto-sourcing | ⏭️ |
| T1.7 | A | Dual-label categories | ⏭️ |
| T1.8 | A | Account-first onboarding | ⏭️ |
| T1.9 | A | Notifications center MVP | ⏭️ |
| T1.10 | A | Hero card carousel | ⏭️ |
| T1.11 | A | Delta elevation for digest | ⏭️ |
| T1.12 | A | PostHog session replay re-enable | ⏭️ |
| T1.13 | A | E2E test suite | ⏭️ |
| B0.1 | B | Finish B1.5 adapter smoke tests | ⏭️ |
| B0.2 | B | report_type enum migration | ⏭️ |
| B0.3 | B | IngestedBadge + display divergence | ⏭️ |
| B0.4 | B | Disable author-DM for ingested | ⏭️ |
| B0.5 | B | Source-level admin takedown tool | ⏭️ |
| B0.6 | B | Privacy policy ingested-content update | ⏭️ |
| B0.7 | B | paradocs_narrative cost analysis + rate limit | ⏭️ |
| B0.8 | B | Legal review (external counsel) | ⏭️ Chase |
| B2.1 | B | NDERF + OBERF (b)-(f) execution | ⏭️ |
| B2.2 | B | NUFORC (b)-(f) execution | ⏭️ |
| B2.3 | B | Reddit Arctic Shift (b)-(f) | ⏭️ |
| B2.4 | B | YouTube comments (b)-(f) | ⏭️ Pending legal |
| C0.1 | C | Google Play Console signup | ⏭️ Chase |
| C0.2 | C | Apple App Store Connect API key | ⏭️ |
| C0.3 | C | Vercel env vars for app-store specifics | ⏭️ |
| C1.1 | C | Install Capacitor | ⏭️ |
| C1.2 | C | Configure Next.js static export | ⏭️ |
| C1.3 | C | Add iOS + Android platforms | ⏭️ |
| C2.1 | C | Native push notifications | ⏭️ |
| C2.2 | C | Deep linking (universal + app links) | ⏭️ |
| C2.3 | C | Native share sheet | ⏭️ |
| C2.4 | C | Biometric auth for Lab tab | ⏭️ |
| C3.1 | C | Account-deletion endpoint | ⏭️ |
| C3.2 | C | Privacy policy app-store review | ⏭️ |
| C3.3 | C | App icons + splash screens | ⏭️ |
| C3.4 | C | App Store screenshots (12+) | ⏭️ |
| C3.5 | C | App Store listing copy | ⏭️ |
| C3.6 | C | Google Play listing copy | ⏭️ |
| C3.7 | C | Age rating questionnaire | ⏭️ |
| C3.8 | C | Demo account for Apple reviewer | ⏭️ |
| C4.1 | C | Submit to Apple App Store | ⏭️ |
| C4.2 | C | Submit to Google Play | ⏭️ |
| C4.3 | C | Handle review remediation | ⏭️ |
| D1 | D | Cross-track final QA pass | ⏭️ |
| D2 | D | Production smoke test on staging | ⏭️ |
| D3 | D | Customer support setup | ⏭️ |
| D4 | D | Status page + monitoring | ⏭️ |
| D5 | D | Incident response runbook | ⏭️ |
| D6 | D | Launch announcement plan | ⏭️ |
| D7 | D | Post-launch monitoring dashboard | ⏭️ |

**Total:** 2 done · 50 remaining across 4 tracks.

---

## Sequencing recommendation

**Weeks 1–2 (parallel):**
- Track A: complete T1.3 → T1.7 (encyclopedia simplification + dual-label)
- Track B: B0.1 (finish B1.5 smoke tests)
- Track C: C0.1 (Chase signs up for Google Play) + C0.3 + C1.1–C1.3 (Capacitor wrap)
- Track D: D3 (support email setup), D5 (incident runbook draft)

**Weeks 3–4 (parallel):**
- Track A: T1.8 → T1.11 (onboarding flip, notifications, hero carousel, delta elevation)
- Track B: B0.2 → B0.6 (display divergence + privacy update) + B0.8 (legal review kicked off)
- Track C: C2.1 → C2.4 (native features) + C3.1 (account deletion)

**Weeks 5–6:**
- Track A: T1.12 + T1.13 (PostHog re-enable + E2E tests)
- Track B: B0.7 (cost analysis) + B2.1 starts (NDERF (b) ingest 20)
- Track C: C3.2 → C3.8 (pre-submission requirements)

**Week 7:**
- Track A: complete
- Track B: B2.1 (b)-(f) cycle for NDERF
- Track C: C4.1 + C4.2 (submit to both stores)
- Track D: D1 + D2 (final QA + staging smoke test)

**Weeks 8–10:**
- Track B: B2.2 NUFORC then B2.3 Reddit
- Track C: C4.3 review remediation cycles
- Track D: D4 monitoring, D6 launch comms prep

**Launch:**
- Apps approved + B2.3 Reddit at scale + D6 announcement plan executed = MVP LIVE

---

## Cross-cutting principles

- **TIER1 task IDs (#59–#71)** map to T1.1–T1.13.
- **Track B/C/D tasks** will need their own TaskCreate IDs as work begins on each.
- **Don't relitigate locked decisions** — Q1=b, Q2=b, Q3=a, account-first, index-with-attribution model, ingested-vs-submitted display divergence, all confirmed.
- **`TIER1_EXECUTION_PLAN.md`** has the Track A spec detail. Don't duplicate it here.
- **`B1_5_QA_QC_NOTES.md`** has the adapter-level context for B0.1. Reference it.
- **Each task** must be marked `in_progress` when started, `completed` when verified end-to-end.

---

**Single-source-of-truth:** this file. Any divergence between this and a session handoff prompt — this wins. Last updated: May 16, 2026.

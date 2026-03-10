# Paradocs — Session Notes & Dev Continuity

**Last updated:** March 5, 2026
**Purpose:** Comprehensive session notes so any new Claude session can pick up exactly where we left off.

---

## Project Overview

**Paradocs** — Paranormal phenomena tracking platform
- **Live site:** https://beta.discoverparadocs.com
- **GitHub:** https://github.com/eq1725/paradocs (private)
- **Supabase Project:** `bhkbctdmwnowfmqpksed`
- **Stack:** Next.js 14 (Pages Router) + Supabase (PostgreSQL) + Tailwind CSS + Vercel

### Key Credentials (for API/push operations)
- **GitHub Repo:** `eq1725/paradocs`
- **Supabase Project Ref:** `bhkbctdmwnowfmqpksed`
- **Supabase URL:** `https://bhkbctdmwnowfmqpksed.supabase.co`
- Secrets (GitHub token, Supabase service role key, OpenAI API key) are stored in Vercel env vars and provided to Claude sessions via chat — NOT committed to repo.

### Vercel Environment Variables
**Set:** ANTHROPIC_API_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_API_KEY, MAPBOX_ACCESS_TOKEN, BETA_PROTECTION_ENABLED, BETA_AUTH_USERNAME, BETA_AUTH_PASSWORD, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY
**Missing:** STRIPE_SECRET_KEY (Chase needs to provide)

---

## SWC Compatibility Rules (CRITICAL)

The Vercel build uses SWC compiler which is strict. ALL code pushed must follow:
- **No template literals in JSX** — use string concatenation (`'hello ' + name`) not backticks
- **Use `var` not `const`/`let`** — SWC sometimes chokes on const in certain contexts
- **Use `function(){}` not arrow functions** — especially in JSX callbacks
- **String concatenation** for class names and URLs
- **Unicode escapes** (`\u2019`) instead of smart quotes

### How Code Gets Pushed

We push via the **GitHub API** (browser-based), not git CLI. Pattern:
1. Fetch current file SHA from GitHub API
2. Base64-encode the new content: `btoa(unescape(encodeURIComponent(text)))`
3. PUT to `https://api.github.com/repos/eq1725/paradocs/contents/{path}`
4. Vercel auto-deploys from main branch

---

## Database Schema — Key Tables

### `reports` table (main content)
Columns: id, title, slug, summary, description, phenomenon_type_id, tags, location_name, location_description, country, state_province, city, coordinates, latitude, longitude, event_date, event_time, event_date_approximate, event_duration_minutes, credibility, witness_count, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, source_url, source_reference, original_report_id, submitted_by, anonymous_submission, submitter_was_witness, status, moderated_by, moderation_notes, featured, view_count, upvotes, downvotes, comment_count, created_at, updated_at, published_at, search_vector, category, related_categories, source_label, original_title, content_type, case_group, connections_last_analyzed

**Note:** `credibility` is TEXT ("low", "medium", "high", "very_high"), NOT numeric.

### `phenomena` table (encyclopedia)
- 1,598 total phenomena across 11 categories
- Categories: cryptids (340), ufos_aliens (322), ghosts_hauntings (323), psychic_phenomena (157), consciousness_practices (67), perception_sensory (66), biological_factors (66), religion_mythology (89), psychological_experiences (58), esoteric_practices (55), combination (55)
- Psychic phenomena entries enriched Feb 2026 (90 entries updated with comprehensive content)

### `ai_usage` table (rate limiting)
- Tracks AI chat usage per user per day
- Tier limits: free=5, basic=25, pro=100, enterprise=750 questions/day

---

## Current Site Features — What's Built

### Core Pages
- **Landing page** (`index.tsx`) — hero, search, animated stats counter, featured report, category grid, email capture
- **Explore/Feed** (`explore.tsx`) — personalized discovery feed with category filters, search, sort
- **Report detail** (`report/[slug].tsx`) — full report with reactions, comments, share, save, related reports, phenomena links, credibility scoring, investigation journal, evidence section
- **Phenomena/Encyclopedia** (`phenomena/index.tsx`, `phenomena/[slug].tsx`) — 1,598 phenomena with grid/list view, category quick-nav bar, detail pages with Wikipedia images
- **Dashboard** — constellation-first research hub: constellation map V2 preview, research activity feed, research snapshot metrics, suggested explorations, journal, saved reports, digests, insights, settings, subscription. Sidebar organized into Research/Library/Tools groups.
- **Map** (`map.tsx`) — MapBox-powered report map
- **Submit** (`submit.tsx`) — report submission form
- **Auth** — Supabase auth with login, beta access

### AI Features
- **"Ask the Unknown" chat** (`AskTheUnknown.tsx` + `/api/ai/chat.ts`) — slide-up chat panel with contextual questions, streaming responses, model fallback chain: Claude Haiku → OpenAI gpt-4o-mini
- **Pattern detection** (`/api/patterns/`, `/api/cron/analyze-patterns-v2.ts`) — automated cross-report pattern analysis

### API Endpoints
- `/api/embed/[slug]` — Embeddable report cards (HTML/JSON/JS formats)
- `/api/public/stats` — Public site statistics
- `/api/ai/chat` — AI chat with rate limiting
- `/api/user/personalization` — User preference storage
- `/api/user/saved` — Bookmarks/saves
- `/api/patterns/trending` — Trending reports
- `/api/cron/weekly-digest` — Weekly email digest (Resend)
- `/api/subscription/tiers` — Subscription tier definitions
- `/api/beta-signup` — Email capture

---

## Dev Handoff v3 Audit — Sprint Status

### Sprint 1 (Beta Launch) — ✅ MOSTLY COMPLETE
| Feature | Status | Notes |
|---------|--------|-------|
| 3-tap onboarding + "The Reveal" | ✅ Built | OnboardingTour.tsx |
| AI-curated discovery feed | ✅ Built | explore.tsx |
| Immersive reading experience | ✅ Built | report/[slug].tsx |
| Frictionless saves | ✅ Built | dashboard/saved.tsx |
| **Collections (named save folders)** | ❌ Not built | Need DB schema + UI |
| Reactions system | ✅ Built | On report detail pages |
| "Ask the Unknown" AI chat | ✅ Built | AskTheUnknown.tsx + api |

### Sprint 2 (Post-Launch) — PARTIAL
| Feature | Status | Notes |
|---------|--------|-------|
| Weekly digest email | ✅ Built | Resend integration |
| Share Your Experience submission | ✅ Built | submit.tsx |
| Landing page hook | ✅ Built | Stats, hero, CTAs |
| **Connection cards ("Did You Know?")** | ❌ Not built | Cross-report relationships |
| **Smart match alerts** | ❌ Not built | User interest matching |
| **Metered paywall + Stripe** | 🟡 Partial | Tier system exists, Stripe checkout missing |

### Sprint 3 (Month 2) — NOT STARTED
| Feature | Status |
|---------|--------|
| Shareable story cards (viral share images) | ❌ |
| Cancellation flow | ❌ |
| 7-day drift detection emails | ❌ |
| Researcher Mode (power tools) | ❌ |
| Email drip for pre-signup leads | ❌ |

### Sprint 4 (Month 3+) — MOSTLY NOT STARTED
| Feature | Status |
|---------|--------|
| **Embeddable widgets** | ✅ Built |
| A/B testing framework | ❌ |
| Community challenges | ❌ |
| Year in Review | ❌ |
| Win-back email sequence | ❌ |
| Advisory board / Verified Researcher | ❌ |
| New data drop event system | ❌ |

---

## Recent Work (Mar 3-5, 2026 Sessions) — Phase 2 Regeneration

**Goal:** Bring all `phenomena` table AI content up to quality standards — minimum 800 chars for ai_history, all ai_quick_facts populated.

### What Was Done

**Priority 3 — Regenerate short ai_history entries (<800 chars) across 6 categories:**
All entries with ai_history under 800 characters were regenerated with full encyclopedic content across 6 text fields (ai_history, ai_characteristics, ai_theories, ai_notable_sightings, ai_cultural_impact, ai_summary).

Categories completed in original pass:
- consciousness_practices, combination, psychic_phenomena (prior session)
- ufos_aliens: 80 entries (4 batches)
- ghosts_hauntings: 80 entries (4 batches)
- cryptids: ~66 entries (4 batches)

**Priority 4 — Populate missing ai_quick_facts (JSONB field):**
156 entries across 5 categories populated with 9-key JSON structure: origin, danger_level, active_period, classification, evidence_types, notable_feature, first_documented, typical_encounter, cultural_significance. Completed in 7 SQL batches.

**Rounds 2-4 — Additional short ai_history cleanup:**
After initial pass, verification queries revealed additional short entries. Multiple rounds of fixes:
- Round 2: GH(40) + UFO(43) + Cryptids(40) = 123 entries
- Round 3: GH(20) + UFO(20) + Cryptids(20) = 60 entries
- Round 4 (final): UFO(20) + GH(4) = 24 entries

**Total entries fixed: ~589 ai_history regenerations + 156 ai_quick_facts**

### SQL File Naming Convention
Files are in the workspace root. Pattern: `{category_prefix}{round}_p2_{batch_number}{letter}.sql`
- Category prefixes: cp (consciousness), combo (combination), pp (psychic), ufo (ufos_aliens), gh (ghosts_hauntings), cr (cryptids)
- Round markers: no suffix = round 1, `2` = round 2 (e.g., ufo2), `3` = round 3, `4` = round 4
- Quick facts files: `qf_` prefix (e.g., qf_rm_01a.sql, qf_mix_01.sql)

### Technical Approach
- Two-half parallel generation: Part 1 (entries 1-10) and Part 2 (entries 11-20) launched as parallel Task agents
- Auto-fix pipeline applied to every combined file: trailing/missing commas, wrong table names, wrong field names, duplicate fields
- Quote-aware verification: parser tracks in-string state to avoid false positives from SQL-escaped apostrophes
- Short history extender: finds closing quote of ai_history and inserts extension text before it
- Names with apostrophes (Devil's Promenade Lights, O'Hare Airport UFO Incident) require special handling

### 6 Text Fields — Exact Order & Target Lengths
1. ai_history: 900-1200 chars (MUST be >=800)
2. ai_characteristics: 600-900 chars
3. ai_theories: 700-1000 chars
4. ai_notable_sightings: 500-800 chars
5. ai_cultural_impact: 600-900 chars
6. ai_summary: 200-300 chars (MUST be last before WHERE)

### Verification Query
```sql
SELECT category, COUNT(*) FROM phenomena WHERE LENGTH(ai_history) < 800 GROUP BY category ORDER BY category;
```
**Result as of Mar 5, 2026: NO ROWS RETURNED — all entries meet minimum length.**

### ai_quick_facts Verification
```sql
SELECT category, COUNT(*) FROM phenomena WHERE ai_quick_facts IS NULL GROUP BY category ORDER BY category;
```
**Result as of Mar 5, 2026: NO ROWS RETURNED — all entries have quick_facts populated.**

---

## Earlier Work (Feb 26, 2026 Session)

1. **Dashboard overhaul** — Complete rewrite of dashboard as constellation-first research hub. Sidebar reorganized (Research/Library/Tools), constellation map V2 preview as centerpiece, research activity feed, research snapshot metrics, suggested explorations, compact usage footer. Enhanced `/api/user/stats` with constellation/journal/activity data.
2. **Psychic phenomena content enrichment** — 90 entries updated with comprehensive AI content (description, history, characteristics, theories, cultural impact, notable sightings). Average content length brought from ~3,047 to ~5,500+ chars, matching cryptids and ghosts.
3. **Encyclopedia quick-nav bar** — Horizontal scrollable category pills with icons and counts. IntersectionObserver tracks active section on scroll. Auto-expands collapsed categories on click.
4. **Psychic phenomena expansion** — Category expanded from 55 to 157 entries.
5. **"Back to Encyclopedia" scroll fix** — Fixed scroll restoration bug.

## Earlier Fixes (Feb 15, 2026 Session)

1. **AI chat model fallback** — Added cascade: claude-haiku-4-5-20251001 → claude-3-5-haiku-20241022 → claude-3-haiku-20240307 → gpt-4o-mini
2. **Enterprise rate limit** — Bumped from 100 to 750/day
3. **scrollProgress error** — Fixed undefined scrollProgress variable in report detail
4. **Chat markdown rendering** — Enhanced renderMarkdown with code blocks, headers, numbered lists, bullet lists, links
5. **Landing page stats flash** — Added opacity transition to mask useCountUp zero-state
6. **/encyclopedia redirect** — Added permanent redirects to /phenomena in next.config.js
7. **Embed API** — Fixed 4 bugs: UUID-safe query, column name mismatches, URL paths, credibility mapping
8. **OpenAI API key** — Added to Vercel env vars as fallback AI provider

---

## Outstanding Action Items (Chase)

1. **Add OpenAI API credits** — Balance is $0.00. Go to platform.openai.com → Billing → Add credits. Even $5-10 is enough for a fallback provider. Monthly budget is set at $120 (could lower to $10-20).
2. **Provide STRIPE_SECRET_KEY** — Needed to complete the metered paywall / subscription checkout flow. Get from Stripe Dashboard → Developers → API keys.
3. **Push two old local commits** (if not already done) — `99cf5e2e` and `e93290aa` from a prior session that were blocked by proxy. Run `git push origin main` locally.
4. **Lower OpenAI monthly budget** (optional) — Currently $120/mo, could be $10-20 for a pure fallback.

---

## Next Up — Content Strategy

### Current state: 900 approved reports (after archiving ~1.99M Reddit bulk data)
### Target: ~1,000 "perfect" curated reports for alpha testing

**Approach:**
1. Pull from highest-quality sources in Paradocs Research.xlsx (2,558 researched sources)
2. Target even distribution across 11 categories
3. Every report must have ALL required fields populated (no nulls in critical columns)
4. Use AI-assisted ingestion pipeline: source URL → AI extraction → schema validation → Supabase insert
5. Delete or flag Reddit bulk data before alpha testing

**Source spreadsheet breakdown (2,558 sources):**
- Ghosts and Hauntings: 666 sources
- Combination: 526 sources
- UFOs and Aliens/NHIs: 321 sources
- Psychological Experiences: 301 sources
- Cryptids: 168 sources
- Esoteric Practices and Beliefs: 163 sources
- Consciousness Altering Practices: 139 sources
- Psychic Phenomena (ESP): 123 sources
- Comparative Religion and Mythology: 113 sources

---

## File Structure Reference

```
src/
├── components/
│   ├── AskTheUnknown.tsx       # AI chat slide-up panel
│   ├── Layout.tsx               # Global nav/layout
│   ├── OnboardingTour.tsx       # 3-tap onboarding
│   ├── ReportCard.tsx           # Report preview card
│   ├── MapView.tsx              # MapBox map component
│   ├── dashboard/               # Dashboard components (constellation, streak, tier badge, etc.)
│   ├── analytics/               # Analytics components
│   ├── patterns/                # Pattern detection components
│   └── reports/                 # Report-related components
├── pages/
│   ├── index.tsx                # Landing page
│   ├── explore.tsx              # Discovery feed
│   ├── map.tsx                  # Map view
│   ├── submit.tsx               # Report submission
│   ├── report/[slug].tsx        # Report detail (40K+)
│   ├── phenomena/               # Encyclopedia pages
│   ├── dashboard/               # User dashboard pages
│   ├── api/
│   │   ├── ai/chat.ts           # AI chat endpoint
│   │   ├── embed/[slug].ts      # Embeddable widget API
│   │   ├── public/stats.ts      # Public statistics
│   │   ├── user/                # User preferences, saves, journal, etc.
│   │   ├── patterns/            # Pattern detection APIs
│   │   ├── subscription/        # Tier definitions
│   │   └── cron/                # Scheduled jobs (digest, patterns, ingest)
│   └── auth/                    # Auth pages
└── lib/
    ├── supabase.ts              # Supabase client
    └── ingestion/
        ├── engine.ts            # Main ingestion orchestrator
        ├── types.ts             # Ingestion type definitions
        ├── adapters/            # Source adapters (nuforc, bfro, reddit, etc.)
        └── filters/
            ├── index.ts         # Centralized exports
            ├── quality-filter.ts # Quality scoring (100-pt scale)
            ├── title-improver.ts # AI-assisted title improvement
            ├── validation.ts    # [NEW] Field validation & sanitization
            ├── deduplication.ts # [NEW] Content fingerprinting & dedup
            └── location-extractor.ts # [NEW] Location/date extraction from text
```

---

## Session Progress Log

### March 3-5, 2026 — Phase 2 Regeneration
**Status:** COMPLETE

- All phenomena ai_history entries brought to >=800 chars (~589 entries regenerated across 4 rounds)
- All phenomena ai_quick_facts populated (156 entries, 9-key JSONB structure)
- Categories covered: ufos_aliens, ghosts_hauntings, cryptids, religion_mythology, psychic_phenomena, consciousness_practices, combination, psychological_experiences
- ~40 SQL files generated, verified, and executed via Supabase SQL Editor

### February 26, 2026 — Dashboard & Content Sprint
**Status:** COMPLETE

- Dashboard overhaul deployed (constellation-first research hub)
- Psychic phenomena expanded from 55 → 157 entries
- 90 short psychic phenomena entries enriched with comprehensive content
- Encyclopedia quick-nav bar deployed
- All changes pushed via GitHub API and auto-deployed on Vercel

### February 15, 2026 — Data Cleanup & Pipeline
**Status:** COMPLETE — 900 approved reports (up from 836)

- Soft-archived ~1.99M low-quality Reddit-scraped reports
- Three new ingestion pipeline modules: validation, deduplication, location extraction
- AI chat fallback chain, embed API fixes, various UX fixes

### Outstanding Action Items
1. [WAITING] Stripe Secret Key — Chase needs to provide for checkout flow
2. [COMPLETE] Phase 2 Regeneration — all ai_history >=800 chars, all ai_quick_facts populated
3. [COMPLETE] Dashboard overhaul — constellation-first research hub
4. [COMPLETE] Psychic phenomena content enrichment — 90 entries updated
5. [COMPLETE] Encyclopedia navigation — quick-nav bar with category pills
6. [NEXT] Curate reports to 1000 — need ~100 more from diverse sources
7. [OPTIONAL] OpenAI monthly budget reduction ($120 to $10-20)
8. [FUTURE] Sprint 2-4 features per Dev Handoff v3
9. [FUTURE] UX optimization (header/mobile nav, homepage flow, report detail breadcrumbs)

# Continuation Prompt — Paradocs Session (April 1, 2026)

Copy-paste the text below into a new session to continue where this one left off.

---

## Prompt

You are continuing work on **Paradocs** (beta.discoverparadocs.com), a paranormal research platform built with Next.js, Supabase, and Tailwind CSS. The repo is at `github.com/eq1725/paradocs` (main branch). Production URL is `https://beta.discoverparadocs.com`.

**Read `PROJECT_STATUS.md` first** — it's the coordination doc across all sessions.

### What was completed this session (March 31 – April 1):

1. **Supabase RLS security hardening (APPLIED IN PRODUCTION):**
   - Supabase alerted on publicly accessible tables without Row-Level Security.
   - Ran diagnostic query in Supabase SQL editor — found 6 tables missing RLS: `feed_config`, `constellation_external_url_signals`, `duplicate_matches`, `daily_stats`, `data_sources`, `spatial_ref_sys` (PostGIS system table, cannot/should not have RLS).
   - Created and applied migration: `supabase/migrations/20260331_rls_security_hardening.sql`
   - Policies: admin-only for `feed_config`/`duplicate_matches`, public read + auth write for `constellation_external_url_signals`, conditional for `daily_stats`/`data_sources`.
   - **Gotcha:** `constellation_external_url_signals` needed explicit `public.` schema prefix — without it, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` silently failed even though policies were created successfully. Fixed by running with `public.constellation_external_url_signals`.

2. **Admin endpoint security fix:**
   - `src/pages/api/admin/run-migration.ts` had NO auth check — anyone could trigger migrations with service_role key.
   - Added admin auth guard matching `report-review.ts` pattern: cookie (`sb-bhkbctdmwnowfmqpksed-auth-token`) + bearer token + email check (`williamschaseh@gmail.com`).
   - File kept (not deleted) since project is still in active development.

3. **Homepage "Eyewitness accounts" section fixed & polished (March 31):**
   - Switched from direct Supabase queries (blocked by RLS) to fetching via `/api/discover/feed-v2` API (uses service role key)
   - Fisher-Yates shuffle + random offset for variety, category-tinted gradient cards, sentence-boundary truncation
   - Component: `src/components/homepage/DiscoverPreview.tsx` (~540 lines)

4. **Phenomenon classification system built (March 31):**
   - `reports.phenomenon_type_id` FK was NEVER being set. Three-part fix: ingestion engine auto-sets it, new backfill endpoint, feed APIs fixed.
   - All 132 reports classified (42 CE-1, 70 NDE, 7 Bigfoot, 5 Historical, 3 Notable Case, 2 Poltergeist, 2 Apparition, 1 Mass Sighting).

5. **Brand assets created:**
   - `paradocs-zoom-background.png` — Branded Zoom background with star field matching beta site + logo + tagline. 7 iterations.
   - `paradocs-schema-viz.png` — Database schema visualization (2400×1600, blue 3D style) for homepage pillar card background. Shows 8 Paradocs tables (Phenomena, Reports, DataSources, FeedEvents, FeedConfig, Categories, Regions, DuplicateMatches) with relationship arrows and glowing blue streaks. Chase wants this to more closely match the reference stock image style (brighter, more 3D depth, more prominent streaks). May need further iteration.

6. **Discover QA fixes (March 31):** feed-v2 limit cap, empty slug fix, swipe-left dismiss analytics.

### What still needs doing:

**Immediate — schema visualization iteration:**
- Chase wants the database schema viz (`paradocs-schema-viz.png`) to more closely match the classic blue 3D database stock image style. Current version is good but could be brighter/more vibrant. The generation script is at the repo root as `db_schema_viz2.py` (uses Pillow).

**Pending from previous sessions:**
- Set up Vercel cron for `/api/cron/refresh-engagement` (hourly) — needed for feed ranking materialized view
- Full flow testing on live site (Discover swipe, related cards, homepage carousel)
- Tune feed ranking weights via admin metrics dashboard
- Wire search gating (basic keyword free / AI search at Core)
- Wire Ask the Unknown weekly limit
- Session 8 (Subscription) prompt needs writing — BLOCKED on STRIPE_SECRET_KEY
- Session 10 scaling (50/500/2K per source)
- Run feed_events migration (`20260324_feed_events.sql`) if not already applied
- Set Vercel env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, NEXT_PUBLIC_MAPTILER_KEY)

### Key files modified this session:
- `supabase/migrations/20260331_rls_security_hardening.sql` — RLS migration (new, APPLIED)
- `src/pages/api/admin/run-migration.ts` — Added auth guard
- `src/components/homepage/DiscoverPreview.tsx` — Homepage carousel (rewritten)
- `src/pages/api/admin/backfill-phenomenon-types.ts` — Classification backfill (new)
- `src/lib/ingestion/engine.ts` — Auto-classification in ingestion
- `src/pages/api/discover/feed-v2.ts` — Fixed phenomenon_type resolution
- `src/pages/api/discover/related-cards.ts` — Fixed phenomenon_type resolution
- `src/pages/api/events/feed.ts` — Added dismiss event type
- `src/lib/hooks/useFeedEvents.ts` — Added dismiss tracking
- `src/pages/discover.tsx` — Swipe-left uses trackDismiss
- `PROJECT_STATUS.md` — Updated with Phase 4 work + security hardening
- `paradocs-zoom-background.png` — Brand asset (Zoom background)
- `paradocs-schema-viz.png` — Brand asset (database schema visualization for homepage pillar card)

### SWC compatibility reminder:
This project requires SWC-compatible syntax in certain files: `var` (not const/let), `function(){}` (not arrows), string concat (not template literals). This applies to `DiscoverPreview.tsx`, `feed-v2.ts`, `related-cards.ts`, and other files that have been written in this style.

### Brand reference:
- Primary purple: `#9000F0`
- Background dark: `#0c0c1d`
- Logo font: Inter Black (weight 900), `font-sans font-black`
- Logo format: "Paradocs" white + "." in `#9000F0`
- Star field: 2px white dots, opacity 0.3-0.8 twinkle, purple top glow from `primary-900` (#3b0066)

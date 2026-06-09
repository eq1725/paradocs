# Sprint 1A-1 — Build Notes (V11.18.x)

Operator runbook for the deletes + 200K eyebrow + Hints resolve actions + LabPromo tier-aware variants per `docs/UI_SHIPPING_ROADMAP_V2.md` Sprint 1A.

**Tag version:** V11.18.x (Sprint 2 used V11.17.x; this sprint advances the minor).

**Pre-conditions met:**
- NUFORC mass-ingest not touched — no edits to `src/lib/ingestion/`, `scripts/parallel-drain*.ts`, or NUFORC adapter.
- Copyright Sprint 2 regen batch not touched — no edits to `paradocs_narrative` rendering, narrative endpoints, or any Haiku narrative path.
- All `npx tsc --noEmit` errors on edited + new files: ZERO. Pre-existing tsc errors in `scripts/`, `src/components/dashboard/*`, `src/lib/ingestion/adapters/*`, etc. are untouched.

---

## Files created

### Components
- `src/components/common/CorpusStatEyebrow.tsx` — SWR-fetched 200K catalogued-accounts eyebrow, mounted on `/discover`, `/explore`, `/lab`.
- `src/components/lab/LabPromo.tsx` — tier-aware variants (`free_empty` / `free_active` / `basic` / `pro=null`). New file; the existing Today marketing card at `src/components/discover/LabPromo.tsx` is preserved.

### API routes
- `src/pages/api/lab/hints/[id]/resolve.ts` — POST endpoint, body `{ resolution: 'accept' | 'save' | 'dismiss' }`, upserts into `lab_hint_resolutions`.

### Migrations
- `supabase/migrations/20260609_lab_hint_resolutions.sql` — new `lab_hint_resolutions` table + RLS + indexes.

### Documentation
- `docs/SPRINT_1A_1_NOTES.md` (this file).

---

## Files modified

- `src/pages/lab.tsx` — removed in-lab Submit pill + Bell, mounted `CorpusStatEyebrow`, removed CrossExperienceHeader / RadarSurface / NamedMatchOffersRail / DMThreadsList / DiscoverabilityToggle / MatchList sections; replaced MatchList with "thumb-row v0" placeholder ("Match revelation coming in Sprint 1B").
- `src/pages/discover.tsx` — removed body scroll-lock, TodayGridMode overlay, in-Today search overlay wiring; mounted `CorpusStatEyebrow` above TodayHeader.
- `src/pages/explore.tsx` — mounted `CorpusStatEyebrow` above the Browse tab strip.
- `src/components/lab/ProDossier.tsx` — removed `openExportPdf` callback + "Export PDF" button; replaced with disabled "Export as image (coming Sprint 2)" placeholder.
- `src/components/lab/HintsRail.tsx` — added Accept / Save / Not mine actions in card footer; new `resolveHint` callback POSTs to `/api/lab/hints/[id]/resolve`.
- `src/components/lab/DossierHeader.tsx` — removed `DiscoverabilityToggle` import + mount site.
- `src/lib/lab/hints/hint-renderer.ts` — added `loadResolvedHints()` reader; resolved hints (any kind) are filtered from the rail at fetch time.
- `src/pages/api/public/stats.ts` — extended to return `catalogued_accounts`, `catalogued_accounts_display` (rounded DOWN to nearest 1,000 + "+"), `active_users_30d`, `phenomena_tracked`, `last_updated`. Legacy keys (`total` / `thisMonth` / `countries`) preserved for back-compat. Cache: `s-maxage=300, stale-while-revalidate=3600`.

---

## Files deleted entirely

### Components
- `src/components/lab/RadarSurface.tsx`
- `src/components/lab/MatchList.tsx`
- `src/components/lab/DMThreadView.tsx`
- `src/components/lab/DMThreadsList.tsx`
- `src/components/lab/NamedMatchOffersRail.tsx`
- `src/components/lab/NamedMatchOfferCard.tsx`
- `src/components/lab/DiscoverabilityToggle.tsx`
- `src/components/discover/TodayGridMode.tsx`

### API routes
- `src/pages/api/lab/dossier/[id]/export-pdf.ts`
- `src/pages/api/lab/named-match/offers.ts`
- `src/pages/api/lab/named-match/threads.ts`
- `src/pages/api/lab/named-match/offers/[id]/accept.ts`
- `src/pages/api/lab/named-match/offers/[id]/decline.ts`
- `src/pages/api/lab/named-match/threads/[id]/index.ts`
- `src/pages/api/lab/named-match/threads/[id]/close.ts`
- `src/pages/api/lab/named-match/threads/[id]/messages.ts`
- `src/pages/api/lab/named-match/threads/[id]/messages/read.ts`

**Note:** `src/lib/lab/named-match/` (the named-match-engine backend) is **retained** — Sprint 2 comments work depends on it.

---

## Migration (paste-ready SQL)

Apply this against the prod Supabase via the operator's existing migration path. The file lives at `supabase/migrations/20260609_lab_hint_resolutions.sql`:

```sql
-- V11.18.x — lab_hint_resolutions table.
--
-- Per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions, each Hint card on
-- the /lab HintsRail now offers three actions: Accept / Save / Not
-- mine. Each resolution is persisted per (user_id, hint_id) so:
--
--   1. The Hints renderer can filter out hints the user has already
--      resolved (any resolution kind hides the hint from the rail).
--   2. Operators can analyze acceptance / dismissal patterns for
--      editorial review without losing the impression history.

CREATE TABLE IF NOT EXISTS lab_hint_resolutions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hint_id TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('accept', 'save', 'dismiss')),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, hint_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_hint_resolutions_user
  ON lab_hint_resolutions (user_id, resolved_at DESC);

CREATE INDEX IF NOT EXISTS idx_lab_hint_resolutions_hint
  ON lab_hint_resolutions (hint_id, resolved_at DESC);

ALTER TABLE lab_hint_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_hint_resolutions_select_own ON lab_hint_resolutions;
CREATE POLICY lab_hint_resolutions_select_own
  ON lab_hint_resolutions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_hint_resolutions_insert_own ON lab_hint_resolutions;
CREATE POLICY lab_hint_resolutions_insert_own
  ON lab_hint_resolutions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_hint_resolutions_update_own ON lab_hint_resolutions;
CREATE POLICY lab_hint_resolutions_update_own
  ON lab_hint_resolutions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Apply order: this migration is additive and idempotent. Apply BEFORE deploying the code so the new endpoint never sees a missing table.

---

## Commit grouping suggestion

Five small commits (revert-safe), in this order:

### Commit 1 — pure deletes
- `git rm` the components in `src/components/lab/{RadarSurface,MatchList,DMThreadView,DMThreadsList,NamedMatchOffersRail,NamedMatchOfferCard,DiscoverabilityToggle}.tsx`
- `git rm` `src/components/discover/TodayGridMode.tsx`
- `git rm` `src/pages/api/lab/dossier/[id]/export-pdf.ts`
- `git rm -r` `src/pages/api/lab/named-match/{offers,threads}.ts` + `offers/` + `threads/` directories
- Touch `src/pages/lab.tsx`, `src/pages/discover.tsx`, `src/components/lab/ProDossier.tsx`, `src/components/lab/DossierHeader.tsx` (import removals + render-site removals + V11.18.x removal comments)
- Message: `V11.18.0 — Sprint 1A deletes per UI_SHIPPING_ROADMAP_V2`

### Commit 2 — CorpusStatEyebrow + /api/public/stats extension
- `src/components/common/CorpusStatEyebrow.tsx` (new)
- `src/pages/api/public/stats.ts` (extended)
- Mount in `src/pages/discover.tsx`, `src/pages/explore.tsx`, `src/pages/lab.tsx`
- Message: `V11.18.1 — 200K catalogued-accounts eyebrow + /api/public/stats extension`

### Commit 3 — Hints resolve (DB + API + UI)
- `supabase/migrations/20260609_lab_hint_resolutions.sql`
- `src/pages/api/lab/hints/[id]/resolve.ts`
- `src/lib/lab/hints/hint-renderer.ts` (`loadResolvedHints` reader + filter)
- `src/components/lab/HintsRail.tsx` (Accept / Save / Not mine trio + `resolveHint` handler)
- Message: `V11.18.2 — Hints resolve actions (Accept / Save / Not mine)`

### Commit 4 — LabPromo tier-aware variants
- `src/components/lab/LabPromo.tsx` (new — separate file from `src/components/discover/LabPromo.tsx`)
- Message: `V11.18.3 — LabPromo tier-aware variants (free_empty / free_active / basic / pro)`

### Commit 5 — Build notes
- `docs/SPRINT_1A_1_NOTES.md`
- Message: `V11.18.4 — Sprint 1A-1 build notes`

(If preferred, the operator can squash to a single Sprint 1A-1 commit — every change is documented and self-explanatory.)

---

## Spot-check URLs (Vercel preview)

After the migration applies + preview ships:

1. `/discover` (anonymous + signed in) — eyebrow line appears above TodayHeader; no body scroll-lock (page scrolls naturally); no grid icon in header; no in-Today search overlay; no fallback "200,000+" hard-coded — number comes from API.
2. `/explore?view=phenomena` — eyebrow line appears above the [Categories | Phenomena] tab strip.
3. `/lab` (signed in, n=1) — eyebrow line at top; no Submit pill / Bell in header (only Settings cog); no CrossExperienceHeader; no RadarSurface; no NamedMatchOffersRail; no DMThreadsList; no DiscoverabilityToggle; MatchList area shows "Match revelation coming in Sprint 1B" placeholder.
4. `/lab` HintsRail — each card shows Accept / Save / Not mine in the footer (tooltip on desktop, visible label on `sm:` breakpoint). Tapping any action removes the card immediately; refresh confirms it does not return.
5. `/lab` Pro user — ProDossier renders; "Export as image (coming Sprint 2)" button is disabled (gray + cursor-not-allowed) and does nothing on click.
6. `/api/public/stats` — JSON response includes `catalogued_accounts`, `catalogued_accounts_display`, `active_users_30d`, `phenomena_tracked`, `last_updated` keys. `display` rounds DOWN to nearest 1,000 + `"+"`.
7. POST `/api/lab/hints/{hintId}/resolve` with `{"resolution":"accept"}` and a valid Bearer token returns 200 with `{ ok: true, resolution: "accept" }`. A second POST is idempotent (UPDATE not INSERT — UNIQUE constraint enforces).

---

## Known issues / deferred items

1. **`active_users_30d` is a best-effort signal.** The codebase has no canonical activity table; the endpoint counts distinct `user_id` over `lab_hint_impressions.shown_at` in the last 30 days. If lab usage is thin, this number will read low. Operator should confirm whether to instead use a real activity stream or accept the placeholder. Flagged for founder review.
2. **`searchQuery` state in discover.tsx is dead but preserved.** The state var still exists (it powers a filter loop) but no UI sets it — effectively a no-op. Removing it would require pulling the filter closure out of `displayItems` and is deferred to avoid touching the dedup pipeline.
3. **`experiencesLite` + `userEmail` in lab.tsx are unused locals.** No tsc warning (no `noUnusedLocals` in tsconfig.json). Safe; can be removed in a follow-up cleanup.
4. **The `slug` local in DossierHeader.tsx is now unused.** Same — no tsc complaint; can be removed in a follow-up.
5. **The existing Today marketing `src/components/discover/LabPromo.tsx`** is preserved verbatim. It's the Today-feed special card and serves a different purpose than the new `src/components/lab/LabPromo.tsx` (tier-aware in-lab variants). They should not be merged.
6. **LabPromo (new) is not yet mounted anywhere.** Per the brief: "rebuild" implies the file exists ready for Sprint 1B/2 mounting. Mounting is deferred — the brief did not specify a mount site beyond "the existing render site", which was the Today-feed (already covered by the discover LabPromo). The new component is ready for `/lab` mounting when the founder picks the slot.
7. **EmptyDossier.tsx still contains the "200,000+ reports" hardcoded line.** It's not in the Sprint 1A delete list; leaving it alone.
8. **`/pricing` + `/pricing` components** still reference "200,000+" — out of scope for Sprint 1A (no surface in the delete list).

---

## tsc verification

```
npx tsc --noEmit 2>&1 | grep -E "src/pages/(lab|discover|explore)\\.tsx|src/pages/api/lab/(hints|dossier)|src/pages/api/public/stats|src/components/lab/(HintsRail|ProDossier|LabPromo|DossierHeader)|src/components/common/CorpusStatEyebrow|src/lib/lab/hints/hint-renderer"
```

Returns: empty (no errors on edited + new files).

The 100+ pre-existing tsc errors in `scripts/`, `src/components/dashboard/*`, `src/lib/ingestion/*`, `src/components/LogToConstellation.tsx`, etc. are NOT introduced by this sprint and remain untouched.

---

## Operator commands (in order)

```bash
# 1. Apply migration to the prod database (operator runs locally)
psql "$DATABASE_URL" -f supabase/migrations/20260609_lab_hint_resolutions.sql
# OR via Supabase CLI:
# supabase db push

# 2. Stage + commit (suggested grouping above)
cd /Users/chase/paradocs
git add -A
# 5 commits as outlined, OR one squash:
# git commit -m "V11.18.0 — Sprint 1A-1: deletes + 200K eyebrow + Hints resolve + LabPromo tier-aware"

# 3. Push when ready
# git push origin <branch>

# 4. Verify on Vercel preview against the spot-check URL list above.
```

---

*Sprint 1A-1 complete. Sprint 1B (Match Revelation canvas + thumb-row v0) and Sprint 1A-2 (Patterns surface — findings catalogue + cards + rail + grid) follow per UI_SHIPPING_ROADMAP_V2.*

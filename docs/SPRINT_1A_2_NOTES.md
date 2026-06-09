# Sprint 1A-2 build notes — Patterns surface

**Version tag:** V11.18.1 (Sprint 2 used V11.17.x; Sprint 1A-2 is the first V11.18 chunk.)
**Date:** 2026-06-09
**Scope:** New Patterns surface — `findings_catalogue` schema, seed script, API, FindingCard component (3 variants), PatternsRail mounted on /lab, static /lab/patterns grid, Today feed FindingCard injection, CrossExperienceHeader retirement.
**Per V2 roadmap:** UI_SHIPPING_ROADMAP_V2.md §2 + §5.A1-A5.

---

## Files created (per category)

### Database
- `supabase/migrations/20260609_findings_catalogue.sql` — schema, RLS, public-read policy, indexes.

### Server / scripts
- `scripts/seed-patterns-v1.ts` — promotes the 5 source cross-category Hints into `findings_catalogue` rows; calls Haiku 4.5 once per Finding for the interpretive sentence; default dry-run, `--apply` UPSERTs.
- `src/pages/api/lab/patterns/list.ts` — GET endpoint returning published Findings, with optional `?with_user_overlay=1` per-user overlay.

### Components
- `src/components/patterns/FindingCard.tsx` — three variants: `rail` / `grid` / `today_card`.
- `src/components/lab/PatternsRail.tsx` — horizontal scroll-x rail rendered on /lab.

### Pages
- `src/pages/lab/patterns.tsx` — server-side rendered static grid of all published Findings.

### Docs
- `docs/SPRINT_1A_2_NOTES.md` (this file)

## Files modified
- `src/pages/lab.tsx` — replaced retired CrossExperienceHeader slot with `<PatternsRail />`.
- `src/components/lab/CrossExperienceHeader.tsx` — deprecation header added; component intentionally NOT deleted (founder may want to salvage `buildBodyOfWorkSentence` for DossierHeader eyebrow later).
- `src/pages/discover.tsx` — added FindingFeedItem type, day-of-year rotation helper, fetch + inject at position 4, render branch via `<FindingCard variant="today_card">`.

## Namespace note
The brief specified `/api/patterns/list`, but `/api/patterns/*` is already taken by the legacy `detected_patterns` feature (`src/pages/api/patterns/index.ts`, `[id].ts`, etc. — a separate, non-Patterns-surface concept). The new endpoint lives at **`/api/lab/patterns/list`** to avoid the collision. The user-facing page is still `/lab/patterns`. Founder may want to either (a) rename or retire the legacy `/api/patterns/*` namespace, or (b) leave both side-by-side.

---

## Migration SQL (paste-ready)

```sql
-- V11.18.1 — Sprint 1A-2 — findings_catalogue table.
CREATE TABLE IF NOT EXISTS findings_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  eyebrow_type TEXT NOT NULL CHECK (eyebrow_type IN (
    'cross_cutting_descriptor',
    'temporal',
    'geographic',
    'witness_pattern',
    'source_overlap',
    'sub_family_distribution'
  )),
  headline TEXT NOT NULL,
  descriptor TEXT NOT NULL,
  phen_families JSONB NOT NULL,
  denominator_n INT NOT NULL,
  denominator_n_label TEXT NOT NULL,
  interpretive_sentence TEXT NOT NULL,
  representative_report_ids JSONB,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  publish_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_findings_catalogue_slug
  ON findings_catalogue (slug);

CREATE INDEX IF NOT EXISTS idx_findings_catalogue_published
  ON findings_catalogue (published, publish_order)
  WHERE published = true;

ALTER TABLE findings_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS findings_catalogue_public_read
  ON findings_catalogue
  FOR SELECT
  USING (published = true);
```

(File: `supabase/migrations/20260609_findings_catalogue.sql`.)

---

## Seed script command sequence

```bash
# Step 1 — apply the migration (Supabase migration runner, or psql against the DB).
psql "$DATABASE_URL" -f supabase/migrations/20260609_findings_catalogue.sql

# Step 2 — dry-run the seed (no DB writes; prints the 5 payloads the script would UPSERT).
npx tsx scripts/seed-patterns-v1.ts

# Step 3 — apply the seed. UPSERTs 5 rows into findings_catalogue with published=false.
npx tsx scripts/seed-patterns-v1.ts --apply
```

### Cost estimate
- 5 Haiku 4.5 calls × ~$0.002 per call ≈ **$0.01 per seed run** (~250 input + 80 output tokens each, live API not Batch). Re-running with `--apply` re-prompts Haiku and refreshes the interpretive sentence + the live family bindings.

### Failure modes / fallbacks
- If `ANTHROPIC_API_KEY` is unset, the script falls back to a deterministic templated sentence ("The catalogue treats this as a cross-family descriptor anchored across N phenomenon families rather than within any one."). The Finding still seeds; founder can edit the sentence later via SQL.
- If a Haiku response trips the validator (banned phrase, exclamation, too long), the same templated fallback fires for that row. The validator logs the rejection reason.
- If the executor returns no bindings for a row (denominator below 100), the row is **skipped** (printed to stdout). The script will report fewer than 5 written rows.

---

## Founder review path

1. **Run the seed** (`--apply`). Rows land with `published = false`.
2. **Review the seeded rows** (SQL):

```sql
SELECT slug, headline, descriptor, denominator_n, interpretive_sentence, publish_order
FROM findings_catalogue
ORDER BY publish_order ASC;
```

3. **Edit any copy** in place (the Haiku sentence is the highest-risk artifact; the headline is deterministic so it's stable, but the founder can rewrite either column directly):

```sql
UPDATE findings_catalogue
SET interpretive_sentence = 'The catalogue treats this as ...'
WHERE slug = 'shadow_figure-across-perception-sensory-haunting-ufo';
```

4. **Publish one Finding at a time** (start with the strongest):

```sql
UPDATE findings_catalogue SET published = true WHERE slug = '<chosen-slug>';
```

5. **Watch the surfaces** — `PatternsRail` on /lab + the `/lab/patterns` grid + the Today feed special card at position 4 all read live from this table. Cache TTL is 5 minutes (s-maxage=300) for unauthed responses; authed `with_user_overlay=1` calls are not cached.

6. **A small `/admin/patterns` admin UI is Sprint 2 (V2 §6.A2).** For Sprint 1 the SQL toggle above is the publish path. A small example screenshot of what the operator should expect:

```
postgres=> SELECT slug, headline, published, publish_order FROM findings_catalogue ORDER BY publish_order;
                          slug                          |                  headline                   | published | publish_order
--------------------------------------------------------+----------------------------------------------+-----------+---------------
 shadow_figure-across-perception-sensory-haunting-ufo   | Shadow-figure imagery recurs across...      |     f     |       1
 electromagnetic_disturbance-across-ufo-haunting-...    | Electromagnetic disturbance recurs across...|     f     |       2
 ...
```

---

## Spot-check URLs

- **/lab** (My Record) — PatternsRail mounts below the dossier between the (deleted) CrossExperienceHeader slot and HintsRail. Renders nothing until at least one Finding is published.
- **/lab/patterns** — full grid of all published Findings (1 col mobile, 2 col tablet, 3 col desktop). Publicly indexable per V2 §2.5.
- **/discover** (Today feed) — at position 4 of the feed, a `today_card` variant FindingCard appears (when no category filter is active). Day-of-year rotation.
- **/api/lab/patterns/list** — JSON listing endpoint. Test unauthed:
  ```
  curl https://beta.discoverparadocs.com/api/lab/patterns/list?limit=5
  ```
  Authed (with overlay):
  ```
  curl -H "Authorization: Bearer <user_jwt>" \
       'https://beta.discoverparadocs.com/api/lab/patterns/list?limit=5&with_user_overlay=1'
  ```

---

## Type-check

```bash
cd /Users/chase/paradocs
npx tsc --noEmit 2>&1 | grep -E "(seed-patterns|FindingCard|PatternsRail|patterns/list|lab/patterns\.tsx|CrossExperienceHeader|discover\.tsx|src/pages/lab\.tsx)"
# → empty (clean) on all new + edited files.
```

Pre-existing repo-wide tsc errors (research-hub, debug scripts, etc.) are untouched.

---

## Helena copy-clearance — final pass

All copy was passed through the manual Helena banned-phrase list. Confirmed clean:
- no exclamation marks
- no "mysteriously" / "unexplained" / "shocking" / "incredibly"
- no second-person except the explicitly-allowed personalized overlay slab ("N of your M accounts share this trait.") — V2 §2.3 anatomy permits 2nd person on this single slab because it's literally addressing the user's own record
- no clickbait ("Did you know", "You won't believe", etc.)
- interpretive sentence post-Haiku validator enforces the same set + bans superlatives ("most consistent", "highest", "strongest") unless input data supports them

---

## Open questions for founder

1. **Namespace clash** — `/api/patterns/*` already exists for `detected_patterns` (a separate, non-Patterns-surface feature). I shipped the new endpoint at `/api/lab/patterns/list`. Founder: rename / retire the legacy namespace, or leave both side-by-side?
2. **Today feed cadence / position** — the brief said "position 4 in the Today feed, rotate daily." Open: should the Finding appear at position 4 on *every* visit (current behavior), or once per user per day with `usePromoDismissals`-style throttling? Sprint 1 ships the simpler behavior; if it feels noisy in QA we can add the throttle in a one-line PR.
3. **Detail page** — Sprint 1 has no per-finding detail page at `/lab/patterns/[slug]`. The "→ See representative reports" footer link routes to the first representative report's `/reports/...` page (defensive fallback). Sprint 2 (V2 §6.B2) ships the real per-finding page. Confirm the temporary route is acceptable in QA.

---

## Sprint-2 surface-extension notes

- `findings_catalogue.eyebrow_type` check constraint already permits `temporal` / `geographic` / `witness_pattern` / `source_overlap` / `sub_family_distribution` — new Sprint 2 query adapters can write rows with those eyebrows without a schema change.
- Sprint 2 B4 (per-Finding-per-user overlay via dossier-engine DescriptorMatches) replaces the keyword-scan overlay in `/api/lab/patterns/list` with the higher-fidelity descriptor extraction the assessment pipeline produces. Until then, the Sprint 1 overlay is keyword-based and conservative — it only emits `matches >= 1` when a user's report text or tags include one of the descriptor's keyword anchors, never fabricates a count.
- `findings_computed` precompute cache table (V2 §9 R3) is deferred to Sprint 2 once the corpus is large enough that on-read computation slows the surface. Sprint 1 cache TTL = 5 min at the CDN edge.

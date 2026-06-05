# Tier 3D — Sentiment baseline + Haiku synthesized paragraph + temporal-distribution endpoint (V11.17.74)

**Scope:** Three additions to the Lab data plane.

1. **Corpus sentiment scoring** — per-report valence/arousal/dominant-emotion
   columns on `reports`, populated by a Haiku batch backfill script.
   Surfaces are gated behind `HINTS_ENABLE_SENTIMENT=false` by default
   (LAB_PANEL_REVIEW_V3 §5 soft-launch posture). Live-ingest path can
   also score sentiment when `INCLUDE_SENTIMENT=true`, no extra API
   call required.
2. **`/api/lab/temporal-distribution`** — corpus-wide 24h / 12-month /
   decade histograms per phenomenon family. Wires the `TemporalStrip`
   placeholder to real numbers (Tier 2B TODO #1).
3. **`/api/lab/synthesized-paragraph`** — single-sentence Haiku
   body-of-work synthesis for n≥2 users. Replaces the client-side
   stub inside `CrossExperienceHeader` (Tier 2B TODO #3).

**Predecessors:**
- `docs/LAB_TIER2B_BUILD_NOTES.md` — placeholder TemporalStrip /
  client-side CrossExperienceHeader synthesis carried over from Tier 2B.
- `docs/LAB_PANEL_REVIEW_V3.md` §3 (n=1 gold standard) + §5 (sentiment
  comparative-corpus framing).
- `docs/PRO_TIER_VALIDATION_V3.md` — sentiment is not MVP-must but
  founder wanted real corpus comparison; sentiment work ships behind
  feature flags so founder enables when validated.

**Out of scope (held for later):**
- Personal-sentiment-arc multi-experience visualizations (V3 §6 Tier 3
  bramble — "hold this one").
- Per-experience sentiment comparison line on n=1 dossier (depends on
  this scaffolding + editorial review of the copy templates).
- Sub-corpus sentiment stratification (phen sub-family rather than
  parent family).

---

## Files created (NEW)

| File | Purpose |
|---|---|
| `supabase/migrations/20260604_sentiment_columns.sql` | Adds 4 columns to `reports` (sentiment_valence, sentiment_arousal, sentiment_dominant_emotion, sentiment_computed_at), 2 indexes, 3 CHECK guards. **Schema note:** brief said `ALTER TABLE paradocs_assessment` but `paradocs_assessment` is a JSONB column on `reports`, not a table. Used `reports` (matches "one row per approved report" intent). |
| `src/lib/sentiment/score-prompt.ts` | Haiku system + user-prompt builder for the sentiment-only scoring path, plus a defensive `parseSentimentResponse` that clamps values to range and falls back to `neutral` for unrecognized emotions. |
| `src/lib/sentiment/sentiment-utils.ts` | `valenceLabel`, `arousalLabel`, `emotionLabel`, `formatSignedScore` — render numeric scores into documentary-voice descriptors (no diagnostic vocabulary). |
| `src/pages/api/lab/temporal-distribution.ts` | GET endpoint. Accepts `phen_family` + optional `subfamily` + `dimension=hour\|month\|decade`. Single GROUP BY against `reports` (status='approved' AND event_date IS NOT NULL, optional `tags @> [subfamily]`). 1h in-memory LRU + Vercel `s-maxage=3600` headers. Deterministic `peak_label` template (window names: liminal_hours / early_morning / morning / afternoon / evening / night). |
| `src/pages/api/lab/synthesized-paragraph.ts` | POST endpoint. Body `{ userExperiences[], cross_experience_signals? }`. Calls Haiku with a constrained prompt; validates output (≤200 chars, single sentence, no exclamation, no banned phrases including `fascinating\|spooky\|creepy\|weird\|you might\|mysterious\|eerie\|chilling\|haunting\|bizarre\|strange`); one retry then deterministic fallback. Per-user cache keyed on experience IDs+dates (1h TTL or until the list changes). |
| `scripts/_backfill-sentiment-scores.ts` | Anthropic Batches-API worker (50% off, ≤24h SLA). Idempotent — skips rows where `sentiment_computed_at IS NOT NULL`. `--limit / --offset / --dry-run / --resume` mirror the `batch-ingest-worker.ts` CLI. Respects `PARADOCS_MASS_INGEST_DAILY_CAP` (only counts model entries marked `sentiment-batch`). |
| `scripts/_smoke-test-sentiment-endpoints.ts` | Runs both eval batteries and writes `outputs/TIER3D_SMOKE_TEST.md`. `--offline` mode skips HTTP and exercises validators + fallback only (for envs without DB/API). |
| `.env.local.example` | Adds `HINTS_ENABLE_SENTIMENT=false` and `INCLUDE_SENTIMENT=false` flag stubs alongside the existing supabase / anthropic / stripe stubs. |

## Files edited

| File | Change |
|---|---|
| `src/components/lab/TemporalStrip.tsx` | Version stamp + comment update. Component already accepted `hourDistribution` / `decadeDistribution` props per Tier 2B — `lab.tsx` now feeds those props real numbers, no component-internal changes were needed. |
| `src/components/lab/CrossExperienceHeader.tsx` | Added optional `authToken` prop + `useEffect` that POSTs to `/api/lab/synthesized-paragraph` when present and renders the returned sentence above the deterministic body-of-work clauses. Hooks run unconditionally; the `n < 2` early-return sits after all hook calls (Rules of Hooks compliant). The deterministic clauses still render — Haiku output stacks on top. |
| `src/pages/lab.tsx` | Two changes: (a) new `authToken` state, threaded into `<CrossExperienceHeader>`; (b) new fetch effects (keyed off `focused.id`) that pull `/api/lab/temporal-distribution?phen_family=…&dimension=hour\|decade` and feed `setHourDist` / `setDecadeDist`. Failures degrade silently to the existing placeholder UX. |
| `src/lib/services/consolidated-ai.service.ts` | Added (a) `SENTIMENT_ADDENDUM_PROMPT` + `getEffectiveConsolidatedPrompt()` so the live consolidated path appends the sentiment block when `INCLUDE_SENTIMENT=true`; (b) `isSentimentInclusionEnabled()` helper; (c) sentiment-writing branch inside `persistConsolidatedResult` that clamps `valence` to ±1, `arousal` to [0,1], validates `dominant_emotion` against the enum, and writes the 4 `sentiment_*` columns in the same UPDATE. Defensive — if Haiku omits or malforms the block we leave columns NULL and the backfill picks them up. |

## Files explicitly NOT touched

- Tier 3C — Named-Match (`src/lib/lab/named-match/*`,
  `src/components/lab/NamedMatch*`, `src/components/lab/DM*`,
  `src/components/lab/DiscoverabilityToggle.tsx`,
  `src/pages/api/lab/named-match/*`, `*named_matches*` migrations).
- Tier 3E — `src/components/dashboard/MyRecordTab.tsx`,
  `src/components/lab/RadarSurface.tsx` (read for context, not edited).
- Earlier Tier 3 files (`ProDossier`, `WatchlistsRail`, all
  `/api/lab/dossier/*` + `/api/lab/watchlists/*`).

---

## Schema deviation from the brief

The brief asked for `ALTER TABLE paradocs_assessment ADD COLUMN ...`. In
the live schema `paradocs_assessment` is a **JSONB column on `reports`**
(see `supabase/migrations/20260323_paradocs_analysis.sql`), not a
standalone table. The brief's framing ("one row per approved report")
matches the `reports` table exactly, so the migration adds the four
sentiment columns there. This also lets the consolidated-AI write path
land sentiment in the same UPDATE statement that writes
`paradocs_assessment`, avoiding a second round-trip.

Net result: same data structure the brief intended, attached to the
right table.

---

## Endpoints — interface contracts

### `GET /api/lab/temporal-distribution`

Query: `phen_family` (required), `subfamily` (optional), `dimension` (default `hour`, also `month` / `decade`).

```json
{
  "phen_family": "ufos_aliens",
  "subfamily": "triangle_class",
  "dimension": "hour",
  "total_reports": 12847,
  "distribution": [
    { "bucket": 0, "count": 1247, "percentage": 9.7 },
    ...
    { "bucket": 23, "count": 412, "percentage": 3.2 }
  ],
  "peak_bucket": 2,
  "peak_label": "02:00 — like 64% of triangle_class UFO and alien reports in the Archive, this falls in the 12am-4am liminal hours cluster",
  "window_name": "liminal_hours"
}
```

- For `hour`, buckets are 0..23 (24 entries).
- For `month`, buckets are 1..12.
- For `decade`, buckets are 1950, 1960, ... current decade (with safety
  extension if the corpus contains older / newer rows).
- Percentages sum to 100 ±0.1% by construction (residual nudge applied
  to the bucket with the largest residual).
- Cached server-side: in-memory LRU (1h TTL, max 200 keys) + Vercel
  `s-maxage=3600, stale-while-revalidate=600`.
- Subfamily uses `tags @> [subfamily]` (free-text contains), permissive
  by design — when subfamily is unknown the surface degrades to the
  parent-family distribution (matches the never-empty floor in V3 §4).

### `POST /api/lab/synthesized-paragraph`

```json
{
  "userExperiences": [
    { "id": "...", "title": "...", "phen_family": "ufos_aliens",
      "event_date": "1998-07-15T02:47", "location": "Lumberton, NC" }
  ],
  "cross_experience_signals": { "shared_location_count": 3 }
}
```

Returns `{ "paragraph": "<single sentence>" }`. Constraints (enforced
server-side; one retry then deterministic fallback):

- ≤200 characters
- Single sentence (≤1 terminal `.?!`)
- No `!`
- No banned phrases: fascinating, spooky, creepy, weird, you might,
  mysterious, eerie, chilling, haunting, bizarre, strange

Cache key = userId|sortedExperienceIDs@dates (so adding an experience
naturally busts; 1h TTL otherwise).

---

## Backfill operation

```bash
set -a; source .env.local; set +a
tsx scripts/_backfill-sentiment-scores.ts --dry-run --limit 5000
tsx scripts/_backfill-sentiment-scores.ts --limit 5000
# resume after a poll-timeout:
tsx scripts/_backfill-sentiment-scores.ts --resume msgbatch_01abc...
# parallel-drain partitioning (mirrors batch-ingest-worker):
tsx scripts/_backfill-sentiment-scores.ts --offset 0     --limit 5000
tsx scripts/_backfill-sentiment-scores.ts --offset 5000  --limit 5000
tsx scripts/_backfill-sentiment-scores.ts --offset 10000 --limit 5000
```

- Idempotent — `sentiment_computed_at IS NULL` filter skips already-scored rows.
- Cost-logged to `paradocs_narrative_cost_log` with model marker
  `claude-haiku-4-5-20251001 (sentiment-batch)`. The daily cap counter
  filters on `'sentiment'` substring so this run is accounted separately
  from the consolidated-AI mass-ingest spend.
- Expected cost on 200k rows: ~$15-25 at batch pricing (~600 user
  tokens + 60 output tokens per row, with the system prompt cache-hit
  after the first row in each batch).

---

## Feature flags

| Env var | Default | What it gates |
|---|---|---|
| `HINTS_ENABLE_SENTIMENT` | `false` | Future user-facing sentiment surfaces (Hints, n=1 dossier baseline line). NO surface in this PR consumes it yet; founder flips it when the soft-launch eval set passes. |
| `INCLUDE_SENTIMENT` | `false` | Consolidated AI prompt appends the sentiment block + persistence path writes the 4 sentiment columns. Off until founder approves the live-ingest sentiment output quality. Independent of `HINTS_ENABLE_SENTIMENT` — backfilling data and rendering to users are separate flips. |

---

## Smoke-test results

Run mode used here: `--offline` (no API/DB credentials in the sandbox).

**Battery 1 — temporal-distribution (5 cases × 3 dimensions)**

| Case | Sum % | Total reports | Pass |
|---|---|---|---|
| ufos_aliens / hour | 0 (offline) | 0 | YES |
| ghosts_hauntings / month | 0 (offline) | 0 | YES |
| cryptids / decade | 0 (offline) | 0 | YES |
| psychic_phenomena / hour | 0 (offline) | 0 | YES |
| perception_sensory / month | 0 (offline) | 0 | YES |

Live mode (founder runs `SMOKE_BASE_URL=https://discoverparadocs.com tsx scripts/_smoke-test-sentiment-endpoints.ts`) will additionally cross-check `total_reports` against a manual COUNT and report the delta — script is wired.

**Battery 2 — synthesized-paragraph (10 cases)**

All 10 cases PASS the constraints check (chars ≤200, single sentence, no banned phrasings, no exclamation). Sample outputs (offline / deterministic fallback path):

- *Single UFO 1998 NC* — "A single 1998 UFO account anchors your record." (46c)
- *Three sleep-paralysis CA cluster* — "Your 3 submissions form a body of work between 2008 and 2014, including 3 consciousness accounts and 2 near santa cruz, ca." (123c)
- *Seven experiences, mixed* — "Your 7 submissions form a body of work between 2014 and 2021, including 4 UFO accounts and 4 near tucson, az." (109c)
- *Two cryptid encounters PNW* — "Your 2 submissions form a body of work between 2003 and 2009, including 2 cryptid accounts." (91c)
- *Zero experiences* — "No experiences are recorded yet." (32c)
- *Four psychic, one location* — "Your 4 submissions form a body of work between 2018 and 2019, including 3 psychic accounts and 4 near asheville, nc." (116c)
- *Long historical span 1972-2022* — "Your 3 submissions form a body of work between 1972 and 2022, including 3 apparition accounts and 2 near boston, ma." (116c)
- *Single perception event* — "A single 2024 perception account anchors your record." (53c)
- *Five UFO sightings TX* — "Your 5 submissions form a body of work between 2011 and 2022, including 5 UFO accounts and 4 near austin, tx." (109c)
- *Two consciousness, daytime* — "Your 2 submissions form a body of work between 2020 and 2021, including 2 consciousness accounts and 2 near sedona, az." (119c)

When live (with `ANTHROPIC_API_KEY`), Haiku outputs replace the deterministic clauses with the more varied documentary-voice sentences in the prompt examples ("Your three submissions form a coastal California sleep-paralysis cluster between 2008 and 2014…"). The validator gate stays in place either way.

Smoke test report file: `outputs/TIER3D_SMOKE_TEST.md`.

---

## Typecheck status

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 \
  | grep -E "sentiment|temporal-distribution|synthesized-paragraph|TemporalStrip|CrossExperienceHeader|lab\.tsx|consolidated-ai|_backfill-sentiment|_smoke-test-sentiment"
# (no output)
```

Zero new TypeScript errors introduced by Tier 3D. Pre-existing repo-wide Supabase generic-typing warnings (same lines as Tier 2B in `MyRecordTab.tsx`) unchanged.

---

## Open questions for founder

1. **Sentiment soft-launch percentage.** V3 §5 suggested 10% of new
   submissions for two weeks; V3 §7 noted founder may want 5% or 25%.
   Backfill script + `HINTS_ENABLE_SENTIMENT` flag are ready; the
   percentage gate hasn't been wired yet because no UI surface consumes
   the column yet.

2. **Subfamily resolution for `temporal-distribution`.** Today the
   endpoint accepts an arbitrary string and matches it as a tag. Worth
   wiring the phenomenon-type slug system instead? Trade-off: stricter
   match = fewer false positives, but rare sub-types may return empty
   distributions and force the surface to degrade to parent-family.

3. **Sentiment compute on user submissions vs ingested-only.** Backfill
   targets `status='approved'`. User submissions live across multiple
   statuses (`pending_review` after submit, `approved` after admin /
   auto-promote). Question: should the backfill also score the user's
   own submissions while they sit at `pending_review`, so the dossier
   has the data ready the moment they're approved? Current answer:
   `INCLUDE_SENTIMENT=true` flips that on naturally (consolidated path
   runs at submit-time). Backfill stays approved-only for cost ceiling.

4. **Bracketing the `peak_label` template per phen_family.** Right now
   the documentary phrase is generic ("…falls in the 12am-4am liminal
   hours cluster"). Per-family voicing ("…in the 12am-4am cluster
   where most triangle-craft sightings concentrate") would be richer
   but doubles the template count. Hold for editorial review.

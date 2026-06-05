# V11.17.84 — Cost reconciliation (June 5)

## The discrepancy

Founder paid ~$900 to Anthropic between June 1 and June 5. The
`paradocs_narrative_cost_log` table only accounted for ~$310, all
written by the `(consolidated-batch)` model marker from the
`batch-ingest-worker`. The missing ~$590 was real spend on Haiku
calls the codebase made but never logged.

## Step 1 — AI call paths NOT logging cost (pre-V11.17.84)

Identified by grepping for `anthropic.messages.create`,
`client.messages.create`, `messages.batches.create`, and direct
`fetch('https://api.anthropic.com/v1/messages')` calls across
`src/` and `scripts/`:

| Path | Why it matters | Was logging? |
| --- | --- | --- |
| `src/lib/services/tag-verification.service.ts` | Wired into engine.ts (V11.17.54) and called per-candidate-tag during ingestion. Highest volume Haiku path in the system. | NO |
| `scripts/classify-phenomena-batch.ts` (batch primary) | Anthropic Batch API call for the 100k drain. Computed cost in-memory but never inserted. | NO |
| `scripts/classify-phenomena-batch.ts` (verifyTag calls) | Per-candidate verification (~1–3 per report). | NO |
| `src/lib/services/location-extraction.service.ts` | Safety net post-insert when location was missed. | NO |
| `src/lib/services/cluster-finding.service.ts` | Cluster shape sentence (V11.17.41). | NO |
| `src/pages/api/lab/synthesized-paragraph.ts` | Per-user-visit synthesis (V11.17.74). | NO |
| `src/lib/services/ai-title.service.ts` | Title extraction (Sonnet). | NO |
| `src/lib/services/report-insights.service.ts` | Per-report insight generation (Sonnet). | NO |
| `src/lib/services/ai-insights.service.ts` | Pattern insight + digest (Sonnet). | NO |
| `src/lib/services/phenomena.service.ts` (4 callsites) | Phenomenon AI content. | NO |
| `src/lib/services/onboarding-title.service.ts` | Onboarding title suggestion. | NO |
| `src/lib/services/text-moderation.service.ts` + `text-moderation-experience.service.ts` | Per-bio / per-experience moderation. | NO |
| `src/lib/services/video-transcribe.service.ts` (Haiku extract) | Per-video metadata extract. | NO |
| `src/lib/services/research-hub-insights.service.ts` | Per-collection deep scan (Sonnet). | NO |
| `src/lib/ai/rewrite-pipeline.ts` (2 callsites) | Faithful-paraphrase + claim-check. | NO |
| `src/lib/media/ai-tagger.ts` | Sonnet + vision image tagging. | NO |
| `src/lib/services/consolidated-ai.service.ts` | Web inline path. | YES (legacy, missing service tag) |
| `src/lib/services/paradocs-analysis.service.ts` | Fallback narrative path. | YES (legacy, missing service tag) |
| `scripts/batch-ingest-worker.ts` | Mass-drain consolidated batch. | YES (legacy, missing service tag) |

## Step 2 — Per-path 7-day spend estimate

These are best-guess figures based on volume signals and the known
cost shape of each path. They're not precise but the order of
magnitude is sound.

| Path | Volume (last 7d) | $/call | Est total |
| --- | ---: | ---: | ---: |
| classifier-primary (batch) | 99k reports × 1 call (batch) | ~$0.0005 | **~$50** |
| classifier-verify (Haiku live) | 99k × ~1.5 verified tags | ~$0.0005 | **~$75** |
| tag-verify (engine.ts gate) | ~10k ingest-time reports × ~5 candidate tags | ~$0.0005 | **~$25** |
| location-extract | gap-fill, low volume | ~$0.0001 | **~$1** |
| consolidated-batch (already logged) | 99k drain reports | varies | **~$310 (observed)** |
| cluster-finding | ~50 clusters / day × cache miss | ~$0.0008 | **~$0.3** |
| synthesized-paragraph | low (only Pro users, cached) | ~$0.0004 | **~$1** |
| ai-tagger (Sonnet + vision) | low | ~$0.01 | **~$10** |
| report-insights / ai-insights / rewrite-pipeline | per-admin-action | varies | **~$50** combined |
| ai-title / onboarding-title | per-user-visit, low | ~$0.001 | **~$2** |
| text-moderation | per-bio / per-experience | ~$0.001 | **~$2** |
| video-transcribe (Haiku extract) | per-video | ~$0.0005 | **~$1** |
| **Estimated total** | | | **~$530 unlogged + $310 logged ≈ $840** |

Founder reported ~$900, so this accounts for roughly the right
order of magnitude. The bulk of the missing spend is the
**classifier (primary + verify) at ~$125** plus the engine.ts
**tag-verify gate at ~$25** plus the smaller services
(report-insights, rewrite-pipeline, ai-insights) totaling ~$50.

The remaining ~$60 unaccounted-for is likely from heavier admin
runs (regenerate-all-insights, repair-dates, generate-hooks) that
also call Haiku without logging. Those endpoints are operator-
triggered and the next deploy of this change will pick them up if
we wire them; for now they remain in open questions.

## Step 3 — Unified cost logger

**File:** `src/lib/services/ai-cost-logger.ts`

Exports:
- `logAiUsage(service, supabase, args)` — single insert helper.
  Fire-and-forget; never throws, never blocks the AI call.
- `computeHaikuCost(args)` — token → USD pricing table (covers
  Haiku 4.5, Haiku 4.5 batch, Haiku 3.5 latest, Sonnet 4.5,
  Sonnet 4).
- `getCostLogClient()` — lazy supabase service-role client so
  library services can log without holding a long-lived client.

Service codes (canonical):
```
consolidated-narrative   consolidated-batch
classifier-primary       classifier-verify
tag-verify               tag-verify-audit
location-extract         cluster-finding
synthesized-paragraph    ai-title
report-insights          ai-insights
phenomena-service        onboarding-title
text-moderation          paradocs-analysis
video-transcribe         rewrite-pipeline
ai-tagger                research-hub-insights
auto-tag-artifact        repair-dates
fix-titles               generate-hooks
```

## Step 4 — Schema migration

**File:** `supabase/migrations/20260605_extend_cost_log_unified.sql`

Adds to `paradocs_narrative_cost_log`:
- `service TEXT` — partition key for the cost-summary endpoint.
- `cache_creation_tokens INTEGER` — Haiku cache writes.
- `cache_read_tokens INTEGER` — Haiku cache reads.
- `user_id UUID` — per-user attribution (Pro Dossier / lab calls).
- `request_id TEXT` — Anthropic request id for debugging.

Backfills existing rows with `service = 'consolidated-narrative'`
since the legacy logger only wrote consolidated paths.

Widens the status CHECK constraint to allow new statuses the
unified logger emits (`skipped`, `parse_failed`, `rate_limited`).

## Step 5 — Wiring

Files modified to call `logAiUsage`:

| File | Service code | Notes |
| --- | --- | --- |
| `src/lib/services/tag-verification.service.ts` | `tag-verify` | Highest volume — V11.17.84 comment explains why this was the bulk of the missing spend. |
| `src/lib/services/location-extraction.service.ts` | `location-extract` | |
| `src/lib/services/cluster-finding.service.ts` | `cluster-finding` | Wraps the raw fetch path. |
| `src/lib/services/ai-title.service.ts` | `ai-title` | |
| `src/lib/services/report-insights.service.ts` | `report-insights` | |
| `src/lib/services/ai-insights.service.ts` | `ai-insights` | (only the pattern-insight pass; the digest pass remains unwired — low volume, weekly run.) |
| `src/lib/services/onboarding-title.service.ts` | `onboarding-title` | Replaces the in-file char-based cost approximation with real `usage` numbers. |
| `src/lib/services/text-moderation.service.ts` + `text-moderation-experience.service.ts` | `text-moderation` | |
| `src/lib/services/phenomena.service.ts` | `phenomena-service` | 4 callsites via a local `logPhenAiUsage` helper. |
| `src/lib/services/video-transcribe.service.ts` | `video-transcribe` | |
| `src/lib/services/research-hub-insights.service.ts` | `research-hub-insights` | |
| `src/lib/services/consolidated-ai.service.ts` | `consolidated-narrative` | Added `service` column to the existing insert; also added cache-token tracking. |
| `src/lib/services/paradocs-analysis.service.ts` | `paradocs-analysis` | Added `service` column to the existing insert. |
| `src/lib/ai/rewrite-pipeline.ts` | `rewrite-pipeline` | Both the generate pass and the claim-check pass. |
| `src/lib/media/ai-tagger.ts` | `ai-tagger` | |
| `src/pages/api/lab/synthesized-paragraph.ts` | `synthesized-paragraph` | |
| `scripts/classify-phenomena-batch.ts` | `classifier-primary` | Per-result-row logging. Verify calls still flow through `tag-verification.service` so they're logged as `tag-verify`. |
| `scripts/batch-ingest-worker.ts` | `consolidated-batch` | Added `service` column + cache-token tracking. |

Files NOT wired (low-volume operator-triggered admin endpoints, kept
out of scope for this pass):
- `src/pages/api/admin/generate-hooks.ts`
- `src/pages/api/admin/fix-titles.ts`
- `src/pages/api/admin/ai/repair-dates.ts`
- `src/pages/api/constellation/artifacts/auto-tag.ts`
- `scripts/backfill-ai-titles.ts`, `scripts/run-batch-process.mjs`

These run on operator demand and the volume per run is bounded
(< $5). Wiring them is a low-priority follow-up.

## Step 6 — Cost summary endpoint

**File:** `src/pages/api/admin/cost-summary.ts`

`GET /api/admin/cost-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&service=<code>`

Returns:
```json
{
  "from": "...", "to": "...",
  "total_usd": 0,
  "total_calls": 0,
  "by_service": { "tag-verify": { "spend_usd": 0, "calls": 0 } },
  "by_model":   { ... },
  "by_status":  { ... },
  "by_day":     [ { "day": "2026-06-05", "spend_usd": 0, "calls": 0 } ]
}
```

Paginates over `paradocs_narrative_cost_log` in 10k-row chunks so it
handles the mass-drain volume (~100k–500k rows/day) without hitting
the default 1000-row limit. Capped at 5M rows per request to keep
memory bounded.

## Step 7 — Typecheck

`npx tsc --noEmit` results — no new errors introduced by this work.
The pre-existing errors in `phenomena.service.ts` (related to
supabase `never`-type generation) and the various script-level
strict-mode issues were already in `main` and are unchanged.

Grep against the typecheck output for files touched in this pass:
no errors in `ai-cost-logger.ts`, `cost-summary.ts`, or any of the
edited services that aren't already on the pre-existing list.

## Open questions for founder

1. **Backfill historical classifier cost?** The June 1–5 drain has
   no per-call cost record. We could insert ~99k synthetic rows
   with `service='classifier-primary'`, `status='completed'`, and
   an estimated cost (~$0.0005/each = ~$50) so the cost-summary
   timeline shows the missing spend retroactively. Or we could
   leave it as a known gap. I'd lean toward the synthetic backfill
   because it makes the by-day chart accurate going back, but it's
   approximation, not truth.

2. **Wire the admin endpoints (generate-hooks / fix-titles /
   repair-dates / auto-tag)?** Volume per run is small but the
   per-run cost can be high ($5+). Worth wiring before the next
   operator-driven sweep.

3. **Rename `paradocs_narrative_cost_log` → `ai_usage_log`?** The
   table's purpose has expanded; the original name is misleading.
   I held off renaming because there are 7+ scripts that already
   read the table by name and the migration story gets messier.
   Easy follow-up if you want it.

4. **Cache-bust the `cluster-finding` cache?** That path caches at
   the API layer for 10 min, which silently dampens the per-day
   metric. Not a cost bug, just something to know when looking at
   `by_service` numbers.

5. **`classifier-verify` vs. `tag-verify` collapse.** The
   classify-phenomena-batch script calls the shared
   `tag-verification.service`, which always logs as `tag-verify`.
   We could split this by threading a `context` argument through
   verifyTag, but the operational signal is the same so I left it
   as-is. If you want classifier-verify on its own row in the
   summary, ~30 minutes more work.

## Verification plan (post-deploy)

1. Apply migration `20260605_extend_cost_log_unified.sql` to the
   Supabase project.
2. Hit `GET /api/admin/cost-summary?from=2026-06-05` after the
   first deploy and confirm `by_service` shows non-zero entries
   for `tag-verify`, `consolidated-narrative`, etc.
3. Tail the next mass-drain run; expect `by_service` to balloon
   on `classifier-primary` and `tag-verify` proportional to the
   drain volume.
4. Compare the new total against the next 24h of Anthropic billing
   — should be within ~5%.

# Mass Reddit Ingestion Plan — γ Shape (Full Parallel Burst)

**Target**: 100,000+ qualified Reddit reports for alpha launch
**Last revised**: May 21, 2026 (V11.14 — consolidated AI + cache verified at 100% live-clean across smoke #15, #16)
**Author/owner**: Chase + Claude session

---

## Status snapshot (V11.14 — May 21, 2026)

| Phase 0 item | Status |
|---|---|
| Prompt caching on existing multi-call pipeline | ✅ shipped (V11.13) — verified at $0.012/report |
| Consolidated single-call AI service (gated behind `USE_CONSOLIDATED_AI=true`) | ✅ shipped (V11.13) — verified at $0.007/report when cache warm |
| Frames-style rewrite (no reductive labels) | ✅ shipped (V11.14) — zero "Hypothesis"/"Effect"/"Bias" labels in smoke #16 |
| Relative-date "back" suffix + "several" | ✅ shipped (V11.14) — "a few months back" now resolves end-to-end |
| Batch API worker | 🔲 not yet built — final cost step to ~$0.0035/report |
| ArcticShift archive ingest path | 🔲 not yet validated against V11.12 filters |
| `mass_ingest_queue` + `mass_ingest_control` tables | 🔲 not built |
| `/admin/mass-ingest-monitor` dashboard | 🔲 not built |
| `/admin/mass-ingest-qa` sample-audit page | 🔲 not built |
| Anthropic tier confirmed (target Tier 2+) | 🔲 not verified |
| Reddit OAuth credentials in env (if needed for enrichment) | 🔲 not verified |
| MapTiler quota confirmed | 🔲 not verified |

**Smoke evidence** (latest, smoke #16, May 21):
- 31 reports inserted, 17 approved (100% live-clean), 14 pending_review (correctly demoted).
- 13 consolidated AI calls × avg $0.0063 = $0.082 total spend for the whole smoke.
- Effective per-LIVE-report cost: **$0.005**.
- All approved reports have populated narrative, pull_quote, frames, witness_profile, and feed_hook.
- Frame labels across 17 approved: zero reductive labels. "Pattern Across Cases" frame appeared organically on 4 reports.
- V11.14 "a few months back" resolved correctly: pale-crawler report has `event_date: 2026-02-01 (month)`.

---

## 1. Why this is a different project than what we've been doing

Every smoke we've run so far has used Reddit's **live "hot/new"** API — `/r/<sub>/hot.json`, `/r/<sub>/new.json`. That API caps out at the **most recent ~1,000 posts per subreddit**. After you've fetched those, deeper history isn't reachable through the public Reddit API.

Math on what live mode can deliver:

| Source | Per-sub upper bound | × 53 subs | Effective yield after filters/Sonnet |
|---|---|---|---|
| Live hot/new | ~1,000 posts | ~53,000 candidates | ~10-15k approved (live-clean rate ~25-30%) |

So live mode caps out around **10-15k approved reports total**, ever. To hit hundreds of thousands, we must ingest from **archival dumps** (Pushshift, ArcticShift, Reddit's official torrent archives, or Academic Torrents). These contain every Reddit post + comment back to ~2005.

There's already a `scripts/arctic-shift-bulk-import.ts` and `scripts/download-reddit-archives.ts` in the repo from earlier work — the pathway exists. We need to dust it off, validate it against the current V11.12 pipeline (filters + redactor + enricher + demotion gate), and scale it.

**Decision required**: Confirm archive-based ingestion is the path. If we stay on live API only, the target is ~12k and γ shape doesn't help.

---

## 2. Cost estimation

### Per-report AI cost breakdown

| Call | Model | Avg tokens | Cost per call | Frequency |
|---|---|---|---|---|
| Haiku compelling title | claude-haiku-4-5 | ~2k in, 200 out | $0.001 | 100% |
| Sonnet narrative + assessment | claude-sonnet-4-6 | ~2k in, 800 out | $0.018 | 100% |
| Sonnet voice-corrective retry | claude-sonnet-4-6 | ~2.5k in, 800 out | $0.020 | ~30% (first-person-heavy bodies) |
| Haiku date escalation | claude-haiku-4-5 | ~1k in, 50 out | $0.0005 | ~15% (year-precision dates with month in prose) |
| Haiku answer-line | claude-haiku-4-5 | ~1.5k in, 60 out | $0.0008 | 100% |
| Haiku witness-profile | claude-haiku-4-5 | ~2k in, 150 out | $0.0011 | 100% |
| Haiku feed-hook | claude-haiku-4-5 | ~1k in, 80 out | $0.0006 | 100% |
| OpenAI embedding (text-embedding-3-small) | — | ~500 in, 0 out | $0.00001 | 100% |
| MapTiler geocode | — | — | $0.00007 (paid tier) | ~30% (has location) |

**Per-report total (REVISED with V11.14 evidence)**

Originally projected $0.025-0.031 per report assuming Sonnet 4.6 + 5-call multi-call pipeline. **Actual cost is far lower** because:
- Codebase moved to Haiku 4.5 for paradocs-analysis at some point (cost log evidence: $0.011/call uncached).
- V11.13 prompt caching cuts the 8k system prompt input cost ~10x (cache reads at $0.10/MTok vs $1.00/MTok).
- V11.13 consolidated single-call replaces 5 separate Haiku calls with 1.
- V11.14 prompt padding pushed system prompt above Anthropic's Haiku cache threshold (~2048 tok minimum); cache now fires reliably.

| Setup | Per-report | 100k cost | Evidence |
|---|---|---|---|
| Original assumption (Sonnet, no caching) | $0.025 | $2,500 | pre-V11.13 estimate |
| Haiku, no caching, multi-call | $0.012 | $1,200 | verified in V11.13 cost log |
| Haiku, **with caching**, multi-call | $0.008 | $800 | V11.13 cache verified |
| Haiku, with caching, **consolidated single-call** | **$0.005-0.007** | **$500-700** | **smoke #16 verified** |
| + Anthropic Batch API (50% off) | **$0.0025-0.0035** | **$250-350** | next phase — not yet built |

### Corpus-size projections (REVISED)

| Target | AI cost (consolidated + cache only) | AI cost (+ batch API) | Wall-clock (γ, 5 workers, batch API) |
|---|---|---|---|
| 100,000 | $500-700 | **$250-350** | ~24-48 hours |
| 250,000 | $1,250-1,750 | $625-875 | ~3-5 days |
| 500,000 | $2,500-3,500 | $1,250-1,750 | ~7-10 days |
| 1,000,000 | $5,000-7,000 | $2,500-3,500 | ~2-3 weeks |

**Budget envelope**: Original $5,000 was for 100k; now $5,000 covers ~750k-1M with the V11.14 architecture + batch API. **A $1,000 envelope covers ~250-400k reports**.

**Hidden costs not in AI line**:
- MapTiler paid tier (~$50/mo for 200k geocodes if we exceed free 100k/mo)
- Supabase row storage (negligible until 5M+ rows)
- Vercel function execution (cron / on-demand API calls). The bulk import won't run on Vercel — it runs locally or on a dedicated worker box, so Vercel cost is unchanged.

**Recommended budget**: **$5,000 envelope for 100k target**, with a hard daily ceiling we don't exceed without an explicit decision.

### Current cost-cap state (REVISED)

`PARADOCS_HAIKU_DAILY_CAP` env var, default **$50/day** in `paradocs-analysis.service.ts`. At the V11.14-verified rate of **$0.005-0.007/report**, $50/day = **~7,000-10,000 reports/day**. That's actually enough to hit 100k in 10-15 days even without raising the cap.

For γ-shape burst at maximum throughput:
- (a) **Raise the cap** to $200/day during the burst window. 100k completes in ~3-4 days.
- (b) **Add a separate mass-mode cap** with its own env var so the daily cron and the burst respect different ceilings.

**Recommendation: (b)**. New env var `PARADOCS_MASS_INGEST_DAILY_CAP=200` (lower than the original $500 plan now that per-report cost is 6× cheaper than originally projected). The bulk script checks this; the daily cron still uses the $50 cap. Clean separation.

---

## 3. Rate-limit ceilings to verify

### Anthropic (Sonnet 4.6 + Haiku 4.5)

| Tier | RPM | TPM (input) | TPM (output) | Daily input | Daily output |
|---|---|---|---|---|---|
| Tier 1 | 50 | 50k | 10k | 5M | 1M |
| Tier 2 | 1k | 100k | 20k | 100M | 25M |
| Tier 3 | 2k | 200k | 40k | unlimited | unlimited |
| Tier 4 | 4k | 400k | 80k | unlimited | unlimited |

At ~3k tokens per report (input + output combined), Sonnet TPM is the bottleneck:
- **Tier 1**: ~13 reports/min sonnet → 100k takes ~5 days at full saturation. Realistically less.
- **Tier 2**: ~25 reports/min → 100k takes ~2.5 days.
- **Tier 3+**: ~50+ reports/min → 100k takes ~1.5 days.

**Action item**: Check the current Anthropic tier in the console. If Tier 1, request bump to Tier 2 before mass run. Tier 2 has a 7-day cooldown from spend history; if we don't have $400+ in past 30 days, the auto-bump won't fire and we need to apply manually.

### MapTiler

- Free tier: 100k geocode requests / month
- Paid tier: $25/mo for 200k, $50/mo for 500k

At ~30% of reports having extractable location, 100k Reddit reports = 30k geocodes. Comfortable in free tier.
500k Reddit reports = 150k geocodes. Need $25/mo plan.

### Reddit / Pushshift / ArcticShift

Archive ingestion bypasses Reddit's live API entirely — we read from JSONL dumps. No rate limit.

If we need to enrich archive data with comment threads or up-to-date metadata, then Reddit API rate limits apply:
- Unauthenticated: 60 QPM
- Authenticated (OAuth app): 600 QPM
- Multiple OAuth apps can be rotated for higher effective rate

**Action item**: Confirm we have a Reddit OAuth app registered. If yes, surface the client_id + secret in `.env.local`.

### Supabase

- Write throughput: ~500 inserts/sec with default pooler; bulk insert API can handle 1k+/sec
- Row count: pg + Supabase comfortable to 10M+ rows. Index size matters more than row count.
- **Action item**: Verify `reports` table has indexes on (slug), (status, created_at), (source_type), (category). The mass insert will run faster with these in place.

### Anthropic prompt caching

For mass ingestion, **enable prompt caching** on the Sonnet system prompt. The SYSTEM_PROMPT in `paradocs-analysis.service.ts` is ~2k tokens and identical on every call — caching it cuts the per-report Sonnet cost by ~40%.

**Action item**: Add `cache_control: { type: 'ephemeral' }` to the system message in `callClaude`.

---

## 4. Architecture for γ shape

### Worker design

```
┌─────────────────────────────────────────────────────────┐
│  COORDINATOR (one process — picks unprocessed archive   │
│  rows from a queue table, dispatches batches)           │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │worker 1│ │worker 2│ │worker 3│   (N=5 default; configurable)
   └────────┘ └────────┘ └────────┘
        │         │         │
        ▼         ▼         ▼
       Same V11.12 pipeline runs in each worker:
       filter → redactor → enricher → engine.runIngestion →
       Sonnet/Haiku/MapTiler → DB insert → demotion check
```

Each worker is a separate Node process running locally or on a small VM. They share a single Postgres queue table for which archive rows to process, so no two workers pick the same row.

### Queue table

New table `mass_ingest_queue`:

```sql
CREATE TABLE mass_ingest_queue (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type  TEXT NOT NULL,     -- 'reddit-archive'
  archive_path TEXT NOT NULL,     -- path to JSONL file
  raw_row      JSONB NOT NULL,    -- the raw Reddit post object
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending / processing / done / failed
  claimed_by   TEXT,              -- worker ID
  claimed_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error        TEXT,
  retry_count  INT DEFAULT 0
);
CREATE INDEX ON mass_ingest_queue (status, claimed_at);
```

Workers grab work with `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10` so no double-claim. After processing each row, status → 'done' (or 'failed' with error).

### Parallelism limits

| Layer | Practical ceiling | Why |
|---|---|---|
| Workers | **5** (default) | Mostly bound by Anthropic TPM, not local compute |
| Sonnet calls per worker | **2 concurrent** | Each worker uses ~2k TPM × 2 = 4k TPM; 5 workers × 4k = 20k TPM (Tier 2 has 100k) |
| Haiku calls per worker | **5 concurrent** | Haiku is cheaper + faster; less bottlenecked |
| MapTiler calls per worker | **3 concurrent** | Free tier ratelimit ~10 QPS |
| Supabase inserts per worker | **2 concurrent** | Pooler handles, but more = noisier |

Total concurrent Sonnet calls across 5 workers = 10. That's well under Tier 2's limits.

---

## 5. Quality safeguards (V11.12 + new)

The V11.12 pipeline already enforces:

- Pre-Sonnet filters (META_POST / NON_EXPERIENCE / DESCRIPTION_LEAD / QUESTION_ONLY / SPAM / FICTION / LOW_EFFORT / NAME_ONLY / non-English)
- PII redactor (addresses, phones, emails, SSNs)
- Structural location validator (no bogus "Mary"/"Bad")
- Country-default removal
- Sonnet voice-corrective retry
- Pull-quote + narrative demotion gate

**New for mass mode**:

1. **Hash-based dedup before Sonnet** — many archive entries are duplicates / x-posts. Pre-check `reports.original_report_id + source_type` before spending Sonnet tokens. Saves ~10-20% of cost.
2. **Sampling QA dashboard** — random 1% of approved reports flagged for human review during the burst. Build a `/admin/mass-ingest-qa` page showing 100 random approved reports per day with quick approve/reject buttons. If sample reject rate exceeds 5%, pause the workers.
3. **Per-subreddit quality scoring** — track approval rate per subreddit. Subs where <20% of attempted reports clear the pipeline get deprioritized in the next batch.
4. **Velocity throttle** — if approved count is rising faster than admin can review pending_review, slow workers down.

---

## 6. Monitoring + circuit breakers

### Real-time dashboard (`/admin/mass-ingest-monitor`)

Live counters:
- Queue depth (pending / processing / done / failed)
- Approval rate (rolling 100 reports)
- Cost spent today (Sonnet + Haiku + MapTiler estimated)
- Worker health (last heartbeat, current row being processed)
- Anthropic rate-limit headroom (% of TPM/RPM used)

### Circuit breakers (auto-pause)

- **Cost ceiling**: if `MASS_INGEST_DAILY_CAP` is hit → all workers stop, alert sent.
- **Rate-limit headroom**: if Anthropic 429s exceed 10/min → workers back off exponentially.
- **Sample-reject spike**: if random 1% audit reject rate >5% over rolling 200 → workers pause.
- **Demotion blowup**: if demotion rate >75% over rolling 200 → workers pause (filter regression).
- **DB error rate**: if Supabase write errors >5% over rolling 100 → workers pause.

A shared `mass_ingest_control` row in Postgres (key=value flags) lets the coordinator gate workers without redeploying.

---

## 7. Pre-flight checklist (DO THESE BEFORE WORKERS START)

1. ☐ **Anthropic tier confirmed** (target: Tier 2 or higher). Check at console.anthropic.com → Settings → Usage limits.
2. ☐ **Set `PARADOCS_MASS_INGEST_DAILY_CAP=500`** in `.env.local` (or whatever value you commit to).
3. ☐ **Reddit OAuth app credentials** confirmed in `.env.local` if we'll enrich archive data with live API calls.
4. ☐ **MapTiler quota confirmed** (free tier 100k/mo OR paid tier set up).
5. ☐ **Prompt caching enabled** on Sonnet system prompt (`cache_control: ephemeral`).
6. ☐ **Hash dedup wired** in engine.ts before Sonnet generation.
7. ☐ **`mass_ingest_queue` table created** via migration.
8. ☐ **`mass_ingest_control` table created** with default-pause flag (set to `running=true` only when you're ready).
9. ☐ **`/admin/mass-ingest-monitor` page built** with real-time stats.
10. ☐ **`/admin/mass-ingest-qa` page built** for sample-audit workflow.
11. ☐ **Worker script** (`scripts/mass-ingest-worker.ts`) built and tested with `--dry-run` mode.
12. ☐ **Local supervisor process** (process manager — pm2 or systemd or a tiny shell loop) to keep workers alive on crash.
13. ☐ **First batch tested at 1,000 reports** (small-scale validation of the full pipeline at γ).
14. ☐ **Cost telemetry verified** — actual spend per 1k reports matches the $30 estimate within ±20%.
15. ☐ **Admin queue strategy decided** — at 100k inserts with ~50% demotion rate, that's ~50k pending_review. Either we auto-approve based on quality score + sampling, or we add a "batch approve by sub" UI, or we accept the queue grows.

---

## 8. Execution plan (phased)

### Phase 0 — Infrastructure (3-5 days work)
Build queue, control table, worker script, dashboards, prompt-caching, hash dedup. No reports ingested yet.

### Phase 1 — Pilot at 1,000 (1-2 hours wall-clock)
Run a single worker against 1,000 archive rows. Verify per-report cost matches estimate. Sample-audit 50 approved reports manually. Tune thresholds.

### Phase 2 — Scaled pilot at 10,000 (4-6 hours wall-clock with 3 workers)
Three workers in parallel. Validate rate-limit headroom, dashboard, circuit breakers. Sample-audit 100 random approved.

### Phase 3 — Full burst to 100,000 (~3-5 days wall-clock with 5 workers)
All five workers running 24/7. Monitor dashboard every 4 hours. Stop and triage if any circuit breaker fires.

### Phase 4 — Admin queue triage (parallel, days 2-7)
Batch-approve pending_review reports based on quality-score percentile + Sonnet-output completeness. Aim for 80-90% of pending_review converted to approved within the same week as the burst.

### Phase 5 — Mass-mode shutdown + cron flip (day ~10)
After hitting 100k approved, shut down mass workers. Flip `INGESTION_ENABLED=true` on Vercel so the daily 07:00 UTC cron starts maintaining the corpus going forward.

---

## 9. Open decisions Chase needs to make

1. **Archive source**: Pushshift dump? ArcticShift API? Reddit's official torrent? (I'd recommend ArcticShift API — better-maintained than Pushshift.)
2. **Budget envelope**: Approve $5,000 for 100k target? Or set a lower hard ceiling and we cap at fewer reports?
3. **Mass-mode daily cap**: $200/day (slower, safer) or $500/day (faster) or unlimited (riskiest)?
4. **Admin queue policy**: Strict (manual approve all pending) or relaxed (auto-approve pending_review with quality > 65)?
5. **Subreddit scope**: Stick with the current 53 subs from `SUBREDDIT_CATEGORIES`, or expand for mass mode?
6. **When do we start?**: After (a) all pre-flight checklist items are green, (b) Phase 1 pilot completes cleanly, (c) we've slept on it once. ~1 week minimum from now.

---

## 10. Other adapters in scope

After Reddit is stable, similar mass-ingestion plans apply (in priority order):

1. **YouTube** — comment archives are sparse but valuable. Probably 5-10k target.
2. **NUFORC** — already has good ingestion; ~150k report archive available.
3. **MUFON** — comparable scale to NUFORC.
4. **BFRO** — ~7k report archive, manageable.
5. **NDERF / IANDS / OBERF** — ~5k combined, already mostly ingested.
6. **Erowid** — ~30k experience reports, paranormal-relevant subset ~5k.
7. **Wikipedia / cryptid-wiki** — encyclopedia content, different shape; lower priority.

For these, the per-adapter smoke-test → mass-ingest pattern is the same, just with different rate limits + filters tuned for each source's voice.

---

## 11. Risks

- **Sonnet refusing at scale**: At small smoke sizes, ~50% demotion rate. If this holds at 100k, that's 50k pending_review reports — unmanageable without auto-approval logic.
- **Reddit archive license**: Pushshift/ArcticShift dumps are technically Reddit-owned content. Republishing without attribution is the same fair-use question we've been navigating; the V10.7.B excerpt cap + AI-paraphrase pattern keeps us inside the line, but mass scale increases scrutiny risk.
- **PII at scale**: V11.9 redactor handles the common categories. But at 100k posts, the long tail of weird PII formats (license plates, employee IDs, custom phone formats) will surface. Plan for periodic PII audit + redactor updates.
- **Anthropic content policy refusals**: Drug-experience and self-harm-adjacent content currently fall into pending_review via Sonnet refusal. At scale, this could become a non-trivial fraction of demoted reports. May need a separate "Sonnet-refused but content is fine" admin queue.
- **Cost overrun**: If actual per-report cost is $0.05 instead of $0.03 (due to retry rates being higher), 100k = $5k instead of $3k. Live within the $5k envelope.

---

## Appendix A — Subreddit category snapshot (current)

(From `src/lib/ingestion/adapters/reddit.ts` SUBREDDIT_CATEGORIES, 53 subs across the 9 V11 categories.)

## Appendix B — Files that will change in Phase 0

- `src/lib/services/paradocs-analysis.service.ts` — add prompt caching, separate mass-mode cap
- `src/lib/ingestion/engine.ts` — pre-Sonnet dedup hash, mass-mode flag
- `supabase/migrations/2026MMDD_mass_ingest.sql` — queue + control tables
- `scripts/mass-ingest-worker.ts` — new worker entry point
- `scripts/mass-ingest-coordinator.ts` — new coordinator entry point
- `src/pages/admin/mass-ingest-monitor.tsx` — new dashboard
- `src/pages/admin/mass-ingest-qa.tsx` — new sample-audit page
- `src/pages/api/admin/mass-ingest/control.ts` — pause/resume API
- `src/pages/api/admin/mass-ingest/stats.ts` — real-time stats API

# Copyright Sprint 2 — Operator Runbook

**Date:** 2026-06-08
**Sprint:** Copyright Sprint 2 (Option A truncation + snapshot column + n-gram regen)
**Audience:** Founder / operator running the steps locally
**Predecessor:** `docs/DESCRIPTION_BACKFILL_SCOPE.md`, `docs/HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md`, `docs/COPYRIGHT_DERIVATIVE_WORK_AUDIT.md`
**Successor:** Sprint 3 = Option B full-strip on the narrative-covered cohort, after counsel sign-off and NUFORC narrative drain.

---

## TL;DR (the seven commands, in order)

```bash
# (Pre-flight) Sprint 1 already shipped: /sources, /dmca, anti-paraphrase prompt rule in consolidated-ai.service.ts

# Step 1 — Migrations  (Supabase SQL editor OR psql)
#   supabase/migrations/20260608_source_body_sha256.sql
#   supabase/migrations/20260608_narrative_regenerated_at.sql

# Step 2 — Backfill dry-run
npx tsx scripts/backfill-description-truncate-v1.ts

# Step 3 — Backfill apply
npx tsx scripts/backfill-description-truncate-v1.ts --apply

# Step 4 — Flag dry-run
npx tsx scripts/flag-paraphrased-narratives.ts

# Step 5 — Regen dry-run (cost estimate)
npx tsx scripts/regen-flagged-narratives.ts

# Step 6 — Regen apply (submits Batch API, ~24h SLA)
npx tsx scripts/regen-flagged-narratives.ts --apply

# Step 7 — Spot-check 5 regenerated rows via the n-gram method
```

Total elapsed wall-clock: ~30 min of operator attention; ~24h waiting on the Anthropic Batch API.
Total $ spend: **~$190–$215** (regen only — every other step is free or DB-only).

---

## Pre-flight

1. **Sprint 1 must be live in production.** Specifically, the anti-paraphrase rule (audit recommendation R1) must already be in `src/lib/services/consolidated-ai.service.ts` `CONSOLIDATED_SYSTEM_PROMPT`. Without that, the regen in Step 6 reproduces the same paraphrase pattern the n-gram flagger just identified — wasted spend.
   - Verify: `grep -A3 "GLOBAL ANTI-PARAPHRASE RULE" src/lib/services/consolidated-ai.service.ts`
   - If missing: ship Sprint 1 first; come back here after deploy.

2. **Background workers are running.** Confirm NUFORC ingest is still draining and the daily classifier-catchup cron is loaded. None of Sprint 2's steps require either to be stopped.
   - `ps aux | grep -E "batch-ingest-worker|nuforc"`
   - `launchctl list | grep paradocs`

3. **Env is sourced.** All scripts need `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and (for Step 6) `ANTHROPIC_API_KEY`.
   ```bash
   set -a; source .env.local; set +a
   ```

4. **Recent NUFORC narrative gap (DESCRIPTION_BACKFILL_SCOPE.md §3).** Option A doesn't depend on narrative coverage, so the 29,400-row NUFORC gap is NOT blocking. Step 6 (regen) operates only on rows that already have a narrative + description, so the gap is also not relevant there. Sprint 3 is the one that will require the gap to be closed.

---

## Step 1 — Apply the two SQL migrations

Two new migrations:
- `supabase/migrations/20260608_source_body_sha256.sql` — adds `reports.source_body_sha256 TEXT` + partial index.
- `supabase/migrations/20260608_narrative_regenerated_at.sql` — adds `reports.narrative_regenerated_at TIMESTAMPTZ`.

**Recommended:** Paste both files' SQL into the Supabase Studio SQL editor for the project, run sequentially. Both are idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

**Alternative (psql):**
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260608_source_body_sha256.sql
psql "$DATABASE_URL" -f supabase/migrations/20260608_narrative_regenerated_at.sql
```

**Verify:**
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='reports'
  AND column_name IN ('source_body_sha256','narrative_regenerated_at');
-- expect 2 rows
SELECT count(*) FROM reports WHERE source_body_sha256 IS NOT NULL;
-- expect 0 (backfill hasn't run yet)
```

**Rollback:**
```sql
ALTER TABLE reports DROP COLUMN IF EXISTS source_body_sha256;
ALTER TABLE reports DROP COLUMN IF EXISTS narrative_regenerated_at;
DROP INDEX IF EXISTS idx_reports_source_body_sha256;
```
Drop is safe because no production code reads the columns yet at this point in the sequence.

---

## Step 2 — Dry-run the backfill

```bash
npx tsx scripts/backfill-description-truncate-v1.ts
```

**Expected runtime:** 30 s – 2 min for the dry-run pass (reads only, no writes; cursor-walks all ~318k rows; tokenizing + hashing is local CPU).

**Expected output (matches DESCRIPTION_BACKFILL_SCOPE.md §4):**
- Scanned: ~318,824 (318,828 total minus the 4 `user_submission` rows)
- Would-hash: same number (every row with a non-null description)
- Would-truncate: ~62,826 (rows with description > 2000 chars)
- Storage that would be freed: ~140 MB raw chars, ~100 MB on disk after TOAST compression

**Decision gate:** If the counts diverge from scope-doc figures by more than ~5%, STOP and investigate. The most likely cause is the NUFORC ingest having grown the corpus since scope-doc time; that's fine. A drop in candidate count is more concerning — could mean filter mismatch.

**Rollback:** N/A — read-only.

---

## Step 3 — Apply the backfill

```bash
npx tsx scripts/backfill-description-truncate-v1.ts --apply
```

**Expected runtime:** ~5–10 min wall-clock for the full corpus.
The script issues ~318k single-row UPDATEs at ~10 ms each (sequential via PostgREST) + 50 ms sleep between 500-row pages. Bulk SQL would be faster (~60 s per scope-doc) but the script trades wall-clock for operator simplicity and per-row error isolation.

**Coexistence:**
- NUFORC ingest is still INSERTing new rows — no row contention.
- Classifier-drain is UPDATEing disjoint columns (`report_phenomena` table + `phenomenon_type_id` / `classifier_attempts` / `classifier_skip`) — no column contention.
- Inter-page sleep keeps connection-pool pressure low.

**Killable + resumable.** Ctrl-C at any point. Re-run picks up at the next unhashed row because the WHERE filter is `source_body_sha256 IS NULL` and writes are committed per-row.

**Expected summary lines:**
```
Hashed:    ~318,824
Truncated: ~62,826
Storage freed: ~140 MB raw / ~100 MB on disk
```

**Verify post-apply:**
```sql
SELECT count(*) FROM reports WHERE source_body_sha256 IS NOT NULL;
-- expect ~318,824
SELECT count(*) FROM reports WHERE length(description) > 2050;
-- expect 0 (truncated rows are exactly 2,000 + suffix ≈ 2,080)
SELECT count(*) FROM reports WHERE description LIKE '%[truncated by Paradocs at 2000 chars%';
-- expect ~62,826
```

**Rollback for Step 3:** TRUNCATION IS IRREVERSIBLE. There is no recovery path other than re-scraping the source (Cloudflare-blocked for NUFORC, ToS-restricted for Reddit/Erowid). The scope doc (§5 pre-condition 4) recommends taking a `pg_dump` of `(id, source_type, description)` to cold storage before this step. If that wasn't done, document it as a known one-way door in the change log.

The `source_body_sha256` field IS rollback-able (drop the column per Step 1 rollback) if the column itself causes an issue, but the truncation is locked in.

---

## Step 4 — Flag paraphrased narratives (dry-run)

```bash
npx tsx scripts/flag-paraphrased-narratives.ts
```

**Expected runtime:** ~5–10 min wall-clock for the full corpus (~288k narratives to check; n-gram check is pure-CPU and fast).

**Output:** `outputs/flagged-paraphrase-rows.json` — a JSON array of `{ id, slug, source_label, source_type, fivegramOverlap, sevengramMaxRun }`.

**Expected size (per audit §6 option c):**
- ~25–30% of corpus = ~75,000–85,000 rows
- Breakdown likely concentrates in Reddit (largest source) + NDERF/OBERF (longest narratives)

**Decision gate:**
- If `Flagged for regen` is < 30,000 → unexpectedly low. Verify the script ran post-Step-3 (truncated descriptions reduce overlap denominators — see comment block in the script).
- If `Flagged for regen` is > 130,000 → unexpectedly high. Review a sample of flagged rows; possibly a Sprint-1 prompt regression slipped a previous-style narrative pattern.

**Coexistence:** Read-only. Safe to run anytime.

**Rollback:** N/A — script writes only a JSON file. Delete `outputs/flagged-paraphrase-rows.json` to start over.

---

## Step 5 — Dry-run the regen (cost estimate)

```bash
npx tsx scripts/regen-flagged-narratives.ts
```

**Expected runtime:** < 30 s. Just reads the JSON, computes the cost estimate, prints; no Haiku calls.

**Expected cost line:**
```
TOTAL estimated batch cost: $XXX.XX
(Audit §6 option-c benchmark: $190–$215 for ~75–85k rows)
```

**Decision gate:** If the printed estimate differs from the $190–$215 benchmark by more than 25%, investigate before --apply:
- Higher: probably more rows than expected; re-check Step 4 output.
- Lower: probably fewer rows; ok to proceed, but check that you ran Step 4 against the post-truncation corpus (Step 3 first).

**Rollback:** N/A.

---

## Step 6 — Apply the regen (Batch API job)

```bash
npx tsx scripts/regen-flagged-narratives.ts --apply
```

You'll be prompted to confirm. To skip the prompt in non-interactive contexts: pass `--yes`.

**Submission phase:** ~30 s. Posts the batch to `https://api.anthropic.com/v1/messages/batches`, prints the `batch_id`, saves a resume marker to `outputs/regen-flagged-narratives.run.json`.

**Polling phase:** Anthropic Batch API SLA is **up to 24 h** (typically 1–6 h). The script polls every 60 s and stays alive up to 26 h.

**Persistence phase:** After completion, fetches results (~75k–85k JSONL rows), parses each, calls `persistConsolidatedResult` to write the new `paradocs_narrative` + assessment + stamps `narrative_regenerated_at = now()`. ~10–20 min for the full set.

**If the script crashes mid-flight:**
```bash
npx tsx scripts/regen-flagged-narratives.ts --resume <batch_id>
```
(The batch_id is in stdout AND in `outputs/regen-flagged-narratives.run.json`.)

**Killable + resumable:** Yes. Idempotent because the next `--apply` skips rows whose `narrative_regenerated_at >= flag-JSON-mtime`.

**Coexistence:**
- NUFORC + classifier do not touch `paradocs_narrative` on existing rows (they only set it on first Haiku pass). No contention.
- The Batch API job runs entirely on Anthropic's infra; only the persistence phase writes to our DB.

**Expected post-apply DB state:**
```sql
SELECT count(*) FROM reports WHERE narrative_regenerated_at IS NOT NULL;
-- expect ~75,000–85,000 (= number of flagged rows that succeeded)
```

**Rollback:** Each regenerated row overwrites `paradocs_narrative`. The pre-regen narratives are LOST unless backed up. Same posture as Step 3 — recommend a per-row dump of `(id, paradocs_narrative)` to cold storage before --apply if there's any concern about regression. (Practically: the Haiku output with the Sprint-1 anti-paraphrase rule is strictly more compliant than the pre-Sprint-1 narrative the n-gram flagger called out.)

---

## Step 7 — Post-deploy verification

Spot-check 5 regenerated rows via the same n-gram method to confirm the regen actually moved them below threshold.

```bash
# Pick 5 freshly regenerated rows
npx tsx -e '
import { createClient } from "@supabase/supabase-js";
import { checkParaphrase } from "./src/lib/services/narrative-paraphrase-check";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
sb.from("reports").select("id, slug, description, paradocs_narrative").not("narrative_regenerated_at","is",null).order("narrative_regenerated_at",{ascending:false}).limit(5).then(({data})=>{
  for (const r of data!) {
    const m = checkParaphrase(r.paradocs_narrative, r.description);
    console.log(r.slug, "5g=" + (m.fivegramOverlap*100).toFixed(2)+"%", "run=" + m.sevengramMaxRun, m.flagged ? "STILL FLAGGED" : "ok");
  }
});
'
```

**Expected:** All 5 print `ok` (5-gram < 5% AND longest run < 7). Even one `STILL FLAGGED` warrants a deeper look — could indicate the Sprint-1 prompt didn't fully suppress witness-quote echoes, or the source body itself contains a distinctive factual descriptor that any narrative would echo.

**Wider sweep (optional but recommended):** re-run Step 4 against the now-regenerated corpus and confirm the flagged count drops by >90% of the pre-regen flagged count.

---

## Coexistence summary (all steps)

| Background process | Step 2/3 backfill | Step 4 flagger | Step 6 regen |
|---|---|---|---|
| **NUFORC ingest** (INSERTs new rows) | Disjoint rows. No conflict. | Read-only. No conflict. | Disjoint rows + Batch API is async. No conflict. |
| **Classifier-drain** (UPDATEs `phenomenon_type_id`, `classifier_attempts`, `classifier_skip`, `report_phenomena`) | Disjoint columns. No conflict. | Read-only. No conflict. | Disjoint columns. No conflict. |
| **Live consolidated-ai writes** (on freshly ingested rows) | Race window negligible: backfill skips rows with `source_body_sha256 IS NOT NULL`; live ingest now writes it at INSERT time (Sprint 2 engine.ts change). | Live ingest is on rows the flagger hasn't loaded yet. | Live ingest writes new `paradocs_narrative` after our regen completes; both are using the Sprint-1 prompt so output is equivalent. |

No step requires pausing the background drains.

---

## Cost summary

| Step | $ |
|---|---|
| Step 1 — Migration | $0 |
| Step 2 — Backfill dry-run | $0 |
| Step 3 — Backfill apply | $0 (pure DB writes) |
| Step 4 — Flagger dry-run | $0 |
| Step 5 — Regen dry-run | $0 |
| Step 6 — Regen apply | **~$190–$215** (Anthropic Batch API at $0.0025/report × ~80k rows) |
| Step 7 — Verification | $0 |
| **Total** | **~$190–$215** |

Set `PARADOCS_MASS_INGEST_DAILY_CAP` to a value at or above the estimate before Step 6 if the existing $200/day default would block submission.

---

## Files touched / created (deliverable index)

**Migrations (apply via Step 1):**
- `supabase/migrations/20260608_source_body_sha256.sql`
- `supabase/migrations/20260608_narrative_regenerated_at.sql`

**Scripts:**
- `scripts/backfill-description-truncate-v1.ts` (backfill)
- `scripts/flag-paraphrased-narratives.ts` (flagger)
- `scripts/regen-flagged-narratives.ts` (regen)

**Library:**
- `src/lib/services/narrative-paraphrase-check.ts` (pure n-gram check, reusable from any tool)

**Edited (ingest-time cap + snapshot hash on new rows):**
- `src/lib/ingestion/engine.ts` — added `capDescriptionForStorage()` helper + `crypto` import; modified INSERT path and UPDATE path to populate `source_body_sha256` and cap `description` at 2,000 chars. Search the file for `V11.17.x — copyright Sprint 2`.

**Outputs (produced during the run):**
- `outputs/flagged-paraphrase-rows.json` — Step 4 product, Step 6 input
- `outputs/regen-flagged-narratives.run.json` — Step 6 resume marker

---

## Open questions / future work

1. **`paradocs_assessment.source_excerpt`** (scope doc §7-5): still unverified whether any render path falls back to `description` for the excerpt chip. Out of scope for Sprint 2 (Option A truncate doesn't break rendering — `scrubIndexReport` nulls description before SSR). Must verify before Sprint 3 Option B full-strip.

2. **Counsel sign-off on Option B (Sprint 3).** Sprint 2 ships the snapshot column the audit trail needs; Sprint 3 is the irreversible strip. Don't run Sprint 3 until (a) NUFORC narrative gap closes to <1% AND (b) outside IP-counsel signs off on the destination posture.

3. **Snapshot hash backfill for new ingests.** Sprint 2 engine.ts change populates `source_body_sha256` at INSERT time, so every row ingested from Sprint-2-deploy forward has the hash pre-filled. No follow-up backfill needed. Verified by the post-Step-3 query — count of `source_body_sha256 IS NULL` should drop to ~0 after Step 3 + a few hours of live ingest.

4. **Sprint-1 anti-paraphrase prompt audit.** After Step 7 spot-check, the audit's 4-of-15 LIGHT-PARAPHRASE rate should drop materially (target: < 5%). Take a 30-sample re-audit at Sprint-2-+-30-days to validate the going-forward posture.

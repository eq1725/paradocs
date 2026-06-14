# CA Tranche-One Runbook — V11.18.31

Launch the Chronicling America 1898–1928 ingest: **LoC parallelism probe → 1898 smoke test → launchd daemon unleash.** Target ~50k approved in ~5–10 days unattended at ~$550. Everything below runs on the **operator terminal** (Chase's machine) — the agent sandbox has a 45s/call budget and can't run multi-hour jobs or multi-GB fetches.

All commands assume repo root and a one-time env load per shell:

```bash
cd ~/paradocs
set -a; source .env.local; set +a
```

---

## What got built (V11.18.31)

| File | Role |
|---|---|
| `scripts/ca-loc-parallel-probe.ts` | Empirical loc.gov concurrency probe. Ramps P=1→2→3, measures 429/503 + latency, recommends safe P. |
| `scripts/ca-harvest.ts` *(1-line edit)* | Added `CA_STATE_FILE` env override so parallel workers isolate state. Backward-compatible (unset = original behavior). |
| `scripts/ca-harvest-parallel.sh` | Year-partitioned harvest fan-out. P workers over disjoint year slices, each its own state file. |
| `scripts/ca-ingest-daemon.sh` | Unattended loop: harvest wave → extract+ingest wave → sleep. STOP-file + single-instance lock. |
| `scripts/com.paradocs.ca-ingest.plist` | launchd LaunchAgent. Relaunch on crash/reboot, not after clean STOP. |
| `scripts/ca-1898-smoke.sh` | End-to-end 1898 smoke with PASS/FAIL exit codes. |

**Why parallelism needs the probe:** `ca-harvest.ts` is single-stream; its ceiling is per-request *latency* (cold OCR renders take 20–40s), not the `--rate-ms` gate. The only way to raise throughput is more requests in flight (concurrency P) — but loc.gov bans crawlers that push past ~20 req/min/IP. The probe finds the safe P empirically before we commit to a multi-day run.

**Why it's race-free at P>1:** shards are named `<slug>-<year>.json`, so year-partitioned workers never write the same shard. The OCR cache is content-addressed by `pageId` (idempotent). The only single-writer file is the harvest-state JSON — hence the `CA_STATE_FILE` override, one per worker.

---

## Step 1 — Parallelism probe

```bash
npx tsx scripts/ca-loc-parallel-probe.ts
```

Runs P=1→2→3, ~12 OCR fetches/level, aborting the ramp if a level crosses 20% errors. Takes a few minutes. Read the **RECOMMENDATION** block at the end — it gives the safe **P** and effective req/min.

- Endpoint smoke only: `npx tsx scripts/ca-loc-parallel-probe.ts --quick`
- Push further if P=3 was clean: `npx tsx scripts/ca-loc-parallel-probe.ts --levels 1,2,3,4 --per-level 16`

> If the probe reports **no safe level / heavy 429s**, loc.gov is throttling this IP today. Run the daemon at **P=1** (still ~$550, just the slower ~24-day end of the envelope) or re-probe off-peak. Do **not** override a 429 verdict by raising P manually.

**Record the recommended P — it's the `WORKERS` value for steps 3–4.**

---

## Step 2 — 1898 smoke test

Dry first (free, no DB writes):

```bash
bash scripts/ca-1898-smoke.sh
```

Gates: harvester exits 0 → 1898 shards exist → shards contain snippets → extractor `--dry-run` parses + prints a cost estimate. Exit 0 = **PASS**.

Then prove the live insert path (small, capped ~$1–2, writes a handful of `pending_review` rows):

```bash
DRY=0 bash scripts/ca-1898-smoke.sh
```

Only proceed to Step 3 if both PASS. The live rows are real tranche data (not throwaway) and will be picked up by the daily classifier.

---

## Step 3 — Install & unleash the daemon

Set `WORKERS` to the probe's P, then install the LaunchAgent. The plist is a template (launchd doesn't expand `$HOME`), so `sed` makes the home path literal. **Edit the `WORKERS` value in the plist's `EnvironmentVariables` block to your P before installing** (default is 2):

```bash
# optionally: open scripts/com.paradocs.ca-ingest.plist and set <key>WORKERS</key> to your P
sed "s|USER_HOME|$HOME|g" scripts/com.paradocs.ca-ingest.plist \
  > ~/Library/LaunchAgents/com.paradocs.ca-ingest.plist
launchctl load ~/Library/LaunchAgents/com.paradocs.ca-ingest.plist
launchctl list | grep paradocs    # verify it's listed
```

`RunAtLoad=true` starts the first wave immediately. The daemon harvests a bounded chunk per worker (`HARVEST_BUDGET`, default 3600s), then runs the Haiku Batch extractor over all shards (dedup-safe, `--max-cost $30/wave`), sleeps, and repeats. Re-runs resume from durable per-worker state.

> **One-shot rehearsal without launchd** (single wave, foreground): `ONESHOT=1 WORKERS=<P> bash scripts/ca-ingest-daemon.sh`

> **Node version:** the plist hardcodes the nvm path `v20.18.1` (matching `com.paradocs.classifier-daily`). If your Node moved, update the `PATH` string in the plist.

---

## Monitoring

```bash
tail -f ~/paradocs/outputs/ca-daemon-$(date +%Y%m%d).log     # daemon waves
tail -f ~/paradocs/outputs/ca-harvest-parallel-*-w0.log      # a harvest worker
launchctl list | grep paradocs                               # alive?
```

Approved-row progress (DB):

```bash
node -e "const {createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);sb.from('reports').select('*',{count:'exact',head:true}).eq('source_type','chronicling-america').then(r=>console.log('CA rows:',r.count));"
```

---

## Stopping

```bash
touch ~/paradocs/outputs/ca-daemon.STOP                       # finishes current wave, exits 0
launchctl unload ~/Library/LaunchAgents/com.paradocs.ca-ingest.plist
rm ~/paradocs/outputs/ca-daemon.STOP                          # so a future load can run again
```

`KeepAlive→SuccessfulExit=false` means launchd won't relaunch a clean STOP, but will restart the daemon after a crash or reboot.

---

## Cost / speed envelope (from handoff, no magic optimizations)

- Live API single-stream (P=1): ~$550 for 50k, ~24 days unattended.
- Live API + cautious parallelism (P=2–3 if LoC tolerates): ~$550 for 50k, ~5–10 days.
- The probe decides which end of this you're on.

## Guardrails (do not relitigate)

- **LoC politeness: ~20 req/min/IP.** The probe respects this; don't manually push P past its verdict.
- **Bulk OCR dumps are NOT a shortcut** — ALTO-XML only, ~12 TB / ~80 days. Killed; see `docs/CA_BULK_DUMP_FORMAT.md`.
- **Batch API does not share prompt cache** across requests — the "consolidated single-call" cost model is broken. Killed at V11.18.29. The 3-pass extractor (`ca-extract-ingest.ts`) stays.
- **Classifier is separate.** `com.paradocs.classifier-daily` (04:00) tags the new `pending_review` rows; this daemon does not classify.
- **Operator commits.** The agent doesn't `git commit` — review the V11.18.31 diff and commit/push yourself.

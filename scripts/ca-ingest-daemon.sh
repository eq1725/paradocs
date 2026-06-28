#!/bin/bash
# ca-ingest-daemon.sh — V11.18.31
#
# Unattended CA tranche-one ingest loop. Each cycle:
#   1. HARVEST WAVE — scripts/ca-harvest-parallel.sh runs WORKERS year-
#      partitioned harvesters for BUDGET_SEC each, advancing durable state
#      and writing OCR snippet shards to outputs/ca-shards/.
#   2. EXTRACT WAVE — scripts/ca-extract-ingest.ts runs Haiku Batch
#      extraction over ALL shards (it dedups against already-ingested rows,
#      so re-scanning the full glob is safe) and inserts pending_review rows,
#      capped at MAX_COST_USD per wave.
#   3. NARRATE WAVE — scripts/ca-narrate-pass.ts --apply fills
#      paradocs_narrative (+ sibling AI fields) on pending CA rows that lack
#      it, reusing the same consolidated-AI voice as live ingestion. Time-
#      boxed (NARRATE_BUDGET_SEC) + cost-capped (NARRATE_MAX_COST_USD) +
#      resumable, so the backlog drains a chunk per wave. Without this, the
#      auto-approve gate holds rows as 'no_narrative' and the backlog grows.
#   4. AUTO-APPROVE WAVE — scripts/ca-auto-approve.ts --apply promotes
#      pending→approved for rows that clear the publish gate (narrative
#      REQUIRED). Folklore stays held (no --include-folklore) per founder
#      decision.
#   5. Sleep SLEEP_SEC, repeat.
# The daily classifier cron (com.paradocs.classifier-daily) tags the new
# pending rows separately — this daemon does NOT classify.
#
# DESIGNED FOR launchd (com.paradocs.ca-ingest.plist) with
# KeepAlive→SuccessfulExit=false: launchd relaunches on CRASH/reboot but
# NOT after a clean STOP. See that plist for install instructions.
#
# GRACEFUL STOP
#   touch outputs/ca-daemon.STOP        # finishes current wave, then exits 0
#   (launchd will not relaunch a clean exit; remove the file to allow restart)
#
# RUN MODES
#   bash scripts/ca-ingest-daemon.sh            # loop forever (until STOP)
#   ONESHOT=1 bash scripts/ca-ingest-daemon.sh  # exactly one wave then exit
#
# ENV (all optional)
#   WORKERS        harvester concurrency — USE THE PROBE'S P (default 2)
#   YEARS          tranche range (default 1898-1928)
#   TERMS          --terms value (default all)
#   MAX_PAGES      harvester --max-pages (default 5)
#   RATE_MS        per-worker --rate-ms (default 3000)
#   HARVEST_BUDGET per-worker harvest seconds per wave (default 3600)
#   MAX_COST_USD   extractor --max-cost per wave (default 30)
#   POLL_INTERVAL  extractor batch poll seconds (default 60)
#   MAX_WAIT       extractor per-batch poll ceiling seconds (default 7200)
#   NARRATE_BUDGET_SEC  narrate-pass per-wave time box seconds (default 120)
#   NARRATE_MAX_COST_USD narrate-pass per-wave spend cap USD (default 10)
#   SLEEP_SEC      pause between waves (default 120)

set -u
cd "$(dirname "$0")/.."

WORKERS=${WORKERS:-2}
YEARS=${YEARS:-1898-1928}
TERMS=${TERMS:-all}
MAX_PAGES=${MAX_PAGES:-5}
RATE_MS=${RATE_MS:-3000}
HARVEST_BUDGET=${HARVEST_BUDGET:-3600}
MAX_COST_USD=${MAX_COST_USD:-30}
POLL_INTERVAL=${POLL_INTERVAL:-60}
MAX_WAIT=${MAX_WAIT:-7200}
NARRATE_BUDGET_SEC=${NARRATE_BUDGET_SEC:-120}
NARRATE_MAX_COST_USD=${NARRATE_MAX_COST_USD:-10}
SEMDEDUP_BUDGET_SEC=${SEMDEDUP_BUDGET_SEC:-180}
SLEEP_SEC=${SLEEP_SEC:-120}
# V11.31 — when 1, exit cleanly after the wave that finds the tranche mined
# out (harvest adds 0 new shards). Lets a chain wrapper advance year ranges.
STOP_WHEN_DRAINED=${STOP_WHEN_DRAINED:-0}
ONESHOT=${ONESHOT:-0}

mkdir -p outputs
STOP_FILE="outputs/ca-daemon.STOP"
LOCK_DIR="outputs/ca-daemon.lock"
LOG="outputs/ca-daemon-$(date +%Y%m%d).log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# ── single-instance lock (atomic mkdir) ──────────────────────────────
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Another ca-ingest-daemon holds $LOCK_DIR — exiting (this is normal under launchd respawn)."
  exit 0
fi
echo "$$" > "$LOCK_DIR/pid"

STOPPING=0
cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || rm -rf "$LOCK_DIR" 2>/dev/null
}
on_term() {
  log "Received TERM/INT — will stop after the current wave."
  STOPPING=1
}
trap cleanup EXIT
trap on_term TERM INT

# ── env preflight ────────────────────────────────────────────────────
if [ -f .env.local ]; then
  set -a; # shellcheck disable=SC1091
  source .env.local; set +a
else
  log "WARNING: .env.local not found — extractor needs Supabase + Anthropic creds and will fail."
fi
log "ca-ingest-daemon start (pid $$) | WORKERS=$WORKERS YEARS=$YEARS TERMS=$TERMS harvest_budget=${HARVEST_BUDGET}s max_cost=\$$MAX_COST_USD oneshot=$ONESHOT"
log "node=$(node -v 2>/dev/null || echo missing)"

WAVE=0
ZERO_HARVEST=0   # consecutive harvest waves that added no new shards (drain detector)
while true; do
  if [ -f "$STOP_FILE" ]; then
    log "STOP file present ($STOP_FILE) — exiting cleanly. (launchd will not relaunch a clean exit.)"
    exit 0
  fi
  if [ "$STOPPING" = "1" ]; then
    log "Stop requested — exiting cleanly."
    exit 0
  fi

  WAVE=$(( WAVE + 1 ))
  # V11.31 — STOP_WHEN_DRAINED: detect tranche exhaustion by comparing the
  # shard count before/after the harvest wave. When a full harvest wave adds
  # ZERO new shards, every term×year slice for this YEARS range is searched +
  # OCR'd — the tranche is mined out. We then finish this wave's extract/
  # narrate/approve/dedup (to drain) and exit cleanly so a chain wrapper can
  # advance to the next year range. (Residual un-narrated pending is fine —
  # it's not year-scoped, so the next tranche's narrate wave drains it.)
  SHARDS_BEFORE=$(ls outputs/ca-shards/*.json 2>/dev/null | wc -l | tr -d ' ')
  log "===== WAVE $WAVE : harvest ====="
  WORKERS="$WORKERS" YEARS="$YEARS" TERMS="$TERMS" MAX_PAGES="$MAX_PAGES" \
    RATE_MS="$RATE_MS" BUDGET_SEC="$HARVEST_BUDGET" \
    bash scripts/ca-harvest-parallel.sh >> "$LOG" 2>&1 || log "harvest wave returned non-zero (continuing)"
  SHARDS_AFTER=$(ls outputs/ca-shards/*.json 2>/dev/null | wc -l | tr -d ' ')
  DRAINED=0
  if [ "$SHARDS_AFTER" = "$SHARDS_BEFORE" ]; then
    ZERO_HARVEST=$(( ZERO_HARVEST + 1 ))
  else
    ZERO_HARVEST=0
  fi
  # Require TWO consecutive empty harvest waves before declaring the tranche
  # mined out, so a single transient loc.gov outage can't falsely complete it.
  if [ "$STOP_WHEN_DRAINED" = "1" ] && [ "$ZERO_HARVEST" -ge 2 ]; then
    DRAINED=1
    log "harvest added 0 new shards for $ZERO_HARVEST consecutive waves — tranche YEARS=$YEARS mined out; will drain + exit (STOP_WHEN_DRAINED)."
  fi

  if [ -f "$STOP_FILE" ] || [ "$STOPPING" = "1" ]; then
    log "Stop requested after harvest — exiting before extract."
    exit 0
  fi

  log "===== WAVE $WAVE : extract+ingest (max-cost \$$MAX_COST_USD) ====="
  if ls outputs/ca-shards/*.json >/dev/null 2>&1; then
    npx tsx scripts/ca-extract-ingest.ts \
      --shard 'outputs/ca-shards/*.json' \
      --max-cost "$MAX_COST_USD" \
      --poll-interval "$POLL_INTERVAL" \
      --max-wait "$MAX_WAIT" \
      >> "$LOG" 2>&1 || log "extract wave returned non-zero (continuing)"
  else
    log "no shards yet — skipping extract this wave."
  fi

  if [ -f "$STOP_FILE" ] || [ "$STOPPING" = "1" ]; then
    log "Stop requested after extract — exiting before narrate."
    exit 0
  fi

  # ── NARRATE WAVE ────────────────────────────────────────────────────
  # Fill paradocs_narrative on pending CA rows so the auto-approve gate can
  # promote them (otherwise they're held as 'no_narrative' forever). Time-
  # boxed + cost-capped + resumable: each wave drains a chunk and exits.
  log "===== WAVE $WAVE : narrate (budget ${NARRATE_BUDGET_SEC}s, max-cost \$$NARRATE_MAX_COST_USD) ====="
  # --reset-cache each wave: the candidate cache is a point-in-time snapshot;
  # without resetting, a "complete" cache short-circuits gather and newly
  # ingested un-narrated rows are never picked up. Resetting re-gathers the
  # current un-narrated set each wave (the null-narrative query filter is the
  # real dedup, so nothing is re-narrated).
  RUN_BUDGET_SEC="$NARRATE_BUDGET_SEC" MAX_COST_USD="$NARRATE_MAX_COST_USD" \
    npx tsx scripts/ca-narrate-pass.ts --reset-cache --apply \
    >> "$LOG" 2>&1 || log "narrate wave returned non-zero (continuing)"

  if [ -f "$STOP_FILE" ] || [ "$STOPPING" = "1" ]; then
    log "Stop requested after narrate — exiting before auto-approve."
    exit 0
  fi

  # ── AUTO-APPROVE WAVE ───────────────────────────────────────────────
  # Promote pending→approved for rows clearing the publish gate (narrative
  # REQUIRED). NO --include-folklore: retold_folklore stays held per founder
  # decision. Reversible via scripts/ca-auto-approve.ts --revert.
  log "===== WAVE $WAVE : auto-approve gate ====="
  npx tsx scripts/ca-auto-approve.ts --apply \
    >> "$LOG" 2>&1 || log "auto-approve wave returned non-zero (continuing)"

  if [ -f "$STOP_FILE" ] || [ "$STOPPING" = "1" ]; then
    log "Stop requested after auto-approve — exiting before semantic-dedup."
    exit 0
  fi

  # ── SEMANTIC-DEDUP WAVE ─────────────────────────────────────────────
  # Catch reworded same-event reprints the content-fingerprint guard can't
  # (the same syndicated story extracted into different prose → different fp,
  # identical meaning). Embedding-based, so it can only act on rows the
  # embed-reports cron has already embedded — it's time-boxed + resumable, so
  # each wave catches whatever's embedded so far and the rest next time. Cache
  # is cleared each wave so newly-embedded reports are re-scanned. Free (DB
  # only, no AI). Reversible via scripts/ca-semantic-dedup.ts --revert.
  log "===== WAVE $WAVE : semantic-dedup (budget ${SEMDEDUP_BUDGET_SEC}s) ====="
  rm -f outputs/ca-semdedup-cache.json outputs/ca-semdedup-processed.json outputs/ca-semdedup-clusters.json 2>/dev/null
  SEMDEDUP_RUN_BUDGET_SEC="$SEMDEDUP_BUDGET_SEC" \
    npx tsx scripts/ca-semantic-dedup.ts --apply \
    >> "$LOG" 2>&1 || log "semantic-dedup wave returned non-zero (continuing)"

  log "===== WAVE $WAVE done ====="
  if [ "$DRAINED" = "1" ]; then
    log "STOP_WHEN_DRAINED — tranche YEARS=$YEARS mined out and drained; exiting 0 so the chain can advance."
    exit 0
  fi
  if [ "$ONESHOT" = "1" ]; then
    log "ONESHOT — exiting after one wave."
    exit 0
  fi
  log "sleeping ${SLEEP_SEC}s before next wave…"
  sleep "$SLEEP_SEC"
done

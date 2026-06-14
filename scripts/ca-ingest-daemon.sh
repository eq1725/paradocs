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
#   3. Sleep SLEEP_SEC, repeat.
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
SLEEP_SEC=${SLEEP_SEC:-120}
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
  log "===== WAVE $WAVE : harvest ====="
  WORKERS="$WORKERS" YEARS="$YEARS" TERMS="$TERMS" MAX_PAGES="$MAX_PAGES" \
    RATE_MS="$RATE_MS" BUDGET_SEC="$HARVEST_BUDGET" \
    bash scripts/ca-harvest-parallel.sh >> "$LOG" 2>&1 || log "harvest wave returned non-zero (continuing)"

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

  log "===== WAVE $WAVE done ====="
  if [ "$ONESHOT" = "1" ]; then
    log "ONESHOT — exiting after one wave."
    exit 0
  fi
  log "sleeping ${SLEEP_SEC}s before next wave…"
  sleep "$SLEEP_SEC"
done

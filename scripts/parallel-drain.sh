#!/bin/bash
# V11.17.63 — Parallel batch-ingest-worker fan-out.
#
# Why this exists:
#   The serial drain-pending-loop.sh runs one batch worker at a time,
#   each blocking on Anthropic's Batch API SLA (typically 30min-3h per
#   round). For 99k pending reports at 5k rows/round, that's ~20 rounds
#   in serial = 10-60 hours wall-clock.
#
#   This wrapper spawns NUM_WORKERS workers in parallel, each handling
#   a different offset slice of 5,000 rows. All workers submit their
#   Anthropic batches at T=0 and Anthropic processes them in parallel.
#   Wall-clock collapses from sum(individual) → max(individual) ≈ 2-6h.
#
# How partitioning works:
#   - All workers use the same query: status='pending_review' AND
#     paradocs_narrative IS NULL, ordered by (created_at, id).
#   - Worker N uses --offset (N × CHUNK_SIZE) --limit CHUNK_SIZE.
#   - Stable ordering means worker offsets address disjoint rows.
#   - Worker results UPDATE rows by primary-key id — no row-claim race.
#
# Usage:
#   set -a; source .env.local; set +a
#   export PARADOCS_MASS_INGEST_DAILY_CAP=500     # raise per-day cap
#   bash scripts/parallel-drain.sh                # default 20 workers
#   NUM_WORKERS=10 bash scripts/parallel-drain.sh # custom worker count
#
# Notes:
#   - Each worker has its own stdout/stderr captured to its own log file.
#   - The wrapper tails all worker progress until every worker exits.
#   - Workers do their OWN cap check before submitting, so daily-cap
#     enforcement still works across workers (each may see different
#     todays_spend snapshots but they're additive on the DB side).
#   - Safe to Ctrl+C — sends INT to all children, each saves state.
#
# Cost: same as serial (~$305 for 99k reports, batch discount applies).
# Wall-clock: dominated by slowest single batch, NOT sum of batches.

set -u

NUM_WORKERS=${NUM_WORKERS:-8}
CHUNK_SIZE=${CHUNK_SIZE:-5000}
POLL_INTERVAL=${POLL_INTERVAL:-60}
MAX_WAIT=${MAX_WAIT:-86400}
STAGGER_SEC=${STAGGER_SEC:-20}

# V11.17.76 — skip the in-worker Stage D classifier auto-spawn by default.
# Each worker would otherwise spawn its own `classify-phenomena-batch --all`
# child after narratives persist. With N workers running in parallel that
# creates N redundant classifiers all racing on the same un-tagged report
# set — wastes Anthropic budget without speeding up tagging. Default-off
# here; run ONE consolidated classifier after all narrative waves drain.
# Override via SKIP_CLASSIFY=0 to restore legacy per-worker auto-spawn.
SKIP_CLASSIFY=${SKIP_CLASSIFY:-1}
LOG_DIR="outputs"
mkdir -p "$LOG_DIR"
RUN_ID=$(date +%Y%m%d-%H%M%S)
SUMMARY_LOG="$LOG_DIR/parallel-drain-${RUN_ID}-summary.log"

echo "================================================================" | tee "$SUMMARY_LOG"
echo "Parallel batch-ingest-worker fan-out — run id $RUN_ID"           | tee -a "$SUMMARY_LOG"
echo "Started:      $(date)"                                            | tee -a "$SUMMARY_LOG"
echo "Workers:      $NUM_WORKERS"                                       | tee -a "$SUMMARY_LOG"
echo "Chunk size:   $CHUNK_SIZE rows per worker"                        | tee -a "$SUMMARY_LOG"
echo "Coverage:     $((NUM_WORKERS * CHUNK_SIZE)) rows (one wave)"      | tee -a "$SUMMARY_LOG"
echo "================================================================" | tee -a "$SUMMARY_LOG"

# Pre-flight: how many rows are actually pending?
PENDING=$(node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending_review').is('paradocs_narrative', null).then(function(r) {
  console.log(r.count == null ? 0 : r.count);
}).catch(function(e) {
  console.error(e.message); console.log(-1);
});
" 2>/dev/null)

echo "Pending reports right now: $PENDING" | tee -a "$SUMMARY_LOG"
if [ "$PENDING" = "0" ] || [ -z "$PENDING" ]; then
  echo "Nothing to drain. Exiting." | tee -a "$SUMMARY_LOG"
  exit 0
fi
if [ "$PENDING" = "-1" ]; then
  echo "ERROR: count query failed. Check Supabase env vars." | tee -a "$SUMMARY_LOG"
  exit 1
fi

# Compute how many workers we actually need (don't spawn idle workers)
EFFECTIVE_WORKERS=$(( (PENDING + CHUNK_SIZE - 1) / CHUNK_SIZE ))
if [ "$EFFECTIVE_WORKERS" -gt "$NUM_WORKERS" ]; then
  EFFECTIVE_WORKERS=$NUM_WORKERS
fi
echo "Effective workers this wave: $EFFECTIVE_WORKERS" | tee -a "$SUMMARY_LOG"
echo "" | tee -a "$SUMMARY_LOG"

# Spawn workers
PIDS=()
LOGS=()
for ((W=0; W<EFFECTIVE_WORKERS; W++)); do
  OFFSET=$(( W * CHUNK_SIZE ))
  WORKER_LOG="$LOG_DIR/parallel-drain-${RUN_ID}-w${W}.log"
  LOGS+=("$WORKER_LOG")
  # V11.17.76 — pass --no-classify when SKIP_CLASSIFY=1 (default).
  NO_CLASSIFY_FLAG=""
  if [ "$SKIP_CLASSIFY" = "1" ]; then
    NO_CLASSIFY_FLAG="--no-classify"
  fi
  echo "[w${W}] Launching with --offset $OFFSET --limit $CHUNK_SIZE $NO_CLASSIFY_FLAG  (log: $WORKER_LOG)" | tee -a "$SUMMARY_LOG"
  npx tsx scripts/batch-ingest-worker.ts \
    --backfill \
    --offset $OFFSET \
    --limit $CHUNK_SIZE \
    --poll-interval $POLL_INTERVAL \
    --max-wait $MAX_WAIT \
    $NO_CLASSIFY_FLAG \
    > "$WORKER_LOG" 2>&1 &
  PID=$!
  PIDS+=("$PID")
  echo "[w${W}] PID $PID" | tee -a "$SUMMARY_LOG"
  # V11.17.63 — stagger between worker launches.
  # Each batch POST is ~25 MB (5000 reports × ~5 KB serialized). When N
  # workers all upload simultaneously they exhaust local FDs / ephemeral
  # ports and all hit "Fatal: fetch failed" at once. STAGGER_SEC=20 means
  # each worker has finished its submission (~5-10s) before the next
  # starts, so connections don't pile up locally. Batches still process
  # in parallel server-side once submitted.
  sleep $STAGGER_SEC
done

echo "" | tee -a "$SUMMARY_LOG"
echo "All $EFFECTIVE_WORKERS workers submitted. Monitoring..." | tee -a "$SUMMARY_LOG"
echo "Tail any worker log: tail -f outputs/parallel-drain-${RUN_ID}-wN.log" | tee -a "$SUMMARY_LOG"
echo "" | tee -a "$SUMMARY_LOG"

# Graceful Ctrl+C: forward SIGINT to all children
SIGINT_RECEIVED=0
trap 'echo ""; echo "[parallel-drain] SIGINT received — forwarding to all workers."; SIGINT_RECEIVED=1; for p in "${PIDS[@]}"; do kill -INT "$p" 2>/dev/null; done' INT

# Lightweight monitor: print a heartbeat every 60s showing which workers
# are still running, plus pending count
START_TIME=$(date +%s)
while true; do
  ALIVE=0
  for p in "${PIDS[@]}"; do
    if kill -0 "$p" 2>/dev/null; then
      ALIVE=$((ALIVE + 1))
    fi
  done

  NOW_PENDING=$(node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending_review').is('paradocs_narrative', null).then(function(r) {
  console.log(r.count == null ? 0 : r.count);
}).catch(function(){ console.log('?'); });
" 2>/dev/null)

  ELAPSED=$(( $(date +%s) - START_TIME ))
  ELAPSED_MIN=$(( ELAPSED / 60 ))
  echo "[+${ELAPSED_MIN}m] alive=$ALIVE/$EFFECTIVE_WORKERS  pending_now=$NOW_PENDING" | tee -a "$SUMMARY_LOG"

  if [ "$ALIVE" = "0" ]; then
    echo "" | tee -a "$SUMMARY_LOG"
    echo "All workers exited. Wave complete." | tee -a "$SUMMARY_LOG"
    break
  fi

  if [ "$SIGINT_RECEIVED" = "1" ]; then
    echo "Waiting on workers to drain after SIGINT..." | tee -a "$SUMMARY_LOG"
  fi

  sleep 60
done

# Wait on each PID to fully clean up
for p in "${PIDS[@]}"; do
  wait "$p" 2>/dev/null || true
done

echo "" | tee -a "$SUMMARY_LOG"
echo "================================================================" | tee -a "$SUMMARY_LOG"
echo "Parallel-drain wave finished: $(date)"                             | tee -a "$SUMMARY_LOG"
FINAL_PENDING=$(node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending_review').is('paradocs_narrative', null).then(function(r) {
  console.log(r.count == null ? 0 : r.count);
}).catch(function(){ console.log('?'); });
" 2>/dev/null)
echo "Final pending count: $FINAL_PENDING" | tee -a "$SUMMARY_LOG"
echo "================================================================" | tee -a "$SUMMARY_LOG"

if [ "$FINAL_PENDING" != "0" ] && [ -n "$FINAL_PENDING" ] && [ "$FINAL_PENDING" != "?" ]; then
  echo ""
  echo "Note: $FINAL_PENDING rows still pending. Re-run this script for another wave."
  echo "Each wave handles up to $((NUM_WORKERS * CHUNK_SIZE)) rows."
fi

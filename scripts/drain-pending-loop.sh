#!/bin/bash
# V11.17.62 — Drain pending_review queue via repeated batch-ingest-worker.
#
# Why this exists:
#   Supabase's PostgREST max-rows config caps each batch-ingest-worker
#   invocation at ~5,000 rows even when --limit asks for more. After a
#   big ingest run (e.g. Reddit V11.17.62 → 99k+ pending), draining the
#   queue requires ~20 iterations. This wrapper handles that loop.
#
# What it does:
#   1. Queries pending_review count where paradocs_narrative IS NULL
#   2. If zero, exits successfully
#   3. Otherwise launches batch-ingest-worker.ts for ONE round
#      (each round = 1 Anthropic Batch API submission, ~5k reports)
#   4. After the round completes, sleeps briefly, loops
#   5. Stops on: pending=0 | daily-cap-hit | MAX_ITERATIONS reached
#
# Usage:
#   set -a; source .env.local; set +a
#   bash scripts/drain-pending-loop.sh
#
# Optional env overrides:
#   MAX_ITERATIONS=30        (default 30)
#   SLEEP_BETWEEN_SEC=30     (default 30)
#
# Safe to interrupt:
#   Ctrl+C between iterations is clean — worker rounds are atomic.
#   Ctrl+C MID-iteration kills only the running batch worker; loop
#   exits next. State is preserved (Supabase + Anthropic batch IDs).

MAX_ITERATIONS=${MAX_ITERATIONS:-30}
SLEEP_BETWEEN_SEC=${SLEEP_BETWEEN_SEC:-30}
LOG_DIR="outputs"
mkdir -p "$LOG_DIR"

count_pending() {
  node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending_review').is('paradocs_narrative', null).then(function(r) {
  console.log(r.count == null ? 0 : r.count);
}).catch(function(e) {
  console.error('count query error: ' + (e && e.message ? e.message : e));
  console.log(-1);
});
" 2>/dev/null
}

echo "================================================================"
echo "Drain-pending loop"
echo "Started: $(date)"
echo "Max iterations: $MAX_ITERATIONS"
echo "Sleep between rounds: ${SLEEP_BETWEEN_SEC}s"
echo "================================================================"

# Capture Ctrl+C cleanly
trap 'echo ""; echo "[drain-loop] Caught SIGINT — finishing current round, then exiting."; CAUGHT_SIGINT=1' INT
CAUGHT_SIGINT=0

ITERATION=0
LAST_PENDING=""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))

  PENDING=$(count_pending)
  echo ""
  echo "----------------------------------------------------------------"
  echo "Iteration $ITERATION / $MAX_ITERATIONS  |  $(date)"
  echo "Pending reports needing AI: $PENDING"

  if [ "$PENDING" = "-1" ]; then
    echo "[drain-loop] Count query failed. Retrying in 30s..."
    sleep 30
    continue
  fi

  if [ "$PENDING" = "0" ]; then
    echo "[drain-loop] Pending queue drained. Done."
    break
  fi

  # Stall detection: if pending hasn't moved across 2 consecutive iterations,
  # the worker isn't making progress. Bail out so user can investigate.
  if [ "$ITERATION" -gt "1" ] && [ "$PENDING" = "$LAST_PENDING" ]; then
    echo "[drain-loop] WARNING: pending count unchanged from previous iteration ($PENDING)."
    echo "[drain-loop] Possible causes: AI failing silently, daily cap hit, all remaining rows are stuck."
    echo "[drain-loop] Inspect outputs/batch-drain-iter*.log and re-run when fixed."
    break
  fi
  LAST_PENDING="$PENDING"

  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  LOG_FILE="$LOG_DIR/batch-drain-iter${ITERATION}-${TIMESTAMP}.log"
  echo "[drain-loop] Launching batch-ingest-worker (log: $LOG_FILE)..."

  # Run one worker round. tee preserves both terminal + log file.
  # We do NOT exit on failure — transient Anthropic / Supabase blips
  # shouldn't kill the loop; they'll resolve on the next iteration.
  npx tsx scripts/batch-ingest-worker.ts \
    --backfill \
    --limit 100000 \
    --poll-interval 60 \
    --max-wait 86400 \
    2>&1 | tee "$LOG_FILE"
  WORKER_RC=${PIPESTATUS[0]}

  if [ "$WORKER_RC" != "0" ]; then
    echo "[drain-loop] Iteration $ITERATION worker exited non-zero ($WORKER_RC). Continuing after 60s..."
    sleep 60
  else
    echo "[drain-loop] Iteration $ITERATION completed cleanly."
  fi

  # Check if the worker stopped because of the daily cap — stop looping.
  if grep -q "Daily cap reached" "$LOG_FILE"; then
    echo "[drain-loop] Daily cap reached. Stopping."
    echo "[drain-loop] Either wait until UTC midnight or raise PARADOCS_MASS_INGEST_DAILY_CAP and re-run."
    break
  fi

  # If user pressed Ctrl+C during the worker round, exit cleanly now.
  if [ "$CAUGHT_SIGINT" = "1" ]; then
    echo "[drain-loop] Exiting on SIGINT."
    break
  fi

  echo "[drain-loop] Sleeping ${SLEEP_BETWEEN_SEC}s before next round..."
  sleep $SLEEP_BETWEEN_SEC
done

echo ""
echo "================================================================"
echo "Drain loop finished: $(date)"
FINAL_PENDING=$(count_pending)
echo "Final pending count: $FINAL_PENDING"
if [ "$ITERATION" = "$MAX_ITERATIONS" ]; then
  echo "Note: hit MAX_ITERATIONS=$MAX_ITERATIONS. Re-run if pending > 0."
fi
echo "================================================================"

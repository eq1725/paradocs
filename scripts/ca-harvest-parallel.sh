#!/bin/bash
# ca-harvest-parallel.sh — V11.18.31
#
# Year-partitioned parallel fan-out for the LoC harvest phase.
#
# WHY
#   ca-harvest.ts is single-stream: its throughput ceiling is per-request
#   LATENCY (cold OCR renders take 20-40s), not the --rate-ms gate. The only
#   way to raise throughput is to keep several requests in flight — i.e. run
#   N harvester PROCESSES at once. ca-loc-parallel-probe.ts tells you how many
#   (P) loc.gov tolerates before 429/503. This wrapper runs P workers, each
#   over a DISJOINT slice of the year range.
#
# WHY THIS IS RACE-FREE
#   - Shards are named <slug>-<year>.json. Workers own disjoint years, so no
#     two workers ever write the same shard file.
#   - OCR cache is content-addressed by pageId — idempotent, safe to share.
#   - The ONLY single-writer artifact is the harvest state JSON, so each
#     worker gets its own via CA_STATE_FILE (added in ca-harvest.ts V11.18.31).
#
# USAGE (operator terminal — runs for hours/days; NOT the 45s sandbox)
#   set -a; source .env.local; set +a
#   WORKERS=2 bash scripts/ca-harvest-parallel.sh                 # 1898-1928, P=2
#   WORKERS=3 YEARS=1898-1928 TERMS=all bash scripts/ca-harvest-parallel.sh
#   BUDGET_SEC=3600 WORKERS=2 bash scripts/ca-harvest-parallel.sh # one ~1h wave then exit
#
# ENV
#   WORKERS     concurrent harvester processes (default 2). USE THE PROBE'S P.
#   YEARS       Y1-Y2 inclusive (default 1898-1928).
#   TERMS       --terms value: category | all | csv (default all).
#   MAX_PAGES   --max-pages per term×year (default 5).
#   RATE_MS     per-worker --rate-ms (default 3000 = 20 req/min/worker).
#   BUDGET_SEC  per-worker --budget-sec (default 0 = run year-slice to completion).
#
# NOTES
#   - Re-run any time: each worker resumes from its own durable state file.
#   - Safe to Ctrl+C — SIGINT is forwarded; each worker saves state and exits.
#   - This does NOT extract/ingest. Run scripts/ca-extract-ingest.ts (or the
#     daemon) on the resulting shards afterward.

set -u
cd "$(dirname "$0")/.."

WORKERS=${WORKERS:-2}
YEARS=${YEARS:-1898-1928}
TERMS=${TERMS:-all}
MAX_PAGES=${MAX_PAGES:-5}
RATE_MS=${RATE_MS:-3000}
BUDGET_SEC=${BUDGET_SEC:-0}
STAGGER_SEC=${STAGGER_SEC:-5}

if ! [[ "$YEARS" =~ ^([0-9]{4})-([0-9]{4})$ ]]; then
  echo "ERROR: YEARS must be Y1-Y2 (e.g. 1898-1928); got '$YEARS'"; exit 1
fi
Y1=${BASH_REMATCH[1]}
Y2=${BASH_REMATCH[2]}
if [ "$Y2" -lt "$Y1" ]; then echo "ERROR: YEARS end < start"; exit 1; fi

TOTAL_YEARS=$(( Y2 - Y1 + 1 ))
if [ "$WORKERS" -gt "$TOTAL_YEARS" ]; then
  echo "Note: WORKERS ($WORKERS) > year count ($TOTAL_YEARS); capping to $TOTAL_YEARS."
  WORKERS=$TOTAL_YEARS
fi

mkdir -p outputs
RUN_ID=$(date +%Y%m%d-%H%M%S)
SUMMARY_LOG="outputs/ca-harvest-parallel-${RUN_ID}-summary.log"

echo "================================================================" | tee "$SUMMARY_LOG"
echo "CA harvest parallel fan-out — run id $RUN_ID"                      | tee -a "$SUMMARY_LOG"
echo "Started:    $(date)"                                               | tee -a "$SUMMARY_LOG"
echo "Years:      $Y1-$Y2 ($TOTAL_YEARS years)"                          | tee -a "$SUMMARY_LOG"
echo "Workers:    $WORKERS  | terms=$TERMS max-pages=$MAX_PAGES rate-ms=$RATE_MS budget-sec=$BUDGET_SEC" | tee -a "$SUMMARY_LOG"
echo "================================================================" | tee -a "$SUMMARY_LOG"

# Partition [Y1,Y2] into WORKERS contiguous slices, distributing remainder.
BASE=$(( TOTAL_YEARS / WORKERS ))
REM=$(( TOTAL_YEARS % WORKERS ))

PIDS=()
CUR=$Y1
for ((W=0; W<WORKERS; W++)); do
  SPAN=$BASE
  if [ "$W" -lt "$REM" ]; then SPAN=$(( BASE + 1 )); fi
  WS=$CUR
  WE=$(( CUR + SPAN - 1 ))
  CUR=$(( WE + 1 ))

  STATE_FILE="outputs/ca-harvest-state-w${W}.json"
  WORKER_LOG="outputs/ca-harvest-parallel-${RUN_ID}-w${W}.log"
  YEARS_ARG="$WS-$WE"
  if [ "$WS" = "$WE" ]; then YEARS_ARG="$WS"; fi

  BUDGET_ARG=""
  if [ "$BUDGET_SEC" != "0" ]; then BUDGET_ARG="--budget-sec $BUDGET_SEC"; fi

  echo "[w${W}] years=$YEARS_ARG state=$STATE_FILE log=$WORKER_LOG" | tee -a "$SUMMARY_LOG"
  CA_STATE_FILE="$STATE_FILE" npx tsx scripts/ca-harvest.ts \
    --terms "$TERMS" \
    --years "$YEARS_ARG" \
    --fetch-ocr \
    --max-pages "$MAX_PAGES" \
    --rate-ms "$RATE_MS" \
    $BUDGET_ARG \
    > "$WORKER_LOG" 2>&1 &
  PID=$!
  PIDS+=("$PID")
  echo "[w${W}] PID $PID" | tee -a "$SUMMARY_LOG"
  sleep "$STAGGER_SEC"
done

echo "" | tee -a "$SUMMARY_LOG"
echo "All $WORKERS workers launched. Tail: tail -f outputs/ca-harvest-parallel-${RUN_ID}-wN.log" | tee -a "$SUMMARY_LOG"

trap 'echo ""; echo "[ca-harvest-parallel] SIGINT — forwarding to workers."; for p in "${PIDS[@]}"; do kill -INT "$p" 2>/dev/null; done' INT

START=$(date +%s)
while true; do
  ALIVE=0
  for p in "${PIDS[@]}"; do kill -0 "$p" 2>/dev/null && ALIVE=$((ALIVE+1)); done
  SHARDS=$(ls outputs/ca-shards/*.json 2>/dev/null | wc -l | tr -d ' ')
  EMIN=$(( ($(date +%s) - START) / 60 ))
  echo "[+${EMIN}m] alive=$ALIVE/$WORKERS shard_files=$SHARDS" | tee -a "$SUMMARY_LOG"
  [ "$ALIVE" = "0" ] && break
  sleep 60
done

for p in "${PIDS[@]}"; do wait "$p" 2>/dev/null || true; done

echo "" | tee -a "$SUMMARY_LOG"
echo "CA harvest parallel wave finished: $(date)" | tee -a "$SUMMARY_LOG"
echo "Shard files now: $(ls outputs/ca-shards/*.json 2>/dev/null | wc -l | tr -d ' ')" | tee -a "$SUMMARY_LOG"
echo "Next: extract+ingest with scripts/ca-extract-ingest.ts --shard 'outputs/ca-shards/*.json'" | tee -a "$SUMMARY_LOG"

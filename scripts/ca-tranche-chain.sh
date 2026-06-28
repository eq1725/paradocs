#!/bin/bash
# ca-tranche-chain.sh — V11.31
#
# Run the CA ingest daemon across a SEQUENCE of year ranges, auto-advancing
# to the next once the current one is mined out. Relies on the daemon's
# STOP_WHEN_DRAINED mode: the daemon exits 0 after two consecutive harvest
# waves add zero new shards (tranche exhausted), and this wrapper then starts
# the next range. Resumable — each tranche picks up from its harvest state.
#
# USAGE (run under caffeinate so the Mac doesn't sleep mid-run):
#   set -a; source .env.local; set +a
#   nohup caffeinate -i bash scripts/ca-tranche-chain.sh > outputs/ca-chain.out 2>&1 &
#
# Default order: finish 1868-1897, then 1850-1867. Override:
#   CHAIN_YEARS="1868-1897 1850-1867 1929-1945" bash scripts/ca-tranche-chain.sh
#
# STOP the whole chain anytime:  touch outputs/ca-daemon.STOP
#   (the running tranche finishes its current wave, exits, and the chain halts
#    because the STOP file is still present. Remove it to resume later.)
#
# ENV (passed through to the daemon)
#   CHAIN_YEARS           space-separated ranges (default "1868-1897 1850-1867")
#   WORKERS               harvester concurrency (default 2 — the probe's safe P)
#   MAX_COST_USD          per-wave extract cap (default 30)
#   NARRATE_MAX_COST_USD  per-wave narrate cap (default 10)

set -u
cd "$(dirname "$0")/.."

CHAIN_YEARS=${CHAIN_YEARS:-"1868-1897 1850-1867"}
WORKERS=${WORKERS:-2}
MAX_COST_USD=${MAX_COST_USD:-30}
NARRATE_MAX_COST_USD=${NARRATE_MAX_COST_USD:-10}

[ -f .env.local ] && { set -a; source .env.local; set +a; }
CHAINLOG="outputs/ca-chain-$(date +%Y%m%d).log"
clog() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [chain] $*" | tee -a "$CHAINLOG"; }

clog "chain start — ranges: $CHAIN_YEARS | WORKERS=$WORKERS max_cost=\$$MAX_COST_USD"

for YR in $CHAIN_YEARS; do
  if [ -f outputs/ca-daemon.STOP ]; then
    clog "STOP file present — halting chain before tranche $YR."
    exit 0
  fi
  clog "===== TRANCHE $YR : starting (STOP_WHEN_DRAINED) ====="
  STOP_WHEN_DRAINED=1 ONESHOT=0 YEARS="$YR" WORKERS="$WORKERS" \
    MAX_COST_USD="$MAX_COST_USD" NARRATE_MAX_COST_USD="$NARRATE_MAX_COST_USD" \
    bash scripts/ca-ingest-daemon.sh
  rc=$?
  clog "===== TRANCHE $YR : daemon exited (rc=$rc) ====="
  # A manual STOP exits the daemon AND leaves the STOP file in place — halt
  # the whole chain rather than rolling into the next range.
  if [ -f outputs/ca-daemon.STOP ]; then
    clog "STOP file present after tranche $YR — halting chain (remove the file to resume)."
    exit 0
  fi
done

clog "chain complete — all tranches mined out: $CHAIN_YEARS"

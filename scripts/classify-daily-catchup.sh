#!/bin/bash
# V11.17.93 - daily classifier cron.
#
# Wraps `scripts/classify-phenomena-batch.ts --all` for unattended
# execution under launchd (laptop) or GitHub Actions (cloud).
#
# Behavior:
#   - Sources ~/paradocs/.env.local so Supabase + Anthropic creds are
#     available without baking them into the plist.
#   - Streams classifier output to a dated log under outputs/ AND to
#     stdout (so launchd's StandardOutPath captures it too).
#   - Exits with the classifier's own exit code so cron callers can
#     detect failures.
#   - Classifier exits cleanly when its queue is empty (no daemon),
#     so this wrapper is a true one-shot — safe to run daily.
#
# Expected daily volume: ~2-3k newly-approved NUFORC reports.
# Expected runtime: 10-30 min. Expected cost: ~$3-5/run at V11.17.92.

set -e
cd "$(dirname "$0")/.."

# Load .env.local into the environment. `set -a` auto-exports every
# assignment that follows; `set +a` turns that off after sourcing.
set -a
# shellcheck disable=SC1091
source .env.local
set +a

mkdir -p outputs
LOG="outputs/classifier-cron-$(date +%Y%m%d-%H%M).log"

echo "[$(date)] Starting daily classifier catch-up (V11.17.93)" | tee -a "$LOG"
echo "[$(date)] cwd=$(pwd) node=$(node -v 2>/dev/null || echo missing)" | tee -a "$LOG"

# `tee` masks the real exit code of the upstream command — read it
# back from PIPESTATUS so we can propagate it.
npx tsx scripts/classify-phenomena-batch.ts --all 2>&1 | tee -a "$LOG"
RC=${PIPESTATUS[0]}

echo "[$(date)] Classifier exited with code $RC" | tee -a "$LOG"
exit "$RC"

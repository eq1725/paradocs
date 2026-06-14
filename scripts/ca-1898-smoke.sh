#!/bin/bash
# ca-1898-smoke.sh — V11.18.31
#
# End-to-end smoke test on year 1898 BEFORE unleashing the 1898-1928 daemon.
# Validates the whole chain on a tiny, cost-capped slice:
#   harvest (search + OCR + snippet cut) → extract (Haiku Batch) → DB insert.
#
# Two modes:
#   DRY=1 (default)  harvest a small 1898 slice, then extractor --dry-run
#                    (parse + cost estimate only — NO Anthropic spend, NO DB).
#                    Proves the harvest + shard + extractor-parse path.
#   DRY=0            same harvest, then a LIVE extract capped at --limit SMOKE_LIMIT
#                    and --max-cost SMOKE_MAX_COST. Proves the real insert path.
#
# Run on the OPERATOR TERMINAL (OCR fetches exceed the 45s sandbox budget):
#   set -a; source .env.local; set +a
#   bash scripts/ca-1898-smoke.sh            # dry, ~free, a few minutes
#   DRY=0 bash scripts/ca-1898-smoke.sh      # live mini-ingest (~$1-2, writes pending_review rows)
#
# ENV
#   DRY              1=dry extract (default), 0=live capped extract
#   SMOKE_TERMS      --terms for the harvest (default "haunted house,sea serpent")
#   SMOKE_MAXPAGES   harvester --max-pages (default 2)
#   SMOKE_BUDGET     harvester --budget-sec (default 360)
#   SMOKE_LIMIT      live extract snippet cap (default 25)
#   SMOKE_MAX_COST   live extract --max-cost USD (default 2)
#
# Exit code 0 = PASS (safe to unleash), non-zero = FAIL (investigate first).

set -u
cd "$(dirname "$0")/.."

DRY=${DRY:-1}
SMOKE_TERMS=${SMOKE_TERMS:-"haunted house,sea serpent"}
SMOKE_MAXPAGES=${SMOKE_MAXPAGES:-2}
SMOKE_BUDGET=${SMOKE_BUDGET:-360}
SMOKE_LIMIT=${SMOKE_LIMIT:-25}
SMOKE_MAX_COST=${SMOKE_MAX_COST:-2}

mkdir -p outputs
SMOKE_STATE="outputs/ca-harvest-state-smoke1898.json"
LOG="outputs/ca-1898-smoke-$(date +%Y%m%d-%H%M%S).log"
PASS=1

say() { echo "[smoke] $*" | tee -a "$LOG"; }
fail() { echo "[smoke][FAIL] $*" | tee -a "$LOG"; PASS=0; }

say "=== CA 1898 smoke test (V11.18.31) ==="
say "mode=$([ "$DRY" = "1" ] && echo DRY || echo LIVE) terms=\"$SMOKE_TERMS\" max-pages=$SMOKE_MAXPAGES budget=${SMOKE_BUDGET}s"
say "node=$(node -v 2>/dev/null || echo missing)"

if [ "$DRY" = "0" ]; then
  if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    fail "LIVE mode needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY. Did you 'source .env.local'?"
    say "RESULT: FAIL"; exit 1
  fi
fi

# ── STEP 1: harvest a small 1898 slice ───────────────────────────────
say "--- step 1: harvest 1898 ---"
CA_STATE_FILE="$SMOKE_STATE" npx tsx scripts/ca-harvest.ts \
  --terms "$SMOKE_TERMS" \
  --year 1898 \
  --fetch-ocr \
  --max-pages "$SMOKE_MAXPAGES" \
  --rate-ms 3000 \
  --budget-sec "$SMOKE_BUDGET" \
  2>&1 | tee -a "$LOG"
HARVEST_RC=${PIPESTATUS[0]}
[ "$HARVEST_RC" = "0" ] || fail "harvester exited $HARVEST_RC"

# ── STEP 2: verify shards + snippets exist ───────────────────────────
say "--- step 2: verify 1898 shards ---"
SHARDS=$(ls outputs/ca-shards/*-1898.json 2>/dev/null | wc -l | tr -d ' ')
say "1898 shard files: $SHARDS"
[ "$SHARDS" -gt 0 ] || fail "no *-1898.json shard files were produced"

SNIPPETS=0
if [ "$SHARDS" -gt 0 ]; then
  SNIPPETS=$(node -e "
    const fs=require('fs'),g=require('path');
    let n=0;
    for (const f of fs.readdirSync('outputs/ca-shards')) {
      if (!/-1898\.json$/.test(f)) continue;
      try { n += JSON.parse(fs.readFileSync(g.join('outputs/ca-shards',f),'utf8')).length; } catch {}
    }
    console.log(n);
  " 2>/dev/null || echo 0)
  say "total 1898 snippets across shards: $SNIPPETS"
  [ "$SNIPPETS" -gt 0 ] || fail "shards exist but contain 0 snippets"
fi

# ── STEP 3: extractor ────────────────────────────────────────────────
if [ "$DRY" = "1" ]; then
  say "--- step 3: extractor DRY-RUN (no AI, no DB) ---"
  npx tsx scripts/ca-extract-ingest.ts --shard 'outputs/ca-shards/*-1898.json' --dry-run 2>&1 | tee -a "$LOG"
  EXTRACT_RC=${PIPESTATUS[0]}
  [ "$EXTRACT_RC" = "0" ] || fail "extractor --dry-run exited $EXTRACT_RC"
else
  say "--- step 3: extractor LIVE (--limit $SMOKE_LIMIT --max-cost \$$SMOKE_MAX_COST) ---"
  BEFORE=$(node -e "
    const {createClient}=require('@supabase/supabase-js');
    const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    sb.from('reports').select('*',{count:'exact',head:true}).eq('source_type','chronicling-america').then(r=>{console.log(r.count==null?0:r.count)}).catch(()=>console.log(-1));
  " 2>/dev/null || echo -1)
  say "chronicling-america rows before: $BEFORE"
  npx tsx scripts/ca-extract-ingest.ts --shard 'outputs/ca-shards/*-1898.json' --limit "$SMOKE_LIMIT" --max-cost "$SMOKE_MAX_COST" --poll-interval 30 2>&1 | tee -a "$LOG"
  EXTRACT_RC=${PIPESTATUS[0]}
  [ "$EXTRACT_RC" = "0" ] || fail "extractor live run exited $EXTRACT_RC"
  AFTER=$(node -e "
    const {createClient}=require('@supabase/supabase-js');
    const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    sb.from('reports').select('*',{count:'exact',head:true}).eq('source_type','chronicling-america').then(r=>{console.log(r.count==null?0:r.count)}).catch(()=>console.log(-1));
  " 2>/dev/null || echo -1)
  say "chronicling-america rows after: $AFTER"
  if [ "$BEFORE" != "-1" ] && [ "$AFTER" != "-1" ]; then
    if [ "$AFTER" -le "$BEFORE" ]; then
      say "NOTE: row count did not increase — could be all-duplicate snippets or all-rejected. Inspect the log above."
    else
      say "inserted ~$(( AFTER - BEFORE )) new chronicling-america rows."
    fi
  fi
fi

# ── RESULT ───────────────────────────────────────────────────────────
say "================================================"
if [ "$PASS" = "1" ]; then
  say "RESULT: PASS — harvest+extract chain healthy on 1898."
  say "Next: install com.paradocs.ca-ingest.plist (WORKERS = probe's P) to unleash 1898-1928."
  say "Log: $LOG"
  exit 0
else
  say "RESULT: FAIL — do NOT unleash the daemon until resolved. See $LOG"
  exit 1
fi

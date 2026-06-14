#!/bin/bash
# ca-watch.sh — V11.18.31
#
# Live progress dashboard for the CA tranche-one daemon. Refreshes a single
# terminal pane: current harvest activity, shard/OCR growth, DB row counts,
# extraction cost-to-date, and the latest daemon-wave lines. Read-only.
#
# USAGE (its own terminal window):
#   set -a; source .env.local; set +a
#   bash scripts/ca-watch.sh            # refresh every 20s
#   INTERVAL=10 bash scripts/ca-watch.sh
#
# Ctrl+C to exit (does not affect the daemon).

set -u
cd "$(dirname "$0")/.."
INTERVAL=${INTERVAL:-20}

[ -f .env.local ] && { set -a; source .env.local; set +a; }

DB_QUERY='
const {createClient}=require("@supabase/supabase-js");
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const ca=()=>sb.from("reports").select("*",{count:"exact",head:true}).eq("source_type","chronicling-america");
Promise.all([
  ca(),
  ca().eq("status","pending_review"),
  ca().eq("status","approved"),
  sb.from("paradocs_narrative_cost_log").select("cost_usd").eq("service","ca-extract"),
]).then(([tot,pend,appr,cost])=>{
  const spend=(cost.data||[]).reduce((a,r)=>a+(r.cost_usd||0),0);
  console.log(`${tot.count??"?"}|${pend.count??"?"}|${appr.count??"?"}|${spend.toFixed(2)}`);
}).catch(e=>console.log(`ERR|${(e.message||e).slice(0,40)}|-|-`));
'

while true; do
  clear
  echo "════════════════════════════════════════════════════════════════"
  echo "  CA tranche-one — live  ($(date '+%Y-%m-%d %H:%M:%S'))   refresh ${INTERVAL}s"
  echo "════════════════════════════════════════════════════════════════"

  # ── launchd state ───────────────────────────────────────────────────
  LD=$(launchctl list 2>/dev/null | grep com.paradocs.ca-ingest || true)
  if [ -n "$LD" ]; then
    DPID=$(echo "$LD" | awk '{print $1}')
    echo "  daemon: RUNNING (launchd pid $DPID)"
  else
    echo "  daemon: NOT loaded in launchd"
  fi
  [ -f outputs/ca-daemon.STOP ] && echo "  ⚠ STOP file present — daemon will exit after current wave"

  # ── harvest artifacts ───────────────────────────────────────────────
  SHARDS=$(ls outputs/ca-shards/*.json 2>/dev/null | wc -l | tr -d ' ')
  OCR=$(ls outputs/ca-ocr-cache/*.txt 2>/dev/null | wc -l | tr -d ' ')
  echo "  harvest: ${SHARDS} shard files | ${OCR} OCR pages cached"

  # ── DB counts + cost ────────────────────────────────────────────────
  if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
    ROW=$(node -e "$DB_QUERY" 2>/dev/null || echo "ERR|-|-|-")
    IFS='|' read -r TOT PEND APPR SPEND <<< "$ROW"
    echo "  DB:      ${TOT} CA rows  |  ${PEND} pending_review  |  ${APPR} approved"
    echo "  spend:   \$${SPEND} (ca-extract, all-time)"
  else
    echo "  DB:      (no creds — run 'set -a; source .env.local; set +a' first)"
  fi

  # ── current harvest worker (newest per-wave log) ────────────────────
  WLOG=$(ls -t outputs/ca-harvest-parallel-*-w0.log 2>/dev/null | head -1)
  echo "────────────────────────────────────────────────────────────────"
  if [ -n "$WLOG" ]; then
    echo "  harvest worker  ($(basename "$WLOG")):"
    grep -E '\[ca-harvest\]|HTTP (429|50[0-9])|search|ocr ' "$WLOG" 2>/dev/null | tail -3 | sed 's/^/    /'
    H429=$(grep -c 'HTTP 429' "$WLOG" 2>/dev/null || echo 0)
    [ "$H429" -gt 0 ] && echo "    ⚠ $H429 HTTP 429 lines in this worker log — loc.gov throttling"
  else
    echo "  harvest worker: (no worker log yet — wave may be between harvest/extract)"
  fi

  # ── daemon wave log ─────────────────────────────────────────────────
  DLOG=$(ls -t outputs/ca-daemon-*.log 2>/dev/null | head -1)
  echo "────────────────────────────────────────────────────────────────"
  if [ -n "$DLOG" ]; then
    echo "  daemon log ($(basename "$DLOG")):"
    tail -4 "$DLOG" 2>/dev/null | sed 's/^/    /'
  fi
  echo "════════════════════════════════════════════════════════════════"
  echo "  Ctrl+C to close this view (daemon keeps running)."

  sleep "$INTERVAL"
done

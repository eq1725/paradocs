#!/bin/bash
# ca-digest.sh — V11.18.32
#
# Morning digest for the CA tranche-one ingest daemon. Concise overnight
# readout: corpus growth, per-wave submit/cost since last digest, cost-to-date
# vs budget, LoC error health, daemon up/down. Read-only except a tiny state
# file (outputs/ca-digest-state.json) used to compute deltas between runs.
#
# Reuses the same DB count query and log-grep patterns as ca-watch.sh.
# Designed to be run by a scheduled task each morning; prints the digest to
# stdout (the scheduler captures + delivers it). Resilient: never aborts on a
# mid-wave state, a just-rolled log, or a flaky DB call — degrades to "?".
#
# USAGE
#   set -a; source .env.local; set +a
#   bash scripts/ca-digest.sh
#
# ENV
#   CA_BUDGET_USD   budget to compare cost-to-date against (default 550)

set -u
cd "$(dirname "$0")/.." 2>/dev/null || cd "$HOME/paradocs" 2>/dev/null || true
[ -f .env.local ] && { set -a; source .env.local 2>/dev/null; set +a; }

BUDGET=${CA_BUDGET_USD:-550}
STATE="outputs/ca-digest-state.json"
mkdir -p outputs 2>/dev/null

# ── prior digest state (for deltas) ──────────────────────────────────
read PREV_TOTAL PREV_PENDING PREV_APPROVED PREV_WAVES < <(node -e '
try { const s=require("./outputs/ca-digest-state.json");
  console.log((s.lastTotal??"-")+" "+(s.lastPending??"-")+" "+(s.lastApproved??"-")+" "+(s.lastWaveTotal??"-")); }
catch { console.log("- - - -"); }' 2>/dev/null || echo "- - - -")

# ── live DB counts (same query shape as ca-watch.sh) ─────────────────
DBROW="?|?|?"
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  DBROW=$(node -e '
    const {createClient}=require("@supabase/supabase-js");
    const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const ca=()=>sb.from("reports").select("*",{count:"exact",head:true}).eq("source_type","chronicling-america");
    Promise.all([ca(),ca().eq("status","pending_review"),ca().eq("status","approved")])
      .then(([t,p,a])=>console.log((t.count??"?")+"|"+(p.count??"?")+"|"+(a.count??"?")))
      .catch(()=>console.log("?|?|?"));
  ' 2>/dev/null || echo "?|?|?")
fi
IFS='|' read -r TOTAL PENDING APPROVED <<< "$DBROW"

delta() { # $1 now $2 prev
  if [ "${1:-?}" = "?" ] || [ "${2:-?}" = "-" ] || [ "${2:-?}" = "?" ]; then echo ""; else
    local d=$(( ${1:-0} - ${2:-0} )); [ "$d" -ge 0 ] && echo "(+$d)" || echo "($d)"; fi
}

# ── daemon health (no launchctl in sandbox — infer from lock + log mtime) ──
DLOG="$(ls -t outputs/ca-daemon-*.log 2>/dev/null | head -1)"
HEALTH="UNKNOWN"; LOGAGE="n/a"
if [ -n "$DLOG" ] && [ -f "$DLOG" ]; then
  MT=$(stat -c %Y "$DLOG" 2>/dev/null || stat -f %m "$DLOG" 2>/dev/null || echo 0)
  [[ "$MT" =~ ^[0-9]+$ ]] || MT=0
  AGE=$(( $(date +%s) - MT )); LOGAGE="$(( AGE/60 ))m ago"
  if [ -d outputs/ca-daemon.lock ] && [ "$AGE" -lt 7200 ]; then HEALTH="RUNNING"
  elif [ -d outputs/ca-daemon.lock ]; then HEALTH="LOCK HELD but log stale ${LOGAGE} — check it"
  else HEALTH="NOT RUNNING (no lock; last log ${LOGAGE})"; fi
fi
[ -f outputs/ca-daemon.STOP ] && HEALTH="$HEALTH + STOP file present"

# ── per-wave submit/cost since last digest + cost-to-date ────────────
# Walk ALL daemon logs (oldest→newest) and collect every completed extract
# block as a (submitted, cost) pair, in order. "Since last digest" = the pairs
# beyond the wave-count we recorded last run — a timezone-INDEPENDENT diff (the
# earlier string-vs-ISO timestamp compare was buggy: local "YYYY-MM-DD HH:MM"
# always sorts before a UTC "…T…Z"). cost-to-date sums every pair (all time).
WAVE_JSON=$(node -e '
  const fs=require("fs");
  const prevWaves=(process.argv[1]&&process.argv[1]!=="-")?parseInt(process.argv[1],10):0;
  const files=fs.readdirSync("outputs").filter(f=>/^ca-daemon-.*\.log$/.test(f))
    .map(f=>"outputs/"+f).sort();
  const pairs=[]; let pendingSubmit=null, inProgress=false;
  for(const f of files){
    let txt; try{txt=fs.readFileSync(f,"utf8");}catch{continue;}
    for(const line of txt.split("\n")){
      const sm=line.match(/^submitted:\s+(\d+)/);          if(sm){ pendingSubmit=+sm[1]; continue; }
      const cm=line.match(/^cost:\s+\$([\d.]+)/);
      if(cm){ pairs.push({submit: pendingSubmit==null?0:pendingSubmit, cost: parseFloat(cm[1])}); pendingSubmit=null; }
    }
    const tailAfterWave=txt.split("===== WAVE").pop()||"";
    if(/submitting chunk/.test(tailAfterWave) && !/WAVE \d+ done/.test(tailAfterWave)) inProgress=true;
  }
  const allCost=pairs.reduce((a,p)=>a+p.cost,0);
  const total=pairs.length;
  // guard against log rotation making the count appear to shrink
  const startIdx=(prevWaves>=0&&prevWaves<=total)?prevWaves:Math.max(0,total-1);
  const recent=pairs.slice(startIdx);
  const subs=recent.map(p=>p.submit);
  const min=subs.length?Math.min(...subs):0, max=subs.length?Math.max(...subs):0;
  const avg=subs.length?Math.round(subs.reduce((a,b)=>a+b,0)/subs.length):0;
  console.log(JSON.stringify({allCost, perWaveCost:recent.reduce((a,p)=>a+p.cost,0),
    waveN:recent.length, totalWaves:total, min, max, avg, inProgress}));
' "$PREV_WAVES" 2>/dev/null || echo '{}')

read ALLCOST PERWCOST WAVEN TOTWAVES SMIN SMAX SAVG INPROG < <(node -e '
  let j={}; try{j=JSON.parse(process.argv[1]||"{}");}catch{}
  console.log((j.allCost??0).toFixed(2),(j.perWaveCost??0).toFixed(2),
    (j.waveN??0),(j.totalWaves??0),(j.min??0),(j.max??0),(j.avg??0),(j.inProgress?"yes":"no"));
' "$WAVE_JSON" 2>/dev/null || echo "0 0 0 0 0 0 0 no")

# ── LoC error health since last digest (newest worker logs) ──────────
WLOGS=$(ls -t outputs/ca-harvest-parallel-*-w0.log 2>/dev/null | head -3)
H429=0; H5XX=0
if [ -n "$WLOGS" ]; then
  H429=$(grep -ch 'HTTP 429' $WLOGS 2>/dev/null | paste -sd+ - | bc 2>/dev/null || echo 0)
  H5XX=$(grep -chE 'HTTP 50[0-9]|backing off' $WLOGS 2>/dev/null | paste -sd+ - | bc 2>/dev/null || echo 0)
fi
OCRRATE="n/a"
if [ -f outputs/ca-harvest-state-w0.json ]; then
  OCRRATE=$(node -e '
    try{const s=require("./outputs/ca-harvest-state-w0.json");let f=0,e=0;
      for(const k in s.jobs){f+=s.jobs[k].counters?.pagesOcrFetched||0;e+=s.jobs[k].counters?.ocrErrors||0;}
      console.log(f? (e*100/f).toFixed(1)+"% ("+e+"/"+f+")":"n/a");}catch{console.log("n/a");}' 2>/dev/null || echo "n/a")
fi

PCT=$(node -e "console.log(($ALLCOST/$BUDGET*100).toFixed(0))" 2>/dev/null || echo "?")
PROGNOTE=""; [ "$INPROG" = "yes" ] && PROGNOTE="  (a wave is mid-flight; its numbers aren't counted yet)"

# ── Classifier (com.paradocs.classifier-daily, 4 AM cron) ────────────
# Parses the newest per-run log (outputs/classifier-cron-YYYYMMDD-0400.log),
# which tees the same GRAND TOTAL block as launchd-classifier.log. Reports
# the last run's matched/junction/cost + health, and a current-backlog proxy
# (approved reports updated since that run = newly-approved + not yet tagged).
CF="$(ls -t outputs/classifier-cron-*.log 2>/dev/null | head -1)"
CL_STATE="no runs found"; CL_AGE="n/a"; CL_MATCHED="?"; CL_JUNC="?"; CL_COST="?"; CL_EXIT=""; CL_ERR=0; CL_RUNISO=""
if [ -n "$CF" ] && [ -f "$CF" ]; then
  cmt=$(stat -c %Y "$CF" 2>/dev/null || echo 0); [[ "$cmt" =~ ^[0-9]+$ ]] || cmt=0
  CL_AGE="$(( ($(date +%s) - cmt)/60 ))m ago"
  CL_RUNISO=$(date -u -r "$cmt" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$cmt" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
  if grep -q "Classifier exited with code" "$CF"; then
    CL_EXIT=$(grep "Classifier exited with code" "$CF" | tail -1 | grep -oE 'code [0-9]+' | grep -oE '[0-9]+')
    CL_STATE=$([ "${CL_EXIT:-1}" = "0" ] && echo "OK (exit 0)" || echo "FAILED (exit $CL_EXIT)")
  else
    CL_STATE="IN PROGRESS"
  fi
  # GRAND TOTAL values are the LAST occurrence of each label in the log.
  CL_MATCHED=$(grep -E 'Reports matched:' "$CF" | tail -1 | grep -oE '[0-9]+' | head -1)
  CL_JUNC=$(grep -E 'Junction rows written:' "$CF" | tail -1 | grep -oE '[0-9]+' | head -1)
  CL_COST=$(grep -E 'Total cost:' "$CF" | tail -1 | grep -oE '[0-9.]+' | head -1)
  CL_ERR=$(grep -cE 'errored=[1-9]' "$CF" 2>/dev/null); CL_ERR=$(echo "$CL_ERR" | tr -d '\n '); [ -n "$CL_ERR" ] || CL_ERR=0
fi
# Current backlog proxy: approved reports touched since the last classifier run.
CL_BACKLOG="?"
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "$CL_RUNISO" ]; then
  CL_BACKLOG=$(node -e '
    const {createClient}=require("@supabase/supabase-js");
    const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    sb.from("reports").select("id",{count:"exact",head:true}).eq("status","approved").gte("updated_at",process.argv[1])
      .then(r=>console.log(r.count==null?"?":r.count)).catch(()=>console.log("?"));
  ' "$CL_RUNISO" 2>/dev/null || echo "?")
fi

# ── render ───────────────────────────────────────────────────────────
cat <<EOF
CA INGEST — morning digest  ($(date '+%a %b %d %H:%M %Z'))
────────────────────────────────────────────────────────
Daemon:     $HEALTH  | newest log $LOGAGE
Corpus:     ${TOTAL} CA rows $(delta "$TOTAL" "$PREV_TOTAL") since last digest
            pending_review ${PENDING} $(delta "$PENDING" "$PREV_PENDING")  |  approved ${APPROVED} $(delta "$APPROVED" "$PREV_APPROVED")
Since last: ${WAVEN} extract waves | submit/wave avg ${SAVG} (range ${SMIN}-${SMAX}) | spend \$${PERWCOST}${PROGNOTE}
Cost-to-date: \$${ALLCOST} of \$${BUDGET} budget (${PCT}%)
LoC health: ${H429} HTTP 429 | ${H5XX} 5xx/backoff | OCR err ${OCRRATE}
─ Classifier (com.paradocs.classifier-daily, 4 AM) ─
Last run:   ${CL_STATE}, ${CL_AGE}
Tagged:     ${CL_MATCHED} reports matched | ${CL_JUNC} junction links | \$${CL_COST} | batch-errored=${CL_ERR}
Backlog:    ${CL_BACKLOG} approved awaiting classification (updated since last run)
EOF
[ "$H429" -gt 0 ] 2>/dev/null && echo "⚠ ATTENTION: $H429 HTTP 429s — loc.gov throttling; consider pausing/lowering rate."
[ "${TOTAL:-?}" = "?" ] && echo "⚠ DB unreachable this run — counts shown as ?; daemon/log metrics are still accurate."
[ -n "$CL_EXIT" ] && [ "$CL_EXIT" != "0" ] && echo "⚠ ATTENTION: classifier last run FAILED (exit $CL_EXIT) — check outputs/launchd-classifier.err"
[ "${CL_ERR:-0}" -gt 0 ] 2>/dev/null && echo "⚠ classifier had $CL_ERR batch(es) with errored>0 — some reports may be untagged."

# ── persist state for next digest's deltas ───────────────────────────
node -e '
  const fs=require("fs");
  const s={lastRunISO:new Date().toISOString(),
    lastTotal: process.argv[1]==="?"?null:+process.argv[1],
    lastPending: process.argv[2]==="?"?null:+process.argv[2],
    lastApproved: process.argv[3]==="?"?null:+process.argv[3],
    lastWaveTotal: +process.argv[4]};
  try{fs.writeFileSync("outputs/ca-digest-state.json",JSON.stringify(s,null,2));}catch{}
' "$TOTAL" "$PENDING" "$APPROVED" "$TOTWAVES" 2>/dev/null || true

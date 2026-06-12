#!/usr/bin/env bash
# PD corpus full run — June 11, 2026. Run from repo root ON YOUR MACHINE (no sandbox limits):
#   bash scripts/pd-run-all.sh            # everything below
#   bash scripts/pd-run-all.sh barrett    # single source (e.g. after dropping outputs/pd-barrett-v1.txt)
#
# Per source: ingest (pending_review) -> modernize -> bulk-approve (flag-and-hold QC).
# Then ONE batch-worker pass (report-page narratives) + classifier enrichment for both categories.
#
# Budget guide (SPR actuals ~$0.014/case all-in): numbered sources ~929 cases ≈ $13;
# chapter sources add Haiku segmentation (~$5) and yield est. 520-790 accounts ≈ $15-25.
# Everything lands in pending_review first; bulk-approve holds QC flags for founder review.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

NUMBERED=(flammarion-unknown myers-human-personality flammarion-death-mystery spr-census)
CHAPTER=(crowe-night-side owen-footfalls stead-real-ghost-stories lang-dreams-ghosts flammarion-haunted-houses spr-jspr-pilot)
# barrett joins NUMBERED once outputs/pd-barrett-v1.txt exists and its regex is verified.

SOURCES=("$@")
if [ ${#SOURCES[@]} -eq 0 ]; then SOURCES=("${NUMBERED[@]}" "${CHAPTER[@]}"); fi

for K in "${SOURCES[@]}"; do
  echo "════════ $K ════════"
  npx tsx scripts/pd-text-ingest.ts --source "$K" --keep-borderline --skip-prefilter --concurrency 6 --max-cost 15
  npx tsx scripts/pd-modernize.ts   --source "$K" --concurrency 6 --max-cost 15
  npx tsx scripts/pd-bulk-approve.ts --source "$K" --approve-dateless
done

echo "════════ report-page narratives (all newly approved) ════════"
npx tsx scripts/batch-ingest-worker.ts --status approved --limit 20000 --max-wait 5400

echo "════════ phenomena classification ════════"
npx tsx scripts/classify-phenomena-batch.ts --category psychic_phenomena --cross-category-enrichment
npx tsx scripts/classify-phenomena-batch.ts --category ghosts_hauntings --cross-category-enrichment
npx tsx scripts/classify-phenomena-batch.ts --category consciousness_practices --cross-category-enrichment

echo "DONE. Review held rows: admin queue filter metadata->>qc_flag is not null."
echo "Post-run reminders (SPR lessons): batch worker re-titles/re-slugs (aliases for shared URLs);"
echo "anomaly gate may auto-archive a few rows AFTER generating narratives — re-approve keepers."

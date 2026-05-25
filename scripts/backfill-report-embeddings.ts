#!/usr/bin/env tsx
/**
 * Backfill report embeddings (V11.17.35 PR-5-c)
 *
 * Generates OpenAI text-embedding-3-small vectors for all approved
 * reports lacking entries in vector_chunks. Embeddings power the
 * semantic-similarity match dimension added in PR-5-c to match.ts.
 *
 * Cost estimate: 136k reports × ~500 tokens × $0.02/1M tokens ≈ $1.36
 * Wall time: ~5-15 hours depending on rate limits + chunk count per
 * report. Existing embedAllReports() pauses every 10 reports to stay
 * under OpenAI rate limits.
 *
 * Idempotent: embedReport() skips reports whose content_hash matches
 * the last_embedded entry in embedding_sync (no re-embed if text
 * unchanged). Safe to re-run.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-report-embeddings.ts                # all unembedded
 *   tsx scripts/backfill-report-embeddings.ts --limit 100    # smoke (100 reports)
 *   tsx scripts/backfill-report-embeddings.ts --force        # re-embed everything
 *   tsx scripts/backfill-report-embeddings.ts --batch 500    # process N per batch (default 1000)
 */
import 'dotenv/config'
import { embedAllReports, getEmbeddingStats } from '../src/lib/services/embedding.service'

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    limit: parseInt(flag('--limit', '0') || '0'),  // 0 = no overall cap
    batch: parseInt(flag('--batch', '1000') || '1000'),  // per-iteration chunk
    force: bool('--force'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Report embedding backfill V11.17.35 PR-5-c')
  console.log('Args:', JSON.stringify(args))

  const startStats = await getEmbeddingStats()
  console.log('\n=== Starting state ===')
  console.log('  report chunks:    ' + startStats.report_chunks)
  console.log('  synced reports:   ' + startStats.synced_reports)
  console.log('  phenomenon chunks: ' + startStats.phenomenon_chunks)

  const startMs = Date.now()
  let totalEmbedded = 0
  let totalSkipped = 0
  let totalErrors = 0
  let offset = 0

  // Process in batches so we can checkpoint cost + show progress
  while (true) {
    const batchLimit = args.limit > 0 ? Math.min(args.batch, args.limit - totalEmbedded - totalSkipped) : args.batch
    if (batchLimit <= 0) {
      console.log('\n--limit reached; stopping.')
      break
    }
    console.log('\n[+' + Math.floor((Date.now() - startMs) / 60000) + 'm] Processing batch (offset=' + offset + ', limit=' + batchLimit + ')...')
    const result = await embedAllReports({ force: args.force, limit: batchLimit, offset: offset })

    totalEmbedded += result.embedded
    totalSkipped += result.skipped
    totalErrors += result.errors.length

    console.log('  batch: total=' + result.total + ' embedded=' + result.embedded + ' skipped=' + result.skipped + ' errors=' + result.errors.length)
    if (result.errors.length > 0) {
      console.log('  first errors:')
      for (const e of result.errors.slice(0, 3)) console.log('    ' + e.substring(0, 120))
    }

    if (result.total === 0 || result.total < batchLimit) {
      console.log('\n=== Backfill complete (corpus exhausted) ===')
      break
    }
    offset += result.total

    // Optional: stop early if overall limit hit
    if (args.limit > 0 && totalEmbedded + totalSkipped >= args.limit) {
      console.log('\n--limit reached; stopping.')
      break
    }
  }

  const endStats = await getEmbeddingStats()
  const elapsedMin = Math.floor((Date.now() - startMs) / 60000)
  const elapsedSec = Math.floor(((Date.now() - startMs) % 60000) / 1000)

  console.log('\n========== FINAL ==========')
  console.log('Elapsed:           ' + elapsedMin + 'm ' + elapsedSec + 's')
  console.log('Total embedded:    ' + totalEmbedded)
  console.log('Total skipped:     ' + totalSkipped + ' (content unchanged, already embedded)')
  console.log('Total errors:      ' + totalErrors)
  console.log('Report chunks now: ' + endStats.report_chunks + ' (was ' + startStats.report_chunks + ', +' + (endStats.report_chunks - startStats.report_chunks) + ')')
  console.log('Synced reports:    ' + endStats.synced_reports + ' (was ' + startStats.synced_reports + ', +' + (endStats.synced_reports - startStats.synced_reports) + ')')

  // Cost estimate: text-embedding-3-small is $0.02 per 1M tokens.
  // Rough estimate: each chunk ≈ 400-600 tokens.
  const estTokens = totalEmbedded * 500
  const estCost = (estTokens / 1_000_000) * 0.02
  console.log('Estimated cost:    $' + estCost.toFixed(2) + ' (~' + estTokens.toLocaleString() + ' tokens at $0.02/1M)')
}
main().catch(e => { console.error('Fatal: ' + (e?.stack || e?.message || e)); process.exit(1) })

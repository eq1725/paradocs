/**
 * ai-cost-logger.ts — V11.17.84 unified cost tracking
 *
 * Single helper every Haiku/Sonnet callsite uses to write to
 * `paradocs_narrative_cost_log`. Replaces the per-service ad-hoc
 * cost-logging scattered through the codebase (and the many paths
 * that previously logged nothing at all).
 *
 * Cost reconciliation context: founder-side Anthropic invoices showed
 * ~$900 spent June 1–5; the cost_log table only accounted for ~$310,
 * all from the consolidated-batch model marker. The missing $590 came
 * from paths that called Haiku but never logged — primarily
 * tag-verification (~500k calls during the 99k-report drain) and the
 * classify-phenomena-batch run, plus the smaller per-service helpers.
 *
 * Design rules:
 *   1. Defensive — logging must NEVER throw or block the underlying
 *      AI call. All errors are swallowed with a warn.
 *   2. Self-pricing — caller passes raw token counts; the helper
 *      computes USD using the per-model rate table. Cost stays
 *      consistent across all callers.
 *   3. Sync API — async, but no caller should `await` it inside a
 *      latency-sensitive path. Fire-and-forget is fine.
 *   4. No new client — accepts the supabase client the caller already
 *      has so we never spin up a second connection just to log.
 *
 * Usage:
 *
 *   import { logAiUsage, computeHaikuCost } from '@/lib/services/ai-cost-logger'
 *
 *   const usage = resp.usage  // from Anthropic SDK or fetch response
 *   await logAiUsage('tag-verify', supabase, {
 *     model: 'claude-haiku-4-5-20251001',
 *     inputTokens: usage.input_tokens,
 *     outputTokens: usage.output_tokens,
 *     cacheCreationTokens: usage.cache_creation_input_tokens,
 *     cacheReadTokens: usage.cache_read_input_tokens,
 *     reportId: report.id,
 *     userId: null,
 *     requestId: resp.id,
 *     status: 'completed',
 *   })
 */

// ─── Service codes (canonical) ─────────────────────────────────────────
// Keep these stable — the cost-summary endpoint groups by this column.
export type AiServiceCode =
  | 'consolidated-narrative'       // src/lib/services/consolidated-ai.service.ts (web inline path)
  | 'consolidated-batch'           // scripts/batch-ingest-worker.ts
  | 'classifier-primary'           // scripts/classify-phenomena-batch.ts main batch call
  | 'classifier-verify'            // verifyTag call from inside classify-phenomena-batch
  | 'tag-verify'                   // src/lib/services/tag-verification.service.ts (engine.ts gate)
  | 'tag-verify-audit'             // scripts/audit-*-tags.ts
  | 'location-extract'             // src/lib/services/location-extraction.service.ts
  | 'cluster-finding'              // src/lib/services/cluster-finding.service.ts
  | 'synthesized-paragraph'        // src/pages/api/lab/synthesized-paragraph.ts
  | 'ai-title'                     // src/lib/services/ai-title.service.ts
  | 'report-insights'              // src/lib/services/report-insights.service.ts
  | 'ai-insights'                  // src/lib/services/ai-insights.service.ts
  | 'phenomena-service'            // src/lib/services/phenomena.service.ts
  | 'onboarding-title'             // src/lib/services/onboarding-title.service.ts
  | 'text-moderation'              // src/lib/services/text-moderation*.service.ts
  | 'paradocs-analysis'            // src/lib/services/paradocs-analysis.service.ts
  | 'video-transcribe'             // src/lib/services/video-transcribe.service.ts
  | 'rewrite-pipeline'             // src/lib/ai/rewrite-pipeline.ts
  | 'ai-tagger'                    // src/lib/media/ai-tagger.ts
  | 'auto-tag-artifact'            // src/pages/api/constellation/artifacts/auto-tag.ts
  | 'research-hub-insights'        // src/lib/services/research-hub-insights.service.ts
  | 'repair-dates'                 // src/pages/api/admin/ai/repair-dates.ts
  | 'fix-titles'                   // src/pages/api/admin/fix-titles.ts
  | 'generate-hooks'               // src/pages/api/admin/generate-hooks.ts

export type AiCallStatus =
  | 'completed'
  | 'failed'
  | 'parse_failed'
  | 'skipped'
  | 'skipped_cap'
  | 'rate_limited'

export interface LogAiUsageArgs {
  /** The Anthropic model id (e.g. claude-haiku-4-5-20251001). */
  model: string
  /** Token counts straight off the response.usage object. */
  inputTokens?: number | null
  outputTokens?: number | null
  cacheCreationTokens?: number | null
  cacheReadTokens?: number | null
  /** Status of the call. Use 'completed' for ordinary successes. */
  status?: AiCallStatus
  /** Optional report attribution. */
  reportId?: string | null
  /** Optional user attribution (Pro Dossier, lab calls). */
  userId?: string | null
  /** Optional reason string for non-completed statuses. */
  reason?: string | null
  /** Optional Anthropic request id (resp.id) for debugging. */
  requestId?: string | null
  /**
   * Optional pre-computed cost. When omitted, the helper computes
   * cost from the token counts + model. Pass this when the caller
   * already does its own pricing (e.g. batch-cost helpers).
   */
  costUsd?: number | null
}

// ─── Pricing table ─────────────────────────────────────────────────────
// USD per 1M tokens. Batch API rates are 50% of the live rates.
// Update when Anthropic ships new pricing.

interface ModelRate {
  inputPerM: number
  outputPerM: number
  // Cache writes are 1.25× input; cache reads are 0.10× input. Same
  // multipliers across all current models.
}

var MODEL_RATES: Record<string, ModelRate> = {
  // Haiku 4.5 (live)
  'claude-haiku-4-5-20251001':   { inputPerM: 1.00, outputPerM: 5.00 },
  // Haiku 4.5 (batch — 50% discount)
  'claude-haiku-4-5-20251001-batch': { inputPerM: 0.50, outputPerM: 2.50 },
  // Older Haiku marker the consolidated path still emits
  'claude-3-5-haiku-latest':     { inputPerM: 0.80, outputPerM: 4.00 },
  'claude-3-5-haiku-20241022':   { inputPerM: 0.80, outputPerM: 4.00 },
  // Sonnet 4.5 (live)
  'claude-sonnet-4-5-20250929':  { inputPerM: 3.00, outputPerM: 15.00 },
  // Sonnet 4
  'claude-sonnet-4-20250514':    { inputPerM: 3.00, outputPerM: 15.00 },
}

// Strip optional " (consolidated)" / " (consolidated-batch)" suffixes
// the legacy paths attach to the model column.
function normalizeModel(model: string): string {
  return model.replace(/\s*\(.*?\)\s*$/, '').trim()
}

function getModelRate(model: string, isBatch: boolean): ModelRate {
  var clean = normalizeModel(model)
  if (isBatch) {
    var batchRate = MODEL_RATES[clean + '-batch']
    if (batchRate) return batchRate
    // Fallback: derive batch rate as 50% of live.
    var live = MODEL_RATES[clean]
    if (live) return { inputPerM: live.inputPerM * 0.5, outputPerM: live.outputPerM * 0.5 }
  } else {
    var direct = MODEL_RATES[clean]
    if (direct) return direct
  }
  // Unknown model — return zeros. Caller-supplied costUsd will still
  // be respected; the helper just won't synthesize a price.
  return { inputPerM: 0, outputPerM: 0 }
}

/**
 * Compute USD cost from raw token counts. Exported so callers that
 * need the number before logging (e.g. for in-memory accounting in
 * batch scripts) can stay consistent with the logger.
 */
export function computeHaikuCost(args: {
  model: string
  inputTokens?: number | null
  outputTokens?: number | null
  cacheCreationTokens?: number | null
  cacheReadTokens?: number | null
  isBatch?: boolean
}): number {
  var rate = getModelRate(args.model, !!args.isBatch)
  var inT = args.inputTokens || 0
  var outT = args.outputTokens || 0
  var cacheW = args.cacheCreationTokens || 0
  var cacheR = args.cacheReadTokens || 0
  return (
    (inT / 1_000_000) * rate.inputPerM +
    (cacheW / 1_000_000) * rate.inputPerM * 1.25 +
    (cacheR / 1_000_000) * rate.inputPerM * 0.10 +
    (outT / 1_000_000) * rate.outputPerM
  )
}

/**
 * Insert a single row into `paradocs_narrative_cost_log`. Defensive:
 * never throws, never blocks the AI call. Logs a console.warn on
 * failure so silent drops still surface in the function logs.
 */
export async function logAiUsage(
  service: AiServiceCode,
  supabase: any,
  args: LogAiUsageArgs,
): Promise<void> {
  try {
    var inferredBatch =
      (args.model || '').toLowerCase().indexOf('batch') !== -1 ||
      service === 'consolidated-batch' ||
      service === 'classifier-primary'
    var cost =
      typeof args.costUsd === 'number' && !isNaN(args.costUsd)
        ? args.costUsd
        : computeHaikuCost({
            model: args.model,
            inputTokens: args.inputTokens,
            outputTokens: args.outputTokens,
            cacheCreationTokens: args.cacheCreationTokens,
            cacheReadTokens: args.cacheReadTokens,
            isBatch: inferredBatch,
          })

    // Wrap the insert in its own try so a transient DB error never
    // bubbles up to the caller's AI path. The cost log is operational
    // telemetry; the underlying AI call has already happened.
    var row = {
      service: service,
      model: normalizeModel(args.model || 'unknown'),
      input_tokens: args.inputTokens ?? null,
      output_tokens: args.outputTokens ?? null,
      cache_creation_tokens: args.cacheCreationTokens ?? null,
      cache_read_tokens: args.cacheReadTokens ?? null,
      cost_usd: cost,
      status: args.status || 'completed',
      reason: args.reason ?? null,
      report_id: args.reportId ?? null,
      user_id: args.userId ?? null,
      request_id: args.requestId ?? null,
    }
    var res = await supabase.from('paradocs_narrative_cost_log').insert(row)
    if (res && res.error) {
      // eslint-disable-next-line no-console
      console.warn('[ai-cost-logger] insert error (' + service + '): ' + res.error.message)
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[ai-cost-logger] swallowed error (' + service + '): ' + (e?.message || e))
  }
}

/**
 * Lazy supabase admin getter for callers that don't already hold a
 * client (e.g. inside library services called from API handlers).
 * Returns null when env is missing so the logger silently no-ops.
 *
 * We deliberately don't import createServerClient at module top so
 * this file stays importable from scripts that never speak to
 * Supabase (e.g. dry-run cost estimators).
 */
export async function getCostLogClient(): Promise<any | null> {
  try {
    var url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    var sb = await import('@supabase/supabase-js')
    return sb.createClient(url, key)
  } catch (_e) {
    return null
  }
}

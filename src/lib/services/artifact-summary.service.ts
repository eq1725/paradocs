/**
 * artifact-summary.service — V10.4 (delegates to rewrite-pipeline)
 *
 * Generates a clean 2-3 sentence summary for external URL saves
 * (BFRO sightings, Reddit threads, YouTube clips, etc.).
 *
 * V10.4: refactored to delegate to src/lib/ai/rewrite-pipeline.ts
 * — the single source of truth for AI rewrites. Public API
 * preserved so the artifact create endpoint and any other caller
 * keeps working without changes.
 *
 * Failure mode: fails OPEN. Returns null on error / insufficient
 * source / claim-check fail. Caller falls back to whatever raw
 * meta description exists.
 */

import { rewriteWithGuardrails } from '@/lib/ai/rewrite-pipeline'

export interface ArtifactSummaryResult {
  summary: string | null
  /** Outcome flag for telemetry. */
  source: 'ai' | 'fallback' | 'disabled' | 'error'
  /** ms — for monitoring. */
  durationMs: number
  /** Whether the input had enough material to call the model at all. */
  hadInput: boolean
}

const MAX_SUMMARY_CHARS = 320

interface SummarizeInput {
  url: string
  title: string
  /** Raw meta description (OG / Twitter card / first <p>) — often poor. */
  metaDescription?: string | null
  /** Best-effort page content if we have it (first ~2KB of stripped HTML). */
  pageText?: string | null
  /** Source platform if known (youtube, reddit, bfro, etc.) — informs tone. */
  sourcePlatform?: string | null
  /** Optional artifact id for audit log traceability. */
  artifactId?: string | null
}

export async function summarizeArtifact(input: SummarizeInput): Promise<ArtifactSummaryResult> {
  const hadInput = !!(input.title && input.title.trim().length > 0)
  if (!hadInput) {
    return { summary: null, source: 'fallback', durationMs: 0, hadInput: false }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { summary: null, source: 'disabled', durationMs: 0, hadInput }
  }

  // Build the source-material packet the pipeline will paraphrase.
  // Notably: do NOT include the URL itself in the source text —
  // we don't want the model paraphrasing the URL.
  const sourceParts: string[] = []
  sourceParts.push('Title: ' + input.title.trim())
  if (input.metaDescription && input.metaDescription.trim()) {
    sourceParts.push('Page description: ' + input.metaDescription.trim().slice(0, 800))
  }
  if (input.pageText && input.pageText.trim()) {
    sourceParts.push('Page content snippet: ' + input.pageText.trim().slice(0, 2000))
  }
  if (input.sourcePlatform && input.sourcePlatform !== 'other' && input.sourcePlatform !== 'web') {
    sourceParts.push('Source platform: ' + input.sourcePlatform)
  }
  const sourceText = sourceParts.join('\n')

  const result = await rewriteWithGuardrails({
    mode: 'faithful_paraphrase',
    sourceText,
    task: 'Write a faithful 2-3 sentence paraphrase of what this source describes. The output will appear as a "Source summary" on the saved-link card in the user\'s research lab.',
    maxChars: MAX_SUMMARY_CHARS,
    anonymize: true,
    outputField: 'artifacts.metadata_json.ai_summary',
    artifactId: input.artifactId,
    maxTokens: 220,
  })

  // Map the unified result back to the legacy shape for backward compat.
  let outcome: ArtifactSummaryResult['source']
  switch (result.reason) {
    case 'ok':                  outcome = 'ai'; break
    case 'insufficient':        outcome = 'fallback'; break
    case 'claim_check_failed':  outcome = 'fallback'; break
    case 'no_source':           outcome = 'fallback'; break
    case 'disabled':            outcome = 'disabled'; break
    case 'error':               outcome = 'error'; break
    default:                    outcome = 'error'
  }

  return {
    summary: result.output,
    source: outcome,
    durationMs: result.durationMs,
    hadInput,
  }
}

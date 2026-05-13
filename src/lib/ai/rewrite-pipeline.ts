/**
 * rewrite-pipeline — V10.4 Phase 1
 *
 * Single source of truth for every AI-rewrite call in Paradocs.
 * Before V10.4 there were 3+ separate services (feed-hook,
 * paradocs-analysis, artifact-summary) each constructing their
 * own prompts and handling their own errors. That created
 * drift: artifact-summary had hardened anti-fabrication rules
 * (V10.3.1) while the other two services were still on looser
 * rules. With mass ingestion looming, that drift is a credibility
 * bomb.
 *
 * This library consolidates the rewrite path into one function:
 *
 *     await rewriteWithGuardrails({
 *       mode: 'faithful_paraphrase',
 *       sourceText: '…',
 *       task: 'Write a one-sentence paraphrase of what this source describes.',
 *       maxChars: 240,
 *       anonymize: true,
 *       outputField: 'reports.answer_line',
 *       reportId: 'uuid',
 *     })
 *
 * Three modes:
 *
 *   faithful_paraphrase
 *     Hedge voice + INSUFFICIENT sentinel + no-general-knowledge
 *     rule + anonymization rule. After generation, runs a second
 *     Haiku claim-citation pass to verify every claim in the
 *     output is supported by the source. Audit-logs the call.
 *     Returns null if claim-check fails (caller decides what
 *     fallback to use).
 *
 *   editorial
 *     For prose that's commentary on the user's OWN data (Your
 *     Signal cards, pattern insights, constellation deep scans).
 *     No claim-check (source is the user's behavior, not a
 *     primary doc to paraphrase faithfully). Still gets the
 *     anti-fabrication preamble + anonymization + audit log.
 *
 *   structural
 *     For moderation / tagging / date extraction / title
 *     element extraction. Minimal guardrails — the output is
 *     consumed by code, not displayed as prose. Audit log
 *     records the call for traceability but no claim-check.
 *
 * Anonymization rule (faithful_paraphrase + editorial):
 *   - NEVER include the submitter's name, exact street address,
 *     full date (down to day), or exact time.
 *   - Witnesses roll up to counts ('a hiker', 'two witnesses').
 *   - Locations resolve to city / region / state precision only.
 *   - Times resolve to part-of-day when source has minute precision.
 *   - Exception: when `anonymize=false` is explicitly passed (used
 *     only for direct submissions with anonymous_submission=false).
 *
 * The audit log table is `ai_rewrite_audit`; see migration
 * 20260513_ai_rewrite_audit_v10_4.sql.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// ── Constants ───────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Bump this when you change ANY prompt in this library, OR when
 * a caller changes the source-packet shape it passes in. The
 * audit table indexes by prompt_version so we can spot
 * regressions when a prompt change increases the claim-check
 * fail rate, and so admins can verify after a deploy that fresh
 * audit rows are coming from the new pipeline.
 *
 * v10.4.0 — initial pipeline
 * v10.6.16 — source-packet hardening cycle:
 *   - V10.6.14 dropped location columns from caller source packets
 *   - V10.6.15 dropped date + evidence columns
 *   - V10.6.16 dropped category + bumped narrative truncation 2.5K→5K
 * v10.6.18 — bumped narrative truncation 5K→8K to handle
 *   long-preamble NDERF reports where the actual experience
 *   description came AFTER the 5K window. Pass rate 90% → target ~95%.
 */
export const PROMPT_VERSION = 'v10.6.18'

// ── Types ───────────────────────────────────────────────────

export type RewriteMode = 'faithful_paraphrase' | 'editorial' | 'structural'

export interface RewriteInput {
  mode: RewriteMode

  /** The source material being paraphrased / analyzed. Required for faithful_paraphrase. */
  sourceText?: string | null

  /**
   * Short instruction describing WHAT to write. Examples:
   *   'Write a 2-3 sentence faithful paraphrase'
   *   'Write one short sentence answering: what does this source describe?'
   *   'Summarize the user\'s pattern across these saves'
   */
  task: string

  /** Hard cap on output length. Truncated at sentence boundary if model overshoots. */
  maxChars?: number

  /** Default true. Pass false only for direct submissions with anonymous_submission=false. */
  anonymize?: boolean

  /** Optional extra rules / context to inject into the prompt (after the standard preamble). */
  extraInstructions?: string

  /** Which DB column/field this output is destined for. Stored in the audit log. */
  outputField: string

  /** Persistence linkage — at least one should be set for audit traceability. */
  reportId?: string | null
  artifactId?: string | null

  /** Override the model. Defaults to Haiku. */
  model?: string

  /** Override temperature. Default 0.3 (low — we want faithful, not creative). */
  temperature?: number

  /** Override max output tokens. */
  maxTokens?: number
}

export interface RewriteResult {
  /** The generated text, or null if INSUFFICIENT / claim-check failed / error. */
  output: string | null

  /** Why output is null (when it is). */
  reason: 'ok' | 'insufficient' | 'claim_check_failed' | 'error' | 'disabled' | 'no_source'

  /** Free-text notes from the claim-check pass (when applicable). */
  claimCheckNotes?: string

  /** UUID of the row written to ai_rewrite_audit, if persistence succeeded. */
  auditId: string | null

  /** Total ms spent in this call (including both generation and claim-check). */
  durationMs: number

  /** Whether the model triggered the INSUFFICIENT sentinel. */
  insufficient: boolean
}

// ── Prompt construction ─────────────────────────────────────

const ANTI_FABRICATION_PREAMBLE = [
  'CRITICAL ANTI-FABRICATION RULES (read carefully — these override every other instruction):',
  '- Every factual claim in your output MUST be directly supported by the source material provided. Nothing else.',
  '- If the source is too thin to complete the task without making things up, return EXACTLY this single word and nothing else: INSUFFICIENT',
  '- Do NOT invent dates, locations, witnesses, behaviors, outcomes, or contextual details that are not in the source.',
  '- Do NOT use your general knowledge to fill in what a typical case of this type looks like. We do NOT want a generic template; we want a faithful summary of THIS specific source.',
  '- Do NOT name people, places, or events that are not explicitly in the source.',
  '- If the source mentions a general location ("Pennsylvania"), do not narrow it ("near Pittsburgh"). If it mentions a year, do not invent a month. If it mentions an animal, do not invent a description.',
  '- When the source is sparse, write a more GENERAL but accurate summary — never compensate with invented specificity.',
].join('\n')

const ANONYMIZATION_RULES = [
  'ANONYMIZATION RULES (apply even if the source contains identifying details):',
  '- NEVER include the submitter\'s real name. Witnesses roll up to counts ("a hiker", "two witnesses", "a family").',
  '- NEVER include exact street addresses or building names. Locations resolve to city / region / state precision only.',
  '- NEVER include full dates. Use month + year, or just year, depending on what the source actually committed to.',
  '- NEVER include exact times. Use part-of-day ("late evening", "early morning") when the source has minute precision.',
  '- NEVER include phone numbers, email addresses, or other contact info.',
].join('\n')

const VOICE_RULES = [
  'VOICE RULES (apply only after the anti-fabrication and anonymization rules are satisfied):',
  '- Hedge framing: refer to THE SOURCE, not the events as facts. Use phrases like "the source documents", "the page describes", "the report records", "according to the entry", "the writeup notes".',
  '- Past tense for sightings or events ("the source describes a sighting witnesses reported in 1998").',
  '- Documentary tone. No hype, no editorializing, no exclamation marks, no emoji.',
  '- Do NOT start with "This is" or "This article" or similar self-referential framing.',
  '- Return only the requested text — no preamble, no quotes, no markdown, no labels.',
].join('\n')

function buildFaithfulParaphrasePrompt(input: RewriteInput): string {
  const anonymize = input.anonymize !== false
  const parts: string[] = []

  parts.push(ANTI_FABRICATION_PREAMBLE)
  parts.push('')
  if (anonymize) {
    parts.push(ANONYMIZATION_RULES)
    parts.push('')
  }
  parts.push(VOICE_RULES)
  parts.push('')

  if (input.maxChars) {
    parts.push(`LENGTH LIMIT: ${input.maxChars} characters maximum. If you exceed this, the output will be truncated.`)
    parts.push('')
  }

  if (input.extraInstructions) {
    parts.push('ADDITIONAL INSTRUCTIONS:')
    parts.push(input.extraInstructions)
    parts.push('')
  }

  parts.push('TASK:')
  parts.push(input.task)
  parts.push('')
  parts.push('SOURCE MATERIAL (this is everything you have — do not assume anything beyond it):')
  parts.push((input.sourceText || '').slice(0, 8000))
  parts.push('')
  parts.push('OUTPUT (or INSUFFICIENT if the source is too thin):')

  return parts.join('\n')
}

function buildEditorialPrompt(input: RewriteInput): string {
  const parts: string[] = []

  // Editorial mode is about commentary on user data, not
  // paraphrasing a primary source. Still apply the anti-
  // fabrication preamble (don't invent things about the user)
  // and the anonymization rules.
  parts.push('ANTI-FABRICATION RULES:')
  parts.push('- Every claim must be grounded in the data provided. Do not invent dates, locations, behaviors, or counts.')
  parts.push('- If the data is insufficient to write the requested analysis, return exactly: INSUFFICIENT')
  parts.push('- Do not pad with general knowledge about the phenomenon.')
  parts.push('')

  if (input.anonymize !== false) {
    parts.push(ANONYMIZATION_RULES)
    parts.push('')
  }

  parts.push('VOICE RULES:')
  parts.push('- Documentary tone. No hype, no exclamation marks, no emoji.')
  parts.push('- Speak about patterns and observations, not predictions or judgments.')
  parts.push('- Do NOT diagnose, advise, or moralize.')
  parts.push('')

  if (input.maxChars) {
    parts.push(`LENGTH LIMIT: ${input.maxChars} characters maximum.`)
    parts.push('')
  }
  if (input.extraInstructions) {
    parts.push('ADDITIONAL INSTRUCTIONS:')
    parts.push(input.extraInstructions)
    parts.push('')
  }

  parts.push('TASK:')
  parts.push(input.task)
  if (input.sourceText) {
    parts.push('')
    parts.push('DATA / CONTEXT:')
    parts.push(input.sourceText.slice(0, 8000))
  }
  parts.push('')
  parts.push('OUTPUT (or INSUFFICIENT):')

  return parts.join('\n')
}

function buildStructuralPrompt(input: RewriteInput): string {
  // Structural mode is for tagging / extraction / moderation —
  // outputs consumed by code, not displayed as prose. Just pass
  // the task and context through.
  const parts: string[] = []
  parts.push('TASK:')
  parts.push(input.task)
  if (input.sourceText) {
    parts.push('')
    parts.push('INPUT:')
    parts.push(input.sourceText.slice(0, 8000))
  }
  if (input.extraInstructions) {
    parts.push('')
    parts.push(input.extraInstructions)
  }
  return parts.join('\n')
}

// ── Claim-citation check (faithful_paraphrase mode) ─────────

interface ClaimCheckResult {
  passed: boolean
  notes: string | null
}

async function runClaimCheck(
  client: Anthropic,
  model: string,
  sourceText: string,
  output: string,
): Promise<ClaimCheckResult> {
  const prompt = [
    'You are a fact-checker. Below is a SOURCE and a SUMMARY claiming to paraphrase it.',
    'Your job: determine whether EVERY factual claim in the summary is directly supported by the source.',
    '',
    'CRITICAL: be strict. The following count as unsupported claims:',
    '- A specific date, location, count, or detail in the summary that does not appear in the source.',
    '- Narrowing a general claim (source says "Pennsylvania", summary says "Pittsburgh").',
    '- Adding context the source did not provide (source describes a sighting, summary describes the witness as "experienced").',
    '- General-knowledge filler about the phenomenon type.',
    '',
    'Acceptable transformations: paraphrasing in different words, summarizing multiple sentences into one, reordering, omitting details, hedging certainty ("the source describes" instead of asserting facts).',
    '',
    'Return a JSON object with exactly two keys:',
    '  "passed": boolean — true if every claim is supported, false if even one is not',
    '  "notes": string — if passed is false, list the unsupported claims (1-3 short bullets). Empty string if passed.',
    '',
    'Return ONLY the JSON. No preamble, no markdown fences.',
    '',
    'SOURCE:',
    sourceText.slice(0, 8000),
    '',
    'SUMMARY:',
    output,
    '',
    'JSON RESULT:',
  ].join('\n')

  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 300,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = resp.content[0]
    if (!content || content.type !== 'text') return { passed: false, notes: 'claim-check returned no text' }

    let raw = (content.text || '').trim()
    // Strip markdown fences if the model added them despite the instruction.
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

    const parsed = JSON.parse(raw)
    if (typeof parsed.passed !== 'boolean') {
      return { passed: false, notes: 'claim-check returned malformed JSON' }
    }
    return {
      passed: parsed.passed,
      notes: typeof parsed.notes === 'string' && parsed.notes.length > 0 ? parsed.notes : null,
    }
  } catch (err: any) {
    // If claim-check itself fails, fail OPEN — return passed=false so the
    // output gets pulled. Better to abstain than risk shipping a fabrication.
    return { passed: false, notes: 'claim-check error: ' + (err?.message || String(err)) }
  }
}

// ── Audit log writer ────────────────────────────────────────

interface AuditWriteParams {
  mode: RewriteMode
  promptVersion: string
  model: string
  outputField: string
  sourceText: string | null
  outputText: string | null
  claimCheckPassed: boolean | null
  claimCheckNotes: string | null
  insufficient: boolean
  status: 'passed' | 'pending' | 'bypassed'
  reportId?: string | null
  artifactId?: string | null
  durationMs: number
}

async function writeAuditLog(params: AuditWriteParams): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null
  }
  try {
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
    const { data, error } = await (svc.from('ai_rewrite_audit') as any)
      .insert({
        mode: params.mode,
        prompt_version: params.promptVersion,
        model: params.model,
        output_field: params.outputField,
        source_text: params.sourceText ? params.sourceText.slice(0, 8192) : null,
        output_text: params.outputText,
        claim_check_passed: params.claimCheckPassed,
        claim_check_notes: params.claimCheckNotes,
        insufficient: params.insufficient,
        status: params.status,
        report_id: params.reportId || null,
        artifact_id: params.artifactId || null,
        duration_ms: params.durationMs,
      })
      .select('id')
      .single()
    if (error) {
      console.error('[rewrite-pipeline] audit write failed:', error)
      return null
    }
    return data?.id || null
  } catch (err) {
    console.error('[rewrite-pipeline] audit write threw:', err)
    return null
  }
}

// ── Output post-processing ──────────────────────────────────

function stripWrapping(text: string): string {
  let t = text.trim()
  if ((t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith('“') && t.endsWith('”')) ||
      (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }
  const preambles = [
    /^output:\s*/i,
    /^summary:\s*/i,
    /^answer:\s*/i,
    /^paraphrase:\s*/i,
    /^here(?:'s| is) (?:the |a |my )?(?:summary|paraphrase|output|answer)[:.]?\s*/i,
  ]
  for (const p of preambles) t = t.replace(p, '').trim()
  return t
}

function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const head = text.slice(0, maxLen)
  const lastPunct = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'))
  if (lastPunct > maxLen * 0.6) return head.slice(0, lastPunct + 1).trim()
  const lastSpace = head.lastIndexOf(' ')
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trim() + '…'
}

function detectInsufficient(text: string): boolean {
  return /^\s*insufficient\s*$/i.test(text) || text.toUpperCase().trim().startsWith('INSUFFICIENT')
}

// ── Main entry point ────────────────────────────────────────

export async function rewriteWithGuardrails(input: RewriteInput): Promise<RewriteResult> {
  const startedAt = Date.now()
  const model = input.model || DEFAULT_MODEL
  const temperature = input.temperature ?? 0.3
  const maxTokens = input.maxTokens ?? 400

  // Faithful paraphrase requires a source. No source → no rewrite.
  if (input.mode === 'faithful_paraphrase' && (!input.sourceText || !input.sourceText.trim())) {
    return { output: null, reason: 'no_source', auditId: null, durationMs: 0, insufficient: false }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { output: null, reason: 'disabled', auditId: null, durationMs: 0, insufficient: false }
  }

  const prompt =
    input.mode === 'faithful_paraphrase' ? buildFaithfulParaphrasePrompt(input) :
    input.mode === 'editorial'          ? buildEditorialPrompt(input) :
                                          buildStructuralPrompt(input)

  let outputText: string | null = null
  let insufficient = false
  let claimCheckPassed: boolean | null = null
  let claimCheckNotes: string | null = null
  let reason: RewriteResult['reason'] = 'ok'

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = resp.content[0]
    if (!content || content.type !== 'text') {
      reason = 'error'
    } else {
      let raw = (content.text || '').trim()

      if (detectInsufficient(raw)) {
        insufficient = true
        reason = 'insufficient'
      } else {
        raw = stripWrapping(raw)
        if (input.maxChars && raw.length > input.maxChars) {
          raw = truncateAtSentence(raw, input.maxChars)
        }
        outputText = raw
      }
    }
  } catch (err) {
    console.error('[rewrite-pipeline] generation failed:', err)
    reason = 'error'
  }

  // Claim-check pass — faithful_paraphrase mode only, and only
  // if we got an output to check.
  if (outputText && input.mode === 'faithful_paraphrase') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const check = await runClaimCheck(client, model, input.sourceText || '', outputText)
    claimCheckPassed = check.passed
    claimCheckNotes = check.notes
    if (!check.passed) {
      outputText = null
      reason = 'claim_check_failed'
    }
  }

  const durationMs = Date.now() - startedAt

  // Audit log — always write, even for failures (especially for failures).
  const status: 'passed' | 'pending' | 'bypassed' =
    input.mode === 'structural'             ? 'bypassed' :
    input.mode === 'editorial'              ? 'bypassed' :
    claimCheckPassed === false              ? 'pending' :
                                              'passed'

  const auditId = await writeAuditLog({
    mode: input.mode,
    promptVersion: PROMPT_VERSION,
    model,
    outputField: input.outputField,
    sourceText: input.sourceText || null,
    outputText,
    claimCheckPassed,
    claimCheckNotes,
    insufficient,
    status,
    reportId: input.reportId,
    artifactId: input.artifactId,
    durationMs,
  })

  return {
    output: outputText,
    reason,
    claimCheckNotes: claimCheckNotes || undefined,
    auditId,
    durationMs,
    insufficient,
  }
}

// ── Verify-and-audit helper for pre-generated text ──────────
//
// Paradocs-analysis generates 5 text fields in a single JSON
// API call (for efficiency at ingestion scale). It needs the
// same anti-fabrication safety net — claim-check + audit-log —
// without paying 5× the generation cost. This helper takes a
// pre-generated output string, runs it through the claim-check
// against the source text, and writes an audit row.
//
// Use this when you've already generated the text via your own
// path (because you needed a single multi-field call, or because
// you're working with an externally-generated string) but you
// still want it to go through the same guardrails the unified
// pipeline applies.

export interface VerifyInput {
  /** The text to verify against the source. */
  output: string
  /** The original source text. */
  sourceText: string
  /** Which DB field this output is destined for. */
  outputField: string
  /** Tag identifying the calling service / prompt version. */
  promptVersion: string
  /** Model that generated the output. */
  model?: string
  reportId?: string | null
  artifactId?: string | null
}

export interface VerifyResult {
  passed: boolean
  notes: string | null
  auditId: string | null
  durationMs: number
}

/**
 * Run the claim-citation check against a pre-generated text and
 * write the audit row. Returns whether the output passed.
 *
 * Failure modes are identical to the unified pipeline — if the
 * Anthropic key is missing the check fails OPEN (returns
 * passed=true) so we don't accidentally null out output during
 * an outage. But every audit row records what happened so the
 * admin queue can spot regressions.
 */
export async function verifyAndAuditRewrite(input: VerifyInput): Promise<VerifyResult> {
  const startedAt = Date.now()
  const model = input.model || DEFAULT_MODEL

  // If Anthropic is disabled, we can't claim-check. Audit-log
  // the call as bypassed and return passed=true (fail open).
  if (!process.env.ANTHROPIC_API_KEY) {
    const auditId = await writeAuditLog({
      mode: 'faithful_paraphrase',
      promptVersion: input.promptVersion,
      model,
      outputField: input.outputField,
      sourceText: input.sourceText,
      outputText: input.output,
      claimCheckPassed: null,
      claimCheckNotes: 'ANTHROPIC_API_KEY missing — claim-check skipped',
      insufficient: false,
      status: 'bypassed',
      reportId: input.reportId,
      artifactId: input.artifactId,
      durationMs: Date.now() - startedAt,
    })
    return { passed: true, notes: null, auditId, durationMs: Date.now() - startedAt }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const check = await runClaimCheck(client, model, input.sourceText, input.output)

  const auditId = await writeAuditLog({
    mode: 'faithful_paraphrase',
    promptVersion: input.promptVersion,
    model,
    outputField: input.outputField,
    sourceText: input.sourceText,
    outputText: input.output,
    claimCheckPassed: check.passed,
    claimCheckNotes: check.notes,
    insufficient: false,
    status: check.passed ? 'passed' : 'pending',
    reportId: input.reportId,
    artifactId: input.artifactId,
    durationMs: Date.now() - startedAt,
  })

  return {
    passed: check.passed,
    notes: check.notes,
    auditId,
    durationMs: Date.now() - startedAt,
  }
}

// ── Re-exports for convenience ──────────────────────────────

export { stripWrapping, truncateAtSentence, detectInsufficient }

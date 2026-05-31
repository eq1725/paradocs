/**
 * tag-verification.service.ts — V11.17.54
 *
 * Adaptive Haiku verification: is a report a credible match for a
 * given phenomenon? Used in two places:
 *
 *   1. Ingestion engine (src/lib/ingestion/engine.ts) — post-classifier
 *      gate. The regex classifier proposes tags based on keyword
 *      matching; this service verifies each proposed tag before the
 *      report_phenomena row gets persisted. Stops mistags at the
 *      source.
 *
 *   2. Audit scripts (scripts/audit-folkloric-tags.ts, scripts/audit-
 *      all-phen-tags.ts) — periodic sweep that untags false positives
 *      already in the DB.
 *
 * Adaptive prompt: uses the phen's ai_summary as the cultural / factual
 * context. For niche folkloric entries the summary contains origin
 * (Ewe people, etc.); for named events the summary names the event;
 * for generic types the summary describes the pattern. The prompt
 * asks Haiku to verify the report fits THIS specific phen, not just
 * something keyword-adjacent.
 *
 * Cost: ~$0.0005 per call. At ingestion ~5-10 proposed tags per
 * report = ~$0.003 per ingested report (~$3-5/day at 1k reports/day).
 *
 * Failure mode: returns 'uncertain' when Haiku fails or the response
 * is unparseable. Callers should treat 'uncertain' as PASS (keep the
 * tag) to avoid false-negative loss.
 */

import Anthropic from '@anthropic-ai/sdk'

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
var HAIKU_MODEL = 'claude-haiku-4-5-20251001'

export interface PhenContext {
  name: string
  slug: string
  category: string | null
  /** The phen's ai_summary — used as the verification ground truth.
   *  When null/empty, the prompt falls back to category-level guidance. */
  ai_summary?: string | null
}

export interface ReportContext {
  title: string | null
  summary: string | null
  description: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
}

export type MatchVerdict = 'yes' | 'no' | 'uncertain'

export interface VerificationResult {
  match: MatchVerdict
  reasoning: string
}

function buildPrompt(phen: PhenContext, report: ReportContext): string {
  var loc = [report.city, report.state_province, report.country].filter(Boolean).join(', ') || 'unspecified'
  var summary = (phen.ai_summary || '').trim()
  var contextLine = summary
    ? 'CANONICAL DESCRIPTION: ' + summary.slice(0, 500)
    : 'CANONICAL DESCRIPTION: (none — verify against the phenomenon name and category alone)'

  return [
    'PHENOMENON: ' + phen.name,
    'CATEGORY: ' + (phen.category || 'unknown'),
    contextLine,
    '',
    'REPORT:',
    '  title: ' + (report.title || '(none)'),
    '  location: ' + loc,
    '  summary: ' + (report.summary || '(none)').slice(0, 400),
    '  description (first 1500 chars): ' + (report.description || '(none)').slice(0, 1500),
    '',
    'TASK: Is this report a credible match for "' + phen.name + '" as defined above?',
    '',
    'A credible MATCH requires:',
    '  - The report describes characteristics consistent with the phenomenon\'s canonical description.',
    '  - For named entities (specific cryptids, specific events, specific cultural beings): the report explicitly mentions or describes that named entity, not just something keyword-adjacent.',
    '  - For region/culture-specific phenomena: the report\'s location or content has plausible connection to that region/culture.',
    '  - For pattern-based phenomena (sleep paralysis, time slip, EVP, etc.): the report describes the canonical pattern, not just any tangentially related experience.',
    '',
    'NOT a credible match:',
    '  - The keyword matched but the report is about something else entirely (the most common failure mode).',
    '  - Generic mention with no phenomenon-specific details.',
    '  - Fictional / pop-culture reference (movie, TV show, book, game, song lyric).',
    '  - Wrong region / culture for a region-specific entity.',
    '  - Could match many other phenomena equally well — too vague to attribute to this one specifically.',
    '',
    'Be CONSERVATIVE on "no" — when in doubt, answer "uncertain". A "no" verdict will UNTAG the report.',
    '',
    'OUTPUT: JSON only. {"match": "yes"|"no"|"uncertain", "reasoning": "<1 sentence>"}',
  ].join('\n')
}

/**
 * V11.17.55 — Mass-ingest helper: verify then upsert into report_phenomena.
 *
 * Wraps the verifyTag → conditional upsert sequence used by every
 * mass-ingest script (nuforc/adcrf/oberf/nderf/classify-batch/
 * reclassify-priority-categories). Centralizes the gate so all
 * write paths get the same protection as engine.ts.
 *
 * Returns { persisted: boolean; verdict; reason? } so callers can
 * count + log skipped tags.
 *
 * Skipping logic: only 'no' verdicts skip. 'yes' and 'uncertain'
 * both persist (uncertain is kept to avoid false negatives).
 *
 * Cost: one Haiku call per attempted tag (~$0.0005). At 5 tags/report
 * × 100k reports = ~$250 per bulk run. Worth the safety.
 */
export interface VerifyAndUpsertArgs {
  reportId: string
  phenomenonId: string
  confidence: number
  taggedBy?: string
  /** Phenomenon metadata used to build the verification prompt.
   *  Caller must supply — helper does not fetch from DB to avoid a
   *  round-trip per call. */
  phen: PhenContext
  /** Report metadata used to build the verification prompt. */
  report: ReportContext
}

export interface VerifyAndUpsertResult {
  persisted: boolean
  verdict: MatchVerdict
  reason: string
}

export async function verifyAndUpsertTag(
  supabase: any,
  args: VerifyAndUpsertArgs,
  anth?: Anthropic,
): Promise<VerifyAndUpsertResult> {
  var verdict = await verifyTag(args.phen, args.report, anth)
  if (verdict.match === 'no') {
    return { persisted: false, verdict: 'no', reason: verdict.reasoning }
  }
  // 'yes' or 'uncertain' → upsert.
  var upsertRes = await supabase.from('report_phenomena').upsert({
    report_id: args.reportId,
    phenomenon_id: args.phenomenonId,
    confidence: args.confidence,
    tagged_by: args.taggedBy || 'auto',
  }, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true })
  if (upsertRes.error) {
    return { persisted: false, verdict: verdict.match, reason: 'upsert error: ' + upsertRes.error.message }
  }
  return { persisted: true, verdict: verdict.match, reason: verdict.reasoning }
}

/**
 * Verify a report-phenomenon match. Returns 'uncertain' on any
 * failure so callers default to keeping the tag (prefer false
 * positives over false negatives).
 */
export async function verifyTag(
  phen: PhenContext,
  report: ReportContext,
  anth?: Anthropic,
): Promise<VerificationResult> {
  if (!ANTHROPIC_API_KEY) {
    return { match: 'uncertain', reasoning: 'no API key' }
  }
  var client = anth || new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  try {
    var resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: buildPrompt(phen, report) }],
    })
    var text = ((resp.content[0] as any) && (resp.content[0] as any).text) || ''
    var trimmed = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    var jStart = trimmed.indexOf('{')
    var jEnd = trimmed.lastIndexOf('}')
    if (jStart < 0 || jEnd <= jStart) {
      return { match: 'uncertain', reasoning: 'unparseable response' }
    }
    var parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
    var match: MatchVerdict = parsed.match === 'yes' || parsed.match === 'no' || parsed.match === 'uncertain'
      ? parsed.match
      : 'uncertain'
    return {
      match: match,
      reasoning: parsed.reasoning || '',
    }
  } catch (e: any) {
    return { match: 'uncertain', reasoning: 'haiku error: ' + (e?.message || e) }
  }
}

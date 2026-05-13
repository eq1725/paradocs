/**
 * witness-profile.service — V10.7.A.1
 *
 * Extracts a structured witness profile (age range, gender,
 * occupation, state at the time of the experience, etc.) from
 * a report's narrative + title + summary. Stored as a JSONB
 * blob in reports.witness_profile (added in V10.7.A.0).
 *
 * Architecture:
 *   - Uses direct Anthropic API fetch (mirrors paradocs-analysis
 *     pattern) because the output is structured JSON with a closed
 *     set of enum values, not free text. The rewrite-pipeline's
 *     claim-citation check works on text outputs and doesn't map
 *     cleanly to enum extraction.
 *   - Anti-fabrication discipline is baked into the prompt:
 *     bucketed enums, mandatory 'unspecified' default, and a
 *     confidence score the UI can use to gate display.
 *   - Every call writes a row to ai_rewrite_audit
 *     (mode='structural', prompt_kind via output_field) so the
 *     admin /ai-audit page surfaces witness-profile generations
 *     alongside answer-line / analysis / etc. for spot-checking.
 *
 * Privacy: the prompt explicitly bans first/last names, employer
 * names, exact addresses, religion, race. All dimensions resolve
 * to lowercase snake_case enum buckets — nothing free-form makes
 * it into the JSONB.
 *
 * Returns: { profile, reason } so callers can distinguish
 *   - profile=null + reason='insufficient' — source too thin
 *   - profile=null + reason='parse_failed' — model returned junk
 *   - profile=null + reason='no_source'    — no description
 *   - profile=null + reason='not_found'    — bad reportId
 *   - profile={...}                        — success
 */

import { createClient } from '@supabase/supabase-js'
import { PROMPT_VERSION } from '@/lib/ai/rewrite-pipeline'

// ── Config ──────────────────────────────────────────────────

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_FALLBACK = 'claude-haiku-4-5-20251001' // keep same for now; fallback hook is here if we ever need a Sonnet escalation
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2

// ── Enums (must match what the prompt asks for) ────────────

const AGE_RANGES = [
  'child', 'teen', '18-29', '30-49', '50-69', '70+', 'unspecified',
] as const

const GENDERS = [
  'female', 'male', 'nonbinary', 'unspecified',
] as const

const OCCUPATION_CATEGORIES = [
  'student', 'military_vet', 'medical', 'first_responder',
  'aviation', 'tradesperson', 'office', 'retired',
  'other', 'unspecified',
] as const

const STATES_AT_EVENT = [
  'awake_alert', 'meditation', 'drowsy_falling_asleep',
  'sleeping', 'driving', 'physical_activity',
  'intoxicated', 'unspecified',
] as const

export type WitnessAgeRange = typeof AGE_RANGES[number]
export type WitnessGender = typeof GENDERS[number]
export type WitnessOccupation = typeof OCCUPATION_CATEGORIES[number]
export type WitnessStateAtEvent = typeof STATES_AT_EVENT[number]

export interface WitnessProfile {
  age_range?: WitnessAgeRange
  gender?: WitnessGender
  occupation_category?: WitnessOccupation
  state_at_event?: WitnessStateAtEvent
  with_others?: boolean | null
  prior_similar_experience?: boolean | null
  confidence?: number
}

export interface WitnessProfileResult {
  profile: WitnessProfile | null
  reason?: 'ok' | 'insufficient' | 'parse_failed' | 'no_source' | 'not_found' | 'no_api_key' | 'api_error'
}

// ── Prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You extract a structured witness profile from paranormal-experience reports.',
  '',
  'CRITICAL ANTI-FABRICATION RULES (read carefully — these override every other instruction):',
  '- Every value you return MUST be directly supported by something stated in the source text.',
  '- If the source does not directly support a value, return "unspecified" (or null for booleans).',
  '- Do NOT infer demographics from names, locations, eras, or category. The category "ghost sighting" does NOT imply gender or age.',
  '- Do NOT use general knowledge about who typically reports this kind of experience. We want the profile of THIS witness, not the typical witness.',
  '- "unspecified" is not a failure — it is the correct answer when the source is silent on a dimension. Most fields will be "unspecified" for most reports. That is fine.',
  '',
  'PRIVACY RULES (hard bans — your output is stored and may be shown to readers):',
  '- NEVER include first or last names of the witness or anyone in the report.',
  '- NEVER include employer names, school names, military unit names, or street addresses.',
  '- NEVER infer or report on race, ethnicity, or religion. These dimensions do not exist in your output.',
  '- NEVER include exact ages. Bucket to age_range only.',
  '- All values are lowercase snake_case enum strings from the closed lists below. Free text is not allowed.',
  '',
  'OUTPUT FORMAT: a JSON object with these exact keys. Do NOT include any other keys. Do NOT wrap in markdown fences. Do NOT include any prose before or after.',
  '',
  '{',
  '  "age_range": "child" | "teen" | "18-29" | "30-49" | "50-69" | "70+" | "unspecified",',
  '  "gender": "female" | "male" | "nonbinary" | "unspecified",',
  '  "occupation_category": "student" | "military_vet" | "medical" | "first_responder" | "aviation" | "tradesperson" | "office" | "retired" | "other" | "unspecified",',
  '  "state_at_event": "awake_alert" | "meditation" | "drowsy_falling_asleep" | "sleeping" | "driving" | "physical_activity" | "intoxicated" | "unspecified",',
  '  "with_others": true | false | null,',
  '  "prior_similar_experience": true | false | null,',
  '  "confidence": 0.0 to 1.0',
  '}',
  '',
  'AGE BUCKET DEFINITIONS:',
  '- child: under 13',
  '- teen: 13–17',
  '- 18-29: young adult',
  '- 30-49: adult',
  '- 50-69: older adult',
  '- 70+: senior',
  '',
  'OCCUPATION BUCKET DEFINITIONS:',
  '- military_vet: active or veteran of any armed service. Including reserve, intelligence, or national guard.',
  '- medical: doctors, nurses, paramedics-in-clinical-context, dentists, vet techs.',
  '- first_responder: police, firefighter, EMS (when on duty / in the field, not in clinic).',
  '- aviation: pilots (civilian or military), flight crew, air traffic, aerospace engineering.',
  '- tradesperson: electrician, plumber, mechanic, carpenter, farmer, fisherman, factory, construction, etc.',
  '- office: knowledge work, sales, accounting, IT, management, etc.',
  '- student: in school or university, primary occupation.',
  '- retired: explicitly retired.',
  '- other: clearly stated occupation that fits none of the above (artist, journalist, clergy, etc.).',
  '- unspecified: source does not say.',
  'If the witness is described in multiple roles (e.g. "retired pilot"), pick the role IN EFFECT AT THE TIME of the experience. If still ambiguous, pick the more specific bucket (aviation over retired).',
  '',
  'STATE AT EVENT DEFINITIONS:',
  '- awake_alert: normal waking consciousness, fully alert.',
  '- meditation: actively meditating, doing breathwork, yoga, or similar contemplative practice.',
  '- drowsy_falling_asleep: hypnagogic state — falling asleep, half-asleep, waking up groggy.',
  '- sleeping: asleep or dreaming when the experience occurred.',
  '- driving: operating a vehicle (car, truck, motorcycle, etc.).',
  '- physical_activity: hiking, running, working, swimming, etc.',
  '- intoxicated: under the influence of alcohol or drugs (recreational or pharmaceutical).',
  '- unspecified: source does not say.',
  '',
  'BOOLEAN FIELD DEFINITIONS:',
  '- with_others: true if witnesses other than the primary experiencer were present and saw the same thing. false if the witness was explicitly alone. null if the source does not say.',
  '- prior_similar_experience: true if the source describes this witness having had similar experiences before. false if the source explicitly notes this was a first-time experience. null if not stated.',
  '',
  'CONFIDENCE:',
  '- 0.9–1.0: every populated field has explicit textual support, no inference required.',
  '- 0.5–0.8: some fields populated by reasonable inference from clear textual signals (e.g. age inferred from "in my fifties").',
  '- 0.0–0.4: most fields are "unspecified" because the source is sparse. Use this for very thin reports.',
  '- The confidence is a self-assessment by you, the model. Be honest. We use it to gate display.',
  '',
  'EXAMPLES:',
  '',
  'Source: "I was in my 40s, a pilot in the Air Force, on a mission over the Mediterranean when I saw a glowing object pace my F-16 for 90 seconds. My wingman saw it too."',
  'Output: {"age_range":"30-49","gender":"unspecified","occupation_category":"aviation","state_at_event":"awake_alert","with_others":true,"prior_similar_experience":null,"confidence":0.85}',
  '',
  'Source: "I was meditating in my room when I felt a presence behind me."',
  'Output: {"age_range":"unspecified","gender":"unspecified","occupation_category":"unspecified","state_at_event":"meditation","with_others":false,"prior_similar_experience":null,"confidence":0.55}',
  '',
  'Source: "It happened in 1987 in Ohio. There was a light in the sky."',
  'Output: {"age_range":"unspecified","gender":"unspecified","occupation_category":"unspecified","state_at_event":"unspecified","with_others":null,"prior_similar_experience":null,"confidence":0.1}',
  '',
  'Return ONLY the JSON object. No prose.',
].join('\n')

// ── Direct Anthropic fetch ──────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<{ text: string | null; durationMs: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[WitnessProfile] No ANTHROPIC_API_KEY')
    return { text: null, durationMs: 0, model: ANTHROPIC_MODEL }
  }

  const models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const model = models[Math.min(attempt, models.length - 1)]
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const durationMs = Date.now() - startedAt

      if (resp.status === 429 || resp.status >= 500) {
        console.warn('[WitnessProfile] ' + resp.status + ' from ' + model + ' (attempt ' + attempt + ')')
        continue
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        console.error('[WitnessProfile] ' + resp.status + ' from ' + model + ': ' + errText.substring(0, 400))
        return { text: null, durationMs, model }
      }

      const data: any = await resp.json()
      const out = data?.content?.[0]?.text
      if (out) {
        return { text: out.trim(), durationMs, model }
      }
      console.warn('[WitnessProfile] Empty content from ' + model + ' (stop_reason=' + (data.stop_reason || 'none') + ')')
      return { text: null, durationMs, model }
    } catch (err: any) {
      clearTimeout(timeoutId)
      const durationMs = Date.now() - startedAt
      if (err.name === 'AbortError') {
        console.error('[WitnessProfile] Timeout on ' + model + ' attempt ' + attempt)
      } else {
        console.error('[WitnessProfile] Network error on ' + model + ' attempt ' + attempt + ': ' + (err.message || err))
      }
      if (attempt === MAX_RETRIES) {
        return { text: null, durationMs, model }
      }
      // Brief backoff before retry
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  return { text: null, durationMs: 0, model: ANTHROPIC_MODEL }
}

// ── JSON parsing + validation ───────────────────────────────

function parseAndValidate(raw: string): WitnessProfile | null {
  try {
    let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const parsed = JSON.parse(cleaned.substring(start, end + 1))
    if (!parsed || typeof parsed !== 'object') return null

    const result: WitnessProfile = {}

    // Enum validations — anything off-list is dropped (not stored).
    // The generated columns will surface "unspecified" via the JSONB
    // path, and missing keys read as null — both are fine on the UI side.
    if (typeof parsed.age_range === 'string' && (AGE_RANGES as readonly string[]).indexOf(parsed.age_range) !== -1) {
      result.age_range = parsed.age_range as WitnessAgeRange
    }
    if (typeof parsed.gender === 'string' && (GENDERS as readonly string[]).indexOf(parsed.gender) !== -1) {
      result.gender = parsed.gender as WitnessGender
    }
    if (typeof parsed.occupation_category === 'string' && (OCCUPATION_CATEGORIES as readonly string[]).indexOf(parsed.occupation_category) !== -1) {
      result.occupation_category = parsed.occupation_category as WitnessOccupation
    }
    if (typeof parsed.state_at_event === 'string' && (STATES_AT_EVENT as readonly string[]).indexOf(parsed.state_at_event) !== -1) {
      result.state_at_event = parsed.state_at_event as WitnessStateAtEvent
    }
    if (parsed.with_others === true || parsed.with_others === false) {
      result.with_others = parsed.with_others
    } else if (parsed.with_others === null) {
      result.with_others = null
    }
    if (parsed.prior_similar_experience === true || parsed.prior_similar_experience === false) {
      result.prior_similar_experience = parsed.prior_similar_experience
    } else if (parsed.prior_similar_experience === null) {
      result.prior_similar_experience = null
    }
    if (typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1) {
      result.confidence = Math.round(parsed.confidence * 100) / 100
    }

    // If literally every field is unspecified/null, treat the
    // extraction as insufficient — store nothing rather than
    // pollute the column with empty objects.
    const meaningful =
      (result.age_range && result.age_range !== 'unspecified') ||
      (result.gender && result.gender !== 'unspecified') ||
      (result.occupation_category && result.occupation_category !== 'unspecified') ||
      (result.state_at_event && result.state_at_event !== 'unspecified') ||
      result.with_others === true || result.with_others === false ||
      result.prior_similar_experience === true || result.prior_similar_experience === false
    if (!meaningful) return null

    return result
  } catch (err) {
    console.warn('[WitnessProfile] JSON parse failed: ' + (err as any)?.message)
    return null
  }
}

// ── Audit log writer (mirrors rewrite-pipeline shape) ──────

async function writeAuditLog(params: {
  reportId: string
  sourceText: string
  outputText: string | null
  model: string
  durationMs: number
  insufficient: boolean
  status: 'passed' | 'pending' | 'bypassed'
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
  try {
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
    await (svc.from('ai_rewrite_audit') as any).insert({
      mode: 'structural',
      prompt_version: PROMPT_VERSION,
      model: params.model,
      output_field: 'reports.witness_profile',
      source_text: params.sourceText.slice(0, 8192),
      output_text: params.outputText,
      claim_check_passed: null, // N/A for structured extraction
      claim_check_notes: null,
      insufficient: params.insufficient,
      status: params.status,
      report_id: params.reportId,
      artifact_id: null,
      duration_ms: params.durationMs,
    })
  } catch (err) {
    console.error('[WitnessProfile] audit write failed:', err)
  }
}

// ── Main entry point ────────────────────────────────────────

export async function generateAndSaveWitnessProfile(reportId: string): Promise<WitnessProfileResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { profile: null, reason: 'no_api_key' }
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const { data: report, error: fetchError } = await (supabase.from('reports') as any)
    .select('id, title, summary, description')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[WitnessProfile] Report not found: ' + reportId)
    return { profile: null, reason: 'not_found' }
  }

  // Same source-packet discipline as the other V10.6 services:
  // title + summary + 8K-truncated narrative. Nothing else — no
  // metadata fields that might cause the AI to echo structured
  // fields back as facts.
  if (!report.description && !report.summary) {
    return { profile: null, reason: 'no_source' }
  }
  const parts: string[] = []
  if (report.title) parts.push('Title: ' + report.title)
  if (report.summary) parts.push('Summary: ' + report.summary)
  if (report.description) {
    const desc = report.description.length > 8000
      ? report.description.substring(0, 8000) + '...'
      : report.description
    parts.push('\nFull source text:\n' + desc)
  }
  const sourceText = parts.join('\n')

  const userPrompt =
    'Extract the witness profile from the source below. Return ONLY the JSON object as specified in the system prompt. If a dimension is not directly supported by the text, use "unspecified" (or null for booleans).\n\n' +
    'SOURCE:\n' +
    sourceText

  const { text, durationMs, model } = await callClaude(
    SYSTEM_PROMPT,
    userPrompt,
    400,    // small token budget — JSON is short
    0.1,    // low temp — extraction, not creativity
  )

  if (!text) {
    await writeAuditLog({
      reportId,
      sourceText,
      outputText: null,
      model,
      durationMs,
      insufficient: false,
      status: 'bypassed',
    })
    return { profile: null, reason: 'api_error' }
  }

  const profile = parseAndValidate(text)

  await writeAuditLog({
    reportId,
    sourceText,
    outputText: text,
    model,
    durationMs,
    insufficient: profile === null,
    status: profile === null ? 'bypassed' : 'passed',
  })

  if (!profile) {
    // Persist null so the report-page render handles absence cleanly
    // and the backfill loop can distinguish "tried and failed" from
    // "haven't tried yet" via the audit row.
    await (supabase.from('reports') as any)
      .update({ witness_profile: null })
      .eq('id', reportId)
    return { profile: null, reason: 'insufficient' }
  }

  const { error: updateError } = await (supabase.from('reports') as any)
    .update({ witness_profile: profile })
    .eq('id', reportId)

  if (updateError) {
    console.error('[WitnessProfile] Failed to save for ' + reportId + ':', updateError)
    return { profile: null, reason: 'api_error' }
  }

  return { profile, reason: 'ok' }
}

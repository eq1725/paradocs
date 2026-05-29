/**
 * cluster-finding.service.ts — V11.17.41
 *
 * V2 of the cluster-card redesign (panel: Maya/Jordan/Lena/Sam).
 *
 * Generates the quiet shape sentence ("Most cluster around the Central
 * Valley and the coast south of Monterey.") that sits under the
 * cluster card's templated headline. The v1 fallback is a flat
 * templated sentence; this service produces the editorial high-bar
 * variant when the linked reports give us enough signal.
 *
 * Cost shape:
 *   - One Haiku call per cluster, ~250 input + 60 output tokens.
 *   - ~$0.0008 per cluster.
 *   - Called from /api/discover/clusters which caches 10 min, so the
 *     same cluster's finding is reused across requests in that window.
 *
 * Failure mode: returns null on any error (no key, parse failure,
 * Haiku timeout). The caller falls back to a templated body.
 */

import { createServerClient } from '../supabase'

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var MAX_TOKENS = 120
var TEMPERATURE = 0.5
var REQUEST_TIMEOUT_MS = 12_000

export interface ClusterFindingInput {
  cluster_type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  category_label: string  // "UFOs & Aliens" (human label, not slug)
  location_summary?: string  // "California, United States"
  report_count: number
  time_range: string  // "Past 7 days"
  linked_report_ids: string[]
}

interface SampleReport {
  title: string | null
  summary: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  event_time: string | null
}

var SYSTEM_PROMPT = [
  'You are an editorial voice for Paradocs, the world\'s most credible paranormal research platform.',
  'Your job: given a cluster of recent reports, write ONE quiet declarative sentence (max 22 words)',
  'naming a SHARED characteristic the reports actually have. Examples of good shape sentences:',
  '  - "Most cluster around the Central Valley and the coast south of Monterey."',
  '  - "Reports concentrate around dusk on weekday evenings."',
  '  - "Witnesses describe the same orange-light pattern across the cluster."',
  '  - "Most accounts come from drivers on rural highways."',
  '',
  'HARD RULES:',
  '  - Use proper nouns (specific towns / regions / hours / colors) when the data supports it.',
  '  - Do NOT restate the count — that\'s already in the headline.',
  '  - Do NOT use words like "trending", "concentration detected", "surge", "spike", "anomaly".',
  '  - Do NOT use exclamation marks or em-dashes for emphasis.',
  '  - One sentence. Present tense. Declarative. Quiet.',
  '  - If the data is too thin to identify any shared characteristic honestly, return the exact string "INSUFFICIENT".',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object: {"finding": "<sentence>"}. No preamble, no markdown fences.',
].join('\n')

function buildUserPrompt(input: ClusterFindingInput, samples: SampleReport[]): string {
  var locale = input.location_summary || 'multiple locations'
  var sampleLines = samples.map(function (r, i) {
    var loc: string[] = []
    if (r.city) loc.push(r.city)
    if (r.state_province) loc.push(r.state_province)
    var locStr = loc.length > 0 ? loc.join(', ') : 'unknown'
    var timeStr = r.event_time || ''
    var dateStr = r.event_date || ''
    var when = [dateStr, timeStr].filter(Boolean).join(' ')
    return (
      (i + 1) + '. ' +
      'place=' + locStr + (when ? ' | when=' + when : '') + '\n' +
      '   title: ' + (r.title || '(none)').slice(0, 110) + '\n' +
      '   summary: ' + (r.summary || '(none)').slice(0, 220)
    )
  }).join('\n')

  return [
    'CLUSTER:',
    '  type: ' + input.cluster_type,
    '  category: ' + input.category_label,
    '  location_summary: ' + locale,
    '  count: ' + input.report_count,
    '  window: ' + input.time_range,
    '',
    'SAMPLE REPORTS (' + samples.length + ' of ' + input.report_count + '):',
    sampleLines,
    '',
    'Write the shape sentence per the rules. JSON only.',
  ].join('\n')
}

async function callHaiku(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null
  var controller = new AbortController()
  var timeoutId = setTimeout(function () { controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      console.warn('[ClusterFinding] Haiku non-2xx: ' + resp.status)
      return null
    }
    var data: any = await resp.json()
    var text = data?.content?.[0]?.text || ''
    return text || null
  } catch (e: any) {
    clearTimeout(timeoutId)
    console.warn('[ClusterFinding] Haiku call threw: ' + (e?.message || e))
    return null
  }
}

function parseFinding(rawText: string): string | null {
  // Try strict JSON first.
  try {
    var trimmed = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    var jStart = trimmed.indexOf('{')
    var jEnd = trimmed.lastIndexOf('}')
    if (jStart >= 0 && jEnd > jStart) {
      var parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
      if (typeof parsed.finding === 'string') return parsed.finding.trim()
    }
  } catch (_e) { /* fall through */ }
  // Fallback: first non-empty line, stripped of obvious noise.
  var firstLine = rawText.split('\n').map(function (s) { return s.trim() }).filter(Boolean)[0] || ''
  return firstLine || null
}

/**
 * Generate the cluster's "finding" sentence, or null when:
 *   - no API key configured
 *   - Haiku timed out / errored / returned malformed output
 *   - Haiku returned the sentinel "INSUFFICIENT"
 *
 * The caller (api/discover/clusters.ts) falls back to a templated
 * sentence whenever this returns null.
 */
export async function generateClusterFinding(
  input: ClusterFindingInput,
): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null
  if (!input.linked_report_ids || input.linked_report_ids.length === 0) return null

  // Pull up to 12 sample reports so Haiku has real signal to lock onto.
  // 12 fits comfortably in the prompt budget and gives the model enough
  // variation to spot or rule out a shared characteristic.
  var sampleIds = input.linked_report_ids.slice(0, 12)
  var supabase = createServerClient()
  var { data, error } = await (supabase
    .from('reports') as any)
    .select('title, summary, city, state_province, event_date, event_time')
    .in('id', sampleIds)

  if (error) {
    console.warn('[ClusterFinding] sample fetch error: ' + error.message)
    return null
  }
  if (!data || data.length === 0) return null

  var samples: SampleReport[] = data.slice(0, 12)
  var userPrompt = buildUserPrompt(input, samples)

  var raw = await callHaiku(SYSTEM_PROMPT, userPrompt)
  if (!raw) return null

  var finding = parseFinding(raw)
  if (!finding) return null

  // Sentinel return — Haiku told us the data was too thin.
  if (/^INSUFFICIENT$/i.test(finding.trim())) return null

  // Quick sanity: trim, drop trailing/leading quotes, cap length so a
  // misbehaving model can't blow out the card layout.
  finding = finding.replace(/^["']|["']$/g, '').trim()
  if (finding.length > 220) finding = finding.slice(0, 217).replace(/\s+\S*$/, '') + '…'
  return finding || null
}

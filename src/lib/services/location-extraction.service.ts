/**
 * location-extraction.service.ts — V11.17.52
 *
 * Centralized location-extraction-and-geocoding service. Replaces the
 * inline Haiku+MapTiler logic previously duplicated across
 * scripts/backfill-youtube-locations.ts and missing entirely from
 * most ingestion adapters.
 *
 * Two consumers:
 *   1. Backfill scripts (one-shot fixes for reports with null location)
 *   2. Ingestion engine (src/lib/ingestion/engine.ts) — post-insert
 *      hook that catches gaps when an adapter doesn't run its own
 *      NLP location pass. Triggered when location_name is null after
 *      the insert.
 *
 * Why centralized: per the May 30 Manipur incident — a Reddit report
 * "Unexplained Events at Manipur India Baffles Local Residents" was
 * ingested with NULL location_name despite the country being in the
 * title. The Reddit adapter (and several others) don't run any NLP
 * location extraction. This service is the safety net that runs after
 * the adapter is done, regardless of which adapter wrote the row.
 *
 * Cost: ~$0.00006 per Haiku call. At 1k reports/day = $0.06/day,
 * negligible.
 *
 * Failure mode: returns null on any failure (no API key, Haiku
 * timeout, geocode miss). Caller leaves the row with whatever the
 * adapter wrote — never blocks the ingestion path.
 */

import Anthropic from '@anthropic-ai/sdk'
import { geocodeStructuredLocation } from './geocoding.service'
import { logAiUsage, getCostLogClient } from './ai-cost-logger'

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
var HAIKU_MODEL = 'claude-haiku-4-5-20251001'

interface ExtractInput {
  title: string | null
  summary: string | null
  description: string | null
}

interface ExtractedLocation {
  city: string | null
  state_province: string | null
  country: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  rationale: string
}

export interface ResolvedLocation {
  location_name: string
  city: string | null
  state_province: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  location_precision: 'exact' | 'region' | 'country'
  confidence: 'high' | 'medium' | 'low'
  /** V11.17.83 — true when coords came from a centroid fallback (not a real geocode). */
  coords_synthetic?: boolean
}

var EXTRACT_PROMPT = [
  'You extract geographic location ENTITIES from paranormal/anomalous experience reports.',
  '',
  'CRITICAL RULES:',
  '1. Only return locations EXPLICITLY mentioned in the text. Never infer from context.',
  '2. "High desert" or "the woods" are NOT locations (too vague).',
  '3. "Florida", "Texas", "Pacific Northwest" ARE locations.',
  '4. "National Park" alone is NOT a location; "Yellowstone" IS.',
  '5. Witness ethnicity/language clues (e.g., "I\'m from Brazil") count.',
  '6. Prefer the EVENT location over the witness\'s current location when both are mentioned.',
  '7. Return null for any field not explicitly mentioned.',
  '',
  'CONFIDENCE:',
  '  - high: at least one of city/state/country is unambiguously named',
  '  - medium: location named but ambiguous (e.g., "Springfield")',
  '  - low: weak or implicit signal',
  '  - none: no location signal at all',
  '',
  'OUTPUT: JSON only. No preamble. Shape:',
  '{"city": string|null, "state_province": string|null, "country": string|null, "confidence": "high"|"medium"|"low"|"none", "rationale": "<1 short sentence>"}',
].join('\n')

function buildUserPrompt(input: ExtractInput): string {
  return [
    'TITLE: ' + (input.title || '(none)').slice(0, 300),
    '',
    'SUMMARY: ' + (input.summary || '(none)').slice(0, 500),
    '',
    'DESCRIPTION (first 1500 chars):',
    (input.description || '(none)').slice(0, 1500),
    '',
    'Extract location per rules. JSON only.',
  ].join('\n')
}

async function callHaikuExtract(input: ExtractInput): Promise<ExtractedLocation | null> {
  if (!ANTHROPIC_API_KEY) return null
  try {
    var anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    var resp = await anth.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      temperature: 0,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    })

    // V11.17.84 — unified cost log. Volume here is low (only fires
    // when ingestion-time location extraction missed) but still worth
    // tracking for the daily-cost summary.
    var usage = (resp as any).usage || {}
    var logClient = await getCostLogClient()
    if (logClient) {
      logAiUsage('location-extract', logClient, {
        model: HAIKU_MODEL,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        requestId: (resp as any).id || null,
        status: 'completed',
      })
    }

    var text = ((resp.content[0] as any) && (resp.content[0] as any).text) || ''
    var trimmed = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    var jStart = trimmed.indexOf('{')
    var jEnd = trimmed.lastIndexOf('}')
    if (jStart < 0 || jEnd <= jStart) return null
    var parsed = JSON.parse(trimmed.substring(jStart, jEnd + 1))
    return {
      city: parsed.city || null,
      state_province: parsed.state_province || null,
      country: parsed.country || null,
      confidence: parsed.confidence || 'none',
      rationale: parsed.rationale || '',
    }
  } catch (e: any) {
    console.warn('[location-extraction] Haiku failed: ' + (e?.message || e))
    return null
  }
}

function precisionFromAccuracy(accuracy: string): 'exact' | 'region' | 'country' {
  if (accuracy === 'address' || accuracy === 'street' || accuracy === 'locality') return 'exact'
  if (accuracy === 'region') return 'region'
  return 'country'
}

/**
 * Run Haiku to extract location entities, then MapTiler to geocode.
 * Returns null when extraction fails, Haiku finds no location, or
 * geocoding yields nothing usable.
 *
 * Even on geocode failure, we still return the structured fields
 * (with null lat/lng + precision='country') so the caller can at
 * least populate location_name + city/state/country and stop the
 * report from rendering as "no location" on the report page.
 */
export async function extractAndGeocodeLocation(input: ExtractInput): Promise<ResolvedLocation | null> {
  var loc = await callHaikuExtract(input)
  if (!loc || loc.confidence === 'none') return null

  var locationName = [loc.city, loc.state_province, loc.country].filter(Boolean).join(', ')
  if (!locationName) return null

  // Early-return above narrows loc.confidence to exclude 'none', so
  // this is just a type-safe alias for the narrowed value.
  var confidence: 'high' | 'medium' | 'low' = loc.confidence

  // V11.17.83 — structured geocode with state-centroid fallback. When
  // the geocoder degrades to a country-level match (e.g. Nominatim
  // returning the US centroid for "New York, United States"), this
  // wrapper substitutes the static state centroid so we don't write
  // a Kansas pin for a NY report. See geocoding.service.ts.
  var geo = await geocodeStructuredLocation({
    city: loc.city || undefined,
    state: loc.state_province || undefined,
    country: loc.country || undefined,
  })

  if (!geo) {
    // Have text but no coords — still useful (UI shows "Location: <text>"
    // instead of "no location specified").
    return {
      location_name: locationName,
      city: loc.city,
      state_province: loc.state_province,
      country: loc.country,
      latitude: null,
      longitude: null,
      location_precision: 'country',
      confidence: confidence,
    }
  }

  return {
    location_name: locationName,
    city: loc.city,
    state_province: loc.state_province,
    country: loc.country,
    latitude: geo.latitude,
    longitude: geo.longitude,
    location_precision: precisionFromAccuracy(geo.accuracy || 'country'),
    confidence: confidence,
    coords_synthetic: geo.synthetic,
  }
}

/**
 * location-zoom — V10.8.I → V10.8.I.1
 *
 * Precision-aware framing for the report-page map (and any future
 * "fit to admin region" use). When a report's coords are synthetic
 * (centroid fallback for country/state/region precision), the map
 * must FRAME the actual feature — not drop a pin at a guessed zoom
 * level. A "Kansas" report should show Kansas. An "Oman" report
 * should show Oman. A "United States" report should show the
 * contiguous 48. A "Vatican" report should show the Vatican at the
 * tightest legible zoom.
 *
 * V10.8.I shipped a per-precision zoom number that worked on a
 * 1200×600 desktop viewport but degraded badly on the 380×200 mobile
 * report-header map: the halo and tile background dominated the
 * frame and the user couldn't tell where in the world they were.
 *
 * V10.8.I.1 fixes this by serving real bounding boxes (country +
 * state polygons from Natural Earth admin0/admin1) and having the
 * map call `map.fitBounds(bbox, { padding })` so the framing is
 * accurate regardless of viewport size. The old zoom-number helpers
 * stay as a fallback for any code path that doesn't have a bbox
 * (cities and unknowns).
 */

/**
 * Zoom level that frames an entire country in a 1200×600-ish viewport
 * on a Web Mercator projection. Lower number = wider view.
 *
 * Defaults: 5 for "normal-sized" countries. Overrides cover anything
 * needing a wider zoom (continental-scale countries).
 */
const COUNTRY_FIT_ZOOM_OVERRIDE: Record<string, number> = {
  // Continental / extra-large
  RU: 2,    // Russia
  US: 3,    // United States
  CA: 3,    // Canada
  CN: 3,    // China
  BR: 3,    // Brazil
  AU: 3,    // Australia
  GL: 3,    // Greenland
  AR: 3.5,
  KZ: 3.5,
  IN: 4,
  MX: 4,
  ID: 4,    // Indonesia (spread across many islands)
  DZ: 4,    // Algeria
  SA: 4,    // Saudi Arabia
  MN: 4,    // Mongolia
  IR: 4,    // Iran
  LY: 4,    // Libya
  SD: 4,    // Sudan
  CD: 4,    // DR Congo
  ZA: 4.5,  // South Africa
  CO: 4.5,
  PE: 4.5,
  CL: 4,    // Chile (long & narrow)
  ET: 4.5,
  EG: 5,
  TR: 5,    // Turkey
  FR: 5,
  DE: 5,
  ES: 5,
  PL: 5,
  UA: 5,
  // Tiny — zoom in more
  VA: 13,   // Vatican
  MC: 12,   // Monaco
  SM: 11,   // San Marino
  LI: 11,   // Liechtenstein
  MT: 9,    // Malta
  AD: 10,   // Andorra
  LU: 9,    // Luxembourg
  SG: 10,   // Singapore
  HK: 10,   // Hong Kong
  BH: 10,   // Bahrain
}

/** Default zoom when a country isn't in the override table. */
const COUNTRY_FIT_ZOOM_DEFAULT = 5

export function getCountryFitZoom(countryCode: string | null | undefined): number {
  if (!countryCode) return COUNTRY_FIT_ZOOM_DEFAULT
  const code = String(countryCode).toUpperCase()
  return COUNTRY_FIT_ZOOM_OVERRIDE[code] ?? COUNTRY_FIT_ZOOM_DEFAULT
}

/**
 * Zoom level that frames a single state/province. Keyed by
 * "<countryCode>|<stateKey>" — matches the state-centroids.json
 * key format. Defaults to 6 (good fit for medium-sized US states).
 */
const STATE_FIT_ZOOM_OVERRIDE: Record<string, number> = {
  // US — large states
  'US|AK': 3.5,  // Alaska — spans many time zones
  'US|TX': 5,
  'US|CA': 5,
  'US|MT': 5,
  'US|NM': 5.5,
  'US|AZ': 5.5,
  'US|NV': 5.5,
  'US|CO': 5.5,
  'US|WY': 5.5,
  'US|HI': 5,    // Hawaii — spread out island chain
  // US — small states
  'US|DC': 9,
  'US|RI': 8,
  'US|DE': 8,
  'US|CT': 8,
  // Canada — provinces
  'CA|NU': 3,    // Nunavut
  'CA|NT': 3.5,  // Northwest Territories
  'CA|QC': 4,
  'CA|ON': 4,
  'CA|BC': 4.5,
  'CA|AB': 5,
  'CA|SK': 5,
  'CA|MB': 5,
  'CA|YT': 4.5,
  'CA|NL': 4.5, // Newfoundland and Labrador
  // Australia — states/territories
  'AU|WA': 4,
  'AU|QLD': 4,
  'AU|NT': 4.5,
  'AU|NSW': 5,
  'AU|VIC': 5.5,
  'AU|SA': 4.5,
  'AU|TAS': 6,
  'AU|ACT': 8,
  // UK — home nations
  'GB|ENG': 5.5,
  'GB|SCT': 5.5,
  'GB|WLS': 7,
  'GB|NIR': 7,
}

const STATE_FIT_ZOOM_DEFAULT = 6

export function getStateFitZoom(
  countryCode: string | null | undefined,
  stateKey: string | null | undefined,
): number {
  if (!countryCode || !stateKey) return STATE_FIT_ZOOM_DEFAULT
  const cc = String(countryCode).toUpperCase()
  // Direct postal-code match first.
  const direct = STATE_FIT_ZOOM_OVERRIDE[cc + '|' + String(stateKey)]
  if (direct !== undefined) return direct
  // Fall back to name→postal lookup so consumers can pass full state
  // names (DB writes "Kansas" not "KS"). resolveStateKey is defined
  // alongside the bbox helpers below.
  const resolved = resolveStateKey(cc, String(stateKey))
  if (resolved) {
    const v = STATE_FIT_ZOOM_OVERRIDE[cc + '|' + resolved]
    if (v !== undefined) return v
  }
  return STATE_FIT_ZOOM_DEFAULT
}

/**
 * One-stop helper for the report-page map: returns the zoom level
 * that should frame the report's location given its precision and
 * synthetic-coord state.
 *
 * Behavior:
 *   - coords_synthetic === false (precise pin)    → null (use the
 *     caller's existing precision-default zoom).
 *   - coords_synthetic === true + 'country'       → fit-to-country
 *   - coords_synthetic === true + 'region'/'state'→ fit-to-state
 *   - coords_synthetic === true + 'city'          → 8 (modest zoom-out
 *     vs. precise-pin behavior so the user reads it as fuzzy).
 */
export function getSyntheticFitZoom(opts: {
  precision: string | null | undefined
  coords_synthetic: boolean | null | undefined
  countryCode?: string | null
  stateKey?: string | null
}): number | null {
  if (!opts.coords_synthetic) return null
  if (opts.precision === 'country') return getCountryFitZoom(opts.countryCode)
  if (opts.precision === 'region' || opts.precision === 'state') {
    return getStateFitZoom(opts.countryCode, opts.stateKey)
  }
  if (opts.precision === 'city') return 8
  return null
}

// ── V10.8.I.1 — bbox-based framing ───────────────────────────────
//
// Real bounding boxes for every country (Natural Earth admin0) and
// every US/CA/AU/UK first-class subdivision (Natural Earth admin1).
// Antimeridian-crossing entries (US, RU, FJ, NZ, KI, US|AK) are
// hand-overridden so we don't accidentally frame the entire planet.
//
// Format: [west, south, east, north] in WGS84 degrees. Identical
// shape to maplibre's LngLatBoundsLike when interpreted as
// [[w,s],[e,n]]. We export them as flat arrays + a small wrapper
// so consumers don't need to know our internal shape.

import countryBboxes from './country-bboxes.json'
import stateBboxes from './state-bboxes.json'
import stateCentroids from './state-centroids.json'

export type BoundsTuple = [number, number, number, number]

export function getCountryBbox(countryCode: string | null | undefined): BoundsTuple | null {
  if (!countryCode) return null
  const b = (countryBboxes as Record<string, BoundsTuple>)[String(countryCode).toUpperCase()]
  return b || null
}

// Build a "<country>|<lowercased name or alias>" → postal lookup so
// callers can pass either "KS" or "Kansas" (the DB stores the full
// name in state_province; the bbox map is keyed by postal code).
// Also includes aliases declared in state-centroids.json.
const STATE_NAME_TO_KEY: Record<string, string> = {}
for (const cc of Object.keys(stateCentroids as Record<string, unknown>)) {
  if (cc.startsWith('$')) continue
  const sub = (stateCentroids as any)[cc] as Record<string, { name: string; aliases?: string[] }>
  for (const postal of Object.keys(sub)) {
    const entry = sub[postal]
    STATE_NAME_TO_KEY[cc + '|' + postal.toLowerCase()] = postal
    if (entry?.name) {
      STATE_NAME_TO_KEY[cc + '|' + entry.name.toLowerCase()] = postal
    }
    for (const alias of entry?.aliases || []) {
      STATE_NAME_TO_KEY[cc + '|' + String(alias).toLowerCase()] = postal
    }
  }
}

function resolveStateKey(countryCode: string, stateKey: string): string | null {
  // Try direct (postal code) first.
  const sub = (stateBboxes as Record<string, Record<string, BoundsTuple>>)[countryCode]
  if (sub && sub[stateKey]) return stateKey
  // Fall back to name → postal lookup.
  return STATE_NAME_TO_KEY[countryCode + '|' + stateKey.toLowerCase()] || null
}

export function getStateBbox(
  countryCode: string | null | undefined,
  stateKey: string | null | undefined,
): BoundsTuple | null {
  if (!countryCode || !stateKey) return null
  const cc = String(countryCode).toUpperCase()
  const sub = (stateBboxes as Record<string, Record<string, BoundsTuple>>)[cc]
  if (!sub) return null
  const resolved = resolveStateKey(cc, String(stateKey))
  if (!resolved) return null
  return sub[resolved] || null
}

/**
 * Returns the bounding box that should frame this report given its
 * (already-clamped) precision, or null when bbox framing isn't
 * appropriate (city / exact precision uses a precise pin instead).
 *
 * V10.8.I.1 NB: this no longer requires `coords_synthetic === true`.
 * The semantic is: "if the precision says we only know the country
 * or the region, frame that feature." Whether the coords landed at
 * a real centroid or via a server-side geocode that resolved to
 * country-level accuracy is irrelevant — both want the same UI.
 *
 * Precedence:
 *   - 'country' precision  → country bbox  (Oman → Oman polygon)
 *   - 'region' / 'state'   → state bbox    (Kansas → Kansas polygon)
 *   - 'city' / 'exact'     → null (caller renders a precise pin)
 *   - 'unknown' / null     → null (no usable framing info)
 */
export function getPrecisionFitBounds(opts: {
  precision: string | null | undefined
  countryCode?: string | null
  stateKey?: string | null
}): BoundsTuple | null {
  if (opts.precision === 'country') return getCountryBbox(opts.countryCode)
  if (opts.precision === 'region' || opts.precision === 'state') {
    return getStateBbox(opts.countryCode, opts.stateKey)
  }
  return null
}

/**
 * @deprecated Use `getPrecisionFitBounds`. Kept as a thin wrapper so
 * any older call sites that gated on `coords_synthetic` still work
 * but the recommended path drops that gate.
 */
export function getSyntheticFitBounds(opts: {
  precision: string | null | undefined
  coords_synthetic: boolean | null | undefined
  countryCode?: string | null
  stateKey?: string | null
}): BoundsTuple | null {
  return getPrecisionFitBounds(opts)
}

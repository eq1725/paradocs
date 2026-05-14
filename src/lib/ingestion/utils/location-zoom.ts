/**
 * location-zoom — V10.8.I
 *
 * Precision-aware zoom heuristics for the report-page map (and any
 * future "fit to admin region" use). When a report's coords are
 * synthetic (centroid fallback for country or state precision), the
 * map shouldn't drop a pin at zoom 4-6 like it would for a precise
 * location — it should frame the WHOLE country/state so the user
 * reads "this is a country-level report" from the map's framing.
 *
 * SME panel consensus (V10.8.I): cartographic convention says a
 * country-precision row gets a country-fit view, region-precision
 * row gets a state-fit view, and the pin is suppressed entirely so
 * the centroid never reads as a precise location.
 *
 * Why a lookup table instead of bbox math: we only need a sensible
 * zoom level, not millimeter-accurate framing. The 30-or-so largest
 * countries / states / provinces have outsized geographic spans that
 * need explicit override; everything else falls into a sensible
 * default zoom bucket.
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
  const k = String(countryCode).toUpperCase() + '|' + String(stateKey)
  return STATE_FIT_ZOOM_OVERRIDE[k] ?? STATE_FIT_ZOOM_DEFAULT
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

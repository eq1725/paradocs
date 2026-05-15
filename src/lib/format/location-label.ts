/**
 * formatLocationLabel — V10.8.J canonical location label composer.
 *
 * Replaces ad-hoc `[city || location_name, state, country].filter(Boolean)`
 * patterns that were quietly producing labels like "Kansas, Kansas"
 * (city=null + location_name="Kansas" + state="Kansas" → join the
 * fallback location_name with the same state again). Use this on
 * every card / list / chip that renders a row's location.
 *
 * Behavior:
 *   - Prefer city → state → country composition when fields are set.
 *   - Fall back to location_name ONLY when no structured fields are
 *     populated; never mix it with state/country (location_name is
 *     already a composed string from V10.8.C normalizeLocation).
 *   - Dedupe: the same string never appears twice, case-insensitively.
 *   - When state and country together would read awkwardly (e.g.
 *     "Kansas, United States"), opt to drop the country for US/CA/
 *     UK/AU subdivisions where the state already implies it (US
 *     readers don't need "California, United States").
 *   - Configurable max segments (1, 2, or 3). Defaults to 2 (city-
 *     state-country style chips usually want "City, State"); pass
 *     maxParts=3 for richer surfaces.
 */

export interface LocationFields {
  city?: string | null
  state_province?: string | null
  country?: string | null
  location_name?: string | null
}

export interface LocationLabelOptions {
  /** Maximum number of comma-separated segments to emit. Default 2. */
  maxParts?: 1 | 2 | 3
  /**
   * When true (default), drop the country suffix when state+country
   * would read awkwardly for US/CA/UK/AU subdivisions ("California,
   * United States"). Pass false on surfaces where you always want the
   * country shown (like an admin debug view).
   */
  trimRedundantCountry?: boolean
}

const STATE_IMPLIES_COUNTRY = new Set(['United States', 'USA', 'Canada', 'United Kingdom', 'UK', 'Australia'])

/**
 * Compose a clean location label from a row's location fields. Returns
 * null when no usable label is available.
 */
export function formatLocationLabel(
  row: LocationFields | null | undefined,
  options?: LocationLabelOptions,
): string | null {
  if (!row) return null
  const opts = options || {}
  const maxParts = opts.maxParts ?? 2
  const trimRedundantCountry = opts.trimRedundantCountry !== false

  const city = trim(row.city)
  const state = trim(row.state_province)
  const country = trim(row.country)
  const locationName = trim(row.location_name)

  // Build candidate parts in city → state → country order. Skip empties.
  let parts: string[] = []
  if (city) parts.push(city)
  if (state) parts.push(state)
  if (country) parts.push(country)

  // If no structured fields exist, fall back to location_name as-is.
  if (parts.length === 0) {
    return locationName || null
  }

  // V10.8.J — drop country when redundant with the state for major
  // first-class countries (US/CA/UK/AU). Reads cleaner on cards.
  if (trimRedundantCountry && state && country && STATE_IMPLIES_COUNTRY.has(country)) {
    parts = parts.filter(p => p !== country)
  }

  // Dedupe (case-insensitive), preserving the first occurrence's casing.
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(p)
  }

  // Cap to maxParts (preferring city + state over country if we must drop).
  return deduped.slice(0, maxParts).join(', ')
}
